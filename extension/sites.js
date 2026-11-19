/* Usage Detector — the site detector.
   One list of the AI sites the extension understands, shared by the background
   worker, the content scripts, the popup, the settings page and the preview. */

(() => {
  const SITES = [
    {
      id: 'claude',
      name: 'Claude',
      mark: 'CL',
      host: 'https://claude.ai',
      hostName: 'claude.ai',
      hosts: ['claude.ai'],
      accent: '#ff8a6b',
      hasApi: true,
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      mark: 'GP',
      host: 'https://chatgpt.com',
      hostName: 'chatgpt.com',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      accent: '#2fd4a5',
      hasApi: true,
    },
    {
      id: 'gemini',
      name: 'Gemini',
      mark: 'GE',
      host: 'https://gemini.google.com',
      hostName: 'gemini.google.com',
      hosts: ['gemini.google.com'],
      accent: '#6aa2ff',
    },
    {
      id: 'copilot',
      name: 'Copilot',
      mark: 'CP',
      host: 'https://copilot.microsoft.com',
      hostName: 'copilot.microsoft.com',
      hosts: ['copilot.microsoft.com'],
      accent: '#7c5cff',
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      mark: 'PX',
      host: 'https://www.perplexity.ai',
      hostName: 'perplexity.ai',
      hosts: ['perplexity.ai', 'www.perplexity.ai'],
      accent: '#4fd1c5',
    },
    {
      id: 'grok',
      name: 'Grok',
      mark: 'GK',
      host: 'https://grok.com',
      hostName: 'grok.com',
      hosts: ['grok.com'],
      accent: '#c9d1e4',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      mark: 'DS',
      host: 'https://chat.deepseek.com',
      hostName: 'chat.deepseek.com',
      hosts: ['chat.deepseek.com'],
      accent: '#5b8cff',
    },
    {
      id: 'mistral',
      name: 'Mistral',
      mark: 'MI',
      host: 'https://chat.mistral.ai',
      hostName: 'chat.mistral.ai',
      hosts: ['chat.mistral.ai'],
      accent: '#ffb347',
    },
    {
      id: 'poe',
      name: 'Poe',
      mark: 'PO',
      host: 'https://poe.com',
      hostName: 'poe.com',
      hosts: ['poe.com'],
      accent: '#a78bfa',
    },
    {
      id: 'meta',
      name: 'Meta AI',
      mark: 'MA',
      host: 'https://www.meta.ai',
      hostName: 'meta.ai',
      hosts: ['meta.ai', 'www.meta.ai'],
      accent: '#4f7dff',
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
