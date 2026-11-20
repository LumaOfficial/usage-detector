import { dayKey, domainColor, domainLabel, formatClock, formatDuration } from '../lib/usage.js';
import { isExtension, openOptions, request } from '../shared/api.js';

const el = {
  dateLabel: document.getElementById('dateLabel'),
  statusPill: document.getElementById('statusPill'),
  statusText: document.getElementById('statusText'),
  nowClock: document.getElementById('nowClock'),
  nowChip: document.getElementById('nowChip'),
  nowDomain: document.getElementById('nowDomain'),
  nowSub: document.getElementById('nowSub'),
  totalValue: document.getElementById('totalValue'),
  totalSub: document.getElementById('totalSub'),
  weekBars: document.getElementById('weekBars'),
  siteList: document.getElementById('siteList'),
  siteCount: document.getElementById('siteCount'),
  emptyState: document.getElementById('emptyState'),
  toggleBtn: document.getElementById('toggleBtn'),
  optionsBtn: document.getElementById('optionsBtn'),
  footNote: document.getElementById('footNote'),
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MAX_SITES = 5;

let summary = null;

function tickClock() {
  const current = summary?.current;
  if (!current || !summary.settings.trackingEnabled || !current.since) return;
  el.nowClock.textContent = formatClock((Date.now() - current.since) / 1000);
}

function renderNow() {
  const tracking = summary.settings.trackingEnabled;
  const current = summary.current;

  if (!tracking) {
    el.nowDomain.textContent = 'Tracking paused';
    el.nowSub.textContent = 'Nothing is being recorded';
    el.nowClock.textContent = '0:00';
    el.nowChip.textContent = '–';
    el.nowChip.style.background = 'var(--ud-panel-2)';
    el.nowChip.style.color = 'var(--ud-ink-3)';
    return;
  }

  if (!current) {
    el.nowDomain.textContent = 'No active site';
    el.nowSub.textContent = 'Switch to a website to start';
    el.nowClock.textContent = '0:00';
    el.nowChip.textContent = '–';
    el.nowChip.style.background = 'var(--ud-panel-2)';
    el.nowChip.style.color = 'var(--ud-ink-3)';
    return;
  }

  el.nowDomain.textContent = current.domain;
  el.nowSub.textContent = current.since
    ? `Started ${new Date(current.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Session in progress';
  el.nowChip.textContent = domainLabel(current.domain);
  el.nowChip.style.background = domainColor(current.domain);
  el.nowChip.style.color = '#ffffff';
  tickClock();
}

function renderWeek(week) {
  const max = Math.max(1, ...week.map((day) => day.seconds));
  const today = dayKey();
  el.weekBars.innerHTML = '';

  week.forEach((day) => {
    const column = document.createElement('div');
    column.className = 'ud-week-col';
    if (day.date === today) column.classList.add('is-today');
    column.title = `${day.date} · ${formatDuration(day.seconds)}`;

    const track = document.createElement('div');
    track.className = 'ud-week-track';

    const bar = document.createElement('div');
    bar.className = 'ud-week-bar';
    bar.style.height = `${Math.max(6, Math.round((day.seconds / max) * 100))}%`;
    track.appendChild(bar);

    const label = document.createElement('span');
    label.className = 'ud-week-label';
    const [year, month, date] = day.date.split('-').map(Number);
    label.textContent = WEEKDAYS[new Date(year, month - 1, date).getDay()];

    column.append(track, label);
    el.weekBars.appendChild(column);
  });
}

function renderSites(sites) {
  const top = sites.slice(0, MAX_SITES);
  const max = Math.max(1, ...top.map((site) => site.seconds));
  el.siteList.innerHTML = '';
  el.siteCount.textContent = `${sites.length} ${sites.length === 1 ? 'site' : 'sites'}`;
  el.emptyState.hidden = sites.length > 0;
  el.siteList.hidden = sites.length === 0;

  top.forEach((site, index) => {
    const row = document.createElement('li');
    row.className = 'ud-site';
    row.style.setProperty('--ud-bar', `${Math.max(4, Math.round((site.seconds / max) * 100))}%`);

    const rank = document.createElement('span');
    rank.className = 'ud-rank';
    rank.textContent = String(index + 1);

    const chip = document.createElement('span');
    chip.className = 'ud-chip ud-chip-sm';
    chip.textContent = domainLabel(site.domain);
    chip.style.background = domainColor(site.domain);

    const name = document.createElement('span');
    name.className = 'ud-site-name';
    name.textContent = site.domain;

    const time = document.createElement('span');
    time.className = 'ud-site-time';
    time.textContent = formatDuration(site.seconds);

    row.append(rank, chip, name, time);
    el.siteList.appendChild(row);
  });
}

function render() {
  if (!summary) return;
  const tracking = summary.settings.trackingEnabled;
  document.body.classList.toggle('is-paused', !tracking);

  el.dateLabel.textContent = new Date(summary.now).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  el.statusText.textContent = tracking ? 'Tracking' : 'Paused';
  el.statusPill.classList.toggle('is-off', !tracking);

  el.totalValue.textContent = formatDuration(summary.total);
  const siteCount = summary.sites.length;
  el.totalSub.textContent = summary.total > 0
    ? `${siteCount} ${siteCount === 1 ? 'site' : 'sites'} today`
    : 'Nothing tracked yet';

  renderWeek(summary.week);
  renderSites(summary.sites);
  renderNow();

  el.toggleBtn.textContent = tracking ? 'Pause tracking' : 'Resume tracking';
  el.toggleBtn.classList.toggle('is-resume', !tracking);
  el.footNote.textContent = isExtension
    ? 'Tracked locally on this device. No account, no server.'
    : 'Preview demo data — the real extension reads your browser tabs.';
}

async function load() {
  try {
    summary = await request('summary');
    render();
  } catch (error) {
    el.nowDomain.textContent = 'Could not read usage data';
    el.nowSub.textContent = error?.message || 'Unknown error';
  }
}

el.toggleBtn.addEventListener('click', async () => {
  el.toggleBtn.disabled = true;
  try {
    await request('tracking:toggle');
    await load();
  } finally {
    el.toggleBtn.disabled = false;
  }
});

el.optionsBtn.addEventListener('click', () => {
  openOptions();
});

setInterval(tickClock, 1000);
setInterval(() => {
  if (document.visibilityState === 'visible') load();
}, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load();
});

load();
