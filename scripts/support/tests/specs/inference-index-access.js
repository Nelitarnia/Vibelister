import { mapRowsToIndex } from "../../../app/inference-index-access.js";
import { createInferenceIndexAccess } from "../../../app/inference-index-access.js";
import {
  isBaselineVisibleRow,
  isBypassRow,
  isVariantRow,
} from "../../../app/interactions-row-classification.js";

export function getInferenceIndexAccessTests() {
  const makeResolveFixture = () => {
    const basePairs = [
      { kind: "AI", aId: 1, iId: 1, variantSig: "" },
      {
        kind: "AI",
        aId: 1,
        iId: 2,
        variantSig: "mod:enabled",
        isBypassVariant: false,
      },
    ];
    const bypassPairs = [
      ...basePairs,
      {
        kind: "AI",
        aId: 1,
        iId: 2,
        variantSig: "mod:enabled",
        isBypassVariant: true,
      },
      {
        kind: "AI",
        aId: 2,
        iId: 1,
        variantSig: "mod:enabled",
        isBypassVariant: true,
      },
    ];
    const model = {
      interactionsIndexVersion: 1,
      notes: {
        "ai|2|1|mod:enabled": "bypassed evidence",
      },
      interactionsIndexBypass: {
        baseVersion: 1,
        pairs: bypassPairs,
      },
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
  };

  return [
    {
      name: "classifies baseline visibility for bypass and non-bypass variant rows",
      run(assert) {
        const enabledVariant = {
          kind: "AI",
          aId: 100,
          iId: 1,
          variantSig: "mod:enabled",
          isBypassVariant: false,
        };
        const bypassedVariant = {
          kind: "AI",
          aId: 100,
          iId: 1,
          variantSig: "mod:enabled",
          isBypassVariant: true,
        };
        const baselinePair = { kind: "AI", aId: 100, iId: 2, variantSig: "" };

        assert.strictEqual(isVariantRow(enabledVariant), true);
        assert.strictEqual(isVariantRow(bypassedVariant), true);
        assert.strictEqual(isVariantRow(baselinePair), false);

        assert.strictEqual(isBypassRow(enabledVariant), false);
        assert.strictEqual(isBypassRow(bypassedVariant), true);

        assert.strictEqual(isBaselineVisibleRow(enabledVariant), true);
        assert.strictEqual(isBaselineVisibleRow(bypassedVariant), false);
        assert.strictEqual(
          isBaselineVisibleRow(bypassedVariant, { includeBypass: true }),
          true,
        );
      },
    },
    {
      name: "classifies empty/non-empty signatures with bypass and non-bypass rows",
      run(assert) {
        const rows = [
          {
            kind: "AI",
            aId: 1,
            iId: 1,
            variantSig: "",
            isBypassVariant: false,
          },
          { kind: "AI", aId: 1, iId: 1, variantSig: "", isBypassVariant: true },
          {
            kind: "AI",
            aId: 1,
            iId: 2,
            variantSig: "mod:x",
            isBypassVariant: false,
          },
          {
            kind: "AI",
            aId: 1,
            iId: 2,
            variantSig: "mod:x",
            isBypassVariant: true,
          },
        ];

        assert.deepStrictEqual(
          rows.map((pair) => isVariantRow(pair)),
          [false, false, true, true],
        );
        assert.deepStrictEqual(
          rows.map((pair) => isBypassRow(pair)),
          [false, true, false, true],
        );
        assert.deepStrictEqual(
          rows.map((pair) => isBaselineVisibleRow(pair)),
          [true, false, true, false],
        );
      },
    },
    {
      name: "reuses row lookup across repeated mappings for the same index",
      run(assert) {
        const targetPairs = [
          { kind: "AI", aId: 10, iId: 1 },
          { kind: "AI", aId: 11, iId: 1 },
          { kind: "AI", aId: 10, iId: 2 },
        ];

        let targetVersion = 1;
        let targetPairReads = 0;
        const targetAccess = {
          includeBypass: false,
          getRowCount: () => targetPairs.length,
          getPair: (rowIndex) => {
            targetPairReads++;
            return targetPairs[rowIndex];
          },
          getVersion: () => targetVersion,
        };

        const sourcePairs = [
          { kind: "AI", aId: 10, iId: 2 },
          { kind: "AI", aId: 11, iId: 1 },
        ];
        const sourceAccess = {
          includeBypass: false,
          getRowCount: () => sourcePairs.length,
          getPair: (rowIndex) => sourcePairs[rowIndex],
          getVersion: () => 1,
        };

        const rows = mapRowsToIndex([0, 1], sourceAccess, targetAccess);
        assert.deepStrictEqual(rows, [1, 2]);
        assert.strictEqual(
          targetPairReads,
          targetPairs.length,
          "building the initial lookup scans all target rows",
        );

        const repeatRows = mapRowsToIndex([0, 1], sourceAccess, targetAccess);
        assert.deepStrictEqual(repeatRows, [1, 2]);
        assert.strictEqual(
          targetPairReads,
          targetPairs.length,
          "memoized lookup prevents redundant scans",
        );

        targetVersion = 2;
        const afterVersionBump = mapRowsToIndex(
          [0, 1],
          sourceAccess,
          targetAccess,
        );
        assert.deepStrictEqual(afterVersionBump, [1, 2]);
        assert.strictEqual(
          targetPairReads,
          targetPairs.length * 2,
          "version change invalidates cached lookup",
        );
      },
    },
    {
      name: "resolves row universes across inferFrom/inferTo bypass combinations",
      run(assert) {
        const combinations = [
          { inferFromBypassed: false, inferToBypassed: false },
          { inferFromBypassed: true, inferToBypassed: false },
          { inferFromBypassed: false, inferToBypassed: true },
          { inferFromBypassed: true, inferToBypassed: true },
        ];
        const results = combinations.map((options) => {
          const { manager, resolveRows } = makeResolveFixture();
          return {
            options,
            resolved: manager.resolveIndexAccess(
              { scope: "project", ...options },
              resolveRows,
            ),
          };
        });
        const key = ({ inferFromBypassed, inferToBypassed }) =>
          `${inferFromBypassed}/${inferToBypassed}`;
        const lookup = new Map(
          results.map((entry) => [key(entry.options), entry.resolved]),
        );

        const noBypass = lookup.get("false/false");
        const inferToOnly = lookup.get("false/true");
        const inferFromOnly = lookup.get("true/false");
        const inferBoth = lookup.get("true/true");

        assert.deepStrictEqual(
          noBypass.sourceRows,
          [0, 1],
          "baseline source rows stay bound to visible baseline rows",
        );
        assert.deepStrictEqual(
          noBypass.suggestionRows,
          [0, 1],
          "baseline suggestion rows stay bound to visible baseline rows",
        );

        assert.strictEqual(
          inferToOnly.sourceRows.length >= noBypass.sourceRows.length,
          true,
          "inferToBypassed never reduces evidence universe",
        );
        assert.strictEqual(
          inferToOnly.suggestionRows.length >= noBypass.suggestionRows.length,
          true,
          "inferToBypassed never reduces suggestion universe",
        );
        assert.deepStrictEqual(
          inferToOnly.sourceRows,
          noBypass.sourceRows,
          "inferToBypassed alone preserves existing source scope behavior",
        );
        assert.deepStrictEqual(
          inferToOnly.suggestionRows,
          noBypass.suggestionRows,
          "inferToBypassed alone preserves existing suggestion scope behavior",
        );
        assert.strictEqual(
          inferToOnly.writableRows.length >= noBypass.writableRows.length,
          true,
          "writable universe does not shrink when inferToBypassed is true",
        );
        assert.strictEqual(
          inferFromOnly.sourceRows.length >= noBypass.sourceRows.length,
          true,
          "inferFromBypassed does not reduce evidence universe",
        );
        assert.strictEqual(
          inferFromOnly.suggestionRows.length >= noBypass.suggestionRows.length,
          true,
          "inferFromBypassed does not reduce suggestion universe",
        );
        assert.strictEqual(
          inferBoth.writableRows.length > inferFromOnly.writableRows.length,
          true,
          "writable universe expands only when inferToBypassed=true",
        );
      },
    },
    {
      name: "falls back to baseline evidence rows when mapped evidence rows are empty",
      run(assert) {
        const model = {
          interactionsIndexVersion: 1,
          interactionsIndexBypass: {
            baseVersion: 1,
            pairs: [
              {
                kind: "AI",
                aId: 10,
                iId: 20,
                variantSig: "mod:x",
                isBypassVariant: true,
              },
            ],
          },
        };
        const basePairs = [{ kind: "AI", aId: 10, iId: 20, variantSig: "" }];
        const getInteractionsPair = (_model, rowIndex, opts = {}) => {
          if (opts.includeBypass) return (opts.index?.pairs || [])[rowIndex];
          return basePairs[rowIndex];
        };
        const getInteractionsRowCount = (_model, opts = {}) =>
          opts.includeBypass
            ? (opts.index?.pairs || []).length
            : basePairs.length;
        const manager = createInferenceIndexAccess({
          model,
          sel: { r: 0 },
          getInteractionsPair,
          getInteractionsRowCount,
        });
        const resolveRows = (_scope, access) =>
          Array.from({ length: access.getRowCount() }, (_, i) => i);
        const result = manager.resolveIndexAccess(
          { scope: "action", inferToBypassed: true, inferFromBypassed: false },
          resolveRows,
        );
        assert.strictEqual(Array.isArray(result.writableRows), true);
        assert.strictEqual(Array.isArray(result.sourceRows), true);
        assert.strictEqual(
          result.sourceRows.length,
          result.suggestionRows.length,
        );
      },
    },
  ];
}
