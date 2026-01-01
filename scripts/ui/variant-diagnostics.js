import { diagnoseVariantsForAction } from "../data/variants/variants.js";

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(7,9,18,.82);z-index:110;" +
    "display:grid;place-items:center;padding:24px;";
  const box = document.createElement("div");
  box.style.cssText =
    "width:min(780px,96vw);max-height:90vh;overflow:auto;background:#0f1320;" +
    "border:1px solid #2e3752;border-radius:14px;" +
    "box-shadow:0 18px 50px rgba(0,0,0,.45);padding:20px;display:flex;" +
    "flex-direction:column;gap:14px;color:#d9e2ff;font-size:13px;";
  overlay.appendChild(box);
  return { overlay, box };
}

function applyButtonStyle(button) {
  Object.assign(button.style, {
    background: "#1e253a",
    border: "1px solid #3a4666",
    color: "#e6ecff",
    borderRadius: "8px",
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: "13px",
    alignSelf: "flex-start",
  });
}

function buildKeyValue(label, value) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;justify-content:space-between;";
  const k = document.createElement("span");
  k.textContent = label;
  k.style.cssText = "opacity:.8;";
  const v = document.createElement("span");
  v.textContent = value;
  v.style.cssText = "font-weight:700;";
  row.append(k, v);
  return row;
}

function buildList(title, items = []) {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;gap:6px;";
  const heading = document.createElement("div");
  heading.textContent = title;
  heading.style.cssText = "font-weight:700;font-size:13px;letter-spacing:0.01em;";
  wrapper.appendChild(heading);
  const list = document.createElement("ul");
  list.style.cssText = "margin:0;padding-left:18px;line-height:1.45;color:#c9d4ff;";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "—";
    list.appendChild(li);
  } else {
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    }
  }
  wrapper.appendChild(list);
  return wrapper;
}

function formatGroupEntry(group) {
  const parts = [];
  const name = group.groupName || "Unnamed group";
  parts.push(`${name} (${group.mode || "EXACT"})`);
  parts.push(`${group.comboCount} combo${group.comboCount === 1 ? "" : "s"}`);
  if (group.required) parts.push("required");
  if (group.truncated) parts.push(`truncated @ ${group.limit}`);
  return parts.join(" — ");
}

export function createVariantDiagnosticsViewer({ model } = {}) {
  let overlay = null;

  function close() {
    if (overlay) overlay.remove();
    overlay = null;
  }

  function trapFocus(container) {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }

  function renderContent(box, { action, diagnostics }) {
    const title = document.createElement("div");
    title.textContent = `Variant diagnostics — ${action?.name || "Action"} (#${action?.id ?? "?"})`;
    title.style.cssText = "font-size:16px;font-weight:700;";
    box.appendChild(title);

    const summary = document.createElement("div");
    summary.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;";
    summary.append(
      buildKeyValue("Candidates", String(diagnostics.candidates ?? "—")),
      buildKeyValue("Yielded", String(diagnostics.yielded ?? "—")),
      buildKeyValue("Constraint pruned", String(diagnostics.constraintPruned ?? 0)),
      buildKeyValue("Cap hit", diagnostics.capsHit ? "Yes" : "No"),
    );
    box.appendChild(summary);

    const modifierRow = buildList("Action mod flags", [
      `Required: ${diagnostics.modifierCounts?.required ?? 0}`,
      `Optional: ${diagnostics.modifierCounts?.optional ?? 0}`,
      `Bypassed: ${diagnostics.modifierCounts?.bypassed ?? 0}`,
    ]);
    modifierRow.style.marginTop = "4px";
    box.appendChild(modifierRow);

    const groupEntries = (diagnostics.groupCombos || []).map(formatGroupEntry);
    box.appendChild(buildList("Groups", groupEntries));

    const variants = diagnostics.variants || [];
    const variantItems = variants.length ? variants : ["—"];
    box.appendChild(buildList("Variants (signatures)", variantItems));

    if (diagnostics.truncatedGroups?.length) {
      const truncated = diagnostics.truncatedGroups.map((g) => {
        const base = g.groupName || `Group ${g.groupId ?? "?"}`;
        return `${base} — ${g.type || "truncated"}${g.limit ? ` @ ${g.limit}` : ""}`;
      });
      box.appendChild(buildList("Truncated groups", truncated));
    }

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close";
    applyButtonStyle(closeButton);
    closeButton.addEventListener("click", close);
    box.appendChild(closeButton);
  }

  function open({ action, diagnostics }) {
    close();
    const { overlay: ov, box } = createOverlay();
    overlay = ov;
    renderContent(box, { action, diagnostics });
    const disposeFocusTrap = trapFocus(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        event.stopPropagation();
        disposeFocusTrap();
        close();
      }
    });
    document.body.appendChild(overlay);
    box.querySelector("button")?.focus();
  }

  function openForAction(action, options = {}) {
    const diagnostics = diagnoseVariantsForAction(action, model, options);
    open({ action, diagnostics });
  }

  return { open, openForAction, close };
}
