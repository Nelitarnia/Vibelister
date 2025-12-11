import { selection, sel } from "./selection.js";
import { createProjectInfoController } from "./project-info-controller.js";
import { createCleanupController } from "./cleanup-controller.js";
import { createInferenceController } from "./inference-controller.js";
import { createInteractionBulkActions } from "./interaction-bulk-actions.js";
import { getInteractionsPair, getInteractionsRowCount } from "./interactions.js";

export function setupDialogs({
  appContext,
  viewState,
  historyApi,
  statusBar,
  inferenceProfiles,
}) {
  const { model } = appContext;
  const { viewDef } = viewState;
  const { runModelMutation, makeUndoConfig } = historyApi;

  const { openProjectInfoDialog: openProjectInfo } = createProjectInfoController({
    model,
    runModelMutation,
    makeUndoConfig,
    statusBar,
  });

  const { openCleanupDialog } = createCleanupController({
    model,
    runModelMutation,
    makeUndoConfig,
    statusBar,
  });

  const { openInferenceDialog } = createInferenceController({
    model,
    selection,
    sel,
    getActiveView: appContext.getActiveView,
    viewDef,
    statusBar,
    runModelMutation,
    makeUndoConfig,
    getInteractionsPair,
    getInteractionsRowCount,
    inferenceProfiles,
  });

  const interactionActions = createInteractionBulkActions({
    model,
    selection,
    sel,
    getActiveView: appContext.getActiveView,
    viewDef,
    statusBar,
    runModelMutation,
    makeUndoConfig,
    getInteractionsPair,
  });

  return {
    openProjectInfo,
    openCleanupDialog,
    openInferenceDialog,
    interactionActions,
  };
}
