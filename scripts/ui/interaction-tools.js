export function initInteractionTools(options = {}) {
  const {
    panelHost,
    panelId,
    pane,
    toggleButton,
    acceptButton,
    clearButton,
    uncertainButton,
    getActiveView,
    onSelectionChanged,
    statusBar,
    actions,
  } = options;

  if (!panelHost || !pane || !toggleButton || !actions) return null;

  const handle = panelHost.registerPane({
    id: panelId,
    element: pane,
    title: "Interactions", // overwritten below
    onShow: () => updateToggleState(true),
    onHide: () => updateToggleState(false),
  });
  handle?.setTitle?.("Interactions — Bulk actions");
  const detachToggle = panelHost.attachToggle(toggleButton, panelId);

  function updateToggleState(open = handle?.isOpen?.()) {
    const expanded = !!open;
    toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggleButton.setAttribute("data-active", expanded ? "true" : "false");
    const isInteractions = typeof getActiveView === "function"
      ? getActiveView() === "interactions"
      : true;
    toggleButton.disabled = !isInteractions;
    if (!isInteractions && expanded) handle?.close?.();
  }

  function run(action) {
    if (typeof action !== "function") return;
    const result = action();
    const statusText = result?.status;
    if (statusText && statusBar?.set) statusBar.set(statusText);
    updateToggleState();
  }

  acceptButton?.addEventListener("click", () => run(actions.acceptInferred));
  clearButton?.addEventListener("click", () =>
    run(actions.clearInferenceMetadata),
  );
  uncertainButton?.addEventListener("click", () => run(actions.toggleUncertain));

  if (typeof onSelectionChanged === "function") {
    onSelectionChanged(() => updateToggleState(handle?.isOpen?.()));
  }

  updateToggleState();

  return {
    toggle: () => handle?.toggle?.(),
    open: () => handle?.open?.(),
    close: () => handle?.close?.(),
    dispose: () => {
      detachToggle?.();
    },
  };
}
