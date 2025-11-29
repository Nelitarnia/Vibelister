import { listCommentsForView } from "../app/comments.js";
import {
  COMMENT_COLOR_PRESETS,
  DEFAULT_COMMENT_COLOR_ID,
  normalizeCommentColorPalette,
  normalizeCommentColorId,
} from "../data/comment-colors.js";
import { autoTextColor, parseHexColor } from "../data/color-utils.js";

const DEFAULT_EMPTY_SELECTION_MESSAGE = "Select a cell to manage comments.";

function getEntryText(entry) {
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

function getEntryColor(entry) {
  if (!entry || !entry.value || typeof entry.value !== "object") return "";
  const { color } = entry.value;
  if (typeof color !== "string") return "";
  const trimmed = color.trim();
  return trimmed || "";
}

function getEntryColorId(entry) {
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

function normalizeHexColor(value, fallback = "#3B82F6") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = parseHexColor(trimmed.startsWith("#") ? trimmed : `#${trimmed}`);
    if (parsed && parsed.length === 3) return rgbToHex(parsed[0], parsed[1], parsed[2]);
    const rgbaMatch = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (rgbaMatch) return rgbToHex(rgbaMatch[1], rgbaMatch[2], rgbaMatch[3]);
  }
  return fallback;
}

function deriveBadgeColorsFromHex(hex) {
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

function buildPayload(existingEntry, text, color) {
  const base =
    existingEntry && existingEntry.value && typeof existingEntry.value === "object"
      ? { ...existingEntry.value }
      : {};
  base.text = text;
  if (color) base.color = color;
  else if (Object.prototype.hasOwnProperty.call(base, "color")) delete base.color;
  return base;
}

export function initCommentsUI(options = {}) {
  const {
    toggleButton,
    addButton,
    sidebar,
    panelHost,
    panelId = "comments",
    panelTitle = "Comments",
    closeButton,
    listElement,
    emptyElement,
    editorForm,
    textarea,
    colorSelect,
    saveButton,
    deleteButton,
    cancelButton,
    prevButton,
    nextButton,
    selectionLabel,
    tabsContainer,
    commentsTabButton,
    customizeTabButton,
    commentsPage,
    customizePage,
    paletteList,
    paletteApplyButton,
    paletteResetButton,
    SelectionCtl,
    selection,
    sel,
    onSelectionChanged,
    getCellComments,
    setCellComment,
    deleteCellComment,
    getActiveView,
    setActiveView,
    viewDef,
    dataArray,
    render,
    statusBar,
    model,
    ensureVisible,
    VIEWS,
    noteKeyForPair,
    getInteractionsPair,
    commentColors,
  } = options;

  if (!sidebar || !toggleButton) return null;

  const paneEl = sidebar;
  const host = panelHost || null;
  let paneHandle = null;
  let detachHostToggle = null;
  let isOpen = false;
  let editingEntry = null;
  let comments = [];
  let selectionUnsub = null;
  let commentsHandler = null;

  const colorSelectEl = colorSelect || null;
  const prevButtonEl = prevButton || null;
  const nextButtonEl = nextButton || null;
  const tabsContainerEl = tabsContainer || null;
  const commentsTabButtonEl = commentsTabButton || null;
  const customizeTabButtonEl = customizeTabButton || null;
  const commentsPageEl = commentsPage || null;
  const customizePageEl = customizePage || null;
  const paletteListEl = paletteList || null;
  const paletteApplyButtonEl = paletteApplyButton || null;
  const paletteResetButtonEl = paletteResetButton || null;
  const setActiveViewFn =
    typeof setActiveView === "function" ? (...args) => setActiveView(...args) : null;
  let colorPresetSource = normalizeCommentColorPalette(
    Array.isArray(commentColors) && commentColors.length
      ? commentColors
      : COMMENT_COLOR_PRESETS,
  );
  let colorMap = new Map();
  let fallbackColorId = normalizeCommentColorId(DEFAULT_COMMENT_COLOR_ID) || "";
  let lastSelectedColor = fallbackColorId;
  let colorCounts = new Map();
  let colorSelectHandler = null;
  let prevClickHandler = null;
  let nextClickHandler = null;
  let filterState = null;

  function buildColorMap(palette) {
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
      const badgeBackground =
        typeof preset.badgeBackground === "string" && preset.badgeBackground.trim()
          ? preset.badgeBackground.trim()
          : deriveBadgeColorsFromHex(swatch).badgeBackground;
      const badgeBorder =
        typeof preset.badgeBorder === "string" && preset.badgeBorder.trim()
          ? preset.badgeBorder.trim()
          : deriveBadgeColorsFromHex(swatch).badgeBorder;
      const badgeText =
        typeof preset.badgeText === "string" && preset.badgeText.trim()
          ? preset.badgeText.trim()
          : deriveBadgeColorsFromHex(swatch).badgeText;
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

  function setColorPalette(nextPalette, options = {}) {
    colorPresetSource = normalizeCommentColorPalette(
      Array.isArray(nextPalette) && nextPalette.length ? nextPalette : COMMENT_COLOR_PRESETS,
    );
    colorMap = buildColorMap(colorPresetSource);
    const firstPreset = colorMap.values().next().value || null;
    fallbackColorId =
      (firstPreset && firstPreset.id) ||
      normalizeCommentColorId(DEFAULT_COMMENT_COLOR_ID) ||
      DEFAULT_COMMENT_COLOR_ID ||
      "";
    lastSelectedColor = normalizeColorId(lastSelectedColor) || fallbackColorId;
    ensureColorOptions();
    updateColorOptionCounts();
    if (!options.skipFilterCleanup && filterState) {
      const cleanedColors = filterState.colorIds
        ?.map((id) => normalizeColorId(id))
        .filter(Boolean);
      const nextColorIds = cleanedColors && cleanedColors.length ? cleanedColors : null;
      setFilter({ colorIds: nextColorIds }, { skipRebuild: true });
    }
    updateColorSelectAppearance(lastSelectedColor);
    if (!options.skipRebuild) rebuildFilteredEntries();
  }

  function buildPaletteDraft(source) {
    const palette = normalizeCommentColorPalette(source);
    return palette.map((preset) => {
      const hex = normalizeHexColor(
        typeof preset.swatch === "string" && preset.swatch.trim()
          ? preset.swatch.trim()
          : typeof preset.badgeBackground === "string"
            ? preset.badgeBackground
            : "",
      );
      const derived = deriveBadgeColorsFromHex(hex);
      return {
        id: preset.id,
        label:
          typeof preset.label === "string" && preset.label.trim()
            ? preset.label.trim()
            : preset.id,
        swatch: hex,
        badgeBackground: preset.badgeBackground || derived.badgeBackground,
        badgeBorder: preset.badgeBorder || derived.badgeBorder,
        badgeText: preset.badgeText || derived.badgeText,
      };
    });
  }

  function normalizeColorId(value) {
    if (value == null) return "";
    const normalized = normalizeCommentColorId(value);
    if (normalized && colorMap.has(normalized)) return normalized;
    const str = String(value).trim();
    if (!str) return "";
    return colorMap.has(str) ? str : "";
  }

  function getColorPreset(value) {
    const id = normalizeColorId(value);
    return id ? colorMap.get(id) || null : null;
  }

  function updateColorSelectAppearance(colorId) {
    if (!colorSelectEl) return;
    const preset = getColorPreset(colorId);
    if (preset) {
      colorSelectEl.dataset.color = preset.id;
      if (preset.badgeBackground) {
        colorSelectEl.style.setProperty("--comment-color-fill", preset.badgeBackground);
      } else {
        colorSelectEl.style.removeProperty("--comment-color-fill");
      }
      if (preset.badgeBorder) {
        colorSelectEl.style.setProperty("--comment-color-accent", preset.badgeBorder);
      } else {
        colorSelectEl.style.removeProperty("--comment-color-accent");
      }
    } else {
      if (colorSelectEl.dataset.color) delete colorSelectEl.dataset.color;
      colorSelectEl.style.removeProperty("--comment-color-fill");
      colorSelectEl.style.removeProperty("--comment-color-accent");
    }
  }

  function setColorSelectValue(colorId, options = {}) {
    const { updateFilter = true, updateLastSelected = updateFilter } = options;
    const normalized = normalizeColorId(colorId);
    const target = normalized || fallbackColorId;
    if (updateLastSelected) {
      lastSelectedColor = target;
    }
    if (colorSelectEl && colorSelectEl.value !== target) {
      colorSelectEl.value = target;
    }
    updateColorSelectAppearance(target);
    if (updateFilter) {
      setFilter({ colorIds: target ? [target] : null });
    }
    return target;
  }

  function getSelectedColorId() {
    if (!colorSelectEl) return lastSelectedColor || fallbackColorId;
    const normalized = normalizeColorId(colorSelectEl.value);
    if (normalized) {
      lastSelectedColor = normalized;
      updateColorSelectAppearance(normalized);
      return normalized;
    }
    return setColorSelectValue(lastSelectedColor || fallbackColorId);
  }

  function getColorCount(colorId) {
    if (!colorId || !colorCounts) return 0;
    return colorCounts.get(colorId) || 0;
  }

  function formatColorOptionText(label, count) {
    if (!label) return "";
    if (!count) return label;
    const noun = count === 1 ? "note" : "notes";
    return `${label} — ${count} ${noun}`;
  }

  function updateColorOptionCounts() {
    if (!colorSelectEl) return;
    const options = colorSelectEl.options;
    if (!options) return;
    for (const option of options) {
      if (!option || typeof option.value !== "string") continue;
      const preset = colorMap.get(option.value);
      if (preset) {
        option.textContent = formatColorOptionText(
          preset.label,
          getColorCount(preset.id),
        );
      } else if (option.dataset && option.dataset.label) {
        option.textContent = formatColorOptionText(
          option.dataset.label,
          getColorCount(option.value),
        );
      }
    }
  }

  function ensureColorOptions() {
    if (!colorSelectEl) return;
    while (colorSelectEl.firstChild) colorSelectEl.removeChild(colorSelectEl.firstChild);
    if (!colorMap.size) {
      const option = document.createElement("option");
      option.value = fallbackColorId;
      const label = fallbackColorId || "Default";
      option.dataset.label = label;
      option.textContent = formatColorOptionText(label, getColorCount(fallbackColorId));
      colorSelectEl.appendChild(option);
    } else {
      for (const preset of colorMap.values()) {
        const option = document.createElement("option");
        option.value = preset.id;
        option.dataset.label = preset.label;
        option.textContent = formatColorOptionText(
          preset.label,
          getColorCount(preset.id),
        );
        colorSelectEl.appendChild(option);
      }
    }
    setColorSelectValue(lastSelectedColor || fallbackColorId);
  }

  function applyColorPresetToSwatch(el, colorId) {
    if (!el) return;
    const preset = getColorPreset(colorId);
    if (preset) {
      el.dataset.color = preset.id;
      el.style.background = preset.swatch || preset.badgeBackground || "";
      el.style.borderColor = preset.badgeBorder || preset.swatch || "";
      if (preset.label) el.title = `${preset.label} comment`;
    } else {
      if (el.dataset.color) delete el.dataset.color;
      el.style.background = "";
      el.style.borderColor = "";
      el.removeAttribute("title");
    }
  }

  function getColorLabel(entry) {
    const preset = getColorPreset(getEntryColor(entry));
    return preset ? preset.label : null;
  }

  filterState = normalizeFilter(
    model?.meta?.commentFilter || {
      viewKey: typeof getActiveView === "function" ? getActiveView() : null,
    },
  );
  if (!filterState.viewKey && typeof getActiveView === "function") {
    filterState = { ...filterState, viewKey: getActiveView() };
  }
  let filteredEntries = [];
  let filteredIndex = -1;

  setColorPalette(colorPresetSource, { skipFilterCleanup: true, skipRebuild: true });

  let activeTab = "comments";
  let paletteDraft = buildPaletteDraft(colorPresetSource);

  function setActiveTab(tabId) {
    const target = tabId === "customize" ? "customize" : "comments";
    activeTab = target;
    if (commentsTabButtonEl)
      commentsTabButtonEl.setAttribute("aria-selected", target === "comments" ? "true" : "false");
    if (customizeTabButtonEl)
      customizeTabButtonEl.setAttribute("aria-selected", target === "customize" ? "true" : "false");
    if (commentsPageEl) commentsPageEl.hidden = target !== "comments";
    if (customizePageEl) customizePageEl.hidden = target !== "customize";
  }

  function palettesEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const left = a[i];
      const right = b[i];
      if (!left || !right) return false;
      if (left.id !== right.id) return false;
      if ((left.label || left.id) !== (right.label || right.id)) return false;
      if (normalizeHexColor(left.swatch) !== normalizeHexColor(right.swatch)) return false;
      if ((left.badgeBackground || "") !== (right.badgeBackground || "")) return false;
      if ((left.badgeBorder || "") !== (right.badgeBorder || "")) return false;
      if ((left.badgeText || "") !== (right.badgeText || "")) return false;
    }
    return true;
  }

  function paletteDraftChanged(reference = colorPresetSource) {
    const baseline = buildPaletteDraft(reference);
    return !palettesEqual(paletteDraft, baseline);
  }

  function paletteDraftMatchesDefaults() {
    return palettesEqual(paletteDraft, buildPaletteDraft(COMMENT_COLOR_PRESETS));
  }

  function updatePaletteButtons() {
    const changed = paletteDraftChanged();
    if (paletteApplyButtonEl) paletteApplyButtonEl.disabled = !changed;
    if (paletteResetButtonEl) paletteResetButtonEl.disabled = paletteDraftMatchesDefaults();
  }

  function updatePaletteSwatch(el, entry) {
    if (!el || !entry) return;
    el.style.background = entry.swatch || entry.badgeBackground || "";
    el.style.borderColor = entry.badgeBorder || entry.swatch || "";
    const label =
      entry && typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim()
        : entry.id;
    el.title = `${label || entry.id} color`;
  }

  function setPaletteDraft(nextPalette) {
    paletteDraft = buildPaletteDraft(nextPalette);
    renderPaletteList();
    updatePaletteButtons();
  }

  function applyModelMetadata(meta = {}) {
    const paletteSource =
      meta && Array.isArray(meta.commentColors) && meta.commentColors.length
        ? meta.commentColors
        : COMMENT_COLOR_PRESETS;
    setColorPalette(paletteSource, { skipFilterCleanup: false, skipRebuild: true });
    setPaletteDraft(paletteSource);

    let nextFilter = normalizeFilter(
      meta && typeof meta.commentFilter === "object"
        ? meta.commentFilter
        : { viewKey: typeof getActiveView === "function" ? getActiveView() : null },
    );
    if (!nextFilter.viewKey && typeof getActiveView === "function") {
      nextFilter = { ...nextFilter, viewKey: getActiveView() };
    }
    filterState = nextFilter;
    const activeColorId = filterState.colorIds?.[0] || fallbackColorId;
    setColorSelectValue(activeColorId, { updateFilter: false, updateLastSelected: true });
    persistFilterState(filterState);
    rebuildFilteredEntries();
    syncFromSelection();
  }

  function renderPaletteList() {
    if (!paletteListEl) return;
    while (paletteListEl.firstChild) paletteListEl.removeChild(paletteListEl.firstChild);
    if (!Array.isArray(paletteDraft) || !paletteDraft.length) {
      const empty = document.createElement("div");
      empty.className = "comment-sidebar__empty";
      empty.textContent = "No palette entries defined.";
      paletteListEl.appendChild(empty);
      return;
    }
    paletteDraft.forEach((entry, index) => {
      const row = document.createElement("div");
      row.className = "comment-customize__item";
      row.dataset.id = entry.id;

      const swatch = document.createElement("div");
      swatch.className = "comment-customize__swatch";
      updatePaletteSwatch(swatch, entry);
      row.appendChild(swatch);

      const fields = document.createElement("div");
      fields.className = "comment-customize__fields";

      const labelField = document.createElement("label");
      labelField.className = "comment-customize__label";
      const labelTitle = document.createElement("span");
      labelTitle.className = "comment-customize__field-title";
      labelTitle.textContent = "Label";
      const labelInput = document.createElement("input");
      labelInput.className = "comment-customize__input";
      labelInput.type = "text";
      labelInput.value = entry.label ?? entry.id;
      labelInput.placeholder = entry.id;
      labelInput.addEventListener("input", () => {
        entry.label = labelInput.value;
        updatePaletteButtons();
        updatePaletteSwatch(swatch, entry);
      });
      labelField.appendChild(labelTitle);
      labelField.appendChild(labelInput);

      const colorField = document.createElement("label");
      colorField.className = "comment-customize__color-field";
      const colorTitle = document.createElement("span");
      colorTitle.className = "comment-customize__field-title";
      colorTitle.textContent = "Color";
      const colorInput = document.createElement("input");
      colorInput.className = "comment-customize__color-input";
      colorInput.type = "color";
      colorInput.value = normalizeHexColor(entry.swatch);
      colorInput.addEventListener("input", () => {
        const hex = normalizeHexColor(colorInput.value, entry.swatch);
        const derived = deriveBadgeColorsFromHex(hex);
        entry.swatch = hex;
        entry.badgeBackground = derived.badgeBackground;
        entry.badgeBorder = derived.badgeBorder;
        entry.badgeText = derived.badgeText;
        updatePaletteSwatch(swatch, entry);
        updatePaletteButtons();
        colorInput.value = hex;
      });
      colorField.appendChild(colorTitle);
      colorField.appendChild(colorInput);

      fields.appendChild(labelField);
      fields.appendChild(colorField);
      row.appendChild(fields);

      const controls = document.createElement("div");
      controls.className = "comment-customize__controls";
      const moveUp = document.createElement("button");
      moveUp.type = "button";
      moveUp.className = "comment-customize__move";
      moveUp.textContent = "↑";
      moveUp.disabled = index === 0;
      moveUp.addEventListener("click", () => movePaletteEntry(entry.id, -1));
      const moveDown = document.createElement("button");
      moveDown.type = "button";
      moveDown.className = "comment-customize__move";
      moveDown.textContent = "↓";
      moveDown.disabled = index === paletteDraft.length - 1;
      moveDown.addEventListener("click", () => movePaletteEntry(entry.id, 1));
      controls.appendChild(moveUp);
      controls.appendChild(moveDown);
      row.appendChild(controls);

      paletteListEl.appendChild(row);
    });
  }

  function movePaletteEntry(id, delta = 0) {
    if (!delta || !Array.isArray(paletteDraft) || paletteDraft.length < 2) return;
    const index = paletteDraft.findIndex((entry) => entry && entry.id === id);
    if (index < 0) return;
    const next = paletteDraft.slice();
    const [entry] = next.splice(index, 1);
    const target = Math.max(0, Math.min(next.length, index + delta));
    next.splice(target, 0, entry);
    paletteDraft = next;
    renderPaletteList();
    updatePaletteButtons();
  }

  function applyPaletteDraft() {
    const activeColorId = getSelectedColorId();
    const nextPalette = paletteDraft.map((entry) => ({
      id: entry.id,
      label: typeof entry.label === "string" ? entry.label.trim() : "",
      swatch: normalizeHexColor(entry.swatch),
      badgeBackground: entry.badgeBackground,
      badgeBorder: entry.badgeBorder,
      badgeText: entry.badgeText,
    }));
    if (!model || typeof model !== "object") return;
    if (!model.meta || typeof model.meta !== "object") model.meta = {};
    model.meta.commentColors = normalizeCommentColorPalette(nextPalette);
    setColorPalette(model.meta.commentColors);
    setPaletteDraft(model.meta.commentColors);
    setColorSelectValue(activeColorId, { updateFilter: false, updateLastSelected: false });
    renderList();
    statusBar?.set?.("Comment colors updated.");
    render?.();
  }

  function resetPaletteDraft() {
    setPaletteDraft(COMMENT_COLOR_PRESETS);
  }

  setActiveTab(activeTab);
  renderPaletteList();
  updatePaletteButtons();

  if (colorSelectEl) {
    ensureColorOptions();
    colorSelectHandler = () => {
      setColorSelectValue(colorSelectEl.value);
    };
    colorSelectEl.addEventListener("change", colorSelectHandler);
  } else {
    lastSelectedColor = fallbackColorId;
  }

  persistFilterState(filterState);

  function normalizeStringArray(values) {
    if (!Array.isArray(values) || !values.length) return null;
    const unique = Array.from(
      new Set(
        values
          .map((value) => {
            const str = String(value ?? "").trim();
            return str || null;
          })
          .filter(Boolean),
      ),
    );
    if (!unique.length) return null;
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }

  function normalizeColorFilter(values) {
    if (values == null) return null;
    const list = Array.isArray(values) ? values : [values];
    const unique = Array.from(
      new Set(
        list
          .map((value) => {
            const normalized = normalizeColorId(value);
            if (normalized) return normalized;
            const str = String(value ?? "").trim();
            return str || null;
          })
          .filter(Boolean),
      ),
    );
    if (!unique.length) return null;
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  }

  function normalizeFilter(raw = {}) {
    const base = { viewKey: null, rowIds: null, columnKeys: null, colorIds: null };
    if (!raw || typeof raw !== "object") return base;
    if (typeof raw.viewKey === "string") {
      const trimmed = raw.viewKey.trim();
      if (trimmed) base.viewKey = trimmed;
    }
    base.rowIds = normalizeStringArray(raw.rowIds || raw.rows);
    base.columnKeys = normalizeStringArray(raw.columnKeys || raw.columns);
    base.colorIds = normalizeColorFilter(
      raw.colorIds || raw.colors || raw.colorId || raw.color,
    );
    return base;
  }

  function arraysEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function filtersEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.viewKey === b.viewKey &&
      arraysEqual(a.rowIds, b.rowIds) &&
      arraysEqual(a.columnKeys, b.columnKeys) &&
      arraysEqual(a.colorIds, b.colorIds)
    );
  }

  function persistFilterState(next = filterState) {
    if (!model || typeof model !== "object") return;
    if (!model.meta || typeof model.meta !== "object") model.meta = {};
    model.meta.commentFilter = { ...next };
  }

  function getFilterViewKey() {
    if (filterState.viewKey) return filterState.viewKey;
    return typeof getActiveView === "function" ? getActiveView() : null;
  }

  function resolveViewDefinitionForFilter(viewKey) {
    if (!viewKey) return null;
    const active = typeof getActiveView === "function" ? getActiveView() : null;
    if (active && viewKey === active) {
      const current = typeof viewDef === "function" ? viewDef() : null;
      if (current) return current;
    }
    if (VIEWS && typeof VIEWS === "object" && VIEWS[viewKey]) {
      return VIEWS[viewKey];
    }
    return null;
  }

  function rowsForViewKey(viewKey) {
    if (!viewKey || !model || typeof model !== "object") return [];
    const active = typeof getActiveView === "function" ? getActiveView() : null;
    if (active && viewKey === active) {
      const rows = typeof dataArray === "function" ? dataArray() : null;
      return Array.isArray(rows) ? rows : [];
    }
    if (viewKey === "actions") return Array.isArray(model.actions) ? model.actions : [];
    if (viewKey === "inputs") return Array.isArray(model.inputs) ? model.inputs : [];
    if (viewKey === "modifiers")
      return Array.isArray(model.modifiers) ? model.modifiers : [];
    if (viewKey === "outcomes") return Array.isArray(model.outcomes) ? model.outcomes : [];
    return [];
  }

  function buildInteractionsRowResolver() {
    if (
      !model ||
      typeof getInteractionsPair !== "function" ||
      typeof noteKeyForPair !== "function"
    ) {
      return () => -1;
    }
    const total = Number(model?.interactionsIndex?.totalRows);
    if (!Number.isFinite(total) || total <= 0) return () => -1;
    const map = new Map();
    for (let rowIndex = 0; rowIndex < total; rowIndex++) {
      const pair = getInteractionsPair(model, rowIndex);
      if (!pair) continue;
      const key = noteKeyForPair(pair, undefined);
      if (!key) continue;
      const normalized = String(key);
      if (!map.has(normalized)) map.set(normalized, rowIndex);
    }
    return (rowId) => {
      const key = String(rowId ?? "");
      return map.has(key) ? map.get(key) : -1;
    };
  }

  function hasAvailableRow(entry) {
    if (!entry) return false;
    return Number.isInteger(entry.rowIndex) && entry.rowIndex >= 0;
  }

  function getCountableColorId(entry) {
    if (!entry) return "";
    if (!hasAvailableRow(entry)) return "";
    if (entry?.value && typeof entry.value === "object" && entry.value.inactive === true)
      return "";
    const entryColorId = getEntryColorId(entry);
    const normalized = normalizeColorId(entryColorId);
    if (normalized) return normalized;
    if (!entryColorId && fallbackColorId && colorMap.has(fallbackColorId)) {
      return fallbackColorId;
    }
    return "";
  }

  function matchesFilterEntry(entry) {
    if (!entry) return false;
    if (!hasAvailableRow(entry)) return false;
    if (entry.value && typeof entry.value === "object" && entry.value.inactive === true)
      return false;
    if (filterState.rowIds && filterState.rowIds.length) {
      if (!filterState.rowIds.includes(entry.rowId)) return false;
    }
    if (filterState.columnKeys && filterState.columnKeys.length) {
      if (!filterState.columnKeys.includes(entry.columnKey)) return false;
    }
    if (filterState.colorIds && filterState.colorIds.length) {
      const colorId = getEntryColorId(entry);
      if (!colorId || !filterState.colorIds.includes(colorId)) return false;
    }
    return true;
  }

  function entriesMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const aCell = a.cellKey != null ? String(a.cellKey) : null;
    const bCell = b.cellKey != null ? String(b.cellKey) : null;
    if (aCell && bCell && aCell === bCell) return true;
    const aView = a.viewKey != null ? String(a.viewKey) : null;
    const bView = b.viewKey != null ? String(b.viewKey) : null;
    if (aView && bView && aView !== bView) return false;
    const aRowKey = a.rowKey != null ? String(a.rowKey) : null;
    const bRowKey = b.rowKey != null ? String(b.rowKey) : null;
    if (aRowKey && bRowKey) {
      if (aRowKey !== bRowKey) return false;
    } else {
      const aRowId = a.rowId != null ? String(a.rowId) : null;
      const bRowId = b.rowId != null ? String(b.rowId) : null;
      if (aRowId && bRowId) {
        if (aRowId !== bRowId) return false;
      } else if (
        Number.isInteger(a.rowIndex) &&
        Number.isInteger(b.rowIndex) &&
        a.rowIndex !== b.rowIndex
      ) {
        return false;
      }
    }
    const aColumnKey = a.columnKey != null ? String(a.columnKey) : null;
    const bColumnKey = b.columnKey != null ? String(b.columnKey) : null;
    if (aColumnKey && bColumnKey) return aColumnKey === bColumnKey;
    if (
      Number.isInteger(a.columnIndex) &&
      Number.isInteger(b.columnIndex) &&
      a.columnIndex === b.columnIndex
    ) {
      return true;
    }
    return false;
  }

  function syncFilteredIndexToSelection() {
    const active = typeof getActiveView === "function" ? getActiveView() : null;
    if (!active) {
      filteredIndex = -1;
      return;
    }
    filteredIndex = filteredEntries.findIndex(
      (entry) =>
        entry.viewKey === active &&
        entry.rowIndex === sel.r &&
        entry.columnIndex === sel.c,
    );
  }

  function buildViewTraversalOrder(baseViewKey) {
    const viewKeys = [];
    if (VIEWS && typeof VIEWS === "object") {
      for (const key of Object.keys(VIEWS)) viewKeys.push(key);
    }
    if (baseViewKey && !viewKeys.includes(baseViewKey)) {
      viewKeys.unshift(baseViewKey);
    }
    if (!viewKeys.length && baseViewKey) return [baseViewKey];
    if (!viewKeys.length) return [];
    if (!baseViewKey) return viewKeys;
    const start = viewKeys.indexOf(baseViewKey);
    if (start <= 0) return viewKeys;
    const after = viewKeys.slice(start);
    const before = viewKeys.slice(0, start);
    return after.concat(before);
  }

  function rebuildFilteredEntries() {
    const baseViewKey = getFilterViewKey();
    const traversal = buildViewTraversalOrder(baseViewKey);
    if (!traversal.length) {
      filteredEntries = [];
      colorCounts = new Map();
      updateColorOptionCounts();
      filteredIndex = -1;
      updateNavButtons();
      return;
    }

    const nextEntries = [];
    const nextColorCounts = new Map();
    let interactionsResolver = null;

    const recordColorUsage = (entry) => {
      const colorId = getCountableColorId(entry);
      if (!colorId) return;
      nextColorCounts.set(colorId, (nextColorCounts.get(colorId) || 0) + 1);
    };

    for (const key of traversal) {
      const definition = resolveViewDefinitionForFilter(key);
      if (!definition) continue;
      let options;
      if (key === "interactions") {
        if (!interactionsResolver) {
          interactionsResolver = buildInteractionsRowResolver();
        }
        options = { findRowIndex: interactionsResolver };
      } else {
        options = { rows: rowsForViewKey(key) };
      }
      const viewEntries = listCommentsForView(model, definition, options);
      if (!Array.isArray(viewEntries) || !viewEntries.length) continue;
      for (const entry of viewEntries) {
        recordColorUsage(entry);
        if (matchesFilterEntry(entry)) nextEntries.push(entry);
      }
    }

    colorCounts = nextColorCounts;
    updateColorOptionCounts();
    filteredEntries = nextEntries;
    syncFilteredIndexToSelection();
    updateNavButtons();
  }

  function updateNavButtons() {
    const hasTargets = Array.isArray(filteredEntries) && filteredEntries.length > 0;
    if (prevButtonEl) {
      prevButtonEl.disabled = !hasTargets;
      prevButtonEl.setAttribute("aria-disabled", hasTargets ? "false" : "true");
    }
    if (nextButtonEl) {
      nextButtonEl.disabled = !hasTargets;
      nextButtonEl.setAttribute("aria-disabled", hasTargets ? "false" : "true");
    }
  }

  function setFilter(next, options = {}) {
    const normalized = normalizeFilter({ ...filterState, ...next });
    if (filtersEqual(filterState, normalized)) return filterState;
    filterState = normalized;
    persistFilterState(filterState);
    if (!options.skipRebuild) rebuildFilteredEntries();
    return filterState;
  }

  function getFilter() {
    return {
      viewKey: filterState.viewKey,
      rowIds: filterState.rowIds ? filterState.rowIds.slice() : null,
      columnKeys: filterState.columnKeys ? filterState.columnKeys.slice() : null,
      colorIds: filterState.colorIds ? filterState.colorIds.slice() : null,
    };
  }

  function getFilteredEntries() {
    return filteredEntries.map((entry) => ({ ...entry }));
  }

  function getFilteredIndex() {
    return filteredIndex;
  }

  function focusFilteredEntryAt(index, options = {}) {
    if (!Array.isArray(filteredEntries) || !filteredEntries.length) return null;
    let targetIndex = Number.isInteger(index) ? index : 0;
    if (targetIndex < 0) targetIndex = 0;
    let entry = filteredEntries[targetIndex];
    if (!entry) return null;

    let attempts = 0;
    while (entry && attempts < (filteredEntries.length || 1) + 5) {
      attempts += 1;
      let active = typeof getActiveView === "function" ? getActiveView() : null;
      const desiredView = entry.viewKey || null;
      if (desiredView && desiredView !== active) {
        if (!setActiveViewFn) {
          statusBar?.set?.(`Switch to the ${desiredView} view to inspect this comment.`);
          return null;
        }
        const previous = entry;
        setActiveViewFn(desiredView);
        active = typeof getActiveView === "function" ? getActiveView() : null;
        if (active !== desiredView) {
          statusBar?.set?.(`Unable to switch to the ${desiredView} view.`);
          return null;
        }
        setFilter({ viewKey: desiredView }, { skipRebuild: true });
        rebuildFilteredEntries();
        if (!Array.isArray(filteredEntries) || !filteredEntries.length) {
          statusBar?.set?.("No comments match the current filter.");
          filteredIndex = -1;
          updateNavButtons();
          return null;
        }
        if (previous) {
          const matchIndex = filteredEntries.findIndex((candidate) =>
            entriesMatch(candidate, previous),
          );
          if (matchIndex >= 0) {
            targetIndex = matchIndex;
          } else if (targetIndex >= filteredEntries.length) {
            targetIndex = filteredEntries.length - 1;
          }
        } else if (targetIndex >= filteredEntries.length) {
          targetIndex = filteredEntries.length - 1;
        }
        entry = filteredEntries[targetIndex];
        continue;
      }

      if (!hasAvailableRow(entry)) {
        const prevLength = filteredEntries.length;
        filteredEntries.splice(targetIndex, 1);
        if (filteredEntries.length !== prevLength) {
          if (!filteredEntries.length) {
            filteredIndex = -1;
            updateNavButtons();
            statusBar?.set?.("No comments match the current filter.");
            return null;
          }
          if (targetIndex >= filteredEntries.length) targetIndex = filteredEntries.length - 1;
          entry = filteredEntries[targetIndex];
          updateNavButtons();
          continue;
        }
      }

      if (!Number.isInteger(entry.columnIndex) || entry.columnIndex < 0) {
        statusBar?.set?.("Comment column is no longer available.");
        return null;
      }

      SelectionCtl?.setActiveCell?.(entry.rowIndex, entry.columnIndex);
      if (typeof ensureVisible === "function") {
        const align = options && typeof options === "object" ? options.align : undefined;
        if (align) ensureVisible(entry.rowIndex, entry.columnIndex, { align });
        else ensureVisible(entry.rowIndex, entry.columnIndex);
      }
      filteredIndex = targetIndex;
      return entry;
    }

    return null;
  }

  function stepFilteredEntry(step = 1, options = {}) {
    if (!Array.isArray(filteredEntries) || !filteredEntries.length) {
      statusBar?.set?.("No comments match the current filter.");
      return null;
    }
    const total = filteredEntries.length;
    let offset = Number.isFinite(step) ? Math.trunc(step) : 0;
    if (offset === 0) offset = 1;
    let nextIndex = filteredIndex;
    if (!Number.isInteger(nextIndex) || nextIndex < 0) {
      nextIndex = offset > 0 ? 0 : total - 1;
    } else {
      nextIndex = (nextIndex + offset) % total;
      if (nextIndex < 0) nextIndex += total;
    }
    return focusFilteredEntryAt(nextIndex, options);
  }

  function forEachFilteredEntry(cb) {
    if (typeof cb !== "function") return;
    for (const entry of filteredEntries) cb(entry);
  }

  function hasValidSelection() {
    return Number.isFinite(sel?.r) && Number.isFinite(sel?.c);
  }

  function isPaneOpen() {
    if (paneHandle && typeof paneHandle.isOpen === "function") {
      return !!paneHandle.isOpen();
    }
    return !!isOpen;
  }

  function updateToggleState() {
    const expanded = isPaneOpen();
    toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (!paneHandle && paneEl) {
      paneEl.dataset.open = expanded ? "true" : "false";
      paneEl.setAttribute("aria-hidden", expanded ? "false" : "true");
    }
  }

  if (host && typeof host.registerPane === "function") {
    paneHandle = host.registerPane({
      id: panelId,
      element: paneEl,
      title: panelTitle,
      onShow: () => {
        isOpen = true;
        updateToggleState();
      },
      onHide: () => {
        isOpen = false;
        updateToggleState();
        stopEditing();
      },
    });
    if (paneHandle && typeof paneHandle.isOpen === "function") {
      isOpen = !!paneHandle.isOpen();
    }
    if (host && typeof host.attachToggle === "function") {
      detachHostToggle = host.attachToggle(toggleButton, panelId);
    }
  } else if (paneEl) {
    isOpen = paneEl.dataset.open === "true";
    paneEl.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }

  function setOpen(next) {
    const desired = !!next;
    if (paneHandle) {
      if (desired) paneHandle.open();
      else paneHandle.close();
      return;
    }
    if (isOpen === desired) return;
    isOpen = desired;
    updateToggleState();
    if (!isOpen) stopEditing();
  }

  function ensureOpen() {
    if (paneHandle) {
      paneHandle.open();
      return;
    }
    if (!isOpen) {
      isOpen = true;
      updateToggleState();
    }
  }

  function closeSidebar() {
    if (paneHandle) {
      paneHandle.close();
      return;
    }
    if (!isOpen) return;
    isOpen = false;
    updateToggleState();
    stopEditing();
  }

  function updateSelectionLabel() {
    if (!selectionLabel) return;
    if (!hasValidSelection()) {
      selectionLabel.textContent = DEFAULT_EMPTY_SELECTION_MESSAGE;
      return;
    }
    const vd = typeof viewDef === "function" ? viewDef() : null;
    const active = typeof getActiveView === "function" ? getActiveView() : null;
    const viewTitle = vd?.title || vd?.key || active || "";
    const columns = Array.isArray(vd?.columns) ? vd.columns : [];
    const column = columns[sel.c];
    const columnLabel = column?.title || column?.key || `Column ${sel.c + 1}`;
    let rowLabel = `Row ${sel.r + 1}`;
    if (vd && vd.key !== "interactions" && typeof dataArray === "function") {
      const rows = dataArray();
      const row = rows && rows[sel.r];
      if (row) {
        if (typeof row.name === "string" && row.name.trim()) rowLabel = row.name.trim();
        else if (row.id != null) rowLabel = `Row ${row.id}`;
      }
    }
    selectionLabel.textContent = viewTitle
      ? `${viewTitle}: ${columnLabel} — ${rowLabel}`
      : `${columnLabel} — ${rowLabel}`;
  }

  function renderList() {
    if (listElement) listElement.innerHTML = "";
    const hasComments = Array.isArray(comments) && comments.length > 0;
    if (toggleButton) toggleButton.dataset.hasComment = hasComments ? "true" : "false";
    if (addButton) {
      addButton.textContent = hasComments ? "Edit comment" : "Add comment";
      addButton.disabled = !hasValidSelection();
    }
    if (deleteButton) deleteButton.disabled = !hasComments;

    if (!hasValidSelection()) {
      if (emptyElement) {
        emptyElement.hidden = false;
        emptyElement.textContent = DEFAULT_EMPTY_SELECTION_MESSAGE;
      }
      return;
    }

    if (!hasComments) {
      if (emptyElement) {
        emptyElement.hidden = false;
        emptyElement.textContent = "No comment on this cell.";
      }
      return;
    }

    if (emptyElement) emptyElement.hidden = true;
    if (!listElement) return;

    comments.forEach((entry, index) => {
      const item = document.createElement("li");
      item.className = "comment-sidebar__item";
      if (entry?.value && typeof entry.value === "object" && entry.value.inactive === true) {
        item.classList.add("comment-sidebar__item--inactive");
      }

      const text = document.createElement("div");
      text.className = "comment-sidebar__item-text";
      text.textContent = getEntryText(entry) || "(empty comment)";
      item.appendChild(text);

      const meta = document.createElement("div");
      meta.className = "comment-sidebar__item-meta";
      const swatch = document.createElement("span");
      swatch.className = "comment-sidebar__item-swatch";
      applyColorPresetToSwatch(swatch, getEntryColor(entry));
      meta.appendChild(swatch);

      const metaText = document.createElement("span");
      metaText.className = "comment-sidebar__item-meta-text";
      const parts = [index === 0 ? "Primary" : `Entry ${index + 1}`];
      if (entry?.value && typeof entry.value === "object" && entry.value.inactive === true) {
        parts.push("Inactive");
      }
      const colorLabel = getColorLabel(entry);
      if (colorLabel) parts.push(colorLabel);
      metaText.textContent = parts.join(" · ");
      meta.appendChild(metaText);
      item.appendChild(meta);

      item.addEventListener("click", () => startEditing(entry));
      listElement.appendChild(item);
    });
  }

  function syncFromSelection() {
    updateSelectionLabel();
    if (!hasValidSelection()) {
      comments = [];
      stopEditing();
      renderList();
      rebuildFilteredEntries();
      return;
    }
    const options = {
      view: typeof getActiveView === "function" ? getActiveView() : undefined,
      viewDef: typeof viewDef === "function" ? viewDef() : undefined,
    };
    const entries =
      typeof getCellComments === "function"
        ? getCellComments(sel.r, sel.c, options) || []
        : [];
    comments = Array.isArray(entries) ? entries : [];
    if (colorSelectEl && (!editorForm || editorForm.hidden)) {
      if (comments.length) {
        setColorSelectValue(getEntryColor(comments[0]) || fallbackColorId, {
          updateFilter: false,
          updateLastSelected: false,
        });
      } else {
        setColorSelectValue(lastSelectedColor || fallbackColorId, {
          updateFilter: false,
          updateLastSelected: false,
        });
      }
    }
    if (!comments.length) stopEditing();
    renderList();
    rebuildFilteredEntries();
  }

  function startEditing(entry = null) {
    if (!hasValidSelection()) return;
    setActiveTab("comments");
    ensureOpen();
    editingEntry = entry || (comments.length ? comments[0] : null);
    if (editorForm) {
      editorForm.hidden = false;
      editorForm.dataset.mode = editingEntry ? "edit" : "create";
    }
    if (textarea) {
      textarea.value = getEntryText(editingEntry);
      textarea.focus();
      textarea.select();
    }
    if (colorSelectEl) {
      const entryColor = getEntryColor(editingEntry);
      setColorSelectValue(entryColor || lastSelectedColor || fallbackColorId, {
        updateFilter: false,
        updateLastSelected: false,
      });
    }
    if (deleteButton) deleteButton.disabled = !editingEntry;
  }

  function stopEditing() {
    editingEntry = null;
    if (editorForm) {
      editorForm.hidden = true;
      editorForm.dataset.mode && delete editorForm.dataset.mode;
    }
    if (textarea) textarea.value = "";
    if (deleteButton) deleteButton.disabled = !comments.length;
  }

  function handleSave(e) {
    e?.preventDefault?.();
    if (!hasValidSelection() || !textarea) return;
    const raw = textarea.value;
    const text = raw != null ? raw.trim() : "";
    if (!text) {
      statusBar?.set?.("Comment text cannot be empty.");
      return;
    }
    const colorId = getSelectedColorId();
    const payload = buildPayload(editingEntry, text, colorId);
    const options = {
      view: typeof getActiveView === "function" ? getActiveView() : undefined,
      viewDef: typeof viewDef === "function" ? viewDef() : undefined,
    };
    const change = setCellComment?.(sel.r, sel.c, payload, options);
    if (change) {
      statusBar?.set?.("Comment saved.");
      SelectionCtl?.setActiveCell?.(sel.r, sel.c);
      render?.();
    }
    stopEditing();
    syncFromSelection();
  }

  function handleDelete() {
    if (!hasValidSelection() || !comments.length) return;
    const options = {
      view: typeof getActiveView === "function" ? getActiveView() : undefined,
      viewDef: typeof viewDef === "function" ? viewDef() : undefined,
    };
    const change = deleteCellComment?.(sel.r, sel.c, options);
    if (change) {
      statusBar?.set?.("Comment removed.");
      SelectionCtl?.setActiveCell?.(sel.r, sel.c);
      render?.();
    }
    stopEditing();
    syncFromSelection();
  }

  function onCommentsUpdated() {
    if (editorForm && !editorForm.hidden) return; // avoid clobbering in-progress edits
    syncFromSelection();
  }

  const toggleHandler = () => setOpen(!isPaneOpen());
  const addHandler = () => startEditing();
  const closeHandler = () => closeSidebar();
  const cancelHandler = () => stopEditing();
  const commentsTabHandler = () => setActiveTab("comments");
  const customizeTabHandler = () => setActiveTab("customize");
  const paletteApplyHandler = () => applyPaletteDraft();
  const paletteResetHandler = () => resetPaletteDraft();

  if (!detachHostToggle) {
    toggleButton.addEventListener("click", toggleHandler);
  }
  addButton?.addEventListener("click", addHandler);
  closeButton?.addEventListener("click", closeHandler);
  cancelButton?.addEventListener("click", cancelHandler);
  saveButton?.addEventListener("click", handleSave);
  editorForm?.addEventListener("submit", handleSave);
  deleteButton?.addEventListener("click", handleDelete);
  if (prevButtonEl) {
    prevClickHandler = () => {
      stepFilteredEntry(-1);
    };
    prevButtonEl.addEventListener("click", prevClickHandler);
  }
  if (nextButtonEl) {
    nextClickHandler = () => {
      stepFilteredEntry(1);
    };
    nextButtonEl.addEventListener("click", nextClickHandler);
  }
  commentsTabButtonEl?.addEventListener("click", commentsTabHandler);
  customizeTabButtonEl?.addEventListener("click", customizeTabHandler);
  paletteApplyButtonEl?.addEventListener("click", paletteApplyHandler);
  paletteResetButtonEl?.addEventListener("click", paletteResetHandler);

  if (typeof onSelectionChanged === "function") {
    selectionUnsub = onSelectionChanged(() => {
      if (!selection) return;
      syncFromSelection();
    });
  }

  commentsHandler = onCommentsUpdated;
  document.addEventListener("vibelister:comments-updated", commentsHandler);

  updateToggleState();
  syncFromSelection();

  return {
    refresh: syncFromSelection,
    applyModelMetadata,
    setOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isPaneOpen()),
    isOpen: () => isPaneOpen(),
    getFilter,
    setFilter: (next, options) => setFilter(next, options),
    getFilteredEntries,
    getFilteredIndex,
    focusFilteredEntryAt,
    stepFilteredEntry,
    forEachFilteredEntry,
    destroy() {
      if (detachHostToggle) {
        detachHostToggle();
        detachHostToggle = null;
      } else {
        toggleButton.removeEventListener("click", toggleHandler);
      }
      addButton?.removeEventListener("click", addHandler);
      closeButton?.removeEventListener("click", closeHandler);
      cancelButton?.removeEventListener("click", cancelHandler);
      saveButton?.removeEventListener("click", handleSave);
      editorForm?.removeEventListener("submit", handleSave);
      deleteButton?.removeEventListener("click", handleDelete);
      if (prevClickHandler && prevButtonEl) {
        prevButtonEl.removeEventListener("click", prevClickHandler);
        prevClickHandler = null;
      }
      if (nextClickHandler && nextButtonEl) {
        nextButtonEl.removeEventListener("click", nextClickHandler);
        nextClickHandler = null;
      }
      if (colorSelectHandler && colorSelectEl) {
        colorSelectEl.removeEventListener("change", colorSelectHandler);
        colorSelectHandler = null;
      }
      commentsTabButtonEl?.removeEventListener("click", commentsTabHandler);
      customizeTabButtonEl?.removeEventListener("click", customizeTabHandler);
      paletteApplyButtonEl?.removeEventListener("click", paletteApplyHandler);
      paletteResetButtonEl?.removeEventListener("click", paletteResetHandler);
      if (selectionUnsub) selectionUnsub();
      if (commentsHandler) {
        document.removeEventListener("vibelister:comments-updated", commentsHandler);
        commentsHandler = null;
      }
    },
  };
}
