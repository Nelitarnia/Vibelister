// cleanup-controller.js
// Provides analysis + mutation helpers for removing unreachable notes/comments.

import { buildInteractionsPairs, canonicalSig } from "../data/variants/variants.js";
import { MOD_STATE_ID } from "../data/mod-state.js";
import {
  getInteractionsPair,
  getInteractionsRowCount,
  isInteractionPhaseColumnActiveForRow,
  noteKeyForPair,
} from "./interactions.js";

export const CLEANUP_ACTION_IDS = Object.freeze({
  orphanNotes: "cleanup-orphan-notes",
  orphanEndVariants: "cleanup-end-variants",
  orphanComments: "cleanup-orphan-comments",
  phaseOverflowNotes: "cleanup-phase-overflow-notes",
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
  {
    id: CLEANUP_ACTION_IDS.phaseOverflowNotes,
    label: "Trim notes outside active phases",
    description: "Clear notes/comments outside an action's phase range.",
    kind: "notes",
    defaultSelected: true,
    collect: collectPhaseOverflowNotes,
  },
];

function parsePhaseSuffix(key) {
  const text = String(key || "");
  const match = /^(.*)\|p(\d+)$/.exec(text);
  if (!match) return null;
  return { baseKey: match[1], phase: Number(match[2]) };
}

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

function buildInteractionRowLookup(model) {
  const lookup = new Map();
  const rowCount = getInteractionsRowCount(model) || 0;
  for (let r = 0; r < rowCount; r++) {
    const pair = getInteractionsPair(model, r);
    if (!pair) continue;
    const baseKey = noteKeyForPair(pair, undefined);
    if (baseKey) lookup.set(baseKey, r);
  }
  return lookup;
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
    const inputId = Number(parts[2]);
    const variantSig = canonicalSig(parts[3] || "");
    if (!Number.isFinite(actionId)) return null;
    return { kind: "AI", actionId, inputId, variantSig, baseKey };
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
    const inputId = Number(parts[1]);
    if (!Number.isFinite(actionId)) return null;
    return {
      kind: "LEGACY_AI",
      actionId,
      inputId,
      variantSig: canonicalSig(parts[2] || ""),
      baseKey,
    };
  }
  return null;
}

function parseSigParts(sig) {
  if (!sig) return [];
  return canonicalSig(sig)
    .split("+")
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

function buildBypassLookup(model) {
  const lookup = new Map();
  const actions = Array.isArray(model?.actions) ? model.actions : [];
  for (const action of actions) {
    if (!action || !Number.isFinite(action.id)) continue;
    const set = action.modSet;
    if (!set || typeof set !== "object") continue;
    const bypassIds = [];
    for (const [key, value] of Object.entries(set)) {
      if (Number(value) === MOD_STATE_ID.BYPASS) {
        const modId = Number(key);
        if (Number.isFinite(modId)) bypassIds.push(modId);
      }
    }
    if (bypassIds.length) {
      lookup.set(String(action.id), new Set(bypassIds));
    }
  }
  return lookup;
}

function buildIdSet(rows) {
  const set = new Set();
  if (!Array.isArray(rows)) return set;
  for (const row of rows) {
    const id = Number(row?.id);
    if (Number.isFinite(id)) {
      set.add(String(id));
    }
  }
  return set;
}

function isBypassedVariantSig(lookup, actionId, sig) {
  if (!Number.isFinite(actionId)) return false;
  const set = lookup.get(String(actionId));
  if (!set || !set.size) return false;
  const parts = parseSigParts(sig);
  if (!parts.length) return false;
  for (const part of parts) {
    if (!set.has(part)) return false;
  }
  return true;
}

function noteReferencesBypassedVariant(parsed, ctx) {
  if (!parsed) return false;
  const { bypassLookup, actionIdSet, inputIdSet } = ctx;
  if (!actionIdSet?.has(String(parsed.actionId))) return false;
  if (parsed.kind === "AI") {
    if (!Number.isFinite(parsed.inputId) || !inputIdSet?.has(String(parsed.inputId))) {
      return false;
    }
    return isBypassedVariantSig(bypassLookup, parsed.actionId, parsed.variantSig);
  }
  if (parsed.kind === "LEGACY_AI") {
    if (Number.isFinite(parsed.inputId) && !inputIdSet?.has(String(parsed.inputId))) {
      return false;
    }
    return isBypassedVariantSig(bypassLookup, parsed.actionId, parsed.variantSig);
  }
  if (parsed.kind === "AA") {
    const lhs = isBypassedVariantSig(bypassLookup, parsed.actionId, parsed.variantSig);
    const rhsExists = Number.isFinite(parsed.rhsActionId)
      ? actionIdSet?.has(String(parsed.rhsActionId))
      : false;
    const rhs = rhsExists
      ? isBypassedVariantSig(bypassLookup, parsed.rhsActionId, parsed.rhsVariantSig)
      : false;
    return lhs || rhs;
  }
  return false;
}

function noteHasBypassedMismatch(parsed, validity, bypassLookup) {
  if (!parsed) return false;
  if (parsed.kind === "AI" || parsed.kind === "LEGACY_AI") {
    return (
      !validity.left && isBypassedVariantSig(bypassLookup, parsed.actionId, parsed.variantSig)
    );
  }
  if (parsed.kind === "AA") {
    const leftBypassed =
      !validity.left && isBypassedVariantSig(bypassLookup, parsed.actionId, parsed.variantSig);
    const rightBypassed =
      !validity.right &&
      isBypassedVariantSig(bypassLookup, parsed.rhsActionId, parsed.rhsVariantSig);
    return leftBypassed || rightBypassed;
  }
  return false;
}

function collectOrphanNotes(ctx) {
  const {
    noteEntries,
    validBases,
    variantCatalog,
    invalidNoteKeys,
    includeBypassed,
    bypassLookup,
    actionIdSet,
    inputIdSet,
  } = ctx;
  const skipBypass = !includeBypassed;
  const targets = [];
  for (const [key] of noteEntries) {
    const baseKey = baseKeyOf(key);
    const parsed = parseNoteKey(baseKey);
    if (!baseKey || !validBases.has(baseKey)) {
      if (
        skipBypass &&
        noteReferencesBypassedVariant(parsed, { bypassLookup, actionIdSet, inputIdSet })
      ) {
        continue;
      }
      targets.push(key);
      invalidNoteKeys?.add(key);
      continue;
    }
    if (!parsed) continue;
    let isValid = true;
    let validity = { left: true, right: true };
    if (parsed.kind === "AI" || parsed.kind === "LEGACY_AI") {
      validity.left = hasVariant(variantCatalog, parsed.actionId, parsed.variantSig);
      isValid = validity.left;
    } else if (parsed.kind === "AA") {
      validity.left = hasVariant(variantCatalog, parsed.actionId, parsed.variantSig);
      validity.right = hasVariant(variantCatalog, parsed.rhsActionId, parsed.rhsVariantSig);
      isValid = validity.left && validity.right;
    }
    if (!isValid) {
      if (skipBypass && noteHasBypassedMismatch(parsed, validity, bypassLookup)) {
        continue;
      }
      targets.push(key);
      invalidNoteKeys?.add(key);
    }
  }
  return { targets };
}

function collectOrphanEndVariants(ctx) {
  const {
    noteEntries,
    variantCatalog,
    invalidNoteKeys,
    includeBypassed,
    bypassLookup,
    actionIdSet,
  } = ctx;
  const targets = [];
  const skipBypass = !includeBypassed;
  for (const [key, note] of noteEntries) {
    if (invalidNoteKeys?.has(key)) continue;
    if (!note || typeof note !== "object") continue;
    const actionId = Number(note.endActionId);
    if (!Number.isFinite(actionId)) continue;
    if (!actionIdSet?.has(String(actionId))) {
      targets.push(key);
      invalidNoteKeys?.add(key);
      continue;
    }
    const sig = canonicalSig(note.endVariantSig || "");
    if (hasVariant(variantCatalog, actionId, sig)) continue;
    if (skipBypass && isBypassedVariantSig(bypassLookup, actionId, sig)) {
      continue;
    }
    targets.push(key);
    invalidNoteKeys?.add(key);
  }
  return { targets };
}

function collectOrphanComments(ctx) {
  const {
    model,
    validBases,
    includeBypassed,
    bypassLookup,
    actionIdSet,
    inputIdSet,
  } = ctx;
  const targets = [];
  const store = model?.comments?.interactions;
  if (!store || typeof store !== "object") return { targets };
  const skipBypass = !includeBypassed;
  for (const rowId of Object.keys(store)) {
    const key = String(rowId);
    const baseKey = baseKeyOf(key);
    if (baseKey && validBases.has(baseKey)) {
      continue;
    }
    if (skipBypass) {
      const parsed = parseNoteKey(baseKey);
      if (
        noteReferencesBypassedVariant(parsed, {
          bypassLookup,
          actionIdSet,
          inputIdSet,
        })
      ) {
        continue;
      }
    }
    targets.push(key);
  }
  return { targets };
}

function hasPhaseField(note) {
  if (!note || typeof note !== "object") return false;
  return (
    Object.prototype.hasOwnProperty.call(note, "outcomeId") ||
    Object.prototype.hasOwnProperty.call(note, "result") ||
    Object.prototype.hasOwnProperty.call(note, "endActionId") ||
    Object.prototype.hasOwnProperty.call(note, "endVariantSig") ||
    Object.prototype.hasOwnProperty.call(note, "tags")
  );
}

function isPhaseAllowedForNote(model, parsed, phase, lookup) {
  if (!Number.isFinite(phase)) return true;
  const actions = Array.isArray(model?.actions) ? model.actions : [];
  const action = actions.find((row) => row && row.id === parsed?.actionId);
  const ids = action?.phases?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return true;
  if (ids.includes(phase)) return true;
  const rowIndex = lookup?.get(parsed?.baseKey);
  if (!Number.isInteger(rowIndex)) return false;
  const column = { key: `p${phase}:outcome` };
  const viewDef = { columns: [column] };
  return isInteractionPhaseColumnActiveForRow(model, viewDef, rowIndex, 0, column);
}

function collectPhaseOverflowNotes(ctx) {
  const {
    model,
    noteEntries,
    invalidNoteKeys,
    includeBypassed,
    bypassLookup,
    actionIdSet,
    inputIdSet,
    phaseRowLookup,
  } = ctx;
  const targets = [];
  const commentTargets = [];
  const skipBypass = !includeBypassed;
  const interactionComments = model?.comments?.interactions;
  const entries = new Map(noteEntries);
  const commentKeys = interactionComments ? Object.keys(interactionComments) : [];
  for (const key of commentKeys) {
    if (!entries.has(key)) entries.set(key, undefined);
  }

  for (const [key, note] of entries.entries()) {
    const info = parsePhaseSuffix(key);
    if (!info) continue;

    const hasComment = interactionComments
      ? Object.prototype.hasOwnProperty.call(interactionComments, key)
      : false;
    if (!hasPhaseField(note) && !hasComment) continue;

    const parsed = parseNoteKey(info.baseKey);
    if (!parsed) continue;
    if (skipBypass) {
      if (
        noteReferencesBypassedVariant(parsed, {
          bypassLookup,
          actionIdSet,
          inputIdSet,
        })
      ) {
        continue;
      }
    }
    if (isPhaseAllowedForNote(model, parsed, info.phase, phaseRowLookup)) {
      continue;
    }

    const alreadyInvalid = invalidNoteKeys?.has(key);
    if (!alreadyInvalid && hasPhaseField(note)) {
      targets.push(key);
      invalidNoteKeys?.add(key);
    }
    if (hasComment) {
      commentTargets.push(key);
    }
  }
  return { targets, commentTargets };
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
    const targets = Array.isArray(entry.targets) ? entry.targets : [];
    const commentTargets = Array.isArray(entry.commentTargets)
      ? entry.commentTargets
      : [];
    const { def } = entry;
    let removed = 0;
    if (def.kind === "notes") {
      if (!notes) {
        removedById.set(def.id, 0);
      } else {
        for (const key of targets) {
          if (Object.prototype.hasOwnProperty.call(notes, key)) {
            delete notes[key];
            removed++;
          }
        }
      }
      removedNotes += removed;
    } else if (def.kind === "comments") {
      const rows = commentStore?.interactions;
      if (!rows || typeof rows !== "object") {
        removedById.set(def.id, 0);
      } else {
        for (const rowId of targets) {
          if (Object.prototype.hasOwnProperty.call(rows, rowId)) {
            delete rows[rowId];
            removed++;
          }
        }
      }
      removedComments += removed;
    }

    if (commentTargets.length) {
      const rows = commentStore?.interactions;
      if (rows && typeof rows === "object") {
        for (const rowId of commentTargets) {
          if (Object.prototype.hasOwnProperty.call(rows, rowId)) {
            delete rows[rowId];
            removedComments++;
            removed++;
          }
        }
      }
    }

    removedById.set(def.id, removed);
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
    const candidates = Number(entry.candidates) || 0;
    const removed = apply
      ? removedLookup instanceof Map
        ? removedLookup.get(entry.def.id) || 0
        : 0
      : 0;
    perAction.push({
      id: entry.def.id,
      label: entry.def.label,
      kind: entry.def.kind,
      candidates,
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

function collectTargets(model, selectedActions, options = {}) {
  if (!selectedActions.length) return { actions: [], totalCandidates: 0 };
  buildInteractionsPairs(model);
  const variantCatalog = buildVariantCatalogMap(model);
  const validBases = collectValidBaseKeys(model);
  const notes = model?.notes && typeof model.notes === "object" ? model.notes : {};
  const noteEntries = Object.entries(notes);
  const bypassLookup = buildBypassLookup(model);
  const actionIdSet = buildIdSet(model?.actions);
  const inputIdSet = buildIdSet(model?.inputs);
  const phaseRowLookup = buildInteractionRowLookup(model);
  const ctx = {
    model,
    variantCatalog,
    validBases,
    noteEntries,
    invalidNoteKeys: new Set(),
    includeBypassed: !!options.includeBypassed,
    bypassLookup,
    actionIdSet,
    inputIdSet,
    phaseRowLookup,
  };
  const actions = [];
  let totalCandidates = 0;
  for (const action of selectedActions) {
    const collector = action.collect;
    if (typeof collector !== "function") continue;
    const result = collector(ctx) || { targets: [] };
    const rawTargets = Array.isArray(result.targets)
      ? result.targets.map((key) => String(key))
      : [];
    const rawComments = Array.isArray(result.commentTargets)
      ? result.commentTargets.map((key) => String(key))
      : [];
    const targets = action.kind === "comments" ? [] : rawTargets;
    const commentTargets =
      action.kind === "comments" ? rawTargets : rawComments;
    const candidates = targets.length + commentTargets.length;
    actions.push({ def: action, targets, commentTargets, candidates });
    totalCandidates += candidates;
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

  function runCleanup({ actionIds = [], apply = false, includeBypassed = false } = {}) {
    const ids = Array.isArray(actionIds)
      ? new Set(actionIds.filter((id) => typeof id === "string"))
      : new Set();
    const selectedActions = CLEANUP_ACTIONS.filter((action) => ids.has(action.id));
    if (!selectedActions.length) {
      return formatRunResult({ actions: [], totalCandidates: 0 }, null, { apply });
    }
    const analysis = collectTargets(model, selectedActions, { includeBypassed });
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
