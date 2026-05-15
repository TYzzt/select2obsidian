const DEFAULTS = {
  azureTranslatorEndpoint: "https://api.cognitive.microsofttranslator.com",
  azureTranslatorKey: "",
  azureTranslatorRegion: "",
  baiduAppId: "",
  baiduSecret: "",
  endpoint: "http://127.0.0.1:27124/capture",
  googleTranslateApiKey: "",
  includeSource: true,
  llmApiKey: "",
  llmBaseUrl: "",
  llmModel: "gpt-4o-mini",
  translationEnabled: false,
  translationEngine: "",
  translationTarget: "zh",
  token: "select2obsidian-local-default-token"
};
const OBSIDIAN_PLUGIN_URL = "https://obsidian.md/plugins?id=select-to-note";

const azureTranslatorEndpoint = document.getElementById("azure-translator-endpoint");
const azureTranslatorKey = document.getElementById("azure-translator-key");
const azureTranslatorRegion = document.getElementById("azure-translator-region");
const baiduAppId = document.getElementById("baidu-app-id");
const baiduSecret = document.getElementById("baidu-secret");
const endpoint = document.getElementById("endpoint");
const googleTranslateApiKey = document.getElementById("google-translate-api-key");
const includeSource = document.getElementById("include-source");
const llmApiKey = document.getElementById("llm-api-key");
const llmBaseUrl = document.getElementById("llm-base-url");
const llmModel = document.getElementById("llm-model");
const token = document.getElementById("token");
const translationEnabled = document.getElementById("translation-enabled");
const translationEngine = document.getElementById("translation-engine");
const translationFields = document.getElementById("translation-fields");
const translationTarget = document.getElementById("translation-target");
const testTranslation = document.getElementById("test-translation");
const engineHelp = document.getElementById("engine-help");
const status = document.getElementById("status");

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  azureTranslatorEndpoint.value = settings.azureTranslatorEndpoint || DEFAULTS.azureTranslatorEndpoint;
  azureTranslatorKey.value = settings.azureTranslatorKey || "";
  azureTranslatorRegion.value = settings.azureTranslatorRegion || "";
  baiduAppId.value = settings.baiduAppId || "";
  baiduSecret.value = settings.baiduSecret || "";
  endpoint.value = settings.endpoint;
  googleTranslateApiKey.value = settings.googleTranslateApiKey || "";
  includeSource.checked = settings.includeSource !== false;
  llmApiKey.value = settings.llmApiKey || "";
  llmBaseUrl.value = settings.llmBaseUrl || "";
  llmModel.value = settings.llmModel || DEFAULTS.llmModel;
  translationEnabled.checked = Boolean(settings.translationEnabled);
  translationEngine.value = normalizeTranslationEngine(settings.translationEngine, settings);
  translationTarget.value = normalizeTranslationTarget(settings.translationTarget);
  token.value = settings.token;
  syncTranslationFields();
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    azureTranslatorEndpoint: azureTranslatorEndpoint.value.trim() || DEFAULTS.azureTranslatorEndpoint,
    azureTranslatorKey: azureTranslatorKey.value.trim(),
    azureTranslatorRegion: azureTranslatorRegion.value.trim(),
    baiduAppId: baiduAppId.value.trim(),
    baiduSecret: baiduSecret.value.trim(),
    endpoint: endpoint.value.trim() || DEFAULTS.endpoint,
    googleTranslateApiKey: googleTranslateApiKey.value.trim(),
    includeSource: includeSource.checked,
    llmApiKey: llmApiKey.value.trim(),
    llmBaseUrl: llmBaseUrl.value.trim(),
    llmModel: llmModel.value.trim() || DEFAULTS.llmModel,
    translationEnabled: translationEnabled.checked,
    translationEngine: normalizeTranslationEngine(translationEngine.value),
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

document.getElementById("obsidian-plugin").addEventListener("click", () => {
  chrome.tabs.create({ url: OBSIDIAN_PLUGIN_URL });
});

document.getElementById("shortcuts").addEventListener("click", () => {
  chrome.tabs.create({ url: shortcutsUrl() });
});

translationEnabled.addEventListener("change", syncTranslationFields);
translationEngine.addEventListener("change", syncTranslationFields);
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
    azureTranslatorEndpoint: azureTranslatorEndpoint.value.trim() || DEFAULTS.azureTranslatorEndpoint,
    azureTranslatorKey: azureTranslatorKey.value.trim(),
    azureTranslatorRegion: azureTranslatorRegion.value.trim(),
    baiduAppId: baiduAppId.value.trim(),
    baiduSecret: baiduSecret.value.trim(),
    googleTranslateApiKey: googleTranslateApiKey.value.trim(),
    llmApiKey: llmApiKey.value.trim(),
    llmBaseUrl: llmBaseUrl.value.trim(),
    llmModel: llmModel.value.trim() || DEFAULTS.llmModel,
    translationEnabled: translationEnabled.checked,
    translationEngine: normalizeTranslationEngine(translationEngine.value),
    translationTarget: normalizeTranslationTarget(translationTarget.value)
  });
}

function syncTranslationFields() {
  const enabled = translationEnabled.checked;
  const engine = normalizeTranslationEngine(translationEngine.value);
  translationFields.hidden = !enabled;
  [
    azureTranslatorEndpoint,
    azureTranslatorKey,
    azureTranslatorRegion,
    baiduAppId,
    baiduSecret,
    googleTranslateApiKey,
    llmApiKey,
    llmBaseUrl,
    llmModel,
    translationEngine,
    translationTarget,
    testTranslation
  ].forEach((field) => {
    field.disabled = !translationEnabled.checked;
  });
  setFieldVisibility(baiduAppId, engine === "baidu");
  setFieldVisibility(baiduSecret, engine === "baidu");
  setFieldVisibility(azureTranslatorKey, engine === "azure");
  setFieldVisibility(azureTranslatorRegion, engine === "azure");
  setFieldVisibility(azureTranslatorEndpoint, engine === "azure");
  setFieldVisibility(googleTranslateApiKey, engine === "google");
  setFieldVisibility(llmBaseUrl, engine === "llm");
  setFieldVisibility(llmApiKey, engine === "llm");
  setFieldVisibility(llmModel, engine === "llm");
  engineHelp.textContent = enabled ? translationEngineHelp(engine) : "";
}

function normalizeTranslationTarget(value) {
  return value === "auto" || value === "en" ? value : "zh";
}

function normalizeTranslationEngine(value, settings = {}) {
  if (["auto-local", "edge-built-in", "baidu", "azure", "google", "llm"].includes(value)) {
    return value;
  }
  return settings.translationEnabled && (settings.baiduAppId || settings.baiduSecret) ? "baidu" : "auto-local";
}

function setFieldVisibility(input, visible) {
  input.closest("label").hidden = !visible;
}

function shortcutsUrl() {
  return navigator.userAgent.includes("Edg/") ? "edge://extensions/shortcuts" : "chrome://extensions/shortcuts";
}

function translationEngineHelp(engine) {
  if (engine === "auto-local") {
    return "Tries the browser built-in translator first. If unavailable, choose a cloud engine and add your credentials.";
  }
  if (engine === "edge-built-in") {
    return "No API key is required, but support depends on your browser and enabled experimental translator features.";
  }
  if (engine === "baidu") {
    return "Requires your Baidu Translate App ID and secret.";
  }
  if (engine === "azure") {
    return "Requires an Azure Translator key, region, and endpoint from your Azure account.";
  }
  if (engine === "google") {
    return "Requires a Google Cloud Translation API key.";
  }
  return "Uses an OpenAI-compatible /chat/completions endpoint. Custom HTTPS domains are supported.";
}
