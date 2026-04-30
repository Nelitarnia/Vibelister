import { mapRowsToIndex } from "../../../app/inference-index-access.js";
import {
  isBaselineVisibleRow,
  isBypassRow,
  isVariantRow,
} from "../../../app/interactions-row-classification.js";

export function getInferenceIndexAccessTests() {
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
          { kind: "AI", aId: 1, iId: 1, variantSig: "", isBypassVariant: false },
          { kind: "AI", aId: 1, iId: 1, variantSig: "", isBypassVariant: true },
          { kind: "AI", aId: 1, iId: 2, variantSig: "mod:x", isBypassVariant: false },
          { kind: "AI", aId: 1, iId: 2, variantSig: "mod:x", isBypassVariant: true },
        ];

        assert.deepStrictEqual(rows.map((pair) => isVariantRow(pair)), [
          false,
          false,
          true,
          true,
        ]);
        assert.deepStrictEqual(rows.map((pair) => isBypassRow(pair)), [
          false,
          true,
          false,
          true,
        ]);
        assert.deepStrictEqual(rows.map((pair) => isBaselineVisibleRow(pair)), [
          true,
          false,
          true,
          false,
        ]);
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
  ];
}
