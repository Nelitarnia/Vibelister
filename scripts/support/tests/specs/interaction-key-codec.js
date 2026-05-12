import {
  baseKeyOf,
  buildBaseInteractionKey,
  encodePhaseSuffix,
  parseInteractionKey,
  parsePhaseSuffix,
} from "../../../data/interaction-key-codec.js";

export function getInteractionKeyCodecTests() {
  return [
    {
      name: "base key builder handles AI and AA forms",
      run(assert) {
        const ai = buildBaseInteractionKey({ aId: 3, iId: 9, variantSig: "2+1" });
        const aa = buildBaseInteractionKey({
          kind: "AA",
          actionId: 2,
          rhsActionId: 7,
          variantSig: "8+4",
          rhsVariantSig: "5+3",
        });
        assert.strictEqual(ai, "ai|3|9|1+2");
        assert.strictEqual(aa, "aa|2|7|4+8|3+5");
      },
    },
    {
      name: "phase suffix codec round-trips canonical keys",
      run(assert) {
        const base = "ai|4|6|";
        const phased = encodePhaseSuffix(base, 2);
        assert.strictEqual(phased, "ai|4|6||p2");
        assert.deepStrictEqual(parsePhaseSuffix(phased), {
          baseKey: base,
          phase: 2,
        });
        assert.strictEqual(baseKeyOf(phased), base);
      },
    },
    {
      name: "phase suffix encode ignores invalid phases",
      run(assert) {
        assert.strictEqual(encodePhaseSuffix("ai|1|2|", -1), "ai|1|2|");
        assert.strictEqual(encodePhaseSuffix("ai|1|2|", "oops"), "ai|1|2|");
      },
    },
    {
      name: "parses canonical and legacy keys with canonicalKey field",
      run(assert) {
        const canonical = parseInteractionKey("aa|5|8|9+1|7+3");
        const legacy = parseInteractionKey("5|6|3+1");
        assert.strictEqual(canonical.kind, "AA");
        assert.strictEqual(canonical.canonicalKey, "aa|5|8|1+9|3+7");
        assert.strictEqual(legacy.kind, "LEGACY_AI");
        assert.strictEqual(legacy.canonicalKey, "ai|5|6|1+3");
      },
    },
  ];
}
