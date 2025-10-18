// drag.js
// Row drag-reorder for actions/inputs/modifiers views.
// Exported as an initializer so App.js can pass dependencies explicitly.

export function initRowDrag(deps) {
  const {
    rowHdrs,
    sheet,
    dragLine,
    dataArray,
    getRowCount,
    ensureMinRows,
    clamp,
    selection,
    sel,
    clearSelection,
    SelectionNS,
    render,
    layout,
    status,
    ROW_HEIGHT,
    HEADER_HEIGHT,
    isReorderableView,
  } = deps;

  // Configurable constants (potentially user-tweakable later)
  const SCROLL_EDGE_ZONE = 24; // px distance from top/bottom to trigger auto-scroll
  const SCROLL_SPEED_STEP = Math.max(2, Math.floor(ROW_HEIGHT / 4)); // px per frame, scaled to row height

  let drag = null;
  let lastClientY = null; // track pointer Y so scroll can update target
  let autoScrollId = null; // rAF id for edge auto-scroll loop
  let moved = false; // track whether rows actually moved

  function sheetYFromClient(y) {
    const r = sheet.getBoundingClientRect();
    return y - r.top;
  }
  function contentYFromClient(y) {
    return sheetYFromClient(y) + sheet.scrollTop;
  }

  function setDragLineAt(index) {
    const top = index * ROW_HEIGHT;
    dragLine.style.top = top + "px";
    dragLine.style.left = "0px";
    dragLine.style.right = "0px";
    if (drag) dragLine.style.display = "block";
  }

  function moveDragLine(y) {
    if (!drag) return;
    const yNowContent = contentYFromClient(y);
    const dy = yNowContent - drag.startContentY;
    const deltaRows = Math.round(dy / ROW_HEIGHT);
    const nVisible = getRowCount();
    const base = deltaRows >= 0 ? drag.anchorBottom : drag.anchorTop;
    let target = clamp(
      base + deltaRows,
      0,
      Math.max(0, nVisible - drag.blockLen),
    );
    drag.targetIndex = target;
    if (deltaRows !== 0) moved = true;
    setDragLineAt(target);
  }

  function onDragMove(e) {
    if (!drag) return;
    lastClientY = e.clientY;
    moveDragLine(lastClientY);
    if (dragLine.style.display === "none") dragLine.style.display = "block";
  }

  function onDragEnd() {
    document.removeEventListener("mousemove", onDragMove);
    sheet.removeEventListener("scroll", onScrollDuringDrag);
    if (autoScrollId != null) {
      cancelAnimationFrame(autoScrollId);
      autoScrollId = null;
    }
    dragLine.style.display = "none";
    if (!drag) return;
    const didMove = !!moved;

    const arr = dataArray();
    if (!arr || arr.length === 0) {
      drag = null;
      return;
    }
    const start = Number.isFinite(drag.blockStart)
      ? drag.blockStart
      : clamp(drag.fromIndex, 0, arr.length - 1);
    const len = Number.isFinite(drag.blockLen) ? drag.blockLen : 1;
    let target = clamp(drag.targetIndex, 0, Math.max(0, getRowCount() - len));

    ensureMinRows(arr, target + len);
    if (!didMove) {
      drag = null;
      moved = false;
      return;
    }
    if (target >= start && target < start + len) {
      drag = null;
      moved = false;
      return;
    }

    const block = arr.splice(start, len);
    if (target > start) target -= len;
    arr.splice(target, 0, ...block);

    clearSelection();
    for (let i = 0; i < len; i++) selection.rows.add(target + i);
    selection.anchor = target;
    sel.r = target;
    layout();
    render();
    const movedLabel = len > 1 ? `${len} rows` : `row`;
    if (status?.set)
      status.set(`Reordered ${movedLabel} ${start + 1} → ${target + 1}`);
    else if (status)
      status.textContent = `Reordered ${movedLabel} ${start + 1} → ${target + 1}`;
    drag = null;
    moved = false;
  }

  rowHdrs.addEventListener("mousedown", (e) => {
    moved = false;
    const rh = e.target.closest(".rhdr");
    if (!rh) return;
    const arr = dataArray();
    const idx = clamp(
      Number(rh.dataset.r) || 0,
      0,
      Math.max(0, getRowCount() - 1),
    );

    // Disarm row-wide horizontal selection (↔) if armed; this is a vertical intent
    if (SelectionNS && SelectionNS.setColsAll) SelectionNS.setColsAll(false);
    else if (
      typeof selection?.colsAll !== "undefined" &&
      !selection?.horizontalMode
    )
      selection.colsAll = false;

    // Normalize selection (works in *all* views, even when reordering is disabled)
    const isAlreadySelected = SelectionNS?.isSelected
      ? SelectionNS.isSelected(idx)
      : selection.rows.has(idx);

    if (SelectionNS && SelectionNS.selectRow && SelectionNS.extendTo) {
      if (e.shiftKey) {
        if (selection.anchor == null) SelectionNS.selectRow(idx);
        else SelectionNS.extendTo(idx);
      } else if (!isAlreadySelected || selection.rows.size === 0) {
        SelectionNS.selectRow(idx);
      } else if (selection.anchor == null) {
        selection.anchor = idx;
      }
    } else {
      // Legacy fallback
      if (e.shiftKey) {
        const rows = Array.from(selection.rows).sort((a, b) => a - b);
        const a = rows.length ? rows[0] : sel.r;
        selection.rows.clear();
        const lo = Math.min(a, idx),
          hi = Math.max(a, idx);
        for (let i = lo; i <= hi; i++) selection.rows.add(i);
        selection.anchor = a;
      } else if (!selection.rows.has(idx) || selection.rows.size === 0) {
        clearSelection();
        selection.rows.add(idx);
        selection.anchor = idx;
      } else if (selection.anchor == null) {
        selection.anchor = idx;
      }
    }
    sel.r = idx;
    render();

    // If the view is not reorderable (e.g., Interactions), stop after selection update
    if (!isReorderableView()) return;

    // --- Begin drag setup (only in reorderable views) ---
    let blockStart, blockEnd, blockLen;
    {
      const rows = Array.from(selection.rows).sort((a, b) => a - b);
      blockStart = rows.length ? rows[0] : idx;
      blockEnd = rows.length ? rows[rows.length - 1] : idx;
      blockLen = blockEnd - blockStart + 1;
    }
    const anchorTop = blockStart;
    const anchorBottom = blockEnd + 1; // boundary below the bottom row

    drag = {
      fromIndex: blockStart,
      targetIndex: anchorBottom,
      blockStart,
      blockLen,
      anchorTop,
      anchorBottom,
      startContentY: contentYFromClient(e.clientY),
    };

    dragLine.style.display = "block";
    setDragLineAt(anchorBottom);
    document.addEventListener("mousemove", onDragMove);
    lastClientY = e.clientY;
    sheet.addEventListener("scroll", onScrollDuringDrag);
    // start edge auto-scroll
    startAutoScroll();
    document.addEventListener("mouseup", onDragEnd, { once: true });
  });

  function onScrollDuringDrag() {
    if (!drag) return;
    if (lastClientY != null) moveDragLine(lastClientY);
    setDragLineAt(drag.targetIndex);
  }

  function startAutoScroll() {
    if (autoScrollId != null) cancelAnimationFrame(autoScrollId);
    const tick = () => {
      if (!drag) {
        autoScrollId = null;
        return;
      }
      const rect = sheet.getBoundingClientRect();
      let dy = 0;
      if (lastClientY != null) {
        if (lastClientY < rect.top + SCROLL_EDGE_ZONE) {
          const d = rect.top + SCROLL_EDGE_ZONE - lastClientY;
          dy = -Math.min(SCROLL_SPEED_STEP, Math.ceil(d / 3));
        } else if (lastClientY > rect.bottom - SCROLL_EDGE_ZONE) {
          const d = lastClientY - (rect.bottom - SCROLL_EDGE_ZONE);
          dy = Math.min(SCROLL_SPEED_STEP, Math.ceil(d / 3));
        }
      }
      if (dy !== 0) {
        const maxScroll = sheet.scrollHeight - sheet.clientHeight;
        sheet.scrollTop = clamp(
          sheet.scrollTop + dy,
          0,
          Math.max(0, maxScroll),
        );
        onScrollDuringDrag();
      }
      autoScrollId = requestAnimationFrame(tick);
    };
    autoScrollId = requestAnimationFrame(tick);
  }

  return () => {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    sheet.removeEventListener("scroll", onScrollDuringDrag);
    if (autoScrollId != null) {
      cancelAnimationFrame(autoScrollId);
      autoScrollId = null;
    }
  };
}
