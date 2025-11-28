import {
  createEmptyCommentMap,
  INTERACTION_COMMENT_META_KEY,
  makeCommentCellKey,
  makeCommentColumnKey,
  makeCommentRowKey,
  normalizeInteractionCommentMetadata,
  normalizeCommentsMap,
} from "../data/comments.js";

function ensureCommentStore(model) {
  if (!model || typeof model !== "object") return null;
  if (!model.comments || typeof model.comments !== "object") {
    model.comments = createEmptyCommentMap();
  } else if (Array.isArray(model.comments)) {
    model.comments = createEmptyCommentMap();
  } else {
    model.comments = normalizeCommentsMap(model.comments);
  }
  return model.comments;
}

function normalizeViewKey(viewDef) {
  const key = viewDef && typeof viewDef === "object" ? viewDef.key : viewDef;
  const str = String(key ?? "").trim();
  return str || "view";
}

function resolveRowId(rowOrId) {
  if (!rowOrId && rowOrId !== 0) return null;
  if (typeof rowOrId === "string") {
    const trimmed = rowOrId.trim();
    return trimmed || null;
  }
  if (typeof rowOrId === "number" && Number.isFinite(rowOrId)) {
    return String(rowOrId);
  }
  if (typeof rowOrId === "object") {
    if (rowOrId == null) return null;
    if (typeof rowOrId.commentRowId === "string") {
      const trimmed = rowOrId.commentRowId.trim();
      if (trimmed) return trimmed;
    }
    if ("id" in rowOrId) {
      const value = rowOrId.id;
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      }
    }
    if (typeof rowOrId.rowId === "string") {
      const trimmed = rowOrId.rowId.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

export function cloneCommentValue(value) {
  if (!value || typeof value !== "object") return value;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch (error) {
      // fall back to JSON clone below
    }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    if (Array.isArray(value)) return value.slice();
    return { ...value };
  }
}

function resolveCommentCoords(viewDef, rowOrId) {
  const viewKey = normalizeViewKey(viewDef);
  const rowId = resolveRowId(rowOrId);
  if (!rowId) return null;
  const rowKey = makeCommentRowKey(viewKey, rowId);
  const base = { viewKey, rowId, rowKey };
  if (viewKey === "interactions") {
    const rowMeta = normalizeInteractionCommentMetadata(rowId, rowOrId);
    if (rowMeta) base.rowMeta = rowMeta;
  }
  return base;
}

function extendWithColumn(coords, viewDef, columnOrIndex) {
  if (!coords) return null;
  const columnKey = makeCommentColumnKey(viewDef, columnOrIndex);
  const cellKey = makeCommentCellKey(viewDef, columnOrIndex, coords.rowId);
  return { ...coords, columnKey, cellKey };
}

function ensureRowBucket(store, viewKey, rowId, rowMeta = null) {
  if (!store) return null;
  if (!store[viewKey] || typeof store[viewKey] !== "object") {
    store[viewKey] = {};
  }
  const viewBucket = store[viewKey];
  if (!viewBucket[rowId] || typeof viewBucket[rowId] !== "object") {
    viewBucket[rowId] = {};
  }
  if (viewKey === "interactions" && rowMeta) {
    const meta =
      viewBucket[rowId][INTERACTION_COMMENT_META_KEY] &&
      typeof viewBucket[rowId][INTERACTION_COMMENT_META_KEY] === "object"
        ? viewBucket[rowId][INTERACTION_COMMENT_META_KEY]
        : {};
    viewBucket[rowId][INTERACTION_COMMENT_META_KEY] = { ...meta, ...rowMeta };
  }
  return viewBucket[rowId];
}

function isInteractionMetaKey(viewKey, columnKey) {
  return viewKey === "interactions" && String(columnKey) === INTERACTION_COMMENT_META_KEY;
}

function readInteractionRowMeta(viewKey, rowId, rowBucket) {
  if (viewKey !== "interactions") return null;
  const meta = normalizeInteractionCommentMetadata(
    rowId,
    rowBucket && rowBucket[INTERACTION_COMMENT_META_KEY],
  );
  return meta || null;
}

function hasCommentColumns(viewKey, rowBucket) {
  if (!rowBucket || typeof rowBucket !== "object") return false;
  return Object.keys(rowBucket).some((key) => !isInteractionMetaKey(viewKey, key));
}

export function setComment(model, viewDef, rowOrId, columnOrIndex, value) {
  const store = ensureCommentStore(model);
  const coords = extendWithColumn(resolveCommentCoords(viewDef, rowOrId), viewDef, columnOrIndex);
  if (!store || !coords) return null;
  const rowBucket = ensureRowBucket(store, coords.viewKey, coords.rowId, coords.rowMeta);
  if (!rowBucket) return null;
  const previous = Object.prototype.hasOwnProperty.call(rowBucket, coords.columnKey)
    ? rowBucket[coords.columnKey]
    : undefined;
  if (Object.is(previous, value)) {
    return null;
  }
  rowBucket[coords.columnKey] = cloneCommentValue(value);
  const rowMeta = coords.rowMeta || readInteractionRowMeta(coords.viewKey, coords.rowId, rowBucket);
  return {
    type: "set",
    ...coords,
    rowMeta: rowMeta ? cloneCommentValue(rowMeta) : null,
    value: rowBucket[coords.columnKey],
    previous,
  };
}

export function deleteComment(model, viewDef, rowOrId, columnOrIndex) {
  const store = ensureCommentStore(model);
  const baseCoords = resolveCommentCoords(viewDef, rowOrId);
  if (!store || !baseCoords) return null;
  const viewBucket = store[baseCoords.viewKey];
  if (!viewBucket || typeof viewBucket !== "object") return null;

  if (columnOrIndex == null) {
    const rowBucket = viewBucket[baseCoords.rowId];
    if (!rowBucket || typeof rowBucket !== "object") return null;
    const snapshot = { ...rowBucket };
    const rowMeta = baseCoords.rowMeta || readInteractionRowMeta(baseCoords.viewKey, baseCoords.rowId, rowBucket);
    delete viewBucket[baseCoords.rowId];
    return {
      type: "deleteRow",
      ...baseCoords,
      columnKey: null,
      cellKey: null,
      rowMeta: rowMeta ? cloneCommentValue(rowMeta) : null,
      previous: snapshot,
    };
  }

  const coords = extendWithColumn(baseCoords, viewDef, columnOrIndex);
  if (!coords) return null;
  const rowBucket = viewBucket[coords.rowId];
  if (!rowBucket || typeof rowBucket !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(rowBucket, coords.columnKey)) {
    return null;
  }
  const previous = rowBucket[coords.columnKey];
  const rowMeta = coords.rowMeta || readInteractionRowMeta(coords.viewKey, coords.rowId, rowBucket);
  delete rowBucket[coords.columnKey];
  if (!hasCommentColumns(coords.viewKey, rowBucket)) {
    delete viewBucket[coords.rowId];
  }
  return {
    type: "delete",
    ...coords,
    rowMeta: rowMeta ? cloneCommentValue(rowMeta) : null,
    previous,
  };
}

function buildColumnIndexMap(viewDef) {
  const columns = Array.isArray(viewDef?.columns) ? viewDef.columns : [];
  const map = new Map();
  for (let index = 0; index < columns.length; index++) {
    const key = makeCommentColumnKey(viewDef, index);
    map.set(key, { index, column: columns[index] });
  }
  return map;
}

function makeRowIndexResolver(viewDef, options = {}) {
  const { rows, findRowIndex } = options || {};
  if (typeof findRowIndex === "function") {
    return (rowId) => {
      const result = findRowIndex(rowId);
      return Number.isFinite(result) ? result : -1;
    };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return () => -1;
  }
  const cache = new Map();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const coords = resolveCommentCoords(viewDef, row);
    if (!coords) continue;
    if (!cache.has(coords.rowId)) cache.set(coords.rowId, index);
  }
  return (rowId) => {
    if (!cache.size) return -1;
    const key = String(rowId ?? "");
    if (cache.has(key)) return cache.get(key);
    return -1;
  };
}

export function listCommentsForView(model, viewDef, options = {}) {
  if (!model || typeof model !== "object") return [];
  const store = model.comments;
  if (!store || typeof store !== "object") return [];

  const vd = viewDef && typeof viewDef === "object" ? viewDef : null;
  const viewKey = normalizeViewKey(vd);
  const viewBucket = store[viewKey];
  if (!viewBucket || typeof viewBucket !== "object") return [];

  const columnMap = buildColumnIndexMap(vd);
  const resolveRowIndex = makeRowIndexResolver(vd, options);

  const entries = [];
  for (const [rawRowId, columns] of Object.entries(viewBucket)) {
    if (!columns || typeof columns !== "object") continue;
    const rowId = String(rawRowId);
    const rowIndex = resolveRowIndex(rowId);
    const rowMeta = readInteractionRowMeta(viewKey, rowId, columns);
    for (const [rawColumnKey, value] of Object.entries(columns)) {
      const columnKey = String(rawColumnKey);
      if (isInteractionMetaKey(viewKey, columnKey)) continue;
      const columnInfo = columnMap.get(columnKey);
      const columnIndex = columnInfo ? columnInfo.index : -1;
      const cellKey = columnIndex >= 0
        ? makeCommentCellKey(vd, columnIndex, rowId)
        : `${makeCommentRowKey(viewKey, rowId)}|${columnKey}`;
      entries.push({
        type: "value",
        viewKey,
        rowId,
        rowKey: makeCommentRowKey(viewKey, rowId),
        rowIndex,
        columnKey,
        columnIndex,
        cellKey,
        value: cloneCommentValue(value),
        rowMeta: rowMeta ? cloneCommentValue(rowMeta) : null,
        column: columnInfo ? columnInfo.column : null,
      });
    }
  }

  entries.sort((a, b) => {
    if (a.rowIndex === b.rowIndex) {
      if (a.columnIndex === b.columnIndex) {
        if (a.rowId === b.rowId) return a.columnKey.localeCompare(b.columnKey);
        return a.rowId.localeCompare(b.rowId);
      }
      if (a.columnIndex < 0) return 1;
      if (b.columnIndex < 0) return -1;
      return a.columnIndex - b.columnIndex;
    }
    if (a.rowIndex < 0) return 1;
    if (b.rowIndex < 0) return -1;
    return a.rowIndex - b.rowIndex;
  });

  return entries;
}

export function listCommentsForCell(model, viewDef, rowOrId, columnOrIndex) {
  if (!model || typeof model !== "object") return [];
  const store = model.comments;
  if (!store || typeof store !== "object") return [];
  const coords = extendWithColumn(resolveCommentCoords(viewDef, rowOrId), viewDef, columnOrIndex);
  if (!coords) return [];
  const viewBucket = store[coords.viewKey];
  if (!viewBucket || typeof viewBucket !== "object") return [];
  const rowBucket = viewBucket[coords.rowId];
  if (!rowBucket || typeof rowBucket !== "object") return [];
  if (!Object.prototype.hasOwnProperty.call(rowBucket, coords.columnKey)) {
    return [];
  }
  const rowMeta = coords.rowMeta || readInteractionRowMeta(coords.viewKey, coords.rowId, rowBucket);
  return [
    {
      ...coords,
      type: "value",
      rowMeta: rowMeta ? cloneCommentValue(rowMeta) : null,
      value: rowBucket[coords.columnKey],
    },
  ];
}

export function makeCommentClipboardPayload(entry) {
  if (!entry || typeof entry !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(entry, "value")) return null;
  const payload = {
    type: "comment",
    data: {
      value: cloneCommentValue(entry.value),
    },
  };
  if (entry.viewKey != null) payload.data.viewKey = String(entry.viewKey);
  if (entry.rowId != null) payload.data.rowId = String(entry.rowId);
  if (entry.columnKey != null) payload.data.columnKey = String(entry.columnKey);
  if (entry.cellKey != null) payload.data.cellKey = String(entry.cellKey);
  if (entry.rowMeta != null) payload.data.rowMeta = cloneCommentValue(entry.rowMeta);
  return payload;
}

export function extractCommentClipboardData(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.type !== "comment") return null;
  const data = payload.data;
  if (!data || typeof data !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(data, "value")) return null;
  const result = {
    value: cloneCommentValue(data.value),
  };
  if (data.viewKey != null) result.viewKey = String(data.viewKey);
  if (data.rowId != null) result.rowId = String(data.rowId);
  if (data.columnKey != null) result.columnKey = String(data.columnKey);
  if (data.cellKey != null) result.cellKey = String(data.cellKey);
  if (data.rowMeta != null) result.rowMeta = cloneCommentValue(data.rowMeta);
  return result;
}

export function setCommentInactive(model, viewDef, rowOrId, columnOrIndex, inactive = true) {
  const store = ensureCommentStore(model);
  const coords = extendWithColumn(
    resolveCommentCoords(viewDef, rowOrId),
    viewDef,
    columnOrIndex,
  );
  if (!store || !coords) return null;
  const viewBucket = store[coords.viewKey];
  const rowBucket = viewBucket?.[coords.rowId];
  if (!rowBucket || typeof rowBucket !== "object") return null;
  if (coords.rowMeta) {
    const meta =
      rowBucket[INTERACTION_COMMENT_META_KEY] &&
      typeof rowBucket[INTERACTION_COMMENT_META_KEY] === "object"
        ? rowBucket[INTERACTION_COMMENT_META_KEY]
        : {};
    rowBucket[INTERACTION_COMMENT_META_KEY] = { ...meta, ...coords.rowMeta };
  }
  if (!Object.prototype.hasOwnProperty.call(rowBucket, coords.columnKey)) return null;
  const current = rowBucket[coords.columnKey];
  if (!current || typeof current !== "object") return null;
  const desiredInactive = !!inactive;
  if (desiredInactive && current.inactive === true) return null;
  if (!desiredInactive && current.inactive !== true) return null;
  const previous = cloneCommentValue(current);
  const next = { ...current };
  if (desiredInactive) next.inactive = true;
  else if (Object.prototype.hasOwnProperty.call(next, "inactive")) delete next.inactive;
  const rowMeta = coords.rowMeta || readInteractionRowMeta(coords.viewKey, coords.rowId, rowBucket);
  rowBucket[coords.columnKey] = next;
  return {
    type: "set",
    ...coords,
    rowMeta: rowMeta ? cloneCommentValue(rowMeta) : null,
    value: cloneCommentValue(next),
    previous,
  };
}

function parseInteractionCommentRowId(rowId, rowBucket = null) {
  const meta = normalizeInteractionCommentMetadata(
    rowId,
    rowBucket && rowBucket[INTERACTION_COMMENT_META_KEY],
  );
  if (!meta) return null;
  const aId = Number(meta.actionId);
  const rhs = Number(meta.rhsActionId);
  return {
    kind: meta.kind || null,
    aId: Number.isFinite(aId) ? aId : null,
    rhsActionId: Number.isFinite(rhs) ? rhs : null,
  };
}

export function removeInteractionsCommentsForActionIds(model, actionIds) {
  const store = ensureCommentStore(model);
  if (!store || !Array.isArray(actionIds) || !actionIds.length) return [];
  const viewBucket = store.interactions;
  if (!viewBucket || typeof viewBucket !== "object") return [];
  const ids = new Set(
    actionIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
      .map((id) => String(id)),
  );
  if (!ids.size) return [];

  const removed = [];
  for (const [rowId, columns] of Object.entries(viewBucket)) {
    const meta = parseInteractionCommentRowId(rowId, columns);
    if (!meta) continue;
    const matches =
      (meta.aId != null && ids.has(String(meta.aId))) ||
      (meta.rhsActionId != null && ids.has(String(meta.rhsActionId)));
    if (!matches) continue;
    const snapshot = {};
    if (columns && typeof columns === "object") {
      for (const [columnKey, value] of Object.entries(columns)) {
        snapshot[columnKey] = cloneCommentValue(value);
      }
    }
    const rowMeta = readInteractionRowMeta("interactions", rowId, columns);
    delete viewBucket[rowId];
    removed.push({
      type: "deleteRow",
      viewKey: "interactions",
      rowId: String(rowId),
      rowKey: makeCommentRowKey("interactions", rowId),
      columnKey: null,
      cellKey: null,
      rowMeta: rowMeta ? cloneCommentValue(rowMeta) : null,
      previous: snapshot,
    });
  }
  return removed;
}
