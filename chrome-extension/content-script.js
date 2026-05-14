(function () {
  if (globalThis.__select2ObsidianContentLoaded) {
    return;
  }
  globalThis.__select2ObsidianContentLoaded = true;

  const DEFAULTS = {
    endpoint: "http://127.0.0.1:27124/capture",
    includeSource: true,
    token: "select2obsidian-local-default-token"
  };

  const SESSION_UI_SELECTOR = [
    "#select2obsidian-overlay",
    "#select2obsidian-highlight",
    "#select2obsidian-toast",
    "#select2obsidian-drag",
    "#select2obsidian-actions",
    ".select2obsidian-pin"
  ].join(", ");
  const INTERACTIVE_UI_SELECTOR = "#select2obsidian-actions, .select2obsidian-pin";

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
    const actions = createActionsBar();
    let highlighted = null;
    let isDragging = false;
    let dragStart = null;
    let selectionResult = null;
    let isPreparing = false;
    let isWorking = false;

    overlay.id = "select2obsidian-overlay";
    box.id = "select2obsidian-highlight";
    toast.id = "select2obsidian-toast";
    dragBox.id = "select2obsidian-drag";
    actions.node.id = "select2obsidian-actions";
    toast.textContent = "Click an element. Hold Shift and drag to capture a rectangle. Esc cancels.";

    function start() {
      injectStyles();
      document.documentElement.append(overlay, box, toast, dragBox, actions.node);
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
      actions.node.remove();
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
      if (selectionResult || isPreparing || isInteractiveUi(event.target)) {
        return;
      }

      if (isDragging && dragStart) {
        event.preventDefault();
        event.stopPropagation();
        box.style.display = "none";
        renderDragBox(toRect(dragStart.x, dragStart.y, event.clientX, event.clientY));
        return;
      }

      const element = elementFromPoint(event.clientX, event.clientY);
      if (element && element !== highlighted) {
        highlighted = element;
        renderHighlight(rectWithEdges(element.getBoundingClientRect()));
      }
    }

    function onMouseDown(event) {
      if (isInteractiveUi(event.target)) {
        return;
      }

      if (selectionResult || isPreparing) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

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
      if (isInteractiveUi(event.target)) {
        return;
      }

      if (!isDragging || !dragStart) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = toRect(dragStart.x, dragStart.y, event.clientX, event.clientY);
      isDragging = false;
      dragStart = null;
      const elements = elementsInRect(rect);
      if (!elements.length) {
        dragBox.style.display = "none";
        showTransientMessage("Nothing readable was found in that selection.");
        return;
      }
      prepareSelection(elements, "rectangle", rect);
    }

    function onClick(event) {
      if (isInteractiveUi(event.target)) {
        return;
      }

      if (selectionResult || isPreparing || isDragging || event.shiftKey) {
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
      prepareSelection([element], "element", rectWithEdges(element.getBoundingClientRect()));
    }

    async function prepareSelection(elements, mode, rect) {
      if (isPreparing) {
        return;
      }
      isPreparing = true;
      try {
        const result = await buildSelectionResult(elements, mode, rect);
        if (!result) {
          showTransientMessage("Nothing readable was found in that selection.");
          return;
        }

        selectionResult = result;
        highlighted = null;
        toast.textContent = "Choose an action. Esc cancels.";
        actions.status.textContent = "";

        if (mode === "rectangle") {
          box.style.display = "none";
          renderDragBox(result.rect);
        } else {
          dragBox.style.display = "none";
          renderHighlight(result.rect);
        }

        renderActions(result.rect);
      } catch (error) {
        showTransientMessage(error instanceof Error ? error.message : "Could not prepare the selection.");
      } finally {
        isPreparing = false;
      }
    }

    function createActionsBar() {
      const node = document.createElement("div");
      const send = document.createElement("button");
      const pin = document.createElement("button");
      const copy = document.createElement("button");
      const copyImage = document.createElement("button");
      const status = document.createElement("span");

      send.type = "button";
      pin.type = "button";
      copy.type = "button";
      copyImage.type = "button";
      send.textContent = "Send to Obsidian";
      pin.textContent = "Pin to screen";
      copy.textContent = "Copy";
      copyImage.textContent = "Copy as image";
      status.className = "select2obsidian-action-status";
      node.append(send, pin, copy, copyImage, status);

      send.addEventListener("click", async () => {
        if (!selectionResult || isWorking) {
          return;
        }
        const result = selectionResult;
        await runAction("Sending...", async () => sendToObsidian(result.payload), "Inserted into Obsidian.");
      });

      pin.addEventListener("click", async () => {
        if (!selectionResult || isWorking) {
          return;
        }
        const result = selectionResult;
        await runAction("Pinning...", async () => pinSelection(result), "Pinned selection.");
      });

      copy.addEventListener("click", async () => {
        if (!selectionResult || isWorking) {
          return;
        }
        const markdown = selectionResult.payload.markdown;
        await runAction("Copying...", async () => copyText(markdown), "Copied Markdown.");
      });

      copyImage.addEventListener("click", async () => {
        if (!selectionResult || isWorking) {
          return;
        }
        const result = selectionResult;
        await runAction("Copying image...", async () => {
          const dataUrl = await withSelectionUiHidden(() => captureSelectionImage(result.rect));
          await copyImageDataUrl(dataUrl);
        }, "Copied image.");
      });

      async function runAction(workingText, action, successText) {
        isWorking = true;
        setActionsDisabled(true);
        status.textContent = workingText;
        try {
          await action();
          stop();
          showTransientMessage(successText);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Action failed.";
          stop();
          showTransientMessage(message);
        } finally {
          isWorking = false;
          setActionsDisabled(false);
        }
      }

      function setActionsDisabled(disabled) {
        send.disabled = disabled;
        pin.disabled = disabled;
        copy.disabled = disabled;
        copyImage.disabled = disabled;
      }

      return { node, status };
    }

    function elementFromPoint(x, y) {
      const ignored = [overlay, box, toast, dragBox, actions.node];
      ignored.forEach((node) => (node.style.pointerEvents = "none"));
      const element = document.elementFromPoint(x, y);
      ignored.forEach((node) => (node.style.pointerEvents = ""));
      if (!element || ignored.includes(element) || element.closest(SESSION_UI_SELECTOR)) {
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

    function renderActions(rect) {
      actions.node.style.display = "flex";
      actions.node.style.left = "0px";
      actions.node.style.top = "0px";

      const anchor = clipRectToViewport(rect);
      const actionRect = actions.node.getBoundingClientRect();
      const margin = 8;
      const left = clamp(anchor.left, margin, Math.max(margin, window.innerWidth - actionRect.width - margin));
      const belowTop = anchor.bottom + margin;
      const aboveTop = anchor.top - actionRect.height - margin;
      const top = belowTop + actionRect.height <= window.innerHeight ? belowTop : Math.max(margin, aboveTop);
      actions.node.style.left = `${left + window.scrollX}px`;
      actions.node.style.top = `${top + window.scrollY}px`;
    }

    async function pinSelection(result) {
      const pinWindow = await requestPinWindow(result.rect);
      try {
        const dataUrl = await withSelectionUiHidden(() => captureSelectionImage(result.rect));
        if (pinWindow) {
          renderPictureInPicturePin(pinWindow, dataUrl, result.payload.markdown);
          return;
        }
        createInlinePin(dataUrl, result.payload.markdown);
      } catch (error) {
        pinWindow?.close();
        throw error;
      }
    }

    async function requestPinWindow(rect) {
      const pip = window.documentPictureInPicture;
      if (!pip?.requestWindow) {
        return null;
      }

      const clipped = clipRectToViewport(rect);
      const width = Math.round(clamp(clipped.width, 320, 900));
      const height = Math.round(clamp(clipped.height + 48, 180, 760));
      try {
        const pinWindow = await pip.requestWindow({ width, height });
        pinWindow.document.body.textContent = "Pinning...";
        pinWindow.document.body.style.cssText = "margin:0;font:13px system-ui,sans-serif;display:grid;place-items:center;background:#111827;color:white;";
        return pinWindow;
      } catch {
        return null;
      }
    }

    async function withSelectionUiHidden(callback) {
      const nodes = [overlay, box, toast, dragBox, actions.node];
      const previous = nodes.map((node) => node.style.visibility);
      nodes.forEach((node) => {
        node.style.visibility = "hidden";
      });
      await nextFrame();
      await nextFrame();
      try {
        return await callback();
      } finally {
        nodes.forEach((node, index) => {
          node.style.visibility = previous[index];
        });
      }
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
      #select2obsidian-toast,
      #select2obsidian-actions,
      .select2obsidian-pin {
        color-scheme: light;
        font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #select2obsidian-toast {
        background: #111827;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        color: white;
        left: 50%;
        max-width: min(520px, calc(100vw - 32px));
        padding: 10px 12px;
        pointer-events: none;
        position: fixed;
        top: 16px;
        transform: translateX(-50%);
        z-index: 2147483643;
      }
      #select2obsidian-actions {
        align-items: center;
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
        box-sizing: border-box;
        display: none;
        flex-wrap: wrap;
        gap: 8px;
        max-width: min(680px, calc(100vw - 16px));
        padding: 8px;
        position: absolute;
        z-index: 2147483644;
      }
      #select2obsidian-actions button,
      .select2obsidian-pin button {
        appearance: none;
        background: #ffffff;
        border: 0;
        border-radius: 6px;
        color: #111827;
        cursor: pointer;
        font: 600 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-height: 32px;
        padding: 0 12px;
        white-space: nowrap;
      }
      #select2obsidian-actions button {
        flex: 0 0 auto;
      }
      #select2obsidian-actions button:first-child {
        background: #1869d6;
        color: white;
      }
      #select2obsidian-actions button:disabled {
        cursor: wait;
        opacity: 0.65;
      }
      #select2obsidian-actions .select2obsidian-action-status {
        color: #d1d5db;
        flex: 1 1 120px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .select2obsidian-pin {
        background: #111827;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.32);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        max-height: min(80vh, 760px);
        max-width: min(80vw, 900px);
        overflow: hidden;
        position: fixed;
        z-index: 2147483645;
      }
      .select2obsidian-pin-header {
        align-items: center;
        color: white;
        cursor: move;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        padding: 8px;
        user-select: none;
      }
      .select2obsidian-pin-status {
        color: #d1d5db;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .select2obsidian-pin img {
        background: white;
        display: block;
        max-height: calc(min(80vh, 760px) - 48px);
        max-width: min(80vw, 900px);
        object-fit: contain;
      }
    `;
    document.head.append(style);
  }

  async function buildSelectionResult(elements, mode, rect) {
    const settings = await chrome.storage.sync.get(DEFAULTS);
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
      return null;
    }

    const payload = {
      format: "markdown",
      markdown: settings.includeSource === false ? markdown : globalThis.Select2ObsidianMarkdown.appendSource(markdown, source),
      selection: {
        mode,
        text: globalThis.Select2ObsidianMarkdown.normalizeWhitespace(elements.map((element) => element.innerText || element.alt || "").join(" ")).slice(0, 500)
      },
      source
    };

    return {
      payload,
      rect: rectWithEdges(rect)
    };
  }

  function toRect(x1, y1, x2, y2) {
    return rectWithEdges({
      height: Math.abs(y2 - y1),
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1)
    });
  }

  function rectWithEdges(rect) {
    const left = Number(rect.left) || 0;
    const top = Number(rect.top) || 0;
    const width = Math.max(0, Number(rect.width) || 0);
    const height = Math.max(0, Number(rect.height) || 0);
    return {
      bottom: top + height,
      height,
      left,
      right: left + width,
      top,
      width
    };
  }

  function rectsIntersect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function clipRectToViewport(rect) {
    const left = clamp(rect.left, 0, window.innerWidth);
    const top = clamp(rect.top, 0, window.innerHeight);
    const right = clamp(rect.right, 0, window.innerWidth);
    const bottom = clamp(rect.bottom, 0, window.innerHeight);
    return rectWithEdges({
      height: Math.max(1, bottom - top),
      left,
      top,
      width: Math.max(1, right - left)
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function isInteractiveUi(target) {
    return target instanceof Element && Boolean(target.closest(INTERACTIVE_UI_SELECTOR));
  }

  function elementsInRect(rect) {
    const viewportRect = rectWithEdges(rect);
    const candidates = Array.from(document.body.querySelectorAll("article, main, section, div, p, h1, h2, h3, h4, h5, h6, li, table, blockquote, img, a"))
      .filter((element) => {
        if (element.closest(SESSION_UI_SELECTOR)) {
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

  async function sendToObsidian(payload) {
    const settings = await chrome.storage.sync.get(DEFAULTS);
    if (!settings.token) {
      throw new Error("Set a Select to Note token first.");
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
  }

  async function captureSelectionImage(rect) {
    const response = await chrome.runtime.sendMessage({ type: "S2O_CAPTURE_VISIBLE_TAB" });
    if (!response?.ok || !response.dataUrl) {
      throw new Error(response?.error || "Could not capture the selected area.");
    }

    const image = await loadImage(response.dataUrl);
    const clipped = clipRectToViewport(rect);
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(clipped.width * scaleX));
    canvas.height = Math.max(1, Math.round(clipped.height * scaleY));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not prepare the screenshot.");
    }
    context.drawImage(
      image,
      Math.round(clipped.left * scaleX),
      Math.round(clipped.top * scaleY),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
    return canvas.toDataURL("image/png");
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not load the screenshot."));
      image.src = src;
    });
  }

  function renderPictureInPicturePin(pinWindow, imageDataUrl, markdown) {
    const pinDocument = pinWindow.document;
    pinDocument.body.textContent = "";
    const style = pinDocument.createElement("style");
    style.textContent = `
      html,
      body {
        background: #111827;
        height: 100%;
        margin: 0;
      }
      body {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
      }
      .toolbar {
        align-items: center;
        background: #111827;
        box-sizing: border-box;
        color: white;
        display: flex;
        gap: 8px;
        min-height: 52px;
        padding: 8px;
        position: relative;
        z-index: 2;
      }
      .status {
        color: #d1d5db;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      button {
        appearance: none;
        background: white;
        border: 0;
        border-radius: 6px;
        color: #111827;
        cursor: pointer;
        font: 600 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        min-height: 30px;
        padding: 0 10px;
      }
      .image-frame {
        align-items: center;
        background: white;
        display: flex;
        justify-content: center;
        min-height: 0;
        overflow: hidden;
      }
      img {
        display: block;
        height: 100%;
        max-height: 100%;
        max-width: 100%;
        object-fit: contain;
        width: 100%;
      }
    `;
    const toolbar = pinDocument.createElement("div");
    const status = pinDocument.createElement("span");
    const copy = pinDocument.createElement("button");
    const copyImage = pinDocument.createElement("button");
    const close = pinDocument.createElement("button");
    const imageFrame = pinDocument.createElement("div");
    const image = pinDocument.createElement("img");

    toolbar.className = "toolbar";
    status.className = "status";
    status.textContent = "Pinned selection";
    copy.type = "button";
    copy.textContent = "Copy Markdown";
    copyImage.type = "button";
    copyImage.textContent = "Copy Image";
    close.type = "button";
    close.textContent = "Close";
    imageFrame.className = "image-frame";
    image.alt = "Pinned selection";
    image.src = imageDataUrl;

    copy.addEventListener("click", async () => {
      try {
        await copyText(markdown, pinDocument);
        status.textContent = "Copied Markdown.";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Copy failed.";
      }
    });
    copyImage.addEventListener("click", async () => {
      try {
        await copyImageDataUrl(imageDataUrl, pinDocument);
        status.textContent = "Copied image.";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Copy failed.";
      }
    });
    close.addEventListener("click", () => pinWindow.close());

    toolbar.append(status, copy, copyImage, close);
    imageFrame.append(image);
    pinDocument.head.append(style);
    pinDocument.body.append(toolbar, imageFrame);
  }

  function createInlinePin(imageDataUrl, markdown) {
    const pin = document.createElement("div");
    const header = document.createElement("div");
    const status = document.createElement("span");
    const copy = document.createElement("button");
    const copyImage = document.createElement("button");
    const close = document.createElement("button");
    const image = document.createElement("img");
    let dragOffset = null;

    pin.className = "select2obsidian-pin";
    header.className = "select2obsidian-pin-header";
    status.className = "select2obsidian-pin-status";
    status.textContent = "Pinned selection";
    copy.type = "button";
    copy.textContent = "Copy Markdown";
    copyImage.type = "button";
    copyImage.textContent = "Copy Image";
    close.type = "button";
    close.textContent = "Close";
    image.alt = "Pinned selection";
    image.src = imageDataUrl;
    pin.style.left = "24px";
    pin.style.top = "24px";

    copy.addEventListener("click", async () => {
      try {
        await copyText(markdown);
        status.textContent = "Copied Markdown.";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Copy failed.";
      }
    });
    copyImage.addEventListener("click", async () => {
      try {
        await copyImageDataUrl(imageDataUrl);
        status.textContent = "Copied image.";
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Copy failed.";
      }
    });

    const onMouseDown = (event) => {
      if (event.button !== 0 || event.target instanceof HTMLButtonElement) {
        return;
      }
      const rect = pin.getBoundingClientRect();
      dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      event.preventDefault();
      event.stopPropagation();
    };
    const onMouseMove = (event) => {
      if (!dragOffset || !pin.isConnected) {
        return;
      }
      pin.style.left = `${clamp(event.clientX - dragOffset.x, 0, window.innerWidth - 80)}px`;
      pin.style.top = `${clamp(event.clientY - dragOffset.y, 0, window.innerHeight - 48)}px`;
    };
    const onMouseUp = () => {
      dragOffset = null;
    };
    const closePin = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      pin.remove();
    };

    close.addEventListener("click", closePin);
    header.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    header.append(status, copy, copyImage, close);
    pin.append(header, image);
    document.documentElement.append(pin);
  }

  async function copyText(text, targetDocument = document) {
    const targetWindow = targetDocument.defaultView || window;
    if (targetWindow.navigator.clipboard?.writeText) {
      await targetWindow.navigator.clipboard.writeText(text);
      return;
    }

    const textArea = targetDocument.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.cssText = "height:1px;left:-9999px;opacity:0;position:fixed;top:0;width:1px;";
    targetDocument.body.append(textArea);
    textArea.select();
    const ok = targetDocument.execCommand("copy");
    textArea.remove();
    if (!ok) {
      throw new Error("Copy failed.");
    }
  }

  async function copyImageDataUrl(dataUrl, targetDocument = document) {
    const targetWindow = targetDocument.defaultView || window;
    const clipboard = targetWindow.navigator.clipboard;
    const ClipboardItemCtor = targetWindow.ClipboardItem || window.ClipboardItem;
    if (!clipboard?.write || !ClipboardItemCtor) {
      throw new Error("Image copy is not supported in this browser.");
    }

    const blob = await dataUrlToBlob(dataUrl);
    await clipboard.write([new ClipboardItemCtor({ [blob.type]: blob })]);
  }

  async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    if (blob.type !== "image/png") {
      return new Blob([blob], { type: "image/png" });
    }
    return blob;
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
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
      z-index: 2147483646;
    `;
    document.documentElement.append(node);
    setTimeout(() => node.remove(), 2600);
  }
})();
