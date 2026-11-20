// MV3 service worker: accumulates active-tab time per hostname, per day.

const STORAGE_KEY = "usage";
const ENABLED_KEY = "enabled";

let current = { host: null, startedAt: null };

function hostOf(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

async function isEnabled() {
  const { enabled } = await chrome.storage.local.get(ENABLED_KEY);
  return enabled !== false;
}

async function flush() {
  if (!current.host || !current.startedAt) return;
  const now = Date.now();
  const seconds = Math.round((now - current.startedAt) / 1000);
  current.startedAt = now;
  if (seconds <= 0) return;

  const { usage = {} } = await chrome.storage.local.get(STORAGE_KEY);
  const day = new Date().toISOString().slice(0, 10);
  usage[day] = usage[day] || {};
  usage[day][current.host] = (usage[day][current.host] || 0) + seconds;
  await chrome.storage.local.set({ usage });
}

async function trackActiveTab() {
  await flush();
  current = { host: null, startedAt: null };
  if (!(await isEnabled())) return;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const host = tab && tab.url ? hostOf(tab.url) : null;
  if (host) current = { host, startedAt: Date.now() };
}

chrome.tabs.onActivated.addListener(trackActiveTab);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.active) trackActiveTab();
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) flush();
  else trackActiveTab();
});
chrome.idle.onStateChanged.addListener((state) => {
  if (state === "active") trackActiveTab();
  else flush();
});
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "visibility" && message.hidden) flush();
});

chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get(ENABLED_KEY);
  if (enabled === undefined) await chrome.storage.local.set({ [ENABLED_KEY]: true });
  chrome.alarms.create("flush", { periodInMinutes: 1 });
  trackActiveTab();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("flush", { periodInMinutes: 1 });
  trackActiveTab();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "flush") flush();
});
