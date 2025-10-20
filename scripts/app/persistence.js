import { DEFAULT_OUTCOMES, MOD, SCHEMA_VERSION } from "../data/constants.js";
import { makeRow } from "../data/rows.js";

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
}) {
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
        model.outcomes.push({
          id: model.nextId++,
          name,
          color: "",
          color2: "",
          notes: "",
        });
      }
    }
    ensureMinRows(model.outcomes, Math.max(DEFAULT_OUTCOMES.length + 10, 20));
  }

  function upgradeModelInPlace(o) {
    if (!o.meta) o.meta = { schema: 0, projectName: "", interactionsMode: "AI" };
    if (typeof o.meta.projectName !== "string") o.meta.projectName = "";
    if (
      !("interactionsMode" in o.meta) ||
      (o.meta.interactionsMode !== "AI" && o.meta.interactionsMode !== "AA")
    ) {
      o.meta.interactionsMode = "AI";
    }
    if (!Array.isArray(o.actions)) o.actions = [];
    if (!Array.isArray(o.inputs)) o.inputs = [];
    if (!Array.isArray(o.modifiers)) o.modifiers = [];
    if (!Array.isArray(o.outcomes)) o.outcomes = [];
    if (!Array.isArray(o.modifierGroups)) o.modifierGroups = [];
    if (!Array.isArray(o.modifierConstraints)) o.modifierConstraints = [];
    if (!o.notes || typeof o.notes !== "object") o.notes = {};
    if (!Array.isArray(o.interactionsPairs)) o.interactionsPairs = [];
    let maxId = 0;
    for (const r of o.actions) {
      if (typeof r.id !== "number") r.id = ++maxId;
      else maxId = Math.max(maxId, r.id);
      if (!r.modSet || typeof r.modSet !== "object") r.modSet = {};
      for (const k in r.modSet) {
        const v = r.modSet[k];
        if (v === true) r.modSet[k] = MOD.ON;
        else if (v === false || v == null) r.modSet[k] = MOD.OFF;
        else if (typeof v === "number") r.modSet[k] = Math.max(0, Math.min(2, v | 0));
        else r.modSet[k] = MOD.OFF;
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
      meta: { schema: SCHEMA_VERSION, projectName: "", interactionsMode: "AI" },
      actions: [],
      inputs: [],
      modifiers: [],
      outcomes: [],
      modifierGroups: [],
      modifierConstraints: [],
      notes: {},
      interactionsPairs: [],
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
  }

  async function openFromDisk() {
    closeMenus?.();
    try {
      const m = await import("../data/fs.js");
      const { data, name } = await m.openJson();
      upgradeModelInPlace(data);
      Object.assign(model, data);
      clearHistory();
      ensureSeedRows();
      resetAllViewState();
      setActiveView("actions");
      setProjectNameFromFile(name);
      statusBar?.set(
        `Opened: ${name} (${model.actions.length} actions, ${model.inputs.length} inputs)`,
      );
    } catch (e) {
      statusBar?.set("Open failed: " + (e?.message || e));
    }
  }

  async function saveToDisk(as = false) {
    closeMenus?.();
    try {
      const m = await import("../data/fs.js");
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
