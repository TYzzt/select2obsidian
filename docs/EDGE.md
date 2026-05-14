# Microsoft Edge Support

Select to Note uses Chromium Manifest V3 APIs, so the same extension folder works in Microsoft Edge.

## Local Install

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `D:\workspace\select2obsidian\chrome-extension`.
5. Open the extension popup and check that Obsidian is connected.

The shortcut settings page is `edge://extensions/shortcuts`.

## Publishing

Use the same extension source folder for Microsoft Edge Add-ons. Package the contents of `chrome-extension/` as a ZIP and upload it in Partner Center.

Before publishing, prepare:

- A short and long description.
- Screenshots of the popup and selection overlay.
- A privacy policy explaining that captures are sent only to `127.0.0.1`.
- Store listing images and support contact.

No code fork is required unless the store asks for Edge-specific branding.
