import { DEFAULT_HEURISTIC_THRESHOLDS } from "../app/inference-heuristics.js";
import { DEFAULT_INFERENCE_STRATEGIES } from "../app/inference-strategies/index.js";

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

function buildNumberField(labelText, defaultValue, { min, max, step, title } = {}) {
  const wrapper = document.createElement("label");
  wrapper.style.cssText =
    "display:flex;flex-direction:column;gap:6px;color:#d3dcff;font-size:13px;";
  const label = document.createElement("span");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.value = defaultValue == null ? "" : defaultValue;
  input.style.cssText =
    "background:#0d111c;border:1px solid #2b3350;border-radius:8px;" +
    "color:#e6ecff;padding:8px 10px;font-size:13px;";
  if (min != null) input.min = String(min);
  if (max != null) input.max = String(max);
  if (step != null) input.step = String(step);
  if (title) input.title = title;
  wrapper.append(label, input);
  return { wrapper, input };
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function clampRatio(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const clamped = Math.min(1, Math.max(0, num));
  return Math.round(clamped * 100) / 100;
}

function adjustCount(base, delta = 0, min = 1) {
  const next = Math.round((Number(base) || 0) + delta);
  return Math.max(min, next);
}

function derivePresetThresholds(baseThresholds = {}, variant = "default") {
  const base = { ...DEFAULT_HEURISTIC_THRESHOLDS, ...baseThresholds };
  if (variant === "lenient") {
    return {
      ...base,
      consensusMinGroupSize: adjustCount(base.consensusMinGroupSize, -1),
      consensusMinExistingRatio: clampRatio(base.consensusMinExistingRatio - 0.15),
      actionGroupMinGroupSize: adjustCount(base.actionGroupMinGroupSize, -1),
      actionGroupMinExistingRatio: clampRatio(base.actionGroupMinExistingRatio - 0.15),
      actionGroupPhaseMinGroupSize: adjustCount(base.actionGroupPhaseMinGroupSize, -1),
      actionGroupPhaseMinExistingRatio: clampRatio(
        base.actionGroupPhaseMinExistingRatio - 0.17,
      ),
      actionPropertyMinGroupSize: adjustCount(base.actionPropertyMinGroupSize, -1),
      actionPropertyMinExistingRatio: clampRatio(
        base.actionPropertyMinExistingRatio - 0.15,
      ),
      actionPropertyPhaseMinGroupSize: adjustCount(
        base.actionPropertyPhaseMinGroupSize,
        -1,
      ),
      actionPropertyPhaseMinExistingRatio: clampRatio(
        base.actionPropertyPhaseMinExistingRatio - 0.17,
      ),
      inputDefaultMinGroupSize: adjustCount(base.inputDefaultMinGroupSize, -1),
      inputDefaultMinExistingRatio: clampRatio(
        base.inputDefaultMinExistingRatio - 0.15,
      ),
      profileTrendMinObservations: adjustCount(
        base.profileTrendMinObservations,
        -1,
      ),
      profileTrendMinPreferenceRatio: clampRatio(
        base.profileTrendMinPreferenceRatio - 0.1,
      ),
    };
  }
  if (variant === "strict") {
    return {
      ...base,
      consensusMinGroupSize: adjustCount(base.consensusMinGroupSize, 1),
      consensusMinExistingRatio: clampRatio(base.consensusMinExistingRatio + 0.2),
      actionGroupMinGroupSize: adjustCount(base.actionGroupMinGroupSize, 1),
      actionGroupMinExistingRatio: clampRatio(base.actionGroupMinExistingRatio + 0.15),
      actionGroupPhaseMinGroupSize: adjustCount(base.actionGroupPhaseMinGroupSize, 1),
      actionGroupPhaseMinExistingRatio: clampRatio(
        base.actionGroupPhaseMinExistingRatio + 0.13,
      ),
      actionPropertyMinGroupSize: adjustCount(base.actionPropertyMinGroupSize, 1),
      actionPropertyMinExistingRatio: clampRatio(
        base.actionPropertyMinExistingRatio + 0.15,
      ),
      actionPropertyPhaseMinGroupSize: adjustCount(
        base.actionPropertyPhaseMinGroupSize,
        1,
      ),
      actionPropertyPhaseMinExistingRatio: clampRatio(
        base.actionPropertyPhaseMinExistingRatio + 0.13,
      ),
      inputDefaultMinGroupSize: adjustCount(base.inputDefaultMinGroupSize, 1),
      inputDefaultMinExistingRatio: clampRatio(
        base.inputDefaultMinExistingRatio + 0.15,
      ),
      profileTrendMinObservations: adjustCount(
        base.profileTrendMinObservations,
        2,
      ),
      profileTrendMinPreferenceRatio: clampRatio(
        base.profileTrendMinPreferenceRatio + 0.1,
      ),
    };
  }
  return { ...base };
}

function buildScopeSelector(defaultValue) {
  const scopes = [
    { value: "selection", label: "Current selection" },
    { value: "action", label: "Entire action" },
    { value: "actionGroup", label: "Entire action group" },
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

const STRATEGY_LABELS = Object.freeze({
  consensus: "Modifier propagation",
  "action-group": "Action groups",
  "action-property": "Action properties",
  "modifier-profile": "Modifier profiles",
  "input-default": "Input defaults",
  "profile-trend": "Trend preferences",
  "phase-adjacency": "Phase adjacency",
});

const STRATEGY_CONFIG = Object.freeze({
  consensus: {
    enabledKey: "consensusEnabled",
    fields: [
      {
        key: "consensusMinGroupSize",
        label: "Consensus min group size",
        options: {
          min: 1,
          step: 1,
          title: "Minimum rows needed in scope before consensus suggestions run.",
        },
      },
      {
        key: "consensusMinExistingRatio",
        label: "Consensus min existing ratio",
        options: {
          min: 0,
          max: 1,
          step: 0.01,
          title: "Fraction of rows that must already be filled to trust consensus suggestions.",
        },
      },
    ],
  },
  "action-group": {
    enabledKey: "actionGroupEnabled",
    fields: [
      {
        key: "actionGroupMinGroupSize",
        label: "Action group min group size",
        options: {
          min: 0,
          step: 1,
          title: "Rows per action group required before suggesting group defaults.",
        },
      },
      {
        key: "actionGroupMinExistingRatio",
        label: "Action group min existing ratio",
        options: {
          min: 0,
          max: 1,
          step: 0.01,
          title: "Filled ratio per action group before defaults or clears propagate.",
        },
      },
      {
        key: "actionGroupPhaseMinGroupSize",
        label: "Group phase min group size",
        options: {
          min: 0,
          step: 1,
          title: "Rows per phase needed before phase defaults apply.",
        },
      },
      {
        key: "actionGroupPhaseMinExistingRatio",
        label: "Group phase min existing ratio",
        options: {
          min: 0,
          max: 1,
          step: 0.01,
          title: "Filled ratio per phase required before phase-level suggestions kick in.",
        },
      },
    ],
  },
  "action-property": {
    enabledKey: "actionPropertyEnabled",
    fields: [
      {
        key: "actionPropertyMinGroupSize",
        label: "Property min group size",
        options: {
          min: 0,
          step: 1,
          title: "Rows per property required before suggesting property defaults.",
        },
      },
      {
        key: "actionPropertyMinExistingRatio",
        label: "Property min existing ratio",
        options: {
          min: 0,
          max: 1,
          step: 0.01,
          title: "Filled ratio per property before defaults or clears propagate.",
        },
      },
      {
        key: "actionPropertyPhaseMinGroupSize",
        label: "Property phase min group size",
        options: {
          min: 0,
          step: 1,
          title: "Rows per phase needed before property defaults apply.",
        },
      },
      {
        key: "actionPropertyPhaseMinExistingRatio",
        label: "Property phase min existing ratio",
        options: {
          min: 0,
          max: 1,
          step: 0.01,
          title: "Filled ratio per phase required before property-based suggestions.",
        },
      },
    ],
  },
  "modifier-profile": {
    enabledKey: "modifierProfileEnabled",
    fields: [
      {
        key: "consensusMinGroupSize",
        label: "Consensus min group size",
        options: {
          min: 1,
          step: 1,
          title: "Minimum rows needed in scope before consensus suggestions run.",
        },
      },
      {
        key: "consensusMinExistingRatio",
        label: "Consensus min existing ratio",
        options: {
          min: 0,
          max: 1,
          step: 0.01,
          title: "Fraction of rows that must already be filled to trust consensus suggestions.",
        },
      },
    ],
    hint: "Shares modifier propagation thresholds.",
  },
  "input-default": {
    enabledKey: "inputDefaultEnabled",
    fields: [
      {
        key: "inputDefaultMinGroupSize",
        label: "Input default min group size",
        options: { min: 1, step: 1, title: "Rows per input needed before seeding defaults." },
      },
      {
        key: "inputDefaultMinExistingRatio",
        label: "Input default min existing ratio",
        options: {
          min: 0,
          max: 1,
          step: 0.01,
          title: "Filled ratio per input before default suggestions trigger.",
        },
      },
    ],
  },
  "profile-trend": {
    enabledKey: "profileTrendEnabled",
    fields: [
      {
        key: "profileTrendMinObservations",
        label: "Trend min observations",
        options: { min: 0, step: 1, title: "Observations needed before applying trend preferences." },
      },
      {
        key: "profileTrendMinPreferenceRatio",
        label: "Trend min preference ratio",
        options: {
          min: 0,
          max: 1,
          step: 0.01,
          title: "Strength threshold before trends override base defaults.",
        },
      },
    ],
  },
  "phase-adjacency": {
    enabledKey: "phaseAdjacencyEnabled",
    fields: [
      {
        key: "phaseAdjacencyMaxGap",
        label: "Phase adjacency max gap",
        options: {
          min: 2,
          step: 1,
          title: "Largest phase gap to bridge when suggesting adjacent fills.",
        },
      },
    ],
  },
});

export async function openInferenceDialog(options = {}) {
  const { defaults = {}, defaultThresholds, onRun, onClear } = options;
  return new Promise((resolve) => {
    const { overlay, box } = createOverlay();
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.tabIndex = -1;

    let summary;

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;gap:10px;";

    const title = document.createElement("h2");
    title.textContent = "Inference";
    title.style.cssText = "margin:0;font-size:20px;font-weight:600;color:#f0f2ff;flex:1;";

    const infoButton = document.createElement("button");
    infoButton.type = "button";
    infoButton.textContent = "?";
    infoButton.title = "How inference picks suggestions";
    infoButton.setAttribute("aria-expanded", "false");
    applyButtonStyle(infoButton);
    infoButton.style.padding = "6px 10px";
    infoButton.style.fontWeight = "700";
    infoButton.style.minWidth = "32px";

    header.append(title, infoButton);

    const description = document.createElement("p");
    description.textContent =
      "Pick the scope and toggles for applying or clearing inferred interaction metadata.";
    description.style.cssText = "margin:0;font-size:14px;color:#9aa4c9;";

    const infoPanel = document.createElement("div");
    infoPanel.id = "inference-info";
    infoPanel.style.cssText =
      "display:none;border:1px solid #27314f;border-radius:10px;padding:12px 14px;" +
      "background:#0b1020;color:#dfe6ff;font-size:13px;line-height:1.5;";
    infoPanel.setAttribute("role", "region");
    infoPanel.setAttribute("aria-label", "Inference explanation");
    infoPanel.tabIndex = -1;

    const infoIntro = document.createElement("p");
    infoIntro.style.cssText = "margin:0 0 10px;";
    infoIntro.textContent =
      "Inference speeds up repetitive note entry by reusing values you've already set." +
      " It suggests outcomes, ends, and tags when similar rows share recognizable patterns.";

    const infoList = document.createElement("ul");
    infoList.style.cssText = "margin:0 0 10px 18px;padding:0;display:grid;gap:8px;";

    const addInfo = (label, text) => {
      const item = document.createElement("li");
      item.style.cssText = "color:#dfe6ff;";
      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;
      const span = document.createElement("span");
      span.textContent = text;
      item.append(strong, span);
      infoList.appendChild(item);
    };

    addInfo(
      "Modifier propagation",
      "Finds consensus across rows that share the same action, input, and modifier setup, then mirrors that value.",
    );
    addInfo(
      "Action groups",
      "Spreads consistent outcomes, ends, or tags within the same action group or phase when enough rows agree.",
    );
    addInfo(
      "Action properties",
      "Shares consistent values across actions that advertise the same properties, even if they belong to different groups.",
    );
    addInfo(
      "Modifier profiles",
      "Uses recurring values tied to a variant signature to seed suggestions even outside the original group.",
    );
    addInfo(
      "Input defaults",
      "When an action/input pairing repeats the same value often enough, that value becomes the default suggestion.",
    );
    addInfo(
      "Trend preferences",
      "Recent edits and clears teach the heuristic which values you keep applying; weak signals are ignored until they are consistent.",
    );
    addInfo(
      "Phase adjacency",
      "Bridges small gaps between filled phases so nearby rows can inherit the same values even when a few phases are empty.",
    );

    const infoFooter = document.createElement("p");
    infoFooter.style.cssText = "margin:0;color:#b8c4f2;font-size:12px;";
    infoFooter.textContent =
      "Manual values stay as-is (unless you explicitly allow filling blanks). Inferred cells are treated like blanks for sourcing and only change when you allow overwrites. Thresholds in Advanced tune how much agreement is needed.";

    infoPanel.append(infoIntro, infoList, infoFooter);

    const toggleInfo = () => {
      const willShow = infoPanel.style.display === "none";
      infoPanel.style.display = willShow ? "block" : "none";
      infoButton.setAttribute("aria-expanded", String(willShow));
      if (willShow) infoPanel.focus?.();
    };

    infoButton.addEventListener("click", toggleInfo);

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

    const bypassRow = document.createElement("div");
    bypassRow.style.cssText = "display:flex;flex-wrap:wrap;gap:14px;";
    const {
      label: inferFromBypassLabel,
      input: inferFromBypassInput,
    } = buildCheckbox(
      "Infer from bypassed modifiers",
      !!defaults.inferFromBypassed,
      "When enabled, bypass/marked modifiers participate when mining inference sources.",
    );
    const { label: inferToBypassLabel, input: inferToBypassInput } = buildCheckbox(
      "Infer to bypassed modifiers",
      !!defaults.inferToBypassed,
      "When enabled, bypass/marked modifier rows are eligible inference targets.",
    );
    bypassRow.append(inferFromBypassLabel, inferToBypassLabel);

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
      label: skipManualOutcomeLabel,
      input: skipManualOutcomeInput,
    } = buildCheckbox(
      "Skip rows with manual Outcome",
      !!defaults.skipManualOutcome,
      "When enabled, inference leaves End/Tag untouched if the row already has a manual Outcome.",
    );
    overwriteLabel.style.marginTop = "8px";
    onlyEmptyLabel.style.marginTop = "8px";
    skipManualOutcomeLabel.style.marginTop = "8px";
    runOptions.append(overwriteLabel, onlyEmptyLabel, skipManualOutcomeLabel);

    const basicSection = document.createElement("div");
    basicSection.append(scopeSelector, includeRow, bypassRow, runOptions);

    const advancedSection = document.createElement("div");
    advancedSection.style.cssText =
      "display:none;flex-direction:column;gap:12px;";

    const thresholdDefaults = {
      ...DEFAULT_HEURISTIC_THRESHOLDS,
      ...(defaultThresholds || {}),
    };
    const baseThresholds = derivePresetThresholds(thresholdDefaults, "default");
    const lenientThresholds = derivePresetThresholds(baseThresholds, "lenient");
    const strictThresholds = derivePresetThresholds(baseThresholds, "strict");
    const initialThresholds = {
      ...thresholdDefaults,
      ...(defaults.thresholdOverrides || {}),
    };

    const thresholdInputs = new Map();
    const strategyToggles = new Map();

    function setThresholdValue(key, value) {
      const inputs = thresholdInputs.get(key) || [];
      for (const input of inputs) {
        input.value = value == null ? "" : value;
      }
    }

    function setThresholdInputs(values = {}, { skipToggles = false } = {}) {
      for (const [key] of thresholdInputs.entries()) {
        if (!(key in values)) continue;
        setThresholdValue(key, values[key]);
      }
      if (!skipToggles) {
        for (const [, toggle] of strategyToggles.entries()) {
          const { checkbox, enabledKey } = toggle;
          if (!enabledKey || !(enabledKey in values)) continue;
          checkbox.checked = !!values[enabledKey];
        }
      }
    }

    function registerThresholdInput(key, input) {
      if (!thresholdInputs.has(key)) thresholdInputs.set(key, []);
      thresholdInputs.get(key).push(input);
      input.addEventListener("input", () =>
        setThresholdInputs({ [key]: input.value }, { skipToggles: true }),
      );
    }

    const presetRow = document.createElement("div");
    presetRow.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;gap:8px;justify-content:flex-start;";
    const presetLabel = document.createElement("span");
    presetLabel.textContent = "Presets:";
    presetLabel.style.cssText = "color:#cdd8ff;font-size:12px;font-weight:600;";
    presetRow.appendChild(presetLabel);

    const presetButtons = [
      {
        label: "Default",
        title: "Restore the recommended defaults for all heuristics.",
        values: baseThresholds,
      },
      {
        label: "Lenient",
        title: "Lower minimums so suggestions appear with less agreement.",
        values: lenientThresholds,
      },
      {
        label: "Hard",
        title: "Require more agreement before suggesting values.",
        values: strictThresholds,
      },
    ];

    presetButtons.forEach((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = preset.label;
      button.title = preset.title;
      applyButtonStyle(button);
      button.style.padding = "6px 12px";
      button.addEventListener("click", () => {
        setThresholdInputs(preset.values);
        for (const [, toggle] of strategyToggles.entries()) {
          const { checkbox, enabledKey } = toggle;
          if (enabledKey && enabledKey in preset.values) {
            checkbox.checked = !!preset.values[enabledKey];
          }
        }
        if (summary) summary.textContent = `${preset.label} thresholds applied.`;
      });
      presetRow.appendChild(button);
    });

    const heuristicGrid = document.createElement("div");
    heuristicGrid.style.cssText =
      "display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;";

    DEFAULT_INFERENCE_STRATEGIES.forEach((strategy) => {
      const config = STRATEGY_CONFIG[strategy.key] || {};
      const block = document.createElement("section");
      block.style.cssText =
        "border:1px solid #1f2740;border-radius:10px;padding:12px 12px;" +
        "background:#0b1020;display:flex;flex-direction:column;gap:10px;";

      const headerRow = document.createElement("div");
      headerRow.style.cssText =
        "display:flex;align-items:center;gap:10px;justify-content:space-between;";
      const label = document.createElement("span");
      label.textContent = STRATEGY_LABELS[strategy.key] || strategy.key;
      label.style.cssText = "color:#e1e8ff;font-weight:700;font-size:14px;";

      const enabledKey = config.enabledKey;
      const defaultEnabled =
        typeof initialThresholds[enabledKey] === "boolean"
          ? initialThresholds[enabledKey]
          : true;
      const { label: enabledLabel, input: enabledInput } = buildCheckbox(
        "Enabled",
        defaultEnabled,
        "Toggle this heuristic on or off",
      );
      enabledLabel.style.margin = "0";
      enabledLabel.style.gap = "8px";
      enabledLabel.style.fontSize = "13px";
      enabledInput.style.margin = "0";

      strategyToggles.set(strategy.key, {
        checkbox: enabledInput,
        enabledKey,
      });

      headerRow.append(label, enabledLabel);
      block.appendChild(headerRow);

      if (Array.isArray(config.fields) && config.fields.length) {
        const fieldGrid = document.createElement("div");
        fieldGrid.style.cssText =
          "display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;";
        config.fields.forEach((field) => {
          const defaultValue = initialThresholds[field.key];
          const { wrapper, input } = buildNumberField(
            field.label,
            defaultValue == null ? "" : defaultValue,
            field.options,
          );
          registerThresholdInput(field.key, input);
          fieldGrid.appendChild(wrapper);
        });
        block.appendChild(fieldGrid);
      }

      if (config.hint) {
        const hint = document.createElement("p");
        hint.textContent = config.hint;
        hint.style.cssText = "margin:0;color:#8c98c8;font-size:12px;";
        block.appendChild(hint);
      }

      heuristicGrid.appendChild(block);
    });

    setThresholdInputs(initialThresholds);

    const advancedHint = document.createElement("p");
    advancedHint.textContent =
      "Tune each heuristic separately. Leave blanks to fall back to defaults.";
    advancedHint.style.cssText = "margin:4px 0 0;color:#8c98c8;font-size:12px;";

    advancedSection.append(presetRow, heuristicGrid, advancedHint);

    function buildThresholdOverrides() {
      const overrides = {};
      thresholdInputs.forEach((inputs, key) => {
        if (!inputs.length) return;
        overrides[key] = parseNumber(inputs[0].value);
      });
      for (const [, toggle] of strategyToggles.entries()) {
        if (toggle.enabledKey) {
          overrides[toggle.enabledKey] = toggle.checkbox.checked;
        }
      }
      return overrides;
    }

    const tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;gap:6px;";
    const basicTab = document.createElement("button");
    basicTab.type = "button";
    basicTab.textContent = "Basics";
    applyButtonStyle(basicTab, { emphasis: true });
    basicTab.style.flex = "0 0 auto";
    const advancedTab = document.createElement("button");
    advancedTab.type = "button";
    advancedTab.textContent = "Advanced thresholds";
    applyButtonStyle(advancedTab);
    advancedTab.style.flex = "0 0 auto";

    const switchTab = (target) => {
      const isBasic = target === "basic";
      basicSection.style.display = isBasic ? "grid" : "none";
      basicSection.style.gridTemplateColumns =
        "repeat(auto-fit,minmax(320px,1fr))";
      advancedSection.style.display = isBasic ? "none" : "flex";
      applyButtonStyle(basicTab, { emphasis: isBasic });
      applyButtonStyle(advancedTab, { emphasis: !isBasic });
    };

    basicTab.addEventListener("click", () => switchTab("basic"));
    advancedTab.addEventListener("click", () => switchTab("advanced"));

    tabs.append(basicTab, advancedTab);
    switchTab("basic");

    summary = document.createElement("div");
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
      header,
      description,
      infoPanel,
      trendsHint,
      tabs,
      basicSection,
      advancedSection,
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
        inferFromBypassed: inferFromBypassInput.checked,
        inferToBypassed: inferToBypassInput.checked,
        overwriteInferred: overwriteInput.checked,
        onlyFillEmpty: onlyEmptyInput.checked,
        skipManualOutcome: skipManualOutcomeInput.checked,
        thresholdOverrides: buildThresholdOverrides(),
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
