// project-info.js
// Renders the project info dialog with a large textarea for free-form notes.

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(5,8,15,.72);z-index:80;display:grid;place-items:center;padding:24px;";
  const box = document.createElement("div");
  box.style.cssText =
    "width:min(720px,95vw);max-height:86vh;overflow:hidden;background:#0f1320;border:1px solid #2d3652;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:18px;padding:20px;";
  overlay.appendChild(box);
  return { overlay, box };
}

function buttonStyle({ emphasis = false } = {}) {
  return {
    background: emphasis ? "#2d3b62" : "#1e253a",
    border: "1px solid #3a4666",
    color: "#e6ecff",
    borderRadius: "8px",
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: "13px",
  };
}

function applyButtonStyle(button, options) {
  const style = buttonStyle(options);
  Object.assign(button.style, style);
}

function getFocusables(container) {
  return Array.from(
    container.querySelectorAll(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute("disabled"));
}

function trapFocus(overlay, box, onClose) {
  function keyHandler(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      const focusables = getFocusables(box);
      if (!focusables.length) return;
      const index = focusables.indexOf(document.activeElement);
      const next = e.shiftKey
        ? (index - 1 + focusables.length) % focusables.length
        : (index + 1) % focusables.length;
      e.preventDefault();
      focusables[next].focus();
    }
  }
  overlay.addEventListener("keydown", keyHandler, true);
  return () => overlay.removeEventListener("keydown", keyHandler, true);
}

function canonicalize(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n?/g, "\n");
}

export async function openProjectInfoDialog(options = {}) {
  const { value = "", onSave, onClose } = options;

  return new Promise((resolve) => {
    const { overlay, box } = createOverlay();
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.tabIndex = -1;

    const title = document.createElement("h2");
    title.textContent = "Project info";
    title.id = "project-info-title";
    title.style.cssText = "margin:0;font-size:20px;font-weight:600;color:#f0f2ff;";

    const description = document.createElement("p");
    description.textContent =
      "Record collaborators, milestones, or other notes for this project.";
    description.id = "project-info-description";
    description.style.cssText = "margin:0;font-size:14px;color:#9aa4c9;";

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("aria-labelledby", title.id);
    textarea.setAttribute("aria-describedby", description.id);
    textarea.style.cssText =
      "flex:1 1 auto;min-height:260px;border:1px solid #2f3b5c;border-radius:10px;background:#111729;color:#e6ecff;padding:14px;font-size:14px;line-height:1.45;resize:vertical;";

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";

    const message = document.createElement("div");
    message.style.cssText = "color:#ff8f8f;font-size:13px;min-height:18px;";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    applyButtonStyle(cancelButton, { emphasis: false });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    applyButtonStyle(saveButton, { emphasis: true });

    footer.append(cancelButton, saveButton);

    box.append(title, description, textarea, message, footer);
    document.body.appendChild(overlay);

    const cleanupTrap = trapFocus(overlay, box, close);

    const initial = canonicalize(value);
    let saving = false;
    let dirty = false;

    function updateState() {
      const current = canonicalize(textarea.value);
      dirty = current !== initial;
      saveButton.disabled = saving;
      cancelButton.disabled = saving;
    }

    function close(result) {
      cleanupTrap();
      overlay.remove();
      if (typeof onClose === "function") {
        try {
          onClose(result);
        } catch (_) {
          /* ignore close errors */
        }
      }
      resolve(result);
    }

    cancelButton.addEventListener("click", () => close({ saved: false }));

    textarea.addEventListener("input", () => {
      message.textContent = "";
      updateState();
    });

    textarea.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      }
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay && !saving) {
        close({ saved: false });
      }
    });

    async function handleSave() {
      if (saving) return;
      message.textContent = "";
      saving = true;
      updateState();
      try {
        if (typeof onSave === "function") {
          const result = await onSave(textarea.value);
          if (result && result.keepOpen) {
            saving = false;
            updateState();
            return;
          }
        }
        close({ saved: true, value: textarea.value });
      } catch (err) {
        const text = err?.message || err;
        message.textContent = text ? String(text) : "Unable to save.";
        saving = false;
        updateState();
      }
    }

    saveButton.addEventListener("click", () => {
      void handleSave();
    });

    updateState();

    requestAnimationFrame(() => {
      overlay.focus();
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
  });
}
