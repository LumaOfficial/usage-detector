// Preview harness: renders the extension's real panel and settings pages,
// backed by a small chrome.storage stand-in with sample AI usage.

const SAMPLE_USAGE = {
  [new Date().toISOString().slice(0, 10)]: {
    "chatgpt.com": 2400,
    "claude.ai": 1500,
    "gemini.google.com": 600,
  },
};

const SHIM = `
  (function () {
    const state = {
      usage: ${JSON.stringify(SAMPLE_USAGE)},
      enabled: true,
      budget: 100,
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
  const html = await response.text();
  frame.srcdoc = html.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="/"><script>${SHIM}<\/script>`
  );
}

renderFrame(document.getElementById("popup-frame"), "/popup.html").catch(() => {});
renderFrame(document.getElementById("options-frame"), "/options.html").catch(() => {});
