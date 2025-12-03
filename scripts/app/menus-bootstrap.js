export function bootstrapMenus(Ids) {
  const el = (id) => document.getElementById(id);

  const menus = {
    file: { trigger: el(Ids.mFile), popup: el(Ids.menuFile) },
    edit: { trigger: el(Ids.mEdit), popup: el(Ids.menuEdit) },
    sheet: { trigger: el(Ids.mSheet), popup: el(Ids.menuSheet) },
    tools: { trigger: el(Ids.mTools), popup: el(Ids.menuTools) },
    view: { trigger: el(Ids.mView), popup: el(Ids.menuView) },
  };

  const items = {
    undoMenuItem: el(Ids.editUndo),
    redoMenuItem: el(Ids.editRedo),
    fileNew: el(Ids.fileNew),
    fileOpenDisk: el(Ids.fileOpenDisk),
    fileSaveDisk: el(Ids.fileSaveDisk),
    fileSaveAs: el(Ids.fileSaveAs),
    fileProjectInfo: el(Ids.fileProjectInfo),
    fileExportJson: el(Ids.fileExportJson),
    editPreferences: el(Ids.editPreferences),
    sheetAddRowsAbove: el(Ids.sheetAddRowsAbove),
    sheetAddRowsBelow: el(Ids.sheetAddRowsBelow),
    sheetClearCells: el(Ids.sheetClearCells),
    sheetDeleteRows: el(Ids.sheetDeleteRows),
    toolsGenerate: el(Ids.toolsGenerate),
    toolsCleanup: el(Ids.toolsCleanup),
    toolsInference: el(Ids.toolsInference),
    toolsTests: el(Ids.toolsTests),
    toolsRules: el(Ids.toolsRules),
    viewActions: el(Ids.viewActions),
    viewInputs: el(Ids.viewInputs),
    viewModifiers: el(Ids.viewModifiers),
    viewOutcomes: el(Ids.viewOutcomes),
    viewInteractions: el(Ids.viewInteractions),
  };

  const viewRadios = {
    actions: items.viewActions,
    inputs: items.viewInputs,
    modifiers: items.viewModifiers,
    outcomes: items.viewOutcomes,
    interactions: items.viewInteractions,
  };

  return { menus, items, viewRadios };
}
