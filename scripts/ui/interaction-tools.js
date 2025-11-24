export function initInteractionTools(options = {}) {
  const {
    panelHost,
    panelId,
    pane,
    toggleButton,
    acceptButton,
    clearButton,
    uncertainButton,
    uncertaintyValue,
    sourceValue,
    uncertaintyDefaultInput,
    uncertaintyDefaultValue,
    onSelectionChanged,
    statusBar,
    actions,
  } = options;

  if (!panelHost || !pane || !toggleButton || !actions) return null;

  const handle = panelHost.registerPane({
    id: panelId,
    element: pane,
    title: "Inference", // overwritten below
    onShow: () => refresh(true),
    onHide: () => refresh(false),
  });
  handle?.setTitle?.("Inference — Bulk actions");
  const detachToggle = panelHost.attachToggle(toggleButton, panelId);

  function formatPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    return `${Math.round(num * 100)}%`;
  }

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function updateDefaultUncertaintyLabel(value) {
    const display = formatPercent(value);
    setText(uncertaintyDefaultValue, display);
  }

  function syncDefaultUncertainty() {
    if (!uncertaintyDefaultInput) return;
    const current =
      typeof actions.getDefaultUncertainty === "function"
        ? actions.getDefaultUncertainty()
        : Number(uncertaintyDefaultInput.value);
    const normalized = Number.isFinite(current) ? current : 0.5;
    uncertaintyDefaultInput.value = normalized;
    updateDefaultUncertaintyLabel(normalized);
  }

  function updateSelectionInference() {
    if (typeof actions.summarizeSelectionInference !== "function") return;
    const summary = actions.summarizeSelectionInference();
    if (!summary?.allowed) {
      setText(uncertaintyValue, "—");
      setText(sourceValue, "—");
      return;
    }
    if (!summary.count) {
      setText(uncertaintyValue, "—");
      setText(sourceValue, "—");
      return;
    }
    if (summary.confidenceMixed) setText(uncertaintyValue, "multiple");
    else if (summary.confidence != null)
      setText(uncertaintyValue, formatPercent(1 - summary.confidence));
    else setText(uncertaintyValue, "—");
    if (summary.sourceMixed) setText(sourceValue, "multiple");
    else if (summary.source) setText(sourceValue, summary.source);
    else setText(sourceValue, "manual");
  }

  function updateToggleState(open = handle?.isOpen?.()) {
    const expanded = !!open;
    toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggleButton.setAttribute("data-active", expanded ? "true" : "false");
  }

  function refresh(open = handle?.isOpen?.()) {
    updateToggleState(open);
    updateSelectionInference();
  }

  function run(action) {
    if (typeof action !== "function") return;
    const result = action();
    const statusText = result?.status;
    if (statusText && statusBar?.set) statusBar.set(statusText);
    refresh();
  }

  function promoteInferred() {
    run(actions.acceptInferred);
  }

  acceptButton?.addEventListener("click", promoteInferred);
  clearButton?.addEventListener("click", () =>
    run(actions.clearInferenceMetadata),
  );
  uncertainButton?.addEventListener("click", () => run(actions.toggleUncertain));

  uncertaintyDefaultInput?.addEventListener("input", (e) => {
    const next =
      typeof actions.setDefaultUncertainty === "function"
        ? actions.setDefaultUncertainty(e.target.value)
        : Number(e.target.value);
    updateDefaultUncertaintyLabel(next);
  });

  if (typeof onSelectionChanged === "function") {
    onSelectionChanged(() => refresh(handle?.isOpen?.()));
  }

  syncDefaultUncertainty();
  refresh();

  return {
    toggle: () => handle?.toggle?.(),
    open: () => handle?.open?.(),
    close: () => handle?.close?.(),
    dispose: () => {
      detachToggle?.();
    },
  };
}
