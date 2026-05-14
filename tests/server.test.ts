import { describe, expect, it } from "vitest";
import { CaptureHttpError, parseCapturePayload } from "../obsidian-plugin/src/server";
import { appendToContent, buildClippingPath, formatAppend, formatInsertion, sanitizeFileName } from "../obsidian-plugin/src/format";

describe("parseCapturePayload", () => {
  it("accepts markdown captures", () => {
    expect(
      parseCapturePayload(
        JSON.stringify({
          format: "markdown",
          markdown: "# Hello",
          selection: {
            mode: "rectangle",
            text: "Hello"
          },
          source: {
            title: "Example",
            url: "https://example.com",
            capturedAt: "2026-05-14T00:00:00.000Z"
          }
        })
      )
    ).toEqual({
      format: "markdown",
      markdown: "# Hello",
      selection: {
        mode: "rectangle",
        text: "Hello"
      },
      source: {
        capturedAt: "2026-05-14T00:00:00.000Z",
        title: "Example",
        url: "https://example.com"
      }
    });
  });

  it("rejects empty markdown", () => {
    expect(() => parseCapturePayload(JSON.stringify({ format: "markdown", markdown: "" }))).toThrow(CaptureHttpError);
  });

  it("rejects invalid json", () => {
    expect(() => parseCapturePayload("{")).toThrow(CaptureHttpError);
  });
});

describe("formatInsertion", () => {
  it("wraps captures in blank lines by default", () => {
    expect(formatInsertion("  hello  ", true)).toBe("\n\nhello\n\n");
  });

  it("can insert without extra blank lines", () => {
    expect(formatInsertion("  hello  ", false)).toBe("hello");
  });
});

describe("append formatting", () => {
  it("appends with blank lines by default", () => {
    expect(formatAppend("  hello  ", "blankLines")).toBe("\n\nhello\n");
    expect(appendToContent("Existing\n\n", "hello", "blankLines")).toBe("Existing\n\nhello\n");
  });

  it("appends with a horizontal rule when configured", () => {
    expect(appendToContent("Existing", "hello", "horizontalRule")).toBe("Existing\n\n---\n\nhello\n");
  });

  it("creates clean content for an empty note", () => {
    expect(appendToContent("   ", "hello", "blankLines")).toBe("hello\n");
  });
});

describe("clipping file paths", () => {
  it("sanitizes unsafe file name characters", () => {
    expect(sanitizeFileName('A <bad> title: / with * chars?')).toBe("A bad title with chars");
  });

  it("builds a dated clipping path", () => {
    expect(buildClippingPath("Clippings", "Example", new Date("2026-05-14T08:00:00.000Z"))).toBe("Clippings/2026-05-14 Example.md");
  });
});
