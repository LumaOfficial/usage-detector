const EXT = '/extension/';

const FILES = [
  'manifest.json',
  'background/service-worker.js',
  'lib/usage.js',
  'lib/store.js',
  'shared/defaults.js',
  'shared/api.js',
  'shared/demo.js',
  'shared/theme.css',
  'popup/popup.html',
  'popup/popup.css',
  'popup/popup.js',
  'options/options.html',
  'options/options.css',
  'options/options.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

const TEXT_FILE = /\.(js|json|html|css|md|txt)$/;

async function loadFile(path) {
  try {
    const response = await fetch(EXT + path, { cache: 'no-store' });
    if (!response.ok) return { path, ok: false, size: 0, text: '' };
    const buffer = await response.arrayBuffer();
    return {
      path,
      ok: true,
      size: buffer.byteLength,
      text: TEXT_FILE.test(path) ? new TextDecoder().decode(buffer) : '',
    };
  } catch {
    return { path, ok: false, size: 0, text: '' };
  }
}

function normalizeRef(fromPath, ref) {
  const base = new URL(`http://local/${fromPath}`);
  return new URL(ref, base).pathname.replace(/^\//, '');
}

function collectRefs(manifest, files) {
  const refs = new Set();
  const add = (value) => {
    if (typeof value === 'string' && value) refs.add(value.replace(/^\//, ''));
  };

  add(manifest.background?.service_worker);
  add(manifest.action?.default_popup);
  add(manifest.options_ui?.page);
  if (typeof manifest.action?.default_icon === 'string') add(manifest.action.default_icon);
  Object.values(manifest.icons || {}).forEach(add);
  Object.values(manifest.action?.default_icon || {}).forEach(add);

  Object.entries(files).forEach(([path, file]) => {
    if (!file.text) return;

    if (path.endsWith('.html')) {
      for (const match of file.text.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const value = match[1];
        if (/^(#|data:|https?:|mailto:)/.test(value)) continue;
        refs.add(normalizeRef(path, value));
      }
    }

    if (path.endsWith('.js')) {
      for (const match of file.text.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        refs.add(normalizeRef(path, match[1]));
      }
      for (const match of file.text.matchAll(/import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
        refs.add(normalizeRef(path, match[1]));
      }
    }
  });

  return [...refs];
}

function audit(manifest, files) {
  const checks = [];
  const add = (ok, title, detail) => checks.push({ ok, title, detail });

  add(manifest.manifest_version === 3, 'Manifest version 3', `manifest_version = ${manifest.manifest_version}`);

  add(
    Boolean(manifest.background?.service_worker),
    'Background runs as a service worker',
    manifest.background?.service_worker || 'background.service_worker is missing',
  );

  add(
    !manifest.background?.scripts && !manifest.background?.page,
    'No Manifest V2 background page or scripts',
    manifest.background?.scripts ? 'background.scripts is present' : 'background.scripts and background.page are absent',
  );

  add(
    manifest.background?.type === 'module',
    'Service worker uses ES modules',
    manifest.background?.type === 'module' ? 'type: "module"' : 'type is not "module"',
  );

  const popup = manifest.action?.default_popup;
  add(Boolean(popup) && Boolean(files[popup]?.ok), 'Toolbar popup is packaged', popup || 'missing');

  const optionsPage = manifest.options_ui?.page;
  add(Boolean(optionsPage) && Boolean(files[optionsPage]?.ok), 'Settings page is packaged', optionsPage || 'missing');

  const csp = manifest.content_security_policy;
  add(
    Boolean(csp) && typeof csp === 'object' && typeof csp.extension_pages === 'string',
    'CSP uses the MV3 object form',
    csp ? JSON.stringify(csp) : 'not declared',
  );

  const cspValue = csp && typeof csp === 'object' ? csp.extension_pages || '' : String(csp || '');
  add(
    !/unsafe-eval|unsafe-inline|https?:\/\//.test(cspValue),
    'CSP blocks eval and remote code',
    cspValue || 'default MV3 CSP',
  );

  add(
    Array.isArray(manifest.host_permissions) && manifest.host_permissions.length === 0,
    'No remote host permissions',
    Array.isArray(manifest.host_permissions) && manifest.host_permissions.length === 0
      ? 'host_permissions: []'
      : `host_permissions: ${JSON.stringify(manifest.host_permissions || [])}`,
  );

  add(
    !('browser_action' in manifest) && !('page_action' in manifest),
    'No Manifest V2 action keys',
    'browser_action and page_action are absent',
  );

  add(
    !manifest.web_accessible_resources || manifest.web_accessible_resources.length === 0,
    'Nothing exposed to web pages',
    'web_accessible_resources is empty',
  );

  const refs = collectRefs(manifest, files);
  const missingRefs = refs.filter((ref) => !files[ref]?.ok);
  add(
    missingRefs.length === 0,
    `All ${refs.length} referenced files ship in the package`,
    missingRefs.length
      ? `missing: ${missingRefs.join(', ')}`
      : 'popup, settings, worker, modules, styles and icons all resolve inside extension/',
  );

  const htmlIssues = [];
  ['popup/popup.html', 'options/options.html'].forEach((path) => {
    const text = files[path]?.text || '';
    if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(text)) htmlIssues.push(`${path}: inline <script>`);
    if (/\son[a-z]+\s*=/i.test(text)) htmlIssues.push(`${path}: inline event handler`);
    if (/<script[^>]+src="https?:/i.test(text)) htmlIssues.push(`${path}: remote script`);
  });
  add(
    htmlIssues.length === 0,
    'Pages use external scripts only',
    htmlIssues.join('; ') || 'no inline scripts, inline handlers or remote tags',
  );

  const jsIssues = [];
  Object.entries(files).forEach(([path, file]) => {
    if (!path.endsWith('.js') || !file.text) return;
    if (/\beval\s*\(/.test(file.text)) jsIssues.push(`${path}: eval()`);
    if (/\bnew\s+Function\s*\(/.test(file.text)) jsIssues.push(`${path}: new Function()`);
    if (/\bimport\s*\(\s*['"]https?:/.test(file.text)) jsIssues.push(`${path}: remote import`);
  });
  add(
    jsIssues.length === 0,
    'No eval or remote imports in any script',
    jsIssues.join('; ') || 'every module resolves locally',
  );

  const missingIcons = ['16', '32', '48', '128'].filter((size) => !files[`icons/icon${size}.png`]?.ok);
  add(
    missingIcons.length === 0,
    'Toolbar and store icons present',
    missingIcons.length ? `missing ${missingIcons.join(', ')}` : '16 / 32 / 48 / 128 px',
  );

  return checks;
}

function renderChecks(checks) {
  const list = document.getElementById('auditList');
  const summary = document.getElementById('auditSummary');
  const failed = checks.filter((check) => !check.ok).length;

  summary.textContent = failed === 0 ? `${checks.length} / ${checks.length} checks passed` : `${failed} failing`;
  summary.classList.toggle('is-bad', failed > 0);
  list.innerHTML = '';

  checks.forEach((check) => {
    const item = document.createElement('li');
    item.className = `pv-check ${check.ok ? 'pv-pass' : 'pv-fail'}`;

    const mark = document.createElement('span');
    mark.className = 'pv-mark';
    mark.textContent = check.ok ? '✓' : '!';

    const body = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'pv-check-title';
    title.textContent = check.title;
    const detail = document.createElement('p');
    detail.className = 'pv-check-detail';
    detail.textContent = check.detail;
    body.append(title, detail);

    item.append(mark, body);
    list.appendChild(item);
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function renderFiles(files) {
  const list = document.getElementById('fileList');
  const paths = [...new Set([...FILES, ...Object.keys(files)])].sort();
  let total = 0;
  let present = 0;
  list.innerHTML = '';

  paths.forEach((path) => {
    const file = files[path];
    const item = document.createElement('li');
    item.className = `pv-file${file?.ok ? '' : ' is-missing'}`;

    const name = document.createElement('span');
    name.textContent = file?.ok ? path : `${path} — missing`;

    const size = document.createElement('span');
    size.className = 'pv-file-size';
    size.textContent = file?.ok ? formatSize(file.size) : '—';

    if (file?.ok) {
      total += file.size;
      present += 1;
    }

    item.append(name, size);
    list.appendChild(item);
  });

  document.getElementById('pkgSize').textContent = `${present} files · ${formatSize(total)}`;
}

async function main() {
  const loaded = await Promise.all(FILES.map(loadFile));
  const files = Object.fromEntries(loaded.map((file) => [file.path, file]));

  const manifestFile = files['manifest.json'];
  let manifest = null;
  try {
    manifest = JSON.parse(manifestFile.text);
  } catch {
    manifest = null;
  }

  if (!manifest) {
    document.getElementById('auditSummary').textContent = 'manifest.json could not be read';
    document.getElementById('auditSummary').classList.add('is-bad');
    return;
  }

  const refs = collectRefs(manifest, files);
  const unknown = refs.filter((ref) => !files[ref]);
  if (unknown.length) {
    const extra = await Promise.all(unknown.map(loadFile));
    extra.forEach((file) => {
      files[file.path] = file;
    });
  }

  renderChecks(audit(manifest, files));
  renderFiles(files);
  document.getElementById('manifestSource').textContent = JSON.stringify(manifest, null, 2);
}

window.addEventListener('message', (event) => {
  if (event.data?.type !== 'ud:open-options') return;
  const card = document.getElementById('settingsCard');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('is-flash');
  setTimeout(() => card.classList.remove('is-flash'), 1200);
});

main();
