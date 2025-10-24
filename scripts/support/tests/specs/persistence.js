import { createPersistenceController } from "../../../app/persistence.js";
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
              interactionsIndex: { mode: "AI", groups: [] },
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
              interactionsIndex: { mode: "AI", groups: [] },
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
  ];
}
