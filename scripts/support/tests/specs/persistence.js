import { createPersistenceController } from "../../../app/persistence.js";
import { MOD } from "../../../data/constants.js";
import { createEmptyCommentMap } from "../../../data/comments.js";
import { makeModelFixture } from "./model-fixtures.js";

export function getPersistenceTests() {
  return [
    {
      name: "openFromDisk ignores blank rows in status counts",
      async run(assert) {
        const { model } = makeModelFixture();
        let statusMessage = "";
        const loadFsModule = async () => ({
          openJson: async () => ({
            name: "project.json",
            data: {
              meta: { schema: 0, projectName: "", interactionsMode: "AI" },
              actions: [
                { id: 1, name: "Alpha", modSet: {} },
                { id: 2, name: "   ", modSet: {} },
                { id: 3, name: "", modSet: {} },
              ],
              inputs: [
                { id: 4, name: "Input A" },
                { id: 5, name: "   " },
              ],
              modifiers: [],
              outcomes: [],
              modifierGroups: [],
              modifierConstraints: [],
              notes: {},
              interactionsPairs: [],
              interactionsIndex: {
                mode: "AI",
                groups: [],
                totalRows: 0,
                actionsOrder: [],
                inputsOrder: [],
                variantCatalog: {},
              },
              nextId: 6,
            },
          }),
        });

        const statusBar = {
          set(message) {
            statusMessage = message;
          },
        };

        const controller = createPersistenceController({
          model,
          statusBar,
          clearHistory: () => {},
          resetAllViewState: () => {},
          setActiveView: () => {},
          sel: null,
          updateProjectNameWidget: () => {},
          setProjectNameFromFile: () => {},
          getSuggestedName: () => "project.json",
          closeMenus: () => {},
          onModelReset: () => {},
          loadFsModule,
        });

        await controller.openFromDisk();

        assert.strictEqual(
          statusMessage,
          "Opened: project.json (1 actions, 1 inputs)",
          "status should reflect only named rows",
        );
      },
    },
    {
      name: "saveToDisk uses injected fs module",
      async run(assert) {
        const { model } = makeModelFixture();
        let statusMessage = "";
        let saveArgs = null;
        let loadCount = 0;
        const fakeModule = {
          openJson: async () => ({
            name: "project.json",
            data: {
              meta: { schema: 0, projectName: "", interactionsMode: "AI" },
              actions: [],
              inputs: [],
              modifiers: [],
              outcomes: [],
              modifierGroups: [],
              modifierConstraints: [],
              notes: {},
              interactionsPairs: [],
              interactionsIndex: {
                mode: "AI",
                groups: [],
                totalRows: 0,
                actionsOrder: [],
                inputsOrder: [],
                variantCatalog: {},
              },
              nextId: 1,
            },
          }),
          async saveJson(data, options) {
            saveArgs = { data, options };
            return { name: "saved-project.json" };
          },
        };
        const loadFsModule = async () => {
          loadCount += 1;
          return fakeModule;
        };

        const statusBar = {
          set(message) {
            statusMessage = message;
          },
        };

        const controller = createPersistenceController({
          model,
          statusBar,
          clearHistory: () => {},
          resetAllViewState: () => {},
          setActiveView: () => {},
          sel: null,
          updateProjectNameWidget: () => {},
          setProjectNameFromFile: () => {},
          getSuggestedName: () => "project.json",
          closeMenus: () => {},
          onModelReset: () => {},
          loadFsModule,
        });

        await controller.openFromDisk();
        statusMessage = "";
        await controller.saveToDisk(true);

        assert.strictEqual(loadCount, 1, "fs module should be loaded once");
        assert.ok(saveArgs, "saveJson should be called");
        assert.strictEqual(saveArgs.data, model, "saveJson should receive the model");
        assert.deepStrictEqual(
          saveArgs.options,
          { as: true, suggestedName: "project.json" },
          "save options should be passed through",
        );
        assert.strictEqual(
          statusMessage,
          "Saved As: saved-project.json",
          "status bar should reflect save result",
        );
      },
    },
    {
      name: "openFromDisk normalizes modifier states",
      async run(assert) {
        const { model } = makeModelFixture();
        const loadFsModule = async () => ({
          openJson: async () => ({
            name: "project.json",
            data: {
              meta: { schema: 0, projectName: "", interactionsMode: "AI" },
              actions: [
                {
                  id: 1,
                  name: "Alpha",
                  modSet: { 1: true, 2: 99, 3: "requires", 4: "!" },
                },
              ],
              inputs: [],
              modifiers: [],
              outcomes: [],
              modifierGroups: [],
              modifierConstraints: [],
              notes: {},
              interactionsPairs: [],
              interactionsIndex: {
                mode: "AI",
                groups: [],
                totalRows: 0,
                actionsOrder: [],
                inputsOrder: [],
                variantCatalog: {},
              },
              nextId: 5,
            },
          }),
        });

        const controller = createPersistenceController({
          model,
          statusBar: null,
          clearHistory: () => {},
          resetAllViewState: () => {},
          setActiveView: () => {},
          sel: null,
          updateProjectNameWidget: () => {},
          setProjectNameFromFile: () => {},
          getSuggestedName: () => "project.json",
          closeMenus: () => {},
          onModelReset: () => {},
          loadFsModule,
        });

        await controller.openFromDisk();

        const action = model.actions[0];
        assert.ok(action, "action should be loaded");
        assert.strictEqual(
          action.modSet[1],
          MOD.ON,
          "boolean true should normalize to ON",
        );
        assert.strictEqual(
          action.modSet[2],
          MOD.OFF,
          "numeric overflow should clamp to OFF",
        );
        assert.strictEqual(
          action.modSet[3],
          MOD.REQUIRES,
          "requires keyword should map to REQUIRES",
        );
        assert.strictEqual(
          action.modSet[4],
          MOD.REQUIRES,
          "glyph input should map to REQUIRES",
        );
      },
    },
    {
      name: "upgradeModelInPlace seeds comments map",
      run(assert) {
        const { model } = makeModelFixture();
        const controller = createPersistenceController({
          model,
          statusBar: null,
          clearHistory: () => {},
          resetAllViewState: () => {},
          setActiveView: () => {},
          sel: null,
          updateProjectNameWidget: () => {},
          setProjectNameFromFile: () => {},
          getSuggestedName: () => "project.json",
          closeMenus: () => {},
          onModelReset: () => {},
          loadFsModule: async () => ({
            openJson: async () => ({ data: {}, name: "" }),
            saveJson: async () => ({ name: "" }),
          }),
        });

        const legacy = {
          meta: { schema: 0, projectName: "", interactionsMode: "AI" },
          actions: [],
          inputs: [],
          modifiers: [],
          outcomes: [],
          modifierGroups: [],
          modifierConstraints: [],
          notes: {},
          comments: { actions: { 5: { text: "legacy" } }, inputs: ["bad"] },
          interactionsPairs: [],
          interactionsIndex: { mode: "AI", groups: [] },
          nextId: 1,
        };

        controller.upgradeModelInPlace(legacy);

        const expected = createEmptyCommentMap();
        expected.actions["5"] = { text: "legacy" };
        assert.deepStrictEqual(legacy.comments, expected);
      },
    },
    {
      name: "newProject resets comments map",
      run(assert) {
        const { model } = makeModelFixture();
        model.comments.actions["12"] = { text: "persist" };

        const controller = createPersistenceController({
          model,
          statusBar: null,
          clearHistory: () => {},
          resetAllViewState: () => {},
          setActiveView: () => {},
          sel: null,
          updateProjectNameWidget: () => {},
          setProjectNameFromFile: () => {},
          getSuggestedName: () => "project.json",
          closeMenus: () => {},
          onModelReset: () => {},
          loadFsModule: async () => ({
            openJson: async () => ({ data: {}, name: "" }),
            saveJson: async () => ({ name: "" }),
          }),
        });

        controller.newProject();

        assert.deepStrictEqual(model.comments, createEmptyCommentMap());
      },
    },
  ];
}
