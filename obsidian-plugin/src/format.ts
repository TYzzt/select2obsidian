export type SeparatorStyle = "blankLines" | "horizontalRule";

export function formatInsertion(markdown: string, wrapWithBlankLines: boolean): string {
  const trimmed = markdown.trim();
  return wrapWithBlankLines ? `\n\n${trimmed}\n\n` : trimmed;
}

export function formatAppend(markdown: string, separatorStyle: SeparatorStyle): string {
  const trimmed = markdown.trim();
  const prefix = separatorStyle === "horizontalRule" ? "\n\n---\n\n" : "\n\n";
  return `${prefix}${trimmed}\n`;
}

export function appendToContent(content: string, markdown: string, separatorStyle: SeparatorStyle): string {
  const trimmedContent = content.replace(/\s*$/u, "");
  if (!trimmedContent) {
    return formatNewFile(markdown);
  }
  return `${trimmedContent}${formatAppend(markdown, separatorStyle)}`;
}

export function sanitizeFileName(value: string | undefined, fallback = "Untitled clipping"): string {
  const controlCharacters = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}]`, "g");
  const base = (value || fallback)
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(controlCharacters, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return base || fallback;
}

export function buildClippingPath(folder: string, title: string | undefined, date = new Date()): string {
  const safeFolder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "Clippings";
  const day = date.toISOString().slice(0, 10);
  return `${safeFolder}/${day} ${sanitizeFileName(title)}.md`;
}

export function formatNewFile(markdown: string): string {
  return `${markdown.trim()}\n`;
}
