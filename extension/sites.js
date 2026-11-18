/* Usage Detector — the site detector.
   One list of the sites the extension understands, shared by the background
   worker, the content scripts, the popup and the preview page. */

(() => {
  const SITES = [
    {
      id: 'claude',
      name: 'Claude',
      host: 'https://claude.ai',
      hostName: 'claude.ai',
      hosts: ['claude.ai'],
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      host: 'https://chatgpt.com',
      hostName: 'chatgpt.com',
      hosts: ['chatgpt.com', 'chat.openai.com'],
    },
  ];

  const IDS = SITES.map((site) => site.id);

  /* Match patterns for tab queries and content-script injection, per provider. */
  const patterns = {};
  for (const site of SITES) patterns[site.id] = site.hosts.map((host) => `https://${host}/*`);

  /* "https://claude.ai/chat/abc" -> the Claude site; anything else -> null. */
  const detect = (url) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return null;
    }
    if (parsed.protocol !== 'https:') return null;

    const hostname = parsed.hostname.toLowerCase();
    for (const site of SITES) {
      if (site.hosts.includes(hostname)) return { ...site, hostname };
    }
    return null;
  };

  const byId = (id) => SITES.find((site) => site.id === id) || null;

  globalThis.UsageDetectorSites = { SITES, IDS, patterns, detect, byId };
})();
