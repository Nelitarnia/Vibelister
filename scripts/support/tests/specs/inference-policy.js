import { createInferencePolicy } from "../../../app/inference-policy.js";

export function getInferencePolicyTests() {
  return [
    {
      name: "normalizes canonical policy fields",
      run(assert) {
        const policy = createInferencePolicy({
          scope: "action",
          expandReadableBypass: true,
          expandWritableBypass: false,
          manualOnlyEvidence: true,
          allowInferredEvidence: false,
          allowInferredOverwrite: false,
          profileLearningEnabled: false,
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
      name: "rejects legacy policy keys",
      run(assert) {
        let message = "";
        try {
          createInferencePolicy({ inferFromBypassed: true });
        } catch (error) {
          message = String(error?.message || error);
        }
        assert.ok(
          message.includes("Legacy inference policy key is no longer supported"),
          "legacy key usage should fail fast",
        );
      },
    },
  ];
}
