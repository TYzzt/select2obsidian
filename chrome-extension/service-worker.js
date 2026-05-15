const CONTENT_FILES = ["markdown.js", "content-script.js"];
const TRANSLATE_ENDPOINT = "https://fanyi-api.baidu.com/api/trans/vip/translate";
const DEFAULTS = {
  baiduAppId: "",
  baiduSecret: "",
  translationEnabled: false,
  translationTarget: "zh"
};

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

  if (message?.type === "S2O_TRANSLATE_MARKDOWN") {
    translateMarkdown(message.markdown)
      .then((markdown) => sendResponse({ ok: true, markdown }))
      .catch((error) => {
        console.warn("Select to Note could not translate the selection", error);
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

async function translateMarkdown(markdown) {
  const text = String(markdown || "").trim();
  if (!text) {
    throw new Error("No text to translate.");
  }

  const settings = await chrome.storage.sync.get(DEFAULTS);
  if (!settings.translationEnabled) {
    throw new Error("Enable translation in Select to Note options first.");
  }
  if (!settings.baiduAppId || !settings.baiduSecret) {
    throw new Error("Set Baidu Translate App ID and secret first.");
  }

  const salt = String(Date.now());
  const sign = await md5Hex(`${settings.baiduAppId}${text}${salt}${settings.baiduSecret}`);
  const body = new URLSearchParams({
    appid: settings.baiduAppId,
    from: "auto",
    q: text,
    salt,
    sign,
    to: settings.translationTarget === "en" ? "en" : "zh"
  });

  const response = await fetch(TRANSLATE_ENDPOINT, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Baidu Translate returned ${response.status}.`);
  }

  const result = await response.json();
  if (result.error_code) {
    throw new Error(`Baidu Translate error ${result.error_code}: ${result.error_msg || "Unknown error"}.`);
  }
  if (!Array.isArray(result.trans_result)) {
    throw new Error("Baidu Translate returned an invalid response.");
  }

  return result.trans_result.map((item) => item.dst).filter(Boolean).join("\n\n").trim();
}

async function md5Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const words = [];
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] |= bytes[index] << ((index % 4) * 8);
  }

  const bitLength = bytes.length * 8;
  words[bitLength >> 5] |= 0x80 << bitLength % 32;
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  for (let index = 0; index < words.length; index += 16) {
    const oldA = a;
    const oldB = b;
    const oldC = c;
    const oldD = d;

    a = md5Round(ff, a, b, c, d, words[index], 7, -680876936);
    d = md5Round(ff, d, a, b, c, words[index + 1], 12, -389564586);
    c = md5Round(ff, c, d, a, b, words[index + 2], 17, 606105819);
    b = md5Round(ff, b, c, d, a, words[index + 3], 22, -1044525330);
    a = md5Round(ff, a, b, c, d, words[index + 4], 7, -176418897);
    d = md5Round(ff, d, a, b, c, words[index + 5], 12, 1200080426);
    c = md5Round(ff, c, d, a, b, words[index + 6], 17, -1473231341);
    b = md5Round(ff, b, c, d, a, words[index + 7], 22, -45705983);
    a = md5Round(ff, a, b, c, d, words[index + 8], 7, 1770035416);
    d = md5Round(ff, d, a, b, c, words[index + 9], 12, -1958414417);
    c = md5Round(ff, c, d, a, b, words[index + 10], 17, -42063);
    b = md5Round(ff, b, c, d, a, words[index + 11], 22, -1990404162);
    a = md5Round(ff, a, b, c, d, words[index + 12], 7, 1804603682);
    d = md5Round(ff, d, a, b, c, words[index + 13], 12, -40341101);
    c = md5Round(ff, c, d, a, b, words[index + 14], 17, -1502002290);
    b = md5Round(ff, b, c, d, a, words[index + 15], 22, 1236535329);

    a = md5Round(gg, a, b, c, d, words[index + 1], 5, -165796510);
    d = md5Round(gg, d, a, b, c, words[index + 6], 9, -1069501632);
    c = md5Round(gg, c, d, a, b, words[index + 11], 14, 643717713);
    b = md5Round(gg, b, c, d, a, words[index], 20, -373897302);
    a = md5Round(gg, a, b, c, d, words[index + 5], 5, -701558691);
    d = md5Round(gg, d, a, b, c, words[index + 10], 9, 38016083);
    c = md5Round(gg, c, d, a, b, words[index + 15], 14, -660478335);
    b = md5Round(gg, b, c, d, a, words[index + 4], 20, -405537848);
    a = md5Round(gg, a, b, c, d, words[index + 9], 5, 568446438);
    d = md5Round(gg, d, a, b, c, words[index + 14], 9, -1019803690);
    c = md5Round(gg, c, d, a, b, words[index + 3], 14, -187363961);
    b = md5Round(gg, b, c, d, a, words[index + 8], 20, 1163531501);
    a = md5Round(gg, a, b, c, d, words[index + 13], 5, -1444681467);
    d = md5Round(gg, d, a, b, c, words[index + 2], 9, -51403784);
    c = md5Round(gg, c, d, a, b, words[index + 7], 14, 1735328473);
    b = md5Round(gg, b, c, d, a, words[index + 12], 20, -1926607734);

    a = md5Round(hh, a, b, c, d, words[index + 5], 4, -378558);
    d = md5Round(hh, d, a, b, c, words[index + 8], 11, -2022574463);
    c = md5Round(hh, c, d, a, b, words[index + 11], 16, 1839030562);
    b = md5Round(hh, b, c, d, a, words[index + 14], 23, -35309556);
    a = md5Round(hh, a, b, c, d, words[index + 1], 4, -1530992060);
    d = md5Round(hh, d, a, b, c, words[index + 4], 11, 1272893353);
    c = md5Round(hh, c, d, a, b, words[index + 7], 16, -155497632);
    b = md5Round(hh, b, c, d, a, words[index + 10], 23, -1094730640);
    a = md5Round(hh, a, b, c, d, words[index + 13], 4, 681279174);
    d = md5Round(hh, d, a, b, c, words[index], 11, -358537222);
    c = md5Round(hh, c, d, a, b, words[index + 3], 16, -722521979);
    b = md5Round(hh, b, c, d, a, words[index + 6], 23, 76029189);
    a = md5Round(hh, a, b, c, d, words[index + 9], 4, -640364487);
    d = md5Round(hh, d, a, b, c, words[index + 12], 11, -421815835);
    c = md5Round(hh, c, d, a, b, words[index + 15], 16, 530742520);
    b = md5Round(hh, b, c, d, a, words[index + 2], 23, -995338651);

    a = md5Round(ii, a, b, c, d, words[index], 6, -198630844);
    d = md5Round(ii, d, a, b, c, words[index + 7], 10, 1126891415);
    c = md5Round(ii, c, d, a, b, words[index + 14], 15, -1416354905);
    b = md5Round(ii, b, c, d, a, words[index + 5], 21, -57434055);
    a = md5Round(ii, a, b, c, d, words[index + 12], 6, 1700485571);
    d = md5Round(ii, d, a, b, c, words[index + 3], 10, -1894986606);
    c = md5Round(ii, c, d, a, b, words[index + 10], 15, -1051523);
    b = md5Round(ii, b, c, d, a, words[index + 1], 21, -2054922799);
    a = md5Round(ii, a, b, c, d, words[index + 8], 6, 1873313359);
    d = md5Round(ii, d, a, b, c, words[index + 15], 10, -30611744);
    c = md5Round(ii, c, d, a, b, words[index + 6], 15, -1560198380);
    b = md5Round(ii, b, c, d, a, words[index + 13], 21, 1309151649);
    a = md5Round(ii, a, b, c, d, words[index + 4], 6, -145523070);
    d = md5Round(ii, d, a, b, c, words[index + 11], 10, -1120210379);
    c = md5Round(ii, c, d, a, b, words[index + 2], 15, 718787259);
    b = md5Round(ii, b, c, d, a, words[index + 9], 21, -343485551);

    a = safeAdd(a, oldA);
    b = safeAdd(b, oldB);
    c = safeAdd(c, oldC);
    d = safeAdd(d, oldD);
  }

  return [a, b, c, d].map(wordToHex).join("");
}

function md5Round(fn, a, b, c, d, x, s, t) {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, fn(b, c, d)), safeAdd(x || 0, t)), s), b);
}

function ff(b, c, d) {
  return (b & c) | (~b & d);
}

function gg(b, c, d) {
  return (b & d) | (c & ~d);
}

function hh(b, c, d) {
  return b ^ c ^ d;
}

function ii(b, c, d) {
  return c ^ (b | ~d);
}

function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}

function bitRotateLeft(value, count) {
  return (value << count) | (value >>> (32 - count));
}

function wordToHex(value) {
  let output = "";
  for (let index = 0; index < 4; index += 1) {
    output += ((value >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return output;
}
