import { MOD, SCHEMA_VERSION } from "../../../data/constants.js";
import { runProjectMigrationsInPlace } from "../../../data/migrations/index.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const FIXTURES = [
  {
    name: "schema 0 legacy fixture",
    input: {
      meta: {
        schema: 0,
        projectName: 42,
        projectInfo: "line1\r\nline2",
        interactionsMode: "legacy",
        columnWidths: { a: 120, b: -1, c: "w" },
      },
      actions: [
        {
          id: 1,
          name: "Action",
          modSet: { 1: true, 2: 99, 3: "requires" },
          properties: [" a ", "", "a"],
        },
      ],
      inputs: [{ name: "Input" }],
      modifiers: [{ name: "Mod" }],
      outcomes: [{ id: 2, name: "Outcome" }],
      notes: {
        x: { source: "manual", confidence: 1 },
        y: { result: "Outcome" },
        z: { endFree: "Action" },
      },
      comments: { actions: { 1: { text: "ok" } }, inputs: "bad" },
      interactionsPairs: "bad",
      interactionsIndex: { mode: "AI", groups: "bad" },
      nextId: "bad",
    },
    assertNormalized(assert, model) {
      assert.strictEqual(model.meta.schema, SCHEMA_VERSION);
      assert.strictEqual(model.meta.projectName, "");
      assert.strictEqual(model.meta.projectInfo, "line1\nline2");
      assert.strictEqual(model.meta.interactionsMode, "AI");
      assert.deepStrictEqual(model.meta.columnWidths, { a: 120 });
      assert.deepStrictEqual(model.actions[0].properties, ["a"]);
      assert.strictEqual(model.actions[0].modSet[1], MOD.ON);
      assert.strictEqual(model.actions[0].modSet[2], MOD.OFF);
      assert.strictEqual(model.actions[0].modSet[3], MOD.REQUIRES);
      assert.deepStrictEqual(model.notes.x, {});
      assert.strictEqual(model.notes.y.outcomeId, 2);
      assert.ok(!("result" in model.notes.y));
      assert.strictEqual(model.notes.z.endActionId, 1);
      assert.strictEqual(model.notes.z.endVariantSig, "");
      assert.ok(!("endFree" in model.notes.z));
      assert.ok(Array.isArray(model.interactionsPairs));
      assert.ok(Array.isArray(model.interactionsIndex.groups));
      assert.ok(Number.isFinite(model.nextId));
    },
  },
  {
    name: "schema 1 fixture migrates to schema 2",
    input: {
      meta: {
        schema: 1,
        projectName: "Current",
        projectInfo: "already normalized",
        interactionsMode: "AI",
      },
      actions: [],
      inputs: [],
      modifiers: [],
      outcomes: [],
      modifierGroups: [],
      modifierConstraints: [],
      notes: {
        a: { result: "Unknown Outcome" },
        b: { endFree: "Unknown Action" },
      },
      comments: {},
      interactionsPairs: [],
      interactionsIndex: { mode: "AI", groups: [] },
      nextId: 1,
    },
    assertNormalized(assert, model) {
      assert.strictEqual(model.meta.schema, SCHEMA_VERSION);
      assert.strictEqual(model.meta.projectName, "Current");
      assert.strictEqual(model.nextId, 1);
      assert.deepStrictEqual(model.notes.a, {});
      assert.deepStrictEqual(model.notes.b, {});
    },
  },
];

export function getMigrationTests() {
  return [
    ...FIXTURES.map((fixture) => ({
      name: `fixture migration normalizes ${fixture.name}`,
      run(assert) {
        const migrated = clone(fixture.input);
        runProjectMigrationsInPlace(migrated);
        fixture.assertNormalized(assert, migrated);
      },
    })),
    {
      name: "migrations are idempotent when run twice",
      run(assert) {
        const once = clone(FIXTURES[0].input);
        runProjectMigrationsInPlace(once);

        const twice = clone(once);
        runProjectMigrationsInPlace(twice);

        assert.deepStrictEqual(twice, once);
      },
    },
  ];
}
