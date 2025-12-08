import {
  modStateActiveish,
  modStateIsOn,
  modStateIsRequired,
  modStateSelectors,
  normalizeModStateValue,
} from "../../../data/variants/mod-state-normalize.js";
import { MOD_STATE_MAX_VALUE, MOD_STATE_MIN_VALUE } from "../../../data/mod-state.js";

export function getVariantNormalizationTests() {
  return [
    {
      name: "normalizes raw modifier state inputs",
      run(assert) {
        assert.strictEqual(normalizeModStateValue("2"), 2, "string numbers should parse");
        assert.strictEqual(
          normalizeModStateValue(MOD_STATE_MAX_VALUE + 1),
          null,
          "values beyond max should be rejected",
        );
        assert.strictEqual(
          normalizeModStateValue(MOD_STATE_MIN_VALUE - 1),
          null,
          "values below min should be rejected",
        );
        assert.strictEqual(normalizeModStateValue("not-a-number"), null, "NaN should fail");
        assert.strictEqual(normalizeModStateValue(3.9), 3, "values should truncate to ints");
      },
    },
    {
      name: "interprets active, marked, and required state buckets",
      run(assert) {
        assert.ok(modStateIsOn(1), "ON should count as active");
        assert.ok(modStateIsOn(3), "REQUIRES should count as active");
        assert.ok(modStateActiveish(2), "BYPASS should count as marked");
        assert.ok(modStateActiveish(1), "ON should count as marked");
        assert.ok(modStateIsRequired(3), "REQUIRES should be required");

        assert.ok(!modStateIsOn(0), "OFF should not be active");
        assert.ok(!modStateActiveish(null), "null should be ignored");
        assert.ok(!modStateIsRequired(1), "ON should not be required");
      },
    },
    {
      name: "exposes compact selector map",
      run(assert) {
        assert.deepStrictEqual(
          Object.keys(modStateSelectors).sort(),
          ["isActiveish", "isOn", "isRequired", "normalize"],
          "selectors should be discoverable",
        );
        assert.strictEqual(modStateSelectors.isOn, modStateIsOn, "exports reuse helpers");
      },
    },
  ];
}
