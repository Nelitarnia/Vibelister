import { createInferencePolicy } from "../../../app/inference-policy.js";

export function getInferencePolicyTests() {
  return [
    {
      name: "normalizes legacy bypass and strict flags",
      run(assert) {
        const policy = createInferencePolicy({
          scope: "action",
          inferFromBypassed: true,
          inferToBypassed: false,
          strictManualOnly: true,
        });
        assert.strictEqual(policy.scope, "action");
        assert.strictEqual(policy.manualOnlyEvidence, true);
        assert.strictEqual(policy.allowInferredEvidence, false);
        assert.strictEqual(policy.allowInferredOverwrite, false);
        assert.strictEqual(policy.expandReadableBypass, true);
        assert.strictEqual(policy.expandWritableBypass, false);
        assert.strictEqual(policy.profileLearningEnabled, false);
      },
    },
    {
      name: "allows normalized policy overrides",
      run(assert) {
        const policy = createInferencePolicy({
          strictManualOnly: true,
          manualOnlyEvidence: false,
          allowInferredEvidence: true,
          allowInferredOverwrite: true,
          expandReadableBypass: true,
          expandWritableBypass: true,
          profileLearningEnabled: true,
        });
        assert.strictEqual(policy.manualOnlyEvidence, false);
        assert.strictEqual(policy.allowInferredEvidence, true);
        assert.strictEqual(policy.allowInferredOverwrite, true);
        assert.strictEqual(policy.expandReadableBypass, true);
        assert.strictEqual(policy.expandWritableBypass, true);
        assert.strictEqual(policy.profileLearningEnabled, true);
      },
    },
  ];
}
