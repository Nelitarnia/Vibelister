import { createBrowserAsserts } from "./specs/assertions.js";
import { getUiGridMouseTests } from "./specs/ui-grid-mouse.js";

export function runUiTests() {
  const log = (...args) => console.log("[ui-tests]", ...args);
  const results = { passed: 0, failed: 0 };
  const assert = createBrowserAsserts();
  for (const spec of getUiGridMouseTests()) {
    try {
      spec.run(assert);
      results.passed++;
      log(`✔ ${spec.name}`);
    } catch (err) {
      results.failed++;
      console.error(`✖ ${spec.name}`, err);
    }
  }
  if (results.failed === 0) {
    log(`All ${results.passed} UI tests passed.`);
  } else {
    log(
      `${results.passed} UI test(s) passed, ${results.failed} failed. See errors above.`,
    );
  }
  return results;
}

export default runUiTests;
