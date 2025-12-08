import { setupRenderer } from "./setup-renderer.js";
import { setupInteractionTools } from "./setup-interaction-tools.js";
import { setupHistory } from "./setup-history.js";
import { setupGridCommands } from "./setup-grid-commands.js";
import { setupDialogs } from "./setup-dialogs.js";

export function bootstrapGridRuntime({
  appContext,
  viewState,
  coreDom,
  selectionApi,
  gridCellsApi,
  modHelpers,
  statusBar,
  menuItems,
  setActiveView,
  rebuildInteractionsInPlace,
  pruneNotesToValidPairs,
}) {
  const { sheet, cellsLayer, spacer, colHdrs, rowHdrs } = coreDom;

  const rendererApi = setupRenderer({
    appContext,
    viewState,
    dom: { sheet, cellsLayer, spacer, colHdrs, rowHdrs },
    getCell: gridCellsApi.getCell,
    modHelpers,
  });

  const { render, layout, ensureVisible, getColGeomFor } = rendererApi;

  const disposeSelectionRender = selectionApi.onSelectionChanged(() => render());

  const { interactionsOutline, createDoGenerate } = setupInteractionTools({
    model: appContext.model,
    selectionApi: {
      Selection: selectionApi.Selection,
      SelectionCtl: selectionApi.SelectionCtl,
      sel: selectionApi.sel,
      getActiveView: selectionApi.getActiveView,
      ensureVisible,
      onSelectionChanged: selectionApi.onSelectionChanged,
    },
    rendererApi: { render, sheet },
    layoutApi: { layout },
  });

  const historyApi = setupHistory({
    appContext,
    viewState,
    rendererApi,
    menuItems,
    statusBar,
    setActiveView,
    rebuildInteractionsInPlace,
    pruneNotesToValidPairs,
  });

  const gridCommandsApi = setupGridCommands({
    appContext,
    viewState,
    historyApi,
    rendererApi,
    statusBar,
    setCell: gridCellsApi.setCell,
    modHelpers,
  });

  const dialogApi = setupDialogs({
    appContext,
    viewState,
    historyApi,
    statusBar,
  });

  return {
    rendererApi: { render, layout, ensureVisible, getColGeomFor },
    selectionListeners: { onSelectionChanged: selectionApi.onSelectionChanged },
    selectionRenderDisposer: disposeSelectionRender,
    interactionToolsApi: { interactionsOutline, createDoGenerate },
    historyApi,
    mutationApi: {
      makeUndoConfig: historyApi.makeUndoConfig,
      runModelMutation: historyApi.runModelMutation,
      beginUndoableTransaction: historyApi.beginUndoableTransaction,
      runModelTransaction: historyApi.runModelTransaction,
    },
    dialogApi,
    gridCommandsApi,
  };
}
