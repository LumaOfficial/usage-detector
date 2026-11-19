/* Usage Detector — settings shared by the popup, the options page, the content
   scripts and the background worker. Inside the extension they live in
   chrome.storage.local; the preview page has no extension APIs, so they fall
   back to localStorage. Load sites.js first: the tracked-site list is checked
   against it. */
(() => {
  const DEFAULTS = {
    alertThreshold: 15,
    notifications: true,
    refreshMinutes: 5,
    badgeMode: 'worst',
    theme: 'auto',
    enabledSites: null,
    showHistory: true,
    overlayEnabled: true,
    overlayPosition: 'bottom-right',
    overlayCompact: false,
  };

  const KEY = 'settings';
  const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

  const clampNumber = (value, min, max, fallback) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  };

  const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

  const siteIds = () => (globalThis.UsageDetectorSites ? globalThis.UsageDetectorSites.IDS : []);

  /* At least one site always stays on — an empty list would turn everything off. */
  const cleanSites = (value) => {
    const ids = siteIds();
    const list = Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
    if (!ids.length) return list;
    const kept = ids.filter((id) => list.includes(id));
    return kept.length ? kept : ids.slice();
  };

  const clean = (value) => {
    const raw = value && typeof value === 'object' ? value : {};
    const ids = siteIds();
    const badge = typeof raw.badgeMode === 'string' ? raw.badgeMode : '';
    return {
      alertThreshold: clampNumber(raw.alertThreshold, 1, 50, DEFAULTS.alertThreshold),
      notifications: bool(raw.notifications, DEFAULTS.notifications),
      refreshMinutes: clampNumber(raw.refreshMinutes, 1, 60, DEFAULTS.refreshMinutes),
      badgeMode: badge === 'worst' || ids.includes(badge) ? badge : DEFAULTS.badgeMode,
      theme: ['auto', 'light', 'dark'].includes(raw.theme) ? raw.theme : DEFAULTS.theme,
      enabledSites: cleanSites(raw.enabledSites),
      showHistory: bool(raw.showHistory, DEFAULTS.showHistory),
      overlayEnabled: bool(raw.overlayEnabled, DEFAULTS.overlayEnabled),
      overlayPosition: POSITIONS.includes(raw.overlayPosition) ? raw.overlayPosition : DEFAULTS.overlayPosition,
      overlayCompact: bool(raw.overlayCompact, DEFAULTS.overlayCompact),
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

  globalThis.UsageDetectorSettings = { DEFAULTS, KEY, POSITIONS, clean, get, save };
})();
