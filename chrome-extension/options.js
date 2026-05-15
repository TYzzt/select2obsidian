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
const testTranslation = document.getElementById("test-translation");
const status = document.getElementById("status");

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  baiduAppId.value = settings.baiduAppId || "";
  baiduSecret.value = settings.baiduSecret || "";
  endpoint.value = settings.endpoint;
  includeSource.checked = settings.includeSource !== false;
  translationEnabled.checked = Boolean(settings.translationEnabled);
  translationTarget.value = normalizeTranslationTarget(settings.translationTarget);
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
    translationTarget: normalizeTranslationTarget(translationTarget.value),
    token: token.value.trim()
  });
  status.textContent = "Settings saved. Check connection from the popup.";
  setTimeout(() => (status.textContent = ""), 3200);
});

document.getElementById("generate").addEventListener("click", () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  token.value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  status.textContent = "New token generated. Save it here, then paste the same token into the Obsidian plugin.";
});

translationEnabled.addEventListener("change", syncTranslationFields);
testTranslation.addEventListener("click", async () => {
  await saveTranslationSettings();
  testTranslation.disabled = true;
  status.textContent = "Testing translation...";
  try {
    const sample = normalizeTranslationTarget(translationTarget.value) === "en" ? "你好，世界" : "Hello, world";
    const response = await chrome.runtime.sendMessage({ markdown: sample, type: "S2O_TRANSLATE_MARKDOWN" });
    if (!response?.ok) {
      throw new Error(response?.error || "Translation test failed.");
    }
    status.textContent = `Translation works: ${response.markdown}`;
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Translation test failed.";
  } finally {
    testTranslation.disabled = !translationEnabled.checked;
  }
});

async function saveTranslationSettings() {
  await chrome.storage.sync.set({
    baiduAppId: baiduAppId.value.trim(),
    baiduSecret: baiduSecret.value.trim(),
    translationEnabled: translationEnabled.checked,
    translationTarget: normalizeTranslationTarget(translationTarget.value)
  });
}

function syncTranslationFields() {
  translationFields.hidden = !translationEnabled.checked;
  [baiduAppId, baiduSecret, translationTarget, testTranslation].forEach((field) => {
    field.disabled = !translationEnabled.checked;
  });
}

function normalizeTranslationTarget(value) {
  return value === "auto" || value === "en" ? value : "zh";
}
