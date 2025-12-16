function adjacencyKey(target) {
  const actionKey = target.actionId == null ? "" : String(target.actionId);
  return `${actionKey}|${target.inputKey}|${target.field}`;
}

export const phaseAdjacencyStrategy = {
  key: "phase-adjacency",
  thresholds(thresholds) {
    return {
      maxGapDistance: thresholds.phaseAdjacencyMaxGap,
      enabled: thresholds.phaseAdjacencyEnabled !== false,
    };
  },
  prepare({ targets }) {
    const byAdjacency = new Map();
    for (const target of targets) {
      if (!Number.isFinite(target.phase)) continue;
      const key = adjacencyKey(target);
      if (!byAdjacency.has(key)) byAdjacency.set(key, []);
      byAdjacency.get(key).push(target);
    }
    return byAdjacency;
  },
  suggest({ state: groups, thresholds, suggestions, profilePrefs, helpers }) {
    helpers.applyPhaseAdjacency(groups, suggestions, profilePrefs, thresholds);
  },
};
