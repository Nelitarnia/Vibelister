// inference-dialog.js — Modal for running/clearing interaction inference runs.

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(7,9,18,.8);z-index:90;display:grid;place-items:center;padding:24px;";
  const box = document.createElement("div");
  box.style.cssText =
    "width:min(760px,96vw);max-height:88vh;overflow:auto;background:#0f1320;" +
    "border:1px solid #2e3752;border-radius:14px;" +
    "box-shadow:0 18px 50px rgba(0,0,0,.45);padding:22px;display:flex;flex-direction:column;gap:18px;";
  overlay.appendChild(box);
  return { overlay, box };
}

function buttonStyle({ emphasis = false } = {}) {
  return {
    background: emphasis ? "#2d3b62" : "#1e253a",
    border: "1px solid #3a4666",
    color: "#e6ecff",
    borderRadius: "8px",
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: "13px",
  };
}

function applyButtonStyle(button, options) {
  Object.assign(button.style, buttonStyle(options));
}

function getFocusables(container) {
  return Array.from(
    container.querySelectorAll(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute("disabled"));
}

function trapFocus(overlay, box, onClose) {
  function keyHandler(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      const focusables = getFocusables(box);
      if (!focusables.length) return;
      const index = focusables.indexOf(document.activeElement);
      const next = event.shiftKey
        ? (index - 1 + focusables.length) % focusables.length
        : (index + 1) % focusables.length;
      event.preventDefault();
      focusables[next].focus();
    }
  }
  overlay.addEventListener("keydown", keyHandler, true);
  return () => overlay.removeEventListener("keydown", keyHandler, true);
}

function buildScopeSelector(defaultValue) {
  const scopes = [
    { value: "selection", label: "Current selection" },
    { value: "action", label: "Entire action group" },
    { value: "project", label: "Entire project" },
  ];
  const fieldset = document.createElement("fieldset");
  fieldset.style.cssText =
    "border:1px solid #1f2740;border-radius:10px;padding:12px 14px;color:#d9e2ff;";
  const legend = document.createElement("legend");
  legend.textContent = "Scope";
  legend.style.cssText = "padding:0 8px;font-weight:600;";
  fieldset.appendChild(legend);

  scopes.forEach((entry, idx) => {
    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:8px;margin:6px 0;";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "inference-scope";
    input.value = entry.value;
    input.checked = (defaultValue || "selection") === entry.value;
    label.append(input, document.createTextNode(entry.label));
    fieldset.appendChild(label);
  });

  return fieldset;
}

function buildCheckbox(labelText, defaultValue, title) {
  const label = document.createElement("label");
  label.style.cssText = "display:flex;align-items:center;gap:10px;color:#d3dcff;";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!defaultValue;
  if (title) input.title = title;
  const span = document.createElement("span");
  span.textContent = labelText;
  span.style.cssText = "user-select:none;";
  label.append(input, span);
  return { label, input };
}

function buildNumberInput(labelText, defaultValue, title) {
  const wrapper = document.createElement("label");
  wrapper.style.cssText =
    "display:flex;flex-direction:column;gap:6px;color:#d3dcff;font-size:13px;";
  wrapper.title = title || "";
  const text = document.createElement("span");
  text.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "1";
  input.step = "0.05";
  input.value = defaultValue;
  input.style.cssText =
    "background:#0c1020;border:1px solid #2f3956;border-radius:8px;color:#e6ecff;padding:8px;";
  wrapper.append(text, input);
  return { wrapper, input };
}

function buildTextInput(labelText, defaultValue, title) {
  const wrapper = document.createElement("label");
  wrapper.style.cssText =
    "display:flex;flex-direction:column;gap:6px;color:#d3dcff;font-size:13px;";
  wrapper.title = title || "";
  const text = document.createElement("span");
  text.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = defaultValue;
  input.style.cssText =
    "background:#0c1020;border:1px solid #2f3956;border-radius:8px;color:#e6ecff;padding:8px;";
  wrapper.append(text, input);
  return { wrapper, input };
}

function describeConfidenceHelp() {
  const p = document.createElement("p");
  p.textContent =
    "Confidence and source are stored with inferred End/Outcome/Tag cells. Manual edits keep source \"manual\" so bulk accept/clear flows can target non-manual values.";
  p.style.cssText = "margin:0;color:#9aa4c9;font-size:13px;";
  return p;
}

function describeSourceHelp() {
  const p = document.createElement("p");
  p.textContent =
    "Use a descriptive source (for example, \"model\" or \"import\") so inferred styling highlights non-manual rows and clearing will skip your own edits.";
  p.style.cssText = "margin:0;color:#9aa4c9;font-size:13px;";
  return p;
}

export async function openInferenceDialog(options = {}) {
  const { defaults = {}, onRun, onClear } = options;
  return new Promise((resolve) => {
    const { overlay, box } = createOverlay();
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.tabIndex = -1;

    const title = document.createElement("h2");
    title.textContent = "Inference";
    title.style.cssText = "margin:0;font-size:20px;font-weight:600;color:#f0f2ff;";

    const description = document.createElement("p");
    description.textContent =
      "Pick the scope and defaults for applying or clearing inferred interaction metadata.";
    description.style.cssText = "margin:0;font-size:14px;color:#9aa4c9;";

    const scopeSelector = buildScopeSelector(defaults.scope || "selection");

    const includeRow = document.createElement("div");
    includeRow.style.cssText = "display:flex;flex-wrap:wrap;gap:14px;";
    const { label: includeEndLabel, input: includeEndInput } = buildCheckbox(
      "Include End columns",
      defaults.includeEnd !== false,
      "If unchecked, inference ignores End columns while still scanning Outcomes.",
    );
    const { label: includeTagLabel, input: includeTagInput } = buildCheckbox(
      "Include Tag columns",
      defaults.includeTag !== false,
      "If unchecked, Tag columns are left as-is when running or clearing inference.",
    );
    includeRow.append(includeEndLabel, includeTagLabel);

    const runOptions = document.createElement("div");
    runOptions.style.cssText =
      "display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:start;";
    const { label: overwriteLabel, input: overwriteInput } = buildCheckbox(
      "Overwrite existing inferred values",
      defaults.overwriteInferred !== false,
      "When enabled, reruns can replace previously inferred metadata (manual values are never overwritten).",
    );
    const { label: onlyEmptyLabel, input: onlyEmptyInput } = buildCheckbox(
      "Only fill empty cells",
      !!defaults.onlyFillEmpty,
      "Skip cells that already contain structured values so inference only touches blanks.",
    );
    overwriteLabel.style.marginTop = "8px";
    onlyEmptyLabel.style.marginTop = "8px";
    runOptions.append(overwriteLabel, onlyEmptyLabel);

    const inputsRow = document.createElement("div");
    inputsRow.style.cssText =
      "display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;";
    const { wrapper: confidenceWrapper, input: confidenceInput } = buildNumberInput(
      "Default confidence",
      defaults.defaultConfidence ?? 0.4,
      "Saved with inferred cells to show how strong the suggestion is.",
    );
    const { wrapper: sourceWrapper, input: sourceInput } = buildTextInput(
      "Default source",
      defaults.defaultSource || "model",
      "Stored source marks cells as inferred so bulk-clear flows can target source ≠ manual.",
    );
    inputsRow.append(confidenceWrapper, sourceWrapper);

    const helpStack = document.createElement("div");
    helpStack.style.cssText = "display:flex;flex-direction:column;gap:8px;";
    helpStack.append(describeConfidenceHelp(), describeSourceHelp());

    const summary = document.createElement("div");
    summary.style.cssText = "font-size:13px;color:#c5d1ff;min-height:18px;";

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    applyButtonStyle(closeButton);

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.textContent = "Clear inferred";
    applyButtonStyle(clearButton);

    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.textContent = "Run inference";
    applyButtonStyle(runButton, { emphasis: true });

    footer.append(closeButton, clearButton, runButton);

    box.append(
      title,
      description,
      scopeSelector,
      includeRow,
      runOptions,
      inputsRow,
      helpStack,
      summary,
      footer,
    );
    document.body.appendChild(overlay);

    const disposeTrap = trapFocus(overlay, box, close);

    function close(result) {
      disposeTrap();
      overlay.remove();
      resolve(result);
    }

    function getScope() {
      const checked = scopeSelector.querySelector('input[name="inference-scope"]:checked');
      return checked ? checked.value : "selection";
    }

    function payload() {
      return {
        scope: getScope(),
        includeEnd: includeEndInput.checked,
        includeTag: includeTagInput.checked,
        overwriteInferred: overwriteInput.checked,
        onlyFillEmpty: onlyEmptyInput.checked,
        defaultConfidence: Number(confidenceInput.value || 0),
        defaultSource: sourceInput.value || "model",
      };
    }

    async function run(handler, label) {
      if (typeof handler !== "function") return;
      runButton.disabled = true;
      clearButton.disabled = true;
      closeButton.disabled = true;
      summary.textContent = `${label}...`;
      try {
        const result = await handler(payload());
        const text =
          typeof result === "string"
            ? result
            : result?.status || result?.message || "Completed.";
        summary.textContent = text || `${label} finished.`;
      } catch (error) {
        summary.textContent = `${label} failed: ${error?.message || error}`;
      } finally {
        runButton.disabled = false;
        clearButton.disabled = false;
        closeButton.disabled = false;
      }
    }

    closeButton.addEventListener("click", () => close());
    runButton.addEventListener("click", () => run(onRun, "Running inference"));
    clearButton.addEventListener("click", () =>
      run(onClear, "Clearing inferred cells"),
    );

    window.setTimeout(() => runButton.focus(), 0);
  });
}
