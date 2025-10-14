// utils.js
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function colWidths(columns) {
  return (columns || []).map(c => c.width);
}
export function colOffsets(widths) {
  const w = widths || [];
  const o = [0];
  for (let i = 0; i < w.length; i++) o.push(o[i] + w[i]);
  return o;
}
export function visibleCols(offsets, left, width, totalCols) {
  const right = left + width;
  const n = Number.isFinite(totalCols) ? totalCols : (offsets.length - 1);
  let start = 0, end = n - 1;
  for (let i = 0; i < n; i++) if (offsets[i + 1] >= left) { start = i; break; }
  for (let i = start; i < n; i++) if (offsets[i] > right) { end = i; break; }
  return { start, end: Math.min(end, n - 1) };
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
  const m = /^p(\d+):(outcome|end)$/.exec(String(k || ""));
  return m ? { p: Number(m[1]), field: m[2] } : null;
}
export function parsePhasesSpec(text) {
  const s = String(text || "").trim();
  if (!s) return { ids: [], labels: {} };
  const ids = new Set(), labels = {};
  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  for (const part of parts) {
    const mRange = part.match(/^(\d+)\.\.(\d+)$/);
    if (mRange) {
      let a = +mRange[1], b = +mRange[2];
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p++) ids.add(p);
      continue;
    }
    const mLabel = part.match(/^(\d+)\s*:\s*(.+)$/);
    if (mLabel) { const p = +mLabel[1]; if (Number.isFinite(p)) { ids.add(p); labels[p] = mLabel[2].trim(); } continue; }
    const p = +part; if (Number.isFinite(p)) ids.add(p);
  }
  return { ids: [...ids].sort((a,b)=>a-b), labels };
}
export function formatPhasesSpec(ph) {
  if (!ph || !ph.ids || !ph.ids.length) return "";
  return ph.ids.map(p => (ph.labels && ph.labels[p]) ? `${p}:${ph.labels[p]}` : String(p)).join(",");
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
export function getSuggestedName(projectName = "") {
  const n = String(projectName || "").trim();
  return (n ? n : "project") + ".json";
}
