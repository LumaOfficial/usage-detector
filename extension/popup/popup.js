/* Usage Detector popup. Renders whatever the content scripts last reported —
   there is no sample data, so an empty panel means nothing has been read yet. */

const Sites = globalThis.UsageDetectorSites;
const settingsStore = globalThis.UsageDetectorSettings;
const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;
const HISTORY_DAYS = 7;

const state = { records: {}, history: {}, active: null, showAll: false };
const expanded = new Set();

let tabChecked = false;
let flashTimer = null;

let settings = { ...(settingsStore ? settingsStore.DEFAULTS : {}), enabledSites: null };

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function enabledProviders() {
  const enabled = Array.isArray(settings.enabledSites) ? settings.enabledSites : Sites.IDS;
  return Sites.SITES.filter((site) => enabled.includes(site.id));
}

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

  text.textContent = active ? `On ${active.hostname}` : 'Not on a supported AI site';
  if (active) action.dataset.refreshSite = active.id;
  else delete action.dataset.refreshSite;
}

/* The single limit closest to running out, across every tracked site. */
function tightest() {
  let best = null;
  for (const provider of enabledProviders()) {
    const record = state.records[provider.id];
    for (const win of (record && record.windows) || []) {
      if (typeof win.remainingPercent !== 'number') continue;
      if (!best || win.remainingPercent < best.remaining) {
        best = { provider, win, remaining: win.remainingPercent, record };
      }
    }
  }
  return best;
}

function renderOverview() {
  const root = document.getElementById('overview');
  if (!root) return;
  root.textContent = '';

  const best = tightest();
  const box = el('div', 'ov');

  const head = el('div', 'ov-head');
  head.append(el('span', 'ov-label', 'Tightest limit'));

  const main = el('div', 'ov-main');

  if (best) {
    const left = Math.max(0, Math.round(best.remaining));
    const limited = best.record.status === 'limited';
    const tone = limited || best.remaining <= 0 ? 'bad' : best.remaining <= settings.alertThreshold ? 'warn' : 'ok';

    head.append(
      el('span', `ov-state ov-state--${tone}`, tone === 'bad' ? 'At the limit' : tone === 'warn' ? 'Running low' : 'Comfortable')
    );
    main.append(el('span', 'ov-value', `${left}`), el('span', 'ov-unit', '% left'));
    box.append(head, main);

    const sub = el('p', 'ov-sub');
    const mark = el('span', 'ov-mark', best.provider.mark);
    mark.style.background = `linear-gradient(140deg, ${best.provider.accent}, rgba(255, 255, 255, 0.72))`;
    sub.append(mark);
    sub.append(el('span', null, `${best.provider.name} · ${best.win.label || 'Usage'}`));
    box.append(sub);

    const track = el('div', 'ov-track');
    const fill = el('span', `ov-fill ${tone}`);
    fill.style.width = `${Math.min(100, Math.max(0, best.remaining))}%`;
    track.append(fill);
    box.append(track);

    const foot = [];
    if (best.win.resetsAt) foot.push(`Resets in ${until(best.win.resetsAt)}`);
    if (best.record.detectedAt) foot.push(`checked ${ago(best.record.detectedAt)}`);
    if (foot.length) box.append(el('p', 'ov-foot', foot.join(' · ')));
  } else {
    const signedOut = enabledProviders().find(
      (provider) => state.records[provider.id] && state.records[provider.id].status === 'signed-out'
    );
    head.append(el('span', 'ov-state', signedOut ? 'Signed out' : 'Waiting'));
    main.append(el('span', 'ov-value ov-value--idle', '—'), el('span', 'ov-unit', '% left'));
    box.append(head, main);
    box.append(
      el(
        'p',
        'ov-sub',
        signedOut
          ? `Sign in to ${signedOut.hostName} to start counting.`
          : 'No reads yet — the extension checks your sites in the background and fills this in on its own.'
      )
    );
  }

  root.append(box);
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
  if (!record || record.status === 'signed-out') return null;
  return record.plan ? `${record.plan} plan` : null;
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
  const days = settings.historyDays || HISTORY_DAYS;

  const values = points.map((point) => point.used);
  const head = el('div', 'trend-head');
  head.append(el('span', 'trend-label', `Last ${days} days`));
  head.append(el('span', 'trend-peak', `peak ${Math.round(Math.max(...values))}% used`));
  wrap.append(head);

  const width = 100;
  const height = 34;
  const span = days * DAY;
  const end = Date.now();
  const start = end - span;

  const x = (time) => ((Math.min(end, Math.max(start, time)) - start) / span) * width;
  const y = (used) => height - (Math.min(100, Math.max(0, used)) / 100) * height;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'trend-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Tightest limit used over the last ${days} days`);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('class', 'trend-line');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('points', points.map((point) => `${x(point.t).toFixed(2)},${y(point.used).toFixed(2)}`).join(' '));
  svg.append(line);
  wrap.append(svg);

  const foot = el('div', 'trend-foot');
  foot.append(el('span', null, `${days} days ago`), el('span', null, 'now'));
  wrap.append(foot);

  return wrap;
}

function emptyBlock(provider, record) {
  const wrap = el('div', 'empty');
  const signedOut = record && record.status === 'signed-out';
  const note = record && record.notes && record.notes[0];
  const here = Boolean(state.active && state.active.id === provider.id);

  let text;
  if (signedOut) text = `Sign in to ${provider.hostName} to start counting.`;
  else if (note) text = note;
  else if (here) text = `You're on ${provider.hostName} — this fills in as soon as the page reports.`;
  else if (provider.hasApi) text = 'Waiting for the first background read.';
  else text = `Open ${provider.hostName} in a tab to read its meters.`;
  wrap.append(el('p', 'empty-text', text));

  const button = el('button', 'btn', here ? 'Read this tab' : `Open ${provider.hostName}`);
  button.type = 'button';
  if (here) button.dataset.refreshSite = provider.id;
  else button.dataset.open = provider.id;
  wrap.append(button);
  return wrap;
}

function detail(provider, record) {
  const wrap = el('div', 'pdetail');

  if (record && record.windows && record.windows.length) {
    const list = el('div', 'windows');
    for (const window of record.windows.slice(0, 4)) list.append(windowRow(window));
    wrap.append(list);

    const note = record.notes && record.notes[0];
    if (note) wrap.append(el('p', 'note', note));
  } else {
    wrap.append(emptyBlock(provider, record));
  }

  const points = state.history[provider.id] || [];
  if (settings.showHistory && points.length > 1) wrap.append(trendChart(points));

  if (record && record.detectedAt) {
    const meta = [`Checked ${ago(record.detectedAt)}`];
    if (record.source === 'page') meta.push('read from the page');
    else if (record.via === 'background') meta.push('read in the background');
    if (state.active && state.active.id === provider.id) meta.push('this tab');
    wrap.append(el('p', 'card-foot', meta.join(' · ')));
  }

  return wrap;
}

function providerRow(provider) {
  const record = state.records[provider.id] || null;
  const here = Boolean(state.active && state.active.id === provider.id);
  const open = expanded.has(provider.id);

  const section = el('section', `provider${here ? ' is-current' : ''}${open ? ' is-open' : ''}`);
  section.style.setProperty('--accent', provider.accent);
  section.dataset.provider = provider.id;

  const row = el('button', 'prow');
  row.type = 'button';
  row.dataset.toggle = provider.id;
  row.setAttribute('aria-expanded', String(open));

  row.append(el('span', 'pmark', provider.mark));

  const main = el('span', 'pmain');
  const name = el('span', 'pname');
  name.append(el('span', null, provider.name));
  const plan = planLine(record);
  if (plan) name.append(el('span', 'pplan', plan));
  main.append(name);

  const remaining = worstRemaining(record);
  if (remaining != null) {
    const bar = el('span', 'pbar');
    const fill = el('i', severity(100 - remaining));
    fill.style.width = `${Math.min(100, Math.max(0, remaining))}%`;
    bar.append(fill);
    main.append(bar);
  }

  row.append(main, pill(record), el('span', 'chev', '›'));
  section.append(row);

  if (open) section.append(detail(provider, record));
  return section;
}

function renderList() {
  const root = document.getElementById('providers');
  if (!root) return;
  root.textContent = '';

  const providers = enabledProviders();
  const activeId = state.active && state.active.id;

  const visible = providers.filter((provider) => state.records[provider.id] || provider.id === activeId);
  /* "Only sites with numbers" hides the idle rows; otherwise, with nothing read
     yet, list a first handful and keep the rest behind the toggle. */
  const primary = visible.length || settings.hideIdleSites ? visible : providers.slice(0, 8);
  const rest = providers.filter((provider) => !primary.includes(provider));

  for (const provider of primary) root.append(providerRow(provider));

  if (rest.length) {
    const more = el(
      'button',
      'more',
      state.showAll ? `Hide ${rest.length} other site${rest.length === 1 ? '' : 's'}` : `Show ${rest.length} more site${rest.length === 1 ? '' : 's'}`
    );
    more.type = 'button';
    more.dataset.more = '1';
    root.append(more);

    if (state.showAll) for (const provider of rest) root.append(providerRow(provider));
  }
}

function renderFoot() {
  const text = document.getElementById('foot-text');
  const button = document.getElementById('open-active');
  if (!text || !button) return;

  const providers = enabledProviders();
  const withNumbers = providers.filter((provider) => {
    const record = state.records[provider.id];
    return Boolean(record && record.windows && record.windows.length);
  });

  text.textContent = withNumbers.length
    ? `${withNumbers.length} of ${providers.length} sites with numbers`
    : `${providers.length} AI sites tracked`;

  const active = state.active;
  button.hidden = !active;
  if (active) {
    button.dataset.open = active.id;
    button.textContent = `Open ${active.hostName}`;
  }
}

function subtitle() {
  const stamps = enabledProviders()
    .map((provider) => state.records[provider.id] && state.records[provider.id].detectedAt)
    .filter(Boolean);
  if (!stamps.length) return `${enabledProviders().length} AI sites tracked`;
  return `Updated ${ago(Math.max(...stamps))}`;
}

function render() {
  renderDetect();
  renderOverview();
  renderList();
  renderFoot();

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

  const providers = enabledProviders();
  const keys = providers.flatMap((provider) => [`usage:${provider.id}`, `history:${provider.id}`]);
  const stored = await chrome.storage.local.get(keys);

  for (const provider of providers) {
    state.records[provider.id] = stored[`usage:${provider.id}`] || null;
    const history = stored[`history:${provider.id}`];
    state.history[provider.id] = Array.isArray(history) ? history : [];
  }

  render();
}

/* Opening the popup while a site tab is open should show numbers right away. */
async function refreshIfEmpty() {
  const target = state.active ? state.active.id : null;
  if (target && state.records[target]) return;
  if (enabledProviders().every((provider) => state.records[provider.id])) return;
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
    flash('Install the extension to read usage from your AI sites.');
    return;
  }

  button.classList.add('is-busy');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'usage:refresh', provider });
    if (!result || !result.ok) {
      flash('No tab open for that site yet — open it, sign in, then refresh.');
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

  const toggler = target.closest('[data-toggle]');
  if (toggler) {
    const id = toggler.dataset.toggle;
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    render();
    return;
  }

  const more = target.closest('[data-more]');
  if (more) {
    state.showAll = !state.showAll;
    render();
    return;
  }

  const opener = target.closest('[data-open]');
  if (opener) {
    const provider = Sites.byId(opener.dataset.open);
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
    else window.open('../options/options.html', '_blank', 'noopener');
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

  // The settings page writes to localStorage; follow changes made there.
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === 'usage-detector:settings') load();
  });
  load();
}

render();
setInterval(render, 30000);
