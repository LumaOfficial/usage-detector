/* Usage Detector settings page — saves as you change a control. */

const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
const store = globalThis.UsageDetectorSettings;

const fields = {
  alertThreshold: document.getElementById('alertThreshold'),
  refreshMinutes: document.getElementById('refreshMinutes'),
  badgeMode: document.getElementById('badgeMode'),
  theme: document.getElementById('theme'),
};

const thresholdValue = document.getElementById('alertThresholdValue');
const saved = document.getElementById('saved');
const banner = document.getElementById('banner');

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

function fill(values) {
  fields.alertThreshold.value = String(values.alertThreshold);
  fields.refreshMinutes.value = String(values.refreshMinutes);
  fields.badgeMode.value = values.badgeMode;
  fields.theme.value = values.theme;
  thresholdValue.textContent = `${values.alertThreshold}% left`;
  applyTheme(values.theme);
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
  });
  fill(values);
  flashSaved();
}

(async () => {
  if (!store) return;
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
