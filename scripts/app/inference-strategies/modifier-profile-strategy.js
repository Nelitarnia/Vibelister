function buildProfileKey(target) {
  const actionKey = target.actionId == null ? "" : String(target.actionId);
  return `${actionKey}|${target.variantSig}|${target.phase}|${target.field}`;
}

export const modifierProfileStrategy = {
  key: "modifier-profile",
  thresholds(thresholds) {
    return {
      minGroupSize: thresholds.consensusMinGroupSize,
      minExistingRatio: thresholds.consensusMinExistingRatio,
    };
  },
  prepare({ targets }) {
    const byProfile = new Map();
    for (const target of targets) {
      const profileKey = buildProfileKey(target);
      if (!byProfile.has(profileKey)) byProfile.set(profileKey, []);
      byProfile.get(profileKey).push(target);
    }
    return byProfile;
  },
  suggest({ state: groups, thresholds, suggestions, profilePrefs, helpers }) {
    helpers.applyConsensus(
      groups,
      suggestions,
      helpers.sources.modifierProfile,
      profilePrefs,
      thresholds,
    );
  },
};
