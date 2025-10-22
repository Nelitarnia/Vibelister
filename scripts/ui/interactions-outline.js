import { formatEndActionLabel } from "../data/column-kinds.js";
import { sortIdsByUserOrder } from "../data/variants/variants.js";

function namesForVariant(model, sig) {
  if (!model) return [];
  const raw = typeof sig === "string" ? sig : "";
  if (!raw) return [];
  const ids = raw
    .split("+")
    .map((part) => Number(part))
    .filter(Number.isFinite);
  if (!ids.length) return [];
  const sorted = sortIdsByUserOrder(ids, model);
  const nameById = new Map();
  for (const mod of model.modifiers || []) {
    const id = Number(mod?.id);
    if (!Number.isFinite(id)) continue;
    if (typeof mod?.name === "string" && mod.name.trim()) nameById.set(id, mod.name);
  }
  const out = [];
  for (const id of sorted) {
    const label = nameById.get(id);
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

function getActionName(action, fallbackId) {
  if (action && typeof action.name === "string" && action.name.trim()) {
    return action.name;
  }
  return fallbackId != null ? `Action ${fallbackId}` : "Action";
}

function ensureNumber(value, fallback = NaN) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildEntries(model, filter, showVariants) {
  const index = model?.interactionsIndex;
  const groups = Array.isArray(index?.groups) ? index.groups : [];
  if (!groups.length) return [];

  const actionsById = new Map();
  for (const action of model?.actions || []) {
    const id = Number(action?.id);
    if (Number.isFinite(id)) actionsById.set(id, action);
  }

  const query = String(filter || "").trim().toLowerCase();
  const results = [];

  for (const group of groups) {
    const actionId = Number(group?.actionId);
    if (!Number.isFinite(actionId)) continue;
    const action = actionsById.get(actionId);
    const actionName = getActionName(action, actionId);
    const variants = Array.isArray(group?.variants) ? group.variants : [];
    if (!variants.length) continue;

    let totalRows = 0;
    const variantEntries = [];
    let variantMatches = false;

    for (const variant of variants) {
      const rowIndex = ensureNumber(variant?.rowIndex);
      const rowCount = Math.max(0, ensureNumber(variant?.rowCount, 0));
      if (!Number.isFinite(rowIndex) || rowCount <= 0) continue;
      totalRows += rowCount;
      const variantSig = typeof variant?.variantSig === "string" ? variant.variantSig : "";
      const fullLabel = formatEndActionLabel(model, action, variantSig, {
        style: "parentheses",
      });
      const modifierNames = namesForVariant(model, variantSig);
      const displayLabel = modifierNames.length
        ? modifierNames.map((name) => `+${name}`).join(" ")
        : "No modifiers";
      const searchSpace = `${actionName} ${fullLabel} ${displayLabel}`.toLowerCase();
      const matches = !query || searchSpace.includes(query);
      if (matches) variantMatches = true;
      variantEntries.push({
        key: `variant:${actionId}:${variantSig || "_"}`,
        type: "variant",
        label: displayLabel,
        fullLabel,
        matches,
        rowIndex,
        rowCount,
        actionId,
        variantSig,
      });
    }

    if (!totalRows) continue;

    const combinedVariantLabels = variantEntries
      .map((entry) => entry.fullLabel.toLowerCase())
      .join(" ");
    const actionMatches = !query || `${actionName.toLowerCase()} ${combinedVariantLabels}`.includes(query);
    if (!actionMatches && !variantMatches) continue;

    const firstVariant = variantEntries[0];
    const actionRowIndex = Number.isFinite(group?.rowIndex)
      ? Number(group.rowIndex)
      : firstVariant?.rowIndex ?? 0;

    results.push({
      key: `action:${actionId}`,
      type: "action",
      label: actionName,
      rowIndex: Number.isFinite(actionRowIndex) ? actionRowIndex : 0,
      rowCount: group?.totalRows ? Number(group.totalRows) : totalRows,
      actionId,
      matches: actionMatches,
      variantCount: variantEntries.length,
    });

    if (showVariants) {
      const visibleVariants = query
        ? variantEntries.filter((entry) => entry.matches)
        : variantEntries;
      for (const entry of visibleVariants) results.push(entry);
    }
  }

  return results;
}

function resolveActiveKey(model, selectionState, showVariants) {
  const cellState =
    selectionState && typeof selectionState === "object" && "cell" in selectionState
      ? selectionState.cell
      : selectionState;
  const row = Number(cellState?.r);
  if (!Number.isFinite(row)) return null;
  const groups = model?.interactionsIndex?.groups;
  if (!Array.isArray(groups)) return null;
  for (const group of groups) {
    const actionId = Number(group?.actionId);
    if (!Number.isFinite(actionId)) continue;
    const variants = Array.isArray(group?.variants) ? group.variants : [];
    for (const variant of variants) {
      const start = ensureNumber(variant?.rowIndex);
      const count = Math.max(0, ensureNumber(variant?.rowCount, 0));
      if (!Number.isFinite(start) || count <= 0) continue;
      if (row >= start && row < start + count) {
        if (showVariants) {
          const sig = typeof variant?.variantSig === "string" ? variant.variantSig : "";
          return `variant:${actionId}:${sig || "_"}`;
        }
        return `action:${actionId}`;
      }
    }
  }
  return null;
}

export function createInteractionsOutline(options = {}) {
  const {
    model,
    Selection,
    SelectionCtl,
    sel,
    ensureVisible,
    render,
    layout,
    sheet,
    onSelectionChanged,
  } = options;

  const panel = document.getElementById("interactionsOutline");
  const handle = document.getElementById("interactionsOutlineHandle");
  const toggleButton = document.getElementById("interactionsOutlineToggle");
  if (!panel || !toggleButton || !handle) {
    return {
      refresh() {},
      setActive() {},
      toggle() {},
    };
  }

  const listEl = panel.querySelector('[data-role="list"]');
  const emptyEl = panel.querySelector('[data-role="empty"]');
  const filterInput = panel.querySelector('[data-role="filter"]');
  const variantsToggle = panel.querySelector('[data-role="variants-toggle"]');
  const closeButton = handle.querySelector('[data-action="close"]');

  if (!listEl || !emptyEl) {
    return {
      refresh() {},
      setActive() {},
      toggle() {},
    };
  }

  let open = false;
  let active = false;
  let filter = "";
  let showVariants = true;
  let entries = [];
  let lastEffectiveOpen = false;

  updateToggleState(false);

  function updateToggleState(effectiveOpen) {
    const openValue = effectiveOpen ? "true" : "false";
    const activeValue = active ? "true" : "false";
    toggleButton.setAttribute("data-open", openValue);
    toggleButton.setAttribute("aria-expanded", openValue);
    toggleButton.setAttribute("data-active", activeValue);
    if (!active) toggleButton.setAttribute("aria-disabled", "true");
    else toggleButton.removeAttribute("aria-disabled");
    handle.setAttribute("data-open", openValue);
    handle.setAttribute("data-active", activeValue);
    if (closeButton) {
      if (effectiveOpen && active) {
        closeButton.removeAttribute("tabindex");
        closeButton.removeAttribute("aria-hidden");
      } else {
        closeButton.setAttribute("tabindex", "-1");
        closeButton.setAttribute("aria-hidden", "true");
      }
    }
  }

  function ensureControlsReflectState() {
    if (filterInput && filterInput.value !== filter) filterInput.value = filter;
    if (variantsToggle && variantsToggle.checked !== showVariants)
      variantsToggle.checked = showVariants;
  }

  function updateEmptyState(hasItems) {
    if (!emptyEl) return;
    if (hasItems) {
      emptyEl.setAttribute("data-hidden", "true");
      return;
    }
    const hasPairs = Array.isArray(model?.interactionsPairs) && model.interactionsPairs.length > 0;
    emptyEl.setAttribute("data-hidden", "false");
    if (filter) {
      emptyEl.textContent = "No matches found.";
    } else if (hasPairs) {
      emptyEl.textContent = "No actions available.";
    } else {
      emptyEl.textContent = "Generate Interactions to see the outline.";
    }
  }

  function updateActiveFromSelection({ scrollIntoView = false } = {}) {
    if (!entries.length) {
      listEl.querySelectorAll(".sheet-sidebar__button").forEach((btn) => {
        btn.removeAttribute("data-selected");
        btn.removeAttribute("aria-current");
      });
      return;
    }
    const key = resolveActiveKey(model, Selection, showVariants);
    const buttons = Array.from(listEl.querySelectorAll(".sheet-sidebar__button"));
    let target = null;
    for (const btn of buttons) {
      const matches = key && btn.dataset.entryKey === key;
      if (matches) target = btn;
      if (matches) {
        btn.setAttribute("data-selected", "true");
        btn.setAttribute("aria-current", "true");
      } else {
        btn.removeAttribute("data-selected");
        btn.removeAttribute("aria-current");
      }
    }
    if (scrollIntoView && target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }

  function renderList() {
    listEl.innerHTML = "";
    if (!entries.length) {
      updateEmptyState(false);
      return;
    }
    updateEmptyState(true);
    const frag = document.createDocumentFragment();
    for (const entry of entries) {
      const wrapper = document.createElement("div");
      wrapper.className = "sheet-sidebar__item";
      if (entry.type === "variant") wrapper.classList.add("sheet-sidebar__item--variant");
      wrapper.setAttribute("role", "listitem");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-sidebar__button";
      btn.textContent = entry.label;
      btn.dataset.entryKey = entry.key;
      btn.dataset.entryType = entry.type;
      btn.dataset.rowIndex = String(entry.rowIndex);
      btn.dataset.rowCount = String(entry.rowCount);
      if (entry.type === "variant") {
        btn.title = entry.fullLabel;
      } else {
        btn.title = entry.label;
      }
      wrapper.appendChild(btn);
      if (entry.type === "action" && entry.variantCount != null) {
        const meta = document.createElement("div");
        meta.className = "sheet-sidebar__meta";
        meta.textContent =
          entry.variantCount === 1
            ? "1 variant"
            : `${entry.variantCount} variants`;
        wrapper.appendChild(meta);
      }
      frag.appendChild(wrapper);
    }
    listEl.appendChild(frag);
    updateActiveFromSelection({ scrollIntoView: open && active });
  }

  function recomputeEntries() {
    entries = buildEntries(model, filter, showVariants);
  }

  function refreshEntries() {
    ensureControlsReflectState();
    recomputeEntries();
    renderList();
  }

  function effectiveOpenState() {
    return open && active;
  }

  function updatePanelState({ fromRefresh = false } = {}) {
    const effectiveOpen = effectiveOpenState();
    panel.setAttribute("data-open", effectiveOpen ? "true" : "false");
    panel.setAttribute("aria-hidden", effectiveOpen ? "false" : "true");
    updateToggleState(effectiveOpen);
    if (effectiveOpen !== lastEffectiveOpen) {
      if (effectiveOpen) {
        layout?.();
        render?.();
        updateActiveFromSelection({ scrollIntoView: true });
      } else {
        layout?.();
        render?.();
      }
      lastEffectiveOpen = effectiveOpen;
    } else if (effectiveOpen && !fromRefresh) {
      updateActiveFromSelection();
    }
  }

  function openPanel() {
    if (!active) return;
    if (open) return;
    open = true;
    updatePanelState();
    filterInput?.focus();
  }

  function closePanel() {
    if (!open) return;
    open = false;
    updatePanelState();
    sheet?.focus?.();
  }

  function togglePanel() {
    if (!active) return;
    if (open) closePanel();
    else openPanel();
  }

  function activateButton(btn) {
    const rowIndex = Number(btn?.dataset?.rowIndex);
    if (!Number.isFinite(rowIndex) || rowIndex < 0) return;
    const colIndex = 0;
    SelectionCtl?.startSingle?.(rowIndex, colIndex);
    sel.r = rowIndex;
    sel.c = colIndex;
    ensureVisible?.(rowIndex, colIndex, { align: "top" });
    render?.();
    sheet?.focus?.();
  }

  if (toggleButton) {
    toggleButton.addEventListener("click", () => {
      if (!active) return;
      togglePanel();
    });
  }

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      closePanel();
    });
  }

  if (filterInput) {
    filterInput.addEventListener("input", () => {
      filter = filterInput.value || "";
      refreshEntries();
      updatePanelState({ fromRefresh: true });
    });
  }

  if (variantsToggle) {
    variantsToggle.addEventListener("change", () => {
      showVariants = !!variantsToggle.checked;
      refreshEntries();
      updatePanelState({ fromRefresh: true });
    });
  }

  listEl.addEventListener("dblclick", (event) => {
    const btn = event.target.closest(".sheet-sidebar__button");
    if (!btn) return;
    activateButton(btn);
  });

  listEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const btn = event.target.closest(".sheet-sidebar__button");
    if (!btn) return;
    event.preventDefault();
    activateButton(btn);
  });

  const disposeSelection = typeof onSelectionChanged === "function"
    ? onSelectionChanged(() => {
        if (!active) return;
        updateActiveFromSelection({ scrollIntoView: false });
      })
    : null;

  function setActiveState(nextActive) {
    const prev = active;
    active = !!nextActive;
    if (active && !prev) {
      refreshEntries();
    }
    updatePanelState();
  }

  function destroy() {
    disposeSelection?.();
  }

  return {
    refresh() {
      refreshEntries();
      updatePanelState({ fromRefresh: true });
    },
    setActive(next) {
      setActiveState(next);
    },
    toggle() {
      togglePanel();
    },
    open: openPanel,
    close: closePanel,
    destroy,
  };
}
