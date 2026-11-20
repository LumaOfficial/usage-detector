import { DEFAULT_SETTINGS, SCHEMA_VERSION, STORAGE_KEYS } from '../shared/defaults.js';
import { dayKey, formatCompact, isIgnored, normalizeDomain } from '../lib/usage.js';
import {
  dayTotal,
  normalizeSettings,
  pruneDaily,
  readDaily,
  readSettings,
  sanitizeDaily,
  writeDaily,
  writeSettings,
} from '../lib/store.js';

const TICK_ALARM = 'usage-tick';
const MAX_GAP_SECONDS = 90;

let settings = { ...DEFAULT_SETTINGS };
let daily = {};
let tracker = {
  domain: null,
  sessionStartedAt: null,
  lastTickAt: null,
  tabId: null,
  idle: false,
  day: dayKey(),
};
let loaded = false;

let chain = Promise.resolve();
function withLock(task) {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run;
}

async function ensureLoaded() {
  if (loaded) return;
  settings = await readSettings();

  const stored = await readDaily();
  const pruned = pruneDaily(stored, settings.retentionDays);
  daily = pruned;
  if (Object.keys(pruned).length !== Object.keys(stored).length) {
    await writeDaily(daily);
  }

  const session = await chrome.storage.session.get(STORAGE_KEYS.tracker);
  if (session?.[STORAGE_KEYS.tracker]) {
    tracker = { ...tracker, ...session[STORAGE_KEYS.tracker] };
  }

  loaded = true;
  await applyRuntimeSettings();
}

async function applyRuntimeSettings() {
  try {
    chrome.idle.setDetectionInterval(settings.idleSeconds);
  } catch {
    // Idle detection is best effort; tracking still works without it.
  }
  const alarm = await chrome.alarms.get(TICK_ALARM);
  if (!alarm) {
    await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  }
}

async function persistTracker() {
  await chrome.storage.session.set({ [STORAGE_KEYS.tracker]: tracker });
}

async function settle(now = Date.now()) {
  const start = tracker.lastTickAt;
  tracker.lastTickAt = now;
  if (!tracker.domain || !start) return;
  const elapsed = Math.floor((now - start) / 1000);
  if (elapsed <= 0) return;
  const seconds = Math.min(elapsed, MAX_GAP_SECONDS);
  const key = dayKey(new Date(start));
  const bucket = daily[key] || (daily[key] = {});
  bucket[tracker.domain] = Math.round((bucket[tracker.domain] || 0) + seconds);
  await writeDaily(daily);
}

async function refreshActive(now = Date.now()) {
  await settle(now);

  const today = dayKey(new Date(now));
  if (tracker.day !== today) {
    tracker.day = today;
    daily = pruneDaily(daily, settings.retentionDays, new Date(now));
    await writeDaily(daily);
  }

  let domain = null;
  let tabId = null;
  if (settings.trackingEnabled && !tracker.idle) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    tabId = typeof tab?.id === 'number' ? tab.id : null;
    const candidate = normalizeDomain(tab?.url);
    if (candidate && !isIgnored(candidate, settings.ignore)) domain = candidate;
  }

  if (domain !== tracker.domain) {
    tracker.domain = domain;
    tracker.sessionStartedAt = domain ? now : null;
  } else if (!domain) {
    tracker.sessionStartedAt = null;
  }

  tracker.tabId = tabId;
  tracker.lastTickAt = now;
  await persistTracker();
  await updateBadge(now);
}

async function updateBadge(now = Date.now()) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
    await chrome.action.setBadgeText({ text: formatCompact(dayTotal(daily, dayKey(new Date(now)))) });
  } catch {
    // The badge is cosmetic.
  }
}

function publicSettings() {
  return { ...settings };
}

function buildSummary() {
  const now = Date.now();
  const today = dayKey(new Date(now));
  const sites = Object.entries(daily[today] || {})
    .map(([domain, seconds]) => ({ domain, seconds: Math.round(seconds) }))
    .sort((left, right) => right.seconds - left.seconds);
  const total = sites.reduce((sum, site) => sum + site.seconds, 0);

  const week = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    week.push({ date: key, seconds: dayTotal(daily, key) });
  }

  const current = tracker.domain && settings.trackingEnabled
    ? { domain: tracker.domain, since: tracker.sessionStartedAt, idle: tracker.idle }
    : null;

  return {
    ok: true,
    now,
    date: today,
    sites,
    total,
    week,
    current,
    settings: publicSettings(),
    schema: SCHEMA_VERSION,
  };
}

async function handleRequest(message) {
  const type = message?.type;
  const payload = message?.payload;
  await ensureLoaded();

  switch (type) {
    case 'summary':
      await refreshActive();
      return buildSummary();

    case 'settings:get':
      return { ok: true, settings: publicSettings() };

    case 'settings:update':
      settings = await writeSettings({ ...settings, ...(payload || {}) });
      await applyRuntimeSettings();
      await refreshActive();
      return { ok: true, settings: publicSettings() };

    case 'tracking:toggle':
      settings = await writeSettings({ ...settings, trackingEnabled: !settings.trackingEnabled });
      await refreshActive();
      return { ok: true, settings: publicSettings() };

    case 'data:reset':
      daily = {};
      await writeDaily(daily);
      tracker.sessionStartedAt = tracker.domain ? Date.now() : null;
      await persistTracker();
      await updateBadge();
      return { ok: true };

    case 'data:export':
      return {
        ok: true,
        data: {
          app: 'usage-detector',
          schema: SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          settings: publicSettings(),
          daily,
        },
      };

    case 'data:import': {
      const incoming = sanitizeDaily(payload?.data?.daily ?? payload?.daily);
      if (!Object.keys(incoming).length) {
        return { ok: false, error: 'That file has no usage data in it.' };
      }
      daily = incoming;
      await writeDaily(daily);
      await updateBadge();
      return { ok: true, days: Object.keys(daily).length };
    }

    case 'storage:info': {
      const bytes = await chrome.storage.local.getBytesInUse(null);
      const today = dayKey();
      return {
        ok: true,
        bytes,
        days: Object.keys(daily).length,
        sites: Object.keys(daily[today] || {}).length,
      };
    }

    default:
      return { ok: false, error: `Unknown request: ${type}` };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  withLock(() => handleRequest(message))
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  withLock(async () => {
    await ensureLoaded();
    settings = await writeSettings(settings);
    await chrome.storage.local.set({
      [STORAGE_KEYS.meta]: { schema: SCHEMA_VERSION, installedAt: new Date().toISOString() },
    });
    await refreshActive();
  });
});

chrome.runtime.onStartup.addListener(() => {
  withLock(async () => {
    await ensureLoaded();
    await refreshActive();
  });
});

chrome.tabs.onActivated.addListener(() => {
  withLock(() => refreshActive());
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    withLock(() => refreshActive());
  }
});

chrome.tabs.onRemoved.addListener(() => {
  withLock(() => refreshActive());
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  withLock(async () => {
    await ensureLoaded();
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      await settle();
      tracker.domain = null;
      tracker.sessionStartedAt = null;
      await persistTracker();
      await updateBadge();
      return;
    }
    await refreshActive();
  });
});

chrome.idle.onStateChanged.addListener((state) => {
  withLock(async () => {
    await ensureLoaded();
    tracker.idle = state !== 'active';
    await refreshActive();
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TICK_ALARM) return;
  withLock(() => refreshActive());
});
