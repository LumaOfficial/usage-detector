/* Usage Detector — stores what the content scripts report, keeps a short
   history, warns when a limit runs low, and paints the badge. */

importScripts('settings.js', 'sites.js', 'readers.js');

const Sites = globalThis.UsageDetectorSites;
const Readers = globalThis.UsageDetectorReaders;
const PROVIDERS = Sites.IDS;
const NAMES = Object.fromEntries(Sites.SITES.map((site) => [site.id, site.name]));

const PATTERNS = Sites.patterns;

const SCRIPTS = Object.fromEntries(
  PROVIDERS.map((provider) => [provider, ['sites.js', 'readers.js', 'content/common.js', `content/${provider}.js`]])
);

const ALARM = 'usage-detector:poll';

const HISTORY_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_MAX = 480;

const keyFor = (provider) => `usage:${provider}`;
const historyKey = (provider) => `history:${provider}`;
const alertKey = (provider) => `alert:${provider}`;

function providerForUrl(url) {
  const site = Sites.detect(url);
  return site ? site.id : null;
}

function worstUsed(record) {
  let worst = null;
  for (const window of (record && record.windows) || []) {
    if (typeof window.usedPercent !== 'number') continue;
    worst = worst == null ? window.usedPercent : Math.max(worst, window.usedPercent);
  }
  return worst;
}

function worstRemaining(record) {
  const used = worstUsed(record);
  return used == null ? null : Math.max(0, 100 - used);
}

/* Reads a site's own account API from here, with the cookies the browser
   already holds for it — no tab needs to be open. */
async function requestJson(url) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { accept: 'application/json' },
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('signed-out');
    error.code = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`http-${response.status}`);
    error.code = response.status;
    throw error;
  }
  return response.json();
}

async function readDirect(provider) {
  const site = Sites.byId(provider);
  const read = provider === 'claude' ? Readers.readClaude : Readers.readChatGPT;
  let signedOut = false;

  for (const host of site.hosts) {
    try {
      const result = await read((path) => requestJson(`https://${host}${path}`));
      const windows = Array.isArray(result.windows) ? result.windows : [];
      await saveReport(provider, {
        status: windows.length ? Readers.statusFor(windows, 'ok') : 'unknown',
        windows,
        plan: result.plan || null,
        notes: [...new Set((result.notes || []).filter(Boolean))].slice(0, 3),
        source: windows.length ? 'api' : 'none',
        via: 'background',
        detectedAt: Date.now(),
      });
      return true;
    } catch (error) {
      if (error && (error.code === 401 || error.code === 403)) signedOut = true;
    }
  }

  if (!signedOut) return false;

  await saveReport(provider, {
    status: 'signed-out',
    windows: [],
    plan: null,
    notes: [`Sign in to ${site.hostName} to read your usage.`],
    source: 'api',
    via: 'background',
    detectedAt: Date.now(),
  });
  return true;
}

async function pollSites() {
  for (const provider of PROVIDERS) await readDirect(provider);
}

async function schedulePolling() {
  const settings = await UsageDetectorSettings.get();
  const minutes = Math.max(1, Math.round(settings.refreshMinutes));
  await chrome.alarms.create(ALARM, { periodInMinutes: minutes, delayInMinutes: minutes });
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (!message || typeof message !== 'object') return undefined;

  if (message.type === 'usage:report') {
    saveReport(message.provider, message.payload)
      .then(() => respond({ ok: true }))
      .catch(() => respond({ ok: false }));
    return true;
  }

  if (message.type === 'usage:refresh') {
    refreshTabs(message.provider)
      .then(respond)
      .catch(() => respond({ ok: false, tabs: 0 }));
    return true;
  }

  return undefined;
});

async function saveReport(provider, payload) {
  if (!PROVIDERS.includes(provider) || !payload || typeof payload !== 'object') return;

  const key = keyFor(provider);
  const stored = (await chrome.storage.local.get(key))[key];

  const record = {
    provider,
    plan: payload.plan || (stored && stored.plan) || null,
    status: payload.status || 'unknown',
    windows: Array.isArray(payload.windows) ? payload.windows : [],
    notes: Array.isArray(payload.notes) ? payload.notes : [],
    source: payload.source || 'none',
    via: payload.via || 'page',
    url: payload.url || (stored && stored.url) || null,
    detectedAt: payload.detectedAt || Date.now(),
  };

  // A page that simply shows nothing new shouldn't wipe numbers we already have.
  if (record.status === 'unknown' && !record.windows.length && stored && stored.windows && stored.windows.length) {
    record.windows = stored.windows;
    record.status = stored.status;
    record.source = stored.source;
    record.via = stored.via || record.via;
    record.notes = record.notes.length ? record.notes : stored.notes;
  }

  await chrome.storage.local.set({ [key]: record });
  await recordHistory(provider, record);
  await checkAlert(provider, record);
  await updateBadge();
}

/* One point per meaningful change: the percentage used on the tightest limit. */
async function recordHistory(provider, record) {
  const used = worstUsed(record);
  if (used == null) return;

  const key = historyKey(provider);
  const stored = (await chrome.storage.local.get(key))[key];
  const points = Array.isArray(stored) ? stored : [];
  const at = record.detectedAt || Date.now();
  const last = points[points.length - 1];

  if (last && at - last.t < 60000 && Math.abs(last.used - used) < 0.5) return;

  points.push({ t: at, used });

  const cutoff = Date.now() - HISTORY_MS;
  await chrome.storage.local.set({ [key]: points.filter((point) => point.t >= cutoff).slice(-HISTORY_MAX) });
}

/* One notification per slide below the threshold; re-armed once it recovers. */
async function checkAlert(provider, record) {
  const settings = await UsageDetectorSettings.get();
  const remaining = worstRemaining(record);
  const key = alertKey(provider);
  const stored = (await chrome.storage.local.get(key))[key] || null;

  if (remaining == null || remaining > settings.alertThreshold) {
    if (stored) await chrome.storage.local.set({ [key]: null });
    return;
  }

  if (stored && stored.remaining <= settings.alertThreshold) return;
  await chrome.storage.local.set({ [key]: { remaining, at: Date.now() } });

  if (!chrome.notifications) return;
  const plan = record.plan ? ` · ${record.plan} plan` : '';
  chrome.notifications.create(`usage-detector:${provider}:${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: `${NAMES[provider] || provider} usage is low`,
    message: `${Math.round(remaining)}% left on your tightest limit${plan}.`,
    priority: 2,
  });
}

async function updateBadge() {
  const settings = await UsageDetectorSettings.get();
  const providers = settings.badgeMode === 'worst' ? PROVIDERS : [settings.badgeMode];
  const stored = await chrome.storage.local.get(providers.map(keyFor));

  let remaining = null;
  for (const provider of providers) {
    const record = stored[keyFor(provider)];
    if (!record || !Array.isArray(record.windows)) continue;
    for (const window of record.windows) {
      if (typeof window.remainingPercent !== 'number') continue;
      remaining = remaining == null ? window.remainingPercent : Math.min(remaining, window.remainingPercent);
    }
  }

  if (remaining == null) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  await chrome.action.setBadgeText({ text: String(Math.max(0, Math.round(remaining))) });
  await chrome.action.setBadgeBackgroundColor({
    color: remaining <= 10 ? '#e2555b' : remaining <= 30 ? '#e8a33d' : '#2f9e6f',
  });
  if (chrome.action.setBadgeTextColor) {
    await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  }
}

/* Tabs that were already open when the extension was installed have no content
   script yet, so put one there instead of asking the user to reload the site. */
async function injectInto(tab) {
  const provider = providerForUrl(tab && tab.url);
  if (!provider || typeof tab.id !== 'number') return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: SCRIPTS[provider] });
    return true;
  } catch (_) {
    return false;
  }
}

async function pingTab(tab) {
  if (typeof tab.id !== 'number') return false;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'usage:refresh' });
    return true;
  } catch (_) {
    if (!(await injectInto(tab))) return false;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'usage:refresh' });
      return true;
    } catch (_) {
      return false;
    }
  }
}

async function matchingTabs(patterns) {
  try {
    return await chrome.tabs.query({ url: patterns });
  } catch (_) {
    return [];
  }
}

async function refreshTabs(provider) {
  const targets = provider ? [provider] : PROVIDERS;
  const patterns = targets.flatMap((name) => PATTERNS[name] || []);

  let pinged = 0;
  for (const tab of await matchingTabs(patterns)) {
    if (await pingTab(tab)) pinged += 1;
  }

  if (pinged > 0) return { ok: true, tabs: pinged };

  /* No site tab is open — read the sites directly instead. */
  let read = 0;
  for (const name of targets) {
    if (await readDirect(name)) read += 1;
  }
  return { ok: read > 0, tabs: 0 };
}

/* The toolbar tooltip names the site the detector sees in the active tab. */
async function labelAction(tab) {
  if (!tab || typeof tab.id !== 'number') return;
  const site = Sites.detect(tab.url);
  try {
    await chrome.action.setTitle({ tabId: tab.id, title: site ? `Usage Detector — ${site.name}` : 'Usage Detector' });
  } catch (_) {
    /* the tab closed before the title landed */
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await labelAction(await chrome.tabs.get(tabId));
  } catch (_) {
    /* tab is gone */
  }
});

chrome.tabs.onUpdated.addListener((_tabId, info, tab) => {
  if (info.url || info.status === 'complete') labelAction(tab);
});

chrome.runtime.onInstalled.addListener(async () => {
  await updateBadge();
  await schedulePolling();
  await pollSites();
  for (const tab of await matchingTabs(PROVIDERS.flatMap((name) => PATTERNS[name]))) {
    await injectInto(tab);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await schedulePolling();
  await pollSites();
  await updateBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) pollSites().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  updateBadge();
  schedulePolling().catch(() => {});
});
