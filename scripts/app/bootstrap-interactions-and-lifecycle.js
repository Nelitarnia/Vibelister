import { setupInputHandlers } from "./setup-input-handlers.js";
import { initSidebarControllers } from "./sidebar-wiring.js";

export function bootstrapInteractionsAndLifecycle({
  appContext,
  shellApi,
  selectionApi,
  editingApi,
  viewApi,
  rendererApi,
  gridApi,
  modelApi,
  historyApi,
  persistenceApi,
  generationApi,
  clipboardApi,
  menuApi,
  sidebarApi,
  variantApi,
  viewsMeta,
  interactionsApi,
  destroyEditingAndPersistence,
}) {
  const { state, model } = appContext;
  const {
    dom: { cellsLayer, rowHdrs, sheet, editor, dragLine, colHdrs, sidebar: sidebarDom },
    statusBar,
    wireMenus,
    initShell,
    destroyShell,
  } = shellApi;

  const {
    selection,
    sel,
    SelectionNS,
    SelectionCtl,
    clearSelection,
    onSelectionChanged,
  } = selectionApi;

  const {
    isEditing,
    beginEdit,
    endEdit,
    endEditIfOpen,
    moveSel,
    moveSelectionForTab,
  } = editingApi;

  const {
    viewDef,
    dataArray,
    getRowCount,
    getActiveView,
    setActiveView,
    cycleView,
    invalidateViewDef,
  } = viewApi;

  const { render, layout, ensureVisible } = rendererApi;

  const {
    setCell,
    setModForSelection,
    isModColumn,
    modIdFromKey,
    getHorizontalTargetColumns,
    cloneValueForAssignment,
  } = gridApi;

  const {
    runModelMutation,
    runModelTransaction,
    beginUndoableTransaction,
    makeUndoConfig,
    ensureMinRows,
    ensureSeedRows,
    ROW_HEIGHT,
    HEADER_HEIGHT,
    clamp,
    deleteSelectedRows,
    clearSelectedCells,
    addRowsAbove,
    addRowsBelow,
    getCell,
    getPaletteAPI,
    interactionsOutline,
    interactionActions,
    commentsUI,
    tagUI,
    upgradeModelInPlace,
    makeRow,
  } = modelApi;

  const { undo, redo, getUndoState } = historyApi;

  const { newProject, openFromDisk, saveToDisk, updateProjectNameWidget } = persistenceApi;

  const { doGenerate, runSelfTests } = generationApi;

  const {
    getStructuredCell,
    applyStructuredCell,
    getCellCommentClipboardPayload,
    applyCellCommentClipboardPayload,
    cellValueToPlainText,
  } = clipboardApi;

  const { openSettingsDialog, openProjectInfo, openCleanupDialog, openInferenceDialog } = menuApi;

  const { getCellComments, setCellComment, deleteCellComment, noteKeyForPair, getInteractionsPair } =
    sidebarApi;

  const { canonicalSig, compareVariantSig, sortIdsByUserOrder, modOrderMap } = variantApi;

  const { VIEWS, visibleCols, visibleRows, colOffsets, colWidths, rebuildActionColumnsFromModifiers } =
    viewsMeta;

  const { toggleInteractionsMode } = interactionsApi;

  const { disposeMouse, disposeDrag, disposeKeys, disposeColumnResize } = setupInputHandlers({
    dom: { cellsLayer, rowHdrs, sheet, editor, dragLine, colHdrs },
    selectionApi: { selection, sel, SelectionNS, SelectionCtl, clearSelection },
    editingApi: { isEditing, beginEdit, endEdit, moveSel, moveSelectionForTab },
    viewApi: {
      viewDef,
      getRowCount,
      dataArray,
      getActiveView,
      setActiveView,
      cycleView,
      invalidateViewDef,
    },
    rendererApi: { render, layout, ensureVisible },
    gridApi: {
      setCell,
      setModForSelection,
      isModColumn,
      modIdFromKey,
      getHorizontalTargetColumns,
      cloneValueForAssignment,
    },
    modelApi: {
      model,
      runModelMutation,
      runModelTransaction,
      beginUndoableTransaction,
      makeUndoConfig,
      ensureMinRows,
      ROW_HEIGHT,
      HEADER_HEIGHT,
      clamp,
      deleteSelectedRows,
      clearSelectedCells,
      addRowsAbove,
      addRowsBelow,
      getCell,
      getPaletteAPI,
      interactionsOutline,
      commentsUI,
      tagUI,
      toggleInteractionToolsPane: () => state.toggleInteractionToolsPane?.(),
      interactionActions,
    },
    historyApi: { undo, redo },
    persistenceApi: { newProject, openFromDisk, saveToDisk },
    generationApi: { doGenerate, runSelfTests },
    clipboardApi: {
      getStructuredCell,
      applyStructuredCell,
      getCellCommentClipboardPayload,
      applyCellCommentClipboardPayload,
      cellValueToPlainText,
    },
    statusBar,
    toggleInteractionsMode,
  });

  ({
    sidePanelHost: state.sidePanelHost,
    commentsUI: state.commentsUI,
    tagManager: state.tagManager,
    tagUI: state.tagUI,
    interactionTools: state.interactionTools,
  } = initSidebarControllers({
    dom: sidebarDom,
    SelectionCtl,
    selection,
    sel,
    onSelectionChanged,
    getCellComments,
    setCellComment,
    deleteCellComment,
    getActiveView,
    setActiveView,
    viewDef,
    dataArray,
    render,
    statusBar,
    model,
    ensureVisible,
    VIEWS,
    noteKeyForPair,
    getInteractionsPair,
    runModelMutation,
    makeUndoConfig,
    interactionActions,
  }));

  state.toggleInteractionToolsPane = () => state.interactionTools?.toggle?.();

  state.menusAPI = wireMenus({
    setActiveView,
    newProject,
    openFromDisk,
    saveToDisk,
    doGenerate,
    runSelfTests,
    model,
    openSettings: openSettingsDialog,
    openProjectInfo,
    openCleanup: openCleanupDialog,
    openInference: openInferenceDialog,
    addRowsAbove,
    addRowsBelow,
    clearCells: () => clearSelectedCells({}),
    deleteRows: () => deleteSelectedRows({ reason: "menu" }),
    undo,
    redo,
    getUndoState,
  });

  const ModelNS = { upgradeModelInPlace, ensureSeedRows, ensureMinRows, makeRow };
  const ViewsNS = {
    setActiveView,
    rebuildActionColumnsFromModifiers,
    viewDef,
    dataArray,
    getRowCount,
    visibleCols,
    visibleRows,
    colOffsets,
    colWidths,
  };
  const GridNS = { layout, render, ensureVisible, beginEdit, endEdit, endEditIfOpen, moveSel };
  const MenusNS = {
    closeAllMenus: state.menusAPI.closeAllMenus,
    updateViewMenuRadios: state.menusAPI.updateViewMenuRadios,
  };
  const SelectionNSExport = SelectionNS;
  const IONS = { openFromDisk, saveToDisk };
  const VariantsNS = { canonicalSig, doGenerate, compareVariantSig, sortIdsByUserOrder, modOrderMap };

  function destroyApp() {
    destroyShell?.();
    disposeMouse?.();
    disposeDrag?.();
    disposeKeys?.();
    disposeColumnResize?.();
    state.interactionTools?.destroy?.();
    state.commentsUI?.destroy?.();
    state.tagUI?.destroy?.();
    state.menusAPI?.destroy?.();
    destroyEditingAndPersistence?.();
    state.toggleInteractionToolsPane = null;
  }

  function initApp() {
    initShell?.();
    ensureSeedRows();
    layout();
    render();
    new ResizeObserver(() => render()).observe(sheet);
    setActiveView("actions");
    updateProjectNameWidget();
    if (location.hash.includes("test")) runSelfTests();
  }

  appContext.setLifecycle({
    init: initApp,
    destroy: destroyApp,
    setActiveView,
    cycleView,
    toggleInteractionsMode,
  });

  return {
    init: initApp,
    destroy: destroyApp,
    setActiveView,
    cycleView,
    toggleInteractionsMode,
    appContext,
    ModelNS,
    ViewsNS,
    GridNS,
    MenusNS,
    SelectionNS: SelectionNSExport,
    IONS,
    VariantsNS,
  };
}
