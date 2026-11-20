/* Usage Detector settings page — saves as you change a control. */

const Sites = globalThis.UsageDetectorSites;
const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
const store = globalThis.UsageDetectorSettings;

const fields = {
  alertThreshold: document.getElementById('alertThreshold'),
  notifications: document.getElementById('notifications'),
  silentNotifications: document.getElementById('silentNotifications'),
  alertRepeatMinutes: document.getElementById('alertRepeatMinutes'),
  notifyOnReset: document.getElementById('notifyOnReset'),
  quietHours: document.getElementById('quietHours'),
  quietStart: document.getElementById('quietStart'),
  quietEnd: document.getElementById('quietEnd'),
  refreshMinutes: document.getElementById('refreshMinutes'),
  backgroundPolling: document.getElementById('backgroundPolling'),
  refreshOnFocus: document.getElementById('refreshOnFocus'),
  recordHistory: document.getElementById('recordHistory'),
  historyDays: document.getElementById('historyDays'),
  showHistory: document.getElementById('showHistory'),
  theme: document.getElementById('theme'),
  badgeMode: document.getElementById('badgeMode'),
  badgeStyle: document.getElementById('badgeStyle'),
  hideIdleSites: document.getElementById('hideIdleSites'),
  overlayEnabled: document.getElementById('overlayEnabled'),
  overlayPosition: document.getElementById('overlayPosition'),
  overlayCompact: document.getElementById('overlayCompact'),
  overlayRows: document.getElementById('overlayRows'),
};

const thresholdValue = document.getElementById('alertThresholdValue');
const saved = document.getElementById('saved');
const banner = document.getElementById('banner');
const sitesRoot = document.getElementById('sites');

let savedTimer = null;

function applyTheme(theme) {
  const resolved =
    theme === 'auto'
      ? window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  document.documentElement.dataset.theme = resolved;
}

/* The badge can follow any tracked site, not just the two with an API. */
function buildBadgeOptions() {
  fields.badgeMode.append(new Option('Tightest limit', 'worst'));
  for (const site of Sites.SITES) fields.badgeMode.append(new Option(site.name, site.id));
}

const hourLabel = (hour) => {
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${hour < 12 ? 'AM' : 'PM'}`;
};

function buildHourOptions() {
  for (const field of [fields.quietStart, fields.quietEnd]) {
    field.textContent = '';
    for (let hour = 0; hour < 24; hour += 1) field.append(new Option(hourLabel(hour), String(hour)));
  }
}

function buildSites() {
  sitesRoot.textContent = '';
  for (const site of Sites.SITES) {
    const label = document.createElement('label');
    label.className = 'site';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = site.id;
    input.addEventListener('change', commit);

    const mark = document.createElement('span');
    mark.className = 'site-mark';
    mark.textContent = site.mark;
    mark.style.setProperty('--accent', site.accent);

    const name = document.createElement('span');
    name.className = 'site-name';
    name.append(document.createTextNode(site.name));
    const host = document.createElement('span');
    host.className = 'site-host';
    host.textContent = site.hostName;
    name.append(host);

    label.append(input, mark, name);
    sitesRoot.append(label);
  }
}

function selectedSites() {
  return [...sitesRoot.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
}

function dim(id, off) {
  const row = document.getElementById(id);
  if (row) row.classList.toggle('is-off', off);
}

/* Rows that only matter while another setting is on. */
function syncDependents() {
  const overlay = fields.overlayEnabled.checked;
  for (const id of ['overlayPositionRow', 'overlayCompactRow', 'overlayRowsRow']) dim(id, !overlay);
  fields.overlayPosition.disabled = !overlay;
  fields.overlayCompact.disabled = !overlay;
  fields.overlayRows.disabled = !overlay;

  const quiet = fields.quietHours.checked;
  for (const id of ['quietStartRow', 'quietEndRow']) dim(id, !quiet);
  fields.quietStart.disabled = !quiet;
  fields.quietEnd.disabled = !quiet;

  const alerts = fields.notifications.checked;
  for (const id of ['silentNotificationsRow', 'alertRepeatRow']) dim(id, !alerts);
  fields.silentNotifications.disabled = !alerts;
  fields.alertRepeatMinutes.disabled = !alerts;

  const history = fields.recordHistory.checked;
  for (const id of ['historyDaysRow', 'showHistoryRow']) dim(id, !history);
  fields.historyDays.disabled = !history;
  fields.showHistory.disabled = !history;

  const badge = fields.badgeStyle.value !== 'off';
  dim('badgeModeRow', !badge);
  fields.badgeMode.disabled = !badge;
}

function fill(values) {
  fields.alertThreshold.value = String(values.alertThreshold);
  fields.notifications.checked = values.notifications;
  fields.silentNotifications.checked = values.silentNotifications;
  fields.alertRepeatMinutes.value = String(values.alertRepeatMinutes);
  fields.notifyOnReset.checked = values.notifyOnReset;
  fields.quietHours.checked = values.quietHours;
  fields.quietStart.value = String(values.quietStart);
  fields.quietEnd.value = String(values.quietEnd);
  fields.refreshMinutes.value = String(values.refreshMinutes);
  fields.backgroundPolling.checked = values.backgroundPolling;
  fields.refreshOnFocus.checked = values.refreshOnFocus;
  fields.recordHistory.checked = values.recordHistory;
  fields.historyDays.value = String(values.historyDays);
  fields.showHistory.checked = values.showHistory;
  fields.theme.value = values.theme;
  fields.badgeMode.value = values.badgeMode;
  fields.badgeStyle.value = values.badgeStyle;
  fields.hideIdleSites.checked = values.hideIdleSites;
  fields.overlayEnabled.checked = values.overlayEnabled;
  fields.overlayPosition.value = values.overlayPosition;
  fields.overlayCompact.checked = values.overlayCompact;
  fields.overlayRows.value = String(values.overlayRows);

  for (const input of sitesRoot.querySelectorAll('input[type="checkbox"]')) {
    input.checked = values.enabledSites.includes(input.value);
  }

  thresholdValue.textContent = `${values.alertThreshold}% left`;
  applyTheme(values.theme);
  syncDependents();
}

function flash(message = 'Saved') {
  saved.textContent = message;
  saved.classList.add('is-on');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    saved.textContent = '';
    saved.classList.remove('is-on');
  }, 1800);
}

async function commit() {
  if (!store) return;
  const values = await store.save({
    alertThreshold: Number(fields.alertThreshold.value),
    notifications: fields.notifications.checked,
    silentNotifications: fields.silentNotifications.checked,
    alertRepeatMinutes: Number(fields.alertRepeatMinutes.value),
    notifyOnReset: fields.notifyOnReset.checked,
    quietHours: fields.quietHours.checked,
    quietStart: Number(fields.quietStart.value),
    quietEnd: Number(fields.quietEnd.value),
    refreshMinutes: Number(fields.refreshMinutes.value),
    backgroundPolling: fields.backgroundPolling.checked,
    refreshOnFocus: fields.refreshOnFocus.checked,
    recordHistory: fields.recordHistory.checked,
    historyDays: Number(fields.historyDays.value),
    showHistory: fields.showHistory.checked,
    theme: fields.theme.value,
    badgeMode: fields.badgeMode.value,
    badgeStyle: fields.badgeStyle.value,
    hideIdleSites: fields.hideIdleSites.checked,
    overlayEnabled: fields.overlayEnabled.checked,
    overlayPosition: fields.overlayPosition.value,
    overlayCompact: fields.overlayCompact.checked,
    overlayRows: Number(fields.overlayRows.value),
    enabledSites: selectedSites(),
  });
  fill(values);
  flash();
}

/* Everything the extension stored, in the preview's localStorage or the
   extension's chrome.storage.local. */
async function readAll() {
  if (isExtension) return chrome.storage.local.get(null);
  const data = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith('usage-detector:')) continue;
    const name = key.slice('usage-detector:'.length);
    const raw = localStorage.getItem(key);
    try {
      data[name] = JSON.parse(raw);
    } catch (_) {
      data[name] = raw;
    }
  }
  return data;
}

function download(name, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: isExtension ? chrome.runtime.getManifest().version : null,
    data: await readAll(),
  };
  download(`usage-detector-${new Date().toISOString().slice(0, 10)}.json`, payload);
  flash('Exported');
}

async function clearHistory() {
  if (isExtension) {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith('history:') || key.startsWith('alert:'));
    if (keys.length) await chrome.storage.local.remove(keys);
  } else {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && (key.startsWith('usage-detector:history:') || key.startsWith('usage-detector:alert:'))) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  }
  flash('History cleared');
}

async function resetSettings() {
  if (!store) return;
  fill(await store.save(store.DEFAULTS));
  flash('Settings reset');
}

(async () => {
  if (!store) return;
  buildBadgeOptions();
  buildHourOptions();
  buildSites();
  fill(await store.get());

  if (!isExtension) {
    banner.hidden = false;
    banner.textContent =
      'This preview page has no extension APIs, so changes stay in this browser. Inside the installed extension they save to your browser profile.';
  }

  for (const field of Object.values(fields)) field.addEventListener('change', commit);
  fields.alertThreshold.addEventListener('input', () => {
    thresholdValue.textContent = `${fields.alertThreshold.value}% left`;
  });

  document.getElementById('exportData').addEventListener('click', exportData);
  document.getElementById('clearHistory').addEventListener('click', clearHistory);
  document.getElementById('resetSettings').addEventListener('click', resetSettings);
})();
