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
  toolsCleanup: "tools-cleanup",
  viewActions: "view-actions",
  viewInputs: "view-inputs",
  viewModifiers: "view-modifiers",
  viewOutcomes: "view-outcomes",
  viewInteractions: "view-interactions",
  projectName: "project-name",
});

export const DEFAULT_OUTCOMES = [
  "Uncertain",
  "Impossible",
  "Reserved",
  "No effect",
  "Buffers",
  "Follows",
  "Overrides",
  "Changes",
];

export const DEFAULT_OUTCOME_COLORS = Object.freeze({
  Uncertain: Object.freeze({ color: "#98ADB8", color2: "#000000" }),
  Impossible: Object.freeze({ color: "#455A64", color2: "#ECEFF1" }),
  Reserved: Object.freeze({ color: "#607D8B", color2: "#FFFFFF" }),
  "No effect": Object.freeze({ color: "#3386D0", color2: "#FFFFFF" }),
  Buffers: Object.freeze({ color: "#26C6DA", color2: "#000000" }),
  Follows: Object.freeze({ color: "#43A047", color2: "#FFFFFF" }),
  Overrides: Object.freeze({ color: "#D8623A", color2: "#FFFFFF" }),
  Changes: Object.freeze({ color: "#E68815", color2: "#000000" }),
});

export const DEFAULT_OUTCOME_NOTES = Object.freeze({
  Uncertain: "No result — outcome appears random or inconsistent.",
  Impossible: "No result — cannot be tested or input cannot be performed.",
  Reserved: "No result — input is already reserved by the current state.",
  "No effect": "Old state continues — nothing observable changes.",
  Buffers: "Old state continues — input is stored to trigger later if conditions allow.",
  Follows: "Old state continues — a follow-up action is scheduled to occur automatically.",
  Overrides: "Current state ends and a new one begins immediately.",
  Changes: "Current state transforms without a sharp break.",
});

export const DEFAULT_OUTCOME_MIRRORED = Object.freeze({
  Uncertain: true,
  Impossible: true,
  "No effect": true,
  Overrides: true,
  Changes: true,
});

export const DEFAULT_OUTCOME_DUAL_OF = Object.freeze({
  Uncertain: "Uncertain",
  Impossible: "Impossible",
  "No effect": "Overrides",
  Overrides: "No effect",
  Changes: "Changes",
});

export const SCHEMA_VERSION = 1;

// Back-compat bindings (import directly where needed)
export const ROW_HEIGHT = UI.ROW_HEIGHT;
export const HEADER_HEIGHT = UI.HEADER_HEIGHT;
