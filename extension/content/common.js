/* Usage Detector — shared helpers for content scripts.
   Runs in the extension's isolated world, so the page can't read or change it. */
(() => {
  const NS = (globalThis.__usageDetector = globalThis.__usageDetector || {});

  NS.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  NS.round1 = (value) => Math.round(value * 10) / 10;

  NS.send = (provider, payload) => {
    try {
      chrome.runtime.sendMessage({ type: 'usage:report', provider, payload }, () => void chrome.runtime.lastError);
    } catch (_) {
      /* extension was reloaded while the page stayed open */
    }
  };

  NS.onRefresh = (run) => {
    try {
      chrome.runtime.onMessage.addListener((message, _sender, reply) => {
        if (!message || message.type !== 'usage:refresh') return undefined;
        Promise.resolve()
          .then(run)
          .then(() => reply({ ok: true }))
          .catch(() => reply({ ok: false }));
        return true;
      });
    } catch (_) {
      /* no messaging available */
    }
  };

  NS.pageText = () => (document.body ? document.body.innerText : '') || '';

  NS.number = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value.replace('%', '').trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  NS.toEpoch = (value) => {
    if (value == null) return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0) return null;
      return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) return NS.toEpoch(asNumber);
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  const UNIT_ALIASES = [
    [/^(?:s|sec|secs|second|seconds)$/, 's'],
    [/^(?:m|min|mins|minute|minutes)$/, 'm'],
    [/^(?:h|hr|hrs|hour|hours)$/, 'h'],
    [/^(?:d|day|days)$/, 'd'],
    [/^(?:w|wk|wks|week|weeks)$/, 'w'],
  ];

  const parseDuration = (text) => {
    let total = 0;
    let matched = false;
    const pattern = /(\d+(?:\.\d+)?)\s*([a-z]+)/gi;
    let match;
    while ((match = pattern.exec(text))) {
      const unit = UNIT_ALIASES.find(([alias]) => alias.test(match[2].toLowerCase()));
      if (!unit) continue;
      total += parseFloat(match[1]) * UNIT_MS[unit[1]];
      matched = true;
    }
    return matched ? total : null;
  };

  /* "Resets in 2 hr 14 min" or "Resets at 9:00 PM" -> epoch ms */
  NS.resetFromText = (text, now = Date.now()) => {
    if (!text) return null;
    const relative = /(?:resets?|refresh(?:es)?|try again|available again)\b[^.\n]{0,24}?\bin\s+([^.;\n]{1,40})/i.exec(text);
    if (relative) {
      const ms = parseDuration(relative[1]);
      if (ms != null && ms > 0) return now + ms;
    }
    const absolute = /(?:resets?|refresh(?:es)?|try again)\b[^.\n]{0,24}?\b(?:at|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
    if (absolute) {
      let hours = Number(absolute[1]);
      const minutes = Number(absolute[2] || 0);
      const meridiem = (absolute[3] || '').toLowerCase();
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;
      if (hours < 24 && minutes < 60) {
        const date = new Date(now);
        date.setHours(hours, minutes, 0, 0);
        const epoch = date.getTime();
        return epoch > now ? epoch : epoch + UNIT_MS.d;
      }
    }
    return null;
  };

  const WINDOW_LABELS = {
    five_hour: '5-hour session',
    fivehour: '5-hour session',
    five_hour_window: '5-hour session',
    session: 'Session',
    hourly: 'Hourly',
    daily: 'Daily',
    seven_day: 'Weekly',
    sevenday: 'Weekly',
    weekly: 'Weekly',
    seven_day_opus: 'Weekly · Opus',
    seven_day_sonnet: 'Weekly · Sonnet',
    seven_day_oauth_apps: 'Weekly · Connected apps',
    extra_usage: 'Extra usage credits',
    monthly: 'Monthly',
    month: 'Monthly',
  };

  const RATIO_KEYS = new Set(['utilization', 'used_ratio', 'ratio', 'usage_ratio', 'fraction']);
  const PERCENT_KEYS = new Set(['used_percent', 'usedpercent', 'percent', 'percentage', 'usage_percent', 'usagepercent', 'pct']);

  const readWindow = (id, label, source) => {
    let used = null;
    for (const key of Object.keys(source)) {
      const value = NS.number(source[key]);
      if (value == null) continue;
      const lower = key.toLowerCase();
      if (RATIO_KEYS.has(lower)) {
        used = value * 100;
        break;
      }
      if (PERCENT_KEYS.has(lower)) {
        used = value;
        break;
      }
    }
    if (used == null) {
      const usedCount = NS.number(source.used ?? source.count ?? source.usage ?? source.messages_used);
      const limit = NS.number(source.limit ?? source.cap ?? source.max ?? source.total ?? source.messages_cap);
      if (usedCount != null && limit) used = (usedCount / limit) * 100;
    }

    const resetsAt = NS.toEpoch(
      source.resets_at ?? source.resetsAt ?? source.reset_at ?? source.resetAt ?? source.reset ?? source.window_reset_at
    );
    if (used == null && resetsAt == null) return null;

    const usedPercent = used == null ? null : NS.round1(NS.clamp(used, 0, 100));
    return {
      id,
      label,
      usedPercent,
      remainingPercent: usedPercent == null ? null : NS.round1(100 - usedPercent),
      resetsAt,
    };
  };

  /* Pulls usage windows out of an account API payload, whatever its exact shape. */
  NS.extractWindows = (json) => {
    const found = new Map();
    const visit = (node, depth) => {
      if (!node || typeof node !== 'object' || depth > 5) return;
      for (const [key, value] of Object.entries(node)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const lower = key.toLowerCase();
        const label = WINDOW_LABELS[lower];
        if (label && !found.has(lower)) {
          const window = readWindow(lower, label, value);
          if (window) found.set(lower, window);
        }
        visit(value, depth + 1);
      }
    };
    visit(json, 0);
    return [...found.values()];
  };

  NS.findValue = (node, keys, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 6) return null;
    for (const [key, value] of Object.entries(node)) {
      if (keys.includes(key.toLowerCase()) && (typeof value === 'string' || typeof value === 'number')) return value;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        const found = NS.findValue(value, keys, depth + 1);
        if (found != null) return found;
      }
    }
    return null;
  };

  NS.fetchJson = async (url) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
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
  };

  const nearbyLabel = (node) => {
    let sibling = node.previousElementSibling;
    while (sibling && !sibling.textContent.trim()) sibling = sibling.previousElementSibling;
    if (sibling) return sibling.textContent.trim().split('\n')[0];
    const parent = node.parentElement;
    if (parent) {
      const line = (parent.innerText || '')
        .split('\n')
        .map((part) => part.trim())
        .find(Boolean);
      if (line) return line;
    }
    return null;
  };

  /* Visible meters a site renders as accessible progress bars. */
  NS.progressBars = () => {
    const out = [];
    for (const node of document.querySelectorAll('[role="progressbar"]')) {
      const now = NS.number(node.getAttribute('aria-valuenow'));
      if (now == null) continue;
      const max = NS.number(node.getAttribute('aria-valuemax'));
      const used = max && max !== 100 ? (now / max) * 100 : now;
      const label = (node.getAttribute('aria-label') || nearbyLabel(node) || 'Usage').slice(0, 48);
      const usedPercent = NS.round1(NS.clamp(used, 0, 100));
      out.push({
        id: `bar-${out.length}`,
        label,
        usedPercent,
        remainingPercent: NS.round1(100 - usedPercent),
        resetsAt: null,
      });
    }
    return out;
  };

  NS.statusFor = (windows, fallback = 'ok') => {
    let worst = null;
    for (const window of windows) {
      if (typeof window.usedPercent !== 'number') continue;
      worst = worst == null ? window.usedPercent : Math.max(worst, window.usedPercent);
    }
    if (worst == null) return fallback;
    if (worst >= 100) return 'limited';
    if (worst >= 85) return 'near-limit';
    return 'ok';
  };

  /* Ask the account API, fall back to what the page shows, then report. */
  NS.detect = async ({ provider, api, page }) => {
    let apiResult = null;
    try {
      apiResult = await api();
    } catch (error) {
      if (error && (error.code === 401 || error.code === 403)) {
        NS.send(provider, {
          status: 'signed-out',
          windows: [],
          plan: null,
          notes: ['Sign in to read your usage.'],
          source: 'api',
          detectedAt: Date.now(),
        });
        return;
      }
      apiResult = {
        windows: [],
        notes: ['Could not read the account API — showing what the page displays.'],
        plan: null,
      };
    }

    const pageResult = page ? page() : { windows: [], notes: [], plan: null };
    const fromApi = Boolean(apiResult && apiResult.windows && apiResult.windows.length);
    const windows = fromApi ? apiResult.windows : pageResult.windows || [];
    const notes = [...(apiResult && apiResult.notes ? apiResult.notes : []), ...(fromApi ? [] : pageResult.notes || [])];
    const status = windows.length ? NS.statusFor(windows, 'ok') : 'unknown';

    NS.send(provider, {
      status,
      windows,
      plan: (apiResult && apiResult.plan) || pageResult.plan || null,
      notes: [...new Set(notes.filter(Boolean))].slice(0, 3),
      source: fromApi ? 'api' : windows.length ? 'page' : 'none',
      url: location.href,
      detectedAt: Date.now(),
    });
  };

  /* Starts page detection once per provider, even when the script is injected twice. */
  NS.start = (provider, run) => {
    NS.started = NS.started || {};
    if (NS.started[provider]) return;
    NS.started[provider] = true;

    const safeRun = () => Promise.resolve().then(run).catch(() => {});
    setTimeout(safeRun, 1200);
    setInterval(() => {
      if (document.visibilityState === 'visible') safeRun();
    }, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') safeRun();
    });
    NS.onRefresh(safeRun);
  };
})();
