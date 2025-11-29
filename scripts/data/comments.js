// comments.js — helpers for comment storage and key generation
import { canonicalSig } from "./variants/variants.js";

export const INTERACTION_COMMENT_META_KEY = "__meta";

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

function normalizeInteractionId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function normalizeInteractionPhase(value) {
  const phase = Number(value);
  return Number.isFinite(phase) ? phase : null;
}

function parseInteractionCommentRowKey(rowId) {
  if (!rowId && rowId !== 0) return null;
  const text = String(rowId);
  if (!text) return null;
  const match = /^(.*)\|p(\d+)$/.exec(text);
  const baseKey = match ? match[1] : text;
  const phase = match ? Number(match[2]) : null;
  const parts = baseKey.split("|");
  const head = parts[0]?.toLowerCase() || "";
  if (head === "aa" && parts.length >= 5) {
    const lhs = normalizeInteractionId(parts[1]);
    const rhs = normalizeInteractionId(parts[2]);
    if (lhs == null || rhs == null) return null;
    return {
      kind: "AA",
      actionId: lhs,
      rhsActionId: rhs,
      variantSig: canonicalSig(parts[3] || ""),
      rhsVariantSig: canonicalSig(parts[4] || ""),
      phase,
    };
  }
  if (head === "ai" && parts.length >= 4) {
    const actionId = normalizeInteractionId(parts[1]);
    const inputId = normalizeInteractionId(parts[2]);
    if (actionId == null) return null;
    return {
      kind: "AI",
      actionId,
      inputId,
      variantSig: canonicalSig(parts[3] || ""),
      phase,
    };
  }
  if (Number.isFinite(Number(head)) && parts.length >= 3) {
    const actionId = normalizeInteractionId(parts[0]);
    const inputId = normalizeInteractionId(parts[1]);
    if (actionId == null) return null;
    return {
      kind: "AI",
      actionId,
      inputId,
      variantSig: canonicalSig(parts[2] || ""),
      phase,
    };
  }
  return phase == null ? null : { phase };
}

export function normalizeInteractionCommentMetadata(rowId, rawMeta = null) {
  const meta = {};
  const parsed = parseInteractionCommentRowKey(rowId);
  if (parsed) Object.assign(meta, parsed);
  const fromMeta = rawMeta && typeof rawMeta === "object" ? rawMeta : null;
  if (fromMeta) {
    if (fromMeta.kind) meta.kind = String(fromMeta.kind).toUpperCase();
    const aId = normalizeInteractionId(fromMeta.actionId);
    if (aId != null) meta.actionId = aId;
    const inputId = normalizeInteractionId(fromMeta.inputId);
    if (inputId != null) meta.inputId = inputId;
    const rhsId = normalizeInteractionId(fromMeta.rhsActionId);
    if (rhsId != null) meta.rhsActionId = rhsId;
    if (Object.prototype.hasOwnProperty.call(fromMeta, "variantSig")) {
      meta.variantSig = canonicalSig(fromMeta.variantSig || "");
    }
    if (Object.prototype.hasOwnProperty.call(fromMeta, "rhsVariantSig")) {
      meta.rhsVariantSig = canonicalSig(fromMeta.rhsVariantSig || "");
    }
    const phase = normalizeInteractionPhase(fromMeta.phase);
    if (phase != null) meta.phase = phase;
  }
  if (meta.kind === "AA") {
    if (!Object.prototype.hasOwnProperty.call(meta, "rhsVariantSig")) {
      meta.rhsVariantSig = canonicalSig(meta.rhsVariantSig || "");
    }
  } else if (meta.kind === "AI" && !Object.prototype.hasOwnProperty.call(meta, "inputId")) {
    meta.inputId = normalizeInteractionId(meta.inputId);
  }
  return Object.keys(meta).length ? meta : null;
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
          const normalizedRowId = normalizeRowId(rowKey);
          if (safeViewKey === "interactions") {
            const rowValue = value && typeof value === "object" && !Array.isArray(value)
              ? { ...value }
              : { default: value };
            const meta = normalizeInteractionCommentMetadata(rowKey, rowValue[INTERACTION_COMMENT_META_KEY]);
            if (meta) rowValue[INTERACTION_COMMENT_META_KEY] = meta;
            bucket[normalizedRowId] = rowValue;
          } else {
            bucket[normalizedRowId] = value;
          }
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
