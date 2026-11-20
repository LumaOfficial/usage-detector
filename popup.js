// Popup: shows today's per-site usage from chrome.storage.local.

const list = document.getElementById("list");
const empty = document.getElementById("empty");

function format(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

async function render() {
  const { usage = {} } = await chrome.storage.local.get("usage");
  const today = new Date().toISOString().slice(0, 10);
  const entries = Object.entries(usage[today] || {}).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    empty.hidden = false;
    return;
  }

  for (const [host, seconds] of entries) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    const time = document.createElement("span");
    name.textContent = host;
    time.textContent = format(seconds);
    li.append(name, time);
    list.append(li);
  }
}

render();
