import { test } from "node:test";
import assert from "node:assert/strict";
import { createNodeAsserts } from "../scripts/support/tests/specs/assertions.js";
import { getModelVariantTests } from "../scripts/support/tests/specs/model-variants.js";
import { getInteractionsTests } from "../scripts/support/tests/specs/interactions.js";
import { getUiGridMouseTests } from "../scripts/support/tests/specs/ui-grid-mouse.js";
import { getRowInsertionTests } from "../scripts/support/tests/specs/rows.js";
import { getDeletionTests } from "../scripts/support/tests/specs/deletion.js";
import { getSelectionTests } from "../scripts/support/tests/specs/selection.js";

const sharedAssert = createNodeAsserts(assert);

for (const spec of getModelVariantTests()) {
  test(`Model variants › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getInteractionsTests()) {
  test(`Interactions › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getSelectionTests()) {
  test(`Selection › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getUiGridMouseTests()) {
  test(`UI › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getRowInsertionTests()) {
  test(`Rows › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getDeletionTests()) {
  test(`Deletion › ${spec.name}`, () => spec.run(sharedAssert));
}
