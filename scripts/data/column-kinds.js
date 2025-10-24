// column-kinds.js — Registry of reusable column behaviors
// Minimal, dependency-light; safe to iterate as we add kinds.

import { getEntityColorsFromRow } from "./color-utils.js";
import { getInteractionsPair } from "../app/interactions-data.js";

export const STRUCTURED_SCHEMA_VERSION = 1;

function wrapRefPayload(entity, payload) {
  if (payload == null) return null;

  const typeName = String(entity ?? "");
  const normalizedType = typeName.toLowerCase();
  const altIdKey = normalizedType === "outcome" ? "outcomeId" : null;

  const wrap = (id, extras) => {
    const data = { id: id | 0 };
    if (extras && typeof extras === "object") {
      for (const [key, value] of Object.entries(extras)) {
        if (key === "id" || key === altIdKey) continue;
        data[key] = value;
      }
    }
    return { type: typeName, data };
  };

  if (typeof payload === "number") return wrap(payload);

  if (typeof payload === "object") {
    const rawType = payload.type ? String(payload.type).toLowerCase() : null;
    if (rawType && rawType !== normalizedType) return null;

    const data =
      payload.data && typeof payload.data === "object" ? payload.data : null;
    const extras = data ? { ...data } : null;

    const candidates = [];
    if (data && typeof data.id === "number") candidates.push(data.id);
    if (data && altIdKey && typeof data[altIdKey] === "number")
      candidates.push(data[altIdKey]);
    if (typeof payload.id === "number") candidates.push(payload.id);
    if (altIdKey && typeof payload[altIdKey] === "number")
      candidates.push(payload[altIdKey]);
    if (!data && Number.isFinite(payload.data)) candidates.push(payload.data);

    for (const candidate of candidates) {
      if (Number.isFinite(candidate)) {
        return wrap(candidate, extras);
      }
    }

    if (!data) {
      if (typeof payload.id === "number") return wrap(payload.id);
      if (altIdKey && typeof payload[altIdKey] === "number")
        return wrap(payload[altIdKey]);
    }
  }

  return null;
}

// Utility helpers for reference columns (Interactions)
function resolveEntity(entity, model) {
  if (entity === "action") return model.actions || [];
  if (entity === "input") return model.inputs || [];
  if (entity === "outcome") return model.outcomes || [];
  return [];
}
function nameOf(entity, model, id) {
  const arr = resolveEntity(entity, model);
  const it = arr.find((x) => (x.id | 0) === (id | 0));
  return it ? it.name || "" : "";
}

const DEFAULT_MOD_ENUM = Object.freeze({ OFF: 0, ON: 1, BYPASS: 2 });

function getModEnum(MOD) {
  if (!MOD || typeof MOD !== "object") return DEFAULT_MOD_ENUM;
  const off = Number.isFinite(MOD.OFF) ? Number(MOD.OFF) : DEFAULT_MOD_ENUM.OFF;
  const on = Number.isFinite(MOD.ON) ? Number(MOD.ON) : DEFAULT_MOD_ENUM.ON;
  const bypass = Number.isFinite(MOD.BYPASS)
    ? Number(MOD.BYPASS)
    : DEFAULT_MOD_ENUM.BYPASS;
  return { OFF: off, ON: on, BYPASS: bypass };
}

function parseModColumnId(col) {
  const key = String(col?.key || "");
  const idx = key.indexOf(":");
  if (idx < 0) return NaN;
  return Number(key.slice(idx + 1));
}

function normalizeModState(raw, mod, current) {
  if (raw === undefined) {
    if (current === mod.OFF) return mod.ON;
    if (current === mod.ON) return mod.BYPASS;
    return mod.OFF;
  }
  if (typeof raw === "boolean") return raw ? mod.ON : mod.OFF;
  if (typeof raw === "number") {
    const clamped = Math.max(mod.OFF, Math.min(mod.BYPASS, raw | 0));
    if (clamped === mod.OFF || clamped === mod.ON || clamped === mod.BYPASS)
      return clamped;
    return mod.OFF;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return mod.OFF;
    if (
      trimmed === "✕" ||
      trimmed === "✖" ||
      trimmed === "✗" ||
      trimmed === "✘" ||
      trimmed === "×"
    )
      return mod.OFF;
    if (trimmed === "✓" || trimmed === "✔" || trimmed === "☑") return mod.ON;
    if (trimmed === "◐" || trimmed === "◑" || trimmed === "◓" || trimmed === "◎")
      return mod.BYPASS;
    const normalized = trimmed.toLowerCase();
    if (
      normalized === "0" ||
      normalized === "off" ||
      normalized === "false" ||
      normalized.startsWith("off") ||
      normalized === "x"
    )
      return mod.OFF;
    if (
      normalized === "1" ||
      normalized === "on" ||
      normalized === "true" ||
      normalized.startsWith("on")
    )
      return mod.ON;
    if (
      normalized === "2" ||
      normalized === "bypass" ||
      normalized.startsWith("by") ||
      normalized.startsWith("pass") ||
      normalized.startsWith("skip") ||
      normalized.startsWith("allow") ||
      normalized.startsWith("inherit")
    )
      return mod.BYPASS;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return normalizeModState(parsed, mod, current);
  }
  return mod.OFF;
}

export const ColumnKinds = {
  text: {
    get({ row, col } = {}) {
      return row?.[col.key] ?? "";
    },
    set({ row, col } = {}, v) {
      if (!row) return; // tolerate null row (e.g., Interactions)
      row[col.key] = v ?? "";
    },
    beginEdit({ row, activeView } = {}) {
      if (!row && activeView === "interactions") {
        return { handled: true }; // interactions rows are synthesized
      }
      return { useEditor: true };
    },
    clear({ row, col } = {}) {
      if (!row || !col?.key) return false;
      const before = row[col.key];
      const hadValue = !(before == null || before === "");
      if (hadValue) row[col.key] = "";
      return hadValue;
    },
  },

  checkbox: {
    get({ row, col } = {}) {
      return row?.[col.key] ? "✓" : "";
    },
    set({ row, col } = {}, v) {
      if (!row) return; // tolerate null row
      if (v === undefined) row[col.key] = !row[col.key];
      else row[col.key] = !!v;
    },
    beginEdit({ row, col } = {}) {
      if (!row) return { handled: true };
      row[col.key] = !row[col.key];
      return { handled: true };
    },
    clear({ row, col } = {}) {
      if (!row || !col?.key) return false;
      const wasTrue = !!row[col.key];
      if (wasTrue || row[col.key] !== false) row[col.key] = false;
      return wasTrue;
    },
  },

  modState: {
    get({ row, col, MOD } = {}) {
      const mod = getModEnum(MOD);
      const id = parseModColumnId(col);
      if (!Number.isFinite(id)) return "";
      const modSet = row?.modSet;
      const hasExplicit =
        modSet && Object.prototype.hasOwnProperty.call(modSet, id);
      const raw = hasExplicit ? modSet[id] : undefined;
      const st = Number(raw ?? mod.OFF) | 0;
      if (!hasExplicit) return "";
      if (st === mod.ON) return "✓";
      if (st === mod.BYPASS) return "◐";
      if (st === mod.OFF) return "✕";
      return "";
    },
    set({ row, col, MOD } = {}, v) {
      if (!row || !col) return;
      const mod = getModEnum(MOD);
      const id = parseModColumnId(col);
      if (!Number.isFinite(id)) return;
      if (v === null) {
        if (row.modSet && typeof row.modSet === "object") delete row.modSet[id];
        return;
      }
      if (typeof v === "string" && v.trim() === "") {
        if (row.modSet && typeof row.modSet === "object") delete row.modSet[id];
        return;
      }
      if (!row.modSet || typeof row.modSet !== "object") row.modSet = {};
      const cur = Number(row.modSet[id] ?? mod.OFF) | 0;
      const next = normalizeModState(v, mod, cur);
      row.modSet[id] = next;
    },
    beginEdit() {
      return { useEditor: true };
    },
    getStructured({ row, col, MOD } = {}) {
      const mod = getModEnum(MOD);
      const id = parseModColumnId(col);
      if (!Number.isFinite(id)) return null;
      const modSet = row?.modSet;
      if (!modSet || !Object.prototype.hasOwnProperty.call(modSet, id))
        return null;
      const raw = modSet[id];
      const value =
        typeof raw === "number"
          ? normalizeModState(raw, mod, mod.OFF)
          : mod.OFF;
      return { type: "modifierState", data: { value } };
    },
    applyStructured({ row, col, MOD } = {}, payload) {
      if (!row || !col || !payload || typeof payload !== "object") return false;
      if (payload.type !== "modifierState") return false;
      const mod = getModEnum(MOD);
      const id = parseModColumnId(col);
      if (!Number.isFinite(id)) return false;
      if (!row.modSet || typeof row.modSet !== "object") row.modSet = {};
      const hasValue =
        payload.data && Object.prototype.hasOwnProperty.call(payload.data, "value");
      if (!hasValue) return false;
      const current = Number(row.modSet[id] ?? mod.OFF) | 0;
      const next = normalizeModState(payload.data.value, mod, current);
      row.modSet[id] = next;
      return true;
    },
    clear({ row, col, MOD } = {}) {
      if (!row || !col) return false;
      const mod = getModEnum(MOD);
      const id = parseModColumnId(col);
      if (!Number.isFinite(id)) return false;
      if (!row.modSet || typeof row.modSet !== "object") return false;
      if (Object.prototype.hasOwnProperty.call(row.modSet, id)) {
        delete row.modSet[id];
        return true;
      }
      return false;
    },
  },

  phases: {
    get({ row, formatPhasesSpec } = {}) {
      return formatPhasesSpec(row?.phases);
    },
    set({ row, parsePhasesSpec } = {}, v) {
      row.phases = parsePhasesSpec(v);
    },
    beginEdit() {
      return { useEditor: true };
    },
    clear({ row, parsePhasesSpec } = {}) {
      if (!row) return false;
      const current = row.phases;
      const hadIds = Array.isArray(current?.ids) && current.ids.length > 0;
      const hadLabels =
        current?.labels && Object.keys(current.labels).length > 0;
      row.phases =
        typeof parsePhasesSpec === "function"
          ? parsePhasesSpec("")
          : { ids: [], labels: {} };
      return hadIds || hadLabels;
    },
  },

  mirrored: {
    get({ row } = {}) {
      return row?.mirrored ? "✓" : "";
    },
    set({ row } = {}, v) {
      if (!row) return;
      row.mirrored = v === undefined ? !row.mirrored : !!v;
    },
    beginEdit({ row } = {}) {
      if (!row) return { handled: true };
      row.mirrored = !row.mirrored;
      return { handled: true };
    },
  },

  color: {
    get({ row, col }) {
      return row?.[col.key] ?? "";
    },
    set({ row, col } = {}, v) {
      if (!row || !col || !col.key) return;
      if (v == null) {
        row[col.key] = "";
        return;
      }
      const raw = typeof v === "string" ? v.trim() : "";
      if (!raw) {
        row[col.key] = "";
        return;
      }
      if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) row[col.key] = raw;
    },
    beginEdit({ paletteAPI } = {}) {
      if (paletteAPI?.openColor) {
        paletteAPI.openColor();
        return { handled: true };
      }
      return { useEditor: true };
    },
    clear({ row, col } = {}) {
      if (!row || !col?.key) return false;
      const before = row[col.key];
      const hadColor = typeof before === "string" && before.trim() !== "";
      if (hadColor || before !== "") row[col.key] = "";
      return hadColor;
    },
  },

  // ===== Interactions-friendly generic reference kinds =====
  // Read-only reference: displays the name from a stable id stored in row[col.key]
  refRO: {
    get(ctx) {
      const { row, col, model, r, activeView } = ctx;
      // Prefer per-row storage when available
      let id = row?.[col.key];
      let variantSig = ""; // will hold variant signature when derived from Interactions
      let useInteractionsVariant = false;
      // Interactions view has no per-row object; derive id (and modifier suffix) from pairs
      if (activeView === "interactions") {
        const pair = getInteractionsPair(model, r);
        if (pair) {
          const k = String(col.key || "").toLowerCase();
          if (k === "action" || k === "actionid" || k === "actionname") {
            id = id ?? pair.aId;
            variantSig = String(pair.variantSig || "");
            useInteractionsVariant = true;
          } else if (k === "rhsaction" || k === "rhsactionid") {
            id = id ?? pair.rhsActionId;
            variantSig = String(pair.rhsVariantSig || "");
            useInteractionsVariant = true;
          } else if (k === "input" || k === "inputid") {
            id = id ?? pair.iId;
          }
        }
      }
      const entityRows = resolveEntity(col.entity, model);
      let entityRow = null;
      if (entityRows && entityRows.length && id != null) {
        const numId = Number(id);
        if (Number.isFinite(numId)) {
          entityRow =
            entityRows.find((candidate) => (candidate?.id | 0) === (numId | 0)) ||
            null;
        }
      }
      const base = entityRow?.name || nameOf(col.entity, model, id);
      const suffix =
        useInteractionsVariant && variantSig
          ? formatModsFromSig(model, variantSig)
          : "";
      const fallback = suffix ? (base ? `${base} ${suffix}` : suffix) : base;
      if (
        useInteractionsVariant &&
        String(col.entity || "").toLowerCase() === "action"
      ) {
        const label = formatEndActionLabel(
          model,
          entityRow || (base ? { name: base } : null),
          variantSig,
          { style: "parentheses" },
        );
        if (label) {
          const plainText = label.plainText || fallback || "";
          const segments =
            Array.isArray(label.segments) && label.segments.length
              ? label.segments
              : null;
          if (segments) return { plainText, segments };
          return plainText;
        }
      }
      return fallback;
    },
    // read-only: ignore writes
    set() {
      /* no-op */
    },
    // prevent editor from opening on double-click
    beginEdit() {
      return { handled: true };
    },
    // structured copy: emit id+name if available
    getStructured(ctx) {
      const { row, col, model, r, activeView } = ctx;
      let id = row?.[col.key];
      let variantSig = "";
      if (activeView === "interactions" && id == null) {
        const pair = getInteractionsPair(model, r);
        if (pair) {
          const k = String(col.key || "").toLowerCase();
          if (k === "action" || k === "actionid" || k === "actionname") {
            id = pair.aId;
            variantSig = String(pair.variantSig || "");
          } else if (k === "rhsaction" || k === "rhsactionid") {
            id = pair.rhsActionId;
            variantSig = String(pair.rhsVariantSig || "");
          } else if (k === "input" || k === "inputid") {
            id = pair.iId;
          }
        }
      }
      if (id == null) return null;
      // Only include variantSig when present and meaningful
      const data = variantSig ? { id, variantSig } : { id };
      return { type: col.entity, data };
    },
  },
  // Editable reference: opens a palette to pick an entity and stores its stable id
  refPick: {
    get({ row, col, model } = {}) {
      return nameOf(col.entity, model, row?.[col.key]);
    },
    set({ row, col, model } = {}, v) {
      if (!row || !col?.key) return;
      if (typeof v === "number") {
        row[col.key] = v | 0;
        return;
      }
      if (v == null || v === "") {
        row[col.key] = null;
        return;
      }
      if (typeof v === "string") {
        const trimmed = v.trim();
        if (!trimmed) {
          row[col.key] = null;
          return;
        }
        if (!model) {
          row[col.key] = null;
          return;
        }
        const pool = resolveEntity(col?.entity, model) || [];
        const target = trimmed.toLowerCase();
        const found = pool.find(
          (it) => String(it?.name || "").trim().toLowerCase() === target,
        );
        row[col.key] = found ? found.id | 0 : null;
      }
      // Stable-ID fields do not accept arbitrary free text beyond entity lookups.
    },
    beginEdit({ paletteAPI, row, col, r, c, model } = {}) {
      if (paletteAPI?.wantsToHandleCell?.()) {
        return { useEditor: true };
      }
      const colKey = col?.key;
      let initialText = "";
      if (colKey && row && typeof row[colKey] === "number") {
        initialText = nameOf(col?.entity, model, row[colKey]) || "";
      }
      const target = { row, col, r, c, initialText };
      if (paletteAPI?.openReference) {
        const opened = paletteAPI.openReference({
          entity: col?.entity,
          target,
        });
        if (opened) return { handled: true };
      }
      if (
        paletteAPI?.openForCurrentCell &&
        paletteAPI.openForCurrentCell({
          r,
          c,
          initialText,
          focusEditor: true,
        })
      ) {
        return { handled: true };
      }
      return { useEditor: true };
    },
    applyStructured({ row, col } = {}, payload) {
      const wrapped = wrapRefPayload(col.entity, payload);
      if (
        wrapped &&
        wrapped.type === col.entity &&
        typeof wrapped.data?.id === "number"
      ) {
        row[col.key] = wrapped.data.id | 0;
        return true;
      }
      return false;
    },
    clear({ row, col } = {}) {
      if (!row || !col?.key) return false;
      const hadValue = row[col.key] != null;
      if (hadValue) row[col.key] = null;
      return hadValue;
    },
  },

  // Interactions meta-kind: delegates to interactions.js helpers
  interactions: {
    get({ r, c, model, viewDef, getInteractionsCell } = {}) {
      if (!viewDef || !getInteractionsCell) return "";
      return getInteractionsCell(model, viewDef(), r, c);
    },
    set({ r, c, v, model, viewDef, setInteractionsCell, status } = {}) {
      if (!viewDef || !setInteractionsCell) return;
      setInteractionsCell(model, status, viewDef(), r, c, v);
    },
    beginEdit() {
      return { useEditor: true };
    },
    getStructured({
      r,
      c,
      model,
      viewDef,
      getStructuredCellInteractions,
    } = {}) {
      if (!viewDef || !getStructuredCellInteractions) return null;
      return getStructuredCellInteractions(model, viewDef(), r, c);
    },
    applyStructured(ctx = {}, payload) {
      const { r, c, viewDef, applyStructuredCellInteractions, model } =
        ctx || {};
      if (!viewDef || !applyStructuredCellInteractions) return false;
      return applyStructuredCellInteractions(
        null,
        viewDef(),
        r,
        c,
        payload,
        model,
      );
    },
  },
};

// Legacy alias: outcomeRef now routes through the generic refPick implementation.
ColumnKinds.outcomeRef = ColumnKinds.refPick;

function getModifiersFromSig(model, sig) {
  const s = typeof sig === "string" ? sig : "";
  if (!s) return [];
  const ids = s
    .split("+")
    .filter(Boolean)
    .map((part) => Number(part))
    .filter(Number.isFinite);
  if (!ids.length) return [];

  const modifiers = Array.isArray(model?.modifiers) ? model.modifiers : [];
  const order = new Map();
  const rowById = new Map();
  modifiers.forEach((mod, idx) => {
    const rawId = mod?.id;
    const id = Number(rawId);
    if (!Number.isFinite(id)) return;
    order.set(id, idx);
    rowById.set(id, mod);
  });

  ids.sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  const out = [];
  for (const id of ids) {
    const row = rowById.get(id);
    const label = typeof row?.name === "string" ? row.name : "";
    if (label) out.push({ id, name: label, row });
  }
  return out;
}

// Helper: format " (ModA+ModB)" suffix from a '+'-joined variantSig ordered by modifier row order
function formatModsFromSig(model, sig) {
  const modifiers = getModifiersFromSig(model, sig);
  const names = modifiers.map((mod) => mod.name).filter(Boolean);
  return names.length ? `(${names.join("+")})` : "";
}

export function formatEndActionLabel(model, action, variantSig, opts = {}) {
  const base = action?.name || "";
  const modifiers = getModifiersFromSig(model, variantSig);
  const names = modifiers.map((mod) => mod.name).filter(Boolean);

  const segments = [];
  const textParts = [];
  const pushSegment = (text, color = null) => {
    if (!text) return;
    segments.push({ text, foreground: color });
    textParts.push(text);
  };

  if (base) pushSegment(base, null);

  if (!names.length) {
    return { plainText: textParts.join("") || base, segments };
  }

  const style = opts?.style === "parentheses" ? "parentheses" : "dash";
  if (style === "parentheses") {
    pushSegment(base ? " (" : " (", null);
    modifiers.forEach((mod, idx) => {
      const color = getEntityColorsFromRow(mod.row)?.foreground || null;
      pushSegment(mod.name, color);
      if (idx < modifiers.length - 1) pushSegment("+", null);
    });
    pushSegment(")", null);
  } else {
    pushSegment(base ? " — " : " — ", null);
    modifiers.forEach((mod, idx) => {
      const color = getEntityColorsFromRow(mod.row)?.foreground || null;
      pushSegment(mod.name, color);
      if (idx < modifiers.length - 1) pushSegment("+", null);
    });
  }

  const plainText = textParts.join("");
  return { plainText, segments };
}

export function getCellForKind(kind, ctx) {
  const h = ColumnKinds[kind] || ColumnKinds.text;
  return h.get(ctx);
}
export function setCellForKind(kind, ctx, v) {
  const h = ColumnKinds[kind] || ColumnKinds.text;
  return h.set(ctx, v);
}
export function beginEditForKind(kind, ctx) {
  const h = ColumnKinds[kind] || ColumnKinds.text;
  return h.beginEdit(ctx) || {};
}
export function applyStructuredForKind(kind, ctx, payload) {
  const h = ColumnKinds[kind];
  return h?.applyStructured ? h.applyStructured(ctx, payload) : false;
}
export function getStructuredForKind(kind, ctx) {
  const h = ColumnKinds[kind];
  return h?.getStructured ? h.getStructured(ctx) : null;
}
export function clearCellForKind(kind, ctx) {
  const h = ColumnKinds[kind] || ColumnKinds.text;
  if (typeof h.clear === "function") return !!h.clear(ctx);
  return false;
}
