/* Loads the extension's shared scripts into an isolated VM context, with just
   enough of a DOM to exercise the page readers. No browser, no dependencies —
   `node --test tests/` is the whole harness. */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXTENSION_DIR = path.resolve(__dirname, '../../extension');

const createChromeStub = () => ({
  runtime: {
    id: 'test',
    lastError: null,
    sendMessage: () => {},
    onMessage: { addListener: () => {} },
  },
  storage: {
    local: { get: async () => ({}), set: async () => {} },
    onChanged: { addListener: () => {} },
  },
});

const element = (tag, attributes = {}, extra = {}) => {
  const node = {
    tagName: tag.toUpperCase(),
    textContent: extra.textContent || '',
    innerText: extra.innerText || '',
    previousElementSibling: extra.previousElementSibling || null,
    parentElement: extra.parentElement || null,
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    hasAttribute: (name) => name in attributes,
  };
  if ('value' in extra) node.value = extra.value;
  if ('max' in extra) node.max = extra.max;
  return node;
};

/* A page stub: `text` is what the body prints, `meters` are the bars it draws.
   A meter may be labelled with aria-label, aria-labelledby, a sibling line or
   its parent's first line — the four ways the real reader finds a label. */
const createDocument = (spec = {}) => {
  const byId = new Map();
  const nodes = [];

  for (const meter of spec.meters || []) {
    const attributes = { role: meter.role || 'progressbar' };
    if (meter.label) attributes['aria-label'] = meter.label;
    if (meter.now != null) attributes['aria-valuenow'] = String(meter.now);
    if (meter.max != null) attributes['aria-valuemax'] = String(meter.max);
    if (meter.labelledBy) attributes['aria-labelledby'] = 'label-for-meter';

    const extra = { value: meter.value, max: meter.maxValue, textContent: meter.textContent || '' };
    if (meter.labelledBy) {
      byId.set('label-for-meter', element('span', {}, { textContent: meter.labelledBy }));
    }
    if (meter.sibling) extra.previousElementSibling = element('div', {}, { textContent: meter.sibling });
    if (meter.parentText) extra.parentElement = element('div', {}, { innerText: meter.parentText });
    nodes.push(element(meter.tag || 'div', attributes, extra));
  }

  const text = spec.text || '';
  return {
    body: { innerText: text },
    documentElement: { innerText: text },
    querySelectorAll: () => nodes,
    getElementById: (id) => byId.get(id) || null,
  };
};

const loadExtension = () => {
  const sandbox = {
    console,
    URL,
    Date,
    Math,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    location: { href: 'https://example.com/' },
  };
  sandbox.chrome = createChromeStub();
  vm.createContext(sandbox);

  for (const file of ['sites.js', 'readers.js', 'content/common.js']) {
    vm.runInContext(fs.readFileSync(path.join(EXTENSION_DIR, file), 'utf8'), sandbox, { filename: file });
  }

  const readers = sandbox.UsageDetectorReaders;
  const sites = sandbox.UsageDetectorSites;
  const content = sandbox.__usageDetector;
  if (!readers || !sites || !content) throw new Error('extension scripts did not register their namespaces');

  return {
    readers,
    sites,
    content,
    readPage: (spec) => {
      sandbox.document = createDocument(spec);
      return content.genericPage();
    },
    readMeters: (spec) => {
      sandbox.document = createDocument(spec);
      return content.pageMeters();
    },
  };
};

module.exports = { loadExtension, createDocument };
