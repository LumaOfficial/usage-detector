export const TRACKABLE_PROTOCOLS = ['http:', 'https:'];

export function normalizeDomain(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!TRACKABLE_PROTOCOLS.includes(url.protocol)) return null;
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function normalizeIgnoreEntry(entry) {
  return String(entry || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

export function isIgnored(domain, ignoreList = []) {
  if (!domain) return true;
  return ignoreList.some((entry) => {
    const clean = normalizeIgnoreEntry(entry);
    return Boolean(clean) && (domain === clean || domain.endsWith(`.${clean}`));
  });
}

export function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function sumSites(sites) {
  if (!sites) return 0;
  return Object.values(sites).reduce((total, value) => total + (Number(value) || 0), 0);
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total <= 0) return '0m';
  if (total < 60) return '<1m';
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${hours}h`;
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatCompact(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total < 60) return '';
  if (total < 3600) return `${Math.floor(total / 60)}m`;
  return `${Math.floor(total / 3600)}h`;
}

export function domainColor(domain) {
  let hash = 0;
  for (let index = 0; index < domain.length; index += 1) {
    hash = (hash * 31 + domain.charCodeAt(index)) % 360;
  }
  return `hsl(${hash} 62% 46%)`;
}

export function domainLabel(domain) {
  const parts = String(domain || '').split('.').filter(Boolean);
  if (!parts.length) return '?';
  const base = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return (base[0] || '?').toUpperCase();
}
