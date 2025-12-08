// variant-combinatorics.js - helpers for generating modifier group combinations

export const GROUP_MODES = {
  EXACT: "EXACT",
  AT_LEAST: "AT_LEAST",
  AT_MOST: "AT_MOST",
  RANGE: "RANGE",
};

export const MAX_GROUP_COMBOS = 50000; // safety cap for a single group's choice list

export function kCombos(a, k) {
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

export function rangeCombos(a, min, max) {
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

export function groupCombos(group, eligibility = {}) {
  const members = Array.isArray(group?.memberIds) ? group.memberIds : [];
  const optionalEligible = eligibility.optionalEligible || new Set();
  const requiredSet = eligibility.required || new Set();

  const requiredMembers = members.filter((id) => requiredSet.has(id));
  const optionalMembers = members.filter((id) => optionalEligible.has(id));
  const requiredCount = requiredMembers.length;
  const optionalCount = optionalMembers.length;
  const mode = group?.mode || GROUP_MODES.EXACT,
    req = !!group?.required;
  let ch = [];
  if (mode === GROUP_MODES.EXACT) {
    const total = group?.k ?? 0;
    if (requiredCount > total) return [];
    const pick = total - requiredCount;
    if (pick > optionalCount) return [];
    ch = kCombos(optionalMembers, pick);
  } else if (mode === GROUP_MODES.AT_LEAST) {
    const minTotal = group?.k ?? 0;
    const minPick = Math.max(0, minTotal - requiredCount);
    if (minPick > optionalCount) return [];
    ch = rangeCombos(optionalMembers, minPick, optionalCount);
  } else if (mode === GROUP_MODES.AT_MOST) {
    const maxTotal = group?.k ?? 0;
    if (requiredCount > maxTotal) return [];
    const maxPick = Math.max(0, Math.min(optionalCount, maxTotal - requiredCount));
    ch = rangeCombos(optionalMembers, 0, maxPick);
  } else if (mode === GROUP_MODES.RANGE) {
    const minTotal = group?.kMin ?? 0;
    const maxTotal = group?.kMax ?? members.length;
    if (requiredCount > maxTotal) return [];
    const minPick = Math.max(0, minTotal - requiredCount);
    const maxPick = Math.max(minPick, Math.min(optionalCount, maxTotal - requiredCount));
    if (minPick > optionalCount) return [];
    ch = rangeCombos(optionalMembers, minPick, maxPick);
  }

  if (!req && !ch.some((a) => a.length === 0)) ch.unshift([]);
  if (req && ch.length === 0) return [];
  return ch;
}
