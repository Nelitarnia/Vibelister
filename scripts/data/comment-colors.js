// comment-colors.js — defines available color presets for cell comments

const RAW_COMMENT_COLOR_PRESETS = [
  {
    id: "crimson",
    label: "Crimson",
    swatch: "#D7263D",
    badgeBackground: "rgba(215, 38, 61, 0.2)",
    badgeBorder: "rgba(215, 38, 61, 0.55)",
    badgeText: "#FFD6DE",
  },
  {
    id: "persimmon",
    label: "Persimmon",
    swatch: "#F97316",
    badgeBackground: "rgba(249, 115, 22, 0.18)",
    badgeBorder: "rgba(249, 115, 22, 0.5)",
    badgeText: "#FFE0C2",
  },
  {
    id: "amber",
    label: "Amber",
    swatch: "#FACC15",
    badgeBackground: "rgba(250, 204, 21, 0.22)",
    badgeBorder: "rgba(250, 204, 21, 0.55)",
    badgeText: "#6B4E00",
  },
  {
    id: "fern",
    label: "Fern",
    swatch: "#22C55E",
    badgeBackground: "rgba(34, 197, 94, 0.2)",
    badgeBorder: "rgba(34, 197, 94, 0.55)",
    badgeText: "#0F5132",
  },
  {
    id: "teal",
    label: "Teal",
    swatch: "#14B8A6",
    badgeBackground: "rgba(20, 184, 166, 0.22)",
    badgeBorder: "rgba(20, 184, 166, 0.55)",
    badgeText: "#064E44",
  },
  {
    id: "azure",
    label: "Azure",
    swatch: "#3B82F6",
    badgeBackground: "rgba(59, 130, 246, 0.22)",
    badgeBorder: "rgba(59, 130, 246, 0.55)",
    badgeText: "#0B3D8C",
  },
  {
    id: "indigo",
    label: "Indigo",
    swatch: "#6366F1",
    badgeBackground: "rgba(99, 102, 241, 0.22)",
    badgeBorder: "rgba(99, 102, 241, 0.55)",
    badgeText: "#1E2B88",
  },
  {
    id: "plum",
    label: "Plum",
    swatch: "#A855F7",
    badgeBackground: "rgba(168, 85, 247, 0.22)",
    badgeBorder: "rgba(168, 85, 247, 0.55)",
    badgeText: "#2F0A5C",
  },
];

export const COMMENT_COLOR_PRESETS = Object.freeze(
  RAW_COMMENT_COLOR_PRESETS.map((preset) => Object.freeze({ ...preset })),
);

const COMMENT_COLOR_MAP = new Map(
  COMMENT_COLOR_PRESETS.map((preset) => [preset.id, preset]),
);

export const DEFAULT_COMMENT_COLOR_ID = COMMENT_COLOR_PRESETS[0]?.id || "";

export function normalizeCommentColorId(raw) {
  if (raw == null) return "";
  const str = String(raw).trim();
  if (!str) return "";
  return COMMENT_COLOR_MAP.has(str) ? str : "";
}

export function commentColorPresetById(raw) {
  const id = normalizeCommentColorId(raw);
  return id ? COMMENT_COLOR_MAP.get(id) || null : null;
}
