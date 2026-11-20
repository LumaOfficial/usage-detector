// Popup: today's AI credit usage per provider.

const PROVIDERS = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "claude.ai": "Claude",
  "gemini.google.com": "Gemini",
  "copilot.microsoft.com": "Copilot",
  "perplexity.ai": "Perplexity",
  "grok.com": "Grok",
  "poe.com": "Poe",
};

const CREDITS_PER_MINUTE = 1;

const list = document.getElementById("list");
const total = document.getElementById("total");
const empty = document.getElementById("empty");

function labelFor(host) {
  const domain = Object.keys(PROVIDERS).find((d) => host === d || host.endsWith(`.${d}`));
  return domain ? PROVIDERS[domain] : host;
}

function toCredits(seconds) {
  return (seconds / 60) * CREDITS_PER_MINUTE;
}

function formatCredits(credits) {
  return credits >= 10 ? `${Math.round(credits)} credits` : `${credits.toFixed(1)} credits`;
}

async function render() {
  const { usage = {}, budget = 0 } = await chrome.storage.local.get(["usage", "budget"]);
  const today = new Date().toISOString().slice(0, 10);

  const perProvider = {};
  for (const [host, seconds] of Object.entries(usage[today] || {})) {
    const label = labelFor(host);
    perProvider[label] = (perProvider[label] || 0) + seconds;
  }

  const entries = Object.entries(perProvider)
    .map(([label, seconds]) => [label, toCredits(seconds)])
    .sort((a, b) => b[1] - a[1]);

  const used = entries.reduce((sum, [, credits]) => sum + credits, 0);
  total.textContent = budget > 0
    ? `${formatCredits(used)} of ${budget} used`
    : `${formatCredits(used)} used`;

  if (entries.length === 0) {
    empty.hidden = false;
    return;
  }

  for (const [label, credits] of entries) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    const value = document.createElement("span");
    name.textContent = label;
    value.textContent = formatCredits(credits);
    li.append(name, value);
    list.append(li);
  }
}

render();
