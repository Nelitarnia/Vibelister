// constants.js
export const UI = Object.freeze({ ROW_HEIGHT: 26, HEADER_HEIGHT: 28 });
export const PHASE_CAP = 12;
export const MOD = Object.freeze({ OFF: 0, ON: 1, BYPASS: 2 });
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
  menuFile: "menu-file",
  menuTools: "menu-tools",
  menuView: "menu-view",
  mFile: "m-file",
  mTools: "m-tools",
  mView: "m-view",
  fileNew: "file-new",
  fileOpenDisk: "file-open-disk",
  fileSaveDisk: "file-save-disk",
  fileSaveAs: "file-save-as",
  fileExportJson: "file-export-json",
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
  "Undecided",
  "No effect",
  "Impossible",
  "Prereq",
  "Mutual",
  "Cancels",
  "Buffers",
  "Follows",
];

export const SCHEMA_VERSION = 1;

// Back-compat bindings (import directly where needed)
export const ROW_HEIGHT = UI.ROW_HEIGHT;
export const HEADER_HEIGHT = UI.HEADER_HEIGHT;
