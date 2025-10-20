const SETTINGS_STORAGE_KEY = "vl.userSettings";
const SETTINGS_FILE_NAME = "vibelister-settings.json";
const SETTINGS_FILE_KIND = "vibelister.settings";
const SETTINGS_SCHEMA_VERSION = 1;
const SETTINGS_COLOR_KEYS = [
  "background",
  "toolbar",
  "text",
  "accent",
  "cell",
  "cellAlt",
];
const DEFAULT_UI_SETTINGS = {
  meta: { kind: SETTINGS_FILE_KIND, version: SETTINGS_SCHEMA_VERSION },
  colors: {
    background: "#0F1115",
    toolbar: "#141822",
    text: "#E6E6E6",
    accent: "#273152",
    cell: "#11151F",
    cellAlt: "#121826",
  },
};

function normalizeHexColor(raw, fallback) {
  if (!raw) return fallback;
  let s = String(raw).trim();
  if (!s) return fallback;
  if (s.startsWith("#")) s = s.slice(1);
  s = s.replace(/[^0-9a-fA-F]/g, "");
  if (s.length === 3)
    s = s
      .split("")
      .map((ch) => ch + ch)
      .join("");
  if (s.length !== 6) return fallback;
  return "#" + s.toUpperCase();
}

function sanitizeUiSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const colors = src.colors && typeof src.colors === "object" ? src.colors : {};
  const meta = src.meta && typeof src.meta === "object" ? src.meta : {};
  const defaults = DEFAULT_UI_SETTINGS.colors;
  return {
    meta: {
      kind: SETTINGS_FILE_KIND,
      version: Number.isFinite(meta.version)
        ? meta.version | 0
        : SETTINGS_SCHEMA_VERSION,
    },
    colors: {
      background: normalizeHexColor(colors.background, defaults.background),
      toolbar: normalizeHexColor(colors.toolbar, defaults.toolbar),
      text: normalizeHexColor(colors.text, defaults.text),
      accent: normalizeHexColor(colors.accent, defaults.accent),
      cell: normalizeHexColor(colors.cell, defaults.cell),
      cellAlt: normalizeHexColor(colors.cellAlt, defaults.cellAlt),
    },
  };
}

function isLikelySettingsPayload(raw) {
  if (!raw || typeof raw !== "object") return false;
  if (raw.meta && typeof raw.meta === "object") {
    if (raw.meta.kind === SETTINGS_FILE_KIND) return true;
  }
  const colors =
    raw.colors && typeof raw.colors === "object" ? raw.colors : null;
  if (!colors) return false;
  return SETTINGS_COLOR_KEYS.some((key) => typeof colors[key] === "string");
}

function cloneSettings(settings) {
  return JSON.parse(JSON.stringify(settings || {}));
}

export {
  SETTINGS_STORAGE_KEY,
  SETTINGS_FILE_NAME,
  SETTINGS_FILE_KIND,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_COLOR_KEYS,
  DEFAULT_UI_SETTINGS,
  normalizeHexColor,
  sanitizeUiSettings,
  isLikelySettingsPayload,
  cloneSettings,
};
