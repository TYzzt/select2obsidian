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
  const FORM_INPUT_TYPES_WITH_VALUE = new Set(["", "COLOR", "DATE", "DATETIME-LOCAL", "EMAIL", "MONTH", "NUMBER", "PASSWORD", "SEARCH", "TEL", "TEXT", "TIME", "URL", "WEEK"]);

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
    if (node.shadowRoot) {
      node.shadowRoot.childNodes.forEach((child) => {
        output += nodeToMarkdown(child, context);
      });
    }
    return output;
  }

  function isDisplayFormula(element) {
    return Boolean(
      element.closest(".katex-display") ||
        element.getAttribute("display") === "block" ||
        element.getAttribute("data-mjx-display") === "true" ||
        element.getAttribute("type") === "math/tex; mode=display"
    );
  }

  function formulaMarkdown(element) {
    const directTex =
      element.matches('annotation[encoding="application/x-tex"]') || element.matches('annotation[encoding="application/x-tex; mode=display"]')
        ? element.textContent
        : "";
    const directMathJax = element.matches('script[type^="math/tex"]') ? element.textContent : "";
    const formulaContainer = element.matches(".katex, .katex-display, mjx-container, .MathJax");
    const nested =
      formulaContainer &&
      (element.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="application/x-tex; mode=display"]') ||
        element.querySelector('script[type^="math/tex"]'));
    const tex = normalizeWhitespace(directTex || directMathJax || nested?.textContent || "");
    if (!tex) {
      return "";
    }

    return isDisplayFormula(element) ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex.replace(/\$/g, "\\$")}$`;
  }

  function formControlMarkdown(element) {
    if (element instanceof HTMLTextAreaElement) {
      const value = normalizeWhitespace(element.value || element.textContent || "");
      return value ? escapeMarkdown(value) : "";
    }

    if (element instanceof HTMLSelectElement) {
      const values = Array.from(element.selectedOptions)
        .map((option) => normalizeWhitespace(option.label || option.textContent || option.value || ""))
        .filter(Boolean);
      return values.length ? escapeMarkdown(values.join(", ")) : "";
    }

    if (!(element instanceof HTMLInputElement)) {
      return "";
    }

    const type = (element.getAttribute("type") || "").toUpperCase();
    if (type === "CHECKBOX" || type === "RADIO") {
      const label = normalizeWhitespace(element.getAttribute("aria-label") || element.title || element.value || "");
      return `${element.checked ? "[x]" : "[ ]"}${label ? ` ${escapeMarkdown(label)}` : ""}`;
    }

    if (!FORM_INPUT_TYPES_WITH_VALUE.has(type)) {
      return "";
    }

    const value = normalizeWhitespace(element.value || element.getAttribute("value") || "");
    return value ? escapeMarkdown(value) : "";
  }

  function svgMarkdown(element) {
    if (element.tagName.toLowerCase() !== "svg") {
      return "";
    }

    const values = Array.from(element.querySelectorAll("text, title, desc"))
      .map((node) => normalizeWhitespace(node.textContent || ""))
      .filter(Boolean);
    return values.length ? escapeMarkdown(values.join(" ")) : "";
  }

  function accessibleLabelMarkdown(element) {
    const content = normalizeWhitespace(element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("alt") || "");
    return content ? escapeMarkdown(content) : "";
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
    const formula = formulaMarkdown(element);
    if (formula) {
      return formula;
    }

    if (!isVisibleElement(element) || tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
      return "";
    }

    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      return formControlMarkdown(element);
    }

    if (tag.toLowerCase() === "svg") {
      return svgMarkdown(element);
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

    const content = childMarkdown(element, context) || accessibleLabelMarkdown(element);
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

  function extractSelectionText(elements) {
    return normalizeWhitespace(
      elements
        .map((element) =>
          elementToMarkdown(element, { baseUrl: element.ownerDocument.location.href }) ||
          formControlMarkdown(element) ||
          accessibleLabelMarkdown(element) ||
          element.innerText ||
          element.textContent ||
          ""
        )
        .join(" ")
    );
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
    extractSelectionText,
    normalizeWhitespace
  };
})();
