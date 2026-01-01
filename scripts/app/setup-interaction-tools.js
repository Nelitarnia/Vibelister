import { createInteractionsOutline } from "../ui/interactions-outline.js";
import { diagnoseVariantsForAction } from "../data/variants/variants.js";
import { createVariantDiagnosticsViewer } from "../ui/variant-diagnostics.js";

export function setupInteractionTools({
  model,
  selectionApi,
  rendererApi,
  layoutApi,
  getInteractionsPair,
}) {
  const {
    Selection,
    SelectionCtl,
    sel,
    selection,
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

  const diagnosticsViewer = createVariantDiagnosticsViewer({ model });

  function getActionForDiagnostics() {
    const currentView = typeof getActiveView === "function" ? getActiveView() : null;
    if (currentView !== "interactions") return null;
    const selectedRows = selection?.rows?.size
      ? Array.from(selection.rows).sort((a, b) => a - b)
      : [];
    const rowIndex = Number.isFinite(sel?.r) ? sel.r : selectedRows[0];
    if (!Number.isFinite(rowIndex)) return null;
    const pair = typeof getInteractionsPair === "function"
      ? getInteractionsPair(model, rowIndex)
      : null;
    if (!pair) return null;
    const actionId = Number(pair.aId);
    if (!Number.isFinite(actionId)) return null;
    return model?.actions?.find((a) => Number(a?.id) === actionId) || null;
  }

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
      const { actionsCount, inputsCount, pairsCount, capped, cappedActions, variantCaps } =
        buildInteractionsPairs(model);
      interactionsOutline?.refresh?.();
      setActiveView("interactions");
      sel.r = 0;
      sel.c = 0;
      layout();
      render();
      const capSummary = `Caps — per-action ${variantCaps.variantCapPerAction}, per-group ${variantCaps.variantCapPerGroup}`;
      const hitSummary = capped
        ? ` (Note: ${cappedActions} action(s) hit the cap)`
        : " (No cap hits)";
      const genSummary =
        `Generated Interactions: ${actionsCount} actions × ${inputsCount} inputs = ${pairsCount} rows. ${capSummary}${hitSummary}`;
      statusBar?.set(genSummary);
    };
  }

  function createDiagnosticsActions({ statusBar }) {
    return {
      openDiagnostics() {
        const action = getActionForDiagnostics();
        if (!action) {
          statusBar?.set?.("Select an Interactions row to run variant diagnostics.");
          return;
        }
        const diagnostics = diagnoseVariantsForAction(action, model);
        diagnosticsViewer.open({ action, diagnostics });
      },
    };
  }

  return { interactionsOutline, createDoGenerate, createDiagnosticsActions };
}
