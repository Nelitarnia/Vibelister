import {
  SETTINGS_STORAGE_KEY,
  SETTINGS_FILE_NAME,
  DEFAULT_UI_SETTINGS,
  sanitizeUiSettings,
  isLikelySettingsPayload,
  cloneSettings,
} from "./user-settings.js";

function applySanitizedSettings(settings, model) {
  const root = document.documentElement;
  if (!root) return;
  const colors = (settings && settings.colors) || {};
  root.style.setProperty("--vl-color-background", colors.background);
  root.style.setProperty("--vl-color-toolbar", colors.toolbar);
  root.style.setProperty("--vl-color-text", colors.text);
  root.style.setProperty("--vl-color-accent", colors.accent);
  root.style.setProperty("--vl-color-cell", colors.cell);
  root.style.setProperty("--vl-color-cell-alt", colors.cellAlt);
  if (model && settings?.variantCaps) {
    const targetMeta =
      model.meta && typeof model.meta === "object" ? model.meta : (model.meta = {});
    targetMeta.variantCaps = {
      variantCapPerAction: settings.variantCaps.variantCapPerAction,
      variantCapPerGroup: settings.variantCaps.variantCapPerGroup,
    };
  }
}

function persistUserSettings(settings) {
  try {
    window.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (_) {}
}

function loadStoredSettings() {
  try {
    const raw = window.localStorage?.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return sanitizeUiSettings(parsed);
    }
  } catch (_) {}
  return sanitizeUiSettings(DEFAULT_UI_SETTINGS);
}

export function createSettingsController({ statusBar, model } = {}) {
  let userSettings = loadStoredSettings();
  applySanitizedSettings(userSettings, model);

  function setUserSettings(next) {
    const sanitized = sanitizeUiSettings(next);
    applySanitizedSettings(sanitized, model);
    persistUserSettings(sanitized);
    userSettings = sanitized;
    return sanitized;
  }

  async function saveSettingsToDisk(settings, { as = false } = {}) {
    const data = sanitizeUiSettings(settings || userSettings);
    try {
      const m = await import("../data/fs.js");
      const { name } = await m.saveJson(data, {
        as,
        suggestedName: SETTINGS_FILE_NAME,
        handleKey: "settings",
      });
      statusBar?.set(as ? `Settings saved as: ${name}` : `Settings saved: ${name}`);
      return { name, data };
    } catch (e) {
      if (e?.name === "AbortError") {
        statusBar?.set("Settings save cancelled.");
      } else {
        statusBar?.set("Save settings failed: " + (e?.message || e));
      }
      return null;
    }
  }

  async function loadSettingsFromDisk() {
    try {
      const m = await import("../data/fs.js");
      const { data, name } = await m.openJson({ handleKey: "settings" });
      if (!isLikelySettingsPayload(data)) {
        m.forgetHandle?.("settings");
        statusBar?.set("Not a valid settings file.");
        return null;
      }
      userSettings = setUserSettings(data);
      statusBar?.set(`Settings loaded: ${name}`);
      return userSettings;
    } catch (e) {
      if (e?.name === "AbortError") {
        statusBar?.set("Settings load cancelled.");
      } else {
        statusBar?.set("Load settings failed: " + (e?.message || e));
      }
      return null;
    }
  }

  async function openSettingsDialog() {
    try {
      const mod = await import("../ui/settings.js");
      await mod.openSettingsDialog({
        settings: cloneSettings(userSettings),
        defaults: sanitizeUiSettings(DEFAULT_UI_SETTINGS),
        onApply(settings) {
          userSettings = setUserSettings(settings);
          return cloneSettings(userSettings);
        },
        onReset() {
          userSettings = setUserSettings(DEFAULT_UI_SETTINGS);
          return cloneSettings(userSettings);
        },
        onSave(settings, opts = {}) {
          return saveSettingsToDisk(settings, opts);
        },
        onLoad: async () => {
          const loaded = await loadSettingsFromDisk();
          return loaded ? cloneSettings(loaded) : null;
        },
      });
    } catch (e) {
      statusBar?.set("Open settings failed: " + (e?.message || e));
    }
  }

  return {
    getUserSettings: () => userSettings,
    setUserSettings,
    openSettingsDialog,
    saveSettingsToDisk,
    loadSettingsFromDisk,
    applySanitizedSettings,
  };
}
