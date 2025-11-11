// project-info-controller.js
// Coordinates persistence and UI for project-level notes stored in meta.projectInfo.

function canonicalize(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n?/g, "\n");
}

export function createProjectInfoController(options = {}) {
  const { model, runModelMutation, makeUndoConfig, statusBar } = options;

  function ensureMeta() {
    if (!model) return { projectInfo: "" };
    if (!model.meta || typeof model.meta !== "object") {
      model.meta = {};
    }
    if (typeof model.meta.projectInfo !== "string") {
      model.meta.projectInfo = "";
    } else {
      model.meta.projectInfo = canonicalize(model.meta.projectInfo);
    }
    return model.meta;
  }

  function getProjectInfo() {
    const meta = ensureMeta();
    return meta.projectInfo || "";
  }

  function applyResult(result) {
    if (result && typeof result === "object") return result;
    return { changed: false, value: getProjectInfo(), previous: getProjectInfo() };
  }

  function mutateProjectInfo(normalized) {
    const meta = ensureMeta();
    const previous = canonicalize(meta.projectInfo);
    if (normalized === previous) {
      meta.projectInfo = previous;
      return { changed: false, value: previous, previous };
    }
    meta.projectInfo = normalized;
    return { changed: true, value: normalized, previous };
  }

  function setProjectInfo(nextValue) {
    const normalized = canonicalize(nextValue);

    if (typeof runModelMutation !== "function") {
      const result = mutateProjectInfo(normalized);
      if (result.changed) {
        statusBar?.set?.("Project info updated.");
      } else {
        statusBar?.set?.("No changes to project info.");
      }
      return result;
    }

    const undoOptions = makeUndoConfig
      ? makeUndoConfig({
          label: "Project info",
          includeLocation: false,
          includeColumn: false,
          shouldRecord: (res) => !!res?.changed,
        })
      : {
          label: "Project info",
          includeLocation: false,
          includeColumn: false,
          shouldRecord: (res) => !!res?.changed,
        };

    const result = runModelMutation(
      "Project info",
      () => mutateProjectInfo(normalized),
      {
        undo: undoOptions,
        shouldRecord: (res) => !!res?.changed,
        status: (res) =>
          res?.changed ? "Project info updated." : "No changes to project info.",
      },
    );

    return applyResult(result);
  }

  async function openProjectInfoDialog() {
    try {
      const mod = await import("../ui/project-info.js");
      await mod.openProjectInfoDialog({
        value: getProjectInfo(),
        onSave: async (value) => setProjectInfo(value),
      });
    } catch (err) {
      if (statusBar?.set) {
        statusBar.set("Open project info failed: " + (err?.message || err));
      }
    }
  }

  return {
    getProjectInfo,
    setProjectInfo,
    openProjectInfoDialog,
  };
}
