// views.js — view schemas and column builders (pure-ish)

import { PHASE_CAP } from "../data/constants.js";
import { getPhaseLabel } from "../data/utils.js";

export const VIEWS = {
  actions: {
    key: "actions",
    title: "Actions",
    columns: [
      { key: "name", title: "Action Name", width: 240, kind: "text" },
      { key: "phases", title: "Phases", width: 220, kind: "phases" },
      { key: "color", title: "Color", width: 60, kind: "color" },
      { key: "notes", title: "Other Notes", width: 480, kind: "text" },
    ],
  },
  inputs: {
    key: "inputs",
    title: "Inputs",
    columns: [
      { key: "name", title: "Input Name", width: 240, kind: "text" },
      { key: "color", title: "Color", width: 60, kind: "color" },
      { key: "notes", title: "Other Notes", width: 480, kind: "text" },
    ],
  },
  modifiers: {
    key: "modifiers",
    title: "Modifiers",
    columns: [
      { key: "name", title: "Modifier Name", width: 240, kind: "text" },
      { key: "color", title: "Color", width: 60, kind: "color" },
      { key: "notes", title: "Notes", width: 480, kind: "text" },
    ],
  },
  outcomes: {
    key: "outcomes",
    title: "Outcomes",
    columns: [
      { key: "name", title: "Outcome Name", width: 240, kind: "text" },
      { key: "color", title: "Color", width: 60, kind: "color" },
	  { key: "mirrored", title: "Mirrored?", width: 80, kind: "checkbox" },
	  { key: "dualof", title: "Dual Of", width: 100, kind: "refPick", entity: "outcome"},
      { key: "notes", title: "Notes", width: 480, kind: "text" },
    ],
  },
  interactions: {
    key: "interactions",
    title: "Interactions",
    columns: [
      { key: "action", title: "Action Name", width: 220, kind: "refRO", entity: "action"},
      { key: "inputId", title: "Input", width: 180, kind: "refRO", entity: "input", hiddenWhen: "AA"},
	  { key: "rhsActionId", title: "Action As Input", width: 220, kind: "refRO", entity: "action", hiddenWhen: "AI"},
      // phase columns are injected at runtime by buildInteractionPhaseColumns()
      { key: "notes", title: "Notes", width: 480, kind: "interactions"},
    ],
  },
};

// Rebuild Actions view columns to include one tri-state column per modifier
export function rebuildActionColumnsFromModifiers(model){
  const left = [
    { key: "name", title: "Action Name", width: 240, kind: "text" },
    { key: "phases", title: "Phases", width: 220, kind: "phases" },
    { key: "color", title: "Color", width: 60, kind: "color" },
  ];
  const mods = (model.modifiers || [])
    .filter(m => (m.name || "").trim())
    .map(m => ({ key: `mod:${m.id}`, title: m.name, width: 90, isMod: true, modId: m.id, kind: "modTriState" }));
  const right = [{ key: "notes", title: "Other Notes", width: 480, kind: "text" }];
  VIEWS.actions.columns = left.concat(mods, right);
}

function computePhaseMax(model){
  let maxP = 0;
  for (const a of model.actions){
    const ids = a && a.phases && Array.isArray(a.phases.ids) ? a.phases.ids : [];
    for (let i=0;i<ids.length;i++){
      const p = Number(ids[i]);
      if (Number.isFinite(p)) maxP = Math.max(maxP, p);
    }
  }
  return Math.min(Math.max(0, maxP), PHASE_CAP);
}

// Pure builder: returns the full columns array for the Interactions view
export function buildInteractionPhaseColumns(model, selectedRowIndex = 0){
  const base = [
    { key: "action", title: "Action Name", width: 220, kind: "refRO", entity: "action" },
	{ key: "inputId", title: "Input", width: 180, kind: "refRO", entity: "input", hiddenWhen: "AA"},
	{ key: "rhsActionId", title: "Action As Input", width: 220, kind: "refRO", entity: "action", hiddenWhen: "AI"},
  ];
  const phases = [];
  const selPair = model.interactionsPairs[selectedRowIndex];
  const selAction = selPair ? model.actions.find(x => x.id === selPair.aId) : null;
  const maxPhase = computePhaseMax(model);
  for (let p = 0; p <= maxPhase; p++) {
    phases.push({ key: `p${p}:outcome`, title: `P${p}: Outcome`, width: 78, kind: "interactions" });
    let endTitle = `P${p}: End`;
    const lbl = getPhaseLabel(selAction, p);
    if (lbl) endTitle = `${endTitle} — ${lbl}`;
    phases.push({ key: `p${p}:end`, title: endTitle, width: 220, kind: "interactions" });
  }
  const tail = [{ key: "notes", title: "Notes", width: 360, kind: "interactions" }];
  return base.concat(phases, tail);
}

export function viewCapabilities(viewKey){
  const base = { canReorderRows:false, canDeleteRows:false, hasHorizontalClear:false };
  if (viewKey === 'interactions') return { ...base, hasHorizontalClear:true };
  return { ...base, canReorderRows:true, canDeleteRows:true };
}
