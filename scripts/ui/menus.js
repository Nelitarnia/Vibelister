// menus.js - menubar wiring: open/close menus, menu item actions, and view radio updates.
// Exported as an initializer so App.js can pass dependencies explicitly.

export function initMenus(deps) {
  const {
    dom = {},
    setActiveView,
    newProject,
    openFromDisk,
    saveToDisk,
    doGenerate,
    runSelfTests,
    model, // for Rules dialog
    openSettings,
    openProjectInfo,
    openCleanup,
    openInference,
    addRowsAbove,
    addRowsBelow,
    clearCells,
    deleteRows,
    undo,
    redo,
    getUndoState,
  } = deps;

  const menus = dom.menus || {};
  const items = dom.items || {};
  const viewRadios = dom.viewRadios || {};

  function closeAllMenus() {
    for (const k in menus) {
      menus[k].popup?.setAttribute("data-open", "false");
      menus[k].trigger?.setAttribute("aria-expanded", "false");
    }
  }

  function toggleMenu(key) {
    const m = menus[key];
    if (!m?.popup || !m?.trigger) return;
    const open = m.popup.getAttribute("data-open") === "true";
    closeAllMenus();
    if (!open) {
      if (key === "edit") refreshUndoMenu();
      const r = m.trigger.getBoundingClientRect();
      m.popup.style.left = r.left + "px";
      m.popup.style.top = r.bottom + "px";
      m.popup.setAttribute("data-open", "true");
      m.trigger.setAttribute("aria-expanded", "true");
    }
  }

  // Open/close behavior
  ["file", "edit", "sheet", "tools", "view"].forEach((k) => {
    menus?.[k]?.trigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu(k);
    });
  });
  document.addEventListener("click", () => closeAllMenus());
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });

  // View radios
  function updateViewMenuRadios(key) {
    Object.entries(viewRadios).forEach(([name, element]) => {
      element?.setAttribute("aria-checked", String(name === key));
    });
  }

  // Helpers
  const undoItem = items.undoMenuItem;
  const redoItem = items.redoMenuItem;

  const undoShortcutSuffix = " (Ctrl/Cmd+Z)";
  const redoShortcutSuffix = " (Ctrl/Cmd+Y)";

  function buildUndoRedoLabel(base, formatted, shortcutSuffix) {
    return formatted
      ? `${base} ${formatted}${shortcutSuffix}`
      : `${base}${shortcutSuffix}`;
  }

  function refreshUndoMenu() {
    if (typeof getUndoState !== "function") return;
    let state = null;
    try {
      state = getUndoState();
    } catch (_) {
      state = null;
    }
    const formatLabel = (value) => {
      if (!value) return "";
      const text = String(value).trim();
      if (!text) return "";
      return text.charAt(0).toUpperCase() + text.slice(1);
    };
    const undoLabel = state?.undoLabel ? String(state.undoLabel) : "";
    if (undoItem) {
      undoItem.disabled = !(state?.canUndo);
      const formatted = formatLabel(undoLabel);
      undoItem.textContent = buildUndoRedoLabel("Undo", formatted, undoShortcutSuffix);
    }
    const redoLabel = state?.redoLabel ? String(state.redoLabel) : "";
    if (redoItem) {
      redoItem.disabled = !(state?.canRedo);
      const formatted = formatLabel(redoLabel);
      redoItem.textContent = buildUndoRedoLabel("Redo", formatted, redoShortcutSuffix);
    }
  }

  refreshUndoMenu();

  // File menu
  items.fileNew?.addEventListener("click", () => {
    closeAllMenus();
    newProject();
  });
  items.fileOpenDisk?.addEventListener("click", () => {
    closeAllMenus();
    openFromDisk();
  });
  items.fileSaveDisk?.addEventListener("click", () => {
    closeAllMenus();
    saveToDisk(false);
  });
  items.fileSaveAs?.addEventListener("click", () => {
    closeAllMenus();
    saveToDisk(true);
  });
  items.fileProjectInfo?.addEventListener("click", async () => {
    closeAllMenus();
    if (typeof openProjectInfo === "function") {
      await openProjectInfo();
    }
  });
  items.fileExportJson?.addEventListener("click", () => {
    closeAllMenus();
    saveToDisk(true);
  }); // export = Save As fallback

  undoItem?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof undo === "function") undo();
  });
  redoItem?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof redo === "function") redo();
  });

  // Edit menu
  items.editPreferences?.addEventListener("click", async () => {
    closeAllMenus();
    if (typeof openSettings === "function") {
      await openSettings();
    }
  });

  // Sheet menu
  items.sheetAddRowsAbove?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof addRowsAbove === "function") addRowsAbove();
  });
  items.sheetAddRowsBelow?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof addRowsBelow === "function") addRowsBelow();
  });
  items.sheetClearCells?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof clearCells === "function") clearCells();
  });
  items.sheetDeleteRows?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof deleteRows === "function") deleteRows();
  });

  // Tools menu
  items.toolsGenerate?.addEventListener("click", () => {
    closeAllMenus();
    doGenerate();
  });
  items.toolsCleanup?.addEventListener("click", async () => {
    closeAllMenus();
    if (typeof openCleanup === "function") {
      await openCleanup();
    }
  });
  items.toolsInference?.addEventListener("click", async () => {
    closeAllMenus();
    if (typeof openInference === "function") {
      await openInference();
    }
  });
  items.toolsTests?.addEventListener("click", () => {
    closeAllMenus();
    runSelfTests();
  });
  items.toolsRules?.addEventListener("click", async () => {
    closeAllMenus();
    const { openRulesDialog } = await import("./rules.js");
    openRulesDialog(model);
  });

  // View menu
  items.viewActions?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("actions");
  });
  items.viewInputs?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("inputs");
  });
  items.viewModifiers?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("modifiers");
  });
  items.viewOutcomes?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("outcomes");
  });
  items.viewInteractions?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("interactions");
  });

  return { closeAllMenus, updateViewMenuRadios };
}
