/* Usage Detector — stores what the content scripts report and paints the badge. */

const PROVIDERS = ['claude', 'chatgpt'];

const PATTERNS = {
  claude: ['https://claude.ai/*'],
  chatgpt: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
};

const SCRIPTS = {
  claude: ['content/common.js', 'content/claude.js'],
  chatgpt: ['content/common.js', 'content/chatgpt.js'],
};

const keyFor = (provider) => `usage:${provider}`;

function providerForUrl(url) {
  if (!url) return null;
  if (url.startsWith('https://claude.ai/')) return 'claude';
  if (url.startsWith('https://chatgpt.com/') || url.startsWith('https://chat.openai.com/')) return 'chatgpt';
  return null;
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
    url: payload.url || (stored && stored.url) || null,
    detectedAt: payload.detectedAt || Date.now(),
  };

  // A page that simply shows nothing new shouldn't wipe numbers we already have.
  if (record.status === 'unknown' && !record.windows.length && stored && stored.windows && stored.windows.length) {
    record.windows = stored.windows;
    record.status = stored.status;
    record.source = stored.source;
    record.notes = record.notes.length ? record.notes : stored.notes;
  }

  await chrome.storage.local.set({ [key]: record });
  await updateBadge();
}

async function updateBadge() {
  const stored = await chrome.storage.local.get(PROVIDERS.map(keyFor));

  let remaining = null;
  for (const provider of PROVIDERS) {
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

  return { ok: pinged > 0, tabs: pinged };
}

chrome.runtime.onInstalled.addListener(async () => {
  await updateBadge();
  for (const tab of await matchingTabs(PROVIDERS.flatMap((name) => PATTERNS[name]))) {
    await injectInto(tab);
  }
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});
