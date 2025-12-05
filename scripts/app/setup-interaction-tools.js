import { createInteractionsOutline } from "../ui/interactions-outline.js";

export function setupInteractionTools({
  model,
  selectionApi,
  rendererApi,
  layoutApi,
}) {
  const {
    Selection,
    SelectionCtl,
    sel,
    getActiveView,
    ensureVisible,
    onSelectionChanged,
  } = selectionApi;
  const { render, sheet } = rendererApi;
  const { layout } = layoutApi;

  const interactionsOutline = createInteractionsOutline({
    model,
    Selection,
    SelectionCtl,
    sel,
    getActiveView,
    ensureVisible,
    render,
    layout,
    sheet,
    onSelectionChanged,
  });
  interactionsOutline?.refresh?.();

  function createDoGenerate({
    rebuildActionColumnsFromModifiers,
    invalidateViewDef,
    buildInteractionsPairs,
    setActiveView,
    statusBar,
  }) {
    return function doGenerate() {
      rebuildActionColumnsFromModifiers(model);
      invalidateViewDef();
      const { actionsCount, inputsCount, pairsCount, capped, cappedActions } =
        buildInteractionsPairs(model);
      interactionsOutline?.refresh?.();
      setActiveView("interactions");
      sel.r = 0;
      sel.c = 0;
      layout();
      render();
      const genSummary =
        `Generated Interactions: ${actionsCount} actions × ${inputsCount} inputs = ${pairsCount} rows.` +
        (capped ? ` (Note: ${cappedActions} action(s) hit variant cap)` : "");
      statusBar?.set(genSummary);
    };
  }

  return { interactionsOutline, createDoGenerate };
}
