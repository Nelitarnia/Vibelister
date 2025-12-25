import {
  DEFAULT_INTERACTION_SOURCE,
  applyInteractionMetadata,
  describeInteractionInference,
  normalizeInteractionSource,
} from "./interactions.js";
import { HEURISTIC_SOURCES, proposeInteractionInferences } from "./inference-heuristics.js";
import {
  captureInferenceProfilesSnapshot,
  recordProfileImpact,
} from "./inference-profiles.js";
import { extractNoteFieldValue } from "./inference-utils.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";

export const HEURISTIC_LABELS = Object.freeze({
  [HEURISTIC_SOURCES.actionGroup]: "action group similarity",
  [HEURISTIC_SOURCES.actionProperty]: "action property similarity",
  [HEURISTIC_SOURCES.modifierPropagation]: "modifier propagation",
  [HEURISTIC_SOURCES.modifierProfile]: "modifier profile",
  [HEURISTIC_SOURCES.inputDefault]: "input default",
  [HEURISTIC_SOURCES.profileTrend]: "modifier/input trends",
  [HEURISTIC_SOURCES.phaseAdjacency]: "phase adjacency",
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

export function applySuggestions({
  model,
  targets,
  suggestionTargets,
  options,
  baseThresholds,
  setLastThresholdOverrides,
  inferenceProfiles,
}) {
  const notes = model?.notes || (model.notes = {});
  const hasExplicitDefaults =
    options.defaultConfidence != null || options.defaultSource != null;
  const metadata = hasExplicitDefaults
    ? {
        confidence: options.defaultConfidence,
        source: options.defaultSource,
      }
    : null;
  const profileSnapshot = captureInferenceProfilesSnapshot(inferenceProfiles);
  const thresholdOverrides = { ...baseThresholds };
  const overrides = options.thresholdOverrides || {};
  for (const [key, value] of Object.entries(overrides)) {
    if (Number.isFinite(value) || typeof value === "boolean") {
      thresholdOverrides[key] = value;
    }
  }
  if (typeof setLastThresholdOverrides === "function") {
    setLastThresholdOverrides(thresholdOverrides);
  }
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
      const suggestionMetadata = {
        confidence: suggestion.confidence,
        source: suggestion.source,
      };
      if (suggestion.sourceMetadata)
        suggestionMetadata.sourceMetadata = suggestion.sourceMetadata;
      applyInteractionMetadata(dest, suggestionMetadata);
      result.sources[suggestion.source] = (result.sources[suggestion.source] || 0) + 1;
      appliedChange = true;
    } else if (metadata) {
      applyInteractionMetadata(dest, metadata);
      appliedChange = true;
    }
    if (appliedChange) {
      result.applied++;
      const nextValue = extractNoteFieldValue(dest, target.field);
      recordProfileImpact({
        store: inferenceProfiles,
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
  return { result, thresholdOverrides };
}
