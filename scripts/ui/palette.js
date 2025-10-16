// palette.js — one elegant, configurable dropdown for stable-ID cells.
//
// Usage in App.js:
//   const palette = initPalette({ ...ctx... });
//   // In beginEdit():
//   if (palette.wantsToHandleCell()) palette.openForCurrentCell(left, top, width, editor.value);
//
// Modes (built-in):
//   - 'outcome' → for ^p\\d+:outcome$ and legacy 'result'
//   - 'end'     → for ^p\\d+:end$ (Action + optional variant)
//
// You can add more modes later by extending MODE_MAP.

export function initPalette(ctx) {
  const {
    editor,
    sheet,
    getActiveView,
    viewDef,
    sel,
    model,
    setCell,
    render,
    HEADER_HEIGHT,
    endEdit,
  } = ctx;

  // ---------- Helpers shared by modes ----------
  const sortIdsByUserOrder = (ids, model) => {
    const order = new Map();
    for (let i = 0; i < (model.modifiers || []).length; i++) {
      const id = model.modifiers[i]?.id;
      if (typeof id === "number") order.set(id, i);
    }
    return ids
      .slice()
      .sort((x, y) => (order.get(x) ?? 1e9) - (order.get(y) ?? 1e9));
  };
  const idsFromSig = (sig) =>
    String(sig || "")
      .split("+")
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);

  // Normalize “Action (A+B)” or “Action — A+B” to “Action +A +B”
  const normalizeCellTextToQuery = (s) => {
    const txt = String(s || "").trim();
    if (!txt) return "";
    let action = txt,
      modsPart = "";
    const mParen = txt.match(/^([^()—]+)\s*\(([^)]+)\)\s*$/);
    if (mParen) {
      action = mParen[1].trim();
      modsPart = mParen[2].trim();
    } else {
      const mDash = txt.match(/^([^()—]+)\s*—\s*(.+)$/);
      if (mDash) {
        action = mDash[1].trim();
        modsPart = mDash[2].trim();
      }
    }
    let query = action;
    if (modsPart) {
      const parts = modsPart
        .split(/[+,\s]+/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (parts.length) query += " " + parts.map((p) => "+" + p).join(" ");
    }
    return query;
  };

  // ---------- Mode registry ----------
  const MODE_MAP = [
    {
      name: "outcome",
      testKey: (key) => key === "result" || /^p\d+:outcome$/.test(key),
      consumeTyping: true, // mimic old Outcome behavior
      filterFn: (name, q) => name.toLowerCase().startsWith(q), // startsWith
      domId: "universalPalette", // one element for all modes
      parseInitial: (s) => String(s || ""),
      parseQuery: (raw) => ({
        q: String(raw || "")
          .trim()
          .toLowerCase(),
      }),
      makeItems: (model, parsed) => {
        const q = parsed.q || "";
        const rows = (model.outcomes || []).filter((r) =>
          (r.name || "").trim(),
        );
        const out = [];
        for (const r of rows) {
          const nm = r.name || "";
          if (q && !nm.toLowerCase().startsWith(q)) continue;
          out.push({ display: nm, data: { outcomeId: r.id } });
        }
        return out;
      },
      commit: (it) => {
        setCell(sel.r, sel.c, Number(it.data.outcomeId));
        render();
      },
      recentKeyOf: (it) => `o:${it.data.outcomeId}`,
    },
    {
      name: "end",
      testKey: (key) => /^p\d+:end$/.test(key),
      consumeTyping: false, // editor can hold text if you like
      filterFn: () => true, // filtering handled by parse/makeItems
      domId: "universalPalette",
      parseInitial: normalizeCellTextToQuery,
      parseQuery: (raw) => {
        const s = String(raw || "").trim();
        if (!s) return { a: "", mods: [] };
        const tokens = s.split(/\s+/);
        const mods = [],
          a = [];
        for (let t of tokens) {
          if (t.startsWith("+") && t.length > 1)
            mods.push(t.slice(1).toLowerCase());
          else a.push(t.toLowerCase());
        }
        return { a: a.join(" "), mods };
      },
      makeItems: (model, parsed) => {
        const { a, mods } = parsed;
        const actions = (model.actions || []).filter((x) =>
          (x.name || "").trim(),
        );
        const pairs = Array.isArray(model.interactionsPairs)
          ? model.interactionsPairs
          : [];
        const seen = new Set();
        const out = [];

        if (pairs.length) {
          for (let i = 0; i < pairs.length; i++) {
            const p = pairs[i];
            const key = `${p.aId}|${String(p.variantSig || "")}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const act = actions.find((x) => x.id === p.aId);
            if (!act) continue;
            const actionName = act.name || "";
            if (a && !actionName.toLowerCase().startsWith(a)) continue;

            const modIds = sortIdsByUserOrder(
              idsFromSig(p.variantSig || ""),
              model,
            );
            const modNames = modIds
              .map((id) => model.modifiers.find((m) => m.id === id)?.name || "")
              .filter(Boolean);

            if (mods.length) {
              const lowerMods = modNames.map((s) => s.toLowerCase());
              if (
                !mods.every((tok) => lowerMods.some((nm) => nm.includes(tok)))
              )
                continue;
            }
            const display = modNames.length
              ? `${actionName} — ${modNames.join("+")}`
              : actionName;
            out.push({
              display,
              data: {
                endActionId: act.id,
                endVariantSig: modIds.length ? modIds.join("+") : "",
              },
            });
          }
        } else {
          // Fallback if no interactionsPairs yet
          for (const aRow of actions) {
            const nm = aRow.name || "";
            if (a && !nm.toLowerCase().startsWith(a)) continue;
            out.push({
              display: nm,
              data: { endActionId: aRow.id, endVariantSig: "" },
            });
          }
        }
        return out;
      },
      commit: (it) => {
        setCell(sel.r, sel.c, it.data);
        render();
      },
      recentKeyOf: (it) =>
        `a:${it.data.endActionId}|${it.data.endVariantSig || ""}`,
    },
  ];

  // ---------- DOM + controller ----------
  const pal = {
    el: null,
    listEl: null,
    isOpen: false,
    items: [],
    selIndex: -1,
    left: 0,
    top: 0,
    width: 0,
    mode: null,
    query: "",
    lockHoverUntil: 0,
    // MRU per mode
    recent: new Map(), // modeName -> Array<item>
    showRecent: false,
  };

  function ensureDOM() {
    if (pal.el) return;
    const root = document.createElement("div");
    root.id = "universalPalette";
    Object.assign(root.style, {
      position: "absolute",
      zIndex: "9999",
      display: "none",
      maxHeight: "260px",
      overflowY: "auto",
      minWidth: "200px",
      background: "#1f2937",
      border: "1px solid #374151",
      boxShadow: "0 6px 16px rgba(0,0,0,0.35)",
      borderRadius: "6px",
      fontSize: "12px",
      lineHeight: "1.2",
    });
    root.setAttribute("role", "listbox");
    const ul = document.createElement("div");
    ul.style.padding = "4px 0";
    root.appendChild(ul);
    pal.el = root;
    pal.listEl = ul;
    editor.parentElement.appendChild(root);
  }

  function wantsToHandleCell() {
    const vd = viewDef();
    if (!vd) return false;
    const key = vd.columns?.[sel.c]?.key || "";
    return MODE_MAP.some((m) => m.testKey(String(key)));
  }

  function openForCurrentCell(left, top, width, initialText = "") {
    const vd = viewDef();
    if (!vd) return false;
    const key = String(vd.columns?.[sel.c]?.key || "");
    const mode = MODE_MAP.find((m) => m.testKey(key));
    if (!mode) return false;
    ensureDOM();
    pal.mode = mode;
    pal.left = left;
    pal.top = top + HEADER_HEIGHT;
    pal.width = Math.max(200, width);
    Object.assign(pal.el.style, {
      left: pal.left + "px",
      top: pal.top + "px",
      width: pal.width + "px",
      display: "block",
    });
    pal.isOpen = true;
    pal.showRecent = false;

    // Initialize query
    pal.query = mode.parseInitial(initialText);
    if (mode.consumeTyping) {
      try {
        editor.value = "";
      } catch (_) {}
    }

    refilter();
    return true;
  }

  function close() {
    if (!pal.el) return;
    pal.el.style.display = "none";
    pal.isOpen = false;
    pal.items = [];
    pal.selIndex = -1;
    pal.query = "";
    pal.mode = null;
  }

  function refilter() {
    const mode = pal.mode;
    if (!mode) return;
    const parsed = mode.parseQuery(pal.query);
    let items = mode.makeItems(model, parsed, { sel, viewDef, getActiveView });
    items = items || [];
    if (!items.length) pal.selIndex = -1;
    else if (pal.selIndex < 0 || pal.selIndex >= items.length) pal.selIndex = 0;
    pal.items = items;
    renderList(false);
  }

  function buildRecentItems() {
    const mode = pal.mode;
    if (!mode) return;
    const bag = pal.recent.get(mode.name) || [];
    pal.items = bag.slice(0);
    pal.selIndex = pal.items.length ? 0 : -1;
    renderList(true);
  }

  function updateRecent(item) {
    const mode = pal.mode;
    if (!mode || !mode.recentKeyOf) return;
    const key = mode.recentKeyOf(item);
    if (!key) return;
    const bag = pal.recent.get(mode.name) || [];
    const pruned = bag.filter((x) => mode.recentKeyOf(x) !== key);
    pruned.unshift(item);
    if (pruned.length > 15) pruned.length = 15;
    pal.recent.set(mode.name, pruned);
  }

  function renderList(isRecent = false) {
    const ul = pal.listEl;
    ul.innerHTML = "";
    const frag = document.createDocumentFragment();

    if (!pal.items.length) {
      const d = document.createElement("div");
      d.textContent = "No matches";
      d.style.padding = "6px 10px";
      d.style.opacity = "0.7";
      d.style.cursor = "default";
      d.setAttribute("role", "button");
      d.setAttribute("aria-label", "No matches — close");
      d.onmousedown = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      d.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        close();
        endEdit(false);
      };
      frag.appendChild(d);
    } else {
      if (isRecent) {
        const h = document.createElement("div");
        h.textContent = "Recent";
        h.style.fontSize = "11px";
        h.style.opacity = "0.75";
        h.style.padding = "4px 10px";
        frag.appendChild(h);
      }
      pal.items.forEach((it, idx) => {
        const item = document.createElement("div");
        item.textContent = it.display || "";
        item.dataset.index = String(idx);
        item.style.padding = "6px 10px";
        item.style.cursor = "pointer";
        item.className = "pal-item";
        if (idx === pal.selIndex) {
          item.style.background = "#374151";
          item.setAttribute("aria-selected", "true");
        } else item.removeAttribute("aria-selected");

        item.onmouseenter = () => {
          if (Date.now() < pal.lockHoverUntil) return;
          pal.selIndex = idx;
          renderList(isRecent);
        };
        const commitClick = (e) => {
          e.preventDefault();
          pick(idx);
        };
        item.onmousedown = commitClick;
        item.onclick = commitClick;
        frag.appendChild(item);
      });
    }
    ul.appendChild(frag);
    if (pal.selIndex >= 0 && pal.selIndex < ul.children.length) {
      ul.children[pal.selIndex]?.scrollIntoView?.({ block: "nearest" });
    }
  }

  function pick(idx) {
    if (idx < 0 || idx >= pal.items.length) return;
    const it = pal.items[idx];
    if (!it) return;
    pal.mode.commit(it);
    updateRecent(it);
    close();
    endEdit(false);
  }

  // Outside click (capture)
  const onDocMouseDown = (e) => {
    if (!pal.isOpen) return;
    if (e.target && pal.el && pal.el.contains(e.target)) return;
    close();
    endEdit(false);
  };
  document.addEventListener("mousedown", onDocMouseDown, true);

  // Editor input → query (Outcome wants empty editor, End can keep text)
  const onEditorInput = () => {
    if (!pal.isOpen) return;
    const mode = pal.mode;
    if (!mode) return;
    pal.query = editor.value;
    if (mode.consumeTyping) {
      try {
        editor.value = "";
      } catch (_) {}
    }
    refilter();
  };
  editor.addEventListener("input", onEditorInput);

  // Keyboard
  const onEditorKeyDown = (e) => {
    if (!pal.isOpen) return;
    const mode = pal.mode;
    if (!mode) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      close();
      endEdit(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      const n = pal.items.length;
      if (!n) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      pal.selIndex = ((pal.selIndex < 0 ? 0 : pal.selIndex) + dir + n) % n;
      pal.lockHoverUntil = Date.now() + 120;
      renderList(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      const n = pal.items.length;
      if (n) pick(pal.selIndex >= 0 ? pal.selIndex : 0);
      else {
        close();
        endEdit(false);
      }
      return;
    }

    // Outcome’s classic behavior: synthesize query from keystrokes even if editor is empty
    if (mode.consumeTyping) {
      if (e.key === "Backspace") {
        e.preventDefault();
        pal.query = pal.query.slice(0, -1);
        refilter();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        pal.query += e.key;
        refilter();
        return;
      }
    }
  };
  editor.addEventListener("keydown", onEditorKeyDown, true);

  // Close on scroll
  sheet.addEventListener(
    "scroll",
    () => {
      if (pal.isOpen) {
        close();
        endEdit(false);
      }
    },
    { passive: true },
  );

  return {
    wantsToHandleCell,
    openForCurrentCell,
    close,
    isOpen: () => pal.isOpen,
  };
}
