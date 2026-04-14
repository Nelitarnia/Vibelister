import {
  DEFAULT_OUTCOMES,
  DEFAULT_OUTCOME_COLORS,
  DEFAULT_OUTCOME_NOTES,
  DEFAULT_OUTCOME_MIRRORED,
  DEFAULT_OUTCOME_DUAL_OF,
} from "../data/constants.js";
import { makeRow } from "../data/rows.js";
import { createEmptyCommentMap } from "../data/comments.js";
import { snapshotModel } from "../data/mutation-runner.js";
import { buildInteractionsPairs } from "../data/variants/variants.js";
import {
  DEFAULT_INTERACTION_CONFIDENCE,
  DEFAULT_INTERACTION_SOURCE,
  normalizeInteractionConfidence,
  normalizeInteractionSource,
} from "./interactions.js";
import { createDefaultMeta } from "./model-init.js";
import {
  createInferenceProfileStore,
  resetInferenceProfiles,
} from "./inference-profiles.js";
import { runProjectMigrationsInPlace } from "../data/migrations/index.js";

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

  function clearBypassIndexArtifacts(target) {
    if (!target || typeof target !== "object") return;
    delete target.interactionsIndexBypass;
    delete target.interactionsIndexBypassScoped;
    delete target.interactionsIndexBypassCache;
    delete target.interactionsIndexBypassScopedCache;
    delete target.interactionsIndexCache;
    delete target.interactionsIndexScopedCache;
  }

  function normalizeInferenceProfileStore(store) {
    if (
      store &&
      typeof store === "object" &&
      store.modifierProfiles instanceof Map &&
      store.inputProfiles instanceof Map
    ) {
      if (!Number.isFinite(store.decayBudget)) store.decayBudget = 0;
      return store;
    }
    return createInferenceProfileStore();
  }

  function stripDefaultInteractionMetadata(note) {
    if (!note || typeof note !== "object") return;
    const hasConfidence = Object.prototype.hasOwnProperty.call(
      note,
      "confidence",
    );
    const hasSource = Object.prototype.hasOwnProperty.call(note, "source");
    if (hasConfidence) {
      const conf = normalizeInteractionConfidence(note.confidence);
      if (conf !== DEFAULT_INTERACTION_CONFIDENCE) note.confidence = conf;
      else delete note.confidence;
    }
    if (hasSource) {
      const src = normalizeInteractionSource(note.source);
      if (src !== DEFAULT_INTERACTION_SOURCE) note.source = src;
      else delete note.source;
    }
  }

  function stripDefaultInteractionMetadataFromNotes(notes) {
    if (!notes || typeof notes !== "object") return;
    for (const note of Object.values(notes)) {
      stripDefaultInteractionMetadata(note);
    }
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
      const seededRows = [];
      for (const name of DEFAULT_OUTCOMES) {
        const { color = "", color2 = "" } = DEFAULT_OUTCOME_COLORS[name] || {};
        const notes = DEFAULT_OUTCOME_NOTES[name] || "";
        const mirrored = !!DEFAULT_OUTCOME_MIRRORED[name];
        model.outcomes.push({
          id: model.nextId++,
          name,
          color,
          color2,
          notes,
          mirrored,
          dualof: null,
        });
        seededRows.push(model.outcomes[model.outcomes.length - 1]);
      }
      for (const row of seededRows) {
        const dualName = DEFAULT_OUTCOME_DUAL_OF[row.name];
        if (!dualName) continue;
        const target = seededRows.find(
          (candidate) => candidate.name === dualName,
        );
        if (target) row.dualof = target.id;
      }
    }
    ensureMinRows(model.outcomes, Math.max(DEFAULT_OUTCOMES.length + 10, 20));
  }

  function rowHasModStateData(row) {
    if (!row || typeof row.modSet !== "object" || !row.modSet) return false;
    for (const key in row.modSet) {
      if (Object.prototype.hasOwnProperty.call(row.modSet, key)) {
        return true;
      }
    }
    return false;
  }

  function hasAuthoredContent(row) {
    if (!row) return false;
    if (typeof row.name === "string" && row.name.trim()) return true;
    if (typeof row.color === "string" && row.color.trim()) return true;
    if (typeof row.color2 === "string" && row.color2.trim()) return true;
    if (Array.isArray(row.properties) && row.properties.length) return true;
    if (typeof row.notes === "string" && row.notes.trim()) return true;
    if (rowHasModStateData(row)) return true;
    return false;
  }

  function trimTrailingEmptyRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    while (rows.length && !hasAuthoredContent(rows[rows.length - 1])) {
      rows.pop();
    }
  }

  function countNamedRows(rows) {
    return (rows || []).filter((row) => row && (row.name || "").trim().length)
      .length;
  }

  function upgradeModelInPlace(o) {
    runProjectMigrationsInPlace(o);
    o.inferenceProfiles = normalizeInferenceProfileStore(o.inferenceProfiles);
  }

  function newProject() {
    clearBypassIndexArtifacts(model);
    Object.assign(model, {
      meta: createDefaultMeta(),
      actions: [],
      inputs: [],
      modifiers: [],
      outcomes: [],
      modifierGroups: [],
      modifierConstraints: [],
      notes: {},
      comments: createEmptyCommentMap(),
      interactionsPairs: [],
      interactionsIndex: { mode: "AI", groups: [], propertiesCatalog: [] },
      nextId: 1,
    });
    clearHistory();
    resetAllViewState();
    if (sel) {
      sel.r = 0;
      sel.c = 0;
    }
    ensureSeedRows();
    buildInteractionsPairs(model);
    setActiveView("actions");
    updateProjectNameWidget();
    statusBar?.set("New project created (Actions view).");
    onModelReset?.();
  }

  async function openFromDisk() {
    closeMenus?.();
    try {
      const m = await getFsModule();
      const inferenceProfiles = normalizeInferenceProfileStore(
        model?.inferenceProfiles,
      );
      const { data, name } = await m.openJson();
      upgradeModelInPlace(data);
      data.inferenceProfiles = inferenceProfiles;
      clearBypassIndexArtifacts(data);
      clearBypassIndexArtifacts(model);
      Object.assign(model, data);
      resetInferenceProfiles(inferenceProfiles);
      clearHistory();
      ensureSeedRows();
      buildInteractionsPairs(model);
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
      const errorMessage = e instanceof Error ? e.message : String(e);
      statusBar?.set("Open failed: " + errorMessage);
    }
  }

  async function saveToDisk(as = false) {
    closeMenus?.();
    try {
      const m = await getFsModule();
      const snapshot = snapshotModel(model, { includeDerived: false });
      stripDefaultInteractionMetadataFromNotes(snapshot.model.notes);
      trimTrailingEmptyRows(snapshot.model.actions);
      trimTrailingEmptyRows(snapshot.model.inputs);
      trimTrailingEmptyRows(snapshot.model.modifiers);
      trimTrailingEmptyRows(snapshot.model.outcomes);
      const { name } = await m.saveJson(snapshot.model, {
        as,
        suggestedName: getSuggestedName(),
      });
      statusBar?.set(as ? `Saved As: ${name}` : `Saved: ${name}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      statusBar?.set("Save failed: " + errorMessage);
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
