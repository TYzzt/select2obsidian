const CONTENT_FILES = ["markdown.js", "content-script.js"];

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-selection") {
    return;
  }

  await startSelectionInActiveTab();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "S2O_START_SELECTION") {
    return false;
  }

  startSelectionInActiveTab()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.warn("Select to Note could not start selection mode", error);
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

async function startSelectionInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: CONTENT_FILES
  });
  await chrome.tabs.sendMessage(tab.id, { type: "S2O_TOGGLE_SELECTION" });
}
