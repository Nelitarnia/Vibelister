import { describeAttachmentLocation } from "./history.js";
import {
  deleteComment,
  extractCommentClipboardData,
  listCommentsForCell,
  makeCommentClipboardPayload,
  setComment,
} from "./comments.js";

export function createGridCommands(deps = {}) {
  const {
    getActiveView,
    viewDef,
    dataArray,
    selection,
    SelectionNS,
    SelectionCtl,
    sel,
    model,
    statusBar,
    runModelMutation,
    runModelTransaction,
    makeUndoConfig,
    clearInteractionsSelection,
    isInteractionPhaseColumnActiveForRow,
    clearCellForKind,
    setCellForKind,
    kindCtx,
    makeRow,
    insertBlankRows,
    sanitizeModifierRulesAfterDeletion,
    setCell,
    render,
    isModColumn,
    parsePhaseKey,
    noteKeyForPair,
    getInteractionsPair,
  } = deps;

  function currentView() {
    return typeof getActiveView === "function" ? getActiveView() : "actions";
  }

  function cloneValueForAssignment(value) {
    if (!value || typeof value !== "object") return value;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(value);
      } catch (_) {
        // fall through to JSON/string fallback
      }
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      if (Array.isArray(value)) return value.slice();
      return { ...value };
    }
  }

  function resolveCommentTarget(r, c, options = {}) {
    const activeView = options?.view || currentView();
    const vd = options?.viewDef || viewDef?.() || { key: activeView, columns: [] };
    const columns = Array.isArray(vd.columns) ? vd.columns : [];
    const column = options?.column || columns[c];
    if (!column) return null;

    let rowIdentity = options?.row ?? options?.rowId ?? null;
    if (!rowIdentity) {
      if (activeView === "interactions") {
        const pair = options?.pair || getInteractionsPair?.(model, r);
        const keySource =
          options?.rowId || noteKeyForPair?.(pair, undefined) || null;
        if (!keySource) return null;
        rowIdentity = { commentRowId: keySource };
      } else {
        const arr = dataArray?.();
        if (!arr || !arr.length) return null;
        const row = arr[r];
        if (!row) return null;
        rowIdentity = row;
      }
    }

    return { activeView, vd, column, rowIdentity };
  }

  function formatCommentUndoStatus(direction, context, defaultLabel = "comment edit") {
    const change = context?.result?.change;
    let label = defaultLabel;
    if (change) {
      if (change.type === "delete" || change.type === "deleteRow") {
        label = "comment deletion";
      } else if (change.type === "set" && change.previous == null) {
        label = "comment addition";
      }
    }
    const attachment =
      direction === "undo"
        ? context?.beforeAttachments
        : context?.afterAttachments;
    const location = describeAttachmentLocation(attachment, true);
    const verb = direction === "undo" ? "Undid" : "Redid";
    return `${verb} ${label}${location ? ` at ${location}` : ""}.`;
  }

  function emitCommentChange(change, target) {
    if (!change) return;
    if (typeof document === "undefined" || !document?.dispatchEvent) return;
    try {
      document.dispatchEvent(
        new CustomEvent("vibelister:comments-updated", {
          detail: {
            change,
            viewKey: target?.vd?.key ?? null,
            rowIdentity: target?.rowIdentity ?? null,
            column: target?.column ?? null,
          },
        }),
      );
    } catch (_) {
      /* ignore dispatch failures */
    }
  }

  function columnsHorizontallyCompatible(sourceCol, targetCol) {
    if (!targetCol) return false;
    if (sourceCol === targetCol) return true;
    if (currentView() === "interactions") {
      const sourcePk = parsePhaseKey?.(sourceCol?.key);
      const targetPk = parsePhaseKey?.(targetCol?.key);
      if (sourcePk && targetPk) return sourcePk.field === targetPk.field;
      if (sourceCol?.key === "notes" && targetCol?.key === "notes") return true;
      return false;
    }
    const sourceKind = sourceCol?.kind;
    const targetKind = targetCol?.kind;
    if (sourceKind && targetKind && String(sourceKind) === String(targetKind))
      return true;
    if (
      sourceCol?.key != null &&
      targetCol?.key != null &&
      String(sourceCol.key) === String(targetCol.key)
    )
      return true;
    return false;
  }

  function getHorizontalTargetColumns(colIndex) {
    const vd = typeof viewDef === "function" ? viewDef() : null;
    const cols = vd?.columns || [];
    const sourceCol = cols[colIndex];
    if (!sourceCol) return [];
    const out = [];
    for (let i = 0; i < cols.length; i++) {
      if (columnsHorizontallyCompatible(sourceCol, cols[i])) out.push(i);
    }
    return out;
  }

  function setModForSelection(colIndex, target) {
    const vd = typeof viewDef === "function" ? viewDef() : null;
    const columns = vd?.columns || [];
    const col = columns[colIndex];
    if (!isModColumn?.(col)) return;
    const arr = dataArray?.();
    if (!arr) return;
    const rows =
      selection?.rows?.size > 1
        ? Array.from(selection.rows).sort((a, b) => a - b)
        : [sel?.r];
    runModelMutation?.(
      "setModForSelection",
      () => {
        let next = target;
        if (Number.isFinite(sel?.r)) {
          while (arr.length <= sel.r) arr.push(makeRow?.(model));
          const row0 = arr[sel.r];
          if (!row0.modSet || typeof row0.modSet !== "object") row0.modSet = {};
        }
        for (const r of rows) {
          while (arr.length <= r) arr.push(makeRow?.(model));
          const row = arr[r];
          if (!row.modSet || typeof row.modSet !== "object") row.modSet = {};
          setCellForKind?.(
            "modState",
            kindCtx?.({ r, c: colIndex, col, row, v: next }),
            next,
          );
        }
        return { rowsUpdated: rows.length, view: currentView() };
      },
      {
        render: true,
        undo: makeUndoConfig?.({
          label: "modifier edit",
          shouldRecord: (res) => (res?.rowsUpdated ?? 0) > 0,
        }),
      },
    );
  }

  function addRows(where) {
    if (currentView() === "interactions") {
      statusBar?.set?.("Row insertion is not available in Interactions view.");
      return;
    }
    const arr = dataArray?.();
    if (!arr) return;

    const rows = selection?.rows?.size
      ? Array.from(selection.rows).sort((a, b) => a - b)
      : [Number.isFinite(sel?.r) ? sel.r : 0];
    const count = rows.length;
    if (!count) return;

    const normalized = rows
      .map((r) => (Number.isFinite(r) ? r : 0))
      .map((r) => (r < 0 ? 0 : r));
    const minRow = normalized.reduce(
      (min, r) => (r < min ? r : min),
      normalized[0] ?? 0,
    );
    const maxRow = normalized.reduce(
      (max, r) => (r > max ? r : max),
      normalized[0] ?? 0,
    );

    let insertIndex = where === "above" ? minRow : maxRow + 1;
    insertIndex = Math.max(0, Math.min(insertIndex, arr.length));

    const whereWord = where === "above" ? "above" : "below";

    runModelMutation?.(
      "addRows",
      () => {
        insertBlankRows?.(model, arr, insertIndex, count);
        return {
          insertIndex,
          count,
          whereWord,
          requiresModifiersRebuild: currentView() === "modifiers" && count > 0,
        };
      },
      {
        rebuildActionColumns: (res) => res?.requiresModifiersRebuild,
        rebuildInteractions: true,
        pruneNotes: true,
        after: (res) => {
          const cols = viewDef?.().columns || [];
          const targetCol = cols.length
            ? Math.max(0, Math.min(sel?.c ?? 0, cols.length - 1))
            : 0;

          SelectionCtl?.startSingle?.(res.insertIndex, targetCol);
          if (res.count > 1)
            SelectionCtl?.extendRowsTo?.(res.insertIndex + res.count - 1);
          SelectionCtl?.clearAllColsFlag?.();
        },
        layout: true,
        render: true,
        status: (res) => {
          const noun = res.count === 1 ? "row" : "rows";
          return `Inserted ${res.count} ${noun} ${res.whereWord} selection.`;
        },
        undo: makeUndoConfig?.({
          label: "insert rows",
          includeColumn: false,
          shouldRecord: (res) => (res?.count ?? 0) > 0,
          makeStatus: (direction, _label, context) => {
            const res = context?.result || {};
            const count = res.count ?? 0;
            const noun = count === 1 ? "row" : "rows";
            const attachment =
              direction === "undo"
                ? context?.beforeAttachments
                : context?.afterAttachments;
            const location = describeAttachmentLocation(attachment, false);
            const verb = direction === "undo" ? "Undid" : "Redid";
            const where = location ? ` at ${location}` : "";
            return `${verb} insertion of ${count} ${noun}${where}.`;
          },
        }),
      },
    );
  }

  function addRowsAbove() {
    addRows("above");
  }

  function addRowsBelow() {
    addRows("below");
  }

  function clearSelectedCells(options = {}) {
    const { mode: requestedMode, reason } = options || {};
    if (currentView() === "interactions") {
      const isAllCols = SelectionNS?.isAllCols?.() || false;
      const mode = requestedMode || (isAllCols ? "clearAllEditable" : "clearActiveCell");
      const extras =
        reason === "deleteAttempt" || reason === "menu"
          ? { statusHint: "Interactions are generated; rows can't be deleted." }
          : undefined;
      runModelMutation?.(
        "clearInteractionsSelection",
        () =>
          clearInteractionsSelection?.(
            model,
            viewDef?.(),
            selection,
            sel,
            mode,
            statusBar,
            render,
            extras,
          ),
        {
          render: (res) => (res?.cleared ?? 0) > 0,
          status: (res) => res?.message,
          undo: makeUndoConfig?.({
            label: "clear interactions",
            shouldRecord: (res) => (res?.cleared ?? 0) > 0,
            makeStatus: (direction, _label, context) => {
              const res = context?.result || {};
              const cleared = res.cleared ?? 0;
              const noun = cleared === 1 ? "entry" : "entries";
              const attachment =
                direction === "undo"
                  ? context?.beforeAttachments
                  : context?.afterAttachments;
              const location = describeAttachmentLocation(attachment, true);
              const verb = direction === "undo" ? "Undid" : "Redid";
              if (cleared > 0) {
                return `${verb} Interactions clear of ${cleared} ${noun}${
                  location ? ` at ${location}` : ""
                }.`;
              }
              return `${verb} Interactions clear operation.`;
            },
          }),
        },
      );
      if (mode === "clearAllEditable") SelectionNS?.setColsAll?.(false);
      return;
    }

    const arr = dataArray?.();
    if (!arr || !arr.length) {
      if (statusBar?.set) statusBar.set("Nothing to clear.");
      else if (statusBar) statusBar.textContent = "Nothing to clear.";
      return;
    }

    const rows =
      selection?.rows?.size > 0
        ? Array.from(selection.rows).sort((a, b) => a - b)
        : [sel?.r];
    const vd = viewDef?.() || { key: currentView(), columns: [] };
    let colsToClear;
    if (selection?.colsAll) colsToClear = vd.columns.map((_, idx) => idx);
    else if (selection?.cols?.size)
      colsToClear = Array.from(selection.cols).sort((a, b) => a - b);
    else colsToClear = [sel?.c];

    colsToClear = colsToClear.filter(
      (c) => Number.isFinite(c) && c >= 0 && c < vd.columns.length,
    );

    runModelMutation?.(
      "clearSelectedCells",
      () => {
        let cleared = 0;
        const removedComments = [];
        for (const r of rows) {
          if (!Number.isFinite(r) || r < 0 || r >= arr.length) continue;
          const row = arr[r];
          if (!row) continue;
          for (const c of colsToClear) {
            const col = vd.columns[c];
            if (!col) continue;
            if (
              selection?.colsAll &&
              currentView() === "interactions" &&
              !isInteractionPhaseColumnActiveForRow?.(model, vd, r, c, col)
            )
              continue;
            let cellChanged = false;
            if (col.kind) {
              const changed = clearCellForKind?.(col.kind, kindCtx?.({ r, c, col, row }));
              if (changed) cellChanged = true;
            } else if (col.key) {
              const before = row[col.key];
              const hadValue = !(before == null || before === "");
              if (hadValue) {
                row[col.key] = "";
                cellChanged = true;
              }
            }
            const commentChange = deleteComment(model, vd, row, col);
            if (commentChange) {
              removedComments.push(commentChange);
              cellChanged = true;
            }
            if (cellChanged) cleared++;
          }
        }
        return { cleared, removedComments };
      },
      {
        rebuildInteractions: (res) => (res?.cleared ?? 0) > 0,
        pruneNotes: (res) => (res?.cleared ?? 0) > 0,
        render: (res) => (res?.cleared ?? 0) > 0,
        status: (res) => {
          const cleared = res?.cleared ?? 0;
          if (cleared > 0) {
            const noun = cleared === 1 ? "cell" : "cells";
            return `Cleared ${cleared} ${noun}.`;
          }
          return "Nothing to clear.";
        },
        undo: makeUndoConfig?.({
          label: "clear cells",
          shouldRecord: (res) => (res?.cleared ?? 0) > 0,
          makeStatus: (direction, _label, context) => {
            const res = context?.result || {};
            const cleared = res.cleared ?? 0;
            const noun = cleared === 1 ? "cell" : "cells";
            const attachment =
              direction === "undo"
                ? context?.beforeAttachments
                : context?.afterAttachments;
            const location = describeAttachmentLocation(attachment, true);
            const verb = direction === "undo" ? "Undid" : "Redid";
            return `${verb} clear of ${cleared} ${noun}${
              location ? ` at ${location}` : ""
            }.`;
          },
        }),
      },
    );
  }

  function deleteSelectedRows(options = {}) {
    if (currentView() === "interactions") {
      clearSelectedCells({
        mode: options?.mode,
        reason: options?.reason || "deleteAttempt",
      });
      return;
    }
    const arr = dataArray?.();
    if (!arr || !arr.length) return;

    const rows = selection?.rows?.size > 0 ? Array.from(selection.rows) : [sel?.r];
    rows.sort((a, b) => b - a);

    const vd = viewDef?.() || { key: currentView(), columns: [] };

    runModelMutation?.(
      "deleteSelectedRows",
      () => {
        const deletedIds = [];
        const removedComments = [];
        for (const r of rows) {
          const row = arr[r];
          if (!row) continue;
          const commentRemoval = deleteComment(model, vd, row, null);
          if (commentRemoval) removedComments.push(commentRemoval);
          deletedIds.push(row.id);
          arr.splice(r, 1);
        }

        const needsModifierRebuild = currentView() === "modifiers" && deletedIds.length > 0;
        if (needsModifierRebuild) {
          for (const a of model.actions) {
            if (!a.modSet) continue;
            for (const id of deletedIds) delete a.modSet[id];
          }
        }

        const last = Math.max(0, Math.min(arr.length - 1, rows[rows.length - 1] ?? 0));

        return { deletedIds, needsModifierRebuild, last, removedComments };
      },
      {
        rebuildActionColumns: (res) => res?.needsModifierRebuild,
        rebuildInteractions: true,
        pruneNotes: true,
        after: (res) => {
          const last = res?.last ?? 0;
          if (res?.needsModifierRebuild && res?.deletedIds?.length) {
            sanitizeModifierRulesAfterDeletion?.(model, res.deletedIds);
          }
          selection?.rows?.clear?.();
          selection?.rows?.add?.(last);
          if (selection) selection.anchor = last;
          if (sel) {
            sel.r = last;
            const cols = viewDef?.().columns || [];
            sel.c = Math.min(sel.c, Math.max(0, cols.length - 1));
          }
        },
        layout: true,
        render: true,
        status: (res) => {
          const count = res?.deletedIds?.length ?? 0;
          const noun = count === 1 ? "row" : "rows";
          return `Deleted ${count} ${noun} from ${viewDef?.().title}.`;
        },
        undo: makeUndoConfig?.({
          label: "delete rows",
          includeColumn: false,
          shouldRecord: (res) => (res?.deletedIds?.length ?? 0) > 0,
          makeStatus: (direction, _label, context) => {
            const res = context?.result || {};
            const count = res.deletedIds?.length ?? 0;
            const noun = count === 1 ? "row" : "rows";
            const attachment =
              direction === "undo"
                ? context?.beforeAttachments
                : context?.afterAttachments;
            const location = describeAttachmentLocation(attachment, false);
            const verb = direction === "undo" ? "Undid" : "Redid";
            return `${verb} deletion of ${count} ${noun}${
              location ? ` at ${location}` : ""
            }.`;
          },
        }),
      },
    );
  }

  function setCellSelectionAware(r, c, v) {
    const rowsSet = selection?.rows;
    const hasMultiSelection = rowsSet && rowsSet.size > 1 && rowsSet.has(r);
    const vd = viewDef?.();
    const col = vd?.columns?.[c];
    const activeView = currentView();
    const isColorColumn = String(col?.kind || "").toLowerCase() === "color";
    const isModColumnKind = typeof isModColumn === "function" ? isModColumn(col) : false;
    const shouldSpreadDown =
      hasMultiSelection &&
      ((activeView === "interactions" && c === sel?.c) ||
        isColorColumn ||
        isModColumnKind);

    const targetRows = shouldSpreadDown
      ? Array.from(rowsSet).sort((a, b) => a - b)
      : [r];

    const compatCols = selection?.colsAll
      ? getHorizontalTargetColumns(c)
      : typeof getHorizontalTargetColumns === "function"
        ? getHorizontalTargetColumns(c)
        : null;

    let targetCols;
    const hasExplicitColumnRange =
      selection?.cols &&
      selection.cols.size > 1 &&
      selection.cols.has(c) &&
      !selection.colsAll;

    if (selection?.colsAll) {
      targetCols = compatCols && compatCols.length ? compatCols.slice() : [c];
    } else if (hasExplicitColumnRange) {
      const selectedCols = Array.from(selection.cols).sort((a, b) => a - b);
      const filtered =
        compatCols && compatCols.length
          ? selectedCols.filter((idx) => compatCols.includes(idx))
          : selectedCols;
      const set = new Set(filtered.length ? filtered : [c]);
      set.add(c);
      targetCols = Array.from(set);
    } else {
      targetCols = [c];
    }

    if (!targetCols || !targetCols.length) targetCols = [c];
    const uniqueCols = new Set();
    for (const colIndex of targetCols) {
      if (Number.isFinite(colIndex)) uniqueCols.add(colIndex);
    }
    targetCols = uniqueCols.size
      ? Array.from(uniqueCols).sort((a, b) => a - b)
      : [c];

    runModelTransaction?.(
      "setCellSelectionAware",
      () => {
        let changedCells = 0;
        const touchedRows = new Set();
        const touchedCols = new Set();
        const selectedColsSet = selection?.cols;

        for (const rr of targetRows) {
          if (!Number.isFinite(rr)) continue;
          for (const cc of targetCols) {
            if (!Number.isFinite(cc)) continue;
            if (
              !selection?.colsAll &&
              cc !== c &&
              !(selectedColsSet && selectedColsSet.has(cc))
            )
              continue;
            if (
              selection?.colsAll &&
              activeView === "interactions" &&
              !isInteractionPhaseColumnActiveForRow?.(model, vd, rr, cc)
            ) {
              continue;
            }
            const result = setCell?.(rr, cc, cloneValueForAssignment(v));
            if (result && result.changed) {
              changedCells++;
              touchedRows.add(rr);
              touchedCols.add(cc);
            }
          }
        }
        return {
          changedCells,
          touchedRows: Array.from(touchedRows).sort((a, b) => a - b),
          touchedCols: Array.from(touchedCols).sort((a, b) => a - b),
          view: activeView,
        };
      },
      {
        render: true,
        undo: makeUndoConfig?.({
          label: "cell edit",
          shouldRecord: (res) => (res?.changedCells ?? 0) > 0,
        }),
      },
    );
  }

  function setCellComment(r, c, value, options = {}) {
    const target = resolveCommentTarget(r, c, options);
    if (!target) return null;
    const result = runModelMutation?.(
      "setCellComment",
      () => {
        const change = setComment(
          model,
          target.vd,
          target.rowIdentity,
          target.column,
          value,
        );
        return { change };
      },
      {
        render: true,
        undo: makeUndoConfig?.({
          label: "comment edit",
          shouldRecord: (res) => !!res?.change,
          makeStatus: (direction, _label, context) =>
            formatCommentUndoStatus(direction, context),
        }),
      },
    );
    const change = result?.change || null;
    if (change) emitCommentChange(change, target);
    return change;
  }

  function deleteCellComment(r, c, options = {}) {
    const target = resolveCommentTarget(r, c, options);
    if (!target) return null;
    const result = runModelMutation?.(
      "deleteCellComment",
      () => {
        const change = deleteComment(
          model,
          target.vd,
          target.rowIdentity,
          target.column,
        );
        return { change };
      },
      {
        render: true,
        undo: makeUndoConfig?.({
          label: "comment edit",
          shouldRecord: (res) => !!res?.change,
          makeStatus: (direction, _label, context) =>
            formatCommentUndoStatus(direction, context, "comment deletion"),
        }),
      },
    );
    const change = result?.change || null;
    if (change) emitCommentChange(change, target);
    return change;
  }

  function getCellComments(r, c, options = {}) {
    const target = resolveCommentTarget(r, c, options);
    if (!target) return [];
    return listCommentsForCell(model, target.vd, target.rowIdentity, target.column);
  }

  function getCellCommentClipboardPayload(r, c, options = {}) {
    const target = resolveCommentTarget(r, c, options);
    if (!target) return null;
    const entries = listCommentsForCell(
      model,
      target.vd,
      target.rowIdentity,
      target.column,
    );
    if (!entries || !entries.length) return null;
    return makeCommentClipboardPayload(entries[0]);
  }

  function applyCellCommentClipboardPayload(r, c, payload, options = {}) {
    const target = resolveCommentTarget(r, c, options);
    if (!target) return null;
    const data = extractCommentClipboardData(payload);
    if (!data) return null;
    const change = setComment(
      model,
      target.vd,
      target.rowIdentity,
      target.column,
      data.value,
    );
    if (!change) return null;
    emitCommentChange(change, target);
    return change;
  }

  return {
    cloneValueForAssignment,
    getHorizontalTargetColumns,
    setModForSelection,
    addRows,
    addRowsAbove,
    addRowsBelow,
    clearSelectedCells,
    deleteSelectedRows,
    setCellSelectionAware,
    setCellComment,
    deleteCellComment,
    getCellComments,
    getCellCommentClipboardPayload,
    applyCellCommentClipboardPayload,
  };
}
