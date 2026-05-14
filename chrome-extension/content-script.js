(function () {
  if (globalThis.__select2ObsidianContentLoaded) {
    return;
  }
  globalThis.__select2ObsidianContentLoaded = true;

  const DEFAULTS = {
    endpoint: "http://127.0.0.1:27124/capture",
    token: "select2obsidian-local-default-token"
  };

  let activeSession = null;

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "S2O_TOGGLE_SELECTION") {
      if (activeSession) {
        activeSession.stop();
      } else {
        activeSession = createSelectionSession();
        activeSession.start();
      }
    }
  });

  function createSelectionSession() {
    const overlay = document.createElement("div");
    const box = document.createElement("div");
    const toast = document.createElement("div");
    const dragBox = document.createElement("div");
    let highlighted = null;
    let isDragging = false;
    let dragStart = null;

    overlay.id = "select2obsidian-overlay";
    box.id = "select2obsidian-highlight";
    toast.id = "select2obsidian-toast";
    dragBox.id = "select2obsidian-drag";
    toast.textContent = "Click an element. Hold Shift and drag to capture a rectangle. Esc cancels.";

    function start() {
      injectStyles();
      document.documentElement.append(overlay, box, toast, dragBox);
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("mousedown", onMouseDown, true);
      document.addEventListener("mouseup", onMouseUp, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKeyDown, true);
    }

    function stop() {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
      box.remove();
      toast.remove();
      dragBox.remove();
      activeSession = null;
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        stop();
      }
    }

    function onMouseMove(event) {
      if (isDragging && dragStart) {
        event.preventDefault();
        event.stopPropagation();
        renderDragBox(toRect(dragStart.x, dragStart.y, event.clientX, event.clientY));
        return;
      }

      const element = elementFromPoint(event.clientX, event.clientY);
      if (element && element !== highlighted) {
        highlighted = element;
        renderHighlight(element.getBoundingClientRect());
      }
    }

    function onMouseDown(event) {
      if (!event.shiftKey || event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      isDragging = true;
      dragStart = { x: event.clientX, y: event.clientY };
      highlighted = null;
      box.style.display = "none";
      renderDragBox(toRect(dragStart.x, dragStart.y, event.clientX, event.clientY));
    }

    function onMouseUp(event) {
      if (!isDragging || !dragStart) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = toRect(dragStart.x, dragStart.y, event.clientX, event.clientY);
      isDragging = false;
      dragStart = null;
      dragBox.style.display = "none";
      const elements = elementsInRect(rect);
      if (elements.length) {
        beginCapture(elements, "rectangle").finally(stop);
      }
    }

    function onClick(event) {
      if (isDragging || event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const element = elementFromPoint(event.clientX, event.clientY);
      if (!element) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      beginCapture([element], "element").finally(stop);
    }

    function elementFromPoint(x, y) {
      const ignored = [overlay, box, toast, dragBox];
      ignored.forEach((node) => (node.style.pointerEvents = "none"));
      const element = document.elementFromPoint(x, y);
      ignored.forEach((node) => (node.style.pointerEvents = ""));
      if (!element || ignored.includes(element) || element.closest("#select2obsidian-overlay, #select2obsidian-highlight, #select2obsidian-toast, #select2obsidian-drag")) {
        return null;
      }
      return element;
    }

    function renderHighlight(rect) {
      box.style.display = "block";
      box.style.left = `${rect.left + window.scrollX}px`;
      box.style.top = `${rect.top + window.scrollY}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }

    function renderDragBox(rect) {
      dragBox.style.display = "block";
      dragBox.style.left = `${rect.left + window.scrollX}px`;
      dragBox.style.top = `${rect.top + window.scrollY}px`;
      dragBox.style.width = `${rect.width}px`;
      dragBox.style.height = `${rect.height}px`;
    }

    return { start, stop };
  }

  function injectStyles() {
    if (document.getElementById("select2obsidian-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "select2obsidian-style";
    style.textContent = `
      #select2obsidian-overlay {
        background: rgba(24, 105, 214, 0.04);
        cursor: crosshair;
        inset: 0;
        position: fixed;
        z-index: 2147483640;
      }
      #select2obsidian-highlight,
      #select2obsidian-drag {
        background: rgba(24, 105, 214, 0.12);
        border: 2px solid #1869d6;
        box-sizing: border-box;
        display: none;
        pointer-events: none;
        position: absolute;
        z-index: 2147483642;
      }
      #select2obsidian-drag {
        border-style: dashed;
      }
      #select2obsidian-toast {
        background: #111827;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        color: white;
        font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        left: 50%;
        max-width: min(520px, calc(100vw - 32px));
        padding: 10px 12px;
        pointer-events: none;
        position: fixed;
        top: 16px;
        transform: translateX(-50%);
        z-index: 2147483643;
      }
    `;
    document.head.append(style);
  }

  function toRect(x1, y1, x2, y2) {
    return {
      height: Math.abs(y2 - y1),
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1)
    };
  }

  function rectsIntersect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function elementsInRect(rect) {
    const viewportRect = {
      bottom: rect.top + rect.height,
      left: rect.left,
      right: rect.left + rect.width,
      top: rect.top
    };
    const candidates = Array.from(document.body.querySelectorAll("article, main, section, div, p, h1, h2, h3, h4, h5, h6, li, table, blockquote, img, a"))
      .filter((element) => {
        if (element.closest("#select2obsidian-overlay, #select2obsidian-highlight, #select2obsidian-toast, #select2obsidian-drag")) {
          return false;
        }
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && rectsIntersect(viewportRect, box);
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return aRect.top - bRect.top || aRect.left - bRect.left;
      });

    return candidates.filter((candidate) => !candidates.some((other) => other !== candidate && candidate.contains(other)));
  }

  async function beginCapture(elements, mode) {
    try {
      await captureElements(elements, mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not send selection to Obsidian.";
      showTransientMessage(message);
    }
  }

  async function captureElements(elements, mode) {
    const source = {
      capturedAt: new Date().toISOString(),
      title: document.title,
      url: location.href
    };
    const markdown = elements
      .map((element) => globalThis.Select2ObsidianMarkdown.elementToMarkdown(element, { baseUrl: location.href }))
      .filter(Boolean)
      .join("\n\n---\n\n");
    if (!markdown) {
      showTransientMessage("Nothing readable was found in that selection.");
      return;
    }

    const payload = {
      format: "markdown",
      markdown: globalThis.Select2ObsidianMarkdown.appendSource(markdown, source),
      selection: {
        mode,
        text: globalThis.Select2ObsidianMarkdown.normalizeWhitespace(elements.map((element) => element.innerText || element.alt || "").join(" ")).slice(0, 500)
      },
      source
    };

    await sendToObsidian(payload);
  }

  async function sendToObsidian(payload) {
    const settings = await chrome.storage.sync.get(DEFAULTS);
    if (!settings.token) {
      showTransientMessage("Set a Select2Obsidian token in the browser extension options first.");
      return;
    }

    const response = await fetch(settings.endpoint || DEFAULTS.endpoint, {
      body: JSON.stringify(payload),
      headers: {
        "Authorization": `Bearer ${settings.token}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(body || `Obsidian returned ${response.status}`);
    }

    showTransientMessage("Inserted into Obsidian.");
  }

  function showTransientMessage(message) {
    const node = document.createElement("div");
    node.textContent = message;
    node.style.cssText = `
      background: #111827;
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      color: white;
      font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      left: 50%;
      max-width: min(520px, calc(100vw - 32px));
      padding: 10px 12px;
      position: fixed;
      top: 16px;
      transform: translateX(-50%);
      z-index: 2147483644;
    `;
    document.documentElement.append(node);
    setTimeout(() => node.remove(), 2600);
  }
})();

