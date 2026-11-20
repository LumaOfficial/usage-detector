import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/defaults.js';
import { dayKey, normalizeIgnoreEntry, sumSites } from './usage.js';

function clampInt(value, min, max, fallback) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeSettings(input = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...input };
  const ignore = Array.isArray(merged.ignore) ? merged.ignore : DEFAULT_SETTINGS.ignore;
  return {
    trackingEnabled: merged.trackingEnabled !== false,
    idleSeconds: clampInt(merged.idleSeconds, 15, 300, DEFAULT_SETTINGS.idleSeconds),
    retentionDays: clampInt(merged.retentionDays, 7, 3650, DEFAULT_SETTINGS.retentionDays),
    ignore: [...new Set(ignore.map(normalizeIgnoreEntry).filter(Boolean))],
  };
}

export async function readSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(stored?.[STORAGE_KEYS.settings]);
}

export async function writeSettings(settings) {
  const clean = normalizeSettings(settings);
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: clean });
  return clean;
}

export async function readDaily() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.daily);
  const daily = stored?.[STORAGE_KEYS.daily];
  return daily && typeof daily === 'object' && !Array.isArray(daily) ? daily : {};
}

export async function writeDaily(daily) {
  await chrome.storage.local.set({ [STORAGE_KEYS.daily]: daily });
}

export function pruneDaily(daily, retentionDays, now = new Date()) {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - retentionDays);
  const minKey = dayKey(cutoff);
  const kept = {};
  for (const [key, sites] of Object.entries(daily || {})) {
    if (key >= minKey) kept[key] = sites;
  }
  return kept;
}

export function sanitizeDaily(input) {
  const clean = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return clean;
  for (const [key, sites] of Object.entries(input)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !sites || typeof sites !== 'object') continue;
    const day = {};
    for (const [domain, seconds] of Object.entries(sites)) {
      const name = normalizeIgnoreEntry(domain);
      const value = Math.round(Number(seconds));
      if (!name || !Number.isFinite(value) || value <= 0) continue;
      day[name] = Math.min(value, 172800);
    }
    if (Object.keys(day).length) clean[key] = day;
  }
  return clean;
}

export function dayTotal(daily, key) {
  return Math.round(sumSites(daily?.[key]));
}
