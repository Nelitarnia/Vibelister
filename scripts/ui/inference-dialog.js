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
      "Pick the scope and toggles for applying or clearing inferred interaction metadata.";
    description.style.cssText = "margin:0;font-size:14px;color:#9aa4c9;";

    const trendsHint = document.createElement("p");
    trendsHint.textContent =
      "Suggestions may lean on recent modifier/input trends; heuristics pick confidence and source automatically.";
    trendsHint.title =
      "Heuristics set their own confidence/source when proposing values. Manual defaults live in settings and manual edits keep source \"manual\".";
    trendsHint.style.cssText = "margin:0;font-size:12px;color:#7f8ab5;";

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
  const {
    label: fillIntentionalLabel,
    input: fillIntentionalInput,
  } = buildCheckbox(
    "Fill intentionally blank End/Tag",
    !!defaults.fillIntentionalBlanks,
    "Allow inference to fill End/Tag when Outcome is already manual with default confidence/source.",
  );
  overwriteLabel.style.marginTop = "8px";
  onlyEmptyLabel.style.marginTop = "8px";
  fillIntentionalLabel.style.marginTop = "8px";
  runOptions.append(overwriteLabel, onlyEmptyLabel, fillIntentionalLabel);

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
      trendsHint,
      scopeSelector,
      includeRow,
      runOptions,
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
        fillIntentionalBlanks: fillIntentionalInput.checked,
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
