import { buildInteractionsPairs } from "../../../data/variants/variants.js";
import { makeModelFixture } from "./model-fixtures.js";

export function getModelVariantTests() {
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

        for (const pair of model.interactionsPairs) {
          const key = `${pair.aId}|${pair.iId}|${pair.variantSig}`;
          model.notes[key] = { result: "works", notes: "" };
        }

        [model.modifiers[0], model.modifiers[1]] = [
          model.modifiers[1],
          model.modifiers[0],
        ];

        stats = buildInteractionsPairs(model);
        assert.strictEqual(stats.pairsCount, 1, "regen keeps single combo");

        const pair = model.interactionsPairs[0];
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
        const mods = ["a", "b", "c", "d", "e"].map((n) => addModifier("mod " + n));
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

        const sigs = model.interactionsPairs.map((p) => p.variantSig);
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
      },
    },
  ];
}
