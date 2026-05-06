import {
  normalizeInteractionConfidence,
  normalizeInteractionSource,
} from "./interactions.js";

const DEFAULT_POLICY = Object.freeze({
  scope: "selection",
  includeEnd: true,
  includeTag: true,
  onlyFillEmpty: false,
  skipManualOutcome: false,
  debugInference: false,
  manualOnlyEvidence: false,
  allowInferredEvidence: true,
  allowInferredOverwrite: true,
  expandWritableBypass: false,
  expandReadableBypass: false,
  profileLearningEnabled: true,
});

const LEGACY_KEYS = Object.freeze([
  "strictManualOnly",
  "inferFromBypassed",
  "inferToBypassed",
  "overwriteInferred",
]);

export function createInferencePolicy(payload = {}) {
  for (const key of LEGACY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      throw new Error(`Legacy inference policy key is no longer supported: ${key}`);
    }
  }

  const hasDefaultConfidence = Object.prototype.hasOwnProperty.call(
    payload,
    "defaultConfidence",
  );
  const hasDefaultSource = Object.prototype.hasOwnProperty.call(
    payload,
    "defaultSource",
  );

  return {
    scope: payload.scope || DEFAULT_POLICY.scope,
    includeEnd: payload.includeEnd !== false,
    includeTag: payload.includeTag !== false,
    onlyFillEmpty: !!payload.onlyFillEmpty,
    skipManualOutcome: !!payload.skipManualOutcome,
    debugInference:
      payload.debugInference == null
        ? DEFAULT_POLICY.debugInference
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
    manualOnlyEvidence:
      payload.manualOnlyEvidence == null
        ? DEFAULT_POLICY.manualOnlyEvidence
        : !!payload.manualOnlyEvidence,
    allowInferredEvidence:
      payload.allowInferredEvidence == null
        ? DEFAULT_POLICY.allowInferredEvidence
        : !!payload.allowInferredEvidence,
    allowInferredOverwrite:
      payload.allowInferredOverwrite == null
        ? DEFAULT_POLICY.allowInferredOverwrite
        : !!payload.allowInferredOverwrite,
    expandWritableBypass:
      payload.expandWritableBypass == null
        ? DEFAULT_POLICY.expandWritableBypass
        : !!payload.expandWritableBypass,
    expandReadableBypass:
      payload.expandReadableBypass == null
        ? DEFAULT_POLICY.expandReadableBypass
        : !!payload.expandReadableBypass,
    profileLearningEnabled:
      payload.profileLearningEnabled == null
        ? DEFAULT_POLICY.profileLearningEnabled
        : !!payload.profileLearningEnabled,
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
