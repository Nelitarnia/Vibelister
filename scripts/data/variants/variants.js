// variants.js - variant engine which generates the list of Actions with modifiers.

import {
  modStateActiveish,
  modStateIsOn,
  modStateIsRequired,
} from "./mod-state-normalize.js";
import { groupCombos, MAX_GROUP_COMBOS } from "./variant-combinatorics.js";
import { buildConstraintMaps, violatesConstraints } from "./variant-constraints.js";
import {
  makeInteractionsIndexCacheContext,
  readInteractionsIndexCache,
  writeInteractionsIndexCache,
} from "./interactions-index-cache.js";

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

export function normalizeActionsAndInputs(model, options = {}) {
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

  return {
    actions,
    inputs,
    includeBypass,
    targetIndexField,
    isBaseIndex,
    baseVersion,
    currentBaseVersion,
    useGroups: useG,
  };
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

  let truncated = false;
  const truncatedGroups = [];
  let candidates = 0;
  let yielded = 0;

  function markTruncated(reason) {
    truncated = true;
    if (reason?.type === "group" && reason.groupId != null) {
      const existing = truncatedGroups.find((g) => g.groupId === reason.groupId);
      if (!existing) truncatedGroups.push(reason);
    }
  }

  const iterator = (function* () {
    if (!requiredIds.length && !optionalElig.length) {
      candidates++;
      yielded++;
      yield "";
      return;
    }

    if (!groups.length) {
      candidates++;
      yielded++;
      yield variantSignature(requiredIds);
      return;
    }

    const choices = [];
    const optionalEligSet = new Set(optionalElig);
    for (const g of groups) {
      const ch = groupCombos(g, {
        optionalEligible: optionalEligSet,
        required: requiredSet,
      });
      if (ch.length === 0) {
        if (g.required) return;
        continue;
      }
      if (ch.truncated) {
        markTruncated({
          type: "group",
          groupId: g.id,
          groupName: g.name,
          limit: MAX_GROUP_COMBOS,
        });
      }
      choices.push(ch);
    }
    choices.sort((a, b) => a.length - b.length);

    const maps =
      options.constraintMaps || buildConstraintMaps(model.modifierConstraints);
    const base = requiredIds.slice();
    const seen = new Set();

    function* rec(i, acc) {
      if (yielded >= CAP_PER_ACTION) {
        markTruncated();
        return;
      }
      if (i === choices.length) {
        const sig = variantSignature(acc);
        candidates++;
        if (!seen.has(sig)) {
          seen.add(sig);
          yielded++;
          yield sig;
        }
        return;
      }
      const list = choices[i];
      for (let idx = 0; idx < list.length; idx++) {
        const ch = list[idx];
        const next = acc.concat(ch);
        if (!violatesConstraints(next, maps)) {
          yield* rec(i + 1, next);
          if (yielded >= CAP_PER_ACTION) {
            markTruncated();
            return;
          }
        }
      }
    }

    let emitted = false;
    for (const sig of rec(0, base)) {
      emitted = true;
      yield sig;
      if (yielded >= CAP_PER_ACTION) {
        markTruncated();
        return;
      }
    }

    if (!emitted) {
      candidates++;
      yielded++;
      yield "";
    }
  })();

  iterator.getDiagnostics = () => ({
    candidates,
    yielded,
    truncated,
    truncatedGroups,
  });

  return iterator;
}

export function collectVariantsForAction(action, model, options = {}) {
  const iterator = computeVariantsForAction(action, model, options);
  const variants = [];
  for (const sig of iterator) variants.push(sig);
  const diagnostics = iterator.getDiagnostics ? iterator.getDiagnostics() : {};
  const uniq = Array.from(new Set(variants));
  uniq.sort((a, b) => compareVariantSig(a, b, model));
  return {
    variants: uniq.length ? uniq : [""],
    diagnostics: {
      candidates: diagnostics.candidates ?? uniq.length,
      yielded: diagnostics.yielded ?? uniq.length,
      truncated: !!diagnostics.truncated,
      truncatedGroups: diagnostics.truncatedGroups || [],
    },
  };
}

/**
 * Builds the interactions index used to power action/input pair lookups.
 *
 * `variantCatalog` maps each action id to a sorted array of variant signatures.
 * `indexGroups` contains one entry per action with the row offsets for every
 * variant, shaped as `{ actionId, variants: [{ variantSig, rowIndex, rowCount
 * }], rowIndex, totalRows }` where `rowIndex` is the starting row in the final
 * flattened pairs grid.
 */
export function buildInteractionsPairs(model, options = {}) {
  const {
    actions,
    inputs,
    includeBypass,
    targetIndexField,
    isBaseIndex,
    baseVersion,
    useGroups,
  } = normalizeActionsAndInputs(model, options);
  const indexGroups = [];
  const variantCatalog = {};
  let totalRows = 0;
  let capped = false,
    cappedActions = 0;
  const mode = (model.meta && model.meta.interactionsMode) || "AI";
  const actionVariantCache = new Map();
  const groupTruncations = [];
  const recordedGroupTruncations = new Set();
  const constraintMaps = useGroups
    ? buildConstraintMaps(model.modifierConstraints)
    : null;

  const variantDiagnostics = {
    candidates: 0,
    yielded: 0,
    accepted: 0,
  };

  function recordGroupTruncations(action, groups = []) {
    for (const group of groups) {
      const key = `${action.id}:${group.groupId ?? group.groupName ?? "?"}`;
      if (recordedGroupTruncations.has(key)) continue;
      recordedGroupTruncations.add(key);
      groupTruncations.push({
        actionId: action.id,
        actionName: action.name,
        ...group,
      });
    }
  }

  function insertVariantSorted(list, sig) {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const cmp = compareVariantSig(sig, list[mid], model);
      if (cmp === 0) return false;
      if (cmp < 0) hi = mid;
      else lo = mid + 1;
    }
    list.splice(lo, 0, sig);
    return true;
  }

  function getVariantsForAction(action, onVariant) {
    const cacheKey = `${includeBypass ? "b" : "d"}:${action.id}`;
    if (actionVariantCache.has(cacheKey)) {
      const entry = actionVariantCache.get(cacheKey);
      recordGroupTruncations(action, entry.truncatedGroups);
      if (onVariant) {
        for (const sig of entry.variants) onVariant(sig);
      }
      return entry;
    }
    if (!useGroups) {
      const entry = {
        variants: [""],
        truncated: false,
        diagnostics: { candidates: 1, yielded: 1 },
        truncatedGroups: [],
      };
      variantDiagnostics.candidates += 1;
      variantDiagnostics.yielded += 1;
      variantDiagnostics.accepted += 1;
      actionVariantCache.set(cacheKey, entry);
      if (onVariant) onVariant("");
      return entry;
    }
    const iterator = computeVariantsForAction(action, model, {
      includeMarked: includeBypass,
      constraintMaps,
    });
    const variants = [];
    for (const sig of iterator) {
      if (insertVariantSorted(variants, sig) && onVariant) onVariant(sig);
    }
    const diagnostics = iterator.getDiagnostics ? iterator.getDiagnostics() : {};
    const truncated = diagnostics.truncated || variants.length > CAP_PER_ACTION;
    const truncatedGroups = diagnostics.truncatedGroups || [];
    recordGroupTruncations(action, truncatedGroups);
    const entry = { variants, truncated, diagnostics, truncatedGroups };
    variantDiagnostics.candidates += diagnostics.candidates ?? variants.length;
    variantDiagnostics.yielded += diagnostics.yielded ?? variants.length;
    variantDiagnostics.accepted += variants.length;
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
      variantCatalog[a.id] = varsA;
      const group = { actionId: a.id, variants: [] };
      let groupFirstRow = null;
      let groupTotalRows = 0;
      for (const sigA of varsA) {
        const variantStart = totalRows;
        let rowsAdded = 0;
        for (const b of actions) {
          const { variants: varsB } = getVariantsForAction(b);
          if (!variantCatalog[b.id]) variantCatalog[b.id] = varsB;
          rowsAdded += varsB.length;
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
    variantDiagnostics.groupTruncations = groupTruncations;
    variantDiagnostics.truncatedGroupCount = groupTruncations.length;
    return {
      actionsCount: actions.length,
      inputsCount: actions.length,
      pairsCount: totalRows,
      capped,
      cappedActions,
      variantDiagnostics,
      groupTruncations,
    };
  } // Default: Actions × Inputs
  for (const a of actions) {
    const group = { actionId: a.id, variants: [] };
    let groupFirstRow = null;
    let groupTotalRows = 0;
    const { variants: vars, truncated } = getVariantsForAction(a, (sig) => {
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
    });
    if (truncated) {
      capped = true;
      cappedActions++;
    }
    variantCatalog[a.id] = vars;
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
  variantDiagnostics.groupTruncations = groupTruncations;
  variantDiagnostics.truncatedGroupCount = groupTruncations.length;
  return {
    actionsCount: actions.length,
    inputsCount: inputs.length,
    pairsCount: totalRows,
    capped,
    cappedActions,
    index: model[targetIndexField],
    variantDiagnostics,
    groupTruncations,
  };
}

export function buildScopedInteractionsPairs(model, actionIds, options = {}) {
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
  const normalization = normalizeActionsAndInputs(model, {
    ...options,
    actionIds: normalizedIds,
  });
  const cacheContext = makeInteractionsIndexCacheContext(model, normalizedIds, {
    ...options,
    includeBypass: normalization.includeBypass,
    targetIndexField: normalization.targetIndexField,
    baseVersion: normalization.currentBaseVersion,
  });
  const cached = readInteractionsIndexCache(cacheContext);
  if (cached) return cached;
  const summary = buildInteractionsPairs(model, {
    ...options,
    includeBypass: normalization.includeBypass,
    targetIndexField: normalization.targetIndexField,
    actionIds: normalizedIds,
  });
  const index = model[normalization.targetIndexField];
  return writeInteractionsIndexCache(cacheContext, index, summary);
}
