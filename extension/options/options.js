import { dayKey } from '../lib/usage.js';
import { getVersion, request } from '../shared/api.js';

const el = {
  versionChip: document.getElementById('versionChip'),
  footVersion: document.getElementById('footVersion'),
  trackingToggle: document.getElementById('trackingToggle'),
  idleSelect: document.getElementById('idleSelect'),
  retentionSelect: document.getElementById('retentionSelect'),
  ignoreList: document.getElementById('ignoreList'),
  ignoreHint: document.getElementById('ignoreHint'),
  storageInfo: document.getElementById('storageInfo'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importInput: document.getElementById('importInput'),
  resetBtn: document.getElementById('resetBtn'),
  resetDialog: document.getElementById('resetDialog'),
  cancelReset: document.getElementById('cancelReset'),
  confirmReset: document.getElementById('confirmReset'),
  toast: document.getElementById('toast'),
};

let ignoreTimer = null;
let toastTimer = null;

function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2200);
}

function applySettings(settings) {
  el.trackingToggle.checked = settings.trackingEnabled;
  el.idleSelect.value = String(settings.idleSeconds);
  el.retentionSelect.value = String(settings.retentionDays);
  if (document.activeElement !== el.ignoreList) {
    el.ignoreList.value = settings.ignore.join('\n');
  }
}

async function refreshStorageInfo() {
  try {
    const info = await request('storage:info');
    const size = info.bytes < 1024 ? `${info.bytes} B` : `${(info.bytes / 1024).toFixed(1)} KB`;
    el.storageInfo.textContent = `${info.days} day${info.days === 1 ? '' : 's'} stored · ${size} of local browser storage`;
  } catch {
    el.storageInfo.textContent = 'Storage information unavailable.';
  }
}

async function save(patch, message = 'Saved') {
  try {
    const response = await request('settings:update', patch);
    applySettings(response.settings);
    showToast(message);
    await refreshStorageInfo();
  } catch (error) {
    showToast(error?.message || 'Could not save');
  }
}

el.trackingToggle.addEventListener('change', () => {
  save({ trackingEnabled: el.trackingToggle.checked }, el.trackingToggle.checked ? 'Tracking on' : 'Tracking paused');
});

el.idleSelect.addEventListener('change', () => {
  save({ idleSeconds: Number(el.idleSelect.value) });
});

el.retentionSelect.addEventListener('change', () => {
  save({ retentionDays: Number(el.retentionSelect.value) });
});

el.ignoreList.addEventListener('input', () => {
  clearTimeout(ignoreTimer);
  el.ignoreHint.textContent = 'Saving…';
  ignoreTimer = setTimeout(async () => {
    await save({ ignore: el.ignoreList.value.split('\n') }, 'Ignored sites saved');
    el.ignoreHint.textContent = 'Changes save automatically.';
  }, 600);
});

el.exportBtn.addEventListener('click', async () => {
  try {
    const response = await request('data:export');
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usage-detector-${dayKey()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast('Export ready');
  } catch (error) {
    showToast(error?.message || 'Export failed');
  }
});

el.importBtn.addEventListener('click', () => {
  el.importInput.click();
});

el.importInput.addEventListener('change', async () => {
  const file = el.importInput.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const response = await request('data:import', { data: parsed });
    showToast(`Imported ${response.days} day${response.days === 1 ? '' : 's'}`);
    await refreshStorageInfo();
  } catch (error) {
    showToast(error?.message || 'That file could not be imported');
  } finally {
    el.importInput.value = '';
  }
});

el.resetBtn.addEventListener('click', () => {
  el.resetDialog.showModal();
});

el.cancelReset.addEventListener('click', () => {
  el.resetDialog.close();
});

el.confirmReset.addEventListener('click', async () => {
  el.resetDialog.close();
  try {
    await request('data:reset');
    showToast('All usage data deleted');
    await refreshStorageInfo();
  } catch (error) {
    showToast(error?.message || 'Could not delete data');
  }
});

async function init() {
  try {
    const [settingsResponse, version] = await Promise.all([request('settings:get'), getVersion()]);
    applySettings(settingsResponse.settings);
    el.versionChip.textContent = `v${version}`;
    el.footVersion.textContent = `v${version}`;
    await refreshStorageInfo();
  } catch (error) {
    showToast(error?.message || 'Could not load settings');
  }
}

init();
