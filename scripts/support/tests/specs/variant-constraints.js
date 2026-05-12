import {
  buildConstraintMaps,
  isSignatureFullyBypassed,
  splitCanonicalSignatureToModifierIds,
  violatesConstraints,
} from "../../../data/variants/variant-constraints.js";
import { canonicalSig } from "../../../data/variants/variants.js";
import { MOD_STATE_ID } from "../../../data/mod-state.js";

export function getVariantConstraintTests() {
  return [
    {
      name: "builds immutable descriptor maps",
      run(assert) {
        const maps = buildConstraintMaps([
          { type: "REQUIRES", a: 1, b: 2 },
          { type: "FORBIDS", a: 2, b: 3 },
          { type: "MUTEX", ids: [4, 5] },
        ]);

        assert.ok(Object.isFrozen(maps), "descriptor should be frozen");
        assert.ok(Object.isFrozen(maps.mut), "mutex set should be frozen");
        assert.ok(Object.isFrozen(maps.req), "requires map should be frozen");
        assert.ok(
          Object.isFrozen(maps.req.get(1)),
          "requires entry should be frozen",
        );
        assert.ok(
          Object.isFrozen(maps.forb.get(2)),
          "forbid entry should be frozen",
        );
      },
    },
    {
      name: "detects constraint violations",
      run(assert) {
        const maps = buildConstraintMaps([
          { type: "REQUIRES", a: 1, b: 2 },
          { type: "FORBIDS", a: 2, b: 3 },
          { type: "MUTEX", ids: [4, 5, 6] },
        ]);

        assert.ok(
          violatesConstraints([1], maps),
          "requires violation should be detected when dependency missing",
        );
        assert.ok(
          violatesConstraints([2, 3], maps),
          "forbid pair should trigger violation",
        );
        assert.ok(
          violatesConstraints([4, 6], maps),
          "mutex pairs should be rejected",
        );
        assert.ok(
          !violatesConstraints([1, 2, 4], maps),
          "compatible sets should pass",
        );
      },
    },
    {
      name: "splits canonical signatures into modifier ids",
      run(assert) {
        const ids = splitCanonicalSignatureToModifierIds(canonicalSig("7+2+7"));
        assert.deepStrictEqual(ids, [2, 7], "canonicalized signature ids split");
        assert.deepStrictEqual(
          splitCanonicalSignatureToModifierIds(""),
          [],
          "empty signature yields empty list",
        );
      },
    },
    {
      name: "detects fully bypassed signatures from mod-set state",
      run(assert) {
        const modSet = {
          2: MOD_STATE_ID.BYPASS,
          7: MOD_STATE_ID.BYPASS,
          9: MOD_STATE_ID.ON,
        };
        assert.ok(
          isSignatureFullyBypassed("2+7", modSet),
          "all signature modifiers bypassed",
        );
        assert.ok(
          !isSignatureFullyBypassed("2+9", modSet),
          "non-bypass modifier blocks full bypass classification",
        );
      },
    },
  ];
}
