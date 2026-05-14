import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { CaptureHandler, CapturePayload, Select2ObsidianSettings, StatusHandler } from "./types";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export class CaptureServer {
  private server: Server | null = null;

  constructor(
    private readonly getSettings: () => Select2ObsidianSettings,
    private readonly handleCapture: CaptureHandler,
    private readonly handleStatus: StatusHandler,
    private readonly onError: (message: string) => void
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const settings = this.getSettings();
    this.server = createServer((request, response) => {
      void this.route(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      const server = this.server;
      if (!server) {
        reject(new Error("Server was not initialized"));
        return;
      }
      server.once("error", reject);
      server.listen(settings.port, settings.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    setCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = request.url?.split("?")[0] || "/";
    if (!["/capture", "/status"].includes(url)) {
      writeJson(response, 404, { error: "Not found" });
      return;
    }

    const settings = this.getSettings();
    if (!settings.token || request.headers.authorization !== `Bearer ${settings.token}`) {
      writeJson(response, 401, { error: "Unauthorized" });
      return;
    }

    if (request.method === "GET" && url === "/status") {
      writeJson(response, 200, this.handleStatus());
      return;
    }

    if (request.method !== "POST" || url !== "/capture") {
      writeJson(response, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = await readBody(request);
      const payload = parseCapturePayload(body);
      const result = await this.handleCapture(payload);
      writeJson(response, 200, { ok: true, ...result });
    } catch (error) {
      const status = error instanceof CaptureHttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Unknown error";
      if (status >= 500) {
        this.onError(message);
      }
      writeJson(response, status, { error: message });
    }
  }
}

export class CaptureHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Origin", "*");
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request as AsyncIterable<unknown>) {
    const buffer = bufferFromChunk(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new CaptureHttpError(413, "Capture payload is too large");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function parseCapturePayload(body: string): CapturePayload {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new CaptureHttpError(400, "Request body must be valid JSON");
  }

  if (!isRecord(value)) {
    throw new CaptureHttpError(400, "Request body must be an object");
  }
  if (value.format !== "markdown") {
    throw new CaptureHttpError(400, "Only markdown captures are supported");
  }
  if (typeof value.markdown !== "string" || !value.markdown.trim()) {
    throw new CaptureHttpError(400, "Capture markdown must be a non-empty string");
  }

  return {
    format: "markdown",
    markdown: value.markdown,
    selection: isRecord(value.selection)
      ? {
          mode: parseSelectionMode(value.selection.mode),
          text: typeof value.selection.text === "string" ? value.selection.text : undefined
        }
      : undefined,
    source: isRecord(value.source)
      ? {
          capturedAt: typeof value.source.capturedAt === "string" ? value.source.capturedAt : undefined,
          title: typeof value.source.title === "string" ? value.source.title : undefined,
          url: typeof value.source.url === "string" ? value.source.url : undefined
        }
      : undefined
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSelectionMode(value: unknown): "element" | "rectangle" {
  return value === "rectangle" ? "rectangle" : "element";
}

function bufferFromChunk(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }
  if (chunk instanceof ArrayBuffer) {
    return Buffer.from(chunk);
  }
  if (ArrayBuffer.isView(chunk)) {
    return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  throw new CaptureHttpError(400, "Request body contains an unsupported chunk type");
}
