// interactions-data.js — shared helpers for lazy Interactions rows

export function getInteractionsIndex(model, options = {}) {
  if (options?.index) return options.index;
  if (!model) return null;
  const indexKey = options?.includeBypass
    ? "interactionsIndexBypass"
    : "interactionsIndex";
  const index = model[indexKey];
  if (!index || !Array.isArray(index.groups)) return null;
  const expectedBaseVersion = Number(model?.interactionsIndexVersion);
  const indexBaseVersion = Number(index?.baseVersion);
  if (
    Number.isFinite(expectedBaseVersion) &&
    Number.isFinite(indexBaseVersion) &&
    indexBaseVersion !== expectedBaseVersion
  ) {
    return null;
  }
  return index;
}

export function getInteractionsRowCount(model, options = {}) {
  const index = getInteractionsIndex(model, options);
  if (!index) return 0;
  const total = Number(index.totalRows);
  if (Number.isFinite(total) && total >= 0) return total;
  return 0;
}

const variantCache = new WeakMap();

function normalizeBaseVersion(index) {
  const base = Number(index?.baseVersion);
  return Number.isFinite(base) ? base : null;
}

function getVariantRanges(index) {
  if (!index || !Array.isArray(index.groups)) return null;
  const baseVersion = normalizeBaseVersion(index);
  const cached = variantCache.get(index);
  if (cached && cached.baseVersion === baseVersion) return cached;

  const ranges = [];
  for (const group of index.groups) {
    if (!group || !Array.isArray(group.variants)) continue;
    for (const variant of group.variants) {
      const start = Number(variant?.rowIndex);
      const count = Number(variant?.rowCount);
      if (!Number.isFinite(start) || !Number.isFinite(count) || count <= 0)
        continue;
      ranges.push({ start, end: start + count, group, variant });
    }
  }
  ranges.sort((a, b) => a.start - b.start);

  const cacheEntry = { baseVersion, ranges };
  variantCache.set(index, cacheEntry);
  return cacheEntry;
}

function findVariantEntry(index, rowIndex) {
  const cacheEntry = getVariantRanges(index);
  if (!cacheEntry) return null;

  const { ranges } = cacheEntry;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = ranges[mid];
    if (rowIndex < range.start) {
      hi = mid - 1;
      continue;
    }
    if (rowIndex >= range.end) {
      lo = mid + 1;
      continue;
    }
    return { group: range.group, variant: range.variant, offset: rowIndex - range.start };
  }
  return null;
}

export function getInteractionsPair(model, rowIndex, options = {}) {
  if (!Number.isFinite(rowIndex) || rowIndex < 0) return null;
  const index = getInteractionsIndex(model, options);
  if (!index) return null;
  const info = findVariantEntry(index, rowIndex);
  if (!info) return null;
  const { group, variant, offset } = info;
  const kind = String(index.mode || "AI").toUpperCase();
  if (kind === "AI") {
    const inputsOrder = Array.isArray(index.inputsOrder) ? index.inputsOrder : [];
    const inputId = inputsOrder[offset];
    if (inputId == null) return null;
    return {
      kind: "AI",
      aId: group.actionId,
      iId: inputId,
      variantSig: String(variant.variantSig || ""),
    };
  }
  if (kind === "AA") {
    const actionsOrder = Array.isArray(index.actionsOrder)
      ? index.actionsOrder
      : [];
    const catalog = index.variantCatalog || {};
    let remaining = offset;
    for (const rhsId of actionsOrder) {
      const variants = Array.isArray(catalog[rhsId]) ? catalog[rhsId] : [];
      if (remaining < variants.length) {
        return {
          kind: "AA",
          aId: group.actionId,
          rhsActionId: rhsId,
          variantSig: String(variant.variantSig || ""),
          rhsVariantSig: String(variants[remaining] || ""),
        };
      }
      remaining -= variants.length;
    }
    return null;
  }
  return null;
}
