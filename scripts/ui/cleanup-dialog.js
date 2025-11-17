// cleanup-dialog.js
// Lightweight overlay that lists cleanup actions and runs analyze/apply passes.

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(7,9,18,.8);z-index:90;display:grid;place-items:center;padding:24px;";
  const box = document.createElement("div");
  box.style.cssText =
    "width:min(720px,96vw);max-height:88vh;overflow:auto;background:#0f1320;border:1px solid #2e3752;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.45);padding:22px;display:flex;flex-direction:column;gap:18px;";
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
  Object.assign(button.style, buttonStyle(options));
}

function getFocusables(container) {
  return Array.from(
    container.querySelectorAll(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute("disabled"));
}

function trapFocus(overlay, box, onClose) {
  function keyHandler(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      const focusables = getFocusables(box);
      if (!focusables.length) return;
      const index = focusables.indexOf(document.activeElement);
      const next = event.shiftKey
        ? (index - 1 + focusables.length) % focusables.length
        : (index + 1) % focusables.length;
      event.preventDefault();
      focusables[next].focus();
    }
  }
  overlay.addEventListener("keydown", keyHandler, true);
  return () => overlay.removeEventListener("keydown", keyHandler, true);
}

function formatActionStatus(entry, applied) {
  if (!entry) return "";
  const issues = Number(entry.candidates) || 0;
  const removed = Number(entry.removed) || 0;
  if (!issues && !applied) return "No issues detected.";
  if (!issues && applied) return removed ? `Removed ${removed}.` : "No changes applied.";
  if (!applied) {
    return issues === 1 ? "1 issue" : `${issues} issues`;
  }
  return removed ? `Removed ${removed} of ${issues}.` : `0 of ${issues} removed.`;
}

export async function openCleanupDialog(options = {}) {
  const { actions = [], onRun } = options;
  return new Promise((resolve) => {
    const { overlay, box } = createOverlay();
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.tabIndex = -1;

    const title = document.createElement("h2");
    title.textContent = "Clean up project";
    title.style.cssText = "margin:0;font-size:20px;font-weight:600;color:#f0f2ff;";

    const description = document.createElement("p");
    description.textContent =
      "Analyze the project for obsolete notes or comments, then apply fixes in one step.";
    description.style.cssText = "margin:0;font-size:14px;color:#9aa4c9;";

    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:14px;";

    const actionState = new Map();

    actions.forEach((action, index) => {
      const row = document.createElement("div");
      row.style.cssText =
        "display:grid;grid-template-columns:auto 1fr;gap:12px;padding:12px 14px;border:1px solid #1f2740;border-radius:10px;background:#11182a;";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `cleanup-${action.id || index}`;
      checkbox.checked = action.defaultSelected !== false;
      checkbox.setAttribute("aria-label", action.label);

      const body = document.createElement("div");
      body.style.cssText = "display:flex;flex-direction:column;gap:6px;";

      const label = document.createElement("label");
      label.setAttribute("for", checkbox.id);
      label.textContent = action.label;
      label.style.cssText = "font-size:15px;font-weight:500;color:#f3f6ff;";

      const detail = document.createElement("p");
      detail.textContent = action.description || "";
      detail.style.cssText = "margin:0;font-size:13px;color:#98a3c6;";

      const status = document.createElement("div");
      status.style.cssText = "font-size:12px;color:#8fa2da;min-height:18px;";

      body.append(label, detail, status);
      row.append(checkbox, body);
      list.appendChild(row);
      actionState.set(action.id, { checkbox, status });
    });

    const summary = document.createElement("div");
    summary.style.cssText = "font-size:13px;color:#c5d1ff;min-height:18px;";

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:10px;";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Close";
    applyButtonStyle(cancelButton);

    const analyzeButton = document.createElement("button");
    analyzeButton.type = "button";
    analyzeButton.textContent = "Analyze";
    applyButtonStyle(analyzeButton, { emphasis: false });

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.textContent = "Apply";
    applyButtonStyle(applyButton, { emphasis: true });

    footer.append(cancelButton, analyzeButton, applyButton);

    box.append(title, description, list, summary, footer);
    document.body.appendChild(overlay);

    const cleanupTrap = trapFocus(overlay, box, close);
    let running = false;
    let lastResult = null;

    function getSelectedIds() {
      const ids = [];
      for (const [id, state] of actionState.entries()) {
        if (state.checkbox?.checked) ids.push(id);
      }
      return ids;
    }

    function updateActionStatuses(result) {
      const map = new Map();
      if (Array.isArray(result?.perAction)) {
        for (const entry of result.perAction) {
          map.set(entry.id, entry);
        }
      }
      for (const [id, state] of actionState.entries()) {
        const entry = map.get(id);
        state.status.textContent = formatActionStatus(entry, !!result?.applied);
      }
    }

    function close(result) {
      cleanupTrap();
      overlay.remove();
      resolve(result ?? lastResult);
    }

    async function runPass(apply = false) {
      if (running) return;
      const ids = getSelectedIds();
      if (!ids.length) {
        summary.textContent = "Select at least one cleanup action.";
        return;
      }
      running = true;
      analyzeButton.disabled = true;
      applyButton.disabled = true;
      cancelButton.disabled = true;
      summary.textContent = apply ? "Applying cleanup…" : "Analyzing cleanup…";
      try {
        const handler = typeof onRun === "function" ? onRun : null;
        const result = handler ? await handler({ actionIds: ids, apply }) : null;
        lastResult = result;
        if (result && typeof result === "object") {
          summary.textContent = result.message || "Cleanup complete.";
          updateActionStatuses(result);
        } else {
          summary.textContent = "Cleanup completed.";
        }
      } catch (error) {
        summary.textContent = error?.message || "Unable to run cleanup.";
      } finally {
        running = false;
        analyzeButton.disabled = false;
        applyButton.disabled = false;
        cancelButton.disabled = false;
      }
    }

    cancelButton.addEventListener("click", () => close(lastResult));
    analyzeButton.addEventListener("click", () => {
      void runPass(false);
    });
    applyButton.addEventListener("click", () => {
      void runPass(true);
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay && !running) {
        close(lastResult);
      }
    });

    requestAnimationFrame(() => {
      overlay.focus();
      const first = getFocusables(box)[0];
      first?.focus();
    });
  });
}
