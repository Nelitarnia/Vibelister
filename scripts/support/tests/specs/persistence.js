import { createPersistenceController } from "../../../app/persistence.js";
import { MOD } from "../../../data/constants.js";
import { createEmptyCommentMap } from "../../../data/comments.js";
import { normalizeCommentColorPalette } from "../../../data/comment-colors.js";
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
              meta: {
                schema: 0,
                projectName: "",
                projectInfo: "",
                interactionsMode: "AI",
              },
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
      name: "openFromDisk reports file size errors",
      async run(assert) {
        const { model } = makeModelFixture();
        let statusMessage = "";
        const loadFsModule = async () => ({
          openJson: async () => {
            throw new Error("Project file is too large (max 5 MB)");
          },
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
          "Open failed: Project file is too large (max 5 MB)",
          "status bar should surface file size errors",
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
              meta: {
                schema: 0,
                projectName: "",
                projectInfo: "",
                interactionsMode: "AI",
              },
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
        assert.ok(
          saveArgs.data !== model,
          "saveJson should receive a snapshot, not the live model",
        );
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
              meta: {
                schema: 0,
                projectName: "",
                projectInfo: "",
                interactionsMode: "AI",
              },
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
          meta: {
            schema: 0,
            projectName: "",
            projectInfo: "",
            interactionsMode: "AI",
          },
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
      name: "comment palette round-trips via open/save",
      async run(assert) {
        const { model } = makeModelFixture();
        const rawPalette = [
          { id: "plum", label: " Plum ", badgeBackground: "  #ABC " },
          { id: "sunset", swatch: "#ff9900", badgeText: " black " },
          { id: "plum", label: "Duplicate" },
        ];
        const normalizedPalette = normalizeCommentColorPalette(rawPalette);
        let savedSnapshot = null;
        const loadFsModule = async () => ({
          openJson: async () => ({
            name: "palette.json",
            data: {
              meta: {
                schema: 0,
                projectName: "",
                projectInfo: "",
                interactionsMode: "AI",
                commentColors: rawPalette,
              },
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
          async saveJson(data) {
            savedSnapshot = data;
            return { name: "palette.json" };
          },
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

        assert.deepStrictEqual(
          model.meta.commentColors,
          normalizedPalette,
          "palette should normalize on load",
        );

        await controller.saveToDisk();

        assert.deepStrictEqual(
          savedSnapshot?.meta?.commentColors,
          normalizedPalette,
          "palette should persist through save",
        );
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
    {
      name: "saveToDisk omits derived interactions data",
      async run(assert) {
        const { model } = makeModelFixture();
        model.notes = { global: "Keep me" };
        model.interactionsPairs.push({ actionId: 1, inputId: 2, variants: [] });
        model.interactionsIndex = {
          mode: "AI",
          groups: [{ actionId: 1, inputId: 2, variants: ["x"] }],
          totalRows: 1,
          actionsOrder: [1],
          inputsOrder: [2],
          variantCatalog: { v1: { key: "value" } },
        };

        let saveArgs = null;
        const loadFsModule = async () => ({
          openJson: async () => ({ data: {}, name: "" }),
          async saveJson(data, options) {
            saveArgs = { data, options };
            return { name: "saved.json" };
          },
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

        await controller.saveToDisk();

        assert.ok(saveArgs, "saveJson should capture derived data snapshot");
        assert.deepStrictEqual(
          saveArgs.data.interactionsPairs,
          [],
          "persisted JSON should exclude interactionsPairs",
        );
        assert.deepStrictEqual(
          saveArgs.data.interactionsIndex,
          {
            mode: "AI",
            groups: [],
            totalRows: 0,
            actionsOrder: [],
            inputsOrder: [],
            variantCatalog: {},
          },
          "interactionsIndex should reset to an empty shell",
        );
        assert.deepStrictEqual(
          saveArgs.data.notes,
          { global: "Keep me" },
          "user notes should remain in the persisted JSON",
        );
        assert.strictEqual(
          model.interactionsIndex.variantCatalog.v1.key,
          "value",
          "live model should retain variantCatalog data",
        );
      },
    },
    {
      name: "saveToDisk strips default interaction metadata",
      async run(assert) {
        const { model } = makeModelFixture();
        model.notes = {
          keep: { outcomeId: 7, source: "model", confidence: 0.4 },
          defaults: { outcomeId: 8, source: "manual", confidence: 1 },
        };

        let savedSnapshot = null;
        const loadFsModule = async () => ({
          openJson: async () => ({ data: {}, name: "" }),
          async saveJson(data) {
            savedSnapshot = data;
            return { name: "saved.json" };
          },
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

        await controller.saveToDisk();

        assert.ok(savedSnapshot, "save should serialize a snapshot");
        assert.deepStrictEqual(
          savedSnapshot.notes.keep,
          { outcomeId: 7, source: "model", confidence: 0.4 },
          "non-default metadata preserved",
        );
        assert.deepStrictEqual(
          savedSnapshot.notes.defaults,
          { outcomeId: 8 },
          "default metadata removed from persisted notes",
        );
      },
    },
    {
      name: "saveToDisk trims placeholder rows and open repads",
      async run(assert) {
        const fixture = makeModelFixture();
        const { model, addAction, addInput, addModifier, addOutcome } = fixture;
        addAction("Hero");
        addInput("Widget");
        addModifier("Boost");
        addOutcome("Victory");

        let savedData = null;
        const fakeModule = {
          async openJson() {
            if (!savedData) {
              throw new Error("No saved data available");
            }
            return {
              name: "trimmed.json",
              data: JSON.parse(JSON.stringify(savedData)),
            };
          },
          async saveJson(data) {
            savedData = JSON.parse(JSON.stringify(data));
            return { name: "trimmed.json" };
          },
        };

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
          loadFsModule: async () => fakeModule,
        });

        controller.ensureMinRows(model.actions, 5);
        controller.ensureMinRows(model.inputs, 4);
        controller.ensureMinRows(model.modifiers, 4);
        controller.ensureMinRows(model.outcomes, 4);

        await controller.saveToDisk();

        assert.ok(savedData, "saveJson should capture trimmed snapshot");
        assert.strictEqual(
          savedData.actions.length,
          1,
          "only authored actions should persist",
        );
        assert.strictEqual(
          savedData.inputs.length,
          1,
          "only authored inputs should persist",
        );
        assert.strictEqual(
          savedData.modifiers.length,
          1,
          "only authored modifiers should persist",
        );
        assert.strictEqual(
          savedData.outcomes.length,
          1,
          "only authored outcomes should persist",
        );

        await controller.openFromDisk();

        assert.ok(
          model.actions.length > savedData.actions.length,
          "openFromDisk should repad actions for editing",
        );
        assert.ok(
          model.inputs.length > savedData.inputs.length,
          "openFromDisk should repad inputs for editing",
        );
        assert.ok(
          model.modifiers.length > savedData.modifiers.length,
          "openFromDisk should repad modifiers for editing",
        );
        assert.ok(
          model.outcomes.length > savedData.outcomes.length,
          "openFromDisk should repad outcomes for editing",
        );

        assert.ok(
          model.actions
            .slice(savedData.actions.length)
            .some((row) => !row.name),
          "reseeded action rows should remain blank placeholders",
        );
        assert.ok(
          model.inputs
            .slice(savedData.inputs.length)
            .some((row) => !row.name),
          "reseeded input rows should remain blank placeholders",
        );
        assert.ok(
          model.modifiers
            .slice(savedData.modifiers.length)
            .some((row) => !row.name),
          "reseeded modifier rows should remain blank placeholders",
        );
        assert.ok(
          model.outcomes
            .slice(savedData.outcomes.length)
            .some((row) => !row.name),
          "reseeded outcome rows should remain blank placeholders",
        );
      },
    },
  ];
}
