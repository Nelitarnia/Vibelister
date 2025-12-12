// utils.js - Various helper functions

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function colWidths(columns) {
  return (columns || []).map((c) => c.width);
}
export function colOffsets(widths) {
  const w = widths || [];
  const o = [0];
  for (let i = 0; i < w.length; i++) o.push(o[i] + w[i]);
  return o;
}
export function visibleCols(offsets, left, width, totalCols) {
  const o = offsets || [];
  const availableCols = Math.max(0, o.length - 1);
  const n = Number.isFinite(totalCols)
    ? Math.min(totalCols, availableCols)
    : availableCols;
  if (n <= 0) return { start: 0, end: -1 };
  if (width <= 0) return { start: 0, end: -1 };

  const right = left + width;
  const lastEdge = o[Math.min(n, o.length - 1)] ?? 0;
  if (left >= lastEdge) return { start: n, end: n - 1 };

  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (o[mid + 1] < left) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;

  lo = start;
  hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (o[mid] <= right) lo = mid + 1;
    else hi = mid;
  }
  const end = Math.min(Math.max(lo - 1, start), n - 1);
  return { start, end };
}
export function visibleRows(top, height, rowHeight, rowCount) {
  const rh = rowHeight || 26;
  const first = Math.floor(top / rh);
  const visible = Math.ceil(height / rh) + 2;
  const last = Math.min(rowCount - 1, first + visible);
  return { start: first, end: last };
}

// Phases helpers
export function parsePhaseKey(k) {
  const m = /^p(\d+):(outcome|end|tag)$/.exec(String(k || ""));
  return m ? { p: Number(m[1]), field: m[2] } : null;
}
export function parsePhasesSpec(text) {
  const s = String(text || "").trim();
  if (!s) return { ids: [], labels: {} };
  const ids = new Set(),
    labels = {};
  const parts = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  for (const part of parts) {
    const mRange = part.match(/^(\d+)\.\.(\d+)$/);
    if (mRange) {
      let a = +mRange[1],
        b = +mRange[2];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p++) ids.add(p);
      continue;
    }
    const mLabel = part.match(/^(\d+)\s*:\s*(.+)$/);
    if (mLabel) {
      const p = +mLabel[1];
      if (Number.isFinite(p)) {
        ids.add(p);
        labels[p] = mLabel[2].trim();
      }
      continue;
    }
    const p = +part;
    if (Number.isFinite(p)) ids.add(p);
  }
  return { ids: [...ids].sort((a, b) => a - b), labels };
}
export function formatPhasesSpec(ph) {
  if (!ph || !ph.ids || !ph.ids.length) return "";
  return ph.ids
    .map((p) =>
      ph.labels && ph.labels[p] ? `${p}:${ph.labels[p]}` : String(p),
    )
    .join(",");
}
export function getPhaseLabel(action, phaseIndex) {
  if (!action || !action.phases || !action.phases.labels) return null;
  const lbl = action.phases.labels[phaseIndex];
  return typeof lbl === "string" ? lbl : null;
}

// Filenames
export function basenameNoExt(name) {
  if (!name) return "";
  const n = String(name).split(/[\\/]/).pop();
  const i = n.lastIndexOf(".");
  return i > 0 ? n.slice(0, i) : n;
}
