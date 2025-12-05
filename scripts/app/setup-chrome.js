import { initMenus } from "../ui/menus.js";
import { initStatusBar } from "../ui/status.js";

export function setupChrome({ statusEl, menusDom, statusConfig }) {
  const statusBar = initStatusBar(statusEl, statusConfig);

  function initA11y() {
    statusBar?.ensureLiveRegion();
  }

  function wireMenus(menuDeps) {
    return initMenus({ ...menuDeps, dom: menusDom });
  }

  return { statusBar, initA11y, wireMenus };
}
