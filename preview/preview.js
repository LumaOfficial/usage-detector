// Preview harness: renders the real popup.html and options.html in iframes,
// backed by a small chrome.storage stand-in with sample data.

const SAMPLE_USAGE = {
  [new Date().toISOString().slice(0, 10)]: {
    "github.com": 1452,
    "news.ycombinator.com": 642,
    "developer.chrome.com": 318,
  },
};

const SHIM = `
  (function () {
    const state = {
      usage: ${JSON.stringify(SAMPLE_USAGE)},
      enabled: true,
    };
    window.chrome = {
      storage: {
        local: {
          get(keys) {
            const out = {};
            if (keys == null) return Promise.resolve({ ...state });
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              if (key in state) out[key] = state[key];
            }
            return Promise.resolve(out);
          },
          set(values) {
            Object.assign(state, values);
            return Promise.resolve();
          },
          remove(keys) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
            return Promise.resolve();
          },
        },
      },
    };
  })();
`;

async function renderFrame(frame, page) {
  const response = await fetch(page, { cache: "no-store" });
  if (!response.ok) throw new Error(`${page}: ${response.status}`);
  let html = await response.text();
  html = html.replace(/<head([^>]*)>/i, `<head$1><base href="/"><script>${SHIM}<\/script>`);
  frame.srcdoc = html;
}

async function renderManifest() {
  const rows = document.getElementById("manifest-rows");
  const chips = document.getElementById("manifest-chips");
  try {
    const manifest = await (await fetch("/manifest.json", { cache: "no-store" })).json();
    const entries = [
      ["Name", manifest.name],
      ["Version", manifest.version],
      ["Manifest version", manifest.manifest_version],
      ["Service worker", manifest.background && manifest.background.service_worker],
      ["Popup", manifest.action && manifest.action.default_popup],
      ["Options page", manifest.options_ui && manifest.options_ui.page],
    ];
    for (const [label, value] of entries) {
      if (value == null) continue;
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      const val = document.createElement("span");
      name.textContent = label;
      val.textContent = value;
      row.append(name, val);
      rows.append(row);
    }
    for (const permission of manifest.permissions || []) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = permission;
      chips.append(chip);
    }
  } catch (error) {
    rows.textContent = "Manifest could not be read.";
  }
}

renderFrame(document.getElementById("popup-frame"), "/popup.html").catch(() => {});
renderFrame(document.getElementById("options-frame"), "/options.html").catch(() => {});
renderManifest();
