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
    {
      id: 'qwen',
      name: 'Qwen',
      mark: 'QW',
      host: 'https://chat.qwen.ai',
      hostName: 'chat.qwen.ai',
      hosts: ['chat.qwen.ai', 'qwen.ai'],
      accent: '#615ced',
    },
    {
      id: 'kimi',
      name: 'Kimi',
      mark: 'KI',
      host: 'https://www.kimi.com',
      hostName: 'kimi.com',
      hosts: ['kimi.com', 'www.kimi.com'],
      accent: '#4cc9f0',
    },
    {
      id: 'base44',
      name: 'Base 1',
      mark: 'B1',
      host: 'https://chat.base44.com',
      hostName: 'chat.base44.com',
      hosts: ['chat.base44.com', 'base44.com'],
      accent: '#3b82f6',
    },
    {
      id: 'you',
      name: 'You.com',
      mark: 'YO',
      host: 'https://you.com',
      hostName: 'you.com',
      hosts: ['you.com', 'www.you.com'],
      accent: '#7b61ff',
    },
    {
      id: 'huggingchat',
      name: 'HuggingChat',
      mark: 'HC',
      host: 'https://huggingface.co/chat',
      hostName: 'huggingface.co',
      hosts: ['huggingface.co'],
      accent: '#ffd166',
    },
    {
      id: 'pi',
      name: 'Pi',
      mark: 'PI',
      host: 'https://pi.ai',
      hostName: 'pi.ai',
      hosts: ['pi.ai', 'www.pi.ai'],
      accent: '#d4a373',
    },
    {
      id: 'sider',
      name: 'Sider',
      mark: 'SI',
      host: 'https://sider.ai',
      hostName: 'sider.ai',
      hosts: ['sider.ai', 'www.sider.ai'],
      accent: '#ff9f43',
    },
    {
      id: 'monica',
      name: 'Monica',
      mark: 'MO',
      host: 'https://monica.im',
      hostName: 'monica.im',
      hosts: ['monica.im', 'www.monica.im'],
      accent: '#7c6cff',
    },
    {
      id: 'merlin',
      name: 'Merlin',
      mark: 'ME',
      host: 'https://www.getmerlin.in',
      hostName: 'getmerlin.in',
      hosts: ['getmerlin.in', 'www.getmerlin.in'],
      accent: '#57c7ff',
    },
    {
      id: 'maxai',
      name: 'MaxAI',
      mark: 'MX',
      host: 'https://www.maxai.me',
      hostName: 'maxai.me',
      hosts: ['maxai.me', 'www.maxai.me'],
      accent: '#ff6f91',
    },
    {
      id: 'harpa',
      name: 'Harpa',
      mark: 'HP',
      host: 'https://harpa.ai',
      hostName: 'harpa.ai',
      hosts: ['harpa.ai', 'www.harpa.ai'],
      accent: '#8bd17c',
    },
    {
      id: 'chathub',
      name: 'ChatHub',
      mark: 'CH',
      host: 'https://chathub.gg',
      hostName: 'chathub.gg',
      hosts: ['chathub.gg', 'www.chathub.gg'],
      accent: '#9aa7ff',
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
