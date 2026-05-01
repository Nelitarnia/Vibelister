import { buildScopePlan } from "../../../app/inference-targets.js";

function makeIndexAccess(includeBypass, pairs) {
  return {
    includeBypass,
    getPair: (rowIndex) => pairs[rowIndex] || null,
    getRowCount: () => pairs.length,
  };
}

export function getInferenceControllerTests() {
  return [
    {
      name: "selection suggestion scope matrix across inferFrom/inferTo bypass options",
      run(assert) {
        const selection = { rows: new Set([0]) };
        const combinations = [
          { inferFromBypassed: false, inferToBypassed: false, expectedScope: "action" },
          { inferFromBypassed: true, inferToBypassed: false, expectedScope: "project" },
          { inferFromBypassed: false, inferToBypassed: true, expectedScope: "selection" },
          { inferFromBypassed: true, inferToBypassed: true, expectedScope: "project" },
        ];

        for (const options of combinations) {
          const plan = buildScopePlan({
            requestedScope: "selection",
            selection,
            indexAccess: makeIndexAccess(true, [{ aId: 7, iId: 2 }]),
            options,
          });
          assert.strictEqual(
            plan.suggestion.scope,
            options.expectedScope,
            `scope mismatch for inferFrom=${options.inferFromBypassed} inferTo=${options.inferToBypassed}`,
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
          options: {},
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
          options: { inferFromBypassed: true, inferToBypassed: true },
        });
        assert.strictEqual(plan.suggestion.scope, "project");
        assert.strictEqual(plan.suggestion.reason, "bypassSelection");
      },
    },
    {
      name: "inferToBypassed alone does not broaden selection suggestions",
      run(assert) {
        const selection = { rows: new Set([0]) };
        const plan = buildScopePlan({
          requestedScope: "selection",
          selection,
          indexAccess: makeIndexAccess(true, [{ aId: 7, iId: 2 }]),
          options: { inferFromBypassed: false, inferToBypassed: true },
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
          options: { inferFromBypassed: true, inferToBypassed: true },
        });
        assert.strictEqual(plan.suggestion.scope, "selection");
        assert.strictEqual(plan.suggestion.reason, "requested");
      },
    },
  ];
}
