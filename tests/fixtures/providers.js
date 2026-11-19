/* One page fixture per supported provider — the meters the site draws and the
   usage copy it prints, in the wording that site actually uses. Claude and
   ChatGPT also expose an account API; their payloads are covered in
   tests/readers.test.js. Every other provider is read from its page by design
   (see README "How it reads usage"). */

module.exports = [
  {
    id: 'claude',
    page: {
      text: "You've used 42% of your weekly limit\nResets in 2 hr 14 min",
      meters: [{ label: 'Weekly limit', now: 42, max: 100 }],
    },
    expect: [{ label: 'Weekly limit', usedPercent: 42, resetsAt: 'future' }],
  },
  {
    id: 'chatgpt',
    page: {
      text: '25 of 40 messages used\nResets at 9:00 PM',
      meters: [{ label: 'Messages', now: 25, max: 40 }],
    },
    expect: [{ label: 'Messages', usedPercent: 62.5, resetsAt: 'future' }],
  },
  {
    id: 'gemini',
    page: {
      text: "You've used 30% of your daily limit",
      meters: [{ label: 'Daily limit', now: 30, max: 100 }],
    },
    expect: [{ label: 'Daily limit', usedPercent: 30 }],
  },
  {
    id: 'copilot',
    page: {
      text: '12 of 30 messages used',
      meters: [{ label: 'Messages', now: 12, max: 30 }],
    },
    expect: [{ label: 'Messages', usedPercent: 40 }],
  },
  {
    id: 'perplexity',
    page: {
      text: '120 of 600 searches used',
      meters: [{ label: 'Searches', now: 120, max: 600 }],
    },
    expect: [{ label: 'Searches', usedPercent: 20 }],
  },
  {
    id: 'grok',
    page: { text: '18 messages left', meters: [] },
    expect: [{ label: 'Messages', usedPercent: null, detail: '18 left' }],
  },
  {
    id: 'deepseek',
    page: {
      text: "You've used 12% of your quota",
      meters: [{ label: 'Quota', now: 12, max: 100 }],
    },
    expect: [{ label: 'Quota', usedPercent: 12 }],
  },
  {
    id: 'mistral',
    page: {
      text: '24 of 50 messages used',
      meters: [{ label: 'Messages', now: 24, max: 50 }],
    },
    expect: [{ label: 'Messages', usedPercent: 48 }],
  },
  {
    id: 'poe',
    page: { text: 'Points used', meters: [{ label: 'Points', now: 2480, max: 3000 }] },
    expect: [{ label: 'Points', usedPercent: 82.7 }],
  },
  {
    id: 'meta',
    page: {
      text: "You've used 55% of your daily limit",
      meters: [{ label: 'Daily limit', now: 55, max: 100 }],
    },
    expect: [{ label: 'Daily limit', usedPercent: 55 }],
  },
  {
    id: 'qwen',
    page: {
      text: '8 of 20 messages used',
      meters: [{ label: 'Messages', now: 8, max: 20 }],
    },
    expect: [{ label: 'Messages', usedPercent: 40 }],
  },
  {
    id: 'kimi',
    page: {
      text: 'You have 7 messages left',
      meters: [{ label: 'Messages', now: 3, max: 10 }],
    },
    expect: [
      { label: 'Messages', usedPercent: 30 },
      { label: 'Messages', usedPercent: null, detail: '7 left' },
    ],
  },
  {
    id: 'base44',
    page: {
      text: "You've used 60% of your monthly credits",
      meters: [{ label: 'Monthly credits', now: 60, max: 100 }],
    },
    expect: [{ label: 'Monthly credits', usedPercent: 60 }],
  },
  {
    id: 'you',
    page: {
      text: '5 of 20 queries used',
      meters: [{ label: 'Queries', now: 5, max: 20 }],
    },
    expect: [{ label: 'Queries', usedPercent: 25 }],
  },
  {
    id: 'huggingchat',
    page: { text: '', meters: [{ label: 'Messages', now: 4, max: 12 }] },
    expect: [{ label: 'Messages', usedPercent: 33.3 }],
  },
  {
    id: 'pi',
    page: {
      text: "You've used 25% of your daily limit",
      meters: [{ label: 'Daily limit', now: 25, max: 100 }],
    },
    expect: [{ label: 'Daily limit', usedPercent: 25 }],
  },
  {
    id: 'sider',
    page: {
      text: '18 of 60 credits used',
      meters: [{ label: 'Credits', now: 18, max: 60 }],
    },
    expect: [{ label: 'Credits', usedPercent: 30 }],
  },
  {
    id: 'monica',
    page: {
      text: "You've used 35% of your monthly quota",
      meters: [{ label: 'Monthly quota', now: 35, max: 100 }],
    },
    expect: [{ label: 'Monthly quota', usedPercent: 35 }],
  },
  {
    id: 'merlin',
    page: { text: 'Queries used', meters: [{ label: 'Queries', now: 7, max: 25 }] },
    expect: [{ label: 'Queries', usedPercent: 28 }],
  },
  {
    id: 'maxai',
    page: {
      text: '9 of 30 messages used',
      meters: [{ label: 'Messages', now: 9, max: 30 }],
    },
    expect: [{ label: 'Messages', usedPercent: 30 }],
  },
  {
    id: 'harpa',
    page: {
      text: "You've used 20% of your monthly limit",
      meters: [{ label: 'Monthly limit', now: 20, max: 100 }],
    },
    expect: [{ label: 'Monthly limit', usedPercent: 20 }],
  },
  {
    id: 'chathub',
    page: { text: '', meters: [{ label: 'Messages', now: 11, max: 50 }] },
    expect: [{ label: 'Messages', usedPercent: 22 }],
  },
  {
    id: 't3',
    page: { text: 'You have 12 messages remaining', meters: [] },
    expect: [{ label: 'Messages', usedPercent: null, detail: '12 left' }],
  },
  {
    id: 'duck',
    page: {
      text: '6 of 10 messages used',
      meters: [{ label: 'Messages', now: 6, max: 10 }],
    },
    expect: [{ label: 'Messages', usedPercent: 60 }],
  },
  {
    id: 'lumo',
    page: { text: '', meters: [{ label: 'Messages', now: 2, max: 5 }] },
    expect: [{ label: 'Messages', usedPercent: 40 }],
  },
  {
    id: 'reka',
    page: {
      text: "You've used 40% of your daily quota",
      meters: [{ label: 'Daily quota', now: 40, max: 100 }],
    },
    expect: [{ label: 'Daily quota', usedPercent: 40 }],
  },
  {
    id: 'genspark',
    page: {
      text: '12 of 40 credits used',
      meters: [{ label: 'Credits', now: 12, max: 40 }],
    },
    expect: [{ label: 'Credits', usedPercent: 30 }],
  },
  {
    id: 'felo',
    page: { text: 'Searches used', meters: [{ label: 'Searches', now: 15, max: 50 }] },
    expect: [{ label: 'Searches', usedPercent: 30 }],
  },
  {
    id: 'character',
    page: {
      text: "You've used 70% of your daily limit",
      meters: [{ label: 'Daily limit', now: 70, max: 100 }],
    },
    expect: [{ label: 'Daily limit', usedPercent: 70 }],
  },
  {
    id: 'venice',
    page: {
      text: "You've used 45% of your daily limit",
      meters: [{ label: 'Daily limit', now: 45, max: 100 }],
    },
    expect: [{ label: 'Daily limit', usedPercent: 45 }],
  },
  {
    id: 'phind',
    page: {
      text: '7 of 20 searches used',
      meters: [{ label: 'Searches', now: 7, max: 20 }],
    },
    expect: [{ label: 'Searches', usedPercent: 35 }],
  },
  {
    id: 'openrouter',
    page: {
      text: "You've used 85% of your monthly credits",
      meters: [{ label: 'Monthly credits', now: 85, max: 100 }],
    },
    expect: [{ label: 'Monthly credits', usedPercent: 85 }],
  },
  {
    id: 'groq',
    page: { text: '1,250 tokens remaining', meters: [] },
    expect: [{ label: 'Tokens', usedPercent: null, detail: '1,250 left' }],
  },
  {
    id: 'aistudio',
    page: {
      text: "You've used 33% of your daily limit",
      meters: [{ label: 'Daily limit', now: 33, max: 100 }],
    },
    expect: [{ label: 'Daily limit', usedPercent: 33 }],
  },
  {
    id: 'openai',
    page: {
      text: "You've used 62% of your monthly budget",
      meters: [{ label: 'Monthly budget', now: 62, max: 100 }],
    },
    expect: [{ label: 'Monthly budget', usedPercent: 62 }],
  },
  {
    id: 'anthropic',
    page: {
      text: "You've used 18% of your monthly limit",
      meters: [{ label: 'Monthly limit', now: 18, max: 100 }],
    },
    expect: [{ label: 'Monthly limit', usedPercent: 18 }],
  },
  {
    id: 'fal',
    page: { text: '2,000 credits remaining', meters: [] },
    expect: [{ label: 'Credits', usedPercent: null, detail: '2,000 left' }],
  },
  {
    id: 'cursor',
    page: {
      text: "You've used 75% of your monthly requests",
      meters: [{ label: 'Monthly requests', now: 75, max: 100 }],
    },
    expect: [{ label: 'Monthly requests', usedPercent: 75 }],
  },
  {
    id: 'windsurf',
    page: {
      text: "You've used 12% of your monthly credits",
      meters: [{ label: 'Monthly credits', now: 12, max: 100 }],
    },
    expect: [{ label: 'Monthly credits', usedPercent: 12 }],
  },
  {
    id: 'v0',
    page: {
      text: '3 of 20 messages used',
      meters: [{ label: 'Messages', now: 3, max: 20 }],
    },
    expect: [{ label: 'Messages', usedPercent: 15 }],
  },
  {
    id: 'bolt',
    page: {
      text: "You've used 48% of your monthly limit",
      meters: [{ label: 'Monthly limit', now: 48, max: 100 }],
    },
    expect: [{ label: 'Monthly limit', usedPercent: 48 }],
  },
  {
    id: 'lovable',
    page: {
      text: "You've used 30% of your monthly credits",
      meters: [{ label: 'Monthly credits', now: 30, max: 100 }],
    },
    expect: [{ label: 'Monthly credits', usedPercent: 30 }],
  },
  {
    id: 'devin',
    page: {
      text: "You've used 22% of your weekly quota",
      meters: [{ label: 'Weekly quota', now: 22, max: 100 }],
    },
    expect: [{ label: 'Weekly quota', usedPercent: 22 }],
  },
  {
    id: 'midjourney',
    page: { text: 'Fast hours used', meters: [{ label: 'Fast hours', now: 3.5, max: 10 }] },
    expect: [{ label: 'Fast hours', usedPercent: 35 }],
  },
  {
    id: 'suno',
    page: {
      text: '8 of 50 credits used',
      meters: [{ label: 'Credits', now: 8, max: 50 }],
    },
    expect: [{ label: 'Credits', usedPercent: 16 }],
  },
  {
    id: 'elevenlabs',
    page: {
      text: "You've used 68% of your monthly quota",
      meters: [{ label: 'Monthly quota', now: 68, max: 100 }],
    },
    expect: [{ label: 'Monthly quota', usedPercent: 68 }],
  },
  {
    id: 'leonardo',
    page: {
      text: '2,500 of 8,500 tokens used',
      meters: [{ label: 'Tokens', now: 2500, max: 8500 }],
    },
    expect: [{ label: 'Tokens', usedPercent: 29.4 }],
  },
  {
    id: 'ideogram',
    page: {
      text: '9 of 25 images used',
      meters: [{ label: 'Images', now: 9, max: 25 }],
    },
    expect: [{ label: 'Images', usedPercent: 36 }],
  },
  {
    id: 'runway',
    page: {
      text: "You've used 55% of your monthly credits",
      meters: [{ label: 'Monthly credits', now: 55, max: 100 }],
    },
    expect: [{ label: 'Monthly credits', usedPercent: 55 }],
  },
  {
    id: 'krea',
    page: {
      text: '14 of 40 generations used',
      meters: [{ label: 'Generations', now: 14, max: 40 }],
    },
    expect: [{ label: 'Generations', usedPercent: 35 }],
  },
  {
    id: 'replicate',
    page: {
      text: "You've used 80% of your monthly budget",
      meters: [{ label: 'Monthly budget', now: 80, max: 100 }],
    },
    expect: [{ label: 'Monthly budget', usedPercent: 80 }],
  },
];
