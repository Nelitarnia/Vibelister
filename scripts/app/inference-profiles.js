// inference-profiles.js — track lightweight modifier/input frequency maps for inference

function normalizeVariantSig(pair) {
  if (!pair) return "";
  const sig =
    typeof pair.variantSig === "string" || typeof pair.variantSig === "number"
      ? String(pair.variantSig)
      : "";
  return sig;
}

function normalizeInputKey(pair) {
  if (!pair) return "";
  const kind = String(pair.kind || "AI").toUpperCase();
  if (kind === "AA") {
    return Number.isFinite(pair.rhsActionId) ? `rhs:${pair.rhsActionId}` : "";
  }
  return Number.isFinite(pair.iId) ? `in:${pair.iId}` : "";
}

function parseModifierIds(pair) {
  const sig = normalizeVariantSig(pair);
  if (!sig) return [];
  return sig
    .split("+")
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
}

function expandTagCandidates(value) {
  if (Array.isArray(value)) return value.flatMap((v) => expandTagCandidates(v));
  if (value && typeof value === "object") {
    if ("tags" in value) return expandTagCandidates(value.tags);
    if ("tag" in value) return expandTagCandidates(value.tag);
  }
  if (value == null) return [];
  const text = typeof value === "string" ? value : String(value);
  return text
    .split(/[\n,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeTagList(value) {
  const seen = new Set();
  const tags = [];
  for (const tag of expandTagCandidates(value)) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

export function extractNoteFieldValue(note, field) {
  if (!note || typeof note !== "object") return null;
  if (field === "outcome") {
    if (Number.isFinite(note.outcomeId)) return { outcomeId: note.outcomeId };
    if (typeof note.result === "string" && note.result.trim()) {
      return { result: note.result.trim() };
    }
    return null;
  }
  if (field === "end") {
    if (Number.isFinite(note.endActionId)) {
      return {
        endActionId: note.endActionId,
        endVariantSig:
          typeof note.endVariantSig === "string" ? note.endVariantSig : "",
      };
    }
    if (typeof note.endFree === "string" && note.endFree.trim()) {
      return { endFree: note.endFree.trim() };
    }
    return null;
  }
  if (field === "tag") {
    const tags = normalizeTagList(note.tags);
    return tags.length ? { tags } : null;
  }
  return null;
}

function valueKey(field, value) {
  if (!value) return "";
  if (field === "outcome") {
    if (Number.isFinite(value.outcomeId)) return `o:${value.outcomeId}`;
    if (typeof value.result === "string") return `r:${value.result}`;
  }
  if (field === "end") {
    if (Number.isFinite(value.endActionId)) {
      const sig = typeof value.endVariantSig === "string" ? value.endVariantSig : "";
      return `e:${value.endActionId}|${sig}`;
    }
    if (typeof value.endFree === "string") return `f:${value.endFree}`;
  }
  if (field === "tag") {
    const tags = normalizeTagList(value.tags);
    return `t:${tags.join("|")}`;
  }
  return "";
}

function cloneValue(field, value) {
  if (!value) return null;
  if (field === "outcome") {
    if (Number.isFinite(value.outcomeId)) return { outcomeId: value.outcomeId };
    if (typeof value.result === "string") return { result: value.result };
    return null;
  }
  if (field === "end") {
    if (Number.isFinite(value.endActionId)) {
      return {
        endActionId: value.endActionId,
        endVariantSig:
          typeof value.endVariantSig === "string" ? value.endVariantSig : "",
      };
    }
    if (typeof value.endFree === "string") return { endFree: value.endFree };
    return null;
  }
  if (field === "tag") {
    const tags = normalizeTagList(value.tags);
    return tags.length ? { tags } : { tags: [] };
  }
  return null;
}

function createCountsBucket() {
  return { change: 0, clear: 0, noop: 0, values: new Map() };
}

function createFieldBucket() {
  return { all: createCountsBucket(), phases: new Map() };
}

function createProfileRecord() {
  return {
    outcome: createFieldBucket(),
    end: createFieldBucket(),
    tag: createFieldBucket(),
  };
}

const modifierProfiles = new Map();
const inputProfiles = new Map();
let decayBudget = 0;

function ensureProfile(map, key) {
  if (!map.has(key)) map.set(key, createProfileRecord());
  return map.get(key);
}

function normalizePhaseKey(phase) {
  return phase == null ? null : String(phase);
}

function incrementCountsBucket(bucket, impact, nextValue, field, delta = 1) {
  if (!bucket) return;
  const deltaValue = Number.isFinite(delta) ? delta : 0;
  if (!deltaValue) return;
  const change = bucket.change + (impact === "change" ? deltaValue : 0);
  const clear = bucket.clear + (impact === "clear" ? deltaValue : 0);
  const noop = bucket.noop + (impact === "noop" ? deltaValue : 0);
  bucket.change = change < 0 ? 0 : change;
  bucket.clear = clear < 0 ? 0 : clear;
  bucket.noop = noop < 0 ? 0 : noop;
  if (nextValue) {
    const key = valueKey(field, nextValue);
    if (!key) return;
    if (!bucket.values.has(key)) bucket.values.set(key, { count: 0, value: cloneValue(field, nextValue) });
    const entry = bucket.values.get(key);
    entry.count += deltaValue;
    if (entry.count <= 0) bucket.values.delete(key);
  }
}

function incrementBucket(bucket, impact, nextValue, field, phase, delta = 1) {
  if (!bucket) return;
  incrementCountsBucket(bucket.all, impact, nextValue, field, delta);
  const phaseKey = normalizePhaseKey(phase);
  if (phaseKey == null) return;
  if (!bucket.phases.has(phaseKey)) bucket.phases.set(phaseKey, createCountsBucket());
  incrementCountsBucket(bucket.phases.get(phaseKey), impact, nextValue, field, delta);
}

function computeImpact(field, previousValue, nextValue) {
  const beforeKey = valueKey(field, previousValue);
  const afterKey = valueKey(field, nextValue);
  if (beforeKey === afterKey) return "noop";
  if (afterKey) return "change";
  if (beforeKey) return "clear";
  return "noop";
}

function decayBucket(bucket, factor) {
  if (!bucket) return;
  bucket.change *= factor;
  bucket.clear *= factor;
  bucket.noop *= factor;
  for (const [key, entry] of bucket.values.entries()) {
    entry.count *= factor;
    if (entry.count < 0.1) bucket.values.delete(key);
  }
}

function decayFieldBucket(fieldBucket, factor) {
  if (!fieldBucket) return;
  decayBucket(fieldBucket.all, factor);
  for (const bucket of fieldBucket.phases.values()) {
    decayBucket(bucket, factor);
  }
}

function decayProfiles(factor = 0.94) {
  for (const profile of modifierProfiles.values()) {
    decayFieldBucket(profile.outcome, factor);
    decayFieldBucket(profile.end, factor);
    decayFieldBucket(profile.tag, factor);
  }
  for (const profile of inputProfiles.values()) {
    decayFieldBucket(profile.outcome, factor);
    decayFieldBucket(profile.end, factor);
    decayFieldBucket(profile.tag, factor);
  }
}

export function recordProfileImpact({
  pair,
  field,
  previousValue,
  nextValue,
  impact,
  phase,
  inferred = false,
  manualOnly = false,
  delta = 1,
}) {
  if (!field || (field !== "outcome" && field !== "end" && field !== "tag")) {
    return;
  }
  if (manualOnly && inferred) return;
  if (!Number.isFinite(delta) || delta === 0) return;
  const impactType = impact || computeImpact(field, previousValue, nextValue);
  const modIds = parseModifierIds(pair);
  const inputKey = normalizeInputKey(pair);

  for (const modId of modIds) {
    const profile = ensureProfile(modifierProfiles, modId);
    incrementBucket(profile[field], impactType, nextValue, field, phase, delta);
  }
  if (inputKey) {
    const profile = ensureProfile(inputProfiles, inputKey);
    incrementBucket(profile[field], impactType, nextValue, field, phase, delta);
  }

  decayBudget += 1;
  if (decayBudget >= 50) {
    decayProfiles();
    decayBudget = 0;
  }
}

function cloneValues(values, field) {
  const entries = [];
  for (const [key, entry] of values.entries()) {
    const clonedValue = cloneValue(field, entry.value) || entry.value;
    entries.push([key, { count: entry.count, value: clonedValue }]);
  }
  const obj = Object.fromEntries(entries);
  for (const entry of Object.values(obj)) Object.freeze(entry);
  return Object.freeze(obj);
}

function cloneBucket(bucket, field) {
  if (!bucket) return { change: 0, clear: 0, noop: 0, values: {} };
  const values = cloneValues(bucket.values, field);
  return Object.freeze({
    change: bucket.change,
    clear: bucket.clear,
    noop: bucket.noop,
    values,
  });
}

function cloneFieldBucket(fieldBucket, field) {
  if (!fieldBucket) {
    return Object.freeze({ all: cloneBucket(null, field), phases: Object.freeze({}) });
  }
  const phases = {};
  for (const [key, bucket] of fieldBucket.phases.entries()) {
    phases[key] = cloneBucket(bucket, field);
  }
  return Object.freeze({
    all: cloneBucket(fieldBucket.all, field),
    phases: Object.freeze(phases),
  });
}

function cloneProfile(profile) {
  return Object.freeze({
    outcome: cloneFieldBucket(profile.outcome, "outcome"),
    end: cloneFieldBucket(profile.end, "end"),
    tag: cloneFieldBucket(profile.tag, "tag"),
  });
}

export function captureInferenceProfilesSnapshot() {
  decayProfiles();
  const modifier = {};
  for (const [key, profile] of modifierProfiles.entries()) {
    modifier[key] = cloneProfile(profile);
  }
  const input = {};
  for (const [key, profile] of inputProfiles.entries()) {
    input[key] = cloneProfile(profile);
  }
  return Object.freeze({
    modifier: Object.freeze(modifier),
    input: Object.freeze(input),
  });
}

export function resetInferenceProfiles() {
  modifierProfiles.clear();
  inputProfiles.clear();
  decayBudget = 0;
}
