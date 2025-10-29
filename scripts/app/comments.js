import {
  createEmptyCommentMap,
  makeCommentCellKey,
  makeCommentColumnKey,
  makeCommentRowKey,
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

function cloneValue(value) {
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
  return { viewKey, rowId, rowKey };
}

function extendWithColumn(coords, viewDef, columnOrIndex) {
  if (!coords) return null;
  const columnKey = makeCommentColumnKey(viewDef, columnOrIndex);
  const cellKey = makeCommentCellKey(viewDef, columnOrIndex, coords.rowId);
  return { ...coords, columnKey, cellKey };
}

function ensureRowBucket(store, viewKey, rowId) {
  if (!store) return null;
  if (!store[viewKey] || typeof store[viewKey] !== "object") {
    store[viewKey] = {};
  }
  const viewBucket = store[viewKey];
  if (!viewBucket[rowId] || typeof viewBucket[rowId] !== "object") {
    viewBucket[rowId] = {};
  }
  return viewBucket[rowId];
}

export function setComment(model, viewDef, rowOrId, columnOrIndex, value) {
  const store = ensureCommentStore(model);
  const coords = extendWithColumn(resolveCommentCoords(viewDef, rowOrId), viewDef, columnOrIndex);
  if (!store || !coords) return null;
  const rowBucket = ensureRowBucket(store, coords.viewKey, coords.rowId);
  if (!rowBucket) return null;
  const previous = Object.prototype.hasOwnProperty.call(rowBucket, coords.columnKey)
    ? rowBucket[coords.columnKey]
    : undefined;
  if (Object.is(previous, value)) {
    return null;
  }
  rowBucket[coords.columnKey] = cloneValue(value);
  return {
    type: "set",
    ...coords,
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
    delete viewBucket[baseCoords.rowId];
    return {
      type: "deleteRow",
      ...baseCoords,
      columnKey: null,
      cellKey: null,
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
  delete rowBucket[coords.columnKey];
  if (!Object.keys(rowBucket).length) {
    delete viewBucket[coords.rowId];
  }
  return {
    type: "delete",
    ...coords,
    previous,
  };
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
  return [
    {
      ...coords,
      type: "value",
      value: rowBucket[coords.columnKey],
    },
  ];
}
