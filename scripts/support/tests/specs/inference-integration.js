import { INTERACTION_AND_INFERENCE_SPECS } from "./interactions-and-inference-specs.js";

function isInferenceIntegrationSpec(spec) {
  const name = String(spec?.name || "").toLowerCase();
  return /(inference|inferred|heuristic|profile trend)/.test(name);
}

export function getInferenceIntegrationTests() {
  return INTERACTION_AND_INFERENCE_SPECS.filter((spec) =>
    isInferenceIntegrationSpec(spec),
  );
}
