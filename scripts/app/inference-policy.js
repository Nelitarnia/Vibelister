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

  const manualOnlyEvidence =
    payload.manualOnlyEvidence == null
      ? strictManualOnly
      : !!payload.manualOnlyEvidence;
  const allowInferredEvidence =
    payload.allowInferredEvidence == null
      ? !manualOnlyEvidence
      : !!payload.allowInferredEvidence;
  const allowInferredOverwrite =
    payload.allowInferredOverwrite == null
      ? !manualOnlyEvidence
      : !!payload.allowInferredOverwrite;
  const expandWritableBypass =
    payload.expandWritableBypass == null
      ? inferToBypassed
      : !!payload.expandWritableBypass;
  const expandReadableBypass =
    payload.expandReadableBypass == null
      ? inferFromBypassed
      : !!payload.expandReadableBypass;
  const profileLearningEnabled =
    payload.profileLearningEnabled == null
      ? !manualOnlyEvidence
      : !!payload.profileLearningEnabled;

  return {
    scope: payload.scope || DEFAULT_OPTIONS.scope,
    includeEnd: payload.includeEnd !== false,
    includeTag: payload.includeTag !== false,
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
    // Explicit normalized policy controls.
    manualOnlyEvidence,
    allowInferredEvidence,
    allowInferredOverwrite,
    expandWritableBypass,
    expandReadableBypass,
    profileLearningEnabled,
  };
}


export function assertNormalizedInferencePolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new Error("Inference policy must be an object.");
  }
  const required = [
    "manualOnlyEvidence",
    "allowInferredEvidence",
    "allowInferredOverwrite",
    "expandWritableBypass",
    "expandReadableBypass",
    "profileLearningEnabled",
  ];
  for (const key of required) {
    if (typeof policy[key] !== "boolean") {
      throw new Error(`Inference policy missing normalized boolean: ${key}`);
    }
  }
  return policy;
}
