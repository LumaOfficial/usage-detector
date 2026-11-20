// Content script: tells the service worker when the page is hidden.
document.addEventListener("visibilitychange", () => {
  chrome.runtime.sendMessage({ type: "visibility", hidden: document.hidden }).catch(() => {});
});
