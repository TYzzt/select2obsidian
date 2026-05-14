const DEFAULTS = {
  endpoint: "http://127.0.0.1:27124/capture",
  token: "select2obsidian-local-default-token"
};

const endpoint = document.getElementById("endpoint");
const token = document.getElementById("token");
const status = document.getElementById("status");

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  endpoint.value = settings.endpoint;
  token.value = settings.token;
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    endpoint: endpoint.value.trim() || DEFAULTS.endpoint,
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

