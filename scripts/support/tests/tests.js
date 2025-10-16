import { createBrowserAsserts } from "./specs/assertions.js";
import { getModelVariantTests } from "./specs/model-variants.js";
import { getInteractionsTests } from "./specs/interactions.js";

export function runSelfTests() {
  const log = (...args) => console.log("[tests]", ...args);
  const results = { passed: 0, failed: 0 };
  const assert = createBrowserAsserts();
  const suites = [
    { name: "Model variants", tests: getModelVariantTests() },
    { name: "Interactions", tests: getInteractionsTests() },
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
