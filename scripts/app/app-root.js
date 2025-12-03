import { createInitialModel } from "./model-init.js";

export function createAppContext() {
  const model = createInitialModel();
  const state = {
    activeView: "actions",
    paletteAPI: null,
    menusAPI: null,
    sidePanelHost: null,
    commentsUI: null,
    tagManager: null,
    tagUI: null,
    interactionTools: null,
    toggleInteractionToolsPane: null,
  };

  const lifecycle = {
    init: null,
    destroy: null,
    setActiveView: null,
    cycleView: null,
    toggleInteractionsMode: null,
  };

  return {
    model,
    state,
    getActiveView: () => state.activeView,
    setActiveView: (key) => lifecycle.setActiveView?.(key),
    cycleView: (direction) => lifecycle.cycleView?.(direction),
    toggleInteractionsMode: () => lifecycle.toggleInteractionsMode?.(),
    init: () => lifecycle.init?.(),
    destroy: () => lifecycle.destroy?.(),
    setLifecycle: (helpers = {}) => Object.assign(lifecycle, helpers),
  };
}
