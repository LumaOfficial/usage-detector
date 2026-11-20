const runtime = typeof chrome !== 'undefined' ? chrome.runtime : undefined;

export const isExtension = Boolean(runtime && runtime.id && typeof runtime.sendMessage === 'function');

export async function request(type, payload) {
  if (isExtension) {
    const response = await runtime.sendMessage({ type, payload });
    if (!response) throw new Error('The background worker did not respond.');
    if (response.ok === false) throw new Error(response.error || 'Request failed.');
    return response;
  }
  const { demoRequest } = await import('./demo.js');
  return demoRequest(type, payload);
}

export async function openOptions() {
  if (isExtension && chrome.runtime.openOptionsPage) {
    await chrome.runtime.openOptionsPage();
    return true;
  }
  window.parent?.postMessage({ type: 'ud:open-options' }, '*');
  return false;
}

export async function getVersion() {
  if (isExtension) return chrome.runtime.getManifest().version;
  const response = await fetch('../manifest.json', { cache: 'no-store' });
  const manifest = await response.json();
  return manifest.version || '0.0.0';
}
