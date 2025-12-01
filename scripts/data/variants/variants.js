// variants.js - variant engine which generates the list of Actions with modifiers.

import {
  MOD_STATE_ACTIVE_VALUES,
  MOD_STATE_MARKED_VALUES,
  MOD_STATE_REQUIRED_VALUES,
  MOD_STATE_MAX_VALUE,
  MOD_STATE_MIN_VALUE,
} from "../mod-state.js";

const ACTIVE_STATE_SET = new Set(MOD_STATE_ACTIVE_VALUES);
const MARKED_STATE_SET = new Set(MOD_STATE_MARKED_VALUES);
const REQUIRED_STATE_SET = new Set(MOD_STATE_REQUIRED_VALUES);

function normalizeModStateValue(v) {
  const num = Number(v);
  if (!Number.isFinite(num)) return null;
  const truncated = Math.trunc(num);
  if (truncated < MOD_STATE_MIN_VALUE || truncated > MOD_STATE_MAX_VALUE) return null;
  return truncated;
}

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

// Treat raw modSet values using descriptor metadata
function modStateIsOn(v) {
  const value = normalizeModStateValue(v);
  return value != null && ACTIVE_STATE_SET.has(value);
} // only explicitly active states participate in generation
function modStateActiveish(v) {
  const value = normalizeModStateValue(v);
  return value != null && MARKED_STATE_SET.has(value);
} // active or marked states count as "selected"
function modStateIsRequired(v) {
  const value = normalizeModStateValue(v);
  return value != null && REQUIRED_STATE_SET.has(value);
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
export const GROUP_MODES = {
  EXACT: "EXACT",
  AT_LEAST: "AT_LEAST",
  AT_MOST: "AT_MOST",
  RANGE: "RANGE",
};

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
const MAX_GROUP_COMBOS = 50000; // safety cap for a *single group's* choice list

function kCombos(a, k) {
  const out = [],
    n = a.length;
  if (k < 0 || k > n) return out;
  if (k === 0) {
    out.push([]);
    return out;
  }
  const idx = Array.from({ length: k }, (_, i) => i);
  out.push(idx.map((i) => a[i]));
  while (true) {
    let p = k - 1;
    while (p >= 0 && idx[p] === p + n - k) p--;
    if (p < 0) break;
    idx[p]++;
    for (let i = p + 1; i < k; i++) idx[i] = idx[i - 1] + 1;
    out.push(idx.map((i) => a[i]));
  }
  return out;
}

function rangeCombos(a, min, max) {
  const out = [];
  const hi = Math.min(a.length, max);
  const lo = Math.max(0, min);
  for (let k = lo; k <= hi; k++) {
    const ks = kCombos(a, k);
    for (let i = 0; i < ks.length; i++) {
      out.push(ks[i]);
      if (out.length >= MAX_GROUP_COMBOS) return out; // early cut to avoid huge lists
    }
  }
  return out;
}

function groupCombos(g, optionalElig, optionalEligSet, requiredSet) {
  const members = Array.isArray(g.memberIds) ? g.memberIds : [];
  const requiredMembers = members.filter((id) => requiredSet.has(id));
  const optionalMembers = members.filter((id) => optionalEligSet.has(id));
  const requiredCount = requiredMembers.length;
  const optionalCount = optionalMembers.length;
  const mode = g.mode || GROUP_MODES.EXACT,
    req = !!g.required;
  let ch = [];
  if (mode === GROUP_MODES.EXACT) {
    const total = g.k ?? 0;
    if (requiredCount > total) return [];
    const pick = total - requiredCount;
    if (pick > optionalCount) return [];
    ch = kCombos(optionalMembers, pick);
  } else if (mode === GROUP_MODES.AT_LEAST) {
    const minTotal = g.k ?? 0;
    const minPick = Math.max(0, minTotal - requiredCount);
    if (minPick > optionalCount) return [];
    ch = rangeCombos(optionalMembers, minPick, optionalCount);
  } else if (mode === GROUP_MODES.AT_MOST) {
    const maxTotal = g.k ?? 0;
    if (requiredCount > maxTotal) return [];
    const maxPick = Math.max(0, Math.min(optionalCount, maxTotal - requiredCount));
    ch = rangeCombos(optionalMembers, 0, maxPick);
  } else if (mode === GROUP_MODES.RANGE) {
    const minTotal = g.kMin ?? 0;
    const maxTotal = g.kMax ?? members.length;
    if (requiredCount > maxTotal) return [];
    const minPick = Math.max(0, minTotal - requiredCount);
    const maxPick = Math.max(
      minPick,
      Math.min(optionalCount, maxTotal - requiredCount),
    );
    if (minPick > optionalCount) return [];
    ch = rangeCombos(optionalMembers, minPick, maxPick);
  }

  // optional-empty for non-required groups
  if (!req && !ch.some((a) => a.length === 0)) ch.unshift([]);
  if (req && ch.length === 0) return [];
  return ch;
}

function buildConstraintMaps(cs) {
  const req = new Map(),
    forb = new Map(),
    mut = new Set();
  for (const c of cs || []) {
    if (c.type === "REQUIRES") {
      if (!req.has(c.a)) req.set(c.a, new Set());
      req.get(c.a).add(c.b);
    } else if (c.type === "FORBIDS") {
      if (!forb.has(c.a)) forb.set(c.a, new Set());
      forb.get(c.a).add(c.b);
    } else if (c.type === "MUTEX" && Array.isArray(c.ids)) {
      for (let i = 0; i < c.ids.length; i++)
        for (let j = i + 1; j < c.ids.length; j++) {
          const a = c.ids[i],
            b = c.ids[j],
            k = a < b ? `${a}|${b}` : `${b}|${a}`;
          mut.add(k);
        }
    }
  }
  return { req, forb, mut };
}
function violatesConstraints(setArr, maps) {
  const s = new Set(setArr),
    a = [...s];
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++) {
      const x = a[i],
        y = a[j],
        k = x < y ? `${x}|${y}` : `${y}|${x}`;
      if (maps.mut.has(k)) return true;
    }
  for (const x of s) {
    const fb = maps.forb.get(x);
    if (fb) for (const y of fb) if (s.has(y)) return true;
    const rq = maps.req.get(x);
    if (rq) for (const y of rq) if (!s.has(y)) return true;
  }
  return false;
}

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
    const ch = groupCombos(g, optionalElig, optionalEligSet, requiredSet);
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
  const actions = (model.actions || []).filter(
    (a) => a && (a.name || "").trim().length,
  );
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
      groups: indexGroups,
      totalRows,
      actionsOrder: actions.map((a) => a.id),
      inputsOrder: [],
      variantCatalog,
    };
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
    groups: indexGroups,
    totalRows,
    actionsOrder: actions.map((a) => a.id),
    inputsOrder: inputs.map((i) => i.id),
    variantCatalog,
  };
  return {
    actionsCount: actions.length,
    inputsCount: inputs.length,
    pairsCount: totalRows,
    capped,
    cappedActions,
  };
}
