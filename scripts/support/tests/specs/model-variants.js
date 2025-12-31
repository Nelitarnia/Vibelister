import {
  buildInteractionsPairs,
  buildScopedInteractionsPairs,
  collectVariantsForAction,
} from "../../../data/variants/variants.js";
import { MOD } from "../../../data/constants.js";
import {
  getInteractionsPair,
  getInteractionsRowCount,
} from "../../../app/interactions-data.js";
import { makeModelFixture } from "./model-fixtures.js";

export function getModelVariantTests() {
  function collectPairs(model) {
    const total = getInteractionsRowCount(model);
    const out = [];
    for (let r = 0; r < total; r++) {
      const pair = getInteractionsPair(model, r);
      if (pair) out.push(pair);
    }
    return out;
  }

  return [
    {
      name: "basic action/input cross product",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        addAction("A1");
        addAction("A2");
        addInput("I1");
        addInput("I2");
        addInput("I3");
        const stats = buildInteractionsPairs(model);
        assert.strictEqual(stats.actionsCount, 2, "expected 2 actions");
        assert.strictEqual(stats.inputsCount, 3, "expected 3 inputs");
        assert.strictEqual(stats.pairsCount, 6, "2×3 combinations");
        assert.ok(stats.variantDiagnostics, "variant diagnostics are provided");
        assert.strictEqual(
          stats.variantDiagnostics.accepted,
          stats.actionsCount,
          "each action contributes its base variant",
        );
      },
    },
    {
      name: "canonical notes survive modifier reorder",
      run(assert) {
        const { model, addAction, addInput, addModifier, groupExact } =
          makeModelFixture();
        const action = addAction("Atk");
        addInput("Square");
        const m1 = addModifier("mod a");
        const m2 = addModifier("mod b");
        action.modSet = { [m1.id]: true, [m2.id]: true };
        groupExact(2, [m1, m2], { required: true, name: "G" });

        let stats = buildInteractionsPairs(model);
        assert.strictEqual(stats.pairsCount, 1, "exact-2 yields a single pair");

        for (const pair of collectPairs(model)) {
          const key = `${pair.aId}|${pair.iId}|${pair.variantSig}`;
          model.notes[key] = { result: "works", notes: "" };
        }

        [model.modifiers[0], model.modifiers[1]] = [
          model.modifiers[1],
          model.modifiers[0],
        ];

        stats = buildInteractionsPairs(model);
        assert.strictEqual(stats.pairsCount, 1, "regen keeps single combo");

        const pair = collectPairs(model)[0];
        const key = `${pair.aId}|${pair.iId}|${pair.variantSig}`;
        assert.strictEqual(
          model.notes[key]?.result,
          "works",
          "note lookup survives modifier reorder",
        );
      },
    },
    {
      name: "variant ordering respects modifier row order",
      run(assert) {
        const { model, addAction, addInput, addModifier, groupExact } =
          makeModelFixture();
        const mods = ["a", "b", "c", "d", "e"].map((n) =>
          addModifier("mod " + n),
        );
        const [ma, mb, mc, md, me] = mods;
        groupExact(1, [ma, mb], { required: true, name: "G1" });
        groupExact(2, [mc, md, me], { required: true, name: "G2" });
        addAction("Atk", {
          [ma.id]: 1,
          [mb.id]: 1,
          [mc.id]: 1,
          [md.id]: 1,
          [me.id]: 1,
        });
        addInput("Btn");

        const stats = buildInteractionsPairs(model);
        assert.strictEqual(stats.pairsCount, 6, "EXACT1 × EXACT2 = 6 variants");

        const sigs = collectPairs(model).map((p) => p.variantSig);
        const expected = [
          `${ma.id}+${mc.id}+${md.id}`,
          `${ma.id}+${mc.id}+${me.id}`,
          `${ma.id}+${md.id}+${me.id}`,
          `${mb.id}+${mc.id}+${md.id}`,
          `${mb.id}+${mc.id}+${me.id}`,
          `${mb.id}+${md.id}+${me.id}`,
        ];
        assert.deepStrictEqual(sigs, expected, "variant order is stable");
      },
    },
    {
      name: "mutex constraints honor variant generation",
      run(assert) {
        const { model, addAction, addInput, addModifier, groupExact } =
          makeModelFixture();
        const mX = addModifier("X");
        const mY = addModifier("Y");
        const mZ = addModifier("Z");
        model.modifierConstraints.push({ type: "MUTEX", ids: [mX.id, mY.id] });
        groupExact(1, [mX, mY, mZ], { required: true, name: "G" });
        addAction("Atk", { [mX.id]: 1, [mY.id]: 1, [mZ.id]: 1 });
        addInput("Btn");

        const stats = buildInteractionsPairs(model);
        assert.strictEqual(
          stats.pairsCount,
          3,
          "mutex inside EXACT-1 group does not reduce combinations",
        );
      },
    },
    {
      name: "optional groups without eligible members are ignored",
      run(assert) {
        const { model, addAction, addInput, addModifier, groupExact } =
          makeModelFixture();
        const g1 = addModifier("G1 member");
        const g2 = addModifier("G2 member");
        const action = addAction("Atk", { [g1.id]: MOD.ON });
        addInput("Btn");
        groupExact(1, [g1], { required: false, name: "Group 1" });
        groupExact(1, [g2], { required: false, name: "Group 2" });

        const stats = buildInteractionsPairs(model);

        assert.strictEqual(
          stats.pairsCount,
          2,
          "action should yield base and modifier variants",
        );

        assert.deepStrictEqual(
          model.interactionsIndex.variantCatalog[action.id],
          ["", `${g1.id}`],
          "variant catalog should include the eligible modifier",
        );
      },
    },
    {
      name: "required modifiers prune variant combos",
      run(assert) {
        const { model, addAction, addInput, addModifier, groupExact } =
          makeModelFixture();
        const req = addModifier("Mandatory");
        const opt = addModifier("Optional");
        groupExact(1, [req, opt], { required: true, name: "PickOne" });
        addAction("Atk", { [req.id]: MOD.REQUIRES, [opt.id]: MOD.ON });
        addInput("Btn");

        const stats = buildInteractionsPairs(model);
        assert.strictEqual(stats.pairsCount, 1, "only one variant should remain");

        const sigs = collectPairs(model).map((pair) => pair.variantSig);
        assert.deepStrictEqual(
          sigs,
          [`${req.id}`],
          "required modifier must appear in every variant",
        );
      },
    },
    {
      name: "required modifiers persist without groups",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        const req = addModifier("Mandatory");
        addAction("Atk", { [req.id]: MOD.REQUIRES });
        addInput("Btn");

        const stats = buildInteractionsPairs(model);
        assert.strictEqual(
          stats.pairsCount,
          1,
          "single variant still emitted without groups",
        );

        const sigs = collectPairs(model).map((pair) => pair.variantSig);
        assert.deepStrictEqual(
          sigs,
          [`${req.id}`],
          "required modifier should be preserved even without groups",
        );
      },
    },
    {
      name: "scoped cache reused when base version is stable",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        const action = addAction("A1");
        addAction("A2");
        addInput("I1");

        buildInteractionsPairs(model);
        const first = buildScopedInteractionsPairs(model, [action.id]);

        assert.ok(first.index, "scoped index produced");
        assert.ok(first.summary, "scoped summary produced");

        const second = buildScopedInteractionsPairs(model, [action.id]);
        assert.strictEqual(
          second.index,
          first.index,
          "cached scoped index returned when version matches",
        );
        assert.strictEqual(
          second.summary,
          first.summary,
          "cached scoped summary reused",
        );
      },
    },
    {
      name: "scoped cache invalidated after base version bump",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        const action = addAction("A1");
        addInput("I1");

        const first = buildScopedInteractionsPairs(model, [action.id]);
        const cachedIndex = first.index;

        buildInteractionsPairs(model);

        const second = buildScopedInteractionsPairs(model, [action.id]);
        assert.ok(second.index !== cachedIndex, "version change rebuilds scoped index");
        assert.ok(
          model.interactionsIndexCache?.[`d:${action.id}`]?.baseVersion,
          "cache entry tracked base version",
        );
      },
    },
    {
      name: "required group with no eligible members marks variants invalid",
      run(assert) {
        const { model, addAction, addInput, addModifier, groupExact } =
          makeModelFixture();
        const ghost = addModifier("Ghost");
        groupExact(1, [ghost], { name: "Empty required" });
        const action = addAction("Idle");
        addInput("Tap");

        const { variants, diagnostics } = collectVariantsForAction(action, model);
        assert.deepStrictEqual(
          variants,
          [],
          "no variants emitted when required group cannot be satisfied",
        );
        assert.strictEqual(
          diagnostics.truncated,
          true,
          "diagnostics mark generation as truncated",
        );
        assert.strictEqual(
          diagnostics.invalid,
          true,
          "diagnostics surface invalid generation state",
        );
        assert.ok(
          diagnostics.truncatedGroups.some((g) => g.type === "group-missing"),
          "missing required group is reported",
        );

        const stats = buildInteractionsPairs(model);
        assert.strictEqual(stats.pairsCount, 0, "no rows generated for invalid variants");
        assert.strictEqual(
          stats.variantDiagnostics.invalidActions,
          1,
          "build summary tallies invalid actions",
        );
      },
    },
    {
      name: "group truncations surface in build summaries",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        const mods = Array.from({ length: 17 }, (_, i) => addModifier(`M${i}`));
        const modSet = mods.reduce((acc, mod) => {
          acc[mod.id] = 1;
          return acc;
        }, {});
        const action = addAction("Overflow", modSet);
        addInput("Only");
        model.modifierGroups.push({
          id: model.nextId++,
          name: "Big group",
          mode: "RANGE",
          kMin: 0,
          kMax: mods.length,
          required: false,
          memberIds: mods.map((m) => m.id),
        });

        const stats = buildInteractionsPairs(model);
        assert.strictEqual(stats.capped, true, "group truncation marks build as capped");
        assert.strictEqual(stats.cappedActions, 1, "only the overflowing action is capped");
        assert.ok(stats.groupTruncations.length > 0, "surface truncated group metadata");
        const forAction = stats.groupTruncations.find((g) => g.actionId === action.id);
        assert.ok(forAction, "associate truncation with its action");
        assert.strictEqual(
          forAction.groupName,
          "Big group",
          "include group name in truncation diagnostics",
        );
        assert.strictEqual(
          stats.variantDiagnostics.truncatedGroupCount,
          stats.groupTruncations.length,
          "variant diagnostics mirror truncation count",
        );
      },
    },
    {
      name: "variant cap still yields rows",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        addAction("A");
        addInput("I");
        for (let i = 0; i < 20; i++) addModifier("m" + i);
        model.modifierGroups.push({
          id: model.nextId++,
          name: "G",
          mode: "AT_LEAST",
          k: 0,
          required: true,
          memberIds: model.modifiers.map((m) => m.id),
        });
        model.actions[0].modSet = Object.fromEntries(
          model.modifiers.map((m) => [m.id, true]),
        );
        const stats = buildInteractionsPairs(model);
        assert.ok(stats.pairsCount >= 1, "cap path should still emit rows");
        assert.ok(
          stats.variantDiagnostics.candidates >=
            stats.variantDiagnostics.accepted,
          "diagnostic counters track generator yields",
        );
      },
    },
    {
      name: "variant caps are configurable via model metadata",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        model.meta.variantCaps = { variantCapPerAction: 2, variantCapPerGroup: 3 };
        const mods = Array.from({ length: 6 }, (_, i) => addModifier(`Cap${i}`));
        const action = addAction(
          "Capped",
          mods.reduce((acc, mod) => {
            acc[mod.id] = MOD.ON;
            return acc;
          }, {}),
        );
        addInput("Btn");
        model.modifierGroups.push({
          id: model.nextId++,
          name: "Configurable cap",
          mode: "AT_LEAST",
          k: 0,
          required: false,
          memberIds: mods.map((m) => m.id),
        });

        const stats = buildInteractionsPairs(model);
        const variants = model.interactionsIndex.variantCatalog[action.id];

        assert.strictEqual(stats.variantCaps.variantCapPerAction, 2, "caps surface in summaries");
        assert.strictEqual(stats.capped, true, "custom action cap marks build as capped");
        assert.strictEqual(stats.cappedActions, 1, "only the overflowing action is capped");
        assert.strictEqual(variants.length, 2, "per-action cap limits emitted variants");
        assert.ok(
          stats.groupTruncations.some((g) => g.limit === 3),
          "group truncation respects configured cap",
        );
      },
    },
  ];
}
