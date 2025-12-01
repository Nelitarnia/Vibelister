// Shared helpers for inference heuristics and profiles

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

function normalizeActionId(pair) {
  const id = Number(pair?.aId);
  return Number.isFinite(id) ? id : null;
}

function normalizePhaseKey(phase) {
  return phase == null ? null : String(phase);
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

function normalizeInteractionTags(value) {
  return normalizeTagList(value);
}

function extractNoteFieldValue(note, field) {
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
        endVariantSig: typeof note.endVariantSig === "string" ? note.endVariantSig : "",
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
        endVariantSig: typeof value.endVariantSig === "string" ? value.endVariantSig : "",
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

function parseModifierIds(value) {
  const sig =
    value && typeof value === "object" && "variantSig" in value
      ? normalizeVariantSig(value)
      : normalizeVariantSig({ variantSig: value });
  if (!sig) return [];
  return sig
    .split("+")
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
}

export {
  cloneValue,
  extractNoteFieldValue,
  normalizeActionId,
  normalizeInputKey,
  normalizeInteractionTags,
  normalizePhaseKey,
  normalizeTagList,
  normalizeVariantSig,
  parseModifierIds,
  valueKey,
};
