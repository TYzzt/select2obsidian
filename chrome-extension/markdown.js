(function () {
  if (globalThis.Select2ObsidianMarkdown) {
    return;
  }

  const BLOCK_TAGS = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "BR",
    "DD",
    "DIV",
    "DL",
    "DT",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "FORM",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "HR",
    "LI",
    "MAIN",
    "NAV",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "TABLE",
    "TBODY",
    "TD",
    "TFOOT",
    "TH",
    "THEAD",
    "TR",
    "UL"
  ]);

  function isVisibleElement(element) {
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      element.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || element.tagName === "BR";
  }

  function escapeMarkdown(text) {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/\*/g, "\\*")
      .replace(/_/g, "\\_")
      .replace(/`/g, "\\`")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  function normalizeWhitespace(text) {
    return text.replace(/\s+/g, " ").trim();
  }

  function compactBlocks(text) {
    return text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function absoluteUrl(value, baseUrl) {
    if (!value) {
      return "";
    }

    try {
      return new URL(value, baseUrl).href;
    } catch {
      return value;
    }
  }

  function childMarkdown(node, context) {
    let output = "";
    node.childNodes.forEach((child) => {
      output += nodeToMarkdown(child, context);
    });
    return output;
  }

  function listMarkdown(element, context, ordered) {
    const items = Array.from(element.children).filter((child) => child.tagName === "LI" && isVisibleElement(child));
    const lines = items.map((item, index) => {
      const marker = ordered ? `${index + 1}. ` : "- ";
      const content = compactBlocks(childMarkdown(item, { ...context, inList: true })).replace(/\n/g, "\n  ");
      return `${marker}${content}`;
    });
    return `\n\n${lines.join("\n")}\n\n`;
  }

  function tableMarkdown(element, context) {
    const rows = Array.from(element.querySelectorAll("tr"))
      .filter(isVisibleElement)
      .map((row) =>
        Array.from(row.children)
          .filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
          .map((cell) => normalizeWhitespace(cell.innerText || cell.textContent || "").replace(/\|/g, "\\|"))
      )
      .filter((row) => row.length > 0);

    if (!rows.length) {
      return "";
    }

    const width = Math.max(...rows.map((row) => row.length));
    const normalized = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
    const header = normalized[0];
    const separator = Array(width).fill("---");
    const body = normalized.slice(1);
    const renderRow = (row) => `| ${row.join(" | ")} |`;
    return `\n\n${[renderRow(header), renderRow(separator), ...body.map(renderRow)].join("\n")}\n\n`;
  }

  function nodeToMarkdown(node, context) {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeMarkdown(normalizeWhitespace(node.textContent || ""));
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    const element = node;
    const tag = element.tagName;
    if (!isVisibleElement(element) || tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
      return "";
    }

    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      return `\n\n${"#".repeat(level)} ${compactBlocks(childMarkdown(element, context))}\n\n`;
    }

    if (tag === "P" || tag === "SECTION" || tag === "ARTICLE" || tag === "DIV") {
      const content = compactBlocks(childMarkdown(element, context));
      return content ? `\n\n${content}\n\n` : "";
    }

    if (tag === "BR") {
      return "\n";
    }

    if (tag === "BLOCKQUOTE") {
      const content = compactBlocks(childMarkdown(element, context))
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return content ? `\n\n${content}\n\n` : "";
    }

    if (tag === "PRE") {
      return `\n\n\`\`\`\n${element.innerText.trim()}\n\`\`\`\n\n`;
    }

    if (tag === "CODE") {
      return `\`${(element.textContent || "").replace(/`/g, "\\`")}\``;
    }

    if (tag === "STRONG" || tag === "B") {
      const content = compactBlocks(childMarkdown(element, context));
      return content ? `**${content}**` : "";
    }

    if (tag === "EM" || tag === "I") {
      const content = compactBlocks(childMarkdown(element, context));
      return content ? `*${content}*` : "";
    }

    if (tag === "A") {
      const content = compactBlocks(childMarkdown(element, context)) || normalizeWhitespace(element.textContent || "");
      const href = absoluteUrl(element.getAttribute("href"), context.baseUrl);
      return href ? `[${content}](${href})` : content;
    }

    if (tag === "IMG") {
      const src = absoluteUrl(element.getAttribute("src") || element.getAttribute("data-src"), context.baseUrl);
      if (!src) {
        return "";
      }
      const alt = normalizeWhitespace(element.getAttribute("alt") || element.getAttribute("title") || "");
      return `![${escapeMarkdown(alt)}](${src})`;
    }

    if (tag === "UL" || tag === "OL") {
      return listMarkdown(element, context, tag === "OL");
    }

    if (tag === "LI") {
      const content = compactBlocks(childMarkdown(element, { ...context, inList: true }));
      return context.inList ? content : `\n\n- ${content}\n\n`;
    }

    if (tag === "TABLE") {
      return tableMarkdown(element, context);
    }

    if (tag === "HR") {
      return "\n\n---\n\n";
    }

    const content = childMarkdown(element, context);
    if (BLOCK_TAGS.has(tag)) {
      const compacted = compactBlocks(content);
      return compacted ? `\n\n${compacted}\n\n` : "";
    }
    return content;
  }

  function elementToMarkdown(element, options = {}) {
    const baseUrl = options.baseUrl || element.ownerDocument.location.href;
    return compactBlocks(nodeToMarkdown(element, { baseUrl, inList: false }));
  }

  function appendSource(markdown, source) {
    const title = source.title ? source.title.replace(/\]/g, "\\]") : "Untitled page";
    const url = source.url || "";
    const captured = new Date(source.capturedAt || Date.now()).toLocaleString();
    const sourceLine = url ? `> Source: [${title}](${url})` : `> Source: ${title}`;
    return compactBlocks(`${markdown}\n\n${sourceLine}  \n> Captured: ${captured}`);
  }

  globalThis.Select2ObsidianMarkdown = {
    appendSource,
    compactBlocks,
    elementToMarkdown,
    normalizeWhitespace
  };
})();
