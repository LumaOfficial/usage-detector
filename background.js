// MV3 service worker: measures time spent in AI tools and stores it per day.
// The panel turns those seconds into credits (1 credit per minute of use).

const PROVIDERS = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "gemini.google.com": "Gemini",
  "copilot.microsoft.com": "Copilot",
  "perplexity.ai": "Perplexity",
  "grok.com": "Grok",
  "poe.com": "Poe",
};

const STORAGE_KEY = "usage";
const ENABLED_KEY = "enabled";

let current = { host: null, startedAt: null };

function aiHostOf(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return Object.keys(PROVIDERS).find((domain) => host === domain || host.endsWith(`.${domain}`)) || null;
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
  const host = tab && tab.url ? aiHostOf(tab.url) : null;
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
