import { autoTextColor, parseHexColor } from "../data/color-utils.js";
import { normalizeCommentColorId, normalizeCommentColorPalette } from "../data/comment-colors.js";

export function getEntryText(entry) {
  if (!entry) return "";
  const value = entry.value;
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.note === "string") return value.note;
    if (typeof value.message === "string") return value.message;
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }
  if (value == null) return "";
  return String(value);
}

export function getEntryColor(entry) {
  if (!entry || !entry.value || typeof entry.value !== "object") return "";
  const { color } = entry.value;
  if (typeof color !== "string") return "";
  const trimmed = color.trim();
  return trimmed || "";
}

export function getEntryColorId(entry) {
  const raw = getEntryColor(entry);
  const normalized = normalizeCommentColorId(raw);
  if (normalized) return normalized;
  return raw ? raw.trim() : "";
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(Number(n))))
    .toString(16)
    .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`.toUpperCase();
}

export function normalizeHexColor(value, fallback = "#3B82F6") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = parseHexColor(trimmed.startsWith("#") ? trimmed : `#${trimmed}`);
    if (parsed && parsed.length === 3) return rgbToHex(parsed[0], parsed[1], parsed[2]);
    const rgbaMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbaMatch) return rgbToHex(rgbaMatch[1], rgbaMatch[2], rgbaMatch[3]);
  }
  return fallback;
}

export function deriveBadgeColorsFromHex(hex) {
  const parsed = parseHexColor(hex);
  if (!parsed) return { swatch: hex, badgeBackground: "", badgeBorder: "", badgeText: "" };
  const [r, g, b] = parsed;
  const rgba = (alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;
  return {
    swatch: hex,
    badgeBackground: rgba(0.2),
    badgeBorder: rgba(0.55),
    badgeText: autoTextColor(hex, "#ffffff"),
  };
}

export function buildPayload(existingEntry, text, color) {
  const base =
    existingEntry && existingEntry.value && typeof existingEntry.value === "object"
      ? { ...existingEntry.value }
      : {};
  base.text = text;
  if (color) base.color = color;
  else if (Object.prototype.hasOwnProperty.call(base, "color")) delete base.color;
  return base;
}

export function buildColorMap(palette) {
  const map = new Map();
  const source = normalizeCommentColorPalette(palette);
  for (const preset of source) {
    if (!preset || typeof preset !== "object") continue;
    const idCandidate =
      typeof preset.id === "string" && preset.id.trim() ? preset.id.trim() : "";
    const normalizedId = normalizeCommentColorId(idCandidate);
    const id = normalizedId || idCandidate;
    if (!id || map.has(id)) continue;
    const label =
      typeof preset.label === "string" && preset.label.trim() ? preset.label.trim() : id;
    const swatch = normalizeHexColor(
      typeof preset.swatch === "string" && preset.swatch.trim()
        ? preset.swatch.trim()
        : typeof preset.badgeBackground === "string"
          ? preset.badgeBackground
          : "",
      "#3B82F6",
    );
    const derived = deriveBadgeColorsFromHex(swatch);
    const badgeBackground =
      typeof preset.badgeBackground === "string" && preset.badgeBackground.trim()
        ? preset.badgeBackground.trim()
        : derived.badgeBackground;
    const badgeBorder =
      typeof preset.badgeBorder === "string" && preset.badgeBorder.trim()
        ? preset.badgeBorder.trim()
        : derived.badgeBorder;
    const badgeText =
      typeof preset.badgeText === "string" && preset.badgeText.trim()
        ? preset.badgeText.trim()
        : derived.badgeText;
    map.set(id, {
      id,
      label,
      swatch,
      badgeBackground,
      badgeBorder,
      badgeText,
    });
  }
  return map;
}
