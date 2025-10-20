import { makeMutationRunner } from "../data/mutation-runner.js";

export function describeAttachmentLocation(att, includeColumn = true) {
  if (!att || typeof att !== "object") return "";
  const parts = [];
  const viewLabel = att.viewTitle || (att.view ? String(att.view) : "");
  if (viewLabel) parts.push(viewLabel);
  if (Number.isFinite(att.row)) parts.push(`row ${att.row + 1}`);
  if (includeColumn) {
    const columnLabel = att.columnTitle || att.columnKey || "";
    if (columnLabel) parts.push(columnLabel);
  }
  return parts.join(" · ");
}

function captureUndoAttachment({
  viewDef,
  getActiveView,
  selectionCursor,
  VIEWS,
}) {
  const vd = typeof viewDef === "function" ? viewDef() : null;
  const cols = vd?.columns || [];
  const colIndex = Number.isFinite(selectionCursor?.c)
    ? selectionCursor.c
    : 0;
  const col = cols[colIndex] || null;
  const activeView =
    typeof getActiveView === "function" ? getActiveView() : undefined;
  return {
    view: activeView,
    viewTitle: vd?.title || VIEWS?.[activeView]?.title || activeView,
    row: Number.isFinite(selectionCursor?.r) ? selectionCursor.r : 0,
    col: colIndex,
    columnKey: col?.key || null,
    columnTitle:
      (col && (col.title || col.label || col.name)) ||
      (col && typeof col.key === "string" ? col.key : ""),
  };
}

function applyUndoAttachment(att, { setActiveView, SelectionCtl, ensureVisible }) {
  if (!att) return;
  if (att.view && typeof setActiveView === "function") {
    setActiveView(att.view);
  }
  const row = Number.isFinite(att.row) ? att.row : 0;
  const col = Number.isFinite(att.col) ? att.col : 0;
  if (SelectionCtl?.startSingle) {
    SelectionCtl.startSingle(row, col);
  }
  if (typeof ensureVisible === "function") {
    ensureVisible(row, col);
  }
}

export function createHistoryController(deps = {}) {
  const {
    model,
    viewDef,
    getActiveView,
    setActiveView,
    selectionCursor,
    SelectionCtl,
    ensureVisible,
    VIEWS,
    statusBar,
    undoMenuItem,
    redoMenuItem,
    rebuildActionColumnsFromModifiers,
    rebuildInteractionsInPlace,
    pruneNotesToValidPairs,
    invalidateViewDef,
    layout,
    render,
    historyLimit = 200,
  } = deps;

  const capture = () =>
    captureUndoAttachment({
      viewDef,
      getActiveView,
      selectionCursor,
      VIEWS,
    });
  const apply = (att) =>
    applyUndoAttachment(att, {
      setActiveView,
      SelectionCtl,
      ensureVisible,
    });

  function makeUndoConfig(options = {}) {
    const {
      label,
      shouldRecord,
      makeStatus,
      includeLocation = true,
      includeColumn = true,
      snapshotOptions,
    } = options || {};

    const captureFn = includeLocation ? capture : null;
    const applyFn = includeLocation ? apply : null;

    return {
      label,
      snapshotOptions,
      shouldRecord: (result, ctx) => {
        if (typeof shouldRecord === "function") return !!shouldRecord(result, ctx);
        return true;
      },
      captureAttachments: captureFn
        ? () => {
            const att = captureFn();
            if (!includeColumn && att) {
              return { ...att, columnTitle: "", columnKey: att.columnKey };
            }
            return att;
          }
        : undefined,
      applyAttachments: applyFn
        ? (att, _direction) => {
            applyFn(att);
          }
        : undefined,
      makeStatus: ({ direction, label: lbl, context }) => {
        if (typeof makeStatus === "function") {
          return makeStatus(direction, lbl, context);
        }
        if (!includeLocation) {
          return direction === "undo"
            ? `Undid ${lbl || "change"}.`
            : `Redid ${lbl || "change"}.`;
        }
        const attachment =
          direction === "undo"
            ? context?.beforeAttachments
            : context?.afterAttachments;
        const location = describeAttachmentLocation(attachment, includeColumn);
        const verb = direction === "undo" ? "Undid" : "Redid";
        if (location) return `${verb} ${lbl || "change"} at ${location}.`;
        return `${verb} ${lbl || "change"}.`;
      },
    };
  }

  function updateUndoUI(state = {}) {
    const { canUndo, canRedo, undoLabel, redoLabel } = state || {};
    const formatLabel = (value) => {
      if (!value) return "";
      const text = String(value).trim();
      if (!text) return "";
      return text.charAt(0).toUpperCase() + text.slice(1);
    };
    if (undoMenuItem) {
      undoMenuItem.disabled = !canUndo;
      const base = "Undo";
      const formatted = formatLabel(undoLabel);
      undoMenuItem.textContent = formatted ? `${base} ${formatted}` : base;
    }
    if (redoMenuItem) {
      redoMenuItem.disabled = !canRedo;
      const base = "Redo";
      const formatted = formatLabel(redoLabel);
      redoMenuItem.textContent = formatted ? `${base} ${formatted}` : base;
    }
  }

  const mutationRunner = makeMutationRunner({
    model,
    rebuildActionColumnsFromModifiers,
    rebuildInteractionsInPlace,
    pruneNotesToValidPairs,
    invalidateViewDef,
    layout,
    render,
    status: statusBar,
    historyLimit,
    onHistoryChange: updateUndoUI,
  });

  const {
    runModelMutation,
    runModelTransaction,
    undo,
    redo,
    getUndoState,
    clearHistory,
  } = mutationRunner;

  try {
    updateUndoUI(getUndoState());
  } catch (_) {
    // ignore UI update errors so history wiring still works in tests
  }

  return {
    makeUndoConfig,
    updateUndoUI,
    runModelMutation,
    runModelTransaction,
    undo,
    redo,
    getUndoState,
    clearHistory,
  };
}
