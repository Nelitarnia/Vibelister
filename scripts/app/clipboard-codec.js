// Single source of truth for structured clipboard payloads.
// Keeps schema minimal, verifies canonical shape, and provides read/write helpers.

// --- MIME ---------------------------------------------------------------
export const MIME_CELL = "application/x-gridcell+json";

// --- Shape guards -------------------------------------------------------
export function isCanonicalStructuredPayload(p) {
  return !!(
    p &&
    typeof p === "object" &&
    typeof p.type === "string" &&
    p.data &&
    typeof p.data === "object" &&
    !Array.isArray(p.data)
  );
}

// Optional sanitizer: strip unknown fields and normalize id keys for stability
export function sanitizeStructuredPayload(payload) {
  if (!isCanonicalStructuredPayload(payload)) return null;
  const type = String(payload.type);
  const d = payload.data || {};
  const out = { type, data: {} };

  // Allow only these data keys by type (kept intentionally small)
  const ALLOW = {
    action: ["id", "variantSig"],
    input: ["id"],
    outcome: ["outcomeId"],
    end: ["endActionId", "endVariantSig"],
  };

  const allowed = ALLOW[type] || [];
  for (const k of allowed) if (k in d) out.data[k] = d[k];

  // Friendly normalizations
  if (type === "outcome") {
    if (typeof out.data.outcomeId !== "number" && typeof d.id === "number") {
      out.data.outcomeId = d.id;
    }
  }
  if (type === "end") {
    if (typeof out.data.endActionId !== "number" && typeof d.id === "number") {
      out.data.endActionId = d.id;
    }
  }

  // Minimal validity checks after normalization
  if (type === "action" && typeof out.data.id !== "number") return null;
  if (type === "input" && typeof out.data.id !== "number") return null;
  if (type === "outcome" && typeof out.data.outcomeId !== "number") return null;
  if (type === "end" && typeof out.data.endActionId !== "number") return null;

  return out;
}

// Canonical, key-order-stable stringify for equality checks and logs
export function stableStringify(x) {
  const seen = new WeakSet();
  const s = (v) => {
    if (v && typeof v === "object") {
      if (seen.has(v)) return '"[Circular]"';
      seen.add(v);
      if (Array.isArray(v)) return "[" + v.map(s).join(",") + "]";
      const keys = Object.keys(v).sort();
      return (
        "{" + keys.map((k) => JSON.stringify(k) + ":" + s(v[k])).join(",") + "}"
      );
    }
    return JSON.stringify(v);
  };
  return s(x);
}

export function equalStructuredPayload(a, b) {
  if (!isCanonicalStructuredPayload(a) || !isCanonicalStructuredPayload(b))
    return false;
  return stableStringify(a) === stableStringify(b);
}

// --- Clipboard helpers --------------------------------------------------
// Read the structured payload from a ClipboardEvent. Returns null if absent/invalid.
export function readStructuredFromEvent(evt) {
  try {
    const s = evt.clipboardData && evt.clipboardData.getData(MIME_CELL);
    if (!s) return null;
    const p = JSON.parse(s);
    return isCanonicalStructuredPayload(p) ? p : null;
  } catch (_) {
    return null;
  }
}

// Write the structured payload to a ClipboardEvent. Returns boolean success.
export function writeStructuredToEvent(evt, payload) {
  const clean = sanitizeStructuredPayload(payload);
  if (!clean) return false;
  try {
    const s = JSON.stringify(clean);
    evt.clipboardData.setData(MIME_CELL, s);
    return true;
  } catch (_) {
    return false;
  }
}

// Convenience: verify and return a canonical payload (or null)
export function canonicalizePayload(p) {
  return sanitizeStructuredPayload(p);
}

// --- App integration helpers -------------------------------------------
// These factories let App.js outsource its structured cell helpers while
// keeping dependencies injected (no globals; easy to test).

export function makeGetStructuredCell({
  viewDef,
  dataArray,
  getStructuredForKind,
  kindCtx,
  getActiveView,
  isCanonical = isCanonicalStructuredPayload,
}) {
  return function getStructuredCell(r, c) {
    const vd = viewDef();
    if (!vd) return null;
    const col = vd.columns[c];
    if (!col) return null;
    const activeView = getActiveView ? getActiveView() : undefined;

    if (activeView === "interactions") {
      const k = String(col?.kind || "");
      const payload = getStructuredForKind(
        k || "interactions",
        kindCtx({ r, c, col, row: null }),
      );
      return isCanonical(payload) ? payload : null;
    }
    if (col && col.kind) {
      const arr = dataArray();
      const row = arr ? arr[r] : null;
      const payload = getStructuredForKind(
        col.kind,
        kindCtx({ r, c, col, row }),
      );
      return isCanonical(payload) ? payload : null;
    }
    return null;
  };
}

export function makeApplyStructuredCell({
  viewDef,
  dataArray,
  applyStructuredForKind,
  kindCtx,
  getActiveView,
}) {
  return function applyStructuredCell(r, c, payload) {
    if (!payload || typeof payload !== "object") return false;
    const vd = viewDef();
    if (!vd) return false;
    const col = vd.columns[c];
    if (!col) return false;

    const activeView = getActiveView ? getActiveView() : undefined;
    if (activeView === "interactions") {
      const k = String(col?.kind || "");
      const ctx = kindCtx({ r, c, col, row: null });
      return !!applyStructuredForKind(k || "interactions", ctx, payload);
    }
    if (col && col.kind) {
      const arr = dataArray();
      const row = arr ? arr[r] : null;
      const ctx = kindCtx({ r, c, col, row });
      return !!applyStructuredForKind(col.kind, ctx, payload);
    }
    return false;
  };
}
