import { SCHEMA_VERSION } from "../data/constants.js";
import { createEmptyCommentMap } from "../data/comments.js";
import { normalizeCommentColorPalette } from "../data/comment-colors.js";

export function createDefaultMeta() {
  return {
    schema: SCHEMA_VERSION,
    projectName: "",
    projectInfo: "",
    interactionsMode: "AI",
    columnWidths: {},
    commentFilter: { viewKey: "actions" },
    commentColors: normalizeCommentColorPalette(),
  };
}

export function createInitialModel() {
  return {
    meta: createDefaultMeta(),
    actions: [],
    inputs: [],
    modifiers: [],
    outcomes: [],
    modifierGroups: [],
    modifierConstraints: [],
    notes: {},
    comments: createEmptyCommentMap(),
    interactionsPairs: [],
    interactionsIndex: { mode: "AI", groups: [] },
    nextId: 1,
  };
}
