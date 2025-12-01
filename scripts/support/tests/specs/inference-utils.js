import {
  cloneValue,
  extractNoteFieldValue,
  normalizeActionId,
  normalizeInputKey,
  normalizeVariantSig,
  parseModifierIds,
  valueKey,
} from "../../../app/inference-utils.js";

export function getInferenceUtilsTests() {
  return [
    {
      name: "normalizes pair identifiers",
      run(assert) {
        assert.strictEqual(normalizeVariantSig({ variantSig: 7 }), "7");
        assert.strictEqual(normalizeVariantSig({ variantSig: "7+9" }), "7+9");
        assert.strictEqual(normalizeActionId({ aId: "12" }), 12);
        assert.strictEqual(normalizeInputKey({ kind: "AA", rhsActionId: 4 }), "rhs:4");
        assert.strictEqual(normalizeInputKey({ kind: "ai", iId: 3 }), "in:3");
      },
    },
    {
      name: "extracts, keys, and clones values consistently",
      run(assert) {
        const note = {
          outcomeId: 2,
          endActionId: 5,
          endVariantSig: "m1",
          tags: ["Alpha", "beta", "alpha"],
        };
        const outcome = extractNoteFieldValue(note, "outcome");
        const end = extractNoteFieldValue(note, "end");
        const tag = extractNoteFieldValue(note, "tag");
        assert.deepStrictEqual(outcome, { outcomeId: 2 });
        assert.deepStrictEqual(end, { endActionId: 5, endVariantSig: "m1" });
        assert.deepStrictEqual(tag, { tags: ["Alpha", "beta"] });
        assert.strictEqual(valueKey("tag", tag), "t:Alpha|beta");
        assert.deepStrictEqual(cloneValue("end", end), end);
      },
    },
    {
      name: "parses modifier identifiers from variant signatures",
      run(assert) {
        assert.deepStrictEqual(parseModifierIds("1+2+oops"), [1, 2]);
        assert.deepStrictEqual(parseModifierIds({ variantSig: "4" }), [4]);
        assert.deepStrictEqual(parseModifierIds(null), []);
      },
    },
  ];
}
