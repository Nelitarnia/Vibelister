export function createViewController({
  tabs,
  sheet,
  sel,
  selection,
  saveCurrentViewState,
  restoreViewState,
  clearSelection,
  endEditIfOpen,
  VIEWS,
  interactionsOutline,
  invalidateViewDef,
  rebuildActionColumnsFromModifiers,
  rebuildInteractionsInPlace,
  rebuildInteractionPhaseColumns,
  layout,
  render,
  getCommentsUI,
  statusBar,
  menusAPIRef,
  getRowCount,
  viewDef,
  clamp,
  model,
  getActiveViewState,
  setActiveViewState,
}) {
  function setActiveView(key) {
    endEditIfOpen(true);
    saveCurrentViewState({ sel, sheet });
    clearSelection();
    if (!(key in VIEWS)) return;
    setActiveViewState(key);
    interactionsOutline?.setActive?.(key === "interactions");
    invalidateViewDef();
    if (key === "actions") {
      rebuildActionColumnsFromModifiers(model);
      invalidateViewDef();
    }
    if (key === "interactions") {
      rebuildInteractionsInPlace();
      rebuildInteractionPhaseColumns();
    }
    if (tabs.tabActions) {
      tabs.tabActions.classList.toggle("active", key === "actions");
      tabs.tabActions.setAttribute("aria-selected", String(key === "actions"));
    }
    if (tabs.tabInputs) {
      tabs.tabInputs.classList.toggle("active", key === "inputs");
      tabs.tabInputs.setAttribute("aria-selected", String(key === "inputs"));
    }
    if (tabs.tabModifiers) {
      tabs.tabModifiers.classList.toggle("active", key === "modifiers");
      tabs.tabModifiers.setAttribute("aria-selected", String(key === "modifiers"));
    }
    if (tabs.tabOutcomes) {
      tabs.tabOutcomes.classList.toggle("active", key === "outcomes");
      tabs.tabOutcomes.setAttribute("aria-selected", String(key === "outcomes"));
    }
    if (tabs.tabInteractions) {
      tabs.tabInteractions.classList.toggle("active", key === "interactions");
      tabs.tabInteractions.setAttribute("aria-selected", String(key === "interactions"));
    }
    const st = restoreViewState(key);
    sel.r = clamp(st.row ?? sel.r, 0, Math.max(0, getRowCount() - 1));
    sel.c = clamp(
      st.col ?? sel.c,
      0,
      Math.max(0, viewDef().columns.length - 1),
    );
    selection.rows.clear();
    selection.rows.add(sel.r);
    selection.anchor = sel.r;

    layout();
    if (typeof st.scrollTop === "number") sheet.scrollTop = st.scrollTop;
    render();
    getCommentsUI?.()?.refresh?.();
    const modeLabel =
      key === "interactions" ? ` [${model.meta?.interactionsMode || "AI"}]` : "";
    statusBar?.set(`View: ${viewDef().title}${modeLabel}`);
    menusAPIRef()?.updateViewMenuRadios?.(key);
  }

  if (tabs.tabActions) tabs.tabActions.onclick = () => setActiveView("actions");
  if (tabs.tabInputs) tabs.tabInputs.onclick = () => setActiveView("inputs");
  if (tabs.tabModifiers) tabs.tabModifiers.onclick = () => setActiveView("modifiers");
  if (tabs.tabOutcomes) tabs.tabOutcomes.onclick = () => setActiveView("outcomes");
  if (tabs.tabInteractions)
    tabs.tabInteractions.onclick = () => setActiveView("interactions");

  function getViewOrder() {
    const map = tabs?.tabActions?.id
      ? {
          [tabs.tabActions.id]: "actions",
          [tabs.tabInputs?.id]: "inputs",
          [tabs.tabModifiers?.id]: "modifiers",
          [tabs.tabOutcomes?.id]: "outcomes",
          [tabs.tabInteractions?.id]: "interactions",
        }
      : {};
    const btns = document.querySelectorAll(".tabs .tab");
    const order = [];
    btns.forEach((b) => {
      const k = map[b.id];
      if (k && VIEWS[k]) order.push(k);
    });
    return order.length ? order : Object.keys(VIEWS);
  }

  function cycleView(d) {
    const ord = getViewOrder();
    const i = Math.max(0, ord.indexOf(getActiveViewState()));
    const next = (i + d + ord.length) % ord.length;
    setActiveView(ord[next]);
  }

  function toggleInteractionsMode() {
    const cur = (model.meta && model.meta.interactionsMode) || "AI";
    model.meta.interactionsMode = cur === "AI" ? "AA" : "AI";
    invalidateViewDef();
    if (getActiveViewState() === "interactions") {
      rebuildInteractionsInPlace();
      rebuildInteractionPhaseColumns();
      layout();
      render();
      statusBar?.set(`Interactions mode: ${model.meta.interactionsMode}`);
    } else {
      statusBar?.set(`Interactions mode set to ${model.meta.interactionsMode}`);
    }
  }

  return {
    cycleView,
    getActiveView: getActiveViewState,
    setActiveView,
    toggleInteractionsMode,
  };
}
