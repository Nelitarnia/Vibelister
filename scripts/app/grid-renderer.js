import {
  colWidths,
  colOffsets,
  visibleCols,
  visibleRows,
} from "../data/utils.js";
import {
  getEntityColorsFromRow,
  computeColorPreviewForColorColumn,
} from "../data/color-utils.js";

function createGridRenderer({
  sheet,
  cellsLayer,
  spacer,
  colHdrs,
  rowHdrs,
  selection,
  SelectionNS,
  sel,
  getActiveView,
  viewDef,
  dataArray,
  getRowCount,
  getCell,
  isRowSelected,
  model,
  rebuildInteractionPhaseColumns,
  noteKeyForPair,
  parsePhaseKey,
  ROW_HEIGHT,
  updateSelectionSnapshot,
  isModColumn,
  modIdFromKey,
}) {
  let colGeomCache = { key: null, widths: null, offs: null, stamp: 0 };
  const colHeaderPool = Array.from(colHdrs.children || []);
  const rowHeaderPool = Array.from(rowHdrs.children || []);

  function ensurePoolSize(pool, container, needed, className) {
    for (let i = pool.length; i < needed; i++) {
      const el = document.createElement("div");
      el.className = className;
      container.appendChild(el);
      pool.push(el);
    }
    for (let i = 0; i < pool.length; i++) {
      const el = pool[i];
      if (i < needed) {
        if (el.className !== className) el.className = className;
        if (el.style.display !== "") el.style.display = "";
      } else if (el.style.display !== "none") {
        el.style.display = "none";
      }
    }
  }

  function ensureHeaderContent(el) {
    if (!el) return { label: null, handle: null };
    let label = el._labelEl;
    let handle = el._resizeHandle;
    if (!label || !handle || !label.isConnected || !handle.isConnected) {
      el.textContent = "";
      label = document.createElement("span");
      label.className = "hdr__label";
      handle = document.createElement("div");
      handle.className = "hdr__resize-handle";
      el.appendChild(label);
      el.appendChild(handle);
      el._labelEl = label;
      el._resizeHandle = handle;
    }
    return { label, handle };
  }

  function getColGeomFor(columns) {
    const key = columns || null;
    if (
      colGeomCache.key === key &&
      colGeomCache.widths &&
      colGeomCache.offs
    )
      return colGeomCache;
    const widths = colWidths(columns || []);
    const offs = colOffsets(widths);
    colGeomCache = { key, widths, offs, stamp: (colGeomCache.stamp | 0) + 1 };
    return colGeomCache;
  }

  function ensureVisible(r, c, options = null) {
    const { offs } = getColGeomFor(viewDef().columns);
    const vw = sheet.clientWidth,
      vh = sheet.clientHeight,
      cl = offs[c],
      cr = offs[c + 1],
      ct = r * ROW_HEIGHT,
      cb = ct + ROW_HEIGHT;
    const align =
      options && typeof options === "object" && typeof options.align === "string"
        ? options.align
        : null;
    if (cl < sheet.scrollLeft) sheet.scrollLeft = cl;
    if (cr > sheet.scrollLeft + vw) {
      const maxScrollLeft = Math.max(0, sheet.scrollWidth - vw);
      const targetLeft = cr - vw;
      sheet.scrollLeft = Math.max(0, Math.min(targetLeft, maxScrollLeft));
    }
    const maxScrollTop = Math.max(0, sheet.scrollHeight - vh);
    if (ct < sheet.scrollTop) {
      const targetTop = Math.max(0, Math.min(ct, maxScrollTop));
      sheet.scrollTop = targetTop;
    }
    if (cb > sheet.scrollTop + vh) {
      const targetTop =
        align && align.toLowerCase() === "top"
          ? ct
          : cb - vh;
      sheet.scrollTop = Math.max(0, Math.min(targetTop, maxScrollTop));
    }
  }

  function getEntityCollection(entity) {
    const key = String(entity || "").toLowerCase();
    if (key === "action") return model.actions || [];
    if (key === "input") return model.inputs || [];
    if (key === "modifier") return model.modifiers || [];
    if (key === "outcome") return model.outcomes || [];
    return null;
  }

  function getEntityColors(entity, id) {
    if (id == null) return null;
    const arr = getEntityCollection(entity);
    if (!arr || !arr.length) return null;
    const numId = Number(id);
    if (!Number.isFinite(numId)) return null;
    const row = arr.find((x) => (x?.id | 0) === (numId | 0));
    if (!row) return null;
    return getEntityColorsFromRow(row);
  }

  function computeCellColors(r, c, col, row) {
    if (!col) return null;
    const activeView = String(getActiveView() || "");
    const kind = String(col.kind || "").toLowerCase();
    if (kind === "color") {
      if (activeView === "interactions") return null;
      return computeColorPreviewForColorColumn(row, col.key);
    }

    if (activeView === "interactions") {
      const pair = model.interactionsPairs?.[r];
      if (!pair) return null;

      if (kind === "refro" || kind === "refpick") {
        const entityKey = String(col.entity || "").toLowerCase();
        let id = null;
        if (entityKey === "action") {
          const keyL = String(col.key || "").toLowerCase();
          if (
            keyL === "rhsaction" ||
            keyL === "rhsactionid" ||
            keyL === "rhsactionname"
          )
            id = pair.rhsActionId;
          else id = pair.aId;
        } else if (entityKey === "input") {
          id = pair.iId;
        }
        if (id == null) return null;
        return getEntityColors(col.entity, id);
      }

      if (kind === "interactions") {
        const pk = parsePhaseKey(col.key);
        if (!pk) return null;
        const note = model.notes?.[noteKeyForPair(pair, pk.p)] || {};
        if (pk.field === "outcome") {
          const info = getEntityColors("outcome", note.outcomeId);
          return info || null;
        }
        if (pk.field === "end") {
          const info = getEntityColors("action", note.endActionId);
          return info || null;
        }
        return null;
      }

      return null;
    }

    if (isModColumn(col)) {
      const modId = modIdFromKey(col.key);
      if (!Number.isFinite(modId)) return null;
      return getEntityColors("modifier", modId);
    }

    if (kind === "refro" || kind === "refpick") {
      const id = row?.[col.key];
      return getEntityColors(col.entity, id);
    }

    return null;
  }

  function applyCellColors(el, info) {
    if (!info) {
      el.style.background = "";
      el.style.color = "";
      return;
    }
    if (Object.prototype.hasOwnProperty.call(info, "background")) {
      el.style.background = info.background || "";
    } else {
      el.style.background = "";
    }
    if (Object.prototype.hasOwnProperty.call(info, "foreground")) {
      el.style.color = info.foreground || "";
    } else {
      el.style.color = "";
    }
  }

  function layout() {
    const cols = viewDef().columns;
    const { widths } = getColGeomFor(cols);
    const totalW = widths.reduce((a, b) => a + b, 0),
      totalH = getRowCount() * ROW_HEIGHT;
    spacer.style.width = totalW + "px";
    spacer.style.height = totalH + "px";
  }

  function render() {
    updateSelectionSnapshot({ row: sel.r, col: sel.c });
    if (getActiveView() === "interactions") {
      rebuildInteractionPhaseColumns();
    }
    const vw = sheet.clientWidth,
      vh = sheet.clientHeight;
    const sl = sheet.scrollLeft,
      st = sheet.scrollTop;

    const cols = viewDef().columns;
    const { widths, offs } = getColGeomFor(cols);
    const vc = visibleCols(offs, sl, vw, cols.length),
      vr = visibleRows(st, vh, ROW_HEIGHT, getRowCount());

    colHdrs.style.transform = `translateX(${-sl}px)`;
    rowHdrs.style.transform = `translateY(${-st}px)`;

    const activeView = String(getActiveView() || "");
    const visibleColsCount =
      vc.end >= vc.start ? vc.end - vc.start + 1 : 0;
    const visibleRowsCount =
      vr.end >= vr.start ? vr.end - vr.start + 1 : 0;

    ensurePoolSize(colHeaderPool, colHdrs, visibleColsCount, "hdr");
    ensurePoolSize(rowHeaderPool, rowHdrs, visibleRowsCount, "rhdr");

    let colIndex = 0;
    for (let c = vc.start; c <= vc.end; c++) {
      const d = colHeaderPool[colIndex++];
      if (!d) continue;
      d.style.left = offs[c] + "px";
      d.style.width = widths[c] + "px";
      d.style.top = "0px";
      d.dataset.colIndex = c;
      d.dataset.viewKey = activeView;
      const col = cols[c];
      const t = col.title;
      let tooltip = t;
      if (activeView === "interactions") {
        const mode = (model.meta && model.meta.interactionsMode) || "AI";
        tooltip = `${t} — Interactions Mode: ${mode}`;
      }
      const { label, handle } = ensureHeaderContent(d);
      if (label) label.textContent = t || "";
      if (handle) {
        handle.dataset.colIndex = String(c);
        handle.dataset.viewKey = activeView;
        handle.dataset.columnKey = col?.key ?? "";
      }
      d.dataset.columnKey = col?.key ?? "";
      d.title = tooltip;
    }

    let rowIndex = 0;
    for (let r = vr.start; r <= vr.end; r++) {
      const d = rowHeaderPool[rowIndex++];
      if (!d) continue;
      const top = r * ROW_HEIGHT;
      d.style.top = top + "px";
      d.dataset.r = r;
      let label = String(r + 1);
      {
        const colsAll =
          (SelectionNS && SelectionNS.isAllCols && SelectionNS.isAllCols()) ||
          !!selection.colsAll;
        if (isRowSelected(r) && colsAll) label += " ↔";
      }
      d.textContent = label;
      if (isRowSelected(r)) {
        d.style.background = "#26344d";
        d.style.color = "#e6eefc";
      } else {
        d.style.background = "";
        d.style.color = "";
      }
    }

    const need = visibleColsCount * visibleRowsCount;

    window.__cellPool = window.__cellPool || [];
    const cellPool = window.__cellPool;
    while (cellPool.length < need) {
      const d = document.createElement("div");
      d.className = "cell";
      cellsLayer.appendChild(d);
      cellPool.push(d);
    }
    for (let i = need; i < cellPool.length; i++) {
      const d = cellPool[i];
      if (d.style.display !== "none") d.style.display = "none";
    }

    const rows = activeView === "interactions" ? null : dataArray();
    let k = 0;
    for (let r = vr.start; r <= vr.end; r++) {
      const top = r * ROW_HEIGHT;
      const row = rows ? rows[r] : null;
      for (let c = vc.start; c <= vc.end; c++) {
        const left = offs[c],
          w = widths[c];
        const d = cellPool[k++];
        if (d.style.display !== "") d.style.display = "";
        d.style.left = left + "px";
        d.style.top = top + "px";
        d.style.width = w + "px";
        d.style.height = ROW_HEIGHT + "px";
        d.dataset.r = r;
        d.dataset.c = c;
        d.textContent = getCell(r, c);
        const col = cols[c];
        const colorInfo = computeCellColors(r, c, col, row);
        if (
          colorInfo &&
          Object.prototype.hasOwnProperty.call(colorInfo, "textOverride")
        )
          d.textContent = colorInfo.textOverride;
        applyCellColors(d, colorInfo);
        d.title = colorInfo && colorInfo.title ? colorInfo.title : "";
        if (r % 2 === 1) d.classList.add("alt");
        else d.classList.remove("alt");
        const isMultiSelection =
          (selection.rows && selection.rows.size > 1) ||
          (selection.cols && selection.cols.size > 1) ||
          !!selection.colsAll;
        let inRange = false;
        if (isMultiSelection) {
          const inRow = selection.rows && selection.rows.has(r);
          const inCol = selection.colsAll
            ? true
            : selection.cols && selection.cols.size
            ? selection.cols.has(c)
            : c === sel.c;
          inRange = !!(inRow && inCol);
        }
        if (inRange) d.classList.add("range-selected");
        else d.classList.remove("range-selected");
        if (r === sel.r && c === sel.c) d.classList.add("selected");
        else d.classList.remove("selected");
        d.style.opacity = "";
        if (activeView === "interactions") {
          const colKey = cols[c] && cols[c].key;
          if (colKey) {
            const s = String(colKey);
            const i = s.indexOf(":");
            if (s[0] === "p" && i > 1) {
              const pNum = Number(s.slice(1, i));
              const field = s.slice(i + 1);
              if (
                (field === "outcome" || field === "end") &&
                Number.isFinite(pNum)
              ) {
                const pair = model.interactionsPairs[r];
                if (pair) {
                  const a = model.actions.find((x) => x.id === pair.aId);
                  const ids = a && a.phases && a.phases.ids ? a.phases.ids : [];
                  if (ids.length && ids.indexOf(pNum) === -1) {
                    d.style.opacity = "0.6";
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return { render, layout, ensureVisible, getColGeomFor };
}

export { createGridRenderer };
