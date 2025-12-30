// mutation-runner.js
// Centralized helper for executing model mutations with consistent side effects.

function cloneValue(value, seen = new WeakMap()) {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [key, val] of value.entries()) {
      copy.set(cloneValue(key, seen), cloneValue(val, seen));
    }
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const item of value.values()) {
      copy.add(cloneValue(item, seen));
    }
    return copy;
  }
  if (Array.isArray(value)) {
    const arr = new Array(value.length);
    seen.set(value, arr);
    for (let i = 0; i < value.length; i++) {
      if (i in value) arr[i] = cloneValue(value[i], seen);
    }
    return arr;
  }
  const copy = {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) {
    copy[key] = cloneValue(value[key], seen);
  }
  return copy;
}

function clearBypassDerivedFields(target) {
  if (!target || typeof target !== "object") return;
  delete target.interactionsIndexBypass;
  delete target.interactionsIndexBypassScoped;
  delete target.interactionsIndexBypassCache;
  delete target.interactionsIndexBypassScopedCache;
  delete target.interactionsIndexCache;
  delete target.interactionsIndexScopedCache;
}

export function snapshotModel(model, options = {}) {
  if (!model || typeof model !== "object") {
    throw new Error("snapshotModel requires a model object");
  }

  const {
    includeDerived = true,
    includeNotes = true,
    label,
    attachments,
  } = options || {};
  const cloned = cloneValue(model);

  if (!includeDerived) {
    clearBypassDerivedFields(cloned);
    cloned.interactionsPairs = [];
    const mode =
      cloned.interactionsIndex && cloned.interactionsIndex.mode
        ? cloned.interactionsIndex.mode
        : "AI";
    cloned.interactionsIndex = {
      mode,
      groups: [],
      totalRows: 0,
      actionsOrder: [],
      inputsOrder: [],
      variantCatalog: {},
      propertiesCatalog: [],
    };
  }

  if (!includeNotes) {
    cloned.notes = {};
  }

  if (!Number.isFinite(cloned.nextId)) {
    cloned.nextId = 1;
  }

  const snapshot = { model: cloned };

  if (label != null) snapshot.label = String(label);

  if (attachments && typeof attachments === "object") {
    snapshot.attachments = cloneValue(attachments);
  }

  return snapshot;
}

export function restoreModelSnapshot(target, snapshot) {
  if (!target || typeof target !== "object") return false;
  if (!snapshot || typeof snapshot !== "object") return false;
  const source = snapshot.model;
  if (!source || typeof source !== "object") return false;

  const cloned = cloneValue(source);

  for (const key of Object.keys(target)) {
    if (!Object.prototype.hasOwnProperty.call(cloned, key)) {
      delete target[key];
    }
  }

  for (const key of Object.keys(cloned)) {
    target[key] = cloned[key];
  }

  return true;
}

export function makeMutationRunner(deps) {
  const {
    model,
    rebuildActionColumnsFromModifiers,
    rebuildInteractionsInPlace,
    pruneNotesToValidPairs,
    invalidateViewDef,
    layout,
    render,
    status,
    historyLimit: historyLimitInput,
    onHistoryChange,
  } = deps || {};

  const history = [];
  const future = [];
  const historyLimit = Number.isFinite(historyLimitInput)
    ? Math.max(0, historyLimitInput | 0)
    : 100;

  let renderEpoch = Number.isFinite(model?.meta?.dataVersion)
    ? model.meta.dataVersion
    : Number.isFinite(model?.renderEpoch)
      ? model.renderEpoch
      : 0;

  function syncRenderEpoch() {
    const base = Number.isFinite(model?.meta?.dataVersion)
      ? model.meta.dataVersion
      : Number.isFinite(model?.renderEpoch)
        ? model.renderEpoch
        : renderEpoch;
    renderEpoch = Number.isFinite(base) ? base : 0;
    if (model && typeof model === "object") {
      model.renderEpoch = renderEpoch;
      if (model.meta && typeof model.meta === "object") {
        if (!Number.isFinite(model.meta.dataVersion)) model.meta.dataVersion = renderEpoch;
      }
    }
    return renderEpoch;
  }

  function bumpRenderEpoch() {
    const base = Number.isFinite(model?.meta?.dataVersion)
      ? model.meta.dataVersion
      : Number.isFinite(renderEpoch)
        ? renderEpoch
        : 0;
    const next = base + 1;
    renderEpoch = next;
    if (model && typeof model === "object") {
      model.renderEpoch = next;
      if (model.meta && typeof model.meta === "object") {
        model.meta.dataVersion = next;
      }
    }
    return next;
  }

  syncRenderEpoch();

  function notifyHistoryChange() {
    if (typeof onHistoryChange === "function") {
      try {
        onHistoryChange(getUndoState());
      } catch (_) {
        /* ignore listener errors */
      }
    }
  }

  function createEffectTracker() {
    return {
      rebuildActionColumns: false,
      invalidateView: false,
      rebuildInteractions: false,
      pruneNotes: false,
      layout: false,
      render: false,
      statusMessage: undefined,
    };
  }

  function resolve(effect, result) {
    if (typeof effect === "function") {
      try {
        return !!effect(result);
      } catch (_) {
        return false;
      }
    }
    return !!effect;
  }

  function applyStatus(message) {
    if (!message) return;
    if (typeof status?.set === "function") {
      status.set(message);
      return;
    }
    if (status) status.textContent = message;
  }

  function recordEffects(target, options, result) {
    if (!target || !options) return;

    if (resolve(options.rebuildActionColumns, result)) {
      target.rebuildActionColumns = true;
    } else if (resolve(options.invalidateView, result)) {
      target.invalidateView = true;
    }

    if (resolve(options.rebuildInteractions, result)) {
      target.rebuildInteractions = true;
    }

    if (resolve(options.pruneNotes, result)) {
      target.pruneNotes = true;
    }

    if (resolve(options.layout, result)) {
      target.layout = true;
    }

    if (resolve(options.render, result)) {
      target.render = true;
    }

    if (options.status != null) {
      try {
        const message =
          typeof options.status === "function"
            ? options.status(result)
            : options.status;
        if (message != null) target.statusMessage = message;
      } catch (_) {
        /* swallow status errors */
      }
    }
  }

  function mergeEffects(target, source) {
    if (!target || !source) return;
    target.rebuildActionColumns =
      target.rebuildActionColumns || source.rebuildActionColumns;
    target.invalidateView = target.invalidateView || source.invalidateView;
    target.rebuildInteractions =
      target.rebuildInteractions || source.rebuildInteractions;
    target.pruneNotes = target.pruneNotes || source.pruneNotes;
    target.layout = target.layout || source.layout;
    target.render = target.render || source.render;
    if (source.statusMessage != null)
      target.statusMessage = source.statusMessage;
  }

  function flushEffects(effects, afterCallbacks) {
    if (!effects) return;

    if (effects.rebuildActionColumns) {
      rebuildActionColumnsFromModifiers?.(model);
      if (invalidateViewDef) invalidateViewDef();
    } else if (effects.invalidateView) {
      invalidateViewDef?.();
    }

    if (effects.rebuildInteractions) {
      rebuildInteractionsInPlace?.();
    }

    if (effects.pruneNotes) {
      pruneNotesToValidPairs?.();
    }

    if (Array.isArray(afterCallbacks) && afterCallbacks.length) {
      for (const fn of afterCallbacks) {
        try {
          fn();
        } catch (_) {
          /* ignore after-callback errors */
        }
      }
    }

    if (effects.layout) {
      layout?.();
    }

    if (effects.render) {
      bumpRenderEpoch();
      render?.();
    }

    if (effects.statusMessage != null) {
      applyStatus(effects.statusMessage);
    }
  }

  let currentTransaction = null;

  function beginTransaction(label, options = {}) {
    const tx = {
      label,
      options: options || {},
      effects: createEffectTracker(),
      after: [],
      parent: currentTransaction,
    };
    currentTransaction = tx;
    return tx;
  }

  function commitTransaction(tx, result, overrides) {
    if (!tx) return result;
    if (tx !== currentTransaction) {
      throw new Error("commitTransaction called out of order");
    }

    currentTransaction = tx.parent;

    const baseOptions = tx.options || {};
    const mergedOptions =
      overrides && overrides !== baseOptions
        ? { ...baseOptions, ...overrides }
        : baseOptions;

    const afterCallbacks = Array.isArray(tx.after) ? tx.after.slice() : [];
    if (mergedOptions && typeof mergedOptions.after === "function") {
      afterCallbacks.push(() => mergedOptions.after(result));
    }

    recordEffects(tx.effects, mergedOptions, result);

    if (tx.parent) {
      mergeEffects(tx.parent.effects, tx.effects);
      if (!Array.isArray(tx.parent.after)) tx.parent.after = [];
      if (afterCallbacks.length) tx.parent.after.push(...afterCallbacks);
      return result;
    }

    flushEffects(tx.effects, afterCallbacks);
    finalizeTransactionUndo(tx, result);
    return result;
  }

  function cancelTransaction(tx) {
    if (!tx) return;
    if (tx === currentTransaction) {
      currentTransaction = tx.parent;
    }
  }

  function beginUndoableTransaction(label, options = {}) {
    const tx = beginTransaction(label, options);
    if (!tx) return null;
    if (!tx.parent) {
      tx.undoContext = prepareUndoContext(label, options, true);
    }
    let settled = false;
    return {
      commit(result, overrides) {
        if (settled) return result;
        settled = true;
        return commitTransaction(tx, result, overrides);
      },
      cancel() {
        if (settled) return;
        settled = true;
        cancelTransaction(tx);
      },
    };
  }

  function normalizeUndoOptions(label, undoOptions) {
    if (!undoOptions) return null;
    let config = null;
    if (undoOptions === true) config = {};
    else if (typeof undoOptions === "string") config = { label: undoOptions };
    else if (typeof undoOptions === "function") config = { label: undoOptions };
    else if (typeof undoOptions === "object") config = { ...undoOptions };
    if (!config) return null;
    if (!config.label) config.label = label || "change";
    const shouldRecord =
      typeof config.shouldRecord === "function"
        ? config.shouldRecord
        : () => true;
    const captureAttachments =
      typeof config.captureAttachments === "function"
        ? config.captureAttachments
        : null;
    const applyAttachments =
      typeof config.applyAttachments === "function"
        ? config.applyAttachments
        : null;
    const makeStatus =
      typeof config.makeStatus === "function"
        ? config.makeStatus
        : ({ direction, label: lbl }) =>
            direction === "undo"
              ? `Undid ${lbl || "change"}.`
              : `Redid ${lbl || "change"}.`;
    const snapshotOptions =
      config.snapshotOptions && typeof config.snapshotOptions === "object"
        ? { ...config.snapshotOptions }
        : undefined;
    return {
      label: config.label,
      shouldRecord,
      captureAttachments,
      applyAttachments,
      makeStatus,
      snapshotOptions,
    };
  }

  function prepareUndoContext(label, options, force = false) {
    const undoConfig = normalizeUndoOptions(label, options?.undo);
    if (!undoConfig) return null;
    if (currentTransaction && !force) return null;
    let beforeSnapshot = null;
    let beforeAttachments = null;
    try {
      beforeSnapshot = captureModelSnapshot(undoConfig.snapshotOptions);
      if (undoConfig.captureAttachments)
        beforeAttachments = undoConfig.captureAttachments("before", {
          label: undoConfig.label,
        });
    } catch (_) {
      beforeSnapshot = null;
      beforeAttachments = null;
    }
    return {
      config: undoConfig,
      beforeSnapshot,
      beforeAttachments,
      fallbackLabel: label,
    };
  }

  function finalizeUndoContext(context, result) {
    if (!context) return;
    const { config, beforeSnapshot, beforeAttachments, fallbackLabel } = context;
    if (!beforeSnapshot || typeof config?.shouldRecord !== "function") return;

    let afterSnapshot = null;
    let afterAttachments = null;
    let label =
      typeof config.label === "function"
        ? config.label(result, {
            beforeAttachments,
            fallbackLabel,
          })
        : config.label;
    if (!label) label = fallbackLabel || "change";
    const ctx = {
      label,
      result,
      beforeAttachments,
    };
    if (!config.shouldRecord(result, ctx)) return;
    try {
      afterSnapshot = captureModelSnapshot(config.snapshotOptions);
      if (config.captureAttachments)
      afterAttachments = config.captureAttachments("after", ctx);
    } catch (_) {
      afterSnapshot = null;
    }
    if (!afterSnapshot) return;

    ctx.afterAttachments = afterAttachments;

    const entry = {
      label,
      beforeSnapshot,
      afterSnapshot,
      beforeAttachments,
      afterAttachments,
      applyAttachments: config.applyAttachments,
      makeStatus: config.makeStatus,
      context: ctx,
    };
    history.push(entry);
    if (historyLimit > 0 && history.length > historyLimit) {
      history.splice(0, history.length - historyLimit);
    }
    future.length = 0;
    notifyHistoryChange();
  }

  function finalizeTransactionUndo(tx, result) {
    if (!tx?.undoContext) return;
    finalizeUndoContext(tx.undoContext, result);
    tx.undoContext = null;
  }

  function runModelMutation(_label, mutate, options = {}) {
    const undoContext = prepareUndoContext(_label, options);
    if (typeof mutate !== "function") return undefined;

    const result = mutate();

    if (currentTransaction) {
      recordEffects(currentTransaction.effects, options, result);
      if (typeof options.after === "function") {
        currentTransaction.after.push(() => options.after(result));
      }
      return result;
    }

    const effects = createEffectTracker();
    const afterCallbacks = [];
    if (typeof options.after === "function") {
      afterCallbacks.push(() => options.after(result));
    }

    recordEffects(effects, options, result);
    flushEffects(effects, afterCallbacks);

    finalizeUndoContext(undoContext, result);

    return result;
  }

  function runModelTransaction(label, mutate, options = {}) {
    const tx = beginTransaction(label, options);
    if (!tx.parent) {
      tx.undoContext = prepareUndoContext(label, options, true);
    }
    let result;
    try {
      result = typeof mutate === "function" ? mutate() : undefined;
    } catch (err) {
      cancelTransaction(tx);
      throw err;
    }
    return commitTransaction(tx, result);
  }

  function captureModelSnapshot(options) {
    return snapshotModel(model, options);
  }

  function getUndoState() {
    return {
      canUndo: history.length > 0,
      canRedo: future.length > 0,
      undoLabel: history.length ? history[history.length - 1].label || "" : "",
      redoLabel: future.length ? future[future.length - 1].label || "" : "",
    };
  }

  function performUndoLike(entry, direction) {
    if (!entry) return false;
    const snapshot = direction === "undo" ? entry.beforeSnapshot : entry.afterSnapshot;
    const restored = restoreModelSnapshot(model, snapshot);
    if (!restored) return false;

    if (direction === "undo") future.push(entry);
    else history.push(entry);

    if (typeof entry.applyAttachments === "function") {
      const attachments = direction === "undo"
        ? entry.beforeAttachments
        : entry.afterAttachments;
      try {
        entry.applyAttachments(attachments, direction, entry.context);
      } catch (_) {
        /* ignore attachment errors */
      }
    }

    syncRenderEpoch();
    invalidateViewDef?.();
    layout?.();
    bumpRenderEpoch();
    render?.();

    try {
      const message = entry.makeStatus?.({
        direction,
        label: entry.label,
        context: entry.context,
      });
      applyStatus(message);
    } catch (_) {
      /* ignore status errors */
    }

    notifyHistoryChange();
    return true;
  }

  function undo() {
    if (!history.length) {
      applyStatus("Nothing to undo.");
      return false;
    }
    const entry = history.pop();
    const worked = performUndoLike(entry, "undo");
    if (!worked && entry) future.push(entry);
    return worked;
  }

  function redo() {
    if (!future.length) {
      applyStatus("Nothing to redo.");
      return false;
    }
    const entry = future.pop();
    const worked = performUndoLike(entry, "redo");
    if (!worked && entry) history.push(entry);
    return worked;
  }

  function clearHistory() {
    history.length = 0;
    future.length = 0;
    notifyHistoryChange();
  }

  return {
    runModelMutation,
    beginUndoableTransaction,
    beginTransaction,
    commitTransaction,
    runModelTransaction,
    captureModelSnapshot,
    getUndoState,
    undo,
    redo,
    clearHistory,
  };
}
