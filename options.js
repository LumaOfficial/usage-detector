// Options page: toggle tracking and clear stored data.

const enabledInput = document.getElementById("enabled");
const clearButton = document.getElementById("clear");
const status = document.getElementById("status");

async function init() {
  const { enabled } = await chrome.storage.local.get("enabled");
  enabledInput.checked = enabled !== false;
}

enabledInput.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: enabledInput.checked });
  status.textContent = enabledInput.checked ? "Tracking enabled." : "Tracking disabled.";
});

clearButton.addEventListener("click", async () => {
  await chrome.storage.local.remove("usage");
  status.textContent = "Recorded usage cleared.";
});

init();
