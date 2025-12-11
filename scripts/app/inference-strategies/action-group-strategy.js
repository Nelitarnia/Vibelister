function buildInputGroupKey(target) {
  return `${target.actionGroupKey}|${target.inputKey}|${target.phase}|${target.field}`;
}

function buildPhaseGroupKey(target) {
  return `${target.actionGroupKey}|${target.phase}|${target.field}`;
}

export const actionGroupStrategy = {
  key: "action-group",
  thresholds(thresholds) {
    return {
      input: {
        minGroupSize: thresholds.actionGroupMinGroupSize,
        minExistingRatio: thresholds.actionGroupMinExistingRatio,
      },
      phase: {
        minGroupSize: thresholds.actionGroupPhaseMinGroupSize,
        minExistingRatio: thresholds.actionGroupPhaseMinExistingRatio,
      },
    };
  },
  prepare({ targets }) {
    const byInput = new Map();
    const byPhase = new Map();
    for (const target of targets) {
      if (!target.actionGroupKey) continue;
      const inputKey = buildInputGroupKey(target);
      if (!byInput.has(inputKey)) byInput.set(inputKey, []);
      byInput.get(inputKey).push(target);

      const phaseKey = buildPhaseGroupKey(target);
      if (!byPhase.has(phaseKey)) byPhase.set(phaseKey, []);
      byPhase.get(phaseKey).push(target);
    }
    return { byInput, byPhase };
  },
  suggest({ state, thresholds, suggestions, profilePrefs, helpers }) {
    if (state.byInput.size) {
      helpers.applyConsensus(
        state.byInput,
        suggestions,
        helpers.sources.actionGroup,
        profilePrefs,
        thresholds.input,
      );
    }
    if (state.byPhase.size) {
      helpers.applyConsensus(
        state.byPhase,
        suggestions,
        helpers.sources.actionGroup,
        profilePrefs,
        thresholds.phase,
      );
    }
  },
};
