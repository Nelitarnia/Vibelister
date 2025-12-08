// variants.js - variant engine which generates the list of Actions with modifiers.

import {
  modStateActiveish,
  modStateIsOn,
  modStateIsRequired,
} from "./mod-state-normalize.js";
import { groupCombos } from "./variant-combinatorics.js";
import { buildConstraintMaps, violatesConstraints } from "./variant-constraints.js";

// helpers for ordering
export function modOrderMap(model) {
  const map = {};
  const mods = model && Array.isArray(model.modifiers) ? model.modifiers : [];
  mods.forEach((m, idx) => {
    if (m && typeof m.id === "number") map[m.id] = idx;
  });
  return map;
}
export function sortIdsByUserOrder(ids, model) {
  const ord = modOrderMap(model);
  return ids.slice().sort((a, b) => (ord[a] ?? 1e9) - (ord[b] ?? 1e9) || a - b);
}
export function compareVariantSig(a, b, model) {
  if (a === b) return 0;
  const A = a ? a.split("+").map(Number) : [];
  const B = b ? b.split("+").map(Number) : [];
  if (A.length !== B.length) return A.length - B.length;
  const As = sortIdsByUserOrder(A, model),
    Bs = sortIdsByUserOrder(B, model);
  const ord = modOrderMap(model); // safe even if model undefined
  for (let i = 0; i < As.length; i++) {
    const da = ord[As[i]] ?? 1e9,
      db = ord[Bs[i]] ?? 1e9;
    if (da !== db) return da - db;
    if (As[i] !== Bs[i]) return As[i] - Bs[i];
  }
  return 0;
}

// canonical signature for storage
function variantSignature(ids) {
  if (!ids || !ids.length) return "";
  const a = Array.from(new Set(ids.map(Number)))
    .filter(Number.isFinite)
    .sort((x, y) => x - y);
  return a.join("+");
}

// group modes
export { GROUP_MODES } from "./variant-combinatorics.js";

// canonical signature normalizer for strings (e.g., '5+1+5' -> '1+5')
export function canonicalSig(sig) {
  if (!sig) return "";
  const arr = String(sig).split("+").map(Number).filter(Number.isFinite);
  arr.sort((a, b) => a - b);
  // dedupe
  const out = [];
  let prev;
  for (const x of arr) {
    if (x !== prev) {
      out.push(x);
      prev = x;
    }
  }
  return out.join("+");
}

const CAP_PER_ACTION = 5000; // total variants per action (early stop)

function computeVariantsForAction(action, model, options = {}) {
  const includeMarked = !!options.includeMarked;
  const set = action.modSet || {};
  const requiredIds = [];
  const requiredSet = new Set();
  const optionalElig = [];
  for (const [key, value] of Object.entries(set)) {
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    const isRequired = modStateIsRequired(value);
    const isActive =
      isRequired || (includeMarked ? modStateActiveish(value) : modStateIsOn(value));
    if (isRequired) {
      requiredIds.push(id);
      requiredSet.add(id);
    }
    if (isActive && !isRequired) optionalElig.push(id);
  }
  if (!requiredIds.length && !optionalElig.length) return [""];
  const groups = (model.modifierGroups || []).map((g) => ({
    id: g.id,
    name: g.name,
    memberIds: (g.memberIds || []).slice(),
    mode: g.mode,
    k: g.k,
    kMin: g.kMin,
    kMax: g.kMax,
    required: !!g.required,
  }));
  if (!groups.length) return [variantSignature(requiredIds)];

  const choices = [];
  const optionalEligSet = new Set(optionalElig);
  for (const g of groups) {
    const ch = groupCombos(g, {
      optionalEligible: optionalEligSet,
      required: requiredSet,
    });
    if (ch.length === 0) {
      if (g.required) return [];
      continue;
    }
    choices.push(ch);
  }
  choices.sort((a, b) => a.length - b.length);

  const maps = buildConstraintMaps(model.modifierConstraints);
  const res = [];
  const base = requiredIds.slice();
  (function rec(i, acc) {
    if (res.length >= CAP_PER_ACTION) return; // hard stop
    if (i === choices.length) {
      res.push(variantSignature(acc));
      return;
    }
    const list = choices[i];
    for (let idx = 0; idx < list.length; idx++) {
      const ch = list[idx];
      const next = acc.concat(ch);
      if (!violatesConstraints(next, maps)) {
        rec(i + 1, next);
        if (res.length >= CAP_PER_ACTION) return;
      }
    }
  })(0, base);

  // Deduplicate identical signatures (e.g., overlapping groups choosing the same modifier)
  const uniq = Array.from(new Set(res));
  uniq.sort((a, b) => compareVariantSig(a, b, model));
  return uniq.length ? uniq : [""];
}

export function buildInteractionsPairs(model, options = {}) {
  const includeBypass = !!options.includeBypass;
  const targetIndexField = options.targetIndexField || "interactionsIndex";
  const isBaseIndex = !includeBypass && targetIndexField === "interactionsIndex";
  const currentBaseVersion = Number(model?.interactionsIndexVersion) || 0;
  const baseVersion = isBaseIndex ? currentBaseVersion + 1 : currentBaseVersion;
  const actionSet = options.actionIds
    ? new Set(
        options.actionIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id)),
      )
    : null;
  const actionsSource = Array.isArray(options.actions)
    ? options.actions
    : model.actions || [];
  const actions = actionsSource.filter((a) => {
    if (!a || !(a.name || "").trim().length) return false;
    if (actionSet && !actionSet.has(a.id)) return false;
    return true;
  });
  const inputs = (model.inputs || []).filter(
    (i) => i && (i.name || "").trim().length,
  );
  const hasActionLevelRequirements = actions.some((action) => {
    const set = action?.modSet;
    if (!set || typeof set !== "object") return false;
    for (const value of Object.values(set)) {
      if (modStateIsRequired(value)) return true;
    }
    return false;
  });
  const useG =
    (model.modifierGroups && model.modifierGroups.length > 0) ||
    hasActionLevelRequirements;
  const indexGroups = [];
  const variantCatalog = {};
  let totalRows = 0;
  let capped = false,
    cappedActions = 0;
  const mode = (model.meta && model.meta.interactionsMode) || "AI";
  const actionVariantCache = new Map();

  function getVariantsForAction(action) {
    const cacheKey = `${includeBypass ? "b" : "d"}:${action.id}`;
    if (actionVariantCache.has(cacheKey)) return actionVariantCache.get(cacheKey);
    let variants = useG
      ? computeVariantsForAction(action, model, { includeMarked: includeBypass })
      : [""];
    const truncated = variants.length > CAP_PER_ACTION;
    if (truncated) variants = variants.slice(0, CAP_PER_ACTION);
    const entry = { variants, truncated };
    actionVariantCache.set(cacheKey, entry);
    return entry;
  }

  if (mode === "AA") {
    // Actions × Actions (with variants on BOTH sides)
    for (const a of actions) {
      const { variants: varsA, truncated: truncatedA } = getVariantsForAction(a);
      if (truncatedA) {
        capped = true;
        cappedActions++;
      }
      variantCatalog[a.id] = varsA.slice();
      const group = { actionId: a.id, variants: [] };
      let groupFirstRow = null;
      let groupTotalRows = 0;
      for (const sigA of varsA) {
        const variantStart = totalRows;
        let rowsAdded = 0;
        for (const b of actions) {
          const { variants: varsB } = getVariantsForAction(b);
          if (!variantCatalog[b.id]) variantCatalog[b.id] = varsB.slice();
          for (const sigB of varsB) {
            rowsAdded++;
          }
        }
        totalRows += rowsAdded;
        group.variants.push({
          variantSig: sigA,
          rowIndex: variantStart,
          rowCount: rowsAdded,
        });
        if (rowsAdded > 0) {
          if (groupFirstRow == null) groupFirstRow = variantStart;
          groupTotalRows += rowsAdded;
        }
      }
      group.rowIndex = groupFirstRow;
      group.totalRows = groupTotalRows;
      indexGroups.push(group);
    }
    model.interactionsPairs = [];
    model[targetIndexField] = {
      mode: "AA",
      includeBypass,
      baseVersion,
      groups: indexGroups,
      totalRows,
      actionsOrder: actions.map((a) => a.id),
      inputsOrder: [],
      variantCatalog,
    };
    if (isBaseIndex) model.interactionsIndexVersion = baseVersion;
    return {
      actionsCount: actions.length,
      inputsCount: actions.length,
      pairsCount: totalRows,
      capped,
      cappedActions,
    };
  } // Default: Actions × Inputs
  for (const a of actions) {
    const { variants: vars, truncated } = getVariantsForAction(a);
    if (truncated) {
      capped = true;
      cappedActions++;
    }
    variantCatalog[a.id] = vars.slice();
    const group = { actionId: a.id, variants: [] };
    let groupFirstRow = null;
    let groupTotalRows = 0;
    for (const sig of vars) {
      const variantStart = totalRows;
      const rowsAdded = inputs.length;
      totalRows += rowsAdded;
      group.variants.push({
        variantSig: sig,
        rowIndex: variantStart,
        rowCount: rowsAdded,
      });
      if (rowsAdded > 0) {
        if (groupFirstRow == null) groupFirstRow = variantStart;
        groupTotalRows += rowsAdded;
      }
    }
    group.rowIndex = groupFirstRow;
    group.totalRows = groupTotalRows;
    indexGroups.push(group);
  }
  model.interactionsPairs = [];
  model[targetIndexField] = {
    mode: "AI",
    includeBypass,
    baseVersion,
    groups: indexGroups,
    totalRows,
    actionsOrder: actions.map((a) => a.id),
    inputsOrder: inputs.map((i) => i.id),
    variantCatalog,
  };
  if (isBaseIndex) model.interactionsIndexVersion = baseVersion;
  return {
    actionsCount: actions.length,
    inputsCount: inputs.length,
    pairsCount: totalRows,
    capped,
    cappedActions,
    index: model[targetIndexField],
  };
}

export function buildScopedInteractionsPairs(model, actionIds, options = {}) {
  const includeBypass = !!options.includeBypass;
  const baseVersion = Number(model?.interactionsIndexVersion) || 0;
  const normalizedIds = Array.isArray(actionIds)
    ? Array.from(
        new Set(
          actionIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id >= 0),
        ),
      )
        .sort((a, b) => a - b)
    : [];
  const targetIndexField = options.targetIndexField || "interactionsIndex";
  const cacheField = options.cacheField || `${targetIndexField}Cache`;
  const cacheKey = `${includeBypass ? "b" : "d"}:${
    normalizedIds.length ? normalizedIds.join(",") : "all"
  }`;
  const cache = (() => {
    const existing = model[cacheField];
    if (existing && typeof existing === "object") return existing;
    const created = {};
    model[cacheField] = created;
    return created;
  })();
  if (cache[cacheKey] && cache[cacheKey].baseVersion === baseVersion) {
    return { index: cache[cacheKey].index, summary: cache[cacheKey].summary };
  }
  const summary = buildInteractionsPairs(model, {
    ...options,
    includeBypass,
    targetIndexField,
    actionIds: normalizedIds,
  });
  const index = model[targetIndexField];
  if (index)
    cache[cacheKey] = { index, summary, baseVersion: index.baseVersion ?? baseVersion };
  return { index, summary };
}
