import {
  GROUP_MODES,
  kCombos,
  rangeCombos,
  groupCombos,
  MAX_GROUP_COMBOS,
} from "../../../data/variants/variant-combinatorics.js";

export function getVariantCombinatoricsTests() {
  return [
    {
      name: "k-combos enumerates unique selections",
      run(assert) {
        assert.deepStrictEqual(kCombos(["a", "b", "c"], 2), [
          ["a", "b"],
          ["a", "c"],
          ["b", "c"],
        ]);
        assert.deepStrictEqual(rangeCombos([1, 2], 0, 1), [[], [1], [2]]);
        assert.deepStrictEqual(kCombos([1, 2, 3], 0), [[]], "zero picks yields empty combo");
      },
    },
    {
      name: "group combos honor modes and requirements",
      run(assert) {
        const optionalEligible = new Set([1, 3]);
        const required = new Set([2]);
        const exact = groupCombos(
          { mode: GROUP_MODES.EXACT, k: 2, memberIds: [1, 2, 3], required: true },
          { optionalEligible, required },
        );
        assert.deepStrictEqual(
          exact,
          [[1], [3]],
          "EXACT group should fill remaining slots from optional eligibles",
        );

        const atMost = groupCombos(
          { mode: GROUP_MODES.AT_MOST, k: 1, memberIds: [1, 2], required: false },
          { optionalEligible, required },
        );
        assert.deepStrictEqual(
          atMost,
          [[]],
          "optional group should include empty choice when requirement fills the quota",
        );
      },
    },
    {
      name: "range combos guard against impossible group sizes",
      run(assert) {
        const optionalEligible = new Set([1]);
        const required = new Set([2]);
        const impossible = groupCombos(
          {
            mode: GROUP_MODES.RANGE,
            kMin: 3,
            kMax: 3,
            memberIds: [1, 2],
            required: true,
          },
          { optionalEligible, required },
        );
        assert.deepStrictEqual(impossible, [], "range that cannot be satisfied should bail early");

        const viable = groupCombos(
          {
            mode: GROUP_MODES.AT_LEAST,
            k: 1,
            memberIds: [1, 2, 3],
            required: false,
          },
          { optionalEligible: new Set([1, 3]), required: new Set() },
        );
        assert.deepStrictEqual(
          viable,
          [[], [1], [3], [1, 3]],
          "at-least groups should emit all eligible subsets",
        );
      },
    },
    {
      name: "group combos report truncation when capped",
      run(assert) {
        const optionalEligible = new Set(Array.from({ length: 17 }, (_, i) => i + 1));
        const oversized = groupCombos(
          {
            mode: GROUP_MODES.RANGE,
            kMin: 0,
            kMax: optionalEligible.size,
            memberIds: Array.from(optionalEligible),
            required: false,
          },
          { optionalEligible, required: new Set() },
        );
        assert.strictEqual(oversized.truncated, true, "flag truncation when hitting the cap");
        assert.strictEqual(
          oversized.length,
          MAX_GROUP_COMBOS,
          "truncate the list at the max group size",
        );

        const smallerCap = 10;
        const resized = groupCombos(
          {
            mode: GROUP_MODES.RANGE,
            kMin: 0,
            kMax: optionalEligible.size,
            memberIds: Array.from(optionalEligible),
            required: false,
          },
          { optionalEligible, required: new Set() },
          { variantCapPerGroup: smallerCap },
        );
        assert.strictEqual(resized.truncated, true, "custom caps should also trigger truncation");
        assert.strictEqual(
          resized.truncationLimit,
          smallerCap,
          "truncation metadata reflects the applied cap",
        );
        assert.strictEqual(
          resized.length,
          smallerCap,
          "custom caps clamp emitted combinations",
        );
      },
    },
  ];
}
