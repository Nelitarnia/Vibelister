// constants.js

import { MOD_STATE_ID } from "./mod-state.js";

export const UI = Object.freeze({ ROW_HEIGHT: 26, HEADER_HEIGHT: 28 });
export const PHASE_CAP = 12;
export const MOD = MOD_STATE_ID;
export const MIN_ROWS = Object.freeze({
  interactionsBase: 30,
  pad: 50,
  floor: 200,
});
export const Ids = Object.freeze({
  tabActions: "tab-actions",
  tabInputs: "tab-inputs",
  tabModifiers: "tab-modifiers",
  tabOutcomes: "tab-outcomes",
  tabInteractions: "tab-interactions",
  commentToggle: "comment-toggle",
  commentAdd: "comment-add",
  sidePanel: "side-panel",
  sidePanelTitle: "side-panel-title",
  sidePanelClose: "side-panel-close",
  commentSidebar: "comment-pane",
  commentList: "comment-list",
  commentEmpty: "comment-empty",
  commentEditor: "comment-editor",
  commentText: "comment-text",
  commentColor: "comment-color",
  commentSave: "comment-save",
  commentDelete: "comment-delete",
  commentCancel: "comment-cancel",
  commentSelection: "comment-selection",
  commentPrev: "comment-prev",
  commentNext: "comment-next",
  tagToggle: "tag-toggle",
  tagSidebar: "tag-pane",
  tagForm: "tag-form",
  tagInput: "tag-input",
  tagRename: "tag-rename",
  tagDelete: "tag-delete",
  tagList: "tag-list",
  tagEmpty: "tag-empty",
  menuFile: "menu-file",
  menuEdit: "menu-edit",
  menuSheet: "menu-sheet",
  menuTools: "menu-tools",
  menuView: "menu-view",
  mFile: "m-file",
  mEdit: "m-edit",
  mSheet: "m-sheet",
  mTools: "m-tools",
  mView: "m-view",
  fileNew: "file-new",
  fileOpenDisk: "file-open-disk",
  fileSaveDisk: "file-save-disk",
  fileSaveAs: "file-save-as",
  fileProjectInfo: "file-project-info",
  fileExportJson: "file-export-json",
  editUndo: "edit-undo",
  editRedo: "edit-redo",
  editPreferences: "edit-preferences",
  sheetAddRowsAbove: "sheet-add-rows-above",
  sheetAddRowsBelow: "sheet-add-rows-below",
  sheetClearCells: "sheet-clear-cells",
  sheetDeleteRows: "sheet-delete-rows",
  toolsGenerate: "tools-generate",
  toolsTests: "tools-tests",
  toolsRules: "tools-rules",
  viewActions: "view-actions",
  viewInputs: "view-inputs",
  viewModifiers: "view-modifiers",
  viewOutcomes: "view-outcomes",
  viewInteractions: "view-interactions",
  projectName: "project-name",
});

export const DEFAULT_OUTCOMES = [
  "Uncertain",
  "No effect",
  "Impossible",
  "Prereq",
  "Mutual",
  "Cancels",
  "Buffers",
  "Follows",
];

export const DEFAULT_OUTCOME_COLORS = Object.freeze({
  Uncertain: Object.freeze({ color: "#EAEBF0", color2: "#4B4B4B" }),
  "No effect": Object.freeze({ color: "#4F4F4F", color2: "#FFFFFF" }),
  Impossible: Object.freeze({ color: "#32333A", color2: "#C5C5CB" }),
  Prereq: Object.freeze({ color: "#4F5E56", color2: "#ADCDB9" }),
  Mutual: Object.freeze({ color: "#6967CD", color2: "#F4F4F4" }),
  Cancels: Object.freeze({ color: "#991114", color2: "#FFFFFF" }),
  Buffers: Object.freeze({ color: "#EA8015", color2: "#000000" }),
  Follows: Object.freeze({ color: "#C88F57", color2: "#000000" }),
});

export const SCHEMA_VERSION = 1;

// Back-compat bindings (import directly where needed)
export const ROW_HEIGHT = UI.ROW_HEIGHT;
export const HEADER_HEIGHT = UI.HEADER_HEIGHT;
