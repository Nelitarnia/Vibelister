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
import { commentColorPresetById } from "../data/comment-colors.js";
import { listCommentsForCell } from "./comments.js";

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
  getInteractionsPair,
}) {
  let colGeomCache = { key: null, widths: null, offs: null, stamp: 0 };
  const colHeaderPool = Array.from(colHdrs.children || []);
  const rowHeaderPool = Array.from(rowHdrs.children || []);

  function normalizeCellValue(value) {
    if (value == null) return { plainText: "", segments: null };
    if (typeof value === "string") return { plainText: value, segments: null };
    if (typeof value === "number" || typeof value === "boolean") {
      return { plainText: String(value), segments: null };
    }
    if (typeof value === "object") {
      const rawSegments = Array.isArray(value.segments) ? value.segments : null;
      const segments = rawSegments
        ? rawSegments
            .map((seg) => {
              const text =
                seg && seg.text != null ? String(seg.text) : "";
              const foreground =
                seg && typeof seg.foreground === "string" && seg.foreground
                  ? seg.foreground
                  : null;
              return text
                ? {
                    text,
                    foreground,
                  }
                : null;
            })
            .filter(Boolean)
        : null;
      let plainText = "";
      if (typeof value.plainText === "string") plainText = value.plainText;
      else if (segments && segments.length)
        plainText = segments.map((seg) => seg.text).join("");
      else if (typeof value.text === "string") plainText = value.text;
      else if (typeof value.value === "string") plainText = value.value;
      return {
        plainText,
        segments: segments && segments.length ? segments : null,
      };
    }
    return { plainText: String(value), segments: null };
  }

  function ensureCellStructure(el) {
    if (!el) return { content: null, badge: null };
    let content = el._contentEl;
    let badge = el._commentBadge;
    if (!content || !content.isConnected) {
      content = document.createElement("div");
      content.className = "cell__content";
      if (badge && badge.parentNode === el) el.insertBefore(content, badge);
      else el.insertBefore(content, el.firstChild);
      el._contentEl = content;
    }
    if (!badge || !badge.isConnected) {
      badge = document.createElement("span");
      badge.className = "cell__comment-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.dataset.visible = "false";
      badge.dataset.status = "default";
      el.appendChild(badge);
      el._commentBadge = badge;
    } else if (content && badge.previousSibling !== content && content.parentNode === el) {
      el.insertBefore(content, badge);
    }
    return { content, badge };
  }

  function setCellContent(el, text, segments) {
    const { content } = ensureCellStructure(el);
    if (!content) return;
    if (segments && segments.length) {
      while (content.firstChild) content.removeChild(content.firstChild);
      const frag = document.createDocumentFragment();
      for (const seg of segments) {
        const span = document.createElement("span");
        span.textContent = seg.text;
        span.style.color = seg.foreground || "";
        frag.appendChild(span);
      }
      content.textContent = "";
      content.appendChild(frag);
      content._richText = true;
    } else {
      if (content._richText) {
        while (content.firstChild) content.removeChild(content.firstChild);
        content._richText = false;
      }
      content.textContent =
        typeof text === "string" ? text : text == null ? "" : String(text);
    }
  }

  function deriveCommentStatus(value) {
    if (!value || typeof value !== "object") return "default";
    if (value.inactive === true) return "inactive";
    if (typeof value.status === "string" && value.status.trim())
      return value.status.trim().toLowerCase();
    if (value.resolved === true) return "resolved";
    if (value.resolved === false) return "open";
    if (typeof value.severity === "string" && value.severity.trim())
      return `severity-${value.severity.trim().toLowerCase()}`;
    return "default";
  }

  function deriveCommentColorId(value) {
    if (!value || typeof value !== "object") return "";
    const raw = value.color;
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    return trimmed || "";
  }

  function applyCommentBadgeColor(badge, colorId) {
    if (!badge) return;
    const preset = commentColorPresetById(colorId);
    if (preset) {
      badge.dataset.color = preset.id;
      badge.style.background = preset.badgeBackground || "";
      badge.style.borderColor = preset.badgeBorder || "";
      badge.style.color = preset.badgeText || "";
    } else {
      if (badge.dataset.color) delete badge.dataset.color;
      badge.style.background = "";
      badge.style.borderColor = "";
      badge.style.color = "";
    }
  }

  function updateCommentBadge(cell, entries) {
    const { badge } = ensureCellStructure(cell);
    if (!badge) return;
    const hasComments = Array.isArray(entries) && entries.length > 0;
    badge.dataset.visible = hasComments ? "true" : "false";
    badge.dataset.status = "default";
    badge.textContent = "";
    badge.removeAttribute("title");
    cell.dataset.comment = hasComments ? "true" : "false";
    if (!hasComments) {
      applyCommentBadgeColor(badge, "");
      return;
    }
    const count = entries.length;
    badge.textContent = count > 1 ? String(count) : "•";
    const primary = entries[0] || null;
    badge.dataset.status = deriveCommentStatus(primary?.value) || "default";
    applyCommentBadgeColor(badge, deriveCommentColorId(primary?.value));
    const value = primary?.value;
    if (value && typeof value === "object") {
      const text =
        typeof value.text === "string"
          ? value.text
          : typeof value.note === "string"
            ? value.note
            : null;
      if (text) badge.title = text;
    } else if (value != null) {
      badge.title = String(value);
    } else {
      badge.title = "Comment attached";
    }
  }

  function getInteractionCommentIdentity(rowIndex) {
    if (typeof getInteractionsPair !== "function") return null;
    try {
      const pair = getInteractionsPair(model, rowIndex);
      if (!pair || typeof noteKeyForPair !== "function") return null;
      const baseKey = noteKeyForPair(pair, undefined);
      if (!baseKey) return null;
      return { commentRowId: baseKey };
    } catch (_error) {
      return null;
    }
  }

  function listCommentsFor(activeView, viewDefinition, row, rowIndex, column) {
    if (!column || !model || !model.comments) return [];
    if (typeof listCommentsForCell !== "function") return [];
    if (activeView === "interactions") {
      const identity = getInteractionCommentIdentity(rowIndex);
      if (!identity) return [];
      return listCommentsForCell(model, viewDefinition, identity, column) || [];
    }
    if (!row) return [];
    return listCommentsForCell(model, viewDefinition, row, column) || [];
  }

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
      const pair = getInteractionsPair(model, r);
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

    const viewDefinition = viewDef();
    const cols = viewDefinition.columns;
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
      const alignValue =
        col && typeof col.align === "string" && col.align.trim()
          ? col.align.trim().toLowerCase()
          : "";
      if (alignValue) d.dataset.align = alignValue;
      else if (d.dataset.align) delete d.dataset.align;
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
      d.dataset.comment = "false";
      const badge = d._commentBadge;
      if (badge) {
        badge.dataset.visible = "false";
        badge.dataset.status = "default";
        badge.textContent = "";
        badge.removeAttribute("title");
      }
    }

    const rows = activeView === "interactions" ? null : dataArray();
    const commentStoreAvailable = !!(model && model.comments);
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
        const rawValue = getCell(r, c);
        const normalized = normalizeCellValue(rawValue);
        let displayText =
          typeof normalized.plainText === "string"
            ? normalized.plainText
            : String(normalized.plainText ?? "");
        let displaySegments = normalized.segments;
        const col = cols[c];
        const alignValue =
          col && typeof col.align === "string" && col.align.trim()
            ? col.align.trim().toLowerCase()
            : "";
        if (alignValue) d.dataset.align = alignValue;
        else if (d.dataset.align) delete d.dataset.align;
        const commentEntries =
          commentStoreAvailable && col
            ? listCommentsFor(activeView, viewDefinition, row, r, col)
            : [];
        const colorInfo = computeCellColors(r, c, col, row);
        if (
          colorInfo &&
          Object.prototype.hasOwnProperty.call(colorInfo, "textOverride")
        ) {
          const override = colorInfo.textOverride;
          displayText = override == null ? "" : String(override);
          displaySegments = null;
        }
        setCellContent(d, displayText, displaySegments);
        applyCellColors(d, colorInfo);
        d.title = colorInfo && colorInfo.title ? colorInfo.title : "";
        updateCommentBadge(d, commentEntries);
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
                (field === "outcome" || field === "end" || field === "tag") &&
                Number.isFinite(pNum)
              ) {
                const pair = getInteractionsPair(model, r);
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
