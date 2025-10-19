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
    cloned.interactionsPairs = [];
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
  } = deps || {};

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
    return result;
  }

  function cancelTransaction(tx) {
    if (!tx) return;
    if (tx === currentTransaction) {
      currentTransaction = tx.parent;
    }
  }

  function runModelMutation(_label, mutate, options = {}) {
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

    return result;
  }

  function runModelTransaction(label, mutate, options = {}) {
    const tx = beginTransaction(label, options);
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

  return {
    runModelMutation,
    beginTransaction,
    commitTransaction,
    runModelTransaction,
    captureModelSnapshot,
  };
}
