import { buildScopePlan } from "../../../app/inference-targets.js";
import { createInferenceIndexAccess } from "../../../app/inference-index-access.js";
import { createInferencePolicy } from "../../../app/inference-policy.js";


function toPolicy(options = {}) {
  return createInferencePolicy(options);
}

function makeIndexAccess(includeBypass, pairs) {
  return {
    includeBypass,
    getPair: (rowIndex) => pairs[rowIndex] || null,
    getRowCount: () => pairs.length,
  };
}


function makeBypassResolveFixture() {
  const basePairs = [
    { kind: "AI", aId: 1, iId: 1, variantSig: "" },
    { kind: "AI", aId: 1, iId: 2, variantSig: "mod:enabled", isBypassVariant: false },
  ];
  const bypassPairs = [
    ...basePairs,
    { kind: "AI", aId: 1, iId: 2, variantSig: "mod:enabled", isBypassVariant: true },
    { kind: "AI", aId: 2, iId: 1, variantSig: "mod:enabled", isBypassVariant: true },
  ];
  const model = {
    interactionsIndexVersion: 1,
    notes: { "ai|1|2|mod:enabled": { outcomeId: 3 } },
    interactionsIndexBypass: { baseVersion: 1, pairs: bypassPairs },
  };
  const getInteractionsPair = (_model, rowIndex, opts = {}) =>
    opts.includeBypass ? bypassPairs[rowIndex] : basePairs[rowIndex];
  const getInteractionsRowCount = (_model, opts = {}) =>
    opts.includeBypass ? bypassPairs.length : basePairs.length;
  const manager = createInferenceIndexAccess({
    model,
    sel: { r: 1 },
    getInteractionsPair,
    getInteractionsRowCount,
  });
  const resolveRows = (_scope, access) =>
    Array.from({ length: access.getRowCount() }, (_, i) => i);
  return { manager, resolveRows };
}

export function getInferenceControllerTests() {
  return [

    {
      name: "expandWritableBypass writable expansion matches strict on/off for same selection scope",
      run(assert) {
        const { manager, resolveRows } = makeBypassResolveFixture();
        const strictOff = manager.resolveIndexAccess(
          toPolicy({
            scope: "action",
            expandWritableBypass: true,
            expandReadableBypass: false,
            manualOnlyEvidence: false,
          }),
          resolveRows,
        );
        const strictOn = manager.resolveIndexAccess(
          toPolicy({
            scope: "action",
            expandWritableBypass: true,
            expandReadableBypass: false,
            manualOnlyEvidence: true,
          }),
          resolveRows,
        );
        assert.deepStrictEqual(
          strictOn.writableRows,
          strictOff.writableRows,
          "strict mode must not alter writable bypass expansion",
        );
      },
    },
    {
      name: "strict manual evidence preserves writable suggestion potential",
      run(assert) {
        const { manager, resolveRows } = makeBypassResolveFixture();
        const strictOff = manager.resolveIndexAccess(
          toPolicy({
            scope: "action",
            expandWritableBypass: true,
            expandReadableBypass: false,
            manualOnlyEvidence: false,
          }),
          resolveRows,
        );
        const strictOn = manager.resolveIndexAccess(
          toPolicy({
            scope: "action",
            expandWritableBypass: true,
            expandReadableBypass: false,
            manualOnlyEvidence: true,
          }),
          resolveRows,
        );
        assert.strictEqual(
          strictOff.suggestionRows.length > 0,
          true,
          "strict-off run should keep nonzero suggestion evidence",
        );
        assert.strictEqual(
          strictOn.suggestionRows.length > 0,
          true,
          "strict-on run should not collapse suggestion evidence to zero",
        );
      },
    },
    {
      name: "strict selection evidence scope is stable across writable-scope toggles",
      run(assert) {
        const selection = { rows: new Set([0]) };
        const base = {
          requestedScope: "selection",
          selection,
          indexAccess: makeIndexAccess(true, [{ aId: 7, iId: 2 }]),
          options: toPolicy({ manualOnlyEvidence: true, expandReadableBypass: false }),
        };
        const withoutBypassWrites = buildScopePlan({
          ...base,
          options: toPolicy({ ...base.options, expandWritableBypass: false }),
        });
        const withBypassWrites = buildScopePlan({
          ...base,
          options: toPolicy({ ...base.options, expandWritableBypass: true }),
        });
        assert.strictEqual(withoutBypassWrites.suggestion.scope, "selection");
        assert.strictEqual(withBypassWrites.suggestion.scope, "selection");
      },
    },
    {
      name: "selection suggestion scope matrix across inferFrom/inferTo bypass options",
      run(assert) {
        const selection = { rows: new Set([0]) };
        const combinations = [
          {
            expandReadableBypass: false,
            expandWritableBypass: false,
            expectedScope: "selection",
          },
          {
            expandReadableBypass: true,
            expandWritableBypass: false,
            expectedScope: "project",
          },
          {
            expandReadableBypass: false,
            expandWritableBypass: true,
            expectedScope: "selection",
          },
          {
            expandReadableBypass: true,
            expandWritableBypass: true,
            expectedScope: "project",
          },
        ];

        for (const options of combinations) {
          const plan = buildScopePlan({
            requestedScope: "selection",
            selection,
            indexAccess: makeIndexAccess(true, [{ aId: 7, iId: 2 }]),
            options: toPolicy(options),
          });
          assert.strictEqual(
            plan.suggestion.scope,
            options.expectedScope,
            `scope mismatch for inferFrom=${options.expandReadableBypass} inferTo=${options.expandWritableBypass}`,
          );
        }
      },
    },
    {
      name: "uses action suggestion scope for regular selection",
      run(assert) {
        const selection = { rows: new Set([0]) };
        const plan = buildScopePlan({
          requestedScope: "selection",
          selection,
          indexAccess: makeIndexAccess(false, [{ aId: 1, iId: 10 }]),
          options: toPolicy({}),
        });
        assert.strictEqual(plan.requested.scope, "selection");
        assert.deepStrictEqual(plan.requested.selectionActionIds, [1]);
        assert.strictEqual(plan.suggestion.scope, "action");
      },
    },
    {
      name: "broadens suggestion scope when bypass inference can read",
      run(assert) {
        const selection = { rows: new Set([0]) };
        const plan = buildScopePlan({
          requestedScope: "selection",
          selection,
          indexAccess: makeIndexAccess(true, [{ aId: 7, iId: 2 }]),
          options: toPolicy({ expandReadableBypass: true, expandWritableBypass: true }),
        });
        assert.strictEqual(plan.suggestion.scope, "project");
        assert.strictEqual(plan.suggestion.reason, "bypassSelection");
      },
    },
    {
      name: "expandWritableBypass alone does not broaden selection suggestions",
      run(assert) {
        const selection = { rows: new Set([0]) };
        const plan = buildScopePlan({
          requestedScope: "selection",
          selection,
          indexAccess: makeIndexAccess(true, [{ aId: 7, iId: 2 }]),
          options: toPolicy({ expandReadableBypass: false, expandWritableBypass: true }),
        });
        assert.strictEqual(plan.suggestion.scope, "selection");
        assert.strictEqual(plan.suggestion.reason, "requested");
      },
    },
    {
      name: "keeps requested scope when bypass selection spans actions",
      run(assert) {
        const selection = { rows: new Set([0, 1]) };
        const plan = buildScopePlan({
          requestedScope: "selection",
          selection,
          indexAccess: makeIndexAccess(true, [
            { aId: 3, iId: 1 },
            { aId: 4, iId: 1 },
          ]),
          options: toPolicy({ expandReadableBypass: true, expandWritableBypass: true }),
        });
        assert.strictEqual(plan.suggestion.scope, "selection");
        assert.strictEqual(plan.suggestion.reason, "requested");
      },
    },
  ];
}
