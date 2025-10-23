// color-picker.js — lightweight inline color picker for color columns.

export function initColorPicker(ctx = {}) {
  const {
    parent,
    sheet,
    sel,
    getCellRect,
    getColorValue,
    setColorValue,
    render,
    makeUndoConfig,
    beginUndoableTransaction,
  } = ctx;
  if (!parent || !sheet || !sel || !getCellRect || !setColorValue || !render) {
    return {
      openColor: () => false,
      close: () => {},
      isOpen: () => false,
    };
  }

  const STORAGE_KEY = "vl.recentColors";
  let recentColors = [];
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        recentColors = parsed
          .map((c) => normalizeColor(c))
          .filter((c, idx, arr) => c && arr.indexOf(c) === idx);
      }
    }
  } catch (_) {}

  let root = null;
  let colorInput = null;
  let hexInput = null;
  let applyBtn = null;
  let clearBtn = null;
  let closeBtn = null;
  let recentWrap = null;
  let isSyncing = false;
  const state = {
    isOpen: false,
    target: null,
    current: "",
    initial: "",
  };

  let previewTx = null;
  let previewResult = null;

  function resetPreviewTransaction() {
    if (previewTx && typeof previewTx.cancel === "function") {
      try {
        previewTx.cancel();
      } catch (_) {
        /* noop */
      }
    }
    previewTx = null;
    previewResult = null;
  }

  function ensurePreviewTransaction() {
    if (previewTx || typeof beginUndoableTransaction !== "function") return;
    const undoConfig =
      typeof makeUndoConfig === "function"
        ? makeUndoConfig({
            label: "cell edit",
            shouldRecord: (res) => (res?.changedCells ?? 0) > 0,
          })
        : undefined;
    const tx = beginUndoableTransaction("setCellSelectionAware", {
      render: true,
      undo: undoConfig,
    });
    if (tx && typeof tx === "object") {
      previewTx = tx;
      previewResult = null;
    }
  }

  function finalizePreviewTransaction() {
    if (!previewTx) return;
    try {
      if (typeof previewTx.commit === "function") {
        previewTx.commit(previewResult);
      } else if (typeof previewTx.cancel === "function") {
        previewTx.cancel();
      }
    } catch (_) {
      try {
        previewTx.cancel?.();
      } catch (_) {
        /* noop */
      }
    }
    resetPreviewTransaction();
  }

  function ensureDOM() {
    if (root) return;
    root = document.createElement("div");
    root.id = "vlColorPicker";
    Object.assign(root.style, {
      position: "absolute",
      zIndex: "10050",
      display: "none",
      minWidth: "220px",
      maxWidth: "260px",
      padding: "10px",
      background: "#111827",
      border: "1px solid #374151",
      boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
      borderRadius: "8px",
      color: "#f9fafb",
      fontSize: "12px",
      lineHeight: "1.3",
    });

    const header = document.createElement("div");
    header.textContent = "Pick a color";
    header.style.fontWeight = "600";
    header.style.marginBottom = "8px";
    root.appendChild(header);

    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "×";
    Object.assign(closeBtn.style, {
      position: "absolute",
      top: "6px",
      right: "8px",
      width: "20px",
      height: "20px",
      border: "none",
      borderRadius: "4px",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      fontSize: "16px",
    });
    closeBtn.setAttribute("aria-label", "Close color picker");
    closeBtn.onmouseenter = () => {
      closeBtn.style.background = "rgba(255,255,255,0.12)";
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.background = "transparent";
    };
    closeBtn.onclick = (ev) => {
      ev.preventDefault();
      close();
    };
    root.appendChild(closeBtn);

    const controlsRow = document.createElement("div");
    controlsRow.style.display = "flex";
    controlsRow.style.gap = "8px";
    controlsRow.style.alignItems = "center";
    controlsRow.style.marginBottom = "8px";
    root.appendChild(controlsRow);

    colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.style.width = "48px";
    colorInput.style.height = "32px";
    colorInput.style.border = "none";
    colorInput.style.background = "transparent";
    colorInput.style.cursor = "pointer";
    colorInput.style.padding = "0";
    colorInput.style.flex = "0 0 auto";
    controlsRow.appendChild(colorInput);

    hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.placeholder = "#RRGGBB";
    Object.assign(hexInput.style, {
      flex: "1 1 auto",
      padding: "6px 8px",
      borderRadius: "4px",
      border: "1px solid #4b5563",
      background: "#111827",
      color: "inherit",
    });
    controlsRow.appendChild(hexInput);

    const buttonsRow = document.createElement("div");
    buttonsRow.style.display = "flex";
    buttonsRow.style.gap = "8px";
    buttonsRow.style.marginBottom = "8px";
    root.appendChild(buttonsRow);

    applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "Apply";
    Object.assign(applyBtn.style, buttonStyle());
    buttonsRow.appendChild(applyBtn);

    clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    Object.assign(clearBtn.style, buttonStyle(true));
    buttonsRow.appendChild(clearBtn);

    const recentLabel = document.createElement("div");
    recentLabel.textContent = "Recent";
    recentLabel.style.fontSize = "11px";
    recentLabel.style.opacity = "0.75";
    recentLabel.style.marginBottom = "6px";
    root.appendChild(recentLabel);

    recentWrap = document.createElement("div");
    recentWrap.style.display = "flex";
    recentWrap.style.flexWrap = "wrap";
    recentWrap.style.gap = "6px";
    recentWrap.style.maxHeight = "120px";
    recentWrap.style.overflowY = "auto";
    root.appendChild(recentWrap);

    parent.appendChild(root);
    root.addEventListener("keydown", onRootKeyDown);

    colorInput.addEventListener("input", () => {
      if (isSyncing) return;
      const normalized = normalizeColor(colorInput.value);
      if (!normalized) return;
      state.current = normalized;
      updateInputs(normalized);
      applyColor(normalized, { recordRecent: false, isPreview: true });
    });

    hexInput.addEventListener("input", () => {
      if (isSyncing) return;
      const rawValue = hexInput.value;
      const sanitized = sanitizeHexInputValue(rawValue);
      if (rawValue !== sanitized) {
        const caret = hexInput.selectionStart;
        hexInput.value = sanitized;
        if (typeof caret === "number") {
          const insertedHash =
            sanitized.startsWith("#") && !rawValue.startsWith("#");
          const desiredCaret = insertedHash ? caret + 1 : caret;
          const nextPos = Math.min(sanitized.length, Math.max(0, desiredCaret));
          window.requestAnimationFrame(() => {
            hexInput.selectionStart = hexInput.selectionEnd = nextPos;
          });
        }
      }
      const digits = sanitized.replace(/^#/, "");
      if (digits.length === 6) {
        const normalized = normalizeColor(sanitized);
        if (!normalized) return;
        state.current = normalized;
        updateInputs(normalized);
      }
    });

    hexInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const normalized = normalizeColor(hexInput.value);
        if (!normalized) return;
        state.current = normalized;
        updateInputs(normalized);
        applyColor(normalized, { closeAfter: true, recordRecent: true });
      }
    });

    applyBtn.onclick = (e) => {
      e.preventDefault();
      const normalized = normalizeColor(hexInput.value || colorInput.value);
      if (!normalized) return;
      state.current = normalized;
      updateInputs(normalized);
      applyColor(normalized, { closeAfter: true, recordRecent: true });
    };

    clearBtn.onclick = (e) => {
      e.preventDefault();
      applyColor("", { closeAfter: true, recordRecent: false });
    };
  }

  function buttonStyle(isGhost = false) {
    return {
      flex: "1 1 0%",
      padding: "6px 10px",
      borderRadius: "4px",
      border: "1px solid " + (isGhost ? "#4b5563" : "#2563eb"),
      background: isGhost ? "transparent" : "#2563eb",
      color: isGhost ? "inherit" : "white",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "500",
    };
  }

  function getFocusableElements() {
    if (!root) return [];
    const candidates = Array.from(
      root.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    return candidates.filter(
      (el) =>
        !el.hasAttribute("disabled") &&
        el.getAttribute("aria-hidden") !== "true" &&
        el.tabIndex !== -1,
    );
  }

  function focusElement(el) {
    if (!el) return;
    try {
      el.focus();
      if (typeof el.select === "function") el.select();
    } catch (_) {}
  }

  function cycleFocus(forward) {
    const focusables = getFocusableElements();
    if (!focusables.length) return;
    let idx = focusables.indexOf(document.activeElement);
    if (idx === -1) idx = forward ? 0 : focusables.length - 1;
    else {
      idx = (idx + (forward ? 1 : -1) + focusables.length) % focusables.length;
    }
    const target = focusables[idx];
    focusElement(target);
  }

  function normalizeColor(raw) {
    if (!raw) return "";
    let s = String(raw).trim();
    if (!s) return "";
    if (s.startsWith("#")) s = s.slice(1);
    s = s.replace(/[^0-9a-fA-F]/g, "");
    if (s.length === 3) {
      s = s
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    if (s.length !== 6) return "";
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return "";
    return "#" + s.toUpperCase();
  }

  function sanitizeHexInputValue(raw) {
    if (!raw) return "";
    let value = String(raw).trim();
    if (!value) return "";
    const hasHash = value.startsWith("#");
    const digits = value
      .replace(/[^0-9a-fA-F]/g, "")
      .slice(0, 6)
      .toUpperCase();
    if (!digits) return hasHash ? "#" : "";
    return `#${digits}`;
  }

  function saveRecents() {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(recentColors));
    } catch (_) {}
  }

  function pushRecent(color) {
    if (!color) return;
    recentColors = recentColors.filter((c) => c !== color);
    recentColors.unshift(color);
    if (recentColors.length > 18) recentColors.length = 18;
    saveRecents();
    renderRecents();
  }

  function renderRecents() {
    if (!recentWrap) return;
    recentWrap.innerHTML = "";
    if (!recentColors.length) {
      const empty = document.createElement("div");
      empty.textContent = "No colors yet";
      empty.style.opacity = "0.6";
      empty.style.fontSize = "11px";
      recentWrap.appendChild(empty);
      return;
    }
    recentColors.forEach((color) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.title = color;
      Object.assign(swatch.style, {
        width: "24px",
        height: "24px",
        borderRadius: "4px",
        border: "1px solid #4b5563",
        cursor: "pointer",
        background: color,
      });
      swatch.onclick = (e) => {
        e.preventDefault();
        state.current = color;
        updateInputs(color);
        applyColor(color, { closeAfter: true, recordRecent: true });
      };
      recentWrap.appendChild(swatch);
    });
  }

  function updateInputs(color) {
    if (!colorInput || !hexInput) return;
    isSyncing = true;
    const fallback = color || "#000000";
    colorInput.value = fallback;
    hexInput.value = color || "";
    isSyncing = false;
  }

  function applyColor(raw, options = {}) {
    if (!state.target) return;
    const {
      closeAfter = false,
      recordRecent = false,
      isPreview = false,
    } = options;
    if (isPreview) ensurePreviewTransaction();
    const color = normalizeColor(raw);
    const valueToSet = color || "";
    const result = setColorValue(state.target.r, state.target.c, valueToSet);
    if (previewTx && result != null) {
      previewResult = result;
    }
    render();
    if (color) {
      if (recordRecent) pushRecent(color);
      state.current = color;
    } else {
      state.current = "";
      updateInputs("");
    }
    if (closeAfter) close();
  }

  function openColor(target = null) {
    ensureDOM();
    renderRecents();
    const r = target?.row ?? sel.r;
    const c = target?.col ?? sel.c;
    if (!Number.isFinite(r) || !Number.isFinite(c) || r < 0 || c < 0)
      return false;
    const rect = getCellRect(r, c);
    finalizePreviewTransaction();
    state.target = { r, c };
    const initial = normalizeColor(getColorValue ? getColorValue(r, c) : "");
    state.initial = initial;
    state.current = initial;
    updateInputs(initial);
    root.style.display = "block";
    root.setAttribute("data-open", "true");
    positionPicker(rect);
    state.isOpen = true;
    window.requestAnimationFrame(() => {
      hexInput?.focus();
      if (hexInput && hexInput.value) hexInput.select();
    });
    return true;
  }

  function positionPicker(rect) {
    if (!root) return;
    const padding = 6;
    const baseLeft = rect.left;
    const desiredTop = rect.top + rect.height + padding;
    root.style.left = `${Math.max(0, baseLeft)}px`;
    root.style.top = `${desiredTop}px`;
    const maxLeft = sheet.clientWidth - root.offsetWidth - padding;
    if (baseLeft > maxLeft) {
      root.style.left = `${Math.max(0, maxLeft)}px`;
    }
    const maxTop = sheet.clientHeight - root.offsetHeight - padding;
    if (desiredTop > maxTop) {
      const above = rect.top - root.offsetHeight - padding;
      root.style.top = `${Math.max(0, above)}px`;
    }
  }

  function close() {
    if (!state.isOpen || !root) return;
    finalizePreviewTransaction();
    root.style.display = "none";
    root.removeAttribute("data-open");
    state.isOpen = false;
    state.target = null;
    state.initial = "";
  }

  function onDocMouseDown(ev) {
    if (!state.isOpen || !root) return;
    if (root.contains(ev.target)) return;
    close();
  }

  function onDocKeyDown(ev) {
    if (!state.isOpen) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    }
  }

  function onRootKeyDown(ev) {
    if (!state.isOpen) return;
    if (ev.key === "Tab") {
      ev.preventDefault();
      ev.stopPropagation();
      cycleFocus(!ev.shiftKey);
    }
  }

  document.addEventListener("mousedown", onDocMouseDown, true);
  document.addEventListener("keydown", onDocKeyDown, true);
  sheet.addEventListener(
    "scroll",
    () => {
      if (state.isOpen) close();
    },
    { passive: true },
  );

  return {
    openColor,
    close,
    isOpen: () => state.isOpen,
  };
}
