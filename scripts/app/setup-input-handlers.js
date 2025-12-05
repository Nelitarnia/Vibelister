import { initColumnResize } from "../ui/column-resize.js";
import { initGridKeys } from "../ui/grid-keys.js";
import { initGridMouse } from "../ui/grid-mouse.js";
import { initRowDrag } from "../ui/drag.js";

export function setupInputHandlers({
  dom,
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
  statusBar,
  toggleInteractionsMode,
}) {
  const { cellsLayer, rowHdrs, sheet, editor, dragLine, colHdrs } = dom;

  const { selection, sel, SelectionNS, SelectionCtl, clearSelection } =
    selectionApi;
  const { isEditing, beginEdit, endEdit, moveSel, moveSelectionForTab } =
    editingApi;
  const { viewDef, getRowCount, dataArray, getActiveView, setActiveView } =
    viewApi;
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
    model,
    runModelMutation,
    runModelTransaction,
    beginUndoableTransaction,
    makeUndoConfig,
    ensureMinRows,
    ROW_HEIGHT,
    HEADER_HEIGHT,
  } = modelApi;
  const { undo, redo } = historyApi;
  const { newProject, openFromDisk, saveToDisk } = persistenceApi;
  const { doGenerate, runSelfTests } = generationApi;
  const {
    getStructuredCell,
    applyStructuredCell,
    getCellCommentClipboardPayload,
    applyCellCommentClipboardPayload,
    cellValueToPlainText,
  } = clipboardApi;

  function isReorderableView() {
    const active = getActiveView?.();
    return (
      active === "actions" ||
      active === "inputs" ||
      active === "modifiers" ||
      active === "outcomes"
    );
  }

  const disposeColumnResize = initColumnResize({
    container: colHdrs,
    sheet,
    model,
    getActiveView,
    viewDef,
    runModelMutation,
    beginUndoableTransaction,
    makeUndoConfig,
    invalidateViewDef: () => viewApi.invalidateViewDef?.(),
    layout,
    render,
  });

  const disposeMouse = initGridMouse({
    cellsLayer,
    rowHdrs,
    sheet,
    editor,
    sel,
    selection,
    SelectionNS,
    SelectionCtl,
    isEditing,
    beginEdit,
    endEdit,
    render,
    ensureVisible,
    viewDef,
    getRowCount,
    dataArray,
    isModColumn,
    modIdFromKey,
    setCell,
    setModForSelection,
  });

  const disposeDrag = initRowDrag({
    rowHdrs,
    sheet,
    dragLine,
    dataArray,
    getRowCount,
    ensureMinRows,
    clamp: modelApi.clamp,
    selection,
    sel,
    clearSelection,
    SelectionNS,
    render,
    layout,
    runModelMutation,
    status: statusBar,
    ROW_HEIGHT,
    HEADER_HEIGHT,
    isReorderableView,
    makeUndoConfig,
  });

  const disposeKeys = initGridKeys({
    isEditing,
    getActiveView,
    selection,
    sel,
    editor,
    clearSelection,
    render,
    beginEdit,
    endEdit,
    moveSel,
    moveSelectionForTab,
    ensureVisible,
    viewDef,
    getRowCount,
    dataArray,
    isModColumn,
    modIdFromKey,
    setModForSelection,
    setCell,
    runModelTransaction,
    makeUndoConfig,
    cycleView: viewApi.cycleView,
    saveToDisk,
    openFromDisk,
    newProject,
    doGenerate,
    runSelfTests,
    deleteRows: modelApi.deleteSelectedRows,
    clearCells: modelApi.clearSelectedCells,
    addRowsAbove: modelApi.addRowsAbove,
    addRowsBelow: modelApi.addRowsBelow,
    model,
    getCellText: (r, c) => cellValueToPlainText(modelApi.getCell?.(r, c)),
    getStructuredCell,
    applyStructuredCell,
    getCellCommentClipboardPayload,
    applyCellCommentClipboardPayload,
    status: statusBar,
    undo,
    redo,
    getPaletteAPI: () => modelApi.getPaletteAPI?.(),
    toggleInteractionsOutline: () => modelApi.interactionsOutline?.toggle?.(),
    jumpToInteractionsAction: (delta) =>
      modelApi.interactionsOutline?.jumpToAction?.(delta),
    jumpToInteractionsVariant: (delta) =>
      modelApi.interactionsOutline?.jumpToVariant?.(delta),
    toggleCommentsSidebar: () => modelApi.commentsUI?.toggle?.(),
    toggleTagsSidebar: () => modelApi.tagUI?.toggle?.(),
    openInferenceSidebar: () => modelApi.toggleInteractionToolsPane?.(),
    acceptInferred: () => modelApi.interactionActions?.acceptInferred?.(),
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
      e.preventDefault();
      toggleInteractionsMode?.();
    }
  });

  return {
    disposeMouse,
    disposeDrag,
    disposeKeys,
    disposeColumnResize,
  };
}
