// Options page: toggle tracking, set a daily credit budget, clear stored data.

const enabledInput = document.getElementById("enabled");
const budgetInput = document.getElementById("budget");
const clearButton = document.getElementById("clear");
const status = document.getElementById("status");

async function init() {
  const { enabled, budget } = await chrome.storage.local.get(["enabled", "budget"]);
  enabledInput.checked = enabled !== false;
  budgetInput.value = budget || 0;
}

enabledInput.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: enabledInput.checked });
  status.textContent = enabledInput.checked ? "Tracking enabled." : "Tracking disabled.";
});

budgetInput.addEventListener("change", async () => {
  const budget = Math.max(0, Number(budgetInput.value) || 0);
  budgetInput.value = budget;
  await chrome.storage.local.set({ budget });
  status.textContent = budget > 0 ? `Daily budget set to ${budget} credits.` : "No daily budget.";
});

clearButton.addEventListener("click", async () => {
  await chrome.storage.local.remove("usage");
  status.textContent = "Recorded usage cleared.";
});

init();
