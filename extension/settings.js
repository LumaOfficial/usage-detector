/* Usage Detector — settings shared by the popup, the options page and the
   background worker. Inside the extension they live in chrome.storage.local;
   the preview page has no extension APIs, so they fall back to localStorage. */
(() => {
  const DEFAULTS = {
    alertThreshold: 15,
    refreshMinutes: 5,
    badgeMode: 'worst',
    theme: 'auto',
  };

  const KEY = 'settings';

  const clampNumber = (value, min, max, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  };

  const clean = (value) => {
    const raw = value && typeof value === 'object' ? value : {};
    return {
      alertThreshold: clampNumber(raw.alertThreshold, 1, 50, DEFAULTS.alertThreshold),
      refreshMinutes: clampNumber(raw.refreshMinutes, 1, 60, DEFAULTS.refreshMinutes),
      badgeMode: ['worst', 'claude', 'chatgpt'].includes(raw.badgeMode) ? raw.badgeMode : DEFAULTS.badgeMode,
      theme: ['auto', 'light', 'dark'].includes(raw.theme) ? raw.theme : DEFAULTS.theme,
    };
  };

  const usingExtension = () => typeof chrome !== 'undefined' && Boolean(chrome.storage && chrome.storage.local);

  const read = async () => {
    if (usingExtension()) {
      const stored = await chrome.storage.local.get(KEY);
      return stored[KEY];
    }
    try {
      return JSON.parse(localStorage.getItem(`usage-detector:${KEY}`) || 'null');
    } catch (_) {
      return null;
    }
  };

  const get = async () => clean(await read());

  const save = async (patch) => {
    const next = clean({ ...(await get()), ...(patch || {}) });
    if (usingExtension()) await chrome.storage.local.set({ [KEY]: next });
    else localStorage.setItem(`usage-detector:${KEY}`, JSON.stringify(next));
    return next;
  };

  globalThis.UsageDetectorSettings = { DEFAULTS, KEY, clean, get, save };
})();
