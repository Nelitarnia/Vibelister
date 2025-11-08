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
    sheet,
    model,
    getActiveView,
    viewDef,
    runModelMutation,
    beginUndoableTransaction,
    makeUndoConfig,
    invalidateViewDef,
    layout,
    render,
    window: winOverride,
  } = options;

  const win = winOverride || globalThis.window;
  const raf = win?.requestAnimationFrame?.bind(win) ??
    globalThis.requestAnimationFrame?.bind(globalThis);
  const cancelRaf = win?.cancelAnimationFrame?.bind(win) ??
    globalThis.cancelAnimationFrame?.bind(globalThis);
  const setIntervalFn = win?.setInterval?.bind(win) ??
    globalThis.setInterval?.bind(globalThis);
  const clearIntervalFn = win?.clearInterval?.bind(win) ??
    globalThis.clearInterval?.bind(globalThis);

  const AUTO_SCROLL_ACTIVATION_MARGIN = 12;
  const AUTO_SCROLL_STOP_MARGIN = 4;
  const AUTO_SCROLL_STEP = 24;
  const AUTO_SCROLL_INTERVAL = 16;

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
  let autoScrollHandle = null;
  let autoScrollMode = null;
  let autoScrollDirection = 0;

  function currentColumns() {
    const vd = viewDef();
    if (!vd || !Array.isArray(vd.columns)) return [];
    return vd.columns;
  }

  function getAutoScrollRect() {
    const readRect = (node) => {
      if (!node || typeof node.getBoundingClientRect !== "function") return null;
      const rect = node.getBoundingClientRect();
      if (!rect) return null;
      const { left, right } = rect;
      if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
      return rect;
    };

    return readRect(sheet) || readRect(container) || null;
  }

  function clampEdgeMargin(rect, margin) {
    if (!rect) return 0;
    const width = Number(rect.right) - Number(rect.left);
    if (!Number.isFinite(width) || width <= 0) return 0;
    const half = width / 2;
    if (!Number.isFinite(margin) || margin <= 0) return 0;
    return Math.max(0, Math.min(margin, half));
  }

  function makeEdgeBounds(rect, margin) {
    if (!rect) return { left: -Infinity, right: Infinity };
    const safeMargin = clampEdgeMargin(rect, margin);
    const left = Number(rect.left) + safeMargin;
    const right = Number(rect.right) - safeMargin;
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return { left: -Infinity, right: Infinity };
    }
    if (left <= right) return { left, right };
    const mid = (left + right) / 2;
    return { left: mid, right: mid };
  }

  function stopAutoScroll() {
    if (autoScrollHandle == null) return;
    if (autoScrollMode === "raf") {
      cancelRaf?.(autoScrollHandle);
    } else if (autoScrollMode === "interval") {
      clearIntervalFn?.(autoScrollHandle);
    }
    autoScrollHandle = null;
    autoScrollMode = null;
    autoScrollDirection = 0;
  }

  function updateWidth(clientX) {
    if (!resizeState) return;
    const pointerDelta = clientX - resizeState.startX;
    const currentScroll = sheet?.scrollLeft ?? resizeState.startScrollLeft;
    const scrollDelta =
      currentScroll - (resizeState.startScrollLeft ?? currentScroll);
    const target = clampWidth(
      resizeState.startWidth + pointerDelta + scrollDelta,
      resizeState.defaultWidth,
    );
    if (target === resizeState.lastWidth) return;
    resizeState.lastWidth = target;
    applyWidth(target);
  }

  function startAutoScroll(direction) {
    if (!sheet || (!raf && !setIntervalFn)) return;
    if (!resizeState) return;

    const maxScrollLeft = Math.max(
      0,
      (Number(sheet.scrollWidth) || 0) - (Number(sheet.clientWidth) || 0),
    );
    if (direction < 0 && sheet.scrollLeft <= 0) direction = 0;
    if (direction > 0 && sheet.scrollLeft >= maxScrollLeft) {
      let pointerNearRight = false;
      const pointerX = resizeState.lastClientX ?? resizeState.startX;
      if (Number.isFinite(pointerX)) {
        const rect = getAutoScrollRect();
        if (rect) {
          const { right } = makeEdgeBounds(rect, AUTO_SCROLL_ACTIVATION_MARGIN);
          if (pointerX >= right) pointerNearRight = true;
        }
      }
      if (!pointerNearRight) {
        direction = 0;
      }
    }

    if (direction === 0) {
      stopAutoScroll();
      return;
    }

    if (autoScrollHandle != null && autoScrollDirection === direction) {
      return;
    }

    stopAutoScroll();
    autoScrollDirection = direction;

    const step = () => {
      if (!resizeState || autoScrollDirection === 0) {
        stopAutoScroll();
        return;
      }

      const maxScroll = Math.max(
        0,
        (Number(sheet.scrollWidth) || 0) - (Number(sheet.clientWidth) || 0),
      );
      if (maxScroll <= 0) {
        stopAutoScroll();
        return;
      }

      const prev = sheet.scrollLeft;
      const delta = autoScrollDirection * AUTO_SCROLL_STEP;
      const next = Math.max(0, Math.min(maxScroll, prev + delta));
      sheet.scrollLeft = next;
      updateWidth(resizeState.lastClientX ?? resizeState.startX);

      let stillBeyondRight = false;
      let stillBeyondLeft = false;
      const rect = getAutoScrollRect();
      if (rect) {
        const clientX = resizeState.lastClientX ?? resizeState.startX;
        if (clientX != null) {
          const bounds = makeEdgeBounds(rect, AUTO_SCROLL_STOP_MARGIN);
          stillBeyondRight = clientX >= bounds.right;
          stillBeyondLeft = clientX <= bounds.left;
          if (
            (autoScrollDirection > 0 && !stillBeyondRight) ||
            (autoScrollDirection < 0 && !stillBeyondLeft)
          ) {
            stopAutoScroll();
            return;
          }
        }
      }

      if (autoScrollDirection < 0 && next <= 0) {
        stopAutoScroll();
      } else if (autoScrollDirection > 0 && next >= maxScroll && !stillBeyondRight) {
        stopAutoScroll();
      }
    };

    if (raf) {
      autoScrollMode = "raf";
      const loop = () => {
        step();
        if (autoScrollDirection !== 0 && resizeState && sheet) {
          autoScrollHandle = raf(loop);
        }
      };
      autoScrollHandle = raf(loop);
    } else if (setIntervalFn) {
      autoScrollMode = "interval";
      autoScrollHandle = setIntervalFn(() => {
        step();
        if (!resizeState || autoScrollDirection === 0) {
          stopAutoScroll();
        }
      }, AUTO_SCROLL_INTERVAL);
    }
  }

  function maybeAutoScroll(clientX) {
    if (!sheet) {
      stopAutoScroll();
      return;
    }

    const rect = getAutoScrollRect();
    if (!rect) {
      stopAutoScroll();
      return;
    }

    const pointerX =
      clientX ?? resizeState?.lastClientX ?? resizeState?.startX ?? null;
    if (!Number.isFinite(pointerX)) {
      stopAutoScroll();
      return;
    }

    const activationBounds = makeEdgeBounds(rect, AUTO_SCROLL_ACTIVATION_MARGIN);

    let wantLeft = pointerX <= activationBounds.left;
    let wantRight = pointerX >= activationBounds.right;

    if (wantLeft && wantRight) {
      wantLeft = wantRight = false;
    }

    if (resizeState && Number.isFinite(resizeState.startX)) {
      const deltaFromStart = pointerX - resizeState.startX;
      if (wantLeft && deltaFromStart > 0) wantLeft = false;
      if (wantRight && deltaFromStart < 0) wantRight = false;
    }

    let direction = 0;
    if (wantRight) direction = 1;
    else if (wantLeft) direction = -1;

    if (direction !== 0) {
      const maxScroll = Math.max(
        0,
        (Number(sheet.scrollWidth) || 0) - (Number(sheet.clientWidth) || 0),
      );
      if (direction < 0 && sheet.scrollLeft <= 0) {
        direction = 0;
      } else if (direction > 0 && sheet.scrollLeft >= maxScroll) {
        const { right } = makeEdgeBounds(rect, AUTO_SCROLL_ACTIVATION_MARGIN);
        if (pointerX < right) direction = 0;
      }
    }

    if (direction === 0) {
      stopAutoScroll();
    } else {
      startAutoScroll(direction);
    }
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
    win?.removeEventListener?.("pointermove", onPointerMove);
    win?.removeEventListener?.("pointerup", onPointerUp, true);
    win?.removeEventListener?.("pointercancel", onPointerCancel, true);

    const lastResult = resizeState.lastResult;
    if (cancel) {
      resizeState.lastResult = null;
    }

    stopAutoScroll();

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
      startScrollLeft: sheet?.scrollLeft ?? 0,
      lastClientX: ev.clientX,
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

    win?.addEventListener?.("pointermove", onPointerMove);
    win?.addEventListener?.("pointerup", onPointerUp, true);
    win?.addEventListener?.("pointercancel", onPointerCancel, true);

    ev.preventDefault();
  }

  function onPointerMove(ev) {
    if (!resizeState || ev.pointerId !== resizeState.pointerId) return;
    resizeState.lastClientX = ev.clientX;
    updateWidth(ev.clientX);
    maybeAutoScroll(ev.clientX);
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
      const schedule = win?.setTimeout || globalThis.setTimeout;
      schedule?.(() => {
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
