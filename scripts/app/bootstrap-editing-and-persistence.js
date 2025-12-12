import { setupEditing } from "./setup-editing.js";
import { setupPersistence } from "./setup-persistence.js";
import { createDiagnosticsController } from "./diagnostics.js";
import { setupPalette } from "./setup-palette.js";

export function bootstrapEditingAndPersistence({
  appContext,
  viewState,
  rendererApi,
  historyApi,
  statusBar,
  dom,
  gridApi,
  closeMenus,
  onModelReset,
  rebuildActionColumnsFromModifiers,
  VIEWS,
  setActiveView,
}) {
  let paletteAPI = null;
  let colorPickerAPI = null;

  const editingController = setupEditing({
    appContext,
    viewState,
    rendererApi,
    historyApi,
    gridApi,
    paletteApiRef: () => paletteAPI,
    dom,
  });

  const persistenceApi = setupPersistence({
    appContext,
    historyApi,
    viewState,
    statusBar,
    dom,
    closeMenus,
    onModelReset,
  });

  ({ paletteAPI, colorPickerAPI } = setupPalette({
    appContext,
    viewState,
    rendererApi,
    gridApi: {
      getCell: gridApi.getCell,
      setCellSelectionAware: gridApi.setCellSelectionAware,
      cellValueToPlainText: gridApi.cellValueToPlainText,
    },
    editingApi: {
      sel: editingController.sel,
      getCellRect: editingController.getCellRect,
      endEdit: editingController.endEdit,
      advanceSelectionAfterPaletteTab:
        editingController.advanceSelectionAfterPaletteTab,
      moveSel: editingController.moveSel,
    },
    historyApi,
    dom,
  }));

  // Expose palette API through app state so viewState/kind contexts can access it
  appContext.state.paletteAPI = paletteAPI;

  const diagnosticsApi = createDiagnosticsController({
    model: appContext.model,
    statusBar,
    ensureSeedRows: persistenceApi.ensureSeedRows,
    rebuildActionColumnsFromModifiers,
    VIEWS,
    setActiveView,
    setCell: gridApi.setCell,
  });

  function getPaletteAPI() {
    return paletteAPI;
  }

  function destroy() {
    paletteAPI?.destroy?.();
    colorPickerAPI?.destroy?.();
    appContext.state.paletteAPI = null;
  }

  return {
    editingController,
    persistenceApi,
    diagnosticsApi,
    paletteAPI,
    colorPickerAPI,
    getPaletteAPI,
    destroy,
  };
}
