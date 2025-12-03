import { test } from "node:test";
import assert from "node:assert/strict";
import { createNodeAsserts } from "../scripts/support/tests/specs/assertions.js";
import { getModelVariantTests } from "../scripts/support/tests/specs/model-variants.js";
import { getInteractionsTests } from "../scripts/support/tests/specs/interactions.js";
import { getPersistenceTests } from "../scripts/support/tests/specs/persistence.js";
import { getUiGridMouseTests } from "../scripts/support/tests/specs/ui-grid-mouse.js";
import { getUiRowDragTests } from "../scripts/support/tests/specs/ui-row-drag.js";
import { getColumnResizeTests } from "../scripts/support/tests/specs/column-resize.js";
import { getRowInsertionTests } from "../scripts/support/tests/specs/rows.js";
import { getDeletionTests } from "../scripts/support/tests/specs/deletion.js";
import { getSelectionTests } from "../scripts/support/tests/specs/selection.js";
import { getModelSnapshotTests } from "../scripts/support/tests/specs/model-snapshot.js";
import { getUndoTests } from "../scripts/support/tests/specs/undo.js";
import { getModStateTests } from "../scripts/support/tests/specs/mod-state.js";
import { getGridKeysTests } from "../scripts/support/tests/specs/grid-keys.js";
import { getColumnKindTests } from "../scripts/support/tests/specs/column-kinds.js";
import { getCommentTests } from "../scripts/support/tests/specs/comments.js";
import { getClipboardTests } from "../scripts/support/tests/specs/clipboard.js";
import { getCleanupTests } from "../scripts/support/tests/specs/cleanup.js";
import { getInferenceUtilsTests } from "../scripts/support/tests/specs/inference-utils.js";
import { getInferenceControllerTests } from "../scripts/support/tests/specs/inference-controller.js";

const sharedAssert = createNodeAsserts(assert);

for (const spec of getModelVariantTests()) {
  test(`Model variants › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getInteractionsTests()) {
  test(`Interactions › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getInferenceUtilsTests()) {
  test(`Inference utils › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getInferenceControllerTests()) {
  test(`Inference controller › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getPersistenceTests()) {
  test(`Persistence › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getSelectionTests()) {
  test(`Selection › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getModStateTests()) {
  test(`Modifiers › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getGridKeysTests()) {
  test(`Grid keys › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getColumnKindTests()) {
  test(`Column kinds › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getCommentTests()) {
  test(`Comments › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getModelSnapshotTests()) {
  test(`Model snapshot › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getUiGridMouseTests()) {
  test(`UI › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getUiRowDragTests()) {
  test(`UI › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getColumnResizeTests()) {
  test(`UI › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getRowInsertionTests()) {
  test(`Rows › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getDeletionTests()) {
  test(`Deletion › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getUndoTests()) {
  test(`Undo › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getClipboardTests()) {
  test(`Clipboard › ${spec.name}`, () => spec.run(sharedAssert));
}

for (const spec of getCleanupTests()) {
  test(`Cleanup › ${spec.name}`, () => spec.run(sharedAssert));
}
