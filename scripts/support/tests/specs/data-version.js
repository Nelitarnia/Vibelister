import { makeMutationRunner } from "../../../data/mutation-runner.js";
import { createInitialModel } from "../../../app/model-init.js";

function createRunner(model, renderSpy) {
  return makeMutationRunner({
    model,
    rebuildActionColumnsFromModifiers: () => {},
    rebuildInteractionsInPlace: () => {},
    pruneNotesToValidPairs: () => {},
    invalidateViewDef: () => {},
    layout: () => {},
    render: renderSpy,
    status: {},
  });
}

export function getDataVersionTests() {
  return [
    {
      name: "edits bump dataVersion and mark redraws without changing view",
      run(assert) {
        const model = createInitialModel();
        const renderObservations = [];
        let lastSeenVersion = model.meta.dataVersion;
        const runner = createRunner(model, () => {
          if (model.meta.dataVersion === lastSeenVersion) {
            renderObservations.push({ skipped: true, version: model.meta.dataVersion });
            return;
          }
          lastSeenVersion = model.meta.dataVersion;
          renderObservations.push({ skipped: false, version: lastSeenVersion });
        });

        runner.runModelMutation(
          "add action name",
          () => {
            model.actions.push({ id: model.nextId++, name: "Hero", color: "", color2: "", notes: "" });
            return { changed: true };
          },
          { render: true },
        );

        assert.strictEqual(model.meta.dataVersion, 1, "dataVersion increments for grid redraw");
        assert.deepStrictEqual(
          renderObservations,
          [{ skipped: false, version: 1 }],
          "renderer sees version bump and redraws within same view",
        );
      },
    },
  ];
}

export default getDataVersionTests;
