import { buildInteractionsPairs, buildScopedInteractionsPairs } from "../data/variants/variants.js";
import { noteKeyForPair } from "./interactions.js";
import { getInteractionsIndex } from "./interactions-data.js";

const BYPASS_INDEX_FIELD = "interactionsIndexBypass";
const BYPASS_SCOPED_INDEX_FIELD = "interactionsIndexBypassScoped";
const BYPASS_SCOPED_CACHE_WARNING_DEFAULTS = Object.freeze({
  entries: 8,
  rows: 150000,
});

function summarizeBypassScopedCache(cache) {
  const stats = { entries: 0, rows: 0 };
  if (!cache || typeof cache !== "object") return stats;
  for (const value of Object.values(cache)) {
    if (!value || typeof value !== "object") continue;
    stats.entries++;
    const rowCount = (() => {
      const pairs = value?.summary?.pairsCount;
      if (Number.isFinite(pairs)) return pairs;
      const indexRows = value?.index?.totalRows;
      if (Number.isFinite(indexRows)) return indexRows;
      const indexPairs = value?.index?.summary?.pairsCount;
      return Number.isFinite(indexPairs) ? indexPairs : null;
    })();
    if (Number.isFinite(rowCount)) stats.rows += rowCount;
  }
  return stats;
}

function warnOnBypassScopedCache(
  cache,
  statusBar,
  bypassCacheWarningThreshold,
  bypassCacheWarningShown,
) {
  if (bypassCacheWarningShown.value) return;
  const stats = summarizeBypassScopedCache(cache);
  const hitsEntryThreshold =
    Number.isFinite(bypassCacheWarningThreshold.entries) &&
    stats.entries >= bypassCacheWarningThreshold.entries;
  const hitsRowThreshold =
    Number.isFinite(bypassCacheWarningThreshold.rows) &&
    stats.rows >= bypassCacheWarningThreshold.rows;
  if (!hitsEntryThreshold && !hitsRowThreshold) return;
  bypassCacheWarningShown.value = true;
  const approxRows =
    stats.rows > 0 ? ` (~${stats.rows.toLocaleString()} indexed rows)` : "";
  const message =
    "Bypass scoped cache is growing; broaden inference scope or restart to reclaim memory." +
    ` (${stats.entries} scoped entries${approxRows})`;
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug(message);
  }
  statusBar?.set?.(message);
}

const rowLookupCache = new WeakMap();

function getAccessVersion(indexAccess) {
  if (!indexAccess) return null;
  if (typeof indexAccess.getVersion === "function") {
    const version = Number(indexAccess.getVersion());
    return Number.isFinite(version) ? version : null;
  }
  const version = Number(indexAccess.baseVersion ?? indexAccess.version);
  return Number.isFinite(version) ? version : null;
}

function buildRowLookup(indexAccess) {
  const version = getAccessVersion(indexAccess);
  const cached = rowLookupCache.get(indexAccess);
  if (cached && cached.version === version) return cached.lookup;

  const lookup = new Map();
  const total = indexAccess.getRowCount();
  for (let i = 0; i < total; i++) {
    const pair = indexAccess.getPair(i);
    if (!pair) continue;
    const key = noteKeyForPair(pair);
    if (!lookup.has(key)) lookup.set(key, []);
    lookup.get(key).push(i);
  }

  rowLookupCache.set(indexAccess, { version, lookup });
  return lookup;
}

function mapRowsToIndex(rows, sourceAccess, targetAccess) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const targetLookup = buildRowLookup(targetAccess);
  const mapped = new Set();
  for (const row of rows) {
    const pair = sourceAccess.getPair(row);
    if (!pair) continue;
    const key = noteKeyForPair(pair);
    const candidates = targetLookup.get(key);
    if (!Array.isArray(candidates)) continue;
    for (const candidate of candidates) mapped.add(candidate);
  }
  return Array.from(mapped).sort((a, b) => a - b);
}

function shouldUseBypassIndex(options) {
  return !!(options?.inferFromBypassed || options?.inferToBypassed);
}

export function createInferenceIndexAccess(options) {
  const {
    model,
    sel,
    getInteractionsPair,
    getInteractionsRowCount,
    statusBar,
    enableBypassCacheTelemetry = true,
    bypassCacheWarningEntries,
    bypassCacheWarningRows,
  } = options;

  const bypassCacheWarningThreshold = Object.freeze({
    entries:
      Number(bypassCacheWarningEntries) > 0
        ? Number(bypassCacheWarningEntries)
        : BYPASS_SCOPED_CACHE_WARNING_DEFAULTS.entries,
    rows:
      Number(bypassCacheWarningRows) > 0
        ? Number(bypassCacheWarningRows)
        : BYPASS_SCOPED_CACHE_WARNING_DEFAULTS.rows,
  });

  const bypassCacheWarningShown = { value: false };

  function ensureBypassIndex(actionIds) {
    const currentBaseVersion = Number(model?.interactionsIndexVersion) || 0;
    const isIndexCurrent = (idx) => {
      const baseVersion = Number(idx?.baseVersion);
      if (!Number.isFinite(currentBaseVersion) || currentBaseVersion === 0)
        return true;
      if (!Number.isFinite(baseVersion)) return false;
      return baseVersion === currentBaseVersion;
    };
    const normalizedIds = Array.isArray(actionIds)
      ? Array.from(
          new Set(
            actionIds
              .map((id) => Number(id))
              .filter((id) => Number.isFinite(id)),
          ),
        )
          .sort((a, b) => a - b)
      : [];
    const useFullIndex = normalizedIds.length === 0;
    if (useFullIndex) {
      const existing = getInteractionsIndex(model, { includeBypass: true });
      if (existing && isIndexCurrent(existing)) return existing;
      buildInteractionsPairs(model, {
        includeBypass: true,
        targetIndexField: BYPASS_INDEX_FIELD,
      });
      return getInteractionsIndex(model, { includeBypass: true });
    }
    const cacheField = `${BYPASS_SCOPED_INDEX_FIELD}Cache`;
    const cacheKey = normalizedIds.join(",");
    const cache = (() => {
      const existing = model[cacheField];
      if (existing && typeof existing === "object") return existing;
      const created = {};
      model[cacheField] = created;
      return created;
    })();
    const cached = cache[cacheKey];
    if (cached && isIndexCurrent(cached.index || cached)) {
      return cached.index || cached;
    }
    const { index } = buildScopedInteractionsPairs(model, normalizedIds, {
      includeBypass: true,
      targetIndexField: BYPASS_SCOPED_INDEX_FIELD,
      cacheField,
    });
    const nextCached = cache[cacheKey];
    if (enableBypassCacheTelemetry && nextCached && nextCached !== cached)
      warnOnBypassScopedCache(
        cache,
        statusBar,
        bypassCacheWarningThreshold,
        bypassCacheWarningShown,
      );
    if (nextCached && nextCached.index && isIndexCurrent(nextCached.index))
      return nextCached.index;
    return index || ensureBypassIndex();
  }

  function getBaseIndexAccess() {
    const getPair = (rowIndex) => getInteractionsPair?.(model, rowIndex);
    const getRowCount = () => getInteractionsRowCount?.(model) || 0;
    const getVersion = () => Number(model?.interactionsIndexVersion) || 0;
    return { getPair, getRowCount, getVersion, includeBypass: false };
  }

  function getScopedActionIds(scope, baseRows, baseAccess, resolveRows) {
    if (scope === "project") return null;
    const effectiveBaseAccess = baseAccess || getBaseIndexAccess();
    const rows = baseRows || resolveRows(scope, effectiveBaseAccess);
    const ids = new Set();
    for (const row of rows) {
      const pair = effectiveBaseAccess.getPair(row);
      if (pair && Number.isFinite(pair.aId)) ids.add(pair.aId);
    }
    return ids.size ? Array.from(ids) : null;
  }

  function collectActionIdsWithNotes() {
    const ids = new Set();
    const entries = Object.entries(model?.notes || {});
    for (const [key, note] of entries) {
      if (!note || typeof key !== "string") continue;
      if (key.startsWith("ai|")) {
        const parts = key.split("|");
        const aId = Number(parts[1]);
        if (Number.isFinite(aId)) ids.add(aId);
        continue;
      }
      if (key.startsWith("aa|")) {
        const parts = key.split("|");
        const aId = Number(parts[1]);
        const rhsId = Number(parts[2]);
        if (Number.isFinite(aId)) ids.add(aId);
        if (Number.isFinite(rhsId)) ids.add(rhsId);
      }
    }
    return ids;
  }

  function resolveIndexAccess(options, resolveRows) {
    const includeBypass = shouldUseBypassIndex(options);
    const baseAccess = getBaseIndexAccess();
    const baseRows = resolveRows(options.scope, baseAccess);
    if (!includeBypass) {
      return { indexAccess: baseAccess, rows: baseRows };
    }
    const scopedIds = getScopedActionIds(
      options.scope,
      baseRows,
      baseAccess,
      resolveRows,
    );
    const actionIds = (() => {
      const combined = new Set();
      if (Array.isArray(scopedIds)) {
        for (const id of scopedIds) combined.add(id);
      }
      if (options.inferFromBypassed) {
        const notedIds = collectActionIdsWithNotes();
        for (const id of notedIds) combined.add(id);
      }
      return combined.size ? Array.from(combined) : null;
    })();
    const useFullBypassIndex = options.inferToBypassed || options.inferFromBypassed;
    const index = ensureBypassIndex(useFullBypassIndex ? null : actionIds);
    const indexAccess = {
      includeBypass,
      getPair: (rowIndex) =>
        getInteractionsPair?.(model, rowIndex, {
          includeBypass: true,
          index,
        }),
      getRowCount: () =>
        getInteractionsRowCount?.(model, { includeBypass: true, index }) || 0,
      getVersion: () =>
        Number(index?.baseVersion ?? model?.interactionsIndexVersion) || 0,
    };
    const mappedSelRow = mapRowsToIndex([sel.r], baseAccess, indexAccess)[0];
    if (mappedSelRow != null) indexAccess.activeRow = mappedSelRow;
    const preferBypassRows = (candidateRows) => {
      if (!Array.isArray(candidateRows) || !candidateRows.length) return [];
      const fallback = [];
      const preferred = new Map();
      for (const row of candidateRows) {
        const pair = indexAccess.getPair(row);
        if (!pair) {
          fallback.push(row);
          continue;
        }
        const key = `${pair.aId}|${pair.iId}`;
        const isBypassVariant = !!pair.variantSig;
        const existing = preferred.get(key);
        if (!existing || (isBypassVariant && !existing.isBypass)) {
          preferred.set(key, { row, isBypass: isBypassVariant });
        }
      }
      const merged = [...fallback, ...Array.from(preferred.values(), (v) => v.row)];
      return Array.from(new Set(merged)).sort((a, b) => a - b);
    };
    const rows = (() => {
      if (options.scope === "project") {
        return Array.from({ length: indexAccess.getRowCount() }, (_, i) => i);
      }
      const mapped = mapRowsToIndex(baseRows, baseAccess, indexAccess);
      if (!options.inferToBypassed) return mapped;
      const merged = new Set(mapped);
      const totalRows = indexAccess.getRowCount();
      if (
        options.inferToBypassed &&
        Array.isArray(actionIds) &&
        actionIds.length
      ) {
        const scoped = new Set(actionIds);
        const preferredByAction = new Map();
        for (let i = 0; i < totalRows; i++) {
          const pair = indexAccess.getPair(i);
          if (!pair || !scoped.has(pair.aId)) continue;
          const key = `${pair.aId}|${pair.iId}`;
          const isBypassVariant = !!pair.variantSig;
          const existing = preferredByAction.get(key);
          if (!existing || (isBypassVariant && !existing.isBypass)) {
            preferredByAction.set(key, { row: i, isBypass: isBypassVariant });
          }
        }
        for (const { row } of preferredByAction.values()) merged.add(row);
      } else if (options.scope === "selection" || options.scope === "action") {
        for (let i = 0; i < totalRows; i++) merged.add(i);
      }
      const mergedRows = Array.from(merged).sort((a, b) => a - b);
      return options.inferToBypassed ? preferBypassRows(mergedRows) : mergedRows;
    })();
    return { indexAccess, rows };
  }

  return { resolveIndexAccess, shouldUseBypassIndex, getBaseIndexAccess };
}

export { mapRowsToIndex };
