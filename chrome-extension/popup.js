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

const endpoint = document.getElementById("endpoint");
const includeSource = document.getElementById("include-source");
const token = document.getElementById("token");
const statusPill = document.getElementById("status-pill");
const statusDetail = document.getElementById("status-detail");
const pluginHelp = document.getElementById("plugin-help");
const shortcut = document.getElementById("shortcut");
const target = document.getElementById("target");
const translationSummary = document.getElementById("translation-summary");

init();

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  endpoint.value = settings.endpoint;
  includeSource.checked = settings.includeSource !== false;
  token.value = settings.token;
  translationSummary.textContent = translationLabel(settings);

  const commands = await chrome.commands.getAll();
  const selectionCommand = commands.find((command) => command.name === "toggle-selection");
  shortcut.textContent = selectionCommand?.shortcut || "Ctrl+Shift+X";
  setStatus("neutral", "Checking", "Checking the Obsidian receiver...");
  await checkStatus();
}

document.getElementById("save").addEventListener("click", async () => {
  await saveSettings();
  setStatus("neutral", "Saved", "Settings saved locally.");
});

document.getElementById("check").addEventListener("click", async () => {
  await saveSettings();
  await checkStatus();
});

document.getElementById("start").addEventListener("click", async () => {
  await saveSettings();
  const response = await chrome.runtime.sendMessage({ type: "S2O_START_SELECTION" });
  if (response?.ok) {
    window.close();
  } else {
    setStatus("bad", "Cannot start", response?.error || "Could not start selection mode.");
  }
});

document.getElementById("shortcuts").addEventListener("click", () => {
  chrome.tabs.create({ url: shortcutsUrl() });
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("obsidian-plugin").addEventListener("click", () => {
  chrome.tabs.create({ url: OBSIDIAN_PLUGIN_URL });
});

async function saveSettings() {
  await chrome.storage.sync.set({
    endpoint: endpoint.value.trim() || DEFAULTS.endpoint,
    includeSource: includeSource.checked,
    token: token.value.trim()
  });
}

async function checkStatus() {
  if (!token.value.trim()) {
    setStatus("warn", "No token", "Set the same token as the Obsidian plugin.");
    return;
  }

  try {
    const response = await fetch(statusUrl(endpoint.value), {
      headers: {
        "Authorization": `Bearer ${token.value.trim()}`
      },
      method: "GET"
    });

    if (response.status === 401) {
      setStatus("bad", "Token mismatch", "Obsidian rejected the token.");
      return;
    }

    if (!response.ok) {
      setStatus("bad", "Receiver error", `Obsidian returned ${response.status}.`);
      return;
    }

    const body = await response.json();
    setStatus("ok", "Connected", body.activeFile ? `Active note: ${body.activeFile}` : "Connected. No active note is open.");
    target.textContent = body.defaultTarget === "active-note-end" ? "Active note end" : body.defaultTarget;
  } catch {
    setStatus("bad", "Offline", "Obsidian receiver is not reachable.");
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

function shortcutsUrl() {
  return navigator.userAgent.includes("Edg/") ? "edge://extensions/shortcuts" : "chrome://extensions/shortcuts";
}

function translationLabel(settings) {
  if (!settings.translationEnabled) {
    return "Off";
  }
  if (!settings.baiduAppId || !settings.baiduSecret) {
    return "Needs setup";
  }
  return settings.translationTarget === "en" ? "Baidu -> en" : "Baidu -> zh";
}
