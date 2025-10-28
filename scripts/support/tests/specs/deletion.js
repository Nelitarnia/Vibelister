import { sanitizeModifierRulesAfterDeletion } from "../../../data/deletion.js";
import { makeModelFixture } from "./model-fixtures.js";

export function getDeletionTests() {
  return [
    {
      name: "prunes modifier groups and constraints when a modifier is removed",
      run(assert) {
        const { model, addModifier } = makeModelFixture();
        const modA = addModifier("A");
        const modB = addModifier("B");
        const modC = addModifier("C");

        model.modifierGroups.push(
          { id: 101, name: "duo", ids: [modA.id, modB.id] },
          { id: 102, name: "trio", members: [modA.id, modB.id, modC.id] },
        );

        model.modifierConstraints.push(
          { type: "PAIR", aId: modA.id, bId: modB.id },
          {
            type: "COMPLEX",
            left: modA.id,
            right: modC.id,
            forbids: [modA.id, modB.id, modC.id],
            nested: { pointer: modB.id, list: [modA.id, modB.id] },
          },
          { type: "SPARSE", ids: [modA.id, modC.id, modB.id] },
        );

        sanitizeModifierRulesAfterDeletion(model, [modB.id]);

        assert.deepStrictEqual(
          model.modifierGroups.map((group) => group.id),
          [102],
          "groups that lose too many members are removed",
        );
        assert.deepStrictEqual(
          model.modifierGroups[0].members,
          [modA.id, modC.id],
          "remaining groups retain surviving modifier ids",
        );

        assert.strictEqual(
          model.modifierConstraints.length,
          2,
          "constraints referencing only deleted ids are dropped",
        );

        const [complex, sparse] = model.modifierConstraints;
        assert.strictEqual(
          complex.left,
          modA.id,
          "complex constraint keeps left id",
        );
        assert.strictEqual(
          complex.right,
          modC.id,
          "complex constraint keeps right id",
        );
        assert.deepStrictEqual(
          complex.forbids,
          [modA.id, modC.id],
          "deleted modifiers are removed from forbid lists",
        );
        assert.deepStrictEqual(
          complex.nested.list,
          [modA.id],
          "nested arrays are filtered",
        );
        assert.strictEqual(
          complex.nested.pointer,
          null,
          "nested numeric fields referencing deleted ids are nulled",
        );

        assert.deepStrictEqual(
          sparse.ids,
          [modA.id, modC.id],
          "remaining constraints keep surviving ids",
        );
      },
    },
    {
      name: "keeps modifier groups that do not reference deleted modifiers",
      run(assert) {
        const { model, addModifier, groupExact } = makeModelFixture();
        const modA = addModifier("A");
        const modB = addModifier("B");
        const modC = addModifier("C");
        const modD = addModifier("D");

        groupExact(2, [modA, modB, modC], { name: "trio" });

        sanitizeModifierRulesAfterDeletion(model, [modD.id]);

        assert.strictEqual(
          model.modifierGroups.length,
          1,
          "modifier groups remain when none of their members are deleted",
        );
        assert.deepStrictEqual(
          model.modifierGroups[0].memberIds,
          [modA.id, modB.id, modC.id],
          "memberIds stay intact for unaffected groups",
        );
      },
    },
  ];
}
