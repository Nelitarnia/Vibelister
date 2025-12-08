import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { GROUP_MODES } from "./variant-combinatorics.js";
import { MOD_STATE_ID } from "../mod-state.js";
import { buildInteractionsPairs, collectVariantsForAction } from "./variants.js";

function makeModifiers(count) {
  return Array.from({ length: count }, (_, idx) => ({
    id: idx + 1,
    name: `M${idx + 1}`,
  }));
}

function makeGroups(modifiers) {
  const evens = modifiers.filter((_, idx) => idx % 2 === 0).map((m) => m.id);
  const odds = modifiers.filter((_, idx) => idx % 2 === 1).map((m) => m.id);
  return [
    {
      id: 1,
      name: "Evens",
      memberIds: evens,
      mode: GROUP_MODES.AT_MOST,
      k: 2,
    },
    {
      id: 2,
      name: "Odds",
      memberIds: odds,
      mode: GROUP_MODES.RANGE,
      kMin: 1,
      kMax: 3,
    },
  ];
}

function makeInputs(count) {
  return Array.from({ length: count }, (_, idx) => ({
    id: idx + 1,
    name: `Input ${idx + 1}`,
  }));
}

function makeConstraints(modifiers) {
  return [
    { type: "REQUIRES", a: modifiers[0].id, b: modifiers[1].id },
    { type: "FORBIDS", a: modifiers[2].id, b: modifiers[3].id },
    { type: "MUTEX", ids: modifiers.slice(4, 9).map((m) => m.id) },
  ];
}

function makeActions(count, modifiers) {
  const states = [MOD_STATE_ID.ON, MOD_STATE_ID.REQUIRED, MOD_STATE_ID.BYPASS];
  return Array.from({ length: count }, (_, idx) => {
    const modSet = {};
    for (let i = 0; i < modifiers.length; i++) {
      if (i % 3 === idx % 3) modSet[modifiers[i].id] = states[i % states.length];
    }
    return { id: idx + 1, name: `Action ${idx + 1}`, modSet };
  });
}

function runBenchmark({ actionCount = 60, modifierCount = 14, iterations = 50 } = {}) {
  const modifiers = makeModifiers(modifierCount);
  const modifierGroups = makeGroups(modifiers);
  const modifierConstraints = makeConstraints(modifiers);
  const template = {
    actions: makeActions(actionCount, modifiers),
    inputs: makeInputs(12),
    modifiers,
    modifierGroups,
    modifierConstraints,
  };

  const before = process.memoryUsage().heapUsed;
  const start = performance.now();
  let pairs = 0;
  for (let i = 0; i < iterations; i++) {
    const model = structuredClone(template);
    const { pairsCount } = buildInteractionsPairs(model, {
      targetIndexField: `benchIndex${i}`,
    });
    pairs += pairsCount;
  }
  const elapsedMs = performance.now() - start;
  const after = process.memoryUsage().heapUsed;

  return {
    benchmark: "interactions",
    actionCount,
    modifierCount,
    iterations,
    pairs,
    elapsedMs,
    heapDelta: after - before,
  };
}

function makeDenseVariantModel({ groups = 3, groupSize = 6, pick = 3 } = {}) {
  const modifiers = makeModifiers(groups * groupSize);
  const modifierGroups = [];
  for (let i = 0; i < groups; i++) {
    const memberIds = modifiers
      .slice(i * groupSize, (i + 1) * groupSize)
      .map((m) => m.id);
    modifierGroups.push({
      id: i + 1,
      name: `Dense ${i + 1}`,
      memberIds,
      mode: GROUP_MODES.RANGE,
      kMin: 0,
      kMax: pick,
    });
  }

  const modSet = {};
  for (const mod of modifiers) modSet[mod.id] = MOD_STATE_ID.ON;

  return {
    action: { id: 1, name: "Dense variants", modSet },
    modifiers,
    modifierGroups,
  };
}

function runVariantFanoutBenchmark({ iterations = 150, groups = 3, groupSize = 6, pick = 3 } = {}) {
  const model = makeDenseVariantModel({ groups, groupSize, pick });
  const start = performance.now();
  let variants = 0;
  for (let i = 0; i < iterations; i++) {
    const { variants: sigs } = collectVariantsForAction(model.action, model, {
      normalizeSignatures: false,
    });
    variants += sigs.length;
  }
  const elapsedMs = performance.now() - start;
  return {
    benchmark: "denseVariants",
    groups,
    groupSize,
    iterations,
    variantsPerRun: variants / iterations,
    elapsedMs,
  };
}

const modulePath = path.resolve(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (modulePath === invokedPath) {
  const results = [runBenchmark(), runVariantFanoutBenchmark()];
  console.table(results);
}

export { runBenchmark, runVariantFanoutBenchmark };
