// comments.js — helpers for comment storage and key generation

export const DEFAULT_COMMENT_VIEW_KEYS = Object.freeze([
  "actions",
  "inputs",
  "modifiers",
  "outcomes",
  "interactions",
]);

function normalizeRowId(rowId) {
  const asNumber = Number(rowId);
  if (Number.isFinite(asNumber)) return String(asNumber);
  const str = String(rowId ?? "").trim();
  return str || "row";
}

function normalizeViewKey(viewKey) {
  const str = String(viewKey ?? "").trim();
  return str || "view";
}

function resolveColumns(viewDef) {
  if (viewDef && Array.isArray(viewDef.columns)) return viewDef.columns;
  return [];
}

function resolveColumn(columns, columnOrIndex) {
  if (typeof columnOrIndex === "number") {
    const index = columnOrIndex | 0;
    if (index >= 0 && index < columns.length) return { column: columns[index], index };
    return { column: null, index };
  }
  if (columnOrIndex && typeof columnOrIndex === "object") {
    const index = columns.indexOf(columnOrIndex);
    return { column: columnOrIndex, index };
  }
  return { column: null, index: -1 };
}

function fallbackColumnKey(columns, index) {
  const safeIndex = Number.isFinite(index) && index >= 0 ? index : 0;
  return `col${safeIndex}`;
}

export function createEmptyCommentMap(viewKeys = DEFAULT_COMMENT_VIEW_KEYS) {
  return normalizeCommentsMap({}, viewKeys);
}

export function normalizeCommentsMap(rawComments, viewKeys = DEFAULT_COMMENT_VIEW_KEYS) {
  const normalized = {};
  if (rawComments && typeof rawComments === "object") {
    for (const [viewKey, rows] of Object.entries(rawComments)) {
      const safeViewKey = normalizeViewKey(viewKey);
      const bucket = {};
      if (rows && typeof rows === "object" && !Array.isArray(rows)) {
        for (const [rowKey, value] of Object.entries(rows)) {
          bucket[normalizeRowId(rowKey)] = value;
        }
      }
      normalized[safeViewKey] = bucket;
    }
  }

  for (const key of viewKeys || []) {
    const safeKey = normalizeViewKey(key);
    if (!(safeKey in normalized)) normalized[safeKey] = {};
  }

  return normalized;
}

export function makeCommentRowKey(viewKey, rowId) {
  return `${normalizeViewKey(viewKey)}:${normalizeRowId(rowId)}`;
}

export function makeCommentColumnKey(viewDef, columnOrIndex) {
  const columns = resolveColumns(viewDef);
  const { column, index } = resolveColumn(columns, columnOrIndex);
  if (column && column.key != null && column.key !== "") {
    return String(column.key);
  }
  if (column && typeof column.title === "string") {
    const trimmed = column.title.trim();
    if (trimmed) return `title:${trimmed}`;
  }
  return fallbackColumnKey(columns, index);
}

export function makeCommentCellKey(viewDef, columnOrIndex, rowId) {
  const viewKey = normalizeViewKey(viewDef && viewDef.key);
  const rowKey = makeCommentRowKey(viewKey, rowId);
  const columnKey = makeCommentColumnKey(viewDef, columnOrIndex);
  return `${rowKey}|${columnKey}`;
}
