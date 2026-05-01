import {
  normalizeInteractionConfidence,
  normalizeInteractionSource,
} from "./interactions.js";
import { DEFAULT_HEURISTIC_THRESHOLDS } from "./inference-heuristics.js";
import {
  createInferenceProfileStore,
  recordProfileImpact,
} from "./inference-profiles.js";
import { applySuggestions, HEURISTIC_LABELS } from "./inference-application.js";
import { createInferenceIndexAccess } from "./inference-index-access.js";
import { createInferenceTargetResolver } from "./inference-targets.js";
import { clearInferredTargets } from "./inference-clear-helpers.js";

const DEFAULT_OPTIONS = Object.freeze({
  scope: "selection",
  includeEnd: true,
  includeTag: true,
  inferFromBypassed: false,
  inferToBypassed: false,
  overwriteInferred: true,
  onlyFillEmpty: false,
  skipManualOutcome: false,
  debugInference: false,
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
    debugInference:
      payload.debugInference == null
        ? DEFAULT_OPTIONS.debugInference
        : !!payload.debugInference,
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

function createInferenceDebugDetails({
  sourceRows,
  suggestionRows,
  writableRows,
  requestedTargets,
  writableTargets,
  suggestionTargets,
}) {
  return {
    sourceRows: Array.isArray(sourceRows) ? sourceRows.length : 0,
    suggestionRows: Array.isArray(suggestionRows) ? suggestionRows.length : 0,
    targetRows: Array.isArray(suggestionRows) ? suggestionRows.length : 0,
    writableRows: Array.isArray(writableRows) ? writableRows.length : 0,
    requestedTargets: Array.isArray(requestedTargets) ? requestedTargets.length : 0,
    writableTargets: Array.isArray(writableTargets) ? writableTargets.length : 0,
    suggestionTargets: Array.isArray(suggestionTargets) ? suggestionTargets.length : 0,
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
    getUserSettings,
  } = options;

  const baseThresholds =
    heuristicThresholds || DEFAULT_HEURISTIC_THRESHOLDS || {};
  let lastThresholdOverrides = { ...baseThresholds };
  const inferenceProfiles =
    providedProfiles ||
    model?.inferenceProfiles ||
    createInferenceProfileStore();
  if (model && !model.inferenceProfiles)
    model.inferenceProfiles = inferenceProfiles;
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

  function isInferenceDebugEnabledBySettings() {
    const settings =
      typeof getUserSettings === "function" ? getUserSettings() : null;
    const debug = settings?.debug;
    return !!(debug?.enabled && debug?.inferenceStatus);
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
    const debug = result.debug;
    const debugText =
      debug && result.options?.debugInference
        ? ` Debug — sourceRows:${debug.sourceRows ?? 0}, targetRows:${debug.targetRows ?? 0}, writableRows:${debug.writableRows ?? 0}, requestedTargets:${debug.requestedTargets ?? 0}, evidence:${debug.evidenceTargets}, suggestionTargets:${debug.suggestionTargets}, writable:${debug.writableTargets}, suggestionMap:${debug.suggestionMapSize}${debug.statusReason ? `, statusReason:${debug.statusReason}` : ""}${debug.noChangeReason ? `, reason:${debug.noChangeReason}` : ""}.`
        : "";
    return `${actionLabel || "Inference"}: ${actions.join(", ")}${suffix}.${sourceText}${debugText}`;
  }

  function applyInference(options) {
    const { indexAccess, suggestionRows, sourceRows, writableRows } =
      indexAccessManager.resolveIndexAccess(
      options,
      targetResolver.getRows,
    );
    if (options.debugInference && options.inferToBypassed && !options.inferFromBypassed) {
      const baseline = indexAccessManager.resolveIndexAccess(
        { ...options, inferToBypassed: false },
        targetResolver.getRows,
      );
      const baselineEvidenceCount = Array.isArray(baseline?.sourceRows)
        ? baseline.sourceRows.length
        : 0;
      const evidenceCount = Array.isArray(sourceRows) ? sourceRows.length : 0;
      if (evidenceCount < baselineEvidenceCount) {
        console.warn(
          `[inference] inferToBypassed guard: evidence rows dropped (${evidenceCount} < ${baselineEvidenceCount}).`,
        );
      } else {
        console.debug?.(
          `[inference] inferToBypassed guard: evidence rows preserved (${evidenceCount} >= ${baselineEvidenceCount}).`,
        );
      }
    }
    const { requestedTargets, suggestionTargets, allowed, reason } =
      targetResolver.resolveScopes(options, indexAccess, {
        requestedRows: writableRows,
        suggestionRows,
      });
    if (!allowed) {
      const status = reason || OUT_OF_VIEW_STATUS;
      statusBar?.set?.(status);
      return {
        applied: 0,
        allowed: false,
        status,
        statusReason: "out-of-view",
      };
    }
    const writableRowSet = new Set(Array.isArray(writableRows) ? writableRows : []);
    const writableTargets = requestedTargets.filter((target) =>
      writableRowSet.has(target.row),
    );
    const debugDetails = createInferenceDebugDetails({
      sourceRows,
      suggestionRows,
      writableRows,
      requestedTargets,
      writableTargets,
      suggestionTargets,
    });
    if (!writableTargets.length) {
      statusBar?.set?.(NO_TARGETS_STATUS);
      return {
        applied: 0,
        allowed: true,
        status: NO_TARGETS_STATUS,
        statusReason: "no-writable-targets",
        debug: debugDetails,
        options: { debugInference: !!options.debugInference },
      };
    }
    const { result } = applySuggestions({
      model,
      targets: writableTargets,
      suggestionTargets,
      evidenceTargets: sourceRows,
      options,
      baseThresholds,
      setLastThresholdOverrides: (overrides) => {
        lastThresholdOverrides = overrides;
      },
      inferenceProfiles,
    });
    result.options = { debugInference: !!options.debugInference };
    result.statusReason = result.statusReason || "ok";
    result.debug = { ...debugDetails, ...(result.debug || {}), statusReason: "ok" };
    return result;
  }

  function clearInference(options) {
    const { indexAccess, writableRows } = indexAccessManager.resolveIndexAccess(
      options,
      targetResolver.getRows,
    );
    const { targets, allowed, reason } = targetResolver.collectTargets(
      options.scope,
      options,
      indexAccess,
      writableRows,
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
    return clearInferredTargets({
      notes,
      targets,
      mode: "phase",
      onFieldCleared: ({ pair, phase, field, previousValue, nextValue }) => {
        recordProfileImpact({
          store: inferenceProfiles,
          pair,
          field,
          previousValue,
          nextValue,
          phase,
          inferred: true,
          delta: -1,
        });
      },
    });
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
    const opts = normalizeOptions({
      ...payload,
      debugInference:
        payload?.debugInference == null
          ? isInferenceDebugEnabledBySettings()
          : payload.debugInference,
    });
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
          debugInference: isInferenceDebugEnabledBySettings(),
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
