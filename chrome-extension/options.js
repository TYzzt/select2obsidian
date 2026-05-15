const DEFAULTS = {
  baiduAppId: "",
  baiduSecret: "",
  endpoint: "http://127.0.0.1:27124/capture",
  includeSource: true,
  translationEnabled: false,
  translationTarget: "zh",
  token: "select2obsidian-local-default-token"
};

const baiduAppId = document.getElementById("baidu-app-id");
const baiduSecret = document.getElementById("baidu-secret");
const endpoint = document.getElementById("endpoint");
const includeSource = document.getElementById("include-source");
const token = document.getElementById("token");
const translationEnabled = document.getElementById("translation-enabled");
const translationFields = document.getElementById("translation-fields");
const translationTarget = document.getElementById("translation-target");
const status = document.getElementById("status");

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  baiduAppId.value = settings.baiduAppId || "";
  baiduSecret.value = settings.baiduSecret || "";
  endpoint.value = settings.endpoint;
  includeSource.checked = settings.includeSource !== false;
  translationEnabled.checked = Boolean(settings.translationEnabled);
  translationTarget.value = settings.translationTarget === "en" ? "en" : "zh";
  token.value = settings.token;
  syncTranslationFields();
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    baiduAppId: baiduAppId.value.trim(),
    baiduSecret: baiduSecret.value.trim(),
    endpoint: endpoint.value.trim() || DEFAULTS.endpoint,
    includeSource: includeSource.checked,
    translationEnabled: translationEnabled.checked,
    translationTarget: translationTarget.value === "en" ? "en" : "zh",
    token: token.value.trim()
  });
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1800);
});

document.getElementById("generate").addEventListener("click", () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  token.value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
});

translationEnabled.addEventListener("change", syncTranslationFields);

function syncTranslationFields() {
  translationFields.hidden = !translationEnabled.checked;
  [baiduAppId, baiduSecret, translationTarget].forEach((field) => {
    field.disabled = !translationEnabled.checked;
  });
}
