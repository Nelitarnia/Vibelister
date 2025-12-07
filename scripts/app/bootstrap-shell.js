import { Ids } from "../data/constants.js";
import { getCoreDomElements, getProjectNameElement } from "./dom-elements.js";
import { bootstrapMenus } from "./menus-bootstrap.js";
import { bootstrapSidebar } from "./sidebar-bootstrap.js";
import { bootstrapTabs } from "./tabs-bootstrap.js";
import { setupChrome } from "./setup-chrome.js";
import { createSettingsController } from "./settings-controller.js";
import { setupViewState } from "./setup-view-state.js";

export function bootstrapShell({ appContext, statusConfig, ids }) {
  const resolvedIds = ids ?? Ids;
  const resolvedStatusConfig = statusConfig ?? { historyLimit: 100 };

  const coreDom = getCoreDomElements();
  const menusDom = bootstrapMenus(resolvedIds);
  const sidebarDom = bootstrapSidebar(resolvedIds);
  const tabsDom = bootstrapTabs(resolvedIds);
  const projectNameEl = getProjectNameElement(resolvedIds);

  const { statusBar, initA11y, wireMenus } = setupChrome({
    statusEl: coreDom.statusEl,
    menusDom,
    statusConfig: resolvedStatusConfig,
  });

  const { openSettingsDialog } = createSettingsController({ statusBar });
  const viewState = setupViewState({ appContext, statusBar });

  function init() {
    if (coreDom.sheet && !coreDom.sheet.hasAttribute("tabindex")) {
      coreDom.sheet.setAttribute("tabindex", "0");
    }
    initA11y();
  }

  function destroy() {
    /* placeholder for shell-specific teardown */
  }

  return {
    dom: { core: coreDom, sidebar: sidebarDom, tabs: tabsDom, projectNameEl },
    statusBar,
    menuItems: menusDom.items,
    viewState,
    openSettingsDialog,
    wireMenus,
    lifecycle: { init, destroy },
  };
}
