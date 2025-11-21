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
  proposeInteractionInferences,
} from "./inference-heuristics.js";
import {
  captureInferenceProfilesSnapshot,
  extractNoteFieldValue,
  recordProfileImpact,
} from "./inference-profiles.js";

const HEURISTIC_LABELS = Object.freeze({
  [HEURISTIC_SOURCES.modifierPropagation]: "modifier propagation",
  [HEURISTIC_SOURCES.modifierProfile]: "modifier profile",
  [HEURISTIC_SOURCES.inputDefault]: "input default",
  [HEURISTIC_SOURCES.profileTrend]: "modifier/input trends",
});
import { parsePhaseKey } from "../data/utils.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";

const DEFAULT_OPTIONS = Object.freeze({
  scope: "selection",
  includeEnd: true,
  includeTag: true,
  overwriteInferred: true,
  onlyFillEmpty: false,
  defaultConfidence: DEFAULT_INTERACTION_CONFIDENCE,
  defaultSource: "model",
  fillIntentionalBlanks: false,
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

function hasManualOutcomeWithDefaults(note) {
  if (!hasStructuredValue(note, "outcome")) return false;
  const info = describeInteractionInference(note);
  const source = normalizeInteractionSource(info?.source);
  const confidence = normalizeInteractionConfidence(info?.confidence);
  return (
    source === DEFAULT_INTERACTION_SOURCE &&
    confidence === DEFAULT_INTERACTION_CONFIDENCE
  );
}

function normalizeOptions(payload = {}) {
  return {
    scope: payload.scope || DEFAULT_OPTIONS.scope,
    includeEnd: payload.includeEnd !== false,
    includeTag: payload.includeTag !== false,
    overwriteInferred: payload.overwriteInferred !== false,
    onlyFillEmpty: !!payload.onlyFillEmpty,
    fillIntentionalBlanks: !!payload.fillIntentionalBlanks,
    defaultConfidence: normalizeInteractionConfidence(
      payload.defaultConfidence,
    ),
    defaultSource: normalizeInteractionSource(
      payload.defaultSource || DEFAULT_OPTIONS.defaultSource,
    ),
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
  } = options;

  function formatStatus(result, actionLabel) {
    if (!result) return "";
    const applied = Number(result.applied || 0);
    const cleared = Number(result.cleared || 0);
    const skippedManual = Number(result.skippedManual || 0);
    const skippedManualOutcome = Number(result.skippedManualOutcome || 0);
    const skippedExisting = Number(result.skippedExisting || 0);
    const empty = Number(result.empty || 0);
    const actions = [];
    if (applied) actions.push(`${applied} inferred`);
    if (cleared) actions.push(`${cleared} cleared`);
    if (actions.length === 0) actions.push("No changes");
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
    if (selection.cols && selection.cols.size)
      return matches.filter(({ idx }) => selection.cols.has(idx));
    return matches.filter(({ idx }) => idx === sel.c);
  }

  function getRows(scope) {
    const totalRows = getInteractionsRowCount?.(model) || 0;
    if (scope === "project") {
      return Array.from({ length: totalRows }, (_, i) => i);
    }
    if (scope === "action") {
      const activePair = getInteractionsPair?.(model, sel.r);
      if (!activePair) return [];
      const targetId = activePair.aId;
      const rows = [];
      for (let i = 0; i < totalRows; i++) {
        const pair = getInteractionsPair?.(model, i);
        if (pair && pair.aId === targetId) rows.push(i);
      }
      return rows;
    }
    if (selection.rows && selection.rows.size) {
      return Array.from(selection.rows).sort((a, b) => a - b);
    }
    return [sel.r];
  }

  function collectTargets(scope, options) {
    if (typeof getActiveView === "function" && getActiveView() !== "interactions") {
      return { targets: [], allowed: false };
    }
    const def = typeof viewDef === "function" ? viewDef() : viewDef;
    const rows = getRows(scope);
    const columns = getRelevantColumns(def, options, scope === "selection");
    const targets = [];
    for (const r of rows) {
      const pair = getInteractionsPair?.(model, r);
      if (!pair) continue;
      for (const { pk } of columns) {
        if (!pk) continue;
        const key = noteKeyForPair(pair, pk.p);
        const note = model?.notes?.[key];
        targets.push({ key, field: pk.field, phase: pk.p, note, pair, row: r });
      }
    }
    return { targets, allowed: true };
  }

  function applyInference(options) {
    const { targets, allowed } = collectTargets(options.scope, options);
    if (!allowed) {
      statusBar?.set?.("Inference only applies to the Interactions view.");
      return { applied: 0 };
    }
    const notes = model?.notes || (model.notes = {});
    const metadata = {
      confidence: options.defaultConfidence,
      source: options.defaultSource,
    };
    const profileSnapshot = captureInferenceProfilesSnapshot();
    const manualOutcomeKeys = new Set(
      targets
        .filter(({ key }) => hasManualOutcomeWithDefaults(notes[key]))
        .map((target) => target.key),
    );
    const suggestionTargets = options.fillIntentionalBlanks
      ? targets
      : targets.filter(
          (target) =>
            !(
              manualOutcomeKeys.has(target.key) &&
              (target.field === "end" || target.field === "tag")
            ),
        );
    const suggestions = proposeInteractionInferences(
      suggestionTargets,
      profileSnapshot,
    );
    const result = {
      applied: 0,
      skippedManual: 0,
      skippedManualOutcome: 0,
      skippedExisting: 0,
      empty: 0,
      sources: {},
    };
    for (const target of targets) {
      const note = notes[target.key];
      const previousValue = extractNoteFieldValue(note, target.field);
      const skipManualOutcome =
        !options.fillIntentionalBlanks &&
        manualOutcomeKeys.has(target.key) &&
        (target.field === "end" || target.field === "tag");
      if (skipManualOutcome) {
        result.skippedManualOutcome++;
        continue;
      }
      const hasValue = hasStructuredValue(note, target.field);
      const info = describeInteractionInference(note);
      const currentSource = normalizeInteractionSource(info?.source);
      if (currentSource === DEFAULT_INTERACTION_SOURCE && hasValue) {
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
        }
        applyInteractionMetadata(dest, {
          confidence: suggestion.confidence,
          source: suggestion.source,
        });
        result.sources[suggestion.source] =
          (result.sources[suggestion.source] || 0) + 1;
      } else {
        applyInteractionMetadata(dest, metadata);
      }
      result.applied++;
      const nextValue = extractNoteFieldValue(dest, target.field);
      recordProfileImpact({
        pair: target.pair,
        field: target.field,
        previousValue,
        nextValue,
      });
    }
    return result;
  }

  function clearInference(options) {
    const { targets, allowed } = collectTargets(options.scope, options);
    if (!allowed) {
      statusBar?.set?.("Clear inferred only applies to the Interactions view.");
      return { cleared: 0 };
    }
    const notes = model?.notes || {};
    const result = { cleared: 0, skippedManual: 0 };
    for (const target of targets) {
      const note = notes[target.key];
      if (!note || typeof note !== "object") continue;
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
    }
    return result;
  }

  function runWithHistory(label, mutate, formatter, shouldRecord) {
    if (typeof runModelMutation === "function") {
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
        status: (value) => formatter(value),
      });
      if (res && formatter && !res.status) {
        const statusText = formatter(res);
        if (statusText) res.status = statusText;
      }
      if (res?.status && statusBar?.set) statusBar.set(res.status);
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
          defaultConfidence: DEFAULT_OPTIONS.defaultConfidence,
          defaultSource: DEFAULT_OPTIONS.defaultSource,
          includeEnd: DEFAULT_OPTIONS.includeEnd,
          includeTag: DEFAULT_OPTIONS.includeTag,
          overwriteInferred: DEFAULT_OPTIONS.overwriteInferred,
          onlyFillEmpty: DEFAULT_OPTIONS.onlyFillEmpty,
          fillIntentionalBlanks: DEFAULT_OPTIONS.fillIntentionalBlanks,
          scope: DEFAULT_OPTIONS.scope,
        },
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
