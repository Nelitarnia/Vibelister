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
  ];
}
