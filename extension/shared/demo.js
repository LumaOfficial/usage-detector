import { DEFAULT_SETTINGS } from './defaults.js';
import { dayKey, sumSites } from '../lib/usage.js';
import { normalizeSettings, sanitizeDaily } from '../lib/store.js';

const KEY = 'usage-detector-demo-v1';

const TODAY_SITES = [
  ['figma.com', 3120],
  ['github.com', 2280],
  ['youtube.com', 1440],
  ['developer.mozilla.org', 1080],
  ['mail.google.com', 840],
  ['linear.app', 660],
  ['news.ycombinator.com', 420],
  ['stackoverflow.com', 300],
];

const DAY_FACTORS = [0.82, 1.18, 0.64, 1.05, 1.32, 0.47];

function seedState() {
  const now = new Date();
  const daily = {};
  daily[dayKey(now)] = Object.fromEntries(TODAY_SITES.map(([domain, seconds]) => [domain, seconds]));

  for (let offset = 1; offset <= 6; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const factor = DAY_FACTORS[offset - 1] ?? 0.7;
    const day = {};
    TODAY_SITES.forEach(([domain, seconds], index) => {
      if (index === TODAY_SITES.length - 1 && offset % 3 === 0) return;
      const variance = 1 + (((index * 7 + offset * 11) % 13) - 6) / 40;
      day[domain] = Math.round(seconds * factor * variance);
    });
    daily[dayKey(date)] = day;
  }

  return {
    settings: { ...DEFAULT_SETTINGS },
    daily,
    current: { domain: 'figma.com', since: Date.now() - 14 * 60 * 1000 },
  };
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private windows; the demo still renders.
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.daily && parsed.settings) {
        if (parsed.current && Date.now() - parsed.current.since > 2 * 60 * 60 * 1000) {
          parsed.current.since = Date.now() - 14 * 60 * 1000;
        }
        return parsed;
      }
    }
  } catch {
    // Fall through to a fresh seed.
  }
  const seeded = seedState();
  save(seeded);
  return seeded;
}

function buildSummary(state) {
  const now = Date.now();
  const today = dayKey(new Date(now));
  const sites = Object.entries(state.daily[today] || {})
    .map(([domain, seconds]) => ({ domain, seconds: Math.round(seconds) }))
    .sort((left, right) => right.seconds - left.seconds);
  const total = sites.reduce((sum, site) => sum + site.seconds, 0);

  const week = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    week.push({ date: key, seconds: Math.round(sumSites(state.daily[key])) });
  }

  const current = state.settings.trackingEnabled && state.current
    ? { domain: state.current.domain, since: state.current.since, idle: false }
    : null;

  return {
    ok: true,
    now,
    date: today,
    sites,
    total,
    week,
    current,
    settings: state.settings,
    demo: true,
  };
}

export async function demoRequest(type, payload) {
  const state = load();

  switch (type) {
    case 'summary':
      return buildSummary(state);

    case 'settings:get':
      return { ok: true, settings: state.settings };

    case 'settings:update':
      state.settings = normalizeSettings({ ...state.settings, ...(payload || {}) });
      save(state);
      return { ok: true, settings: state.settings };

    case 'tracking:toggle':
      state.settings.trackingEnabled = !state.settings.trackingEnabled;
      state.current = state.settings.trackingEnabled
        ? { domain: 'figma.com', since: Date.now() - 4 * 60 * 1000 }
        : null;
      save(state);
      return { ok: true, settings: state.settings };

    case 'data:reset':
      state.daily = {};
      state.current = state.settings.trackingEnabled
        ? { domain: 'figma.com', since: Date.now() - 60 * 1000 }
        : null;
      save(state);
      return { ok: true };

    case 'data:export':
      return {
        ok: true,
        data: {
          app: 'usage-detector',
          schema: 1,
          exportedAt: new Date().toISOString(),
          settings: state.settings,
          daily: state.daily,
        },
      };

    case 'data:import': {
      const daily = sanitizeDaily(payload?.data?.daily ?? payload?.daily);
      if (!Object.keys(daily).length) {
        return { ok: false, error: 'That file has no usage data in it.' };
      }
      state.daily = daily;
      save(state);
      return { ok: true, days: Object.keys(daily).length };
    }

    case 'storage:info': {
      const bytes = new Blob([JSON.stringify(state)]).size;
      return {
        ok: true,
        bytes,
        days: Object.keys(state.daily).length,
        sites: Object.keys(state.daily[dayKey()] || {}).length,
      };
    }

    default:
      return { ok: false, error: `Unknown request: ${type}` };
  }
}
