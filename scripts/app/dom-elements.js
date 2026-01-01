export function getCoreDomElements() {
  return {
    sheet: document.getElementById("sheet"),
    cellsLayer: document.getElementById("cells"),
    spacer: document.getElementById("spacer"),
    colHdrs: document.getElementById("colHdrs"),
    rowHdrs: document.getElementById("rowHdrs"),
    editor: document.getElementById("editor"),
    statusEl: document.getElementById("status"),
    dragLine: document.getElementById("dragLine"),
  };
}

export function getMenuDomElements(Ids) {
  return {
    undoMenuItem: document.getElementById(Ids.editUndo),
    redoMenuItem: document.getElementById(Ids.editRedo),
    commentToggleButton: document.getElementById(Ids.commentToggle),
    tagToggleButton: document.getElementById(Ids.tagToggle),
    commentAddButton: document.getElementById(Ids.commentAdd),
  };
}

export function getSidebarDomElements(Ids) {
  return {
    sidePanel: document.getElementById(Ids.sidePanel),
    sidePanelTitle: document.getElementById(Ids.sidePanelTitle),
    sidePanelCloseButton: document.getElementById(Ids.sidePanelClose),
    commentPane: document.getElementById(Ids.commentSidebar),
    tagPane: document.getElementById(Ids.tagSidebar),
    tagForm: document.getElementById(Ids.tagForm),
    tagInput: document.getElementById(Ids.tagInput),
    tagSort: document.getElementById(Ids.tagSort),
    tagRenameButton: document.getElementById(Ids.tagRename),
    tagDeleteButton: document.getElementById(Ids.tagDelete),
    tagList: document.getElementById(Ids.tagList),
    tagEmpty: document.getElementById(Ids.tagEmpty),
    interactionToolsPane: document.getElementById(Ids.interactionToolsPane),
    interactionToolsToggle: document.getElementById(Ids.interactionToolsToggle),
    interactionAcceptButton: document.getElementById(Ids.interactionAccept),
    interactionClearButton: document.getElementById(Ids.interactionClear),
    interactionUncertainButton: document.getElementById(Ids.interactionUncertain),
    interactionDiagnosticsButton: document.getElementById(
      Ids.interactionDiagnostics,
    ),
    interactionUncertaintyValue: document.getElementById(
      Ids.interactionUncertaintyValue,
    ),
    interactionSourceValue: document.getElementById(Ids.interactionSourceValue),
    interactionUncertaintyDefault: document.getElementById(
      Ids.interactionUncertaintyDefault,
    ),
    interactionUncertaintyDefaultValue: document.getElementById(
      Ids.interactionUncertaintyDefaultValue,
    ),
    commentList: document.getElementById(Ids.commentList),
    commentEmpty: document.getElementById(Ids.commentEmpty),
    commentEditor: document.getElementById(Ids.commentEditor),
    commentTextarea: document.getElementById(Ids.commentText),
    commentColorSelect: document.getElementById(Ids.commentColor),
    commentSaveButton: document.getElementById(Ids.commentSave),
    commentDeleteButton: document.getElementById(Ids.commentDelete),
    commentCancelButton: document.getElementById(Ids.commentCancel),
    commentSelectionLabel: document.getElementById(Ids.commentSelection),
    commentPrevButton: document.getElementById(Ids.commentPrev),
    commentNextButton: document.getElementById(Ids.commentNext),
    commentTabs: document.getElementById(Ids.commentTabs),
    commentTabComments: document.getElementById(Ids.commentTabComments),
    commentTabCustomize: document.getElementById(Ids.commentTabCustomize),
    commentPageComments: document.getElementById(Ids.commentPageComments),
    commentPageCustomize: document.getElementById(Ids.commentPageCustomize),
    commentPaletteList: document.getElementById(Ids.commentPalette),
    commentPaletteApply: document.getElementById(Ids.commentPaletteApply),
    commentPaletteReset: document.getElementById(Ids.commentPaletteReset),
  };
}

export function getTabDomElements(Ids) {
  return {
    tabActions: document.getElementById(Ids.tabActions),
    tabInputs: document.getElementById(Ids.tabInputs),
    tabModifiers: document.getElementById(Ids.tabModifiers),
    tabOutcomes: document.getElementById(Ids.tabOutcomes),
    tabInteractions: document.getElementById(Ids.tabInteractions),
  };
}

export function getProjectNameElement(Ids) {
  return document.getElementById(Ids.projectName);
}
