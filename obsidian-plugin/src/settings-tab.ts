import { Notice, PluginSettingTab, Setting } from "obsidian";
import type Select2ObsidianPlugin from "./main";

export class Select2ObsidianSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: Select2ObsidianPlugin) {
    super(plugin.app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Select to Note" });

    new Setting(containerEl)
      .setName("Enable receiver")
      .setDesc("Start the local capture endpoint while Obsidian is open.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettingsAndRestart();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Listen port")
      .setDesc("The browser extension posts captures to this localhost port.")
      .addText((text) =>
        text
          .setPlaceholder("27124")
          .setValue(String(this.plugin.settings.port))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
              this.plugin.settings.port = parsed;
              await this.plugin.saveSettingsAndRestart();
            }
          })
      );

    let tokenInput: HTMLInputElement | null = null;
    let tokenVisible = false;
    new Setting(containerEl)
      .setName("Shared token")
      .setDesc("Must match the token in the browser extension options.")
      .addText((text) => {
        tokenInput = text.inputEl;
        text.inputEl.type = "password";
        text
          .setPlaceholder("Required")
          .setValue(this.plugin.settings.token)
          .onChange(async (value) => {
            this.plugin.settings.token = value.trim();
              await this.plugin.saveSettingsAndRestart();
            });
      })
      .addButton((button) =>
        button.setButtonText("Show").onClick(() => {
          if (!tokenInput) {
            return;
          }
          tokenVisible = !tokenVisible;
          tokenInput.type = tokenVisible ? "text" : "password";
          button.setButtonText(tokenVisible ? "Hide" : "Show");
        })
      )
      .addButton((button) =>
        button.setButtonText("Copy").onClick(async () => {
          await navigator.clipboard.writeText(this.plugin.settings.token);
          new Notice("Select to Note token copied.");
        })
      )
      .addButton((button) =>
        button.setButtonText("Generate").onClick(async () => {
          this.plugin.settings.token = crypto.randomUUID().replace(/-/g, "");
          await this.plugin.saveSettingsAndRestart();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Wrap captures with blank lines")
      .setDesc("Legacy option retained for older settings; new captures use the separator style below.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.wrapWithBlankLines).onChange(async (value) => {
          this.plugin.settings.wrapWithBlankLines = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Default target")
      .setDesc("Captures append to the end of the active Markdown note.")
      .addText((text) => {
        text.setValue("Active note end");
        text.inputEl.disabled = true;
      });

    new Setting(containerEl)
      .setName("Separator style")
      .setDesc("How clips are separated when appended to a note.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("blankLines", "Blank lines")
          .addOption("horizontalRule", "Horizontal rule")
          .setValue(this.plugin.settings.separatorStyle)
          .onChange(async (value) => {
            this.plugin.settings.separatorStyle = value === "horizontalRule" ? "horizontalRule" : "blankLines";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Clippings folder")
      .setDesc("Used when no active Markdown note is open and a new clipping is created.")
      .addText((text) =>
        text
          .setPlaceholder("Clippings")
          .setValue(this.plugin.settings.clippingsFolder)
          .onChange(async (value) => {
            this.plugin.settings.clippingsFolder = value.trim() || "Clippings";
            await this.plugin.saveSettings();
          })
      );

    const endpoint = `http://${this.plugin.settings.host}:${this.plugin.settings.port}/capture`;
    containerEl.createEl("p", {
      cls: "select2obsidian-status",
      text: `Endpoint: ${endpoint}`
    });
    containerEl.createEl("p", {
      cls: "select2obsidian-status",
      text: `Status: ${this.plugin.receiverStatus()}`
    });
  }
}
