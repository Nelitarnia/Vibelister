import { mapRowsToIndex } from "../../../app/inference-index-access.js";

export function getInferenceIndexAccessTests() {
  return [
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
        const afterVersionBump = mapRowsToIndex([0, 1], sourceAccess, targetAccess);
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
