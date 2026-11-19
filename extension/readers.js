/* Usage Detector — reads the usage numbers out of the sites' own account APIs.
   Pure parsing with no DOM, so the background worker and the content scripts
   share one reader instead of two copies. */

(() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const round1 = (value) => Math.round(value * 10) / 10;

  const number = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value.replace('%', '').trim());
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const toEpoch = (value) => {
    if (value == null) return null;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value <= 0) return null;
      return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) return toEpoch(asNumber);
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
  const resetFromText = (text, now = Date.now()) => {
    if (!text) return null;
    const relative = /(?:resets?|refresh(?:es)?|try again|available again)\b[^.\n]{0,24}?\bin\s+([^.;\n]{1,40})/i.exec(text);
    if (relative) {
      const ms = parseDuration(relative[1]);
      if (ms != null && ms > 0) return now + ms;
    }
    const until = /(\d[^.;\n]{0,24}?)\s+(?:until|till|before)\s+(?:your\s+)?(?:next\s+)?(?:limit\s+)?(?:resets?|refill|refresh)/i.exec(text);
    if (until) {
      const ms = parseDuration(until[1]);
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

  /* claude.ai sends `utilization` as a percentage (0-100); ratio keys are 0-1. */
  const RATIO_KEYS = new Set(['used_ratio', 'usedratio', 'ratio', 'usage_ratio', 'fraction']);
  const PERCENT_KEYS = new Set([
    'utilization',
    'used_percent',
    'usedpercent',
    'percent',
    'percentage',
    'usage_percent',
    'usagepercent',
    'pct',
  ]);

  const readWindow = (id, label, source) => {
    let used = null;
    for (const key of Object.keys(source)) {
      const value = number(source[key]);
      if (value == null) continue;
      const lower = key.toLowerCase();
      if (RATIO_KEYS.has(lower)) {
        // a few payloads send the percentage under a ratio-ish key
        used = value <= 1 ? value * 100 : value;
        break;
      }
      if (PERCENT_KEYS.has(lower)) {
        used = value;
        break;
      }
    }
    if (used == null) {
      const usedCount = number(source.used ?? source.count ?? source.usage ?? source.messages_used);
      const limit = number(source.limit ?? source.cap ?? source.max ?? source.total ?? source.messages_cap);
      if (usedCount != null && limit) used = (usedCount / limit) * 100;
    }

    const resetsIn = number(source.reset_after_seconds ?? source.resets_in_seconds ?? source.reset_after);
    const resetsAt =
      toEpoch(
        source.resets_at ?? source.resetsAt ?? source.reset_at ?? source.resetAt ?? source.reset ?? source.window_reset_at
      ) ?? (resetsIn != null && resetsIn > 0 ? Date.now() + resetsIn * 1000 : null);
    if (used == null && resetsAt == null) return null;

    const usedPercent = used == null ? null : round1(clamp(used, 0, 100));
    return {
      id,
      label,
      usedPercent,
      remainingPercent: usedPercent == null ? null : round1(100 - usedPercent),
      resetsAt,
    };
  };

  /* The usage numbers a page prints as text, whatever the site's own wording:
     "42% of your weekly limit", "58% left", "20 of 50 generations used",
     "1,250 credits remaining". Pure text, so the content scripts share one
     set of patterns instead of each site re-inventing them. */
  const windowsFromText = (text, resetsAt = null) => {
    if (!text) return [];

    const out = [];
    const seen = new Set();
    const push = (id, label, usedPercent, extra) => {
      const percent = usedPercent == null ? null : round1(clamp(usedPercent, 0, 100));
      const detail = extra && extra.detail;
      const key = `${label}|${percent == null ? detail : percent}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id,
        label,
        usedPercent: percent,
        remainingPercent: percent == null ? null : round1(100 - percent),
        resetsAt: resetsAt || null,
        ...(extra || {}),
      });
    };

    const count = (raw) => Number(String(raw).replace(/[,\s]/g, ''));
    const clean = (raw, fallback) => {
      let value = String(raw || '').replace(/\s+/g, ' ').trim();
      value = value.replace(/^(?:you(?:'ve| have)?|your|the|used)\s+/i, '').replace(/[\s:=-]+$/, '');
      if (!value) return fallback;
      return value.charAt(0).toUpperCase() + value.slice(1, 40);
    };

    const percentUsed = /([^\n]{0,40}?)(\d{1,3}(?:\.\d+)?)\s*%\s*(?:of\s+(?:your\s+)?((?:\w+\s+){0,4}?(?:limit|quota|usage|allowance|budget|plan|credits?|messages?|requests?))|used|consumed)/i.exec(text);
    /* "42% of your weekly limit" names the limit after the number; use that
       name rather than the sentence in front of it. */
    if (percentUsed) push('page-usage', clean(percentUsed[3] || percentUsed[1], 'Usage'), Number(percentUsed[2]));

    const percentLeft = /([^\n]{0,40}?)(\d{1,3}(?:\.\d+)?)\s*%\s*(?:remaining|left|available|free)/i.exec(text);
    if (percentLeft) push('page-remaining', clean(percentLeft[1], 'Remaining'), 100 - Number(percentLeft[2]));

    const quota = /(\d[\d,]*)\s*(?:of|\/)\s*(\d[\d,]*)\s+(?:[\w-]+\s+){0,2}?(messages|prompts|credits|requests|queries|generations|images|tokens|searches)/i.exec(text);
    if (quota) {
      const usedCount = count(quota[1]);
      const total = count(quota[2]);
      if (total > 0 && usedCount <= total) {
        const unit = quota[3].toLowerCase();
        push('page-quota', `${unit.charAt(0).toUpperCase()}${unit.slice(1)} used`, (usedCount / total) * 100);
      }
    }

    const left = /(\d[\d,]*)\s+(messages|prompts|credits|requests|queries|generations|images|tokens|searches)\s+(?:left|remaining|available)/i.exec(text);
    if (left) push('page-left', clean(left[2], 'Left'), null, { detail: `${left[1]} left` });

    const balance = /(credits?|balance|allowance)\s*(?:remaining|left|available)?\s*[:=]?\s*(\d[\d,]*)/i.exec(text);
    if (balance) push('page-credits', 'Credits', null, { detail: `${balance[2]} credits` });

    return out;
  };

  /* Pulls usage windows out of an account API payload, whatever its exact shape. */
  const extractWindows = (json) => {
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

  const findValue = (node, keys, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 6) return null;
    for (const [key, value] of Object.entries(node)) {
      if (keys.includes(key.toLowerCase()) && (typeof value === 'string' || typeof value === 'number')) return value;
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        const found = findValue(value, keys, depth + 1);
        if (found != null) return found;
      }
    }
    return null;
  };

  const statusFor = (windows, fallback = 'ok') => {
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

  /* Claude: the organization's usage endpoint, with the plan from either payload. */
  const readClaude = async (fetchJson) => {
    const orgs = await fetchJson('/api/organizations');
    const list = Array.isArray(orgs) ? orgs : Array.isArray(orgs && orgs.data) ? orgs.data : [];
    const org = list.find((item) => item && typeof item.uuid === 'string');
    if (!org) throw new Error('no-org');

    const usage = await fetchJson(`/api/organizations/${org.uuid}/usage`);
    const windows = extractWindows(usage);
    const plan = findValue(usage, ['plan_type', 'plan', 'tier']) ?? findValue(org, ['plan_type', 'plan', 'tier']);

    return {
      windows,
      plan: typeof plan === 'string' ? plan.toLowerCase() : null,
      notes: windows.length ? [] : ['claude.ai returned no usage windows for this account.'],
    };
  };

  const chatgptPlan = (data) => {
    const raw = findValue(data, ['plan_type', 'plan', 'subscription_plan', 'workspace_plan']);
    if (typeof raw !== 'string') return null;
    const value = raw.toLowerCase();
    for (const name of ['enterprise', 'team', 'pro', 'plus', 'free']) {
      if (value.includes(name)) return name;
    }
    return value;
  };

  /* ChatGPT: the account check and the conversation limit endpoint. */
  const readChatGPT = async (fetchJson) => {
    const notes = [];
    let plan = null;
    let denied = false;
    let signedOut = false;

    try {
      const account = await fetchJson('/backend-api/accounts/check/v4-2023-04-27');
      plan = chatgptPlan(account);
    } catch (error) {
      if (error && (error.code === 401 || error.code === 403)) denied = true;
    }

    const windows = [];
    try {
      const limit = await fetchJson('/backend-api/conversation_limit');
      windows.push(...extractWindows(limit));
      const cap = number(limit && (limit.message_cap ?? limit.messageCap));
      const used = number(limit && (limit.message_usage ?? limit.messageUsage ?? limit.used));
      if (cap && used != null) {
        const percent = round1(clamp((used / cap) * 100, 0, 100));
        windows.push({
          id: 'messages',
          label: 'Messages',
          usedPercent: percent,
          remainingPercent: round1(100 - percent),
          resetsAt: toEpoch(limit && (limit.resets_at ?? limit.reset_at)),
        });
      } else if (cap) {
        notes.push(`Your plan allows ${cap} messages per window.`);
      }
    } catch (error) {
      if (error && (error.code === 401 || error.code === 403)) denied = true;
    }

    if (!plan || denied) {
      try {
        const me = await fetchJson('/backend-api/me');
        plan = chatgptPlan(me) || plan;
        denied = false;
      } catch (error) {
        /* A 403 here usually means the route wants a bearer token, not that you
           are signed out — only a 401 is proof of that. */
        if (error && error.code === 401) signedOut = true;
      }
    }

    if (signedOut && !windows.length && !plan) {
      const error = new Error('signed-out');
      error.code = 401;
      throw error;
    }

    return { windows, plan, notes };
  };

  globalThis.UsageDetectorReaders = {
    clamp,
    round1,
    number,
    toEpoch,
    resetFromText,
    windowsFromText,
    extractWindows,
    findValue,
    statusFor,
    readClaude,
    readChatGPT,
  };
})();
