import { createInteractionMaintenance } from "../../../app/interaction-maintenance.js";
import { createShellCoordinator } from "../../../app/shell-coordinator.js";
import { createGridRuntimeCoordinator } from "../../../app/grid-runtime-coordinator.js";
import { Ids } from "../../../data/constants.js";

export function getAppCoordinatorTests() {
  return [
    {
      name: "shell coordinator delegates to bootstrap",
      run(assert) {
        const appContext = {};
        const expected = { lifecycle: {}, dom: {}, statusBar: {} };
        let receivedArgs = null;
        const result = createShellCoordinator({
          appContext,
          bootstrapShellImpl: (args) => {
            receivedArgs = args;
            return expected;
          },
        });

        assert.strictEqual(result, expected, "returns bootstrap result");
        assert.deepStrictEqual(
          receivedArgs,
          { appContext, ids: Ids, statusConfig: { historyLimit: 100 } },
          "passes default ids and status config",
        );
      },
    },
    {
      name: "interaction maintenance rebuilds and prunes",
      run(assert) {
        const model = { notes: { "1|2|sig": {}, "old|p1": {} } };
        let rebuildCalled = 0;
        let refreshCalled = 0;
        const maintenance = createInteractionMaintenance({
          model,
          buildInteractionsPairs() {
            rebuildCalled += 1;
          },
          getInteractionsOutline: () => ({ refresh: () => (refreshCalled += 1) }),
          getInteractionsRowCount: () => 1,
          getInteractionsPair: () => ({ aId: 1, iId: 2, variantSig: "sig" }),
          noteKeyForPair: (p) => `${p.aId}|${p.iId}|${p.variantSig}`,
          canonicalSigImpl: (sig) => sig,
        });

        maintenance.rebuildInteractionsInPlace();
        assert.strictEqual(rebuildCalled, 1, "rebuild executed");
        assert.strictEqual(refreshCalled, 1, "outline refreshed");

        maintenance.pruneNotesToValidPairs();
        assert.deepStrictEqual(Object.keys(model.notes), ["1|2|sig"], "pruned invalid notes");
      },
    },
    {
      name: "grid runtime coordinator wires dependencies",
      run(assert) {
        const appContext = { model: {}, state: {} };
        const viewState = {
          viewDef: {},
          dataArray: [],
          kindCtx: {},
          getRowCount: () => 0,
          updateSelectionSnapshot() {},
          updateScrollSnapshot() {},
          invalidateViewDef() {},
          rebuildInteractionPhaseColumns() {},
          saveCurrentViewState() {},
          restoreViewState() {},
          resetAllViewState() {},
        };
        const coreDom = {
          sheet: {},
          cellsLayer: {},
          spacer: {},
          colHdrs: {},
          rowHdrs: {},
          editor: {},
          dragLine: {},
        };
        const selectionApi = {
          Selection: "Selection",
          SelectionCtl: "SelectionCtl",
          sel: "sel",
          onSelectionChanged: () => {},
        };
        let runModelMutationHook;
        const gridCellsApi = {
          isModColumn: () => false,
          modIdFromKey: () => "mod",
          getCell: () => "cell",
          setCell: () => {},
          getStructuredCell: () => {},
          applyStructuredCell: () => {},
          cellValueToPlainText: () => "text",
        };
        const createGridCellsImpl = (opts) => {
          runModelMutationHook = opts.runModelMutation;
          return gridCellsApi;
        };
        let receivedRuntimeOptions = null;
        let lastMutationArgs = null;
        const runtimeResult = {
          rendererApi: { render() {}, layout() {}, ensureVisible() {}, getColGeomFor() {} },
          selectionListeners: { onSelectionChanged: () => {} },
          selectionRenderDisposer: () => {},
          interactionToolsApi: {},
          historyApi: {},
          mutationApi: {
            runModelMutation: (...args) => {
              lastMutationArgs = args;
            },
            runModelTransaction() {},
            beginUndoableTransaction() {},
            makeUndoConfig() {},
          },
          dialogApi: {},
          gridCommandsApi: {},
        };
        const coordinator = createGridRuntimeCoordinator({
          appContext,
          viewState,
          coreDom,
          statusBar: {},
          menuItems: {},
          selectionApi,
          setActiveView: () => {},
          getActiveViewState: () => "view",
          rebuildInteractionsInPlace: () => {},
          pruneNotesToValidPairs: () => {},
          createGridCellsImpl,
          bootstrapGridRuntimeImpl: (opts) => {
            receivedRuntimeOptions = opts;
            return runtimeResult;
          },
        });

        runModelMutationHook("payload");
        assert.strictEqual(receivedRuntimeOptions.selectionApi.sel, selectionApi.sel, "selection wired");
        assert.strictEqual(
          receivedRuntimeOptions.rebuildInteractionsInPlace instanceof Function,
          true,
        );
        assert.deepStrictEqual(lastMutationArgs, ["payload"], "grid cells forward mutation");
        assert.strictEqual(runModelMutationHook && typeof runModelMutationHook, "function");
      },
    },
  ];
}

export default getAppCoordinatorTests;
