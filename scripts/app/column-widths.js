// column-widths.js — helpers for applying and persisting column width overrides.

const MIN_COLUMN_WIDTH = 56;

function sanitizeWidth(value, fallback) {
  const candidate = Number(value);
  if (Number.isFinite(candidate) && candidate > 0) {
    return Math.max(MIN_COLUMN_WIDTH, Math.round(candidate));
  }
  const fb = Number(fallback);
  if (Number.isFinite(fb) && fb > 0) {
    return Math.max(MIN_COLUMN_WIDTH, Math.round(fb));
  }
  return MIN_COLUMN_WIDTH;
}

function baseOverrides(overrides) {
  return overrides && typeof overrides === "object" ? overrides : null;
}

export function columnWidthKey(viewKey, columnKey) {
  const view = viewKey == null ? "" : String(viewKey);
  const column = columnKey == null ? "" : String(columnKey);
  if (!view || !column) return null;
  return `${view}::${column}`;
}

export function applyColumnWidthOverrides(viewKey, columns, overrides) {
  if (!Array.isArray(columns)) return [];
  const map = baseOverrides(overrides) || {};
  return columns.map((col) => {
    if (!col || typeof col !== "object") return col;
    const defaultWidth = sanitizeWidth(col.defaultWidth, col.width);
    const key = columnWidthKey(viewKey, col.key);
    const override =
      key && Object.prototype.hasOwnProperty.call(map, key)
        ? sanitizeWidth(map[key], defaultWidth)
        : null;
    const nextWidth = override ?? sanitizeWidth(col.width, defaultWidth);
    return {
      ...col,
      defaultWidth,
      width: nextWidth,
    };
  });
}

export function setColumnWidthOverride(
  overrides,
  viewKey,
  columnKey,
  width,
  defaultWidth,
) {
  const base = baseOverrides(overrides);
  const key = columnWidthKey(viewKey, columnKey);
  if (!key) {
    return { overrides: base ?? undefined, changed: false, width: undefined };
  }
  const nextWidth = sanitizeWidth(width, defaultWidth);
  if (base && base[key] === nextWidth) {
    return { overrides: base, changed: false, width: nextWidth };
  }
  const next = { ...(base || {}), [key]: nextWidth };
  return { overrides: next, changed: true, width: nextWidth };
}

export function clearColumnWidthOverride(overrides, viewKey, columnKey) {
  const base = baseOverrides(overrides);
  const key = columnWidthKey(viewKey, columnKey);
  if (!key) {
    return { overrides: base ?? undefined, changed: false };
  }
  if (!base || !Object.prototype.hasOwnProperty.call(base, key)) {
    return { overrides: base ?? undefined, changed: false };
  }
  const next = { ...base };
  delete next[key];
  return { overrides: next, changed: true };
}

export function getColumnWidthOverride(overrides, viewKey, columnKey) {
  const base = baseOverrides(overrides);
  if (!base) return undefined;
  const key = columnWidthKey(viewKey, columnKey);
  if (!key) return undefined;
  const value = base[key];
  return Number.isFinite(value) ? value : undefined;
}

export { MIN_COLUMN_WIDTH };
