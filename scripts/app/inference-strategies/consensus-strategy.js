function actionInputKey(target) {
  const actionKey = target.actionId == null ? "" : String(target.actionId);
  return `${actionKey}|${target.inputKey}|${target.phase}|${target.field}`;
}

export const consensusStrategy = {
  key: "consensus",
  thresholds(thresholds) {
    return {
      minGroupSize: thresholds.consensusMinGroupSize,
      minExistingRatio: thresholds.consensusMinExistingRatio,
    };
  },
  prepare({ targets }) {
    const byActionInput = new Map();
    for (const target of targets) {
      const key = actionInputKey(target);
      if (!byActionInput.has(key)) byActionInput.set(key, []);
      byActionInput.get(key).push(target);
    }
    return byActionInput;
  },
  suggest({ state: groups, thresholds, suggestions, profilePrefs, helpers }) {
    helpers.applyConsensus(
      groups,
      suggestions,
      helpers.sources.modifierPropagation,
      profilePrefs,
      thresholds,
    );
  },
};
