const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function computeDestinationIndices(options = {}) {
  const {
    sourceCount,
    selectionSet,
    anchor,
    limit,
    allFlag = false,
    fullRange = null,
  } = options;
  if (!Number.isFinite(sourceCount) || sourceCount <= 0) return [];
  const last = Math.max(0, (limit || 0) - 1);
  if (allFlag && Array.isArray(fullRange) && fullRange.length) {
    const out = [];
    for (let i = 0; i < sourceCount && i < fullRange.length; i++) {
      const idx = fullRange[i];
      if (Number.isFinite(idx) && idx <= last) out.push(idx);
    }
    return out;
  }
  const sorted =
    selectionSet && selectionSet.size
      ? Array.from(selectionSet).sort((a, b) => a - b)
      : null;
  let pruned = null;
  if (sorted && sorted.length) {
    pruned = [];
    for (const idx of sorted) {
      if (Number.isFinite(idx) && idx <= last) pruned.push(idx);
    }
    if (pruned.length >= sourceCount) return pruned;
  }
  let start = null;
  if (pruned && pruned.length) start = pruned[0];
  else if (sorted && sorted.length) start = sorted[0];
  else if (Number.isFinite(anchor)) start = anchor;
  else start = 0;
  const base = Number.isFinite(start) ? start : 0;
  const out = [];
  for (let i = 0; i < sourceCount; i++) {
    const idx = base + i;
    if (idx > last) break;
    if (idx >= 0) out.push(idx);
  }
  return out;
}

export function formatTypeName(value) {
  if (value == null) return "";
  const spaced = String(value)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[:/_-]+/g, " ")
    .trim();
  if (!spaced) return "";
  return spaced
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function describeCellForStatus(cell) {
  if (!cell || typeof cell !== "object") return "";
  if (cell.structured && typeof cell.structured.type === "string")
    return formatTypeName(cell.structured.type);
  if (cell.colKind) return formatTypeName(cell.colKind);
  if (cell.colKey) return formatTypeName(cell.colKey);
  return "";
}

export function buildCopyStatus(rows, cols, cells, verb = "Copied") {
  const rowCount = rows.length;
  const colCount = cols.length;
  const total = rowCount * colCount;
  if (!total) return "";
  if (total === 1) {
    const label = describeCellForStatus(cells[0]?.[0]);
    return label ? `${verb} ${label} cell.` : `${verb} cell.`;
  }
  const typeSet = new Set();
  for (const row of cells) {
    for (const cell of row) {
      const label = describeCellForStatus(cell);
      if (label) typeSet.add(label);
    }
  }
  let suffix = "";
  if (typeSet.size) {
    const list = Array.from(typeSet);
    const shown = list.slice(0, 3);
    suffix = ` (types: ${shown.join(", ")}${list.length > 3 ? ", …" : ""})`;
  }
  return `${verb} ${rowCount}×${colCount} cells${suffix}.`;
}

export function isValidColorValue(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed === "") return true;
  return HEX_COLOR_RE.test(trimmed);
}
