/* Usage Detector settings page — saves as you change a control. */

const Sites = globalThis.UsageDetectorSites;
const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
const store = globalThis.UsageDetectorSettings;

const fields = {
  alertThreshold: document.getElementById('alertThreshold'),
  refreshMinutes: document.getElementById('refreshMinutes'),
  badgeMode: document.getElementById('badgeMode'),
  theme: document.getElementById('theme'),
  overlayPosition: document.getElementById('overlayPosition'),
  notifications: document.getElementById('notifications'),
  showHistory: document.getElementById('showHistory'),
  overlayEnabled: document.getElementById('overlayEnabled'),
  overlayCompact: document.getElementById('overlayCompact'),
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

function syncDependents() {
  const on = fields.overlayEnabled.checked;
  document.getElementById('overlayPositionRow').classList.toggle('is-off', !on);
  document.getElementById('overlayCompactRow').classList.toggle('is-off', !on);
  fields.overlayPosition.disabled = !on;
  fields.overlayCompact.disabled = !on;
}

function fill(values) {
  fields.alertThreshold.value = String(values.alertThreshold);
  fields.refreshMinutes.value = String(values.refreshMinutes);
  fields.badgeMode.value = values.badgeMode;
  fields.theme.value = values.theme;
  fields.overlayPosition.value = values.overlayPosition;
  fields.notifications.checked = values.notifications;
  fields.showHistory.checked = values.showHistory;
  fields.overlayEnabled.checked = values.overlayEnabled;
  fields.overlayCompact.checked = values.overlayCompact;

  for (const input of sitesRoot.querySelectorAll('input[type="checkbox"]')) {
    input.checked = values.enabledSites.includes(input.value);
  }

  thresholdValue.textContent = `${values.alertThreshold}% left`;
  applyTheme(values.theme);
  syncDependents();
}

function flashSaved() {
  saved.textContent = 'Saved';
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
    refreshMinutes: Number(fields.refreshMinutes.value),
    badgeMode: fields.badgeMode.value,
    theme: fields.theme.value,
    overlayPosition: fields.overlayPosition.value,
    notifications: fields.notifications.checked,
    showHistory: fields.showHistory.checked,
    overlayEnabled: fields.overlayEnabled.checked,
    overlayCompact: fields.overlayCompact.checked,
    enabledSites: selectedSites(),
  });
  fill(values);
  flashSaved();
}

(async () => {
  if (!store) return;
  buildBadgeOptions();
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
})();
