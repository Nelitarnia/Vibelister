// column-kinds.js — Registry of reusable column behaviors
// Minimal, dependency-light; safe to iterate as we add kinds.

export const STRUCTURED_SCHEMA_VERSION = 1;

function wrapRefPayload(entity, payload) {
  if (payload == null) return null;
  if (typeof payload === "number")
    return { type: entity, data: { id: payload | 0 } };
  if (payload && typeof payload === "object") {
    if (payload.type && payload.data && typeof payload.data.id === "number")
      return payload;
    if (typeof payload.id === "number")
      return { type: entity, data: { id: payload.id | 0 } };
  }
  return null;
}

function wrapOutcomePayload(payload) {
  if (payload == null) return null;
  if (typeof payload === "number")
    return { type: "outcome", data: { outcomeId: payload | 0 } };
  if (payload && typeof payload === "object") {
    if (
      payload.type === "outcome" &&
      payload.data &&
      typeof payload.data.outcomeId === "number"
    )
      return payload;
    if (typeof payload.outcomeId === "number")
      return { type: "outcome", data: { outcomeId: payload.outcomeId | 0 } };
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
    if (trimmed === "✓" || trimmed === "✔" || trimmed === "☑") return mod.ON;
    if (trimmed === "◐" || trimmed === "◑" || trimmed === "◓" || trimmed === "◎")
      return mod.BYPASS;
    const normalized = trimmed.toLowerCase();
    if (
      normalized === "0" ||
      normalized === "off" ||
      normalized === "false" ||
      normalized.startsWith("off")
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
    beginEdit({ row } = {}) {
      if (!row) return { handled: true }; // don't open editor on non-row views
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
      const st = Number(row?.modSet?.[id] ?? mod.OFF) | 0;
      if (st === mod.ON) return "✓";
      if (st === mod.BYPASS) return "◐";
      return "";
    },
    set({ row, col, MOD } = {}, v) {
      if (!row || !col) return;
      const mod = getModEnum(MOD);
      const id = parseModColumnId(col);
      if (!Number.isFinite(id)) return;
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
      const raw = row?.modSet?.[id];
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
        const before = row.modSet[id];
        delete row.modSet[id];
        return before !== undefined && before !== mod.OFF;
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

  outcomeRef: {
    get({ row, model } = {}) {
      const id = row?.dualof | 0;
      if (!id) return "";
      const o = model.outcomes.find((x) => x.id === id);
      return o ? o.name || "" : "";
    },
    set({ row, model } = {}, v) {
      if (v == null || v === "") {
        row.dualof = null;
        return;
      }
      if (typeof v === "number") {
        row.dualof = v | 0;
        return;
      }
      if (typeof v === "string") {
        const name = v.trim().toLowerCase();
        const found = model.outcomes.find(
          (o) => (o.name || "").toLowerCase() === name,
        );
        row.dualof = found ? found.id | 0 : null;
      }
    },
    beginEdit() {
      return { useEditor: true };
    },
    applyStructured({ row } = {}, payload) {
      const wrapped = wrapOutcomePayload(payload);
      if (
        wrapped &&
        wrapped.type === "outcome" &&
        typeof wrapped.data?.outcomeId === "number"
      ) {
        row.dualof = wrapped.data.outcomeId | 0;
        return true;
      }
      return false;
    },
    clear({ row } = {}) {
      if (!row) return false;
      const hadValue = row.dualof != null;
      if (hadValue) row.dualof = null;
      return hadValue;
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
      let vSig = ""; // will hold variant signature when derived from Interactions
      let suffix = "";
      // Interactions view has no per-row object; derive id (and modifier suffix) from pairs
      if (
        activeView === "interactions" &&
        Array.isArray(model?.interactionsPairs)
      ) {
        const pair = model.interactionsPairs[r];
        if (pair) {
          const k = String(col.key || "").toLowerCase();
          if (k === "action" || k === "actionid" || k === "actionname") {
            id = id ?? pair.aId;
            vSig = String(pair.variantSig || "");
            // Append modifiers for left-hand action
            suffix = formatModsFromSig(model, pair.variantSig);
          } else if (k === "rhsaction" || k === "rhsactionid") {
            id = id ?? pair.rhsActionId;
            vSig = String(pair.rhsVariantSig || "");
            // Append modifiers for right-hand action (AA mode)
            suffix = formatModsFromSig(model, pair.rhsVariantSig);
          } else if (k === "input" || k === "inputid") {
            id = id ?? pair.iId;
          }
        }
      }
      const base = nameOf(col.entity, model, id);
      return suffix ? (base ? `${base} ${suffix}` : suffix) : base;
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
      if (
        activeView === "interactions" &&
        id == null &&
        Array.isArray(model?.interactionsPairs)
      ) {
        const pair = model.interactionsPairs[r];
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
    set({ row, col } = {}, v) {
      if (typeof v === "number") {
        row[col.key] = v | 0;
        return;
      }
      if (v == null || v === "") {
        row[col.key] = null;
        return;
      }
      // Stable-ID fields do not accept free text directly.
    },
    beginEdit({ paletteAPI, row, col } = {}) {
      if (paletteAPI?.openReference) {
        paletteAPI.openReference({ entity: col.entity, target: { row, col } });
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

// Helper: format " (ModA+ModB)" suffix from a '+'-joined variantSig ordered by modifier row order
function formatModsFromSig(model, sig) {
  const s = typeof sig === "string" ? sig : "";
  if (!s) return "";
  const ids = s.split("+").filter(Boolean).map(Number);
  if (!ids.length) return "";
  const order = new Map();
  (model.modifiers || []).forEach((m, i) => order.set(m?.id, i));
  ids.sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  const names = ids
    .map((id) => model.modifiers.find((m) => m?.id === id)?.name || "")
    .filter(Boolean);
  return names.length ? `(${names.join("+")})` : "";
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
