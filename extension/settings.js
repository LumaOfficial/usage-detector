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
    quietHours: false,
    quietStart: 22,
    quietEnd: 7,
    alertRepeatMinutes: 0,
    silentNotifications: false,
    notifyOnReset: false,
    recordHistory: true,
    historyDays: 7,
    hideIdleSites: false,
    badgeStyle: 'percent',
    backgroundPolling: true,
    refreshOnFocus: true,
    overlayRows: 4,
  };

  const KEY = 'settings';
  const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
  const BADGE_STYLES = ['percent', 'dot', 'off'];

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
      quietHours: bool(raw.quietHours, DEFAULTS.quietHours),
      quietStart: clampNumber(raw.quietStart, 0, 23, DEFAULTS.quietStart),
      quietEnd: clampNumber(raw.quietEnd, 0, 23, DEFAULTS.quietEnd),
      alertRepeatMinutes: clampNumber(raw.alertRepeatMinutes, 0, 720, DEFAULTS.alertRepeatMinutes),
      silentNotifications: bool(raw.silentNotifications, DEFAULTS.silentNotifications),
      notifyOnReset: bool(raw.notifyOnReset, DEFAULTS.notifyOnReset),
      recordHistory: bool(raw.recordHistory, DEFAULTS.recordHistory),
      historyDays: clampNumber(raw.historyDays, 1, 30, DEFAULTS.historyDays),
      hideIdleSites: bool(raw.hideIdleSites, DEFAULTS.hideIdleSites),
      badgeStyle: BADGE_STYLES.includes(raw.badgeStyle) ? raw.badgeStyle : DEFAULTS.badgeStyle,
      backgroundPolling: bool(raw.backgroundPolling, DEFAULTS.backgroundPolling),
      refreshOnFocus: bool(raw.refreshOnFocus, DEFAULTS.refreshOnFocus),
      overlayRows: clampNumber(raw.overlayRows, 1, 6, DEFAULTS.overlayRows),
    };
  };

  /* True while the clock sits inside the quiet window; it may wrap midnight. */
  const inQuietHours = (settings, now = new Date()) => {
    if (!settings || !settings.quietHours) return false;
    const start = Number(settings.quietStart);
    const end = Number(settings.quietEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return false;
    const hour = now.getHours();
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
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

  globalThis.UsageDetectorSettings = { DEFAULTS, KEY, POSITIONS, BADGE_STYLES, inQuietHours, clean, get, save };
})();
