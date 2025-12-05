import { sel, SelectionCtl } from "./selection.js";
import { createHistoryController } from "./history.js";
import { VIEWS, rebuildActionColumnsFromModifiers } from "./views.js";

export function setupHistory({
  appContext,
  viewState,
  rendererApi,
  menuItems,
  statusBar,
  setActiveView,
  rebuildInteractionsInPlace,
  pruneNotesToValidPairs,
}) {
  return createHistoryController({
    model: appContext.model,
    viewDef: viewState.viewDef,
    getActiveView: appContext.getActiveView,
    setActiveView,
    selectionCursor: sel,
    SelectionCtl,
    ensureVisible: rendererApi.ensureVisible,
    VIEWS,
    statusBar,
    undoMenuItem: menuItems.undoMenuItem,
    redoMenuItem: menuItems.redoMenuItem,
    rebuildActionColumnsFromModifiers,
    rebuildInteractionsInPlace,
    pruneNotesToValidPairs,
    invalidateViewDef: viewState.invalidateViewDef,
    layout: rendererApi.layout,
    render: rendererApi.render,
    historyLimit: 200,
  });
}
