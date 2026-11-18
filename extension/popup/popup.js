/* Usage Detector popup. Runs inside the extension, and standalone in the preview
   page, where the parent frame feeds it sample data. */

const PROVIDERS = [
  { id: 'claude', name: 'Claude', mark: 'C', host: 'https://claude.ai', hostName: 'claude.ai' },
  { id: 'chatgpt', name: 'ChatGPT', mark: 'G', host: 'https://chatgpt.com', hostName: 'chatgpt.com' },
];

const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);

const MINUTE = 60000;
const HOUR = 3600000;
const DAY = 86400000;

const state = { claude: null, chatgpt: null };

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
    const hours = Math.floor(diff / HOUR);
    const minutes = Math.round((diff % HOUR) / MINUTE);
    return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  return `${Math.round(diff / DAY)} days`;
}

function severity(usedPercent) {
  if (usedPercent >= 100) return 'bad';
  if (usedPercent >= 85) return 'warn';
  return 'ok';
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
  if (remaining <= 15) return el('span', 'pill pill--warn', `${rounded}% left`);
  return el('span', 'pill pill--ok', `${rounded}% left`);
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

function emptyBlock(provider, record) {
  const wrap = el('div', 'empty');
  const signedOut = record && record.status === 'signed-out';
  const note = record && record.notes && record.notes[0];

  const text = signedOut
    ? `Sign in to ${provider.hostName} to start tracking.`
    : note || `Open ${provider.hostName} once — the extension reads your usage from the page.`;
  wrap.append(el('p', 'empty-text', text));

  const button = el('button', 'btn', `Open ${provider.hostName}`);
  button.type = 'button';
  button.dataset.open = provider.id;
  wrap.append(button);
  return wrap;
}

function card(provider, record) {
  const section = el('section', `card card--${provider.id}`);

  const head = el('div', 'card-head');
  head.append(el('span', 'mark', provider.mark));

  const who = el('div', 'who');
  who.append(el('h2', null, provider.name));
  who.append(el('p', 'plan', record && record.plan ? `${record.plan} plan` : 'Plan not detected'));
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

  return section;
}

function subtitle() {
  const stamps = PROVIDERS.map((provider) => state[provider.id] && state[provider.id].detectedAt).filter(Boolean);
  if (!stamps.length) return 'Claude & ChatGPT limits';
  return `Updated ${ago(Math.max(...stamps))}`;
}

function render() {
  const root = document.getElementById('providers');
  if (!root) return;
  root.textContent = '';
  for (const provider of PROVIDERS) root.append(card(provider, state[provider.id]));

  const line = document.getElementById('subtitle');
  if (line) line.textContent = subtitle();
}

async function load() {
  const keys = PROVIDERS.map((provider) => `usage:${provider.id}`);
  const stored = await chrome.storage.local.get(keys);
  for (const provider of PROVIDERS) state[provider.id] = stored[`usage:${provider.id}`] || null;
  render();
}

function refresh(button) {
  button.classList.add('is-busy');
  if (isExtension) {
    chrome.runtime
      .sendMessage({ type: 'usage:refresh' })
      .catch(() => {})
      .then(() => setTimeout(() => {
        button.classList.remove('is-busy');
        load();
      }, 1800));
    return;
  }
  parent.postMessage({ type: 'usage:demo-request' }, '*');
  setTimeout(() => button.classList.remove('is-busy'), 600);
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const opener = target.closest('[data-open]');
  if (opener) {
    const provider = PROVIDERS.find((item) => item.id === opener.dataset.open);
    if (provider && isExtension) chrome.tabs.create({ url: provider.host });
    return;
  }

  const refreshButton = target.closest('#refresh');
  if (refreshButton) refresh(refreshButton);
});

if (isExtension) {
  load();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.keys(changes).some((key) => key.startsWith('usage:'))) load();
  });
} else {
  document.body.classList.add('is-embedded');
  render();
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || message.type !== 'usage:demo') return;
    state.claude = (message.data && message.data.claude) || null;
    state.chatgpt = (message.data && message.data.chatgpt) || null;
    render();
  });
  parent.postMessage({ type: 'usage:demo-ready' }, '*');
}

setInterval(render, 30000);
