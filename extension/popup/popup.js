/* Usage Detector popup. Renders whatever the content scripts last reported —
   there is no sample data, so an empty panel means nothing has been read yet. */

const Sites = globalThis.UsageDetectorSites;
const MARKS = { claude: 'C', chatgpt: 'G' };
const PROVIDERS = Sites.SITES.map((site) => ({
  id: site.id,
  name: site.name,
  mark: MARKS[site.id] || site.name.slice(0, 1),
  host: site.host,
  hostName: site.hostName,
}));

const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const HISTORY_DAYS = 7;

const state = { claude: null, chatgpt: null, history: { claude: [], chatgpt: [] }, active: null };
let tabChecked = false;

const settingsStore = globalThis.UsageDetectorSettings;
let settings = (settingsStore && settingsStore.DEFAULTS) || {
  alertThreshold: 15,
  refreshMinutes: 5,
  badgeMode: 'worst',
  theme: 'auto',
};
let flashTimer = null;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function ago(timestamp) {
  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < 45000) return 'just now';
  if (diff < 90000) return '1 min ago';
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} hr ago`;
  return `${Math.round(diff / DAY)} d ago`;
}

function until(timestamp) {
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'any moment';
  if (diff < MINUTE) return 'less than a minute';
  if (diff < HOUR) return `${Math.round(diff / MINUTE)} min`;
  if (diff < DAY) {
    let hours = Math.floor(diff / HOUR);
    let minutes = Math.round((diff % HOUR) / MINUTE);
    if (minutes === 60) {
      hours += 1;
      minutes = 0;
    }
    return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  return `${Math.round(diff / DAY)} days`;
}

function severity(usedPercent) {
  if (usedPercent >= 100) return 'bad';
  if (usedPercent >= 85) return 'warn';
  return 'ok';
}

function applyTheme(theme) {
  const resolved =
    theme === 'auto'
      ? window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  document.documentElement.dataset.theme = resolved;
}

/* Which supported site the tab behind the popup is on, if any. */
async function detectActiveTab() {
  state.active = null;
  tabChecked = true;
  if (!isExtension || !chrome.tabs) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.active = tab && tab.url ? Sites.detect(tab.url) : null;
  } catch (_) {
    state.active = null;
  }
}

function renderDetect() {
  const strip = document.getElementById('detect');
  const text = document.getElementById('detect-text');
  const action = document.getElementById('detect-action');
  if (!strip || !text || !action) return;

  if (!tabChecked) {
    strip.classList.remove('is-on');
    action.hidden = true;
    text.textContent = 'Checking this tab…';
    return;
  }

  const active = state.active;
  strip.classList.toggle('is-on', Boolean(active));
  action.hidden = !active || !isExtension;

  if (!isExtension) {
    text.textContent = 'Site detector runs in the browser';
    return;
  }

  text.textContent = active ? `On ${active.hostname}` : 'Not on Claude or ChatGPT';
  if (active) action.dataset.refreshSite = active.id;
  else delete action.dataset.refreshSite;
}

function worstRemaining(record) {
  let value = null;
  for (const window of (record && record.windows) || []) {
    if (typeof window.remainingPercent !== 'number') continue;
    value = value == null ? window.remainingPercent : Math.min(value, window.remainingPercent);
  }
  return value;
}

function pill(record) {
  if (!record) return el('span', 'pill pill--idle', 'Not tracked');
  if (record.status === 'signed-out') return el('span', 'pill pill--idle', 'Signed out');
  if (record.status === 'limited') return el('span', 'pill pill--bad', 'Limit reached');

  const remaining = worstRemaining(record);
  if (remaining == null) {
    return el('span', 'pill pill--idle', record.status === 'unknown' ? 'No data' : 'Tracking');
  }
  const rounded = Math.round(remaining);
  if (remaining <= settings.alertThreshold) return el('span', 'pill pill--warn', `${rounded}% left`);
  return el('span', 'pill pill--ok', `${rounded}% left`);
}

function planLine(record) {
  if (!record) return 'No data yet';
  if (record.status === 'signed-out') return 'Signed out';
  return record.plan ? `${record.plan} plan` : 'Plan unknown';
}

function windowRow(window) {
  const row = el('div', 'win');

  const top = el('div', 'win-top');
  top.append(el('span', 'win-label', window.label || 'Usage'));
  if (typeof window.usedPercent === 'number') {
    top.append(el('span', 'win-pct', `${Math.round(window.usedPercent)}% used`));
  } else if (window.detail) {
    top.append(el('span', 'win-pct', window.detail));
  }
  row.append(top);

  if (typeof window.usedPercent === 'number') {
    const meter = el('div', 'meter');
    const fill = el('span', `meter-fill ${severity(window.usedPercent)}`);
    fill.style.width = `${Math.min(100, Math.max(0, window.usedPercent))}%`;
    meter.append(fill);
    row.append(meter);
  }

  if (window.resetsAt) row.append(el('div', 'win-foot', `Resets in ${until(window.resetsAt)}`));
  return row;
}

/* Sparkline of the tightest limit used, across the last seven days. */
function trendChart(points) {
  const wrap = el('div', 'trend');

  const values = points.map((point) => point.used);
  const head = el('div', 'trend-head');
  head.append(el('span', 'trend-label', `Last ${HISTORY_DAYS} days`));
  head.append(el('span', 'trend-peak', `peak ${Math.round(Math.max(...values))}% used`));
  wrap.append(head);

  const width = 100;
  const height = 34;
  const span = HISTORY_DAYS * DAY;
  const end = Date.now();
  const start = end - span;

  const x = (time) => ((Math.min(end, Math.max(start, time)) - start) / span) * width;
  const y = (used) => height - (Math.min(100, Math.max(0, used)) / 100) * height;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'trend-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Tightest limit used over the last ${HISTORY_DAYS} days`);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('class', 'trend-line');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('points', points.map((point) => `${x(point.t).toFixed(2)},${y(point.used).toFixed(2)}`).join(' '));
  svg.append(line);
  wrap.append(svg);

  const foot = el('div', 'trend-foot');
  foot.append(el('span', null, `${HISTORY_DAYS} days ago`), el('span', null, 'now'));
  wrap.append(foot);

  return wrap;
}

function emptyBlock(provider, record) {
  const wrap = el('div', 'empty');
  const signedOut = record && record.status === 'signed-out';
  const note = record && record.notes && record.notes[0];
  const here = Boolean(state.active && state.active.id === provider.id);

  let text;
  if (signedOut) text = `Sign in to ${provider.hostName} to read your usage.`;
  else if (note) text = note;
  else if (here) text = `You're on ${provider.hostName} — the panel fills in as soon as the page reports.`;
  else text = `Nothing read yet — the extension checks ${provider.hostName} on its own, and reads the page when you have it open.`;
  wrap.append(el('p', 'empty-text', text));

  const button = el('button', 'btn', here ? 'Read this tab' : `Open ${provider.hostName}`);
  button.type = 'button';
  if (here) button.dataset.refreshSite = provider.id;
  else button.dataset.open = provider.id;
  wrap.append(button);
  return wrap;
}

function card(provider, record) {
  const section = el('section', `card card--${provider.id}`);
  const here = Boolean(state.active && state.active.id === provider.id);
  if (here) section.classList.add('is-current');

  const head = el('div', 'card-head');
  head.append(el('span', 'mark', provider.mark));

  const who = el('div', 'who');
  who.append(el('h2', null, provider.name));
  who.append(el('p', 'plan', planLine(record)));
  head.append(who, pill(record));
  section.append(head);

  if (record && record.windows && record.windows.length) {
    const list = el('div', 'windows');
    for (const window of record.windows.slice(0, 3)) list.append(windowRow(window));
    section.append(list);

    const note = record.notes && record.notes[0];
    if (note) section.append(el('p', 'note', note));
  } else {
    section.append(emptyBlock(provider, record));
  }

  const points = (state.history && state.history[provider.id]) || [];
  if (points.length > 1) section.append(trendChart(points));

  if (record && record.detectedAt) {
    const meta = [`Checked ${ago(record.detectedAt)}`];
    if (record.source === 'page') meta.push('read from the page');
    else if (record.via === 'background') meta.push('read in the background');
    if (here) meta.push('this tab');
    section.append(el('p', 'card-foot', meta.join(' · ')));
  }

  return section;
}

function subtitle() {
  const stamps = PROVIDERS.map((provider) => state[provider.id] && state[provider.id].detectedAt).filter(Boolean);
  if (!stamps.length) return 'Claude & ChatGPT limits';
  return `Updated ${ago(Math.max(...stamps))}`;
}

function render() {
  renderDetect();

  const root = document.getElementById('providers');
  if (!root) return;
  root.textContent = '';
  for (const provider of PROVIDERS) root.append(card(provider, state[provider.id]));

  const line = document.getElementById('subtitle');
  if (line) line.textContent = subtitle();
}

function flash(message) {
  let node = document.getElementById('flash');
  if (!node) {
    node = el('p', 'flash');
    node.id = 'flash';
    const footer = document.querySelector('.foot');
    if (!footer) return;
    footer.before(node);
  }
  node.textContent = message;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => node.remove(), 5000);
}

async function load() {
  settings = settingsStore ? await settingsStore.get() : settings;
  applyTheme(settings.theme);
  await detectActiveTab();

  if (!isExtension) {
    render();
    return;
  }

  const keys = PROVIDERS.flatMap((provider) => [`usage:${provider.id}`, `history:${provider.id}`]);
  const stored = await chrome.storage.local.get(keys);

  for (const provider of PROVIDERS) {
    state[provider.id] = stored[`usage:${provider.id}`] || null;
    const history = stored[`history:${provider.id}`];
    state.history[provider.id] = Array.isArray(history) ? history : [];
  }

  render();
}

/* Opening the popup while a site tab is open should show numbers right away. */
async function refreshIfEmpty() {
  const target = state.active ? state.active.id : null;
  if (target && state[target]) return;
  if (PROVIDERS.every((provider) => state[provider.id])) return;
  try {
    await chrome.runtime.sendMessage({ type: 'usage:refresh', provider: target || undefined });
  } catch (_) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await load();
}

async function refresh(button, provider) {
  if (!isExtension) {
    flash('Install the extension to read usage from claude.ai and chatgpt.com.');
    return;
  }

  button.classList.add('is-busy');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'usage:refresh', provider });
    if (!result || !result.ok) {
      flash('Could not read either site. Sign in to claude.ai or chatgpt.com, then refresh.');
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await load();
    }
  } catch (_) {
    flash('Could not reach the extension. Reload it from the extensions page.');
  }
  button.classList.remove('is-busy');
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const opener = target.closest('[data-open]');
  if (opener) {
    const provider = PROVIDERS.find((item) => item.id === opener.dataset.open);
    if (!provider) return;
    if (isExtension) chrome.tabs.create({ url: provider.host });
    else window.open(provider.host, '_blank', 'noopener');
    return;
  }

  const siteButton = target.closest('[data-refresh-site]');
  if (siteButton) {
    refresh(siteButton, siteButton.dataset.refreshSite);
    return;
  }

  const settingsButton = target.closest('#settings');
  if (settingsButton) {
    if (isExtension) chrome.runtime.openOptionsPage();
    return;
  }

  const refreshButton = target.closest('#refresh');
  if (refreshButton) refresh(refreshButton);
});

if (isExtension) {
  load().then(refreshIfEmpty);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const touched = Object.keys(changes);
    if (touched.some((key) => key.startsWith('usage:') || key.startsWith('history:') || key === 'settings')) load();
  });
} else {
  document.body.classList.add('is-embedded');
  const settingsButton = document.getElementById('settings');
  if (settingsButton) settingsButton.hidden = true;

  // The preview renders the settings page beside this panel; follow its changes.
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === 'usage-detector:settings') load();
  });
  load();
}

render();
setInterval(render, 30000);
