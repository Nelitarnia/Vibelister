import { createBrowserAsserts } from "./specs/assertions.js";
import { getModelVariantTests } from "./specs/model-variants.js";
import { getInteractionsTests } from "./specs/interactions.js";
import { getPersistenceTests } from "./specs/persistence.js";
import { getSelectionTests } from "./specs/selection.js";
import { getCleanupTests } from "./specs/cleanup.js";
import { getVariantNormalizationTests } from "./specs/variant-normalization.js";
import { getVariantCombinatoricsTests } from "./specs/variant-combinatorics.js";
import { getVariantConstraintTests } from "./specs/variant-constraints.js";
import { getInferenceStrategyTests } from "./specs/inference-strategies.js";

export function runSelfTests() {
  const log = (...args) => console.log("[tests]", ...args);
  const results = { passed: 0, failed: 0 };
  const assert = createBrowserAsserts();
  const suites = [
    { name: "Model variants", tests: getModelVariantTests() },
    { name: "Variant normalization", tests: getVariantNormalizationTests() },
    { name: "Variant combinatorics", tests: getVariantCombinatoricsTests() },
    { name: "Variant constraints", tests: getVariantConstraintTests() },
    { name: "Inference strategies", tests: getInferenceStrategyTests() },
    { name: "Interactions", tests: getInteractionsTests() },
    { name: "Persistence", tests: getPersistenceTests() },
    { name: "Selection", tests: getSelectionTests() },
    { name: "Cleanup", tests: getCleanupTests() },
  ];

  for (const suite of suites) {
    log(`Running ${suite.name} tests...`);
    for (const spec of suite.tests) {
      try {
        spec.run(assert);
        results.passed++;
        log(`✔ ${spec.name}`);
      } catch (err) {
        results.failed++;
        console.error(`✖ ${spec.name}`, err);
      }
    }
  }

  if (results.failed === 0) {
    log(`All ${results.passed} tests passed.`);
  } else {
    log(
      `${results.passed} test(s) passed, ${results.failed} failed. See errors above.`,
    );
  }
  return results;
}

export default runSelfTests;
