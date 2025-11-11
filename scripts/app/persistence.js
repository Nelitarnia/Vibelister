import {
  DEFAULT_OUTCOMES,
  DEFAULT_OUTCOME_COLORS,
  MOD,
  SCHEMA_VERSION,
} from "../data/constants.js";
import {
  enumerateModStates,
  MOD_STATE_BOOLEAN_TRUE_NAME,
  MOD_STATE_DEFAULT_VALUE,
  MOD_STATE_MAX_VALUE,
  MOD_STATE_MIN_VALUE,
} from "../data/mod-state.js";
import { makeRow } from "../data/rows.js";
import {
  createEmptyCommentMap,
  normalizeCommentsMap,
} from "../data/comments.js";

export function createPersistenceController({
  model,
  statusBar,
  clearHistory,
  resetAllViewState,
  setActiveView,
  sel,
  updateProjectNameWidget,
  setProjectNameFromFile,
  getSuggestedName,
  closeMenus,
  onModelReset,
  loadFsModule = () => import("../data/fs.js"),
}) {
  let fsModulePromise = null;

  const DEFAULT_MOD_RUNTIME = enumerateModStates(MOD);
  const DEFAULT_MOD_TRUE_VALUE =
    DEFAULT_MOD_RUNTIME.states.find(
      (state) => state.name === MOD_STATE_BOOLEAN_TRUE_NAME,
    )?.value ?? MOD_STATE_DEFAULT_VALUE;
  const DEFAULT_MOD_FALLBACK = DEFAULT_MOD_RUNTIME.defaultState.value;
  const DEFAULT_MOD_VALUE_TO_STATE = DEFAULT_MOD_RUNTIME.valueToState;

  function sanitizeModValue(raw) {
    if (raw === true) return DEFAULT_MOD_TRUE_VALUE;
    if (raw === false || raw == null) return DEFAULT_MOD_FALLBACK;
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (!trimmed) return DEFAULT_MOD_FALLBACK;
      for (const state of DEFAULT_MOD_RUNTIME.states) {
        if (state.glyphs.includes(trimmed)) return state.value;
      }
      const lower = trimmed.toLowerCase();
      for (const state of DEFAULT_MOD_RUNTIME.states) {
        if (state.tokens.includes(lower) || state.keywords.includes(lower))
          return state.value;
      }
      const asNumber = Number(trimmed);
      if (Number.isFinite(asNumber)) raw = asNumber;
      else return DEFAULT_MOD_FALLBACK;
    }
    if (typeof raw === "number") {
      const num = Math.trunc(raw);
      if (num < MOD_STATE_MIN_VALUE || num > MOD_STATE_MAX_VALUE) {
        return DEFAULT_MOD_FALLBACK;
      }
      if (DEFAULT_MOD_VALUE_TO_STATE.has(num)) return num;
    }
    return DEFAULT_MOD_FALLBACK;
  }

  function normalizeProjectInfo(value) {
    if (value == null) return "";
    const text = String(value);
    return text.replace(/\r\n?/g, "\n");
  }

  function getFsModule() {
    if (!fsModulePromise) {
      fsModulePromise = Promise.resolve()
        .then(() => loadFsModule())
        .catch((err) => {
          fsModulePromise = null;
          throw err;
        });
    }
    return fsModulePromise;
  }

  function ensureMinRows(arr, n) {
    while (arr.length < n) arr.push(makeRow(model));
  }

  function ensureSeedRows() {
    const N = 20;
    ensureMinRows(model.actions, N);
    ensureMinRows(model.inputs, N);
    ensureMinRows(model.modifiers, N);
    if (!model.outcomes || !model.outcomes.length) {
      for (const name of DEFAULT_OUTCOMES) {
        const { color = "", color2 = "" } = DEFAULT_OUTCOME_COLORS[name] || {};
        model.outcomes.push({
          id: model.nextId++,
          name,
          color,
          color2,
          notes: "",
        });
      }
    }
    ensureMinRows(model.outcomes, Math.max(DEFAULT_OUTCOMES.length + 10, 20));
  }

  function countNamedRows(rows) {
    return (rows || []).filter((row) => row && (row.name || "").trim().length).length;
  }

  function upgradeModelInPlace(o) {
    if (!o.meta)
      o.meta = { schema: 0, projectName: "", interactionsMode: "AI", columnWidths: {} };
    if (typeof o.meta.projectName !== "string") o.meta.projectName = "";
    o.meta.projectInfo = normalizeProjectInfo(o.meta.projectInfo);
    if (
      !("interactionsMode" in o.meta) ||
      (o.meta.interactionsMode !== "AI" && o.meta.interactionsMode !== "AA")
    ) {
      o.meta.interactionsMode = "AI";
    }
    if (!o.meta.columnWidths || typeof o.meta.columnWidths !== "object") {
      o.meta.columnWidths = {};
    } else {
      const cleaned = {};
      for (const [key, value] of Object.entries(o.meta.columnWidths)) {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) cleaned[key] = num;
      }
      o.meta.columnWidths = cleaned;
    }
    const normalizeList = (values) => {
      if (!Array.isArray(values) || !values.length) return undefined;
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
      return unique.length ? unique : undefined;
    };
    if (!o.meta.commentFilter || typeof o.meta.commentFilter !== "object") {
      o.meta.commentFilter = {};
    } else {
      const cf = o.meta.commentFilter;
      const normalized = {};
      if (typeof cf.viewKey === "string") {
        const trimmed = cf.viewKey.trim();
        if (trimmed) normalized.viewKey = trimmed;
      }
      const rows = normalizeList(cf.rowIds || cf.rows);
      if (rows) normalized.rowIds = rows;
      const columns = normalizeList(cf.columnKeys || cf.columns);
      if (columns) normalized.columnKeys = columns;
      const colors = normalizeList(cf.colorIds || cf.colors || cf.colorId || cf.color);
      if (colors) normalized.colorIds = colors;
      o.meta.commentFilter = normalized;
    }
    if (!Array.isArray(o.actions)) o.actions = [];
    if (!Array.isArray(o.inputs)) o.inputs = [];
    if (!Array.isArray(o.modifiers)) o.modifiers = [];
    if (!Array.isArray(o.outcomes)) o.outcomes = [];
    if (!Array.isArray(o.modifierGroups)) o.modifierGroups = [];
    if (!Array.isArray(o.modifierConstraints)) o.modifierConstraints = [];
    if (!o.notes || typeof o.notes !== "object") o.notes = {};
    o.comments = normalizeCommentsMap(o.comments);
    if (!Array.isArray(o.interactionsPairs)) o.interactionsPairs = [];
    if (!o.interactionsIndex || typeof o.interactionsIndex !== "object") {
      o.interactionsIndex = { mode: "AI", groups: [] };
    } else {
      if (!Array.isArray(o.interactionsIndex.groups))
        o.interactionsIndex.groups = [];
      if (!o.interactionsIndex.mode)
        o.interactionsIndex.mode = "AI";
      const total = Number(o.interactionsIndex.totalRows);
      o.interactionsIndex.totalRows =
        Number.isFinite(total) && total >= 0 ? total : 0;
      if (!Array.isArray(o.interactionsIndex.actionsOrder))
        o.interactionsIndex.actionsOrder = [];
      if (!Array.isArray(o.interactionsIndex.inputsOrder))
        o.interactionsIndex.inputsOrder = [];
      if (
        !o.interactionsIndex.variantCatalog ||
        typeof o.interactionsIndex.variantCatalog !== "object"
      ) {
        o.interactionsIndex.variantCatalog = {};
      }
    }
    let maxId = 0;
    for (const r of o.actions) {
      if (typeof r.id !== "number") r.id = ++maxId;
      else maxId = Math.max(maxId, r.id);
      if (!r.modSet || typeof r.modSet !== "object") r.modSet = {};
      for (const k in r.modSet) {
        r.modSet[k] = sanitizeModValue(r.modSet[k]);
      }
    }
    for (const r of o.inputs) {
      if (typeof r.id !== "number") r.id = ++maxId;
      else maxId = Math.max(maxId, r.id);
    }
    for (const r of o.modifiers) {
      if (typeof r.id !== "number") r.id = ++maxId;
      else maxId = Math.max(maxId, r.id);
    }
    for (const r of o.outcomes) {
      if (typeof r.id !== "number") r.id = ++maxId;
      else maxId = Math.max(maxId, r.id);
    }
    if (!Number.isFinite(o.nextId)) o.nextId = maxId + 1;
    else o.nextId = Math.max(o.nextId, maxId + 1);
    o.meta.schema = SCHEMA_VERSION;
  }

  function newProject() {
    Object.assign(model, {
      meta: {
        schema: SCHEMA_VERSION,
        projectName: "",
        projectInfo: "",
        interactionsMode: "AI",
        columnWidths: {},
        commentFilter: {},
      },
      actions: [],
      inputs: [],
      modifiers: [],
      outcomes: [],
      modifierGroups: [],
      modifierConstraints: [],
      notes: {},
      comments: createEmptyCommentMap(),
      interactionsPairs: [],
      interactionsIndex: { mode: "AI", groups: [] },
      nextId: 1,
    });
    clearHistory();
    resetAllViewState();
    if (sel) {
      sel.r = 0;
      sel.c = 0;
    }
    ensureSeedRows();
    setActiveView("actions");
    updateProjectNameWidget();
    statusBar?.set("New project created (Actions view).");
    onModelReset?.();
  }

  async function openFromDisk() {
    closeMenus?.();
    try {
      const m = await getFsModule();
      const { data, name } = await m.openJson();
      upgradeModelInPlace(data);
      Object.assign(model, data);
      clearHistory();
      ensureSeedRows();
      resetAllViewState();
      setActiveView("actions");
      setProjectNameFromFile(name);
      const actionsCount = countNamedRows(model.actions);
      const inputsCount = countNamedRows(model.inputs);
      statusBar?.set(
        `Opened: ${name} (${actionsCount} actions, ${inputsCount} inputs)`,
      );
      onModelReset?.();
    } catch (e) {
      statusBar?.set("Open failed: " + (e?.message || e));
    }
  }

  async function saveToDisk(as = false) {
    closeMenus?.();
    try {
      const m = await getFsModule();
      const { name } = await m.saveJson(model, {
        as,
        suggestedName: getSuggestedName(),
      });
      statusBar?.set(as ? `Saved As: ${name}` : `Saved: ${name}`);
    } catch (e) {
      statusBar?.set("Save failed: " + (e?.message || e));
    }
  }

  return {
    newProject,
    openFromDisk,
    saveToDisk,
    ensureMinRows,
    ensureSeedRows,
    upgradeModelInPlace,
  };
}
