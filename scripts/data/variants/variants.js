// variants.js - variant engine which generates the list of Actions with modifiers.

import {
  modStateActiveish,
  modStateIsOn,
  modStateIsRequired,
} from "./mod-state-normalize.js";
import { groupCombos } from "./variant-combinatorics.js";
import { buildConstraintMaps, violatesConstraints } from "./variant-constraints.js";
import {
  makeInteractionsIndexCacheContext,
  readInteractionsIndexCache,
  writeInteractionsIndexCache,
} from "./interactions-index-cache.js";
import { normalizeActionProperties } from "../properties.js";
import { normalizeVariantCaps, DEFAULT_VARIANT_CAPS } from "./variant-settings.js";

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

function collectPropertiesCatalog(actions) {
  const catalog = [];
  const seen = new Set();
  for (const action of actions || []) {
    const properties = normalizeActionProperties(action?.properties);
    for (const prop of properties) {
      const key = prop.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push(prop);
    }
  }
  return catalog;
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

function computeVariantsForAction(action, model, options = {}) {
  const caps = normalizeVariantCaps(
    options.variantCaps || model?.meta?.variantCaps,
    DEFAULT_VARIANT_CAPS,
  );
  const capPerAction = caps.variantCapPerAction;
  const includeMarked = !!options.includeMarked;
  const diagnosticsCollector = options.diagnosticsCollector;
  const set = action.modSet || {};
  const requiredIds = [];
  const requiredSet = new Set();
  const optionalElig = [];
  let optionalOnCount = 0;
  let bypassedCount = 0;
  for (const [key, value] of Object.entries(set)) {
    const id = Number(key);
    if (!Number.isFinite(id)) continue;
    const isRequired = modStateIsRequired(value);
    const isOn = modStateIsOn(value);
    const isMarked = modStateActiveish(value);
    const isActive =
      isRequired || (includeMarked ? isMarked : isOn);
    if (isRequired) {
      requiredIds.push(id);
      requiredSet.add(id);
    }
    if (isActive && !isRequired) optionalElig.push(id);
    if (!isRequired && isOn) optionalOnCount++;
    if (!isRequired && isMarked && !isOn) bypassedCount++;
  }

  diagnosticsCollector?.setModifierCounts?.({
    required: requiredIds.length,
    optional: optionalOnCount,
    bypassed: bypassedCount,
  });

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
  let invalid = false;
  const truncatedGroups = [];
  let candidates = 0;
  let yielded = 0;

  function markTruncated(reason) {
    truncated = true;
    if (reason?.invalid) invalid = true;
    diagnosticsCollector?.recordTruncation?.(reason);
    if (reason?.groupId != null || reason?.groupName) {
      const existing = truncatedGroups.find(
        (g) =>
          (reason.groupId != null && g.groupId === reason.groupId) ||
          (reason.groupName && g.groupName === reason.groupName),
      );
      if (!existing) truncatedGroups.push(reason);
    }
  }

  const iterator = (function* () {
    if (!groups.length) {
      if (!requiredIds.length && !optionalElig.length) {
        candidates++;
        yielded++;
        yield "";
        return;
      }
      candidates++;
      yielded++;
      yield variantSignature(requiredIds);
      return;
    }

    const choices = [];
    const optionalEligSet = new Set(optionalElig);
    for (const g of groups) {
      const ch = groupCombos(
        g,
        {
          optionalEligible: optionalEligSet,
          required: requiredSet,
        },
        caps,
      );
      diagnosticsCollector?.recordGroupCombos?.({
        group: g,
        combos: ch,
        comboCount: ch.length,
        truncated: !!ch.truncated,
        limit: ch.truncationLimit ?? caps.variantCapPerGroup,
        requiredCount: ch.requiredCount,
        optionalCount: ch.optionalCount,
      });
      if (ch.length === 0) {
        if (g.required) {
          markTruncated({
            type: "group-missing",
            groupId: g.id,
            groupName: g.name,
            invalid: true,
          });
          return;
        }
        continue;
      }
      if (ch.truncated) {
        markTruncated({
          type: "group",
          groupId: g.id,
          groupName: g.name,
          limit: ch.truncationLimit || caps.variantCapPerGroup,
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
      if (yielded >= capPerAction) {
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
          if (yielded >= capPerAction) {
            markTruncated({ type: "action-cap", limit: capPerAction });
            return;
          }
        } else {
          diagnosticsCollector?.recordConstraintPrune?.();
        }
      }
    }

    let emitted = false;
    for (const sig of rec(0, base)) {
      emitted = true;
      yield sig;
      if (yielded >= capPerAction) {
        markTruncated({ type: "action-cap", limit: capPerAction });
        return;
      }
    }

    if (!emitted && !invalid) {
      candidates++;
      yielded++;
      yield "";
    }
  })();

  iterator.getDiagnostics = () => ({
    candidates,
    yielded,
    truncated,
    invalid,
    truncatedGroups,
  });

  return iterator;
}

function createVariantDiagnosticsCollector(action, caps) {
  const groupCombos = [];
  let modifierCounts = { required: 0, optional: 0, bypassed: 0 };
  let constraintPruned = 0;
  const actionId = action?.id;
  return {
    setModifierCounts(counts = {}) {
      modifierCounts = {
        required: Number(counts.required) || 0,
        optional: Number(counts.optional) || 0,
        bypassed: Number(counts.bypassed) || 0,
      };
    },
    recordGroupCombos(info = {}) {
      const { group, comboCount, truncated, limit, requiredCount, optionalCount } = info;
      groupCombos.push({
        groupId: group?.id,
        groupName: group?.name,
        mode: group?.mode,
        required: !!group?.required,
        comboCount: Number(comboCount) || 0,
        truncated: !!truncated,
        limit: limit ?? caps.variantCapPerGroup,
        requiredCount: Number(requiredCount) || 0,
        optionalCount: Number(optionalCount) || 0,
      });
    },
    recordConstraintPrune() {
      constraintPruned++;
    },
    summarize(baseDiagnostics = {}, variants = []) {
      const capped = !!baseDiagnostics.truncated;
      const yielded = baseDiagnostics.yielded ?? variants.length;
      const candidates = baseDiagnostics.candidates ?? variants.length;
      return {
        actionId,
        modifierCounts,
        groupCombos,
        constraintPruned,
        candidates,
        yielded,
        variants,
        truncated: capped,
        invalid: !!baseDiagnostics.invalid,
        truncatedGroups: baseDiagnostics.truncatedGroups || [],
        capsHit: capped || yielded >= caps.variantCapPerAction,
        caps: caps || DEFAULT_VARIANT_CAPS,
      };
    },
  };
}

export function collectVariantsForAction(action, model, options = {}) {
  const { normalizeSignatures = false } = options;
  const iterator = computeVariantsForAction(action, model, options);
  const variants = new Set();
  for (const sig of iterator) {
    if (!variants.has(sig)) variants.add(sig);
  }
  const diagnostics = iterator.getDiagnostics ? iterator.getDiagnostics() : {};
  let uniq = Array.from(variants.values());
  if (normalizeSignatures) {
    const normalized = new Map();
    for (const sig of uniq) {
      const canon = canonicalSig(sig);
      if (!normalized.has(canon)) normalized.set(canon, sig);
    }
    uniq = Array.from(normalized.values());
  }
  uniq.sort((a, b) => compareVariantSig(a, b, model));
  const invalid = !!diagnostics.invalid;
  return {
    variants: uniq.length ? uniq : invalid ? [] : [""],
    diagnostics: {
      candidates: diagnostics.candidates ?? uniq.length,
      yielded: diagnostics.yielded ?? uniq.length,
      truncated: !!diagnostics.truncated,
      invalid,
      truncatedGroups: diagnostics.truncatedGroups || [],
    },
  };
}

export function diagnoseVariantsForAction(action, model, options = {}) {
  const caps = normalizeVariantCaps(
    options.variantCaps || model?.meta?.variantCaps,
    DEFAULT_VARIANT_CAPS,
  );
  const collector = createVariantDiagnosticsCollector(action, caps);
  const iterator = computeVariantsForAction(action, model, {
    ...options,
    variantCaps: caps,
    diagnosticsCollector: collector,
  });
  const variants = [];
  for (const sig of iterator) variants.push(sig);
  variants.sort((a, b) => compareVariantSig(a, b, model));
  const baseDiagnostics = iterator.getDiagnostics ? iterator.getDiagnostics() : {};
  return collector.summarize(baseDiagnostics, variants);
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
  const propertiesCatalog = collectPropertiesCatalog(actions);
  const variantCaps = normalizeVariantCaps(model?.meta?.variantCaps, DEFAULT_VARIANT_CAPS);

  const variantDiagnostics = {
    candidates: 0,
    yielded: 0,
    accepted: 0,
    invalidActions: 0,
    variantCaps,
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
        invalid: false,
        diagnostics: { candidates: 1, yielded: 1, invalid: false },
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
      variantCaps,
    });
    const variants = new Set();
    for (const sig of iterator) {
      if (variants.has(sig)) continue;
      variants.add(sig);
      if (onVariant) onVariant(sig);
    }
    const ordered = Array.from(variants.values());
    ordered.sort((a, b) => compareVariantSig(a, b, model));
    const diagnostics = iterator.getDiagnostics ? iterator.getDiagnostics() : {};
    const truncated = diagnostics.truncated || ordered.length > variantCaps.variantCapPerAction;
    const invalid = !!diagnostics.invalid;
    const truncatedGroups = diagnostics.truncatedGroups || [];
    recordGroupTruncations(action, truncatedGroups);
    const entry = {
      variants: ordered,
      truncated,
      invalid,
      diagnostics,
      truncatedGroups,
    };
    variantDiagnostics.candidates += diagnostics.candidates ?? ordered.length;
    variantDiagnostics.yielded += diagnostics.yielded ?? ordered.length;
    variantDiagnostics.accepted += ordered.length;
    if (invalid) variantDiagnostics.invalidActions += 1;
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
      propertiesCatalog,
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
      variantCaps,
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
    propertiesCatalog,
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
    variantCaps,
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
