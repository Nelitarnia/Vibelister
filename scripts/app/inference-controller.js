import {
  DEFAULT_INTERACTION_SOURCE,
  applyInteractionMetadata,
  describeInteractionInference,
  normalizeInteractionConfidence,
  normalizeInteractionSource,
} from "./interactions.js";
import { DEFAULT_HEURISTIC_THRESHOLDS } from "./inference-heuristics.js";
import { extractNoteFieldValue } from "./inference-utils.js";
import {
  createInferenceProfileStore,
  recordProfileImpact,
} from "./inference-profiles.js";
import { applySuggestions, HEURISTIC_LABELS } from "./inference-application.js";
import { createInferenceIndexAccess } from "./inference-index-access.js";
import { createInferenceTargetResolver } from "./inference-targets.js";
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
    inferenceProfiles: providedProfiles,
  } = options;

  const baseThresholds =
    heuristicThresholds || DEFAULT_HEURISTIC_THRESHOLDS || {};
  let lastThresholdOverrides = { ...baseThresholds };
  const inferenceProfiles =
    providedProfiles || model?.inferenceProfiles || createInferenceProfileStore();
  if (model && !model.inferenceProfiles) model.inferenceProfiles = inferenceProfiles;
  const OUT_OF_VIEW_STATUS = "Inference only applies to the Interactions view.";
  const NO_TARGETS_STATUS =
    "Select Outcome, End, or Tag cells in the Interactions view to run inference.";
  const indexAccessManager = createInferenceIndexAccess({
    model,
    sel,
    getInteractionsPair,
    getInteractionsRowCount,
    statusBar,
    enableBypassCacheTelemetry: options?.enableBypassCacheTelemetry !== false,
    bypassCacheWarningEntries: options?.bypassCacheWarningEntries,
    bypassCacheWarningRows: options?.bypassCacheWarningRows,
  });

  const targetResolver = createInferenceTargetResolver({
    model,
    selection,
    sel,
    getActiveView,
    viewDef,
  });

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

  function applyInference(options) {
    const { indexAccess, rows } = indexAccessManager.resolveIndexAccess(
      options,
      targetResolver.getRows,
    );
    const { requestedTargets, suggestionTargets, allowed, reason } =
      targetResolver.resolveScopes(options, indexAccess, rows);
    if (!allowed) {
      const status = reason || OUT_OF_VIEW_STATUS;
      statusBar?.set?.(status);
      return { applied: 0, allowed: false, status };
    }
    if (!requestedTargets.length) {
      statusBar?.set?.(NO_TARGETS_STATUS);
      return { applied: 0, allowed: true, status: NO_TARGETS_STATUS };
    }
    const { result } = applySuggestions({
      model,
      targets: requestedTargets,
      suggestionTargets,
      options,
      baseThresholds,
      setLastThresholdOverrides: (overrides) => {
        lastThresholdOverrides = overrides;
      },
      inferenceProfiles,
    });
    return result;
  }

  function clearInference(options) {
    const { indexAccess, rows } = indexAccessManager.resolveIndexAccess(
      options,
      targetResolver.getRows,
    );
    const { targets, allowed, reason } = targetResolver.collectTargets(
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
    const groupedTargets = new Map();
    for (const target of targets) {
      const list = groupedTargets.get(target.key) || [];
      list.push(target);
      groupedTargets.set(target.key, list);
    }
    const result = { cleared: 0, skippedManual: 0 };
    for (const [noteKey, noteTargets] of groupedTargets.entries()) {
      const note = notes[noteKey];
      if (!note || typeof note !== "object") continue;
      const info = describeInteractionInference(note);
      const currentSource = normalizeInteractionSource(info?.source);
      if (currentSource === DEFAULT_INTERACTION_SOURCE) {
        result.skippedManual += noteTargets.length;
        continue;
      }
      if (!info?.inferred) continue;
      for (const target of noteTargets) {
        const previousValue = extractNoteFieldValue(note, target.field);
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
        result.cleared++;
        const nextValue = extractNoteFieldValue(note, target.field);
        recordProfileImpact({
          store: inferenceProfiles,
          pair: target.pair,
          field: target.field,
          previousValue,
          nextValue,
          phase: target.phase,
          inferred: true,
          delta: -1,
        });
      }
      applyInteractionMetadata(note, null);
      if (!Object.keys(note).length) delete notes[noteKey];
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
