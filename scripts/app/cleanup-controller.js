// cleanup-controller.js
// Provides analysis + mutation helpers for removing unreachable notes/comments.

import { buildInteractionsPairs, canonicalSig } from "../data/variants/variants.js";
import {
  getInteractionsPair,
  getInteractionsRowCount,
  noteKeyForPair,
} from "./interactions.js";

export const CLEANUP_ACTION_IDS = Object.freeze({
  orphanNotes: "cleanup-orphan-notes",
  orphanEndVariants: "cleanup-end-variants",
  orphanComments: "cleanup-orphan-comments",
});

const CLEANUP_ACTIONS = [
  {
    id: CLEANUP_ACTION_IDS.orphanNotes,
    label: "Remove unreachable notes",
    description: "Delete notes for interactions or variants that no longer exist.",
    kind: "notes",
    defaultSelected: true,
    collect: collectOrphanNotes,
  },
  {
    id: CLEANUP_ACTION_IDS.orphanEndVariants,
    label: "Remove invalid end references",
    description: "Drop notes whose end-action variant references are no longer valid.",
    kind: "notes",
    defaultSelected: true,
    collect: collectOrphanEndVariants,
  },
  {
    id: CLEANUP_ACTION_IDS.orphanComments,
    label: "Prune orphaned interaction comments",
    description: "Remove comments that target interactions which no longer exist.",
    kind: "comments",
    defaultSelected: true,
    collect: collectOrphanComments,
  },
];

function baseKeyOf(key) {
  const text = String(key || "");
  const index = text.indexOf("|p");
  return index >= 0 ? text.slice(0, index) : text;
}

function buildVariantCatalogMap(model) {
  const catalog = new Map();
  const raw = model?.interactionsIndex?.variantCatalog;
  if (!raw || typeof raw !== "object") return catalog;
  for (const [actionId, variants] of Object.entries(raw)) {
    const key = String(actionId);
    const list = Array.isArray(variants) ? variants : [];
    const set = new Set();
    for (const sig of list) {
      set.add(canonicalSig(sig || ""));
    }
    catalog.set(key, set);
  }
  return catalog;
}

function hasVariant(catalog, actionId, sig) {
  if (!Number.isFinite(actionId)) return false;
  const set = catalog.get(String(actionId));
  if (!set || !set.size) return false;
  return set.has(canonicalSig(sig || ""));
}

function collectValidBaseKeys(model) {
  const valid = new Set();
  const rowCount = getInteractionsRowCount(model) || 0;
  for (let r = 0; r < rowCount; r++) {
    const pair = getInteractionsPair(model, r);
    if (!pair) continue;
    try {
      const base = noteKeyForPair(pair, undefined);
      if (base) valid.add(base);
      const kind = String(pair.kind || "AI").toUpperCase();
      const sigA = canonicalSig(pair.variantSig || "");
      if (kind === "AI") {
        valid.add(`${pair.aId}|${pair.iId}|${sigA}`);
      } else if (kind === "AA") {
        const sigB = canonicalSig(pair.rhsVariantSig || "");
        valid.add(`aa|${pair.aId}|${pair.rhsActionId}|${sigA}|${sigB}`);
        const lo = Math.min(Number(pair.aId), Number(pair.rhsActionId));
        const hi = Math.max(Number(pair.aId), Number(pair.rhsActionId));
        valid.add(`aa|${lo}|${hi}|${sigA}`);
      }
    } catch (_error) {
      /* skip malformed pairs */
    }
  }
  return valid;
}

function parseNoteKey(baseKey) {
  if (!baseKey) return null;
  const parts = String(baseKey).split("|");
  if (parts.length < 3) return null;
  const prefix = parts[0].toLowerCase();
  if (prefix === "ai" && parts.length >= 4) {
    const actionId = Number(parts[1]);
    const variantSig = canonicalSig(parts[3] || "");
    if (!Number.isFinite(actionId)) return null;
    return { kind: "AI", actionId, variantSig, baseKey };
  }
  if (prefix === "aa" && parts.length >= 5) {
    const lhsId = Number(parts[1]);
    const rhsId = Number(parts[2]);
    if (!Number.isFinite(lhsId) || !Number.isFinite(rhsId)) return null;
    return {
      kind: "AA",
      actionId: lhsId,
      rhsActionId: rhsId,
      variantSig: canonicalSig(parts[3] || ""),
      rhsVariantSig: canonicalSig(parts[4] || ""),
      baseKey,
    };
  }
  if (Number.isFinite(Number(prefix)) && parts.length === 3) {
    const actionId = Number(parts[0]);
    if (!Number.isFinite(actionId)) return null;
    return { kind: "LEGACY_AI", actionId, variantSig: canonicalSig(parts[2] || ""), baseKey };
  }
  return null;
}

function collectOrphanNotes(ctx) {
  const { noteEntries, validBases, variantCatalog, invalidNoteKeys } = ctx;
  const targets = [];
  for (const [key] of noteEntries) {
    const baseKey = baseKeyOf(key);
    if (!baseKey || !validBases.has(baseKey)) {
      targets.push(key);
      invalidNoteKeys?.add(key);
      continue;
    }
    const parsed = parseNoteKey(baseKey);
    if (!parsed) continue;
    let isValid = true;
    if (parsed.kind === "AI" || parsed.kind === "LEGACY_AI") {
      isValid = hasVariant(variantCatalog, parsed.actionId, parsed.variantSig);
    } else if (parsed.kind === "AA") {
      isValid =
        hasVariant(variantCatalog, parsed.actionId, parsed.variantSig) &&
        hasVariant(variantCatalog, parsed.rhsActionId, parsed.rhsVariantSig);
    }
    if (!isValid) {
      targets.push(key);
      invalidNoteKeys?.add(key);
    }
  }
  return { targets };
}

function collectOrphanEndVariants(ctx) {
  const { noteEntries, variantCatalog, invalidNoteKeys } = ctx;
  const targets = [];
  for (const [key, note] of noteEntries) {
    if (invalidNoteKeys?.has(key)) continue;
    if (!note || typeof note !== "object") continue;
    const actionId = Number(note.endActionId);
    if (!Number.isFinite(actionId)) continue;
    const sig = canonicalSig(note.endVariantSig || "");
    if (hasVariant(variantCatalog, actionId, sig)) continue;
    targets.push(key);
    invalidNoteKeys?.add(key);
  }
  return { targets };
}

function collectOrphanComments(ctx) {
  const { model, validBases } = ctx;
  const targets = [];
  const store = model?.comments?.interactions;
  if (!store || typeof store !== "object") return { targets };
  for (const rowId of Object.keys(store)) {
    if (!validBases.has(String(rowId))) {
      targets.push(String(rowId));
    }
  }
  return { targets };
}

function applyTargets(model, analysis) {
  const removedById = new Map();
  let removedNotes = 0;
  let removedComments = 0;
  const notes = model?.notes && typeof model.notes === "object" ? model.notes : null;
  const commentStore =
    model?.comments && typeof model.comments === "object"
      ? model.comments
      : null;

  for (const entry of analysis.actions) {
    const { def, targets } = entry;
    if (def.kind === "notes") {
      if (!notes) {
        removedById.set(def.id, 0);
        continue;
      }
      let removed = 0;
      for (const key of targets) {
        if (Object.prototype.hasOwnProperty.call(notes, key)) {
          delete notes[key];
          removed++;
        }
      }
      removedNotes += removed;
      removedById.set(def.id, removed);
    } else if (def.kind === "comments") {
      const rows = commentStore?.interactions;
      if (!rows || typeof rows !== "object") {
        removedById.set(def.id, 0);
        continue;
      }
      let removed = 0;
      for (const rowId of targets) {
        if (Object.prototype.hasOwnProperty.call(rows, rowId)) {
          delete rows[rowId];
          removed++;
        }
      }
      removedComments += removed;
      removedById.set(def.id, removed);
    }
  }

  return {
    removedNotes,
    removedComments,
    removedTotal: removedNotes + removedComments,
    removedById,
  };
}

function formatCount(value, singular, plural = `${singular}s`) {
  const count = Number(value) || 0;
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatStatusMessage(result) {
  const total = result?.removedTotal || 0;
  return total
    ? `Cleanup removed ${formatCount(total, "entry", "entries")}.`
    : "Cleanup found no changes to apply.";
}

function formatRunResult(analysis, applyResult, { apply } = {}) {
  const safeAnalysis = analysis || { actions: [], totalCandidates: 0 };
  const perAction = [];
  const removedLookup = applyResult?.removedById;
  for (const entry of safeAnalysis.actions) {
    const removed = apply
      ? removedLookup instanceof Map
        ? removedLookup.get(entry.def.id) || 0
        : 0
      : 0;
    perAction.push({
      id: entry.def.id,
      label: entry.def.label,
      kind: entry.def.kind,
      candidates: entry.targets.length,
      removed,
    });
  }
  const totalCandidates = safeAnalysis.totalCandidates || 0;
  const totalRemoved = apply ? applyResult?.removedTotal || 0 : 0;
  const message = apply
    ? formatStatusMessage(applyResult)
    : totalCandidates
    ? `Found ${formatCount(totalCandidates, "issue", "issues")} to clean up.`
    : "No cleanup issues detected.";
  return {
    applied: !!apply,
    totalCandidates,
    totalRemoved,
    perAction,
    message,
  };
}

function collectTargets(model, selectedActions) {
  if (!selectedActions.length) return { actions: [], totalCandidates: 0 };
  buildInteractionsPairs(model);
  const variantCatalog = buildVariantCatalogMap(model);
  const validBases = collectValidBaseKeys(model);
  const notes = model?.notes && typeof model.notes === "object" ? model.notes : {};
  const noteEntries = Object.entries(notes);
  const ctx = {
    model,
    variantCatalog,
    validBases,
    noteEntries,
    invalidNoteKeys: new Set(),
  };
  const actions = [];
  let totalCandidates = 0;
  for (const action of selectedActions) {
    const collector = action.collect;
    if (typeof collector !== "function") continue;
    const result = collector(ctx) || { targets: [] };
    const targets = Array.isArray(result.targets)
      ? result.targets.map((key) => String(key))
      : [];
    actions.push({ def: action, targets });
    totalCandidates += targets.length;
  }
  return { actions, totalCandidates };
}

export function createCleanupController(options = {}) {
  const { model, runModelMutation, makeUndoConfig, statusBar } = options;

  function getCleanupActions() {
    return CLEANUP_ACTIONS.map((action) => ({
      id: action.id,
      label: action.label,
      description: action.description,
      kind: action.kind,
      defaultSelected: action.defaultSelected !== false,
    }));
  }

  function runCleanup({ actionIds = [], apply = false } = {}) {
    const ids = Array.isArray(actionIds)
      ? new Set(actionIds.filter((id) => typeof id === "string"))
      : new Set();
    const selectedActions = CLEANUP_ACTIONS.filter((action) => ids.has(action.id));
    if (!selectedActions.length) {
      return formatRunResult({ actions: [], totalCandidates: 0 }, null, { apply });
    }
    const analysis = collectTargets(model, selectedActions);
    if (!apply) {
      return formatRunResult(analysis, null, { apply: false });
    }

    const undoOptions = makeUndoConfig
      ? makeUndoConfig({
          label: "Cleanup",
          includeLocation: false,
          includeColumn: false,
          shouldRecord: (res) => (res?.removedTotal || 0) > 0,
        })
      : {
          label: "Cleanup",
          includeLocation: false,
          includeColumn: false,
          shouldRecord: (res) => (res?.removedTotal || 0) > 0,
        };

    if (typeof runModelMutation === "function") {
      const mutationResult = runModelMutation("Cleanup", () => applyTargets(model, analysis), {
        undo: undoOptions,
        shouldRecord: (res) => (res?.removedTotal || 0) > 0,
        status: formatStatusMessage,
      });
      return formatRunResult(analysis, mutationResult, { apply: true });
    }

    const result = applyTargets(model, analysis);
    statusBar?.set?.(formatStatusMessage(result));
    return formatRunResult(analysis, result, { apply: true });
  }

  async function openCleanupDialog() {
    try {
      const mod = await import("../ui/cleanup-dialog.js");
      await mod.openCleanupDialog({
        actions: getCleanupActions(),
        onRun: (payload) => runCleanup(payload),
      });
    } catch (error) {
      statusBar?.set?.(`Open cleanup failed: ${error?.message || error}`);
    }
  }

  return {
    openCleanupDialog,
    runCleanup,
    getCleanupActions,
  };
}
