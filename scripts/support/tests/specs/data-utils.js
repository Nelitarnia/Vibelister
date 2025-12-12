import { colOffsets, visibleCols } from "../../../data/utils.js";

export function getDataUtilsTests() {
  return [
    {
      name: "finds partially visible columns across the viewport",
      run(assert) {
        const widths = [40, 60, 80, 50];
        const offsets = colOffsets(widths);
        const result = visibleCols(offsets, 30, 130, widths.length);
        assert.deepStrictEqual(result, { start: 0, end: 2 });
      },
    },
    {
      name: "handles scroll positions near the end of the grid",
      run(assert) {
        const offsets = [0, 25, 55, 90];
        const result = visibleCols(offsets, 70, 50, 3);
        assert.deepStrictEqual(result, { start: 2, end: 2 });
      },
    },
    {
      name: "respects explicit column counts when offsets include more data",
      run(assert) {
        const offsets = colOffsets([10, 20, 30]);
        const result = visibleCols(offsets, 5, 50, 2);
        assert.deepStrictEqual(result, { start: 0, end: 1 });
      },
    },
    {
      name: "returns empty when scrolled beyond the last column edge",
      run(assert) {
        const offsets = colOffsets([20, 30]);
        const result = visibleCols(offsets, 60, 10, 2);
        assert.deepStrictEqual(result, { start: 2, end: 1 });
      },
    },
    {
      name: "treats zero-width viewports as empty",
      run(assert) {
        const offsets = colOffsets([25, 25]);
        const result = visibleCols(offsets, 10, 0, 2);
        assert.deepStrictEqual(result, { start: 0, end: -1 });
      },
    },
  ];
}
