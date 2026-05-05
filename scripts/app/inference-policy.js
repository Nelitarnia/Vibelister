import {
  normalizeInteractionConfidence,
  normalizeInteractionSource,
} from "./interactions.js";

const DEFAULT_OPTIONS = Object.freeze({
  scope: "selection",
  includeEnd: true,
  includeTag: true,
  inferFromBypassed: false,
  inferToBypassed: false,
  overwriteInferred: true,
  onlyFillEmpty: false,
  skipManualOutcome: false,
  strictManualOnly: false,
  debugInference: false,
});

export function createInferencePolicy(payload = {}) {
  const hasDefaultConfidence = Object.prototype.hasOwnProperty.call(
    payload,
    "defaultConfidence",
  );
  const hasDefaultSource = Object.prototype.hasOwnProperty.call(
    payload,
    "defaultSource",
  );

  const strictManualOnly =
    payload.strictManualOnly == null
      ? DEFAULT_OPTIONS.strictManualOnly
      : !!payload.strictManualOnly;
  const inferFromBypassed = !!payload.inferFromBypassed;
  const inferToBypassed = !!payload.inferToBypassed;

  return {
    scope: payload.scope || DEFAULT_OPTIONS.scope,
    includeEnd: payload.includeEnd !== false,
    includeTag: payload.includeTag !== false,
    inferFromBypassed,
    inferToBypassed,
    overwriteInferred: payload.overwriteInferred !== false,
    onlyFillEmpty: !!payload.onlyFillEmpty,
    skipManualOutcome: !!payload.skipManualOutcome,
    strictManualOnly,
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
    // Explicit normalized policy controls.
    manualOnlyEvidence: strictManualOnly,
    allowInferredEvidence: !strictManualOnly,
    allowInferredOverwrite: !strictManualOnly,
    expandWritableBypass: inferToBypassed,
    expandReadableBypass: inferFromBypassed,
    profileLearningEnabled: !strictManualOnly,
  };
}
