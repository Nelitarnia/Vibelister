import { buildInteractionPhaseColumns, VIEWS } from "./views.js";
import { MIN_ROWS, MOD } from "../data/constants.js";
import {
  applyStructuredCellInteractions,
  getInteractionsCell,
  getStructuredCellInteractions,
  setInteractionsCell,
} from "./interactions.js";
import { formatPhasesSpec, parsePhasesSpec } from "../data/utils.js";
import { Selection } from "./selection.js";
import { createViewStateController } from "./view-state.js";

export function setupViewState({ appContext, statusBar }) {
  const { model, state } = appContext;
  return createViewStateController({
    getActiveView: appContext.getActiveView,
    model,
    VIEWS,
    buildInteractionPhaseColumns,
    Selection,
    MIN_ROWS,
    MOD,
    statusBar,
    getPaletteAPI: () => state.paletteAPI,
    parsePhasesSpec,
    formatPhasesSpec,
    getInteractionsCell,
    setInteractionsCell,
    getStructuredCellInteractions,
    applyStructuredCellInteractions,
  });
}
