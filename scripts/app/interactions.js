// interactions.js — Interactions view helpers (notes keys, get/set, clipboard, delete)

import { formatEndActionLabel } from "../data/column-kinds.js";
import { deleteComment } from "./comments.js";
import { canonicalSig } from "../data/variants/variants.js";
import { parsePhaseKey } from "../data/utils.js";
import { invertOutcomeId } from "./outcomes.js";
import {
  getInteractionsPair as getPairFromIndex,
  getInteractionsRowCount,
} from "./interactions-data.js";
import { emitInteractionTagChangeEvent } from "./tag-events.js";
import { recordProfileImpact } from "./inference-profiles.js";
import {
  extractNoteFieldValue,
  normalizeInteractionTags,
  normalizeTagList,
} from "./inference-utils.js";

export const DEFAULT_INTERACTION_CONFIDENCE = 1;
export const DEFAULT_INTERACTION_SOURCE = "manual";

export { getInteractionsRowCount, getPairFromIndex as getInteractionsPair };
export { normalizeInteractionTags, normalizeTagList };

export function normalizeInteractionConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_INTERACTION_CONFIDENCE;
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
}

export function normalizeInteractionSource(value) {
  if (typeof value !== "string") return DEFAULT_INTERACTION_SOURCE;
  const trimmed = value.trim();
  return trimmed || DEFAULT_INTERACTION_SOURCE;
}

function readInteractionMetadata(note) {
  const hasConfidence =
    note && typeof note === "object" && "confidence" in note;
  const hasSource = note && typeof note === "object" && "source" in note;
  const sourceMetadata =
    note && typeof note === "object" && typeof note.sourceMetadata === "object"
      ? note.sourceMetadata
      : null;
  const confidence = normalizeInteractionConfidence(
    note && typeof note === "object" ? note.confidence : undefined,
  );
  const source = normalizeInteractionSource(
    note && typeof note === "object" ? note.source : undefined,
  );
  const inferred =
    (hasConfidence || hasSource) &&
    (confidence !== DEFAULT_INTERACTION_CONFIDENCE ||
      source !== DEFAULT_INTERACTION_SOURCE);
  return { confidence, source, inferred, sourceMetadata };
}

export function applyInteractionMetadata(note, metadata) {
  if (!note || typeof note !== "object") return;
  const nextConfidence = metadata
    ? normalizeInteractionConfidence(metadata.confidence)
    : DEFAULT_INTERACTION_CONFIDENCE;
  const nextSource = metadata
    ? normalizeInteractionSource(metadata.source)
    : DEFAULT_INTERACTION_SOURCE;
  const hasSourceMetadataField =
    !metadata || Object.prototype.hasOwnProperty.call(metadata, "sourceMetadata");
  const nextSourceMetadata =
    metadata && typeof metadata.sourceMetadata === "object"
      ? metadata.sourceMetadata
      : null;
  if (nextConfidence !== DEFAULT_INTERACTION_CONFIDENCE) {
    note.confidence = nextConfidence;
  } else if ("confidence" in note) {
    delete note.confidence;
  }
  if (nextSource !== DEFAULT_INTERACTION_SOURCE) {
    note.source = nextSource;
  } else if ("source" in note) {
    delete note.source;
  }
  if (hasSourceMetadataField) {
    if (nextSourceMetadata && Object.keys(nextSourceMetadata).length) {
      note.sourceMetadata = nextSourceMetadata;
    } else if ("sourceMetadata" in note) {
      delete note.sourceMetadata;
    }
  }
}

function extractInteractionMetadata(value) {
  if (!value || typeof value !== "object") return null;
  const hasConfidence = Object.prototype.hasOwnProperty.call(
    value,
    "confidence",
  );
  const hasSource = Object.prototype.hasOwnProperty.call(value, "source");
  const hasSourceMetadata = Object.prototype.hasOwnProperty.call(
    value,
    "sourceMetadata",
  );
  if (!hasConfidence && !hasSource && !hasSourceMetadata) return null;
  return {
    confidence: hasConfidence
      ? normalizeInteractionConfidence(value.confidence)
      : DEFAULT_INTERACTION_CONFIDENCE,
    source: hasSource
      ? normalizeInteractionSource(value.source)
      : DEFAULT_INTERACTION_SOURCE,
    sourceMetadata:
      hasSourceMetadata && typeof value.sourceMetadata === "object"
        ? value.sourceMetadata
        : undefined,
  };
}

function formatTagList(value) {
  return Array.isArray(value) && value.length ? value.join(", ") : "";
}

function areTagListsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Array.isArray(a) === Array.isArray(b);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function collectInteractionTags(model) {
  const notes = model?.notes;
  if (!notes || typeof notes !== "object") return [];
  const seen = new Set();
  const tags = [];
  for (const note of Object.values(notes)) {
    if (!note || typeof note !== "object") continue;
    const normalized = normalizeTagList(note.tags);
    if (!normalized.length) continue;
    for (const tag of normalized) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
  }
  tags.sort((a, b) => {
    const lowerA = a.toLowerCase();
    const lowerB = b.toLowerCase();
    if (lowerA === lowerB) {
      if (a === b) return 0;
      return a < b ? -1 : 1;
    }
    return lowerA < lowerB ? -1 : 1;
  });
  return tags;
}

export function describeInteractionInference(note) {
  return readInteractionMetadata(note);
}

// Key builder
export function noteKeyForPair(pair, phase) {
  if (!pair) return "";
  const kind = pair && pair.kind ? String(pair.kind).toUpperCase() : "AI";
  let base = "";
  if (kind === "AA") {
    // Directed key with both variant signatures for maximum granularity
    const a = Number(pair.aId);
    const b = Number(pair.rhsActionId);
    const sa = canonicalSig(pair.variantSig || "");
    const sb = canonicalSig(pair.rhsVariantSig || "");
    base = `aa|${a}|${b}|${sa}|${sb}`;
  } else {
    base = `ai|${pair.aId}|${pair.iId}|${canonicalSig(pair.variantSig || "")}`;
  }
  return phase == null ? base : `${base}|p${phase}`;
}

export function isInteractionPhaseColumnActiveForRow(
  model,
  viewDef,
  r,
  c,
  colOverride,
) {
  if (!model || !viewDef || !Array.isArray(viewDef.columns)) return true;
  const col = colOverride || viewDef.columns[c];
  if (!col) return false;
  const pk = parsePhaseKey(col.key);
  if (
    !pk ||
    (pk.field !== "outcome" && pk.field !== "end" && pk.field !== "tag")
  )
    return true;
  const pair = getPairFromIndex(model, r);
  if (!pair) return false;
  const action = Array.isArray(model.actions)
    ? model.actions.find((x) => x && x.id === pair.aId)
    : null;
  const ids = action?.phases?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return true;
  return ids.includes(pk.p);
}

// Read a cell in Interactions
export function getInteractionsCell(model, viewDef, r, c) {
  const pair = getPairFromIndex(model, r);
  if (!pair) return "";
  const col = viewDef.columns[c];
  const key = (col && col.key) || "";
  const keyL = String(key).toLowerCase();

  // Left column: Action (+mods)
  if (keyL === "action" || keyL === "actionid" || keyL === "actionname") {
    const a = model.actions.find((x) => x.id === pair.aId);
    if (!a) return "";
    return formatEndActionLabel(model, a, pair.variantSig, {
      style: "parentheses",
    });
  }

  // Right-hand identity column: Input (AI) or RHS Action (AA)
  if (
    keyL === "input" ||
    keyL === "inputid" ||
    keyL === "rhsaction" ||
    keyL === "rhsactionid"
  ) {
    const kind = pair && pair.kind ? String(pair.kind).toUpperCase() : "AI";
    if (kind === "AA" || keyL === "rhsaction" || keyL === "rhsactionid") {
      const aRhs = model.actions.find((x) => x.id === pair.rhsActionId);
      if (!aRhs && !pair.rhsVariantSig) return "";
      return formatEndActionLabel(model, aRhs, pair.rhsVariantSig, {
        style: "parentheses",
      });
    }
    const i = model.inputs.find((x) => x.id === pair.iId);
    return i?.name || "";
  }

  // Notes (free-form, phase-less)
  if (key === "notes") {
    const k0 = noteKeyForPair(pair, undefined);
    const note0 = model.notes[k0] || {};
    return note0.notes ? String(note0.notes) : "";
  }

  // Phase columns
  // This and other stable-ID based columns should never accept free text.
  const pk = parsePhaseKey(key);
  if (!pk) return "";
  const k = noteKeyForPair(pair, pk.p);
  const note = model.notes[k] || {};

  if (pk.field === "outcome") {
    if (typeof note.outcomeId === "number") {
      const row = model.outcomes.find((o) => o.id === note.outcomeId);
      return row ? row.name || "" : "";
    }
    return "";
  }

  if (pk.field === "end") {
    if (typeof note.endActionId === "number") {
      const a2 = model.actions.find((x) => x.id === note.endActionId);
      return formatEndActionLabel(model, a2, note.endVariantSig, {
        style: "parentheses",
      });
    }
    return "";
  }

  if (pk.field === "tag") {
    if (note.tags == null) return "";
    if (Array.isArray(note.tags)) return formatTagList(note.tags);
    const normalized = normalizeTagList(note.tags);
    return formatTagList(normalized);
  }

  return "";
}

export function getStructuredCellInteractions(model, viewDef, r, c) {
  const col = viewDef.columns[c];
  if (!col) return null;
  const key = String(col.key || "");
  const pair = getPairFromIndex(model, r);
  if (!pair) return null;

  if (key === "notes") {
    const k = noteKeyForPair(pair, undefined);
    const note = model.notes[k];
    if (note && typeof note.notes === "string") {
      return { type: "notes", data: { notes: String(note.notes) } };
    }
    return null;
  }

  const pk = parsePhaseKey(key);
  if (!pk) return null;
  const k = noteKeyForPair(pair, pk.p);
  const note = model.notes[k];
  if (!note) return null;

  if (pk.field === "outcome") {
    if (note && note.outcomeId != null) {
      const oid = Number(note.outcomeId);
      if (Number.isFinite(oid)) {
        const meta = readInteractionMetadata(note);
        const data = { outcomeId: oid };
        if (meta.inferred) {
          if (meta.confidence !== DEFAULT_INTERACTION_CONFIDENCE)
            data.confidence = meta.confidence;
          if (meta.source !== DEFAULT_INTERACTION_SOURCE)
            data.source = meta.source;
        }
        return { type: "outcome", data };
      }
    }
    return null; // legacy free-text is readable in UI but never exported to clipboard
  }

  if (pk.field === "end") {
    if (typeof note.endActionId === "number") {
      const meta = readInteractionMetadata(note);
      const data = {
        endActionId: note.endActionId,
        endVariantSig: String(note.endVariantSig || ""),
      };
      if (meta.inferred) {
        if (meta.confidence !== DEFAULT_INTERACTION_CONFIDENCE)
          data.confidence = meta.confidence;
        if (meta.source !== DEFAULT_INTERACTION_SOURCE)
          data.source = meta.source;
      }
      return { type: "end", data };
    }
    return null; // legacy free-text is readable in UI but never exported to clipboard
  }
  if (pk.field === "tag") {
    if (note.tags != null) {
      const tags = normalizeTagList(note.tags);
      if (tags.length) {
        const meta = readInteractionMetadata(note);
        const data = { tags };
        if (meta.inferred) {
          if (meta.confidence !== DEFAULT_INTERACTION_CONFIDENCE)
            data.confidence = meta.confidence;
          if (meta.source !== DEFAULT_INTERACTION_SOURCE)
            data.source = meta.source;
        }
        return { type: "tag", data };
      }
    }
    return null;
  }
  return null;
}

function mirrorAaPhase0Outcome(model, pair, phase) {
  if (
    !model ||
    !pair ||
    phase !== 0 ||
    String(pair.kind || "").toUpperCase() !== "AA" ||
    typeof pair.aId !== "number" ||
    typeof pair.rhsActionId !== "number"
  ) {
    return false;
  }
  const notes = model.notes;
  if (!notes || typeof notes !== "object") return false;

  const sourceKey = noteKeyForPair(pair, phase);
  const sourceNote = notes[sourceKey];
  const sourceMeta = readInteractionMetadata(sourceNote);
  const mirrorPair = {
    kind: "AA",
    aId: pair.rhsActionId,
    rhsActionId: pair.aId,
    variantSig: pair.rhsVariantSig || "",
    rhsVariantSig: pair.variantSig || "",
  };
  const mirrorKey = noteKeyForPair(mirrorPair, 0);
  if (mirrorKey === sourceKey) return false;

  let valueType = null;
  let value = null;
  if (sourceNote && typeof sourceNote === "object") {
    if (typeof sourceNote.outcomeId === "number") {
      valueType = "number";
      value = sourceNote.outcomeId;
    } else if (typeof sourceNote.result === "string") {
      valueType = "string";
      value = sourceNote.result;
    }
  }

  const clearMirror = () => {
    const mnote = notes[mirrorKey];
    if (!mnote || typeof mnote !== "object") return false;
    let changed = false;
    if ("outcomeId" in mnote) {
      delete mnote.outcomeId;
      changed = true;
    }
    if ("result" in mnote) {
      delete mnote.result;
      changed = true;
    }
    if ("confidence" in mnote) {
      delete mnote.confidence;
      changed = true;
    }
    if ("source" in mnote) {
      delete mnote.source;
      changed = true;
    }
    if (!Object.keys(mnote).length) delete notes[mirrorKey];
    return changed;
  };

  if (valueType === "number") {
    const mirroredId = invertOutcomeId(model, value);
    if (mirroredId == null) return clearMirror();
    const mnote = notes[mirrorKey] || (notes[mirrorKey] = {});
    let changed = false;
    if (mnote.outcomeId !== mirroredId) {
      mnote.outcomeId = mirroredId;
      changed = true;
    }
    if ("result" in mnote) {
      delete mnote.result;
      changed = true;
    }
    applyInteractionMetadata(mnote, sourceMeta.inferred ? sourceMeta : null);
    return changed;
  }

  if (valueType === "string") {
    const mnote = notes[mirrorKey] || (notes[mirrorKey] = {});
    let changed = false;
    if (mnote.result !== value) {
      mnote.result = value;
      changed = true;
    }
    if ("outcomeId" in mnote) {
      delete mnote.outcomeId;
      changed = true;
    }
    applyInteractionMetadata(mnote, sourceMeta.inferred ? sourceMeta : null);
    return changed;
  }

  return clearMirror();
}

// Write a cell in Interactions (strict stable-ID policy for ouctome/end)
export function setInteractionsCell(model, status, viewDef, r, c, value) {
  const pair = getPairFromIndex(model, r);
  if (!pair) return false;
  const key = String(viewDef.columns[c]?.key || "");

  // Free-form notes column (phase-less)
  if (key === "notes") {
    const k = noteKeyForPair(pair, undefined);
    const note = model.notes[k] || (model.notes[k] = {});
    if (value == null || value === "") {
      if ("notes" in note) delete note.notes;
      if (Object.keys(note).length === 0) delete model.notes[k];
      return true;
    }
    note.notes = String(value);
    return true;
  }

  const pk = parsePhaseKey(key);
  if (!pk) return false;
  const k = noteKeyForPair(pair, pk.p);
  const note = model.notes[k] || (model.notes[k] = {});
  const previousValue = extractNoteFieldValue(note, pk.field);

  const finalize = (success) => {
    if (success) {
      const nextValue = extractNoteFieldValue(model.notes[k], pk.field);
      recordProfileImpact({
        store: model?.inferenceProfiles,
        pair,
        field: pk.field,
        previousValue,
        nextValue,
        phase: pk.p,
        manualOnly: true,
      });
    }
    return success;
  };

  if (pk.field === "outcome") {
    const metadata = extractInteractionMetadata(value);
    if (value == null || value === "") {
      if ("outcomeId" in note) delete note.outcomeId;
      if ("result" in note) delete note.result;
      applyInteractionMetadata(note, null);
      if (Object.keys(note).length === 0) delete model.notes[k];
      mirrorAaPhase0Outcome(model, pair, pk.p);
      return finalize(true);
    }
    const outcomeId =
      typeof value === "number"
        ? value
        : Number(value && typeof value === "object" ? value.outcomeId : NaN);
    if (Number.isFinite(outcomeId)) {
      note.outcomeId = outcomeId;
      if ("result" in note) delete note.result;
      applyInteractionMetadata(note, metadata);
      mirrorAaPhase0Outcome(model, pair, pk.p);
      return finalize(true);
    }
    // STRICT: reject plain text pastes for Outcome
    if (status?.set)
      status.set(
        "Outcome expects a valid Outcome ID (use the palette or structured paste).",
      );
    else if (status)
      status.textContent =
        "Outcome expects a valid Outcome ID (use the palette or structured paste).";
    return finalize(false);
  }

  if (pk.field === "end") {
    const metadata = extractInteractionMetadata(value);
    if (value == null || value === "") {
      if ("endActionId" in note) delete note.endActionId;
      if ("endVariantSig" in note) delete note.endVariantSig;
      applyInteractionMetadata(note, null);
      if (Object.keys(note).length === 0) delete model.notes[k];
      return finalize(true);
    }
    const endActionId =
      typeof value === "number"
        ? value
        : Number(value && typeof value === "object" ? value.endActionId : NaN);
    if (Number.isFinite(endActionId)) {
      note.endActionId = endActionId;
      note.endVariantSig = String(
        value && typeof value === "object" ? value.endVariantSig || "" : "",
      );
      applyInteractionMetadata(note, metadata);
      return finalize(true);
    }
    // STRICT: reject plain text or malformed objects for End
    if (status?.set)
      status.set(
        "End expects an Action ID (use the palette or structured paste).",
      );
    else if (status)
      status.textContent =
        "End expects an Action ID (use the palette or structured paste).";
    return finalize(false);
  }

  if (pk.field === "tag") {
    const previous = Array.isArray(note.tags) ? note.tags.slice() : [];
    const previousCount = previous.length;
    const metadata = extractInteractionMetadata(value);

    if (
      value == null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      const hadTags = previousCount > 0;
      if ("tags" in note) delete note.tags;
      applyInteractionMetadata(note, null);
      if (Object.keys(note).length === 0) delete model.notes[k];
      if (hadTags) {
        emitInteractionTagChangeEvent(null, {
          reason: "clearCell",
          noteKey: k,
          phase: pk.p,
          pair,
          tags: previous,
          count: previousCount,
        });
      }
      return finalize(true);
    }

    const tags = normalizeTagList(value);
    if (!tags.length) {
      const hadTags = previousCount > 0;
      if ("tags" in note) delete note.tags;
      applyInteractionMetadata(note, null);
      if (Object.keys(note).length === 0) delete model.notes[k];
      if (hadTags) {
        emitInteractionTagChangeEvent(null, {
          reason: "clearCell",
          noteKey: k,
          phase: pk.p,
          pair,
          tags: previous,
          count: previousCount,
        });
      }
      return finalize(true);
    }

    const changed = !areTagListsEqual(previous, tags);
    note.tags = tags;
    applyInteractionMetadata(note, metadata);
    if (changed || (!previousCount && tags.length)) {
      emitInteractionTagChangeEvent({ type: "set" }, {
        reason: "setCell",
        noteKey: k,
        phase: pk.p,
        pair,
        tags,
        count: tags.length,
      });
    }
    return finalize(true);
  }

  return finalize(false);
}

export function applyStructuredCellInteractions(
  setCell,
  viewDef,
  r,
  c,
  payload,
  modelFromCtx,
) {
  // Be defensive: plain-text paste or empty clipboard may call us with no payload
  if (!payload || typeof payload !== "object") return false;
  const col = viewDef.columns[c];
  if (!col) return false;
  const pk = parsePhaseKey(col.key);
  if (!pk) return false;

  // Normalize to the destination column.
  // Accept:
  //   • Wrapped: { type:'outcome'|'end'|'tag', data:{...} }
  //   • Bare outcome:  { outcomeId } or Number
  //   • Bare end:      { endActionId, endVariantSig? } or Number (→ endActionId)
  //   • Bare tags:     Array | comma text | { tags }
  //   • Action ref → End: { type:'action', data:{ id } } (map to { endActionId:id })
  const field = String(pk.field || "").toLowerCase(); // 'outcome' | 'end' | 'tag'
  let type = payload?.type ? String(payload.type).toLowerCase() : null;
  let data = payload && typeof payload.data === "object" ? payload.data : null;

  // 1) If missing wrapper or data, wrap from destination field
  if (!type || !data) {
    const hasType = !!(payload && payload.type);
    const hasDataProp =
      hasType &&
      payload &&
      typeof payload === "object" &&
      Object.prototype.hasOwnProperty.call(payload, "data");
    const bare = data ?? (hasDataProp ? payload.data : payload);
    if (field === "outcome") {
      type = "outcome";
      data =
        bare && typeof bare === "object" && "outcomeId" in bare
          ? bare
          : { outcomeId: bare };
    } else if (field === "end") {
      if (
        bare &&
        typeof bare === "object" &&
        ("endActionId" in bare || "endVariantSig" in bare)
      ) {
        type = "end";
        data = bare;
      } else if (typeof bare === "number") {
        type = "end";
        data = { endActionId: bare };
      } else {
        // leave as-is; may be action-ref handled below
      }
    } else if (field === "tag") {
      type = "tag";
      if (bare == null) data = { tags: [] };
      else if (
        bare &&
        typeof bare === "object" &&
        (Array.isArray(bare.tags) || typeof bare.tags === "string")
      ) {
        data = { tags: bare.tags };
      } else {
        data = { tags: bare };
      }
    }
  }

  // 2) SPECIAL: If destination is End and source is an Action ref, map it now
  if (
    field === "end" &&
    type === "action" &&
    payload?.data &&
    typeof payload.data.id === "number"
  ) {
    type = "end";
    data = {
      endActionId: payload.data.id,
      endVariantSig: String(payload.data.variantSig || ""),
    };
  }

  if (field === "tag" && type === "tag" && (data == null || data === undefined)) {
    data = { tags: [] };
  }

  const metadata = extractInteractionMetadata(data);

  // 3) Bail if the wrapper still doesn't match the destination
  if (
    (field === "outcome" && type !== "outcome") ||
    (field === "end" && type !== "end") ||
    (field === "tag" && type !== "tag") ||
    !data
  ) {
    return false;
  }

  // Prefer writing via setInteractionsCell to ensure all hooks execute
  const model = modelFromCtx;
  if (!model) return false;

  let wrote = false;

  if (field === "outcome" && type === "outcome") {
    const id = Number(data && (data.outcomeId ?? data));
    if (!Number.isFinite(id)) return false;
    const payload = { outcomeId: id };
    if (
      metadata &&
      (metadata.confidence !== DEFAULT_INTERACTION_CONFIDENCE ||
        metadata.source !== DEFAULT_INTERACTION_SOURCE)
    ) {
      payload.confidence = metadata.confidence;
      payload.source = metadata.source;
    }
    wrote = !!setInteractionsCell(model, null, viewDef, r, c, payload);
  } else if (field === "end" && type === "end") {
    const eid = Number(data && data.endActionId);
    if (!Number.isFinite(eid)) return false;
    const evs =
      "endVariantSig" in (data || {}) ? String(data.endVariantSig || "") : "";
    const payload = { endActionId: eid, endVariantSig: evs };
    if (
      metadata &&
      (metadata.confidence !== DEFAULT_INTERACTION_CONFIDENCE ||
        metadata.source !== DEFAULT_INTERACTION_SOURCE)
    ) {
      payload.confidence = metadata.confidence;
      payload.source = metadata.source;
    }
    wrote = !!setInteractionsCell(model, null, viewDef, r, c, payload);
  } else if (field === "tag" && type === "tag") {
    const tags = normalizeTagList(data && "tags" in data ? data.tags : data);
    const payload = metadata
      ? {
          tags,
          confidence: metadata.confidence,
          source: metadata.source,
        }
      : tags;
    wrote = !!setInteractionsCell(model, null, viewDef, r, c, payload);
  } else {
    return wrote;
  }

  if (wrote && pk.field === "outcome") {
    const pair = getPairFromIndex(model, r);
    mirrorAaPhase0Outcome(model, pair, pk.p);
  }

  return wrote;
}

// Optional single-cell clear (used by column kinds if needed)
export function clearInteractionsCell(model, viewDef, r, c) {
  const col = viewDef.columns[c];
  if (!col) return false;
  const key = String(col.key || "");
  const pair = getPairFromIndex(model, r);
  if (!pair) return false;

  if (key === "notes") {
    const k = noteKeyForPair(pair, undefined);
    const note = model.notes[k];
    if (!note) return false;
    let changed = false;
    if ("notes" in note) {
      delete note.notes;
      changed = true;
    }
    if (!Object.keys(note).length) delete model.notes[k];
    return changed;
  }

  const pk = parsePhaseKey(key);
  if (!pk) return false;
  const k = noteKeyForPair(pair, pk.p);
  const note = model.notes[k];
  if (!note) return false;
  let changed = false;

  if (pk.field === "outcome") {
    if ("outcomeId" in note) {
      delete note.outcomeId;
      changed = true;
    }
    if ("result" in note) {
      delete note.result;
      changed = true;
    }
    if ("confidence" in note) {
      delete note.confidence;
      changed = true;
    }
    if ("source" in note) {
      delete note.source;
      changed = true;
    }
  } else if (pk.field === "end") {
    if ("endActionId" in note) {
      delete note.endActionId;
      changed = true;
    }
    if ("endVariantSig" in note) {
      delete note.endVariantSig;
      changed = true;
    }
    if ("endFree" in note) {
      delete note.endFree;
      changed = true;
    }
    if ("confidence" in note) {
      delete note.confidence;
      changed = true;
    }
    if ("source" in note) {
      delete note.source;
      changed = true;
    }
  } else if (pk.field === "tag") {
    const previous = Array.isArray(note.tags) ? note.tags.slice() : [];
    if ("tags" in note) {
      delete note.tags;
      changed = true;
      if (previous.length) {
        emitInteractionTagChangeEvent(null, {
          reason: "clearCell",
          noteKey: k,
          phase: pk.p,
          pair,
          tags: previous,
          count: previous.length,
        });
      }
    }
    if ("confidence" in note) {
      delete note.confidence;
      changed = true;
    }
    if ("source" in note) {
      delete note.source;
      changed = true;
    }
  }

  if (!Object.keys(note).length) delete model.notes[k];
  if (pk.field === "outcome") {
    mirrorAaPhase0Outcome(model, pair, pk.p);
  }
  return changed;
}

// Delete in Interactions
export function clearInteractionsSelection(
  model,
  viewDef,
  selection,
  sel,
  mode,
  status,
  render,
  extras = {},
) {
  const rows = selection.rows.size
    ? Array.from(selection.rows).sort((a, b) => a - b)
    : [sel.r];

  let cleared = 0;
  const tagEvents = [];
  function clearField(note, key, pk, context = {}) {
    if (pk && pk.field === "outcome") {
      if ("outcomeId" in note) {
        delete note.outcomeId;
        cleared++;
      }
      if ("result" in note) {
        delete note.result;
        cleared++;
      }
      if ("confidence" in note) {
        delete note.confidence;
        cleared++;
      }
      if ("source" in note) {
        delete note.source;
        cleared++;
      }
      return true;
    }
    if (pk && pk.field === "end") {
      if ("endActionId" in note) {
        delete note.endActionId;
        cleared++;
      }
      if ("endVariantSig" in note) {
        delete note.endVariantSig;
        cleared++;
      }
      if ("endFree" in note) {
        delete note.endFree;
        cleared++;
      }
      if ("confidence" in note) {
        delete note.confidence;
        cleared++;
      }
      if ("source" in note) {
        delete note.source;
        cleared++;
      }
      return true;
    }
    if (pk && pk.field === "tag") {
      const previous = Array.isArray(note.tags) ? note.tags.slice() : [];
      if ("tags" in note) {
        if (previous.length) {
          tagEvents.push({
            noteKey: context.noteKey || null,
            pair: context.pair || null,
            phase: pk?.p,
            tags: previous,
          });
        }
        delete note.tags;
        cleared++;
      }
      if ("confidence" in note) {
        delete note.confidence;
        cleared++;
      }
      if ("source" in note) {
        delete note.source;
        cleared++;
      }
      return true;
    }
    if (key === "notes") {
      if ("notes" in note) {
        delete note.notes;
        cleared++;
      }
      return true;
    }
    return false;
  }

  if (mode === "clearAllEditable") {
    const cols = viewDef.columns;
    for (const r of rows) {
      const pair = getPairFromIndex(model, r);
      if (!pair) continue;
      const commentIdentity = { commentRowId: noteKeyForPair(pair, undefined) };
      for (let c = 0; c < cols.length; c++) {
        const column = cols[c];
        const key = String(column?.key || "");
        const pk = parsePhaseKey(key);
        if (
          !(
            key === "notes" ||
            (pk && (pk.field === "outcome" || pk.field === "end" || pk.field === "tag"))
          )
        )
          continue;
        const k = noteKeyForPair(pair, pk ? pk.p : undefined);
        const note = model.notes[k] || (model.notes[k] = {});
        clearField(note, key, pk, { noteKey: k, pair, phase: pk ? pk.p : undefined });
        if (Object.keys(note).length === 0) delete model.notes[k];
        if (pk && pk.field === "outcome") {
          mirrorAaPhase0Outcome(model, pair, pk.p);
        }
        const commentChange = deleteComment(model, viewDef, commentIdentity, column);
        if (commentChange) cleared++;
      }
    }
  } else {
    const cols = Array.isArray(viewDef?.columns) ? viewDef.columns : [];
    let colsToClear;
    if (selection?.colsAll) {
      colsToClear = cols.map((_, index) => index);
    } else if (selection?.cols?.size) {
      colsToClear = Array.from(selection.cols).sort((a, b) => a - b);
    } else {
      colsToClear = [sel.c];
    }

    const editableCols = colsToClear
      .filter((c) => Number.isInteger(c) && c >= 0 && c < cols.length)
      .map((c) => {
        const column = cols[c];
        const key = String(column?.key || "");
        const pk = parsePhaseKey(key);
        const editable =
          key === "notes" ||
          (pk && (pk.field === "outcome" || pk.field === "end" || pk.field === "tag"));
        return editable ? { key, pk, column } : null;
      })
      .filter(Boolean);

    if (!editableCols.length) {
      if (status?.set)
        status.set(
          "Nothing to delete here: select an Outcome, End, Tag, or Notes cell.",
        );
      else if (status)
        status.textContent =
          "Nothing to delete here: select an Outcome, End, Tag, or Notes cell.";
      return;
    }

    for (const r of rows) {
      const pair = getPairFromIndex(model, r);
      if (!pair) continue;
      const commentIdentity = { commentRowId: noteKeyForPair(pair, undefined) };
      for (const { key, pk, column } of editableCols) {
        const phase = pk ? pk.p : undefined;
        const noteKey = noteKeyForPair(pair, phase);
        const note = model.notes[noteKey];
        const commentChange = deleteComment(model, viewDef, commentIdentity, column);
        if (commentChange) cleared++;
        if (!note) continue;
        const clearedBefore = cleared;
        clearField(note, key, pk, { noteKey, pair, phase });
        if (Object.keys(note).length === 0) delete model.notes[noteKey];
        if (pk && pk.field === "outcome" && cleared !== clearedBefore) {
          mirrorAaPhase0Outcome(model, pair, pk.p);
        }
      }
    }
  }

  if (tagEvents.length) {
    for (const entry of tagEvents) {
      const tags = Array.isArray(entry?.tags) ? entry.tags : [];
      if (!tags.length) continue;
      emitInteractionTagChangeEvent(null, {
        reason: "clearSelection",
        noteKey: entry.noteKey || null,
        pair: entry.pair || null,
        phase: entry.phase,
        tags,
        count: tags.length,
      });
    }
  }

  const clearedMsg = cleared
    ? `Cleared ${cleared} entr${cleared === 1 ? "y" : "ies"} in Interactions.`
    : "Nothing to clear.";
  const rawHint =
    extras && typeof extras.statusHint === "string"
      ? extras.statusHint.trim()
      : "";
  let hint = rawHint;
  if (!hint && extras && extras.reason === "cut" && mode === "clearAllEditable") {
    hint = "Interactions are generated; rows can't be deleted.";
  }
  const message = hint ? `${hint} ${clearedMsg}` : clearedMsg;
  return { cleared, message };
}

// Query: is a given Interactions cell editable?
export function isInteractionsCellEditable(viewDef, r, c) {
  const col = viewDef.columns[c];
  if (!col) return false;
  const key = String(col.key || "");
  if (key === "notes") return true;
  const pk = parsePhaseKey(key);
  return !!(
    pk && (pk.field === "outcome" || pk.field === "end" || pk.field === "tag")
  );
}
