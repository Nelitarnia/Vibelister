import {
  DEFAULT_INTERACTION_SOURCE,
  describeInteractionInference,
  normalizeInteractionSource,
} from "./interactions.js";
import {
  cloneValue,
  extractNoteFieldValue,
  normalizeActionId,
  normalizeInputKey,
  normalizePhaseKey,
  normalizeVariantSig,
  parseModifierIds,
  valueKey,
} from "./inference-utils.js";
import { DEFAULT_INFERENCE_STRATEGIES } from "./inference-strategies/index.js";
import { normalizePropertyKeys } from "../data/properties.js";

function normalizeActionGroup(group) {
  if (group == null) return "";
  const text = String(group).trim();
  return text ? text.toLowerCase() : "";
}

function extractFieldValue(target) {
  return extractNoteFieldValue(target?.note, target?.field);
}

function prepareTargets(targets) {
  return targets.map((target) => {
    const actionId = normalizeActionId(target.pair);
    const variantSig = normalizeVariantSig(target.pair);
    const inputKey = normalizeInputKey(target.pair);
    const actionGroupKey = normalizeActionGroup(target.actionGroup);
  const info = describeInteractionInference(target.note);
  const source = normalizeInteractionSource(info?.source);
  const isInferred = !!info?.inferred;
  const allowInferredExisting = !!target?.allowInferredExisting;
  const allowInferredTargets = !!target?.allowInferredTargets;
  const properties = normalizePropertyKeys(target.action?.properties);
  const includeValue = !isInferred || allowInferredExisting;
  const currentValue = includeValue ? extractFieldValue(target) : null;
  const hasValue = includeValue && !!currentValue;
  const isManual = hasValue && source === DEFAULT_INTERACTION_SOURCE;
  return {
      ...target,
      actionId,
      variantSig,
      inputKey,
      actionGroupKey,
    currentValue,
    hasValue,
    isManual,
    isInferred,
    allowInferredTargets,
    properties,
    source,
  };
});
}

function eligibleForSuggestion(target) {
  if (!target) return false;
  if (target.isInferred && !target.allowInferredTargets) return false;
  if (!target.hasValue) return true;
  if (target.isManual) return false;
  return target.isInferred && target.allowInferredTargets;
}

function registerSuggestion(
  map,
  target,
  source,
  confidence,
  value,
  profilePrefs,
  extraMetadata = null,
) {
  if (profilePrefs?.shouldSkip(target, value)) return;
  if (!map.has(target.key)) map.set(target.key, {});

  const candidate = {
    source,
    confidence,
    value,
    sourceMetadata:
      extraMetadata && typeof extraMetadata === "object"
        ? extraMetadata
        : undefined,
  };

  const existing = map.get(target.key)[target.field];
  if (existing && !shouldReplaceSuggestion(existing, candidate)) return;

  map.get(target.key)[target.field] = candidate;
}

function applyConsensus(groups, suggestions, source, profilePrefs, thresholds) {
  const minGroupSize = Number.isFinite(thresholds?.minGroupSize)
    ? thresholds.minGroupSize
    : thresholds?.consensusMinGroupSize;
  const minExistingRatio = Number.isFinite(thresholds?.minExistingRatio)
    ? thresholds.minExistingRatio
    : thresholds?.consensusMinExistingRatio;
  for (const list of groups.values()) {
    const total = list.length;
    if (!Number.isFinite(minGroupSize) || total < minGroupSize) continue;

    const existing = list.filter((t) => t.currentValue);
    if (!existing.length) continue;
    if (
      !Number.isFinite(minExistingRatio) ||
      existing.length / total < minExistingRatio
    )
      continue;
    const uniqueValues = new Map();
    for (const t of existing) {
      const key = valueKey(t.field, t.currentValue);
      if (!key) continue;
      if (!uniqueValues.has(key)) uniqueValues.set(key, t.currentValue);
    }
    if (uniqueValues.size !== 1) continue;
    const value = Array.from(uniqueValues.values())[0];
    const agreementRatio = total > 0 ? existing.length / total : null;
    const confidence = computeSuggestionConfidence(source, { agreementRatio });
    for (const target of list) {
      if (!eligibleForSuggestion(target)) continue;
      registerSuggestion(
        suggestions,
        target,
        source,
        confidence,
        cloneValue(target.field, value),
        profilePrefs,
      );
    }
  }
}

const DEFAULT_PHASE_ADJACENCY_MAX_GAP = 4;
const DEFAULT_PHASE_ADJACENCY_ENABLED = true;

function applyPhaseAdjacency(
  groups,
  suggestions,
  profilePrefs,
  {
    maxGapDistance = DEFAULT_PHASE_ADJACENCY_MAX_GAP,
    enabled = DEFAULT_PHASE_ADJACENCY_ENABLED,
  } = {},
) {
  if (enabled === false) return;
  const allowedGapDistance = Number.isFinite(maxGapDistance)
    ? maxGapDistance
    : DEFAULT_PHASE_ADJACENCY_MAX_GAP;
  if (allowedGapDistance < 2) return;

  for (const list of groups.values()) {
    const ordered = list
      .filter((t) => Number.isFinite(t.phase))
      .sort((a, b) => a.phase - b.phase);
    let lastAnchor = null;
    for (const target of ordered) {
      if (!target.currentValue) continue;
      const key = valueKey(target.field, target.currentValue);
      if (!key) {
        lastAnchor = null;
        continue;
      }
      const gapDistance = lastAnchor ? target.phase - lastAnchor.phase : null;
      if (
        lastAnchor &&
        gapDistance > 1 &&
        gapDistance <= allowedGapDistance &&
        key === lastAnchor.valueKey &&
        target.source === lastAnchor.source
      ) {
        const interiorTargets = ordered.filter(
          (gapTarget) =>
            gapTarget.phase > lastAnchor.phase && gapTarget.phase < target.phase,
        );
        const hasConflicts = interiorTargets.some((gapTarget) => {
          if (!gapTarget?.currentValue) return false;
          const interiorKey = valueKey(gapTarget.field, gapTarget.currentValue);
          const matchesValue = interiorKey && interiorKey === key;
          const matchesSource = gapTarget.source === lastAnchor.source;
          return !matchesValue || !matchesSource;
        });
        if (hasConflicts) {
          lastAnchor = { valueKey: key, source: target.source, phase: target.phase };
          continue;
        }

        const adjacency = 1 / gapDistance;
        const confidence = computeSuggestionConfidence(
          HEURISTIC_SOURCES.phaseAdjacency,
          { adjacency },
        );
        for (const gapTarget of interiorTargets) {
          if (!eligibleForSuggestion(gapTarget)) continue;
          registerSuggestion(
            suggestions,
            gapTarget,
            HEURISTIC_SOURCES.phaseAdjacency,
            confidence,
            cloneValue(gapTarget.field, target.currentValue),
            profilePrefs,
            { sources: [HEURISTIC_SOURCES.phaseAdjacency] },
          );
        }
      }
      lastAnchor = { valueKey: key, source: target.source, phase: target.phase };
    }
  }
}

export const HEURISTIC_SOURCES = Object.freeze({
  actionGroup: "action-group",
  actionProperty: "action-property",
  modifierPropagation: "modifier-propagation",
  modifierProfile: "modifier-profile",
  inputDefault: "input-default",
  profileTrend: "profile-trend",
  phaseAdjacency: "phase-adjacency",
});

const BASE_CONFIDENCE = Object.freeze({
  [HEURISTIC_SOURCES.actionGroup]: 0.6,
  [HEURISTIC_SOURCES.modifierPropagation]: 0.82,
  [HEURISTIC_SOURCES.modifierProfile]: 0.64,
  [HEURISTIC_SOURCES.inputDefault]: 0.48,
  [HEURISTIC_SOURCES.profileTrend]: 0.56,
  [HEURISTIC_SOURCES.phaseAdjacency]: 0.62,
});

const SOURCE_PRIORITY = new Map(
  [
    HEURISTIC_SOURCES.modifierPropagation,
    HEURISTIC_SOURCES.modifierProfile,
    HEURISTIC_SOURCES.phaseAdjacency,
    HEURISTIC_SOURCES.actionGroup,
    HEURISTIC_SOURCES.profileTrend,
    HEURISTIC_SOURCES.inputDefault,
  ].map((source, index) => [source, index]),
);

function shouldReplaceSuggestion(existing, candidate) {
  const existingConfidence = Number(existing?.confidence) || 0;
  const candidateConfidence = Number(candidate?.confidence) || 0;
  if (candidateConfidence > existingConfidence) return true;
  if (candidateConfidence < existingConfidence) return false;

  const existingPriority = SOURCE_PRIORITY.get(existing?.source) ?? Number.MAX_SAFE_INTEGER;
  const candidatePriority = SOURCE_PRIORITY.get(candidate?.source) ?? Number.MAX_SAFE_INTEGER;
  return candidatePriority < existingPriority;
}

function clampConfidence(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function computeSuggestionConfidence(source, context = {}) {
  const base = BASE_CONFIDENCE[source] ?? 0.5;
  if (
    source === HEURISTIC_SOURCES.modifierPropagation ||
    source === HEURISTIC_SOURCES.modifierProfile
  ) {
    const ratio = context.agreementRatio;
    if (Number.isFinite(ratio)) return clampConfidence(base * ratio);
  }
  if (source === HEURISTIC_SOURCES.inputDefault) {
    const ratio = context.existingRatio;
    if (Number.isFinite(ratio)) return clampConfidence(base * ratio);
  }
  if (source === HEURISTIC_SOURCES.profileTrend) {
    const preferenceRatio = context.preferenceRatio;
    const supportBoost =
      Number.isFinite(context.supportCount) && context.supportCount > 0
        ? Math.min(context.supportCount * 0.005, 0.05)
        : 0;
    if (Number.isFinite(preferenceRatio)) {
      return clampConfidence(base * preferenceRatio + supportBoost);
    }
    return clampConfidence(base + supportBoost);
  }
  if (source === HEURISTIC_SOURCES.phaseAdjacency) {
    const adjacency = Number(context?.adjacency);
    if (Number.isFinite(adjacency)) {
      return clampConfidence(base * adjacency);
    }
  }
  return clampConfidence(base);
}

export const DEFAULT_HEURISTIC_THRESHOLDS = Object.freeze({
  consensusEnabled: true,
  consensusMinGroupSize: 2,
  consensusMinExistingRatio: 0.5,
  actionGroupEnabled: true,
  actionGroupMinGroupSize: 2,
  actionGroupMinExistingRatio: 0.6,
  actionGroupPhaseMinGroupSize: 3,
  actionGroupPhaseMinExistingRatio: 0.72,
  actionPropertyEnabled: true,
  actionPropertyMinGroupSize: 2,
  actionPropertyMinExistingRatio: 0.6,
  actionPropertyPhaseMinGroupSize: 3,
  actionPropertyPhaseMinExistingRatio: 0.72,
  modifierProfileEnabled: true,
  inputDefaultEnabled: true,
  inputDefaultMinGroupSize: 2,
  inputDefaultMinExistingRatio: 0.5,
  profileTrendEnabled: true,
  profileTrendMinObservations: 5,
  profileTrendMinPreferenceRatio: 0.65,
  phaseAdjacencyMaxGap: DEFAULT_PHASE_ADJACENCY_MAX_GAP,
  phaseAdjacencyEnabled: DEFAULT_PHASE_ADJACENCY_ENABLED,
});

  function normalizeThresholds(override = {}) {
    if (!override || typeof override !== "object") override = {};
    const defaults = DEFAULT_HEURISTIC_THRESHOLDS;
    return {
      consensusEnabled:
        typeof override.consensusEnabled === "boolean"
          ? override.consensusEnabled
          : defaults.consensusEnabled,
      consensusMinGroupSize: Number.isFinite(override.consensusMinGroupSize)
        ? override.consensusMinGroupSize
        : defaults.consensusMinGroupSize,
      consensusMinExistingRatio: Number.isFinite(override.consensusMinExistingRatio)
        ? override.consensusMinExistingRatio
        : defaults.consensusMinExistingRatio,
      actionGroupEnabled:
        typeof override.actionGroupEnabled === "boolean"
          ? override.actionGroupEnabled
          : defaults.actionGroupEnabled,
      actionGroupMinGroupSize: Number.isFinite(override.actionGroupMinGroupSize)
        ? override.actionGroupMinGroupSize
        : defaults.actionGroupMinGroupSize,
      actionGroupMinExistingRatio: Number.isFinite(override.actionGroupMinExistingRatio)
        ? override.actionGroupMinExistingRatio
        : defaults.actionGroupMinExistingRatio,
      actionGroupPhaseMinGroupSize: Number.isFinite(
        override.actionGroupPhaseMinGroupSize,
      )
        ? override.actionGroupPhaseMinGroupSize
        : defaults.actionGroupPhaseMinGroupSize,
      actionGroupPhaseMinExistingRatio: Number.isFinite(
        override.actionGroupPhaseMinExistingRatio,
      )
        ? override.actionGroupPhaseMinExistingRatio
        : defaults.actionGroupPhaseMinExistingRatio,
      actionPropertyEnabled:
        typeof override.actionPropertyEnabled === "boolean"
          ? override.actionPropertyEnabled
          : defaults.actionPropertyEnabled,
      actionPropertyMinGroupSize: Number.isFinite(override.actionPropertyMinGroupSize)
        ? override.actionPropertyMinGroupSize
        : defaults.actionPropertyMinGroupSize,
      actionPropertyMinExistingRatio: Number.isFinite(
        override.actionPropertyMinExistingRatio,
      )
        ? override.actionPropertyMinExistingRatio
        : defaults.actionPropertyMinExistingRatio,
      actionPropertyPhaseMinGroupSize: Number.isFinite(
        override.actionPropertyPhaseMinGroupSize,
      )
        ? override.actionPropertyPhaseMinGroupSize
        : defaults.actionPropertyPhaseMinGroupSize,
      actionPropertyPhaseMinExistingRatio: Number.isFinite(
        override.actionPropertyPhaseMinExistingRatio,
      )
        ? override.actionPropertyPhaseMinExistingRatio
        : defaults.actionPropertyPhaseMinExistingRatio,
      modifierProfileEnabled:
        typeof override.modifierProfileEnabled === "boolean"
          ? override.modifierProfileEnabled
          : defaults.modifierProfileEnabled,
      inputDefaultEnabled:
        typeof override.inputDefaultEnabled === "boolean"
          ? override.inputDefaultEnabled
          : defaults.inputDefaultEnabled,
      inputDefaultMinGroupSize: Number.isFinite(override.inputDefaultMinGroupSize)
        ? override.inputDefaultMinGroupSize
        : defaults.inputDefaultMinGroupSize,
      inputDefaultMinExistingRatio: Number.isFinite(override.inputDefaultMinExistingRatio)
        ? override.inputDefaultMinExistingRatio
        : defaults.inputDefaultMinExistingRatio,
      profileTrendEnabled:
        typeof override.profileTrendEnabled === "boolean"
          ? override.profileTrendEnabled
          : defaults.profileTrendEnabled,
      profileTrendMinObservations: Number.isFinite(override.profileTrendMinObservations)
        ? Math.max(override.profileTrendMinObservations, defaults.profileTrendMinObservations)
        : defaults.profileTrendMinObservations,
      profileTrendMinPreferenceRatio: Number.isFinite(override.profileTrendMinPreferenceRatio)
        ? Math.max(
            override.profileTrendMinPreferenceRatio,
            defaults.profileTrendMinPreferenceRatio,
          )
        : defaults.profileTrendMinPreferenceRatio,
    phaseAdjacencyMaxGap: Number.isFinite(override.phaseAdjacencyMaxGap)
      ? override.phaseAdjacencyMaxGap
      : defaults.phaseAdjacencyMaxGap,
    phaseAdjacencyEnabled:
      typeof override.phaseAdjacencyEnabled === "boolean"
        ? override.phaseAdjacencyEnabled
        : defaults.phaseAdjacencyEnabled,
  };
}

function selectProfileBucket(container, phase, allowPhaseFallback) {
  if (!container) return null;
  const phaseKey = normalizePhaseKey(phase);
  if (phaseKey != null) {
    const phaseBucket = container.phases?.[phaseKey];
    if (phaseBucket) return phaseBucket;
    if (!allowPhaseFallback) return null;
  }
  return container.all || null;
}

function summarizeProfileForTarget(target, profiles, cache) {
  if (!profiles) return null;
  const allowPhaseFallback = normalizePhaseKey(target.phase) == null;
  const cacheKey = `${target.key}|${target.field}|${target.phase ?? ""}|${allowPhaseFallback}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const field = target.field;
  if (field !== "outcome" && field !== "end" && field !== "tag") {
    cache.set(cacheKey, null);
    return null;
  }

  let change = 0;
  let noEffect = 0;
  const valueCounts = new Map();

  const mergeBucket = (bucket) => {
    if (!bucket) return;
    change += Number(bucket.change || 0);
    noEffect += Number(bucket.noop || 0) + Number(bucket.clear || 0);
    const values = bucket.values || {};
    for (const [key, entry] of Object.entries(values)) {
      const count = Number(entry?.count || 0);
      const value = entry?.value;
      if (!valueCounts.has(key)) valueCounts.set(key, { count: 0, value });
      const item = valueCounts.get(key);
      item.count += count;
      if (item.value == null && value != null) item.value = value;
    }
  };

  const inputBucket = selectProfileBucket(
    profiles.input?.[target.inputKey]?.[field],
    target.phase,
    allowPhaseFallback,
  );
  mergeBucket(inputBucket);

  const modIds = parseModifierIds(target.variantSig);
  for (const modId of modIds) {
    const bucket = selectProfileBucket(
      profiles.modifier?.[modId]?.[field],
      target.phase,
      allowPhaseFallback,
    );
    mergeBucket(bucket);
  }

  let topValue = null;
  let topValueKey = "";
  let topCount = 0;
  for (const [key, entry] of valueCounts.entries()) {
    if (entry.count > topCount) {
      topCount = entry.count;
      topValue = entry.value;
      topValueKey = key;
    }
  }

  const summary =
    change === 0 && noEffect === 0 && topCount === 0
      ? null
      : { change, noEffect, topValue, topValueKey, topCount };
  cache.set(cacheKey, summary);
  return summary;
}

function hasProfileTrendSignal(summary, thresholds) {
  if (!summary) return false;
  const total = summary.change + summary.noEffect;
  if (total < thresholds.profileTrendMinObservations) return false;
  if (summary.topCount <= 0) return false;
  const preferenceRatio = summary.topCount / total;
  return preferenceRatio >= thresholds.profileTrendMinPreferenceRatio;
}

function buildProfilePrefs(profiles, thresholds) {
  const cache = new Map();
  return {
    shouldSkip(target, candidateValue) {
      const summary = summarizeProfileForTarget(target, profiles, cache);
      if (!summary) return false;
      const candidateKey = valueKey(target.field, candidateValue);
      if (
        summary.noEffect > summary.change * 1.2 &&
        (!candidateKey || candidateKey !== summary.topValueKey)
      ) {
        return true;
      }
      return false;
    },
    hasSignal(target) {
      const summary = summarizeProfileForTarget(target, profiles, cache);
      return hasProfileTrendSignal(summary, thresholds);
    },
    preferredValue(target) {
      const summary = summarizeProfileForTarget(target, profiles, cache);
      if (!hasProfileTrendSignal(summary, thresholds)) return null;
      if (summary.change >= summary.noEffect && summary.topValue) {
        return summary.topValue;
      }
      return null;
    },
    getSummary(target) {
      return summarizeProfileForTarget(target, profiles, cache);
    },
  };
}

export function runInferenceStrategies(
  targets,
  profiles,
  thresholdOverrides,
  strategies = DEFAULT_INFERENCE_STRATEGIES,
) {
  const thresholds = normalizeThresholds(thresholdOverrides);
  const prepared = prepareTargets(targets || []);
  const suggestions = new Map();

  const profilePrefs = profiles ? buildProfilePrefs(profiles, thresholds) : null;
  const helperContext = {
    applyConsensus,
    applyPhaseAdjacency,
    cloneValue,
    computeSuggestionConfidence,
    eligibleForSuggestion,
    registerSuggestion,
    sources: HEURISTIC_SOURCES,
    valueKey,
  };

  for (const strategy of strategies) {
    const strategyThresholds = strategy.thresholds
      ? strategy.thresholds(thresholds)
      : thresholds;
    if (strategyThresholds === false) continue;
    if (strategyThresholds && strategyThresholds.enabled === false) continue;
    if (typeof strategy.enabled === "function" && !strategy.enabled(strategyThresholds))
      continue;

    const state = strategy.prepare({
      targets: prepared,
      thresholds: strategyThresholds,
      profiles,
      profilePrefs,
    });

    strategy.suggest({
      targets: prepared,
      thresholds: strategyThresholds,
      profiles,
      profilePrefs,
      suggestions,
      state,
      helpers: helperContext,
    });
  }

  return suggestions;
}

export function proposeInteractionInferences(targets, profiles, thresholdOverrides) {
  return runInferenceStrategies(
    targets,
    profiles,
    thresholdOverrides,
    DEFAULT_INFERENCE_STRATEGIES,
  );
}
