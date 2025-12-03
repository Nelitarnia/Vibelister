import { initMenus } from "../ui/menus.js";

export function initMenusFeature({ ids, getMenuElement, ...actions }) {
  return initMenus({ Ids: ids, getMenuElement, ...actions });
}
