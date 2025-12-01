import {
  DEFAULT_INTERACTION_CONFIDENCE,
  DEFAULT_INTERACTION_SOURCE,
  applyInteractionMetadata,
  describeInteractionInference,
  normalizeInteractionConfidence,
  normalizeInteractionSource,
  noteKeyForPair,
} from "./interactions.js";
import {
  HEURISTIC_SOURCES,
  DEFAULT_HEURISTIC_THRESHOLDS,
  proposeInteractionInferences,
} from "./inference-heuristics.js";
import {
  captureInferenceProfilesSnapshot,
  extractNoteFieldValue,
  recordProfileImpact,
} from "./inference-profiles.js";
import {
  buildInteractionsPairs,
  buildScopedInteractionsPairs,
} from "../data/variants/variants.js";
import { getInteractionsIndex } from "./interactions-data.js";

const HEURISTIC_LABELS = Object.freeze({
  [HEURISTIC_SOURCES.actionGroup]: "action group similarity",
  [HEURISTIC_SOURCES.modifierPropagation]: "modifier propagation",
  [HEURISTIC_SOURCES.modifierProfile]: "modifier profile",
  [HEURISTIC_SOURCES.inputDefault]: "input default",
  [HEURISTIC_SOURCES.profileTrend]: "modifier/input trends",
  [HEURISTIC_SOURCES.phaseAdjacency]: "phase adjacency",
});
import { parsePhaseKey } from "../data/utils.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";

const DEFAULT_OPTIONS = Object.freeze({
  scope: "selection",
  includeEnd: true,
  includeTag: true,
  inferFromBypassed: false,
  inferToBypassed: false,
  overwriteInferred: true,
  onlyFillEmpty: false,
  skipManualOutcome: false,
});

function hasStructuredValue(note, field) {
  if (!note || typeof note !== "object") return false;
  if (field === "outcome") return "outcomeId" in note || "result" in note;
  if (field === "end")
    return (
      "endActionId" in note || "endVariantSig" in note || "endFree" in note
    );
  if (field === "tag") return Array.isArray(note.tags) && note.tags.length > 0;
  return false;
}

function normalizeOptions(payload = {}) {
  const hasDefaultConfidence = Object.prototype.hasOwnProperty.call(
    payload,
    "defaultConfidence",
  );
  const hasDefaultSource = Object.prototype.hasOwnProperty.call(
    payload,
    "defaultSource",
  );
  return {
    scope: payload.scope || DEFAULT_OPTIONS.scope,
    includeEnd: payload.includeEnd !== false,
    includeTag: payload.includeTag !== false,
    inferFromBypassed: !!payload.inferFromBypassed,
    inferToBypassed: !!payload.inferToBypassed,
    overwriteInferred: payload.overwriteInferred !== false,
    onlyFillEmpty: !!payload.onlyFillEmpty,
    skipManualOutcome: !!payload.skipManualOutcome,
    defaultConfidence: hasDefaultConfidence
      ? normalizeInteractionConfidence(payload.defaultConfidence)
      : null,
    defaultSource: hasDefaultSource
      ? normalizeInteractionSource(payload.defaultSource)
      : null,
    thresholdOverrides:
      payload && typeof payload.thresholdOverrides === "object"
        ? payload.thresholdOverrides
        : null,
  };
}

export function createInferenceController(options) {
  const {
    model,
    selection,
    sel,
    getActiveView,
    viewDef,
    statusBar,
    runModelMutation,
    makeUndoConfig,
    getInteractionsPair,
    getInteractionsRowCount,
    heuristicThresholds,
  } = options;

  const baseThresholds =
    heuristicThresholds || DEFAULT_HEURISTIC_THRESHOLDS || {};
  let lastThresholdOverrides = { ...baseThresholds };
  const OUT_OF_VIEW_STATUS = "Inference only applies to the Interactions view.";
  const NO_TARGETS_STATUS =
    "Select Outcome, End, or Tag cells in the Interactions view to run inference.";
  const BYPASS_INDEX_FIELD = "interactionsIndexBypass";
  const BYPASS_SCOPED_INDEX_FIELD = "interactionsIndexBypassScoped";

  function shouldUseBypassIndex(options) {
    return !!(options?.inferFromBypassed || options?.inferToBypassed);
  }

  function ensureBypassIndex(actionIds) {
    const normalizedIds = Array.isArray(actionIds)
      ? Array.from(
          new Set(
            actionIds
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id)),
          ),
        )
          .sort((a, b) => a - b)
      : [];
    const useFullIndex = normalizedIds.length === 0;
    if (useFullIndex) {
      const existing = getInteractionsIndex(model, { includeBypass: true });
      if (existing) return existing;
      buildInteractionsPairs(model, {
        includeBypass: true,
        targetIndexField: BYPASS_INDEX_FIELD,
      });
      return getInteractionsIndex(model, { includeBypass: true });
    }
    const cacheField = `${BYPASS_SCOPED_INDEX_FIELD}Cache`;
    const cacheKey = normalizedIds.join(",");
    const cache = (() => {
      const existing = model[cacheField];
      if (existing && typeof existing === "object") return existing;
      const created = {};
      model[cacheField] = created;
      return created;
    })();
    const cached = cache[cacheKey];
    if (cached) return cached.index || cached;
    const { index } = buildScopedInteractionsPairs(model, normalizedIds, {
      includeBypass: true,
      targetIndexField: BYPASS_SCOPED_INDEX_FIELD,
      cacheField,
    });
    const nextCached = cache[cacheKey];
    if (nextCached && nextCached.index) return nextCached.index;
    return index || ensureBypassIndex();
  }

  function getBaseIndexAccess() {
    const getPair = (rowIndex) => getInteractionsPair?.(model, rowIndex);
    const getRowCount = () => getInteractionsRowCount?.(model) || 0;
    return { getPair, getRowCount, includeBypass: false };
  }

  function getScopedActionIds(scope, baseRows, baseAccess) {
    if (scope === "project") return null;
    const effectiveBaseAccess = baseAccess || getBaseIndexAccess();
    const rows = baseRows || getRows(scope, effectiveBaseAccess);
    const ids = new Set();
    for (const row of rows) {
      const pair = effectiveBaseAccess.getPair(row);
      if (pair && Number.isFinite(pair.aId)) ids.add(pair.aId);
    }
    return ids.size ? Array.from(ids) : null;
  }

  function buildRowLookup(indexAccess) {
    const lookup = new Map();
    const total = indexAccess.getRowCount();
    for (let i = 0; i < total; i++) {
      const pair = indexAccess.getPair(i);
      if (!pair) continue;
      const key = noteKeyForPair(pair);
      if (!lookup.has(key)) lookup.set(key, []);
      lookup.get(key).push(i);
    }
    return lookup;
  }

  function mapRowsToIndex(rows, sourceAccess, targetAccess) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const targetLookup = buildRowLookup(targetAccess);
    const mapped = new Set();
    for (const row of rows) {
      const pair = sourceAccess.getPair(row);
      if (!pair) continue;
      const key = noteKeyForPair(pair);
      const candidates = targetLookup.get(key);
      if (!Array.isArray(candidates)) continue;
      for (const candidate of candidates) mapped.add(candidate);
    }
    return Array.from(mapped).sort((a, b) => a - b);
  }

  function getIndexAccess(options) {
    const includeBypass = shouldUseBypassIndex(options);
    const baseAccess = getBaseIndexAccess();
    const baseRows = getRows(options.scope, baseAccess);
    if (!includeBypass) {
      return { indexAccess: baseAccess, rows: baseRows };
    }
    const scopedIds = getScopedActionIds(options.scope, baseRows, baseAccess);
    const index = ensureBypassIndex(scopedIds);
    const indexAccess = {
      includeBypass,
      getPair: (rowIndex) =>
        getInteractionsPair?.(model, rowIndex, {
          includeBypass: true,
          index,
        }),
      getRowCount: () =>
        getInteractionsRowCount?.(model, { includeBypass: true, index }) || 0,
    };
    const rows =
      options.scope === "project"
        ? Array.from({ length: indexAccess.getRowCount() }, (_, i) => i)
        : mapRowsToIndex(baseRows, baseAccess, indexAccess);
    return { indexAccess, rows };
  }

  function formatStatus(result, actionLabel) {
    if (!result) return "";
    if (result.status && result.allowed === false) return result.status;
    const applied = Number(result.applied || 0);
    const cleared = Number(result.cleared || 0);
    const skippedManual = Number(result.skippedManual || 0);
    const skippedManualOutcome = Number(result.skippedManualOutcome || 0);
    const skippedExisting = Number(result.skippedExisting || 0);
    const empty = Number(result.empty || 0);
    const actions = [];
    if (applied) actions.push(`${applied} inferred`);
    if (cleared) actions.push(`${cleared} cleared`);
    if (actions.length === 0) {
      if (result.status) return result.status;
      actions.push("No changes");
    }
    const skips = [];
    if (skippedManual) skips.push(`${skippedManual} manual`);
    if (skippedManualOutcome)
      skips.push(`${skippedManualOutcome} manual outcomes`);
    if (skippedExisting) skips.push(`${skippedExisting} existing`);
    if (empty) skips.push(`${empty} empty`);
    const suffix = skips.length ? ` (skipped ${skips.join(", ")})` : "";
    const sourceEntries = Object.entries(result.sources || {})
      .filter(([, count]) => count)
      .map(([key, count]) => `${HEURISTIC_LABELS[key] || key}: ${count}`);
    const sourceText = sourceEntries.length
      ? ` Heuristics — ${sourceEntries.join(", ")}.`
      : "";
    return `${actionLabel || "Inference"}: ${actions.join(", ")}${suffix}.${sourceText}`;
  }

  function getRelevantColumns(def, options, useSelection) {
    const cols = Array.isArray(def?.columns) ? def.columns : [];
    const matches = cols
      .map((col, idx) => ({ col, idx, pk: parsePhaseKey(col.key) }))
      .filter(({ pk }) => {
        if (!pk) return false;
        if (pk.field === "outcome") return true;
        if (pk.field === "end") return !!options.includeEnd;
        if (pk.field === "tag") return !!options.includeTag;
        return false;
      });
    if (!useSelection) return matches;
    if (selection.colsAll) return matches;
    const hasMultiColumnSelection = selection.cols && selection.cols.size > 1;
    if (hasMultiColumnSelection)
      return matches.filter(({ idx }) => selection.cols.has(idx));
    return matches;
  }

  const actionPhaseCache = new Map();
  const actionGroupCache = new Map();

  function getActionRecord(actionId) {
    if (!Number.isFinite(actionId)) return null;
    return Array.isArray(model?.actions)
      ? model.actions.find((x) => x && x.id === actionId)
      : null;
  }

  function getAllowedPhasesForAction(actionId) {
    if (!Number.isFinite(actionId)) return null;
    if (actionPhaseCache.has(actionId)) return actionPhaseCache.get(actionId);
    const action = getActionRecord(actionId);
    const ids = action?.phases?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      actionPhaseCache.set(actionId, null);
      return null;
    }
    const allowed = new Set();
    for (const p of ids) {
      const num = Number(p);
      if (Number.isFinite(num)) allowed.add(num);
    }
    const result = allowed.size ? allowed : null;
    actionPhaseCache.set(actionId, result);
    return result;
  }

  function getActionGroupForAction(actionId) {
    if (!Number.isFinite(actionId)) return "";
    if (actionGroupCache.has(actionId)) return actionGroupCache.get(actionId);
    const action = getActionRecord(actionId);
    const raw = typeof action?.actionGroup === "string" ? action.actionGroup.trim() : "";
    const value = raw || "";
    actionGroupCache.set(actionId, value);
    return value;
  }

  function collectRowsForActionId(actionId, totalRows, getPair) {
    const rows = [];
    for (let i = 0; i < totalRows; i++) {
      const pair = getPair?.(i);
      if (pair && pair.aId === actionId) rows.push(i);
    }
    return rows;
  }

  function collectRowsForActionGroup(targetGroup, totalRows, getPair) {
    const rows = [];
    for (let i = 0; i < totalRows; i++) {
      const pair = getPair?.(i);
      if (!pair) continue;
      const actionGroup = getActionGroupForAction(pair.aId);
      if (actionGroup && actionGroup === targetGroup) rows.push(i);
    }
    return rows;
  }

  function getRows(scope, indexAccess) {
    const totalRows = indexAccess.getRowCount();
    if (scope === "project") {
      return Array.from({ length: totalRows }, (_, i) => i);
    }
    if (scope === "action" || scope === "actionGroup") {
      const activePair = indexAccess.getPair(sel.r);
      if (!activePair) return [];
      const targetId = activePair.aId;
      if (scope === "actionGroup") {
        const group = getActionGroupForAction(targetId);
        if (group) return collectRowsForActionGroup(group, totalRows, indexAccess.getPair);
      }
      return collectRowsForActionId(targetId, totalRows, indexAccess.getPair);
    }
    if (selection.rows && selection.rows.size) {
      return Array.from(selection.rows).sort((a, b) => a - b);
    }
    return [sel.r];
  }

  function collectTargets(scope, options, indexAccess, rows) {
    if (typeof getActiveView === "function" && getActiveView() !== "interactions") {
      return { targets: [], allowed: false, reason: OUT_OF_VIEW_STATUS };
    }
    const def = typeof viewDef === "function" ? viewDef() : viewDef;
    const resolvedRows = Array.isArray(rows) ? rows : getRows(scope, indexAccess);
    const columns = getRelevantColumns(def, options, scope === "selection");
    const targets = [];
    for (const r of resolvedRows) {
      const pair = indexAccess.getPair(r);
      if (!pair) continue;
      const allowedPhases = getAllowedPhasesForAction(pair.aId);
      for (const { pk } of columns) {
        if (!pk) continue;
        if (allowedPhases && !allowedPhases.has(pk.p)) continue;
        const key = noteKeyForPair(pair, pk.p);
        const note = model?.notes?.[key];
        targets.push({
          key,
          field: pk.field,
          phase: pk.p,
          note,
          pair,
          row: r,
          actionGroup: getActionGroupForAction(pair.aId),
        });
      }
    }
    return { targets, allowed: true };
  }

  function applyInference(options) {
    const { indexAccess, rows } = getIndexAccess(options);
    const { targets, allowed, reason } = collectTargets(
      options.scope,
      options,
      indexAccess,
      rows,
    );
    if (!allowed) {
      const status = reason || OUT_OF_VIEW_STATUS;
      statusBar?.set?.(status);
      return { applied: 0, allowed: false, status };
    }
    if (!targets.length) {
      statusBar?.set?.(NO_TARGETS_STATUS);
      return { applied: 0, allowed: true, status: NO_TARGETS_STATUS };
    }
    const suggestionScope = (() => {
      if (options.scope === "project") return "project";
      if (options.scope === "action" || options.scope === "actionGroup")
        return "project";
      return "action";
    })();
    const { targets: broaderTargets, allowed: suggestionAllowed } =
      suggestionScope === options.scope
        ? { targets, allowed }
        : collectTargets(suggestionScope, options, indexAccess);
    const suggestionTargets = (() => {
      if (!suggestionAllowed) return targets;
      if (suggestionScope === options.scope) return targets;
      const merged = [...targets];
      const seen = new Set(
        targets.map((item) => `${item.key}:${item.field}`),
      );
      for (const target of broaderTargets) {
        const dedupeKey = `${target.key}:${target.field}`;
        if (!seen.has(dedupeKey)) {
          merged.push(target);
          seen.add(dedupeKey);
        }
      }
      return merged;
    })();
    const notes = model?.notes || (model.notes = {});
    const hasExplicitDefaults =
      options.defaultConfidence != null || options.defaultSource != null;
    const metadata = hasExplicitDefaults
      ? {
          confidence: options.defaultConfidence,
          source: options.defaultSource,
        }
      : null;
    const profileSnapshot = captureInferenceProfilesSnapshot();
    const thresholdOverrides = { ...baseThresholds };
    const overrides = options.thresholdOverrides || {};
    for (const [key, value] of Object.entries(overrides)) {
      if (Number.isFinite(value) || typeof value === "boolean") {
        thresholdOverrides[key] = value;
      }
    }
    lastThresholdOverrides = thresholdOverrides;
    const suggestions = proposeInteractionInferences(
      suggestionTargets,
      profileSnapshot,
      thresholdOverrides,
    );
    const result = {
      applied: 0,
      skippedManual: 0,
      skippedManualOutcome: 0,
      skippedExisting: 0,
      empty: 0,
      sources: {},
    };
    let tagsChanged = false;
    for (const target of targets) {
      const note = notes[target.key];
      const previousValue = extractNoteFieldValue(note, target.field);
      const hasValue = hasStructuredValue(note, target.field);
      const info = describeInteractionInference(note);
      const currentSource = normalizeInteractionSource(info?.source);
      const hasManualOutcomeWithDefaults =
        options.skipManualOutcome &&
        target.field !== "outcome" &&
        hasStructuredValue(note, "outcome") &&
        currentSource === DEFAULT_INTERACTION_SOURCE;
      if (hasManualOutcomeWithDefaults) {
        result.skippedManualOutcome++;
        continue;
      }
      const isManualWithDefaults =
        currentSource === DEFAULT_INTERACTION_SOURCE && hasValue;
      if (isManualWithDefaults && options.skipManualOutcome) {
        result.skippedManual++;
        continue;
      }
      if (!options.overwriteInferred && info?.inferred) {
        result.skippedExisting++;
        continue;
      }
      if (options.onlyFillEmpty && hasValue) {
        result.skippedExisting++;
        continue;
      }
      const suggestion = suggestions.get(target.key)?.[target.field];
      const canUseSuggestion =
        suggestion && (!hasValue || currentSource !== DEFAULT_INTERACTION_SOURCE);
      if (!hasValue && !canUseSuggestion) {
        result.empty++;
        continue;
      }
      if (options.onlyFillEmpty && hasValue && !suggestion) {
        result.skippedExisting++;
        continue;
      }
      const dest = note || (notes[target.key] = {});
      let appliedChange = false;
      if (canUseSuggestion) {
        if (target.field === "outcome") {
          if ("outcomeId" in suggestion.value) {
            dest.outcomeId = suggestion.value.outcomeId;
            delete dest.result;
          } else if ("result" in suggestion.value) {
            dest.result = suggestion.value.result;
            delete dest.outcomeId;
          }
        } else if (target.field === "end") {
          if ("endActionId" in suggestion.value) {
            dest.endActionId = suggestion.value.endActionId;
            dest.endVariantSig = suggestion.value.endVariantSig || "";
            delete dest.endFree;
          } else if ("endFree" in suggestion.value) {
            dest.endFree = suggestion.value.endFree;
            delete dest.endActionId;
            delete dest.endVariantSig;
          }
        } else if (target.field === "tag") {
          const tags = Array.isArray(suggestion.value.tags)
            ? suggestion.value.tags.slice()
            : [];
          dest.tags = tags;
          const prevTags = Array.isArray(previousValue) ? previousValue : [];
          const changedTags =
            prevTags.length !== tags.length ||
            prevTags.some((value, idx) => value !== tags[idx]);
          if (changedTags) tagsChanged = true;
        }
        const metadata = {
          confidence: suggestion.confidence,
          source: suggestion.source,
        };
        if (suggestion.sourceMetadata)
          metadata.sourceMetadata = suggestion.sourceMetadata;
        applyInteractionMetadata(dest, metadata);
        result.sources[suggestion.source] =
          (result.sources[suggestion.source] || 0) + 1;
        appliedChange = true;
      } else if (metadata) {
        applyInteractionMetadata(dest, metadata);
        appliedChange = true;
      }
      if (appliedChange) {
        result.applied++;
        const nextValue = extractNoteFieldValue(dest, target.field);
        recordProfileImpact({
          pair: target.pair,
          field: target.field,
          previousValue,
          nextValue,
          phase: target.phase,
          inferred: true,
          manualOnly: true,
        });
      }
    }
    if (tagsChanged) {
      emitInteractionTagChangeEvent({ type: "set" }, {
        reason: "inference",
        force: true,
      });
    }
    return result;
  }

  function clearInference(options) {
    const { indexAccess, rows } = getIndexAccess(options);
    const { targets, allowed, reason } = collectTargets(
      options.scope,
      options,
      indexAccess,
      rows,
    );
    if (!allowed) {
      const status = reason || OUT_OF_VIEW_STATUS;
      statusBar?.set?.(status);
      return { cleared: 0, allowed: false, status };
    }
    if (!targets.length) {
      statusBar?.set?.(NO_TARGETS_STATUS);
      return { cleared: 0, allowed: true, status: NO_TARGETS_STATUS };
    }
    const notes = model?.notes || {};
    const result = { cleared: 0, skippedManual: 0 };
    for (const target of targets) {
      const note = notes[target.key];
      if (!note || typeof note !== "object") continue;
      const previousValue = extractNoteFieldValue(note, target.field);
      const info = describeInteractionInference(note);
      const currentSource = normalizeInteractionSource(info?.source);
      if (currentSource === DEFAULT_INTERACTION_SOURCE) {
        result.skippedManual++;
        continue;
      }
      if (!info?.inferred) continue;
      if (target.field === "outcome") {
        delete note.outcomeId;
        delete note.result;
      } else if (target.field === "end") {
        delete note.endActionId;
        delete note.endVariantSig;
        delete note.endFree;
      } else if (target.field === "tag") {
        const previous = Array.isArray(note.tags) ? note.tags.slice() : [];
        delete note.tags;
        if (previous.length) {
          emitInteractionTagChangeEvent(null, {
            reason: "clearInference",
            noteKey: target.key,
            pair: target.pair,
            phase: target.phase,
            tags: previous,
            count: previous.length,
          });
        }
      }
      applyInteractionMetadata(note, null);
      if (!Object.keys(note).length) delete notes[target.key];
      result.cleared++;
      const nextValue = extractNoteFieldValue(note, target.field);
      recordProfileImpact({
        pair: target.pair,
        field: target.field,
        previousValue,
        nextValue,
        phase: target.phase,
        inferred: true,
        delta: -1,
      });
    }
    return result;
  }

  function runWithHistory(label, mutate, formatter, shouldRecord) {
    if (typeof runModelMutation === "function") {
      let formattedStatus;
      const statusCallback =
        typeof formatter === "function"
          ? (value) => {
              formattedStatus = formatter(value);
              return formattedStatus;
            }
          : undefined;
      const undoOptions = makeUndoConfig
        ? makeUndoConfig({
            label,
            includeLocation: false,
            includeColumn: false,
            shouldRecord,
          })
        : { label };
      const res = runModelMutation(label, mutate, {
        undo: undoOptions,
        shouldRecord,
        status: statusCallback,
      });
      if (res && formatter && !res.status) {
        const statusText = formattedStatus ?? formatter(res);
        if (statusText) res.status = statusText;
      }
      if (res?.status && statusBar?.set && !statusCallback) {
        statusBar.set(res.status);
      }
      return res;
    }
    const result = mutate();
    if (formatter) {
      const statusText = formatter(result);
      if (statusText) {
        result.status = statusText;
        statusBar?.set?.(statusText);
      }
    }
    return result;
  }

  function runInference(payload) {
    const opts = normalizeOptions(payload);
    return runWithHistory(
      "Inference",
      () => applyInference(opts),
      (res) => formatStatus(res, "Inference"),
      (res) => (res?.applied || 0) > 0,
    );
  }

  function runClear(payload) {
    const opts = normalizeOptions(payload);
    return runWithHistory(
      "Clear inference",
      () => clearInference(opts),
      (res) => formatStatus(res, "Cleared inference"),
      (res) => (res?.cleared || 0) > 0,
    );
  }

  async function openInferenceDialog() {
    try {
      const mod = await import("../ui/inference-dialog.js");
      return await mod.openInferenceDialog({
        defaults: {
          includeEnd: DEFAULT_OPTIONS.includeEnd,
          includeTag: DEFAULT_OPTIONS.includeTag,
          inferFromBypassed: DEFAULT_OPTIONS.inferFromBypassed,
          inferToBypassed: DEFAULT_OPTIONS.inferToBypassed,
          overwriteInferred: DEFAULT_OPTIONS.overwriteInferred,
          onlyFillEmpty: DEFAULT_OPTIONS.onlyFillEmpty,
          skipManualOutcome: DEFAULT_OPTIONS.skipManualOutcome,
          scope: DEFAULT_OPTIONS.scope,
          thresholdOverrides: lastThresholdOverrides,
        },
        defaultThresholds: baseThresholds,
        onRun: (payload) => runInference(payload),
        onClear: (payload) => runClear(payload),
      });
    } catch (error) {
      statusBar?.set?.(`Open inference failed: ${error?.message || error}`);
      return null;
    }
  }

  return { openInferenceDialog, runInference, runClear };
}
