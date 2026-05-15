const DEFAULTS = {
  baiduAppId: "",
  baiduSecret: "",
  endpoint: "http://127.0.0.1:27124/capture",
  includeSource: true,
  translationEnabled: false,
  translationTarget: "zh",
  token: "select2obsidian-local-default-token"
};
const OBSIDIAN_PLUGIN_URL = "https://obsidian.md/plugins?id=select-to-note";

const statusPill = document.getElementById("status-pill");
const statusDetail = document.getElementById("status-detail");
const pluginHelp = document.getElementById("plugin-help");
const shortcut = document.getElementById("shortcut");
const target = document.getElementById("target");
let currentSettings = { ...DEFAULTS };

init();

async function init() {
  currentSettings = await chrome.storage.sync.get(DEFAULTS);

  const commands = await chrome.commands.getAll();
  const selectionCommand = commands.find((command) => command.name === "toggle-selection");
  shortcut.textContent = selectionCommand?.shortcut || "Ctrl+Shift+X";
  setStatus("neutral", "Checking", "Checking the Obsidian receiver...");
  await checkStatus();
}

document.getElementById("check").addEventListener("click", async () => {
  currentSettings = await chrome.storage.sync.get(DEFAULTS);
  await checkStatus();
});

document.getElementById("start").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "S2O_START_SELECTION" });
  if (response?.ok) {
    window.close();
  } else {
    setStatus("bad", "Cannot start", friendlyStartError(response?.error));
  }
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("obsidian-plugin").addEventListener("click", () => {
  chrome.tabs.create({ url: OBSIDIAN_PLUGIN_URL });
});

async function checkStatus() {
  const token = currentSettings.token?.trim();
  if (!token) {
    setStatus("warn", "No token", "Open Settings and paste the same token used by the Obsidian plugin.");
    return;
  }

  try {
    const response = await fetch(statusUrl(currentSettings.endpoint), {
      headers: {
        "Authorization": `Bearer ${token}`
      },
      method: "GET"
    });

    if (response.status === 401) {
      setStatus("bad", "Token mismatch", "Open Settings and paste the token from the Obsidian plugin.");
      return;
    }

    if (!response.ok) {
      setStatus("bad", "Receiver error", `Obsidian returned ${response.status}. Restart the Obsidian plugin or check the endpoint in Settings.`);
      return;
    }

    const body = await response.json();
    setStatus("ok", "Connected", body.activeFile ? `Active note: ${body.activeFile}` : "Connected. No active note is open.");
    target.textContent = body.defaultTarget === "active-note-end" ? "Active note end" : body.defaultTarget;
  } catch {
    setStatus("bad", "Offline", "Open Obsidian, enable the Select to Note plugin, then check again.");
  }
}

function statusUrl(value) {
  const url = new URL(value || DEFAULTS.endpoint);
  url.pathname = "/status";
  url.search = "";
  url.hash = "";
  return url.href;
}

function setStatus(kind, label, detail) {
  statusPill.className = `pill ${kind}`;
  statusPill.textContent = label;
  statusDetail.textContent = detail;
  pluginHelp.hidden = kind === "ok" || kind === "neutral";
}

function friendlyStartError(message) {
  if (!message) {
    return "Could not start selection mode.";
  }
  if (/cannot access|chrome:|edge:|extension|web store|pdf viewer|Cannot access contents/i.test(message)) {
    return "This page cannot be clipped. Open a normal web page and try again.";
  }
  return message;
}
