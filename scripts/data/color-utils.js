// Shared color helpers for grid rendering and palette previews.

const DEFAULT_CELL_TEXT_COLOR = "#e6e6e6";

function normalizeColorValue(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed;
}

function parseHexColor(value) {
  const s = normalizeColorValue(value);
  if (!s || s[0] !== "#") return null;
  const hex = s.slice(1);
  if (hex.length !== 3 && hex.length !== 6) return null;
  const expand =
    hex.length === 3
      ? hex
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : hex;
  const r = parseInt(expand.slice(0, 2), 16);
  const g = parseInt(expand.slice(2, 4), 16);
  const b = parseInt(expand.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b];
}

function channelToLinear(c) {
  const s = c / 255;
  if (s <= 0.03928) return s / 12.92;
  return Math.pow((s + 0.055) / 1.055, 2.4);
}

function autoTextColor(background, fallback = DEFAULT_CELL_TEXT_COLOR) {
  const rgb = parseHexColor(background);
  if (!rgb) return fallback;
  const [r, g, b] = rgb;
  const L =
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b);
  return L > 0.5 ? "#000000" : "#ffffff";
}

function getEntityColorsFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const bg = normalizeColorValue(row.color || row.color1 || "");
  const rawFg = normalizeColorValue(row.color2 || row.fontColor || "");
  const info = {};
  if (bg) info.background = bg;
  if (rawFg) info.foreground = rawFg;
  if (bg && !rawFg)
    info.foreground = autoTextColor(bg, DEFAULT_CELL_TEXT_COLOR);
  return Object.keys(info).length ? info : null;
}

function computeColorPreviewForColorColumn(row, key) {
  if (!row || typeof row !== "object") return null;
  const value = normalizeColorValue(row[key]);
  if (!value) return null;
  const info = { title: value };
  if (String(key) === "color2") {
    info.foreground = value;
    const baseBg = normalizeColorValue(row.color);
    if (baseBg) info.background = baseBg;
  } else {
    info.background = value;
    const textColor = normalizeColorValue(row.color2);
    info.foreground =
      textColor || autoTextColor(value, DEFAULT_CELL_TEXT_COLOR);
    info.textOverride = "";
  }
  return info;
}

export {
  DEFAULT_CELL_TEXT_COLOR,
  normalizeColorValue,
  parseHexColor,
  autoTextColor,
  getEntityColorsFromRow,
  computeColorPreviewForColorColumn,
};
