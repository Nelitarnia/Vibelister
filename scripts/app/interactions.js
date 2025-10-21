// interactions.js — Interactions view helpers (notes keys, get/set, clipboard, delete)

import { canonicalSig, sortIdsByUserOrder } from "../data/variants/variants.js";
import { parsePhaseKey } from "../data/utils.js";
import { invertOutcomeId } from "./outcomes.js";

// Key builder
export function noteKeyForPair(pair, phase) {
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
  if (!pk || (pk.field !== "outcome" && pk.field !== "end")) return true;
  const pair = Array.isArray(model.interactionsPairs)
    ? model.interactionsPairs[r]
    : null;
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
  const pair = model.interactionsPairs[r];
  if (!pair) return "";
  const col = viewDef.columns[c];
  const key = (col && col.key) || "";
  const keyL = String(key).toLowerCase();

  // Left column: Action (+mods)
  if (keyL === "action" || keyL === "actionid" || keyL === "actionname") {
    const a = model.actions.find((x) => x.id === pair.aId);
    if (!a) return "";
    if (!pair.variantSig) return a.name || "";
    const ids = String(pair.variantSig).split("+").filter(Boolean).map(Number);
    const sortedIds = sortIdsByUserOrder(ids, model);
    const mods = sortedIds
      .map((id) => model.modifiers.find((m) => m.id === id)?.name || "")
      .filter(Boolean);
    return mods.length ? `${a.name || ""} (${mods.join("+")})` : a.name || "";
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
      const base = aRhs?.name || "";
      const sig = pair.rhsVariantSig || "";
      if (!sig) return base;
      const ids = String(sig).split("+").filter(Boolean).map(Number);
      const sortedIds = sortIdsByUserOrder(ids, model);
      const mods = sortedIds
        .map((id) => model.modifiers.find((m) => m.id === id)?.name || "")
        .filter(Boolean);
      return mods.length ? `${base} (${mods.join("+")})` : base;
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
      const name2 = a2?.name || "";
      if (note.endVariantSig) {
        const ids2 = String(note.endVariantSig)
          .split("+")
          .filter(Boolean)
          .map(Number);
        const sortedIds2 = sortIdsByUserOrder(ids2, model);
        const modNames2 = sortedIds2
          .map((id) => model.modifiers.find((m) => m.id === id)?.name || "")
          .filter(Boolean);
        return modNames2.length ? `${name2} (${modNames2.join("+")})` : name2;
      }
      return name2;
    }
    return "";
  }

  return "";
}

export function getStructuredCellInteractions(model, viewDef, r, c) {
  const col = viewDef.columns[c];
  if (!col) return null;
  const key = String(col.key || "");
  const pair = model.interactionsPairs[r];
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
      if (Number.isFinite(oid))
        return { type: "outcome", data: { outcomeId: oid } };
    }
    return null; // legacy free-text is readable in UI but never exported to clipboard
  }

  if (pk.field === "end") {
    if (typeof note.endActionId === "number") {
      return {
        type: "end",
        data: {
          endActionId: note.endActionId,
          endVariantSig: String(note.endVariantSig || ""),
        },
      };
    }
    return null; // legacy free-text is readable in UI but never exported to clipboard
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
    return changed;
  }

  return clearMirror();
}

// Write a cell in Interactions (strict stable-ID policy for ouctome/end)
export function setInteractionsCell(model, status, viewDef, r, c, value) {
  const pair = model.interactionsPairs[r];
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

  if (pk.field === "outcome") {
    if (value == null || value === "") {
      if ("outcomeId" in note) delete note.outcomeId;
      if ("result" in note) delete note.result;
      if (Object.keys(note).length === 0) delete model.notes[k];
      mirrorAaPhase0Outcome(model, pair, pk.p);
      return true;
    }
    if (typeof value === "number") {
      note.outcomeId = value;
      if ("result" in note) delete note.result;
      mirrorAaPhase0Outcome(model, pair, pk.p);
      return true;
    }
    // STRICT: reject plain text pastes for Outcome
    if (status?.set)
      status.set(
        "Outcome expects a valid Outcome ID (use the palette or structured paste).",
      );
    else if (status)
      status.textContent =
        "Outcome expects a valid Outcome ID (use the palette or structured paste).";
    return false;
  }

  if (pk.field === "end") {
    if (value == null || value === "") {
      if ("endActionId" in note) delete note.endActionId;
      if ("endVariantSig" in note) delete note.endVariantSig;
      if (Object.keys(note).length === 0) delete model.notes[k];
      return true;
    }
    if (typeof value === "object" && value) {
      if (typeof value.endActionId === "number") {
        note.endActionId = value.endActionId;
        note.endVariantSig = String(value.endVariantSig || "");
        return true;
      }
    }
    // STRICT: reject plain text or malformed objects for End
    if (status?.set)
      status.set(
        "End expects an Action ID (use the palette or structured paste).",
      );
    else if (status)
      status.textContent =
        "End expects an Action ID (use the palette or structured paste).";
    return false;
  }
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
  //   • Wrapped: { type:'outcome'|'end', data:{...} }
  //   • Bare outcome:  { outcomeId } or Number
  //   • Bare end:      { endActionId, endVariantSig? } or Number (→ endActionId)
  //   • Action ref → End: { type:'action', data:{ id } } (map to { endActionId:id })
  const field = String(pk.field || "").toLowerCase(); // 'outcome' | 'end'
  let type = payload?.type ? String(payload.type).toLowerCase() : null;
  let data = payload && typeof payload.data === "object" ? payload.data : null;

  // 1) If missing wrapper or data, wrap from destination field
  if (!type || !data) {
    const bare = payload && !payload.type ? payload : data || payload;
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

  // 3) Bail if the wrapper still doesn't match the destination
  if (
    (field === "outcome" && type !== "outcome") ||
    (field === "end" && type !== "end") ||
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
    wrote = !!setInteractionsCell(model, null, viewDef, r, c, id);
  } else if (field === "end" && type === "end") {
    const eid = Number(data && data.endActionId);
    if (!Number.isFinite(eid)) return false;
    const evs =
      "endVariantSig" in (data || {}) ? String(data.endVariantSig || "") : "";
    wrote = !!setInteractionsCell(model, null, viewDef, r, c, {
      endActionId: eid,
      endVariantSig: evs,
    });
  } else {
    return wrote;
  }

  if (wrote && pk.field === "outcome") {
    const pair = model.interactionsPairs && model.interactionsPairs[r];
    mirrorAaPhase0Outcome(model, pair, pk.p);
  }

  return wrote;
}

// Optional single-cell clear (used by column kinds if needed)
export function clearInteractionsCell(model, viewDef, r, c) {
  const col = viewDef.columns[c];
  if (!col) return false;
  const key = String(col.key || "");
  const pair = model.interactionsPairs[r];
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
  }

  if (!Object.keys(note).length) delete model.notes[k];
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
  function clearField(note, key, pk) {
    if (pk && pk.field === "outcome") {
      if ("outcomeId" in note) {
        delete note.outcomeId;
        cleared++;
      }
      if ("result" in note) {
        delete note.result;
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
      const pair = model.interactionsPairs[r];
      if (!pair) continue;
      for (let c = 0; c < cols.length; c++) {
        const key = String(cols[c].key || "");
        const pk = parsePhaseKey(key);
        if (
          !(
            key === "notes" ||
            (pk && (pk.field === "outcome" || pk.field === "end"))
          )
        )
          continue;
        const k = noteKeyForPair(pair, pk ? pk.p : undefined);
        const note = model.notes[k] || (model.notes[k] = {});
        clearField(note, key, pk);
        if (Object.keys(note).length === 0) delete model.notes[k];
      }
    }
  } else {
    const key = String(viewDef.columns[sel.c]?.key || "");
    const pk = parsePhaseKey(key);
    const isEditable =
      key === "notes" || (pk && (pk.field === "outcome" || pk.field === "end"));
    if (!isEditable) {
      if (status?.set)
        status.set(
          "Nothing to delete here: select an Outcome, End, or Notes cell.",
        );
      else if (status)
        status.textContent =
          "Nothing to delete here: select an Outcome, End, or Notes cell.";
      return;
    }
    for (const r of rows) {
      const pair = model.interactionsPairs[r];
      if (!pair) continue;
      const k = noteKeyForPair(pair, pk ? pk.p : undefined);
      const note = model.notes[k] || (model.notes[k] = {});
      clearField(note, key, pk);
      if (Object.keys(note).length === 0) delete model.notes[k];
    }
  }

  const clearedMsg = cleared
    ? `Cleared ${cleared} entr${cleared === 1 ? "y" : "ies"} in Interactions.`
    : "Nothing to clear.";
  const hint =
    extras && typeof extras.statusHint === "string"
      ? extras.statusHint.trim()
      : "";
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
  return !!(pk && (pk.field === "outcome" || pk.field === "end"));
}
