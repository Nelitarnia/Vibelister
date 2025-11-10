// menus.js - menubar wiring: open/close menus, menu item actions, and view radio updates.
// Exported as an initializer so App.js can pass dependencies explicitly.

export function initMenus(deps) {
  const {
    Ids,
    setActiveView,
    newProject,
    openFromDisk,
    saveToDisk,
    doGenerate,
    runSelfTests,
    model, // for Rules dialog
    openSettings,
    addRowsAbove,
    addRowsBelow,
    clearCells,
    deleteRows,
    undo,
    redo,
    getUndoState,
  } = deps;

  const menus = {
    file: {
      trigger: document.getElementById(Ids.mFile),
      popup: document.getElementById(Ids.menuFile),
    },
    edit: {
      trigger: document.getElementById(Ids.mEdit),
      popup: document.getElementById(Ids.menuEdit),
    },
    sheet: {
      trigger: document.getElementById(Ids.mSheet),
      popup: document.getElementById(Ids.menuSheet),
    },
    tools: {
      trigger: document.getElementById(Ids.mTools),
      popup: document.getElementById(Ids.menuTools),
    },
    view: {
      trigger: document.getElementById(Ids.mView),
      popup: document.getElementById(Ids.menuView),
    },
  };

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
    menus[k].trigger?.addEventListener("click", (e) => {
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
    ["actions", "inputs", "modifiers", "interactions"].forEach((n) => {
      const e = document.getElementById("view-" + n);
      if (e) e.setAttribute("aria-checked", String(n === key));
    });
  }

  // Helpers
  const el = (id) => document.getElementById(id);
  const undoItem = el(Ids.editUndo);
  const redoItem = el(Ids.editRedo);

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
  el(Ids.fileNew)?.addEventListener("click", () => {
    closeAllMenus();
    newProject();
  });
  el(Ids.fileOpenDisk)?.addEventListener("click", () => {
    closeAllMenus();
    openFromDisk();
  });
  el(Ids.fileSaveDisk)?.addEventListener("click", () => {
    closeAllMenus();
    saveToDisk(false);
  });
  el(Ids.fileSaveAs)?.addEventListener("click", () => {
    closeAllMenus();
    saveToDisk(true);
  });
  el(Ids.fileExportJson)?.addEventListener("click", () => {
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
  el(Ids.editPreferences)?.addEventListener("click", async () => {
    closeAllMenus();
    if (typeof openSettings === "function") {
      await openSettings();
    }
  });

  // Sheet menu
  el(Ids.sheetAddRowsAbove)?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof addRowsAbove === "function") addRowsAbove();
  });
  el(Ids.sheetAddRowsBelow)?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof addRowsBelow === "function") addRowsBelow();
  });
  el(Ids.sheetClearCells)?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof clearCells === "function") clearCells();
  });
  el(Ids.sheetDeleteRows)?.addEventListener("click", () => {
    closeAllMenus();
    if (typeof deleteRows === "function") deleteRows();
  });

  // Tools menu
  el(Ids.toolsGenerate)?.addEventListener("click", () => {
    closeAllMenus();
    doGenerate();
  });
  el(Ids.toolsTests)?.addEventListener("click", () => {
    closeAllMenus();
    runSelfTests();
  });
  el(Ids.toolsRules)?.addEventListener("click", async () => {
    closeAllMenus();
    const { openRulesDialog } = await import("./rules.js");
    openRulesDialog(model);
  });

  // View menu
  el(Ids.viewActions)?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("actions");
  });
  el(Ids.viewInputs)?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("inputs");
  });
  el(Ids.viewModifiers)?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("modifiers");
  });
  el(Ids.viewOutcomes)?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("outcomes");
  });
  el(Ids.viewInteractions)?.addEventListener("click", () => {
    closeAllMenus();
    setActiveView("interactions");
  });

  return { closeAllMenus, updateViewMenuRadios };
}
