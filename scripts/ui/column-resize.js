import {
  MIN_COLUMN_WIDTH,
  clearColumnWidthOverride,
  setColumnWidthOverride,
} from "../app/column-widths.js";

function clampWidth(width, fallback) {
  const base = Number(width);
  if (Number.isFinite(base) && base > 0) {
    return Math.max(MIN_COLUMN_WIDTH, Math.round(base));
  }
  const fb = Number(fallback);
  if (Number.isFinite(fb) && fb > 0) {
    return Math.max(MIN_COLUMN_WIDTH, Math.round(fb));
  }
  return MIN_COLUMN_WIDTH;
}

export function initColumnResize(options = {}) {
  const {
    container,
    model,
    getActiveView,
    viewDef,
    runModelMutation,
    beginUndoableTransaction,
    makeUndoConfig,
    invalidateViewDef,
    layout,
    render,
  } = options;

  if (
    !container ||
    typeof container.addEventListener !== "function" ||
    !model ||
    typeof getActiveView !== "function" ||
    typeof viewDef !== "function" ||
    typeof runModelMutation !== "function" ||
    typeof invalidateViewDef !== "function" ||
    typeof layout !== "function" ||
    typeof render !== "function"
  ) {
    return () => {};
  }

  let resizeState = null;

  function currentColumns() {
    const vd = viewDef();
    if (!vd || !Array.isArray(vd.columns)) return [];
    return vd.columns;
  }

  function applyWidth(width) {
    if (!resizeState) return null;
    const { viewKey, columnKey, defaultWidth } = resizeState;

    const result = runModelMutation(
      "resize column",
      () => {
        const meta = model.meta || (model.meta = {});
        if (!meta.columnWidths || typeof meta.columnWidths !== "object") {
          meta.columnWidths = {};
        }
        const { overrides, changed, width: appliedWidth } = setColumnWidthOverride(
          meta.columnWidths,
          viewKey,
          columnKey,
          width,
          defaultWidth,
        );
        if (!changed) {
          return { changed: false, width: appliedWidth ?? width };
        }
        meta.columnWidths = overrides;
        return { changed: true, width: appliedWidth ?? width };
      },
      {
        undo: false,
        invalidateView: true,
        layout: true,
        render: true,
      },
    );

    if (result?.changed) {
      invalidateViewDef();
      layout();
      render();
    }
    resizeState.lastResult = result;
    if (result?.width != null) resizeState.lastWidth = result.width;
    return result;
  }

  function finishResize(cancel) {
    if (!resizeState) return;
    const { handle, header, pointerId, tx } = resizeState;
    try {
      handle.classList.remove("is-resizing");
      header.classList.remove("is-resizing");
      container.classList.remove("is-resizing");
      if (typeof handle.releasePointerCapture === "function") {
        handle.releasePointerCapture(pointerId);
      }
    } catch (_) {
      /* noop */
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerCancel, true);

    const lastResult = resizeState.lastResult;
    if (cancel) {
      resizeState.lastResult = null;
    }

    if (tx) {
      try {
        if (cancel) {
          tx.cancel?.();
        } else if (typeof tx.commit === "function") {
          tx.commit(lastResult, {
            invalidateView: true,
            layout: true,
            render: true,
          });
        }
      } catch (_) {
        if (!cancel) {
          try {
            tx.cancel?.();
          } catch (_) {
            /* noop */
          }
        }
      }
    }

    resizeState = null;
  }

  function onPointerDown(ev) {
    if (ev.button !== 0) return;
    if (ev.detail && ev.detail > 1) return;
    const handle = ev.target?.closest?.(".hdr__resize-handle");
    if (!handle || !container.contains(handle)) return;
    const header = handle.closest(".hdr");
    if (!header) return;

    const colIndex = Number(header.dataset.colIndex ?? header.dataset.c);
    if (!Number.isFinite(colIndex)) return;
    const columns = currentColumns();
    const column = columns[colIndex];
    if (!column) return;

    const activeViewKey = header.dataset.viewKey || getActiveView();
    const columnKey = column.key;
    if (columnKey == null) return;
    const defaultWidth = clampWidth(column.defaultWidth, column.width);
    const startWidth = clampWidth(column.width, column.defaultWidth);

    const undoConfig =
      typeof makeUndoConfig === "function"
        ? makeUndoConfig({
            label: "resize column",
            includeLocation: true,
            includeColumn: true,
            shouldRecord: (res) => !!res?.changed,
          })
        : { label: "resize column" };

    const tx =
      typeof beginUndoableTransaction === "function"
        ? beginUndoableTransaction("resize column", {
            undo: undoConfig,
            invalidateView: true,
            layout: true,
            render: true,
          })
        : null;

    resizeState = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startWidth,
      lastWidth: startWidth,
      viewKey: activeViewKey,
      columnKey,
      columnIndex: colIndex,
      defaultWidth,
      header,
      handle,
      tx,
      lastResult: null,
    };

    try {
      if (typeof handle.setPointerCapture === "function") {
        handle.setPointerCapture(ev.pointerId);
      }
    } catch (_) {
      /* noop */
    }

    handle.classList.add("is-resizing");
    header.classList.add("is-resizing");
    container.classList.add("is-resizing");

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);

    ev.preventDefault();
  }

  function onPointerMove(ev) {
    if (!resizeState || ev.pointerId !== resizeState.pointerId) return;
    const delta = ev.clientX - resizeState.startX;
    const target = clampWidth(
      resizeState.startWidth + delta,
      resizeState.defaultWidth,
    );
    if (target === resizeState.lastWidth) return;
    resizeState.lastWidth = target;
    applyWidth(target);
  }

  function onPointerUp(ev) {
    if (!resizeState || ev.pointerId !== resizeState.pointerId) return;
    finishResize(false);
  }

  function onPointerCancel(ev) {
    if (!resizeState || ev.pointerId !== resizeState.pointerId) return;
    const startWidth = resizeState.startWidth;
    if (resizeState.lastWidth !== startWidth) {
      resizeState.lastWidth = startWidth;
      applyWidth(startWidth);
    } else {
      resizeState.lastResult = null;
    }
    finishResize(true);
  }

  function onDoubleClick(ev) {
    const handle = ev.target?.closest?.(".hdr__resize-handle");
    if (!handle || !container.contains(handle)) return;
    const header = handle.closest(".hdr");
    if (!header) return;

    const colIndex = Number(header.dataset.colIndex ?? header.dataset.c);
    if (!Number.isFinite(colIndex)) return;
    const columns = currentColumns();
    const column = columns[colIndex];
    if (!column) return;

    const viewKey = header.dataset.viewKey || getActiveView();
    const columnKey = column.key;
    if (columnKey == null) return;

    const undoConfig =
      typeof makeUndoConfig === "function"
        ? makeUndoConfig({
            label: "reset column width",
            includeLocation: true,
            includeColumn: true,
            shouldRecord: (res) => !!res?.changed,
          })
        : { label: "reset column width" };

    const result = runModelMutation(
      "reset column width",
      () => {
        const meta = model.meta || (model.meta = {});
        if (!meta.columnWidths || typeof meta.columnWidths !== "object") {
          meta.columnWidths = {};
        }
        const { overrides, changed } = clearColumnWidthOverride(
          meta.columnWidths,
          viewKey,
          columnKey,
        );
        if (!changed) return { changed: false };
        meta.columnWidths = overrides;
        return { changed: true };
      },
      {
        undo: undoConfig,
        invalidateView: true,
        layout: true,
        render: true,
      },
    );

    if (result?.changed) {
      handle.classList.add("is-resetting");
      window.setTimeout(() => {
        handle.classList.remove("is-resetting");
      }, 200);
    }

    ev.preventDefault();
    ev.stopPropagation();
  }

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("dblclick", onDoubleClick);

  return function dispose() {
    container.removeEventListener("pointerdown", onPointerDown);
    container.removeEventListener("dblclick", onDoubleClick);
    finishResize(true);
  };
}
