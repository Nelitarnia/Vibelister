import { sel } from "./selection.js";
import { basenameNoExt } from "../data/utils.js";
import { createPersistenceController } from "./persistence.js";

export function setupPersistence({
  appContext,
  historyApi,
  viewState,
  statusBar,
  dom,
  closeMenus,
  onModelReset,
}) {
  const { model } = appContext;
  const { clearHistory } = historyApi;
  const { resetAllViewState } = viewState;
  const { projectNameEl } = dom;

  function setProjectNameFromFile(name) {
    const base = basenameNoExt(name);
    if (base) {
      model.meta.projectName = base;
      updateProjectNameWidget();
    }
  }

  function updateProjectNameWidget() {
    const w = projectNameEl;
    if (!w) return;
    if (w.value !== (model.meta?.projectName || ""))
      w.value = model.meta?.projectName || "";
    if (!w._bound) {
      w.addEventListener("input", () => {
        model.meta.projectName = w.value.trim();
      });
      w._bound = true;
    }
  }

  function getSuggestedName() {
    const n = String(model.meta.projectName || "").trim();
    return (n ? n : "project") + ".json";
  }

  const { newProject, openFromDisk, saveToDisk, ensureMinRows, ensureSeedRows, upgradeModelInPlace } =
    createPersistenceController({
      model,
      statusBar,
      clearHistory,
      resetAllViewState,
      sel,
      setActiveView: appContext.setActiveView,
      updateProjectNameWidget,
      setProjectNameFromFile,
      getSuggestedName,
      closeMenus,
      onModelReset,
    });

  return {
    newProject,
    openFromDisk,
    saveToDisk,
    ensureMinRows,
    ensureSeedRows,
    upgradeModelInPlace,
    updateProjectNameWidget,
    setProjectNameFromFile,
    getSuggestedName,
  };
}
