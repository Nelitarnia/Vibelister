// settings.js - modal dialog for user-configurable preferences.

const FALLBACK_DEFAULTS = {
  colors: {
    background: "#0F1115",
    toolbar: "#141822",
    text: "#E6E6E6",
    accent: "#273152",
    cell: "#11151F",
    cellAlt: "#121826",
  },
  variantCaps: {
    variantCapPerAction: 5000,
    variantCapPerGroup: 50000,
  },
};

const COLOR_FIELDS = [
  { key: "background", label: "App background" },
  { key: "toolbar", label: "Toolbar background" },
  { key: "text", label: "Primary text" },
  { key: "accent", label: "Accent color" },
  { key: "cell", label: "Grid cell" },
  { key: "cellAlt", label: "Alternate grid cell" },
];

const CAP_FIELDS = [
  { key: "variantCapPerAction", label: "Variant cap per action" },
  { key: "variantCapPerGroup", label: "Variant cap per group" },
];

function clone(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function normalizeColor(raw, fallback) {
  if (!raw) return fallback;
  let s = String(raw).trim();
  if (!s) return fallback;
  if (s.startsWith("#")) s = s.slice(1);
  s = s.replace(/[^0-9a-fA-F]/g, "");
  if (s.length === 3)
    s = s
      .split("")
      .map((ch) => ch + ch)
      .join("");
  if (s.length !== 6) return fallback;
  return "#" + s.toUpperCase();
}

function mergeSettings(defaults, overrides) {
  const base = clone(defaults);
  const src = overrides && typeof overrides === "object" ? overrides : {};
  const colors = src.colors && typeof src.colors === "object" ? src.colors : {};
  const variantCaps =
    src.variantCaps && typeof src.variantCaps === "object" ? src.variantCaps : {};
  base.colors = base.colors || {};
  COLOR_FIELDS.forEach(({ key }) => {
    base.colors[key] = normalizeColor(colors[key], base.colors[key]);
  });
  base.variantCaps = base.variantCaps || {};
  CAP_FIELDS.forEach(({ key }) => {
    const n = Number(variantCaps[key]);
    const fallback = base.variantCaps[key];
    base.variantCaps[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  });
  return base;
}

function createOverlay() {
  const ov = document.createElement("div");
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:grid;place-items:center;padding:20px;";
  const box = document.createElement("div");
  box.style.cssText =
    "width:min(720px,94vw);max-height:86vh;overflow:hidden;background:#0f1320;border:1px solid #303854;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);padding:18px;display:flex;flex-direction:column;";
  ov.appendChild(box);
  return { ov, box };
}

function buttonStyle({ emphasis = false } = {}) {
  return {
    background: emphasis ? "#2c3a60" : "#1e253a",
    border: "1px solid #3a4666",
    color: "#e6ecff",
    borderRadius: "8px",
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: "13px",
  };
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
      const f = getFocusables(box);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      const next = e.shiftKey
        ? (i - 1 + f.length) % f.length
        : (i + 1) % f.length;
      e.preventDefault();
      f[next].focus();
    }
  }
  overlay.addEventListener("keydown", keyHandler, true);
  return () => overlay.removeEventListener("keydown", keyHandler, true);
}

export async function openSettingsDialog(options = {}) {
  const defaults = mergeSettings(
    FALLBACK_DEFAULTS,
    options.defaults || FALLBACK_DEFAULTS,
  );
  let working = mergeSettings(defaults, options.settings || defaults);

  const { ov, box } = createOverlay();
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.tabIndex = -1;

  const colorInputs = new Map();
  const hexInputs = new Map();
  const capInputs = new Map();

  function refreshFields() {
    COLOR_FIELDS.forEach(({ key }) => {
      const value = working.colors[key] || defaults.colors[key];
      const colorEl = colorInputs.get(key);
      const hexEl = hexInputs.get(key);
      if (colorEl) colorEl.value = value;
      if (hexEl) hexEl.value = value;
    });
    CAP_FIELDS.forEach(({ key }) => {
      const value = working.variantCaps[key] ?? defaults.variantCaps[key];
      const capEl = capInputs.get(key);
      if (capEl) capEl.value = value;
    });
  }

  function applyResult(result) {
    if (!result) return;
    if (typeof result.then === "function") {
      result.then((resolved) => {
        if (resolved) {
          working = mergeSettings(defaults, resolved);
          refreshFields();
        }
      });
      return;
    }
    working = mergeSettings(defaults, result);
    refreshFields();
  }

  function applyChange(key, value) {
    const normalized = normalizeColor(value, working.colors[key]);
    if (!normalized) return;
    working.colors[key] = normalized;
    refreshFields();
    if (typeof options.onApply === "function") {
      const payload = options.onApply(clone(working));
      applyResult(payload);
    }
  }

  function applyCapChange(key, value) {
    const n = Number(value);
    const fallback = working.variantCaps[key];
    const normalized = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    working.variantCaps[key] = normalized;
    refreshFields();
    if (typeof options.onApply === "function") {
      const payload = options.onApply(clone(working));
      applyResult(payload);
    }
  }

  function setWorking(next) {
    working = mergeSettings(defaults, next);
    refreshFields();
  }

  function handleReset() {
    if (typeof options.onReset === "function") {
      applyResult(options.onReset());
    } else {
      setWorking(defaults);
    }
  }

  async function handleSave(as = false) {
    if (typeof options.onSave !== "function") return;
    const btns = Array.from(box.querySelectorAll("button"));
    btns.forEach((btn) => btn.setAttribute("disabled", "disabled"));
    try {
      await options.onSave(clone(working), { as });
    } catch (_) {
      /* ignore */
    } finally {
      btns.forEach((btn) => btn.removeAttribute("disabled"));
      refreshFields();
    }
  }

  async function handleLoad() {
    if (typeof options.onLoad !== "function") return;
    try {
      const result = await options.onLoad();
      if (result) setWorking(result);
    } catch (_) {
      /* ignore */
    }
  }

  function close() {
    cleanupTrap();
    if (ov.parentNode) ov.parentNode.removeChild(ov);
  }

  const cleanupTrap = trapFocus(ov, box, close);

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        const v = attrs[k];
        if (k === "style") {
          el.style.cssText += v || "";
          continue;
        }
        if (k === "class") {
          el.className = v || "";
          continue;
        }
        if (k === "text") {
          el.textContent = v || "";
          continue;
        }
        el.setAttribute(k, String(v));
      }
    (children || []).forEach((child) => {
      if (child == null) return;
      if (typeof child === "string")
        el.appendChild(document.createTextNode(child));
      else el.appendChild(child);
    });
    return el;
  }

  const header = h(
    "div",
    { style: "display:flex;align-items:center;gap:12px;margin-bottom:12px;" },
    [
      h("h2", { style: "margin:0;font-size:20px;" }, ["Settings"]),
      h("span", { style: "opacity:0.7;font-size:12px;" }, [
        "Customize interface colors and variant limits.",
      ]),
      h("div", { style: "margin-left:auto;" }, [
        (() => {
          const btn = h("button", { type: "button" }, ["×"]);
          Object.assign(btn.style, buttonStyle());
          btn.style.width = "32px";
          btn.style.height = "32px";
          btn.style.fontSize = "18px";
          btn.style.display = "inline-flex";
          btn.style.alignItems = "center";
          btn.style.justifyContent = "center";
          btn.style.padding = "0";
          btn.onclick = close;
          return btn;
        })(),
      ]),
    ],
  );

  const tabs = h(
    "div",
    {
      style:
        "display:flex;gap:8px;margin-bottom:12px;border-bottom:1px solid #2c3350;padding-bottom:8px;",
    },
    [
      (() => {
        const btn = h("button", { type: "button", class: "settings-tab" }, [
          "UI",
        ]);
        Object.assign(btn.style, buttonStyle({ emphasis: true }));
        btn.style.fontWeight = "600";
        btn.setAttribute("aria-current", "page");
        btn.onclick = () => {
          btn.setAttribute("aria-current", "page");
        };
        return btn;
      })(),
    ],
  );

  const content = h(
    "div",
    {
      style:
        "display:flex;flex-direction:column;gap:16px;background:#10172a;border:1px solid #2d3756;border-radius:12px;padding:16px;flex:1 1 auto;overflow:auto;",
    },
    [],
  );

  const colorSection = h(
    "div",
    { style: "display:flex;flex-direction:column;gap:14px;" },
    [h("h3", { style: "margin:0;font-size:16px;" }, ["UI colors"])],
  );

  COLOR_FIELDS.forEach(({ key, label }) => {
    const row = h(
      "div",
      {
        style:
          "display:grid;grid-template-columns:1fr 110px 120px auto;gap:12px;align-items:center;background:#111c33;padding:10px 12px;border-radius:10px;border:1px solid #253050;",
      },
      [],
    );
    row.appendChild(h("label", { style: "font-size:14px;" }, [label]));

    const colorInput = h("input", { type: "color" }, []);
    colorInputs.set(key, colorInput);
    colorInput.oninput = () => applyChange(key, colorInput.value);
    row.appendChild(colorInput);

    const hexInput = h("input", {
      type: "text",
      value: working.colors[key] || defaults.colors[key],
      style:
        "padding:6px 8px;border-radius:6px;border:1px solid #2d3a58;background:#0b1222;color:#e5ecff;font-family:monospace;",
    });
    hexInputs.set(key, hexInput);
    hexInput.addEventListener("blur", () => applyChange(key, hexInput.value));
    hexInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyChange(key, hexInput.value);
      }
    });
    row.appendChild(hexInput);

    const resetBtn = h("button", { type: "button" }, ["Default"]);
    Object.assign(resetBtn.style, buttonStyle());
    resetBtn.onclick = () => applyChange(key, defaults.colors[key]);
    row.appendChild(resetBtn);

    colorSection.appendChild(row);
  });

  content.appendChild(colorSection);
  const capsSection = h(
    "div",
    {
      style:
        "display:flex;flex-direction:column;gap:12px;background:#111c33;padding:12px;border-radius:10px;border:1px solid #253050;",
    },
    [
      h("h3", { style: "margin:0;font-size:16px;" }, ["Variant caps"]),
      h("p", { style: "margin:0;font-size:13px;color:#9fb3ff;" }, [
        "Set safety caps for variant generation. Higher caps explore more combinations but may slow builds.",
      ]),
    ],
  );

  CAP_FIELDS.forEach(({ key, label }) => {
    const row = h(
      "div",
      {
        style:
          "display:grid;grid-template-columns:1fr 160px auto;gap:12px;align-items:center;",
      },
      [],
    );
    row.appendChild(h("label", { style: "font-size:14px;" }, [label]));

    const capInput = h("input", {
      type: "number",
      min: 1,
      step: 1,
      value: working.variantCaps[key] ?? defaults.variantCaps[key],
      style:
        "padding:6px 8px;border-radius:6px;border:1px solid #2d3a58;background:#0b1222;color:#e5ecff;font-family:monospace;",
    });
    capInputs.set(key, capInput);
    capInput.addEventListener("input", () => applyCapChange(key, capInput.value));
    capInput.addEventListener("blur", () => applyCapChange(key, capInput.value));
    capInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyCapChange(key, capInput.value);
      }
    });
    row.appendChild(capInput);

    const resetBtn = h("button", { type: "button" }, ["Default"]);
    Object.assign(resetBtn.style, buttonStyle());
    resetBtn.onclick = () => applyCapChange(key, defaults.variantCaps[key]);
    row.appendChild(resetBtn);

    capsSection.appendChild(row);
  });

  content.appendChild(capsSection);

  const actions = h(
    "div",
    {
      style:
        "display:flex;flex-wrap:wrap;gap:10px;margin-top:18px;align-items:center;",
    },
    [],
  );

  const fileGroup = h(
    "div",
    { style: "display:flex;flex-wrap:wrap;gap:10px;" },
    [],
  );

  const loadBtn = h("button", { type: "button" }, ["Load Settings…"]);
  Object.assign(loadBtn.style, buttonStyle());
  loadBtn.onclick = () => handleLoad();
  fileGroup.appendChild(loadBtn);

  const saveBtn = h("button", { type: "button" }, ["Save Settings"]);
  Object.assign(saveBtn.style, buttonStyle({ emphasis: true }));
  saveBtn.onclick = () => handleSave(false);
  fileGroup.appendChild(saveBtn);

  const saveAsBtn = h("button", { type: "button" }, ["Save As…"]);
  Object.assign(saveAsBtn.style, buttonStyle());
  saveAsBtn.onclick = () => handleSave(true);
  fileGroup.appendChild(saveAsBtn);

  actions.appendChild(fileGroup);
  actions.appendChild(h("div", { style: "flex:1 1 auto;" }, []));

  const resetAllBtn = h("button", { type: "button" }, ["Reset to defaults"]);
  Object.assign(resetAllBtn.style, buttonStyle());
  resetAllBtn.onclick = handleReset;
  actions.appendChild(resetAllBtn);

  const closeBtn = h("button", { type: "button" }, ["Close"]);
  Object.assign(closeBtn.style, buttonStyle());
  closeBtn.onclick = close;
  actions.appendChild(closeBtn);

  box.appendChild(header);
  box.appendChild(tabs);
  box.appendChild(content);
  box.appendChild(actions);

  document.body.appendChild(ov);
  refreshFields();
  window.requestAnimationFrame(() => {
    const focusables = getFocusables(box);
    (focusables[0] || box).focus();
  });
}
