// mutation-runner.js
// Centralized helper for executing model mutations with consistent side effects.

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

  function runModelMutation(_label, mutate, options = {}) {
    if (typeof mutate !== "function") return undefined;

    const result = mutate();

    const {
      rebuildActionColumns = false,
      invalidateView = false,
      rebuildInteractions = false,
      pruneNotes = false,
      after,
      layout: doLayout = false,
      render: doRender = false,
      status: statusMessage,
    } = options;

    if (resolve(rebuildActionColumns, result)) {
      rebuildActionColumnsFromModifiers?.(model);
      if (invalidateViewDef) invalidateViewDef();
    } else if (resolve(invalidateView, result)) {
      invalidateViewDef?.();
    }

    if (resolve(rebuildInteractions, result)) {
      rebuildInteractionsInPlace?.();
    }

    if (resolve(pruneNotes, result)) {
      pruneNotesToValidPairs?.();
    }

    if (typeof after === "function") {
      after(result);
    }

    if (resolve(doLayout, result)) {
      layout?.();
    }

    if (resolve(doRender, result)) {
      render?.();
    }

    if (statusMessage != null) {
      const message =
        typeof statusMessage === "function" ? statusMessage(result) : statusMessage;
      applyStatus(message);
    }

    return result;
  }

  return { runModelMutation };
}

