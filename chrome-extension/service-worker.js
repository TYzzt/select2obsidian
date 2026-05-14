const CONTENT_FILES = ["markdown.js", "content-script.js"];

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-selection") {
    return;
  }

  await startSelectionInActiveTab();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "S2O_START_SELECTION") {
    startSelectionInActiveTab()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.warn("Select to Note could not start selection mode", error);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (message?.type === "S2O_CAPTURE_VISIBLE_TAB") {
    captureVisibleTab(sender.tab)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => {
        console.warn("Select to Note could not capture the visible tab", error);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  return false;
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

async function captureVisibleTab(tab) {
  const windowId = tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}
