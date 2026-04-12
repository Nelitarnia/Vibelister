import {
  normalizeCommentColorId,
  normalizeCommentColorPalette,
} from "../data/comment-colors.js";

export function buildCommentPaletteMap(paletteSource) {
  const palette = normalizeCommentColorPalette(paletteSource);
  const map = new Map();
  for (const entry of palette) {
    if (!entry || typeof entry !== "object") continue;
    const rawId = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!rawId) continue;
    const normalizedId = normalizeCommentColorId(rawId);
    const id = normalizedId || rawId;
    if (map.has(id)) continue;
    map.set(id, {
      id,
      badgeBackground:
        typeof entry.badgeBackground === "string" ? entry.badgeBackground.trim() : "",
      badgeBorder: typeof entry.badgeBorder === "string" ? entry.badgeBorder.trim() : "",
      badgeText: typeof entry.badgeText === "string" ? entry.badgeText.trim() : "",
    });
  }
  return map;
}

export function resolveCommentBadgePreset(colorId, palette) {
  if (!colorId || !palette) return null;
  const normalized = normalizeCommentColorId(colorId);
  if (normalized && palette.has(normalized)) return palette.get(normalized);
  const trimmed = typeof colorId === "string" ? colorId.trim() : String(colorId);
  if (trimmed && palette.has(trimmed)) return palette.get(trimmed);
  return null;
}

export function normalizeCellValue(value) {
  if (value == null) return { plainText: "", segments: null };
  if (typeof value === "string") return { plainText: value, segments: null };
  if (typeof value === "number" || typeof value === "boolean") {
    return { plainText: String(value), segments: null };
  }
  if (typeof value === "object") {
    const rawSegments = Array.isArray(value.segments) ? value.segments : null;
    const segments = rawSegments
      ? rawSegments
          .map((seg) => {
            const text = seg && seg.text != null ? String(seg.text) : "";
            const foreground =
              seg && typeof seg.foreground === "string" && seg.foreground
                ? seg.foreground
                : null;
            return text
              ? {
                  text,
                  foreground,
                }
              : null;
          })
          .filter(Boolean)
      : null;
    let plainText = "";
    if (typeof value.plainText === "string") plainText = value.plainText;
    else if (segments && segments.length) plainText = segments.map((seg) => seg.text).join("");
    else if (typeof value.text === "string") plainText = value.text;
    else if (typeof value.value === "string") plainText = value.value;
    return {
      plainText,
      segments: segments && segments.length ? segments : null,
    };
  }
  return { plainText: String(value), segments: null };
}
