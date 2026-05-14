export interface Select2ObsidianSettings {
  clippingsFolder: string;
  enabled: boolean;
  host: string;
  insertTarget: "active-note-end";
  port: number;
  separatorStyle: "blankLines" | "horizontalRule";
  token: string;
  wrapWithBlankLines: boolean;
}

export interface CapturePayload {
  format: "markdown";
  markdown: string;
  selection?: {
    mode?: "element" | "rectangle";
    text?: string;
  };
  source?: {
    capturedAt?: string;
    title?: string;
    url?: string;
  };
}

export interface CaptureResult {
  filePath?: string;
  insertedLength: number;
}

export type CaptureHandler = (payload: CapturePayload) => Promise<CaptureResult>;

export interface StatusResult {
  activeFile: string | null;
  defaultTarget: "active-note-end";
  ok: true;
  receiver: "running";
}

export type StatusHandler = () => StatusResult;
