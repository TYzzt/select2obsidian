import { FuzzySuggestModal, MarkdownView, Modal, Notice, Plugin, Setting, TFile, normalizePath } from "obsidian";
import { appendToContent, buildClippingPath, formatAppend, formatNewFile } from "./format";
import { CaptureHttpError, CaptureServer } from "./server";
import { Select2ObsidianSettingTab } from "./settings-tab";
import type { CapturePayload, CaptureResult, Select2ObsidianSettings } from "./types";

const DEFAULT_SETTINGS: Select2ObsidianSettings = {
  clippingsFolder: "Clippings",
  enabled: true,
  host: "127.0.0.1",
  insertTarget: "active-note-end",
  port: 27124,
  separatorStyle: "blankLines",
  token: "select2obsidian-local-default-token",
  wrapWithBlankLines: true
};

export default class Select2ObsidianPlugin extends Plugin {
  settings: Select2ObsidianSettings = { ...DEFAULT_SETTINGS };
  private captureServer: CaptureServer | null = null;
  private lastServerError = "";

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new Select2ObsidianSettingTab(this));
    this.addCommand({
      id: "restart-receiver",
      name: "Restart capture receiver",
      callback: () => {
        void this.restartServer();
      }
    });
    await this.startServerIfEnabled();
  }

  onunload(): void {
    void this.stopServer();
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...this.normalizeSettings(await this.loadData()) };
    this.settings.host = "127.0.0.1";
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async saveSettingsAndRestart(): Promise<void> {
    await this.saveSettings();
    await this.restartServer();
  }

  receiverStatus(): string {
    if (!this.settings.enabled) {
      return "disabled";
    }
    if (!this.settings.token) {
      return "waiting for shared token";
    }
    if (this.captureServer?.isRunning()) {
      return "running";
    }
    return this.lastServerError ? `stopped (${this.lastServerError})` : "stopped";
  }

  private async startServerIfEnabled(): Promise<void> {
    if (!this.settings.enabled) {
      return;
    }
    if (!this.settings.token) {
      new Notice("Select to Note: set a shared token before using the browser extension.");
      return;
    }

    this.captureServer = new CaptureServer(
      () => this.settings,
      (payload) => this.insertCapture(payload),
      () => this.status(),
      (message) => {
        this.lastServerError = message;
      }
    );

    try {
      await this.captureServer.start();
      this.lastServerError = "";
      new Notice(`Select to Note listening on ${this.settings.host}:${this.settings.port}`);
    } catch (error) {
      this.captureServer = null;
      this.lastServerError = error instanceof Error ? error.message : String(error);
      new Notice(`Select to Note failed to start: ${this.lastServerError}`);
    }
  }

  private normalizeSettings(value: unknown): Partial<Select2ObsidianSettings> {
    if (!isRecord(value)) {
      return {};
    }

    return {
      clippingsFolder: typeof value.clippingsFolder === "string" ? value.clippingsFolder : undefined,
      enabled: typeof value.enabled === "boolean" ? value.enabled : undefined,
      host: "127.0.0.1",
      insertTarget: value.insertTarget === "active-note-end" ? "active-note-end" : undefined,
      port: typeof value.port === "number" ? value.port : undefined,
      separatorStyle:
        value.separatorStyle === "horizontalRule" || value.separatorStyle === "blankLines" ? value.separatorStyle : undefined,
      token: typeof value.token === "string" ? value.token : undefined,
      wrapWithBlankLines: typeof value.wrapWithBlankLines === "boolean" ? value.wrapWithBlankLines : undefined
    };
  }

  private async stopServer(): Promise<void> {
    if (!this.captureServer) {
      return;
    }

    try {
      await this.captureServer.stop();
    } finally {
      this.captureServer = null;
    }
  }

  private async restartServer(): Promise<void> {
    await this.stopServer();
    await this.startServerIfEnabled();
  }

  private async insertCapture(payload: CapturePayload): Promise<CaptureResult> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeFile = view?.file;
    if (activeFile) {
      const markdown = formatAppend(payload.markdown, this.settings.separatorStyle);
      const current = await this.app.vault.read(activeFile);
      await this.app.vault.modify(activeFile, appendToContent(current, payload.markdown, this.settings.separatorStyle));
      new Notice(`Inserted browser selection into ${activeFile.basename}.`);
      return { filePath: activeFile.path, insertedLength: markdown.length };
    }

    const target = await this.chooseTarget(payload);
    if (!target) {
      throw new CaptureHttpError(409, "No capture target was selected");
    }

    if (target.type === "new") {
      const path = await this.uniqueClippingPath(payload);
      await ensureFolder(this, path);
      const content = formatNewFile(payload.markdown);
      const file = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(`Created clipping ${file.basename}.`);
      return { filePath: file.path, insertedLength: content.length };
    }

    const markdown = formatAppend(payload.markdown, this.settings.separatorStyle);
    const current = await this.app.vault.read(target.file);
    await this.app.vault.modify(target.file, appendToContent(current, payload.markdown, this.settings.separatorStyle));
    await this.app.workspace.getLeaf(false).openFile(target.file);
    new Notice(`Inserted browser selection into ${target.file.basename}.`);
    return { filePath: target.file.path, insertedLength: markdown.length };
  }

  private status() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return {
      activeFile: view?.file?.path ?? null,
      defaultTarget: "active-note-end" as const,
      ok: true as const,
      receiver: "running" as const
    };
  }

  private async chooseTarget(payload: CapturePayload): Promise<CaptureTarget | null> {
    return new Promise((resolve) => {
      new CaptureTargetModal(this, resolve).open();
    });
  }

  private async uniqueClippingPath(payload: CapturePayload): Promise<string> {
    const basePath = normalizePath(buildClippingPath(this.settings.clippingsFolder, payload.source?.title));
    if (!this.app.vault.getAbstractFileByPath(basePath)) {
      return basePath;
    }

    const withoutExtension = basePath.replace(/\.md$/u, "");
    for (let index = 2; index < 1000; index += 1) {
      const candidate = `${withoutExtension}-${index}.md`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) {
        return candidate;
      }
    }

    throw new CaptureHttpError(500, "Could not find an available clipping filename");
  }
}

type CaptureTarget = { type: "new" } | { file: TFile; type: "existing" };

class CaptureTargetModal extends Modal {
  private resolved = false;

  constructor(
    private readonly plugin: Select2ObsidianPlugin,
    private readonly resolveTarget: (target: CaptureTarget | null) => void
  ) {
    super(plugin.app);
  }

  onOpen(): void {
    this.titleEl.setText("Select to Note capture target");
    this.contentEl.createEl("p", {
      text: "No active Markdown note is open. Choose where to save this browser selection."
    });

    new Setting(this.contentEl)
      .setName("Create clipping")
      .setDesc(`Create a new note in ${this.plugin.settings.clippingsFolder}.`)
      .addButton((button) =>
        button
          .setButtonText("Create")
          .setCta()
          .onClick(() => {
            this.resolveAndClose({ type: "new" });
          })
      );

    new Setting(this.contentEl)
      .setName("Append to existing note")
      .setDesc("Pick a Markdown file from this vault.")
      .addButton((button) =>
        button.setButtonText("Choose file").onClick(() => {
          this.close();
          this.resolved = true;
          new MarkdownFileSuggestModal(
            this.plugin,
            (file) => {
              this.resolveTarget({ file, type: "existing" });
            },
            () => {
              this.resolveTarget(null);
            }
          ).open();
        })
      );
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolveTarget(null);
      this.resolved = true;
    }
    this.contentEl.empty();
  }

  private resolveAndClose(target: CaptureTarget): void {
    this.resolved = true;
    this.resolveTarget(target);
    this.close();
  }
}

class MarkdownFileSuggestModal extends FuzzySuggestModal<TFile> {
  private picked = false;

  constructor(
    private readonly plugin: Select2ObsidianPlugin,
    private readonly onPick: (file: TFile) => void,
    private readonly onCancel: () => void
  ) {
    super(plugin.app);
    this.setPlaceholder("Choose a Markdown file");
  }

  getItems(): TFile[] {
    return this.plugin.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.picked = true;
    this.onPick(file);
  }

  onClose(): void {
    if (!this.picked) {
      this.onCancel();
    }
  }
}

async function ensureFolder(plugin: Select2ObsidianPlugin, filePath: string): Promise<void> {
  const parts = filePath.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!plugin.app.vault.getAbstractFileByPath(current)) {
      await plugin.app.vault.createFolder(current);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
