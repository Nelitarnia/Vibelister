import { parsePhaseKey } from "../data/utils.js";
import { noteKeyForPair } from "./interactions.js";
import { isBypassRow } from "./interactions-row-classification.js";

function getRelevantColumns(def, options, selection) {
  const cols = Array.isArray(def?.columns) ? def.columns : [];
  const matches = cols
    .map((col, idx) => ({ col, idx, pk: parsePhaseKey(col.key) }))
    .filter(({ pk }) => {
      if (!pk) return false;
      if (pk.field === "outcome") return true;
      if (pk.field === "end") return !!options.includeEnd;
      if (pk.field === "tag") return !!options.includeTag;
      return false;
    });
  if (!selection) return matches;
  if (selection.colsAll) return matches;
  const hasExplicitColumnSelection = selection.cols && selection.cols.size > 0;
  if (hasExplicitColumnSelection)
    return matches.filter(({ idx }) => selection.cols.has(idx));
  return matches;
}

function getActionRecord(model, actionId) {
  if (!Number.isFinite(actionId)) return null;
  return Array.isArray(model?.actions)
    ? model.actions.find((x) => x && x.id === actionId)
    : null;
}

function getActionGroupForAction(cache, model, actionId) {
  if (!Number.isFinite(actionId)) return "";
  if (cache.has(actionId)) return cache.get(actionId);
  const action = getActionRecord(model, actionId);
  const raw =
    typeof action?.actionGroup === "string" ? action.actionGroup.trim() : "";
  const value = raw || "";
  cache.set(actionId, value);
  return value;
}

function getAllowedPhasesForAction(cache, model, actionId) {
  if (!Number.isFinite(actionId)) return null;
  if (cache.has(actionId)) return cache.get(actionId);
  const action = getActionRecord(model, actionId);
  const ids = action?.phases?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    cache.set(actionId, null);
    return null;
  }
  const allowed = new Set();
  for (const p of ids) {
    const num = Number(p);
    if (Number.isFinite(num)) allowed.add(num);
  }
  const result = allowed.size ? allowed : null;
  cache.set(actionId, result);
  return result;
}

function collectRowsForActionId(actionId, totalRows, getPair) {
  const rows = [];
  for (let i = 0; i < totalRows; i++) {
    const pair = getPair?.(i);
    if (pair && pair.aId === actionId) rows.push(i);
  }
  return rows;
}

function collectRowsForActionGroup(
  targetGroup,
  totalRows,
  getPair,
  cache,
  model,
) {
  const rows = [];
  for (let i = 0; i < totalRows; i++) {
    const pair = getPair?.(i);
    if (!pair) continue;
    const actionGroup = getActionGroupForAction(cache, model, pair.aId);
    if (actionGroup && actionGroup === targetGroup) rows.push(i);
  }
  return rows;
}

function collectSelectionActionIds(selection, requestedScope, indexAccess) {
  if (requestedScope !== "selection" || !selection?.rows?.size) return null;
  const ids = new Set();
  for (const row of selection.rows) {
    const pair = indexAccess.getPair(row);
    if (pair && Number.isFinite(pair.aId)) ids.add(pair.aId);
  }
  return ids.size ? Array.from(ids) : null;
}

function hasStructuredNoteValue(note, field) {
  if (!note || typeof note !== "object") return false;
  if (field === "outcome") return "outcomeId" in note;
  if (field === "end") return "endActionId" in note || "endVariantSig" in note;
  if (field === "tag") return Array.isArray(note.tags) && note.tags.length > 0;
  return false;
}

export function buildScopePlan({
  requestedScope,
  selection,
  indexAccess,
  options,
}) {
  const strictManualOnly = !!options?.manualOnlyEvidence;
  const selectionActionIds = collectSelectionActionIds(
    selection,
    requestedScope,
    indexAccess,
  );
  const canReadBypassRows = !!options?.expandReadableBypass;
  const suggestionScope = (() => {
    if (strictManualOnly) return requestedScope;
    if (requestedScope === "project") return "project";
    if (requestedScope === "actionGroup") return "actionGroup";
    if (requestedScope === "action") return "action";
    if (
      requestedScope === "selection" &&
      canReadBypassRows &&
      Array.isArray(selectionActionIds) &&
      selectionActionIds.length === 1
    ) {
      return "project";
    }
    if (requestedScope === "selection" && !indexAccess.includeBypass)
      return "action";
    return requestedScope;
  })();
  const suggestionReason = (() => {
    if (suggestionScope === requestedScope) return "requested";
    if (suggestionScope === "project" && canReadBypassRows)
      return "bypassSelection";
    return "broadened";
  })();
  return {
    requested: { scope: requestedScope, selectionActionIds },
    suggestion: { scope: suggestionScope, reason: suggestionReason },
  };
}

export function createInferenceTargetResolver({
  model,
  selection,
  sel,
  getActiveView,
  viewDef,
}) {
  const actionPhaseCache = new Map();
  const actionGroupCache = new Map();
  const OUT_OF_VIEW_STATUS = "Inference only applies to the Interactions view.";

  function getRows(scope, indexAccess) {
    const totalRows = indexAccess.getRowCount();
    const activeRow =
      Number.isFinite(indexAccess?.activeRow) && indexAccess.activeRow >= 0
        ? indexAccess.activeRow
        : sel.r;
    if (scope === "project") {
      return Array.from({ length: totalRows }, (_, i) => i);
    }
    if (scope === "action" || scope === "actionGroup") {
      const activePair = indexAccess.getPair(activeRow);
      if (!activePair) return [];
      const targetId = activePair.aId;
      if (scope === "actionGroup") {
        const group = getActionGroupForAction(
          actionGroupCache,
          model,
          targetId,
        );
        if (group)
          return collectRowsForActionGroup(
            group,
            totalRows,
            indexAccess.getPair,
            actionGroupCache,
            model,
          );
      }
      return collectRowsForActionId(targetId, totalRows, indexAccess.getPair);
    }
    if (selection?.rows && selection.rows.size) {
      return Array.from(selection.rows).sort((a, b) => a - b);
    }
    return [sel.r];
  }

  function collectTargets(scope, options, indexAccess, rows) {
    if (
      typeof getActiveView === "function" &&
      getActiveView() !== "interactions"
    ) {
      return { targets: [], allowed: false, reason: OUT_OF_VIEW_STATUS };
    }
    const def = typeof viewDef === "function" ? viewDef() : viewDef;
    const resolvedRows = Array.isArray(rows)
      ? rows
      : getRows(scope, indexAccess);
    const columns = getRelevantColumns(
      def,
      options,
      scope === "selection" ? selection : null,
    );
    const targets = [];
    for (const r of resolvedRows) {
      const pair = indexAccess.getPair(r);
      if (!pair) continue;
      const allowedPhases = getAllowedPhasesForAction(
        actionPhaseCache,
        model,
        pair.aId,
      );
      for (const { pk } of columns) {
        if (!pk) continue;
        if (allowedPhases && !allowedPhases.has(pk.p)) continue;
        const key = noteKeyForPair(pair, pk.p);
        const note = model?.notes?.[key];
        targets.push({
          key,
          field: pk.field,
          phase: pk.p,
          note,
          pair,
          row: r,
          action: getActionRecord(model, pair.aId),
          actionGroup: (() => {
            const actionGroup = getActionGroupForAction(
              actionGroupCache,
              model,
              pair.aId,
            );
            if (actionGroup) return actionGroup;
            const strictReadBaselineOnly =
              !!options?.manualOnlyEvidence && !options?.expandReadableBypass;
            if (indexAccess.includeBypass && !strictReadBaselineOnly)
              return "__bypass__";
            return isBypassRow(pair) ? "__bypass__" : "";
          })(),
          allowInferredTargets: !!options?.allowInferredOverwrite,
        });
      }
    }
    return { targets, allowed: true };
  }

  function resolveScopes(options, indexAccess, rowsOrPlan) {
    const rowPlan =
      rowsOrPlan && typeof rowsOrPlan === "object" && !Array.isArray(rowsOrPlan)
        ? rowsOrPlan
        : { requestedRows: rowsOrPlan, suggestionRows: rowsOrPlan };
    const requestedScope = options.scope;
    const { targets, allowed, reason } = collectTargets(
      requestedScope,
      options,
      indexAccess,
      rowPlan.requestedRows,
    );
    const plan = buildScopePlan({
      requestedScope,
      selection,
      indexAccess,
      options,
    });
    if (!allowed) {
      return {
        plan,
        requestedTargets: targets,
        suggestionTargets: targets,
        allowed,
        reason,
      };
    }
    const { targets: broaderTargets, allowed: suggestionAllowed } =
      collectTargets(
        plan.suggestion.scope,
        options,
        indexAccess,
        plan.suggestion.scope === requestedScope
          ? rowPlan.suggestionRows
          : undefined,
      );
    const suggestionTargets = (() => {
      if (!suggestionAllowed) return targets;
      if (plan.suggestion.scope === requestedScope) return broaderTargets;
      const merged = [...targets];
      const seen = new Set(targets.map((item) => `${item.key}:${item.field}`));
      for (const target of broaderTargets) {
        if (!hasStructuredNoteValue(target.note, target.field)) continue;
        const dedupeKey = `${target.key}:${target.field}`;
        if (!seen.has(dedupeKey)) {
          merged.push(target);
          seen.add(dedupeKey);
        }
      }
      return merged;
    })();
    return {
      plan,
      requestedTargets: targets,
      suggestionTargets,
      allowed: true,
    };
  }

  return { getRows, collectTargets, resolveScopes };
}
