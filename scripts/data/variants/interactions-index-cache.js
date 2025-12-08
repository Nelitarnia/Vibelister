function cacheKeyForIds(normalizedIds, includeBypass) {
  return `${includeBypass ? "b" : "d"}:${
    normalizedIds.length ? normalizedIds.join(",") : "all"
  }`;
}

function ensureCacheStore(model, cacheField) {
  const existing = model[cacheField];
  if (existing && typeof existing === "object") return existing;
  const created = {};
  model[cacheField] = created;
  return created;
}

export function makeInteractionsIndexCacheContext(
  model,
  normalizedIds,
  options = {},
) {
  const includeBypass = !!options.includeBypass;
  const targetIndexField = options.targetIndexField || "interactionsIndex";
  const cacheField = options.cacheField || `${targetIndexField}Cache`;
  const baseVersion =
    (options.baseVersion ?? Number(model?.interactionsIndexVersion)) || 0;
  const cacheKey = cacheKeyForIds(normalizedIds, includeBypass);
  const cache = ensureCacheStore(model, cacheField);
  const cached = cache[cacheKey];

  return {
    includeBypass,
    targetIndexField,
    cacheField,
    cacheKey,
    cache,
    cached,
    baseVersion,
  };
}

export function readInteractionsIndexCache(context) {
  if (context.cached && context.cached.baseVersion === context.baseVersion) {
    return { index: context.cached.index, summary: context.cached.summary };
  }
  return null;
}

export function writeInteractionsIndexCache(context, index, summary) {
  if (index)
    context.cache[context.cacheKey] = {
      index,
      summary,
      baseVersion: index.baseVersion ?? context.baseVersion,
    };
  return { index, summary };
}
