import { MIN_ROWS as DEFAULT_MIN_ROWS } from "../data/constants.js";

const EMPTY_STATE = () => ({ row: 0, col: 0, scrollTop: 0 });

export function createViewStateController(options = {}) {
  const {
    getActiveView = () => "actions",
    model,
    VIEWS = {},
    buildInteractionPhaseColumns = () => [],
    Selection,
    MIN_ROWS = DEFAULT_MIN_ROWS,
    MOD,
    statusBar,
    getPaletteAPI,
    parsePhasesSpec,
    formatPhasesSpec,
    getInteractionsCell,
    setInteractionsCell,
    getStructuredCellInteractions,
    applyStructuredCellInteractions,
  } = options;

  const perViewState = {
    actions: EMPTY_STATE(),
    inputs: EMPTY_STATE(),
    modifiers: EMPTY_STATE(),
    outcomes: EMPTY_STATE(),
    interactions: EMPTY_STATE(),
  };

  function getActiveViewState() {
    const key = getActiveView();
    return perViewState[key] || null;
  }

  function saveCurrentViewState({ sel, sheet } = {}) {
    const state = getActiveViewState();
    if (!state) return;
    if (sel) {
      state.row = sel.r | 0;
      state.col = sel.c | 0;
    }
    if (sheet) state.scrollTop = sheet.scrollTop | 0;
  }

  function restoreViewState(key) {
    const state = perViewState[key];
    if (!state) return EMPTY_STATE();
    return state;
  }

  function resetAllViewState() {
    for (const key of Object.keys(perViewState)) perViewState[key] = EMPTY_STATE();
  }

  let cachedViewDef = null;
  let cachedViewKey = null;
  let cachedViewColumns = null;
  let cachedInteractionsMode = null;

  function viewDef() {
    const activeView = getActiveView();
    const base = VIEWS[activeView];
    if (!base) return base;

    const mode = String(model?.meta?.interactionsMode || "AI").toUpperCase();
    const columns = base.columns;

    if (
      cachedViewDef &&
      cachedViewKey === activeView &&
      cachedViewColumns === columns &&
      (activeView !== "interactions" || cachedInteractionsMode === mode)
    ) {
      return cachedViewDef;
    }

    let result = base;
    if (activeView === "interactions") {
      const cols = Array.isArray(columns)
        ? columns.filter((col) => {
            if (!col || col.hiddenWhen == null) return true;
            const hidden = col.hiddenWhen;
            if (Array.isArray(hidden)) {
              const variants = hidden.map((x) => String(x).toUpperCase());
              return !variants.includes(mode);
            }
            return String(hidden).toUpperCase() !== mode;
          })
        : columns;
      result = { ...base, columns: cols };
    }

    cachedViewDef = result;
    cachedViewKey = activeView;
    cachedViewColumns = columns;
    cachedInteractionsMode = mode;
    return result;
  }

  function invalidateViewDef() {
    cachedViewDef = null;
    cachedViewKey = null;
    cachedViewColumns = null;
    cachedInteractionsMode = null;
  }

  function rebuildInteractionPhaseColumns() {
    if (!VIEWS?.interactions) return;
    VIEWS.interactions.columns = buildInteractionPhaseColumns(
      model,
      Selection && Selection.cell ? Selection.cell.r : 0,
    );
    invalidateViewDef();
  }

  function resolvePalette() {
    return typeof getPaletteAPI === "function" ? getPaletteAPI() : undefined;
  }

  function kindCtx({ r, c, col, row, v } = {}) {
    const activeView = getActiveView();
    const paletteAPI = resolvePalette();
    return {
      r,
      c,
      v,
      col,
      row,
      model,
      viewDef,
      activeView,
      MOD,
      status: statusBar,
      paletteAPI,
      parsePhasesSpec,
      formatPhasesSpec,
      getInteractionsCell,
      setInteractionsCell,
      getStructuredCellInteractions,
      applyStructuredCellInteractions,
      wantPalette: !!paletteAPI?.wantsToHandleCell?.(),
    };
  }

  function dataArray() {
    const activeView = getActiveView();
    if (activeView === "actions") return model?.actions || [];
    if (activeView === "inputs") return model?.inputs || [];
    if (activeView === "modifiers") return model?.modifiers || [];
    if (activeView === "outcomes") return model?.outcomes || [];
    return [];
  }

  function getRowCount() {
    const activeView = getActiveView();
    if (activeView === "interactions") {
      const len = model?.interactionsPairs ? model.interactionsPairs.length : 0;
      return Math.max(len + 1, MIN_ROWS.interactionsBase);
    }
    const len = dataArray().length;
    return Math.max(len + MIN_ROWS.pad, MIN_ROWS.floor);
  }

  function updateSelectionSnapshot({ row, col } = {}) {
    const state = getActiveViewState();
    if (!state) return;
    if (Number.isFinite(row)) state.row = row;
    if (Number.isFinite(col)) state.col = col;
  }

  function updateScrollSnapshot(scrollTop = 0) {
    const state = getActiveViewState();
    if (!state) return;
    state.scrollTop = scrollTop | 0;
  }

  return {
    getActiveViewState,
    saveCurrentViewState,
    restoreViewState,
    resetAllViewState,
    viewDef,
    invalidateViewDef,
    rebuildInteractionPhaseColumns,
    kindCtx,
    dataArray,
    getRowCount,
    updateSelectionSnapshot,
    updateScrollSnapshot,
  };
}
