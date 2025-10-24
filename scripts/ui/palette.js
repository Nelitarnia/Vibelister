import { formatEndActionLabel } from "../data/column-kinds.js";
import { MOD } from "../data/constants.js";
import { sortIdsByUserOrder } from "../data/variants/variants.js";
import {
  getInteractionsPair,
  getInteractionsRowCount,
} from "../app/interactions-data.js";

// palette.js — one elegant, configurable dropdown for stable-ID cells.
//
// Usage in App.js:
//   const palette = initPalette({ ...ctx... });
//   // In beginEdit():
//   if (palette.wantsToHandleCell())
//     palette.openForCurrentCell({ left, top, width }, editor.value);
//
// Modes (built-in):
//   - 'outcome' → for ^p\\d+:outcome$ and legacy 'result'
//   - 'end'     → for ^p\\d+:end$ (Action + optional variant)
//   - 'modifierState' → for Actions view modifier compatibility columns
//
// You can add more modes later by extending MODE_MAP.

const MOD_STATE_OPTIONS = [
  {
    value: MOD.OFF,
    sigil: "✕",
    label: "Off",
    description: "Hide this modifier for the action.",
    keywords: ["off", "0", "disable", "none", "hide", "✕", "x", "cross"],
  },
  {
    value: MOD.ON,
    sigil: "✓",
    label: "On",
    description: "Mark this modifier as compatible.",
    keywords: ["on", "1", "enable", "yes", "show", "active", "✓", "check"],
  },
  {
    value: MOD.BYPASS,
    sigil: "◐",
    label: "Bypass",
    description: "Allow the modifier without filtering by it.",
    keywords: [
      "bypass",
      "2",
      "skip",
      "allow",
      "inherit",
      "optional",
      "◐",
      "partial",
    ],
  },
];

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
    getCellRect,
    HEADER_HEIGHT,
    endEdit,
    moveSelectionForTab,
    moveSelectionForEnter,
  } = ctx;

  // ---------- Helpers shared by modes ----------
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
      testKey: (key) =>
        key === "result" || key === "dualof" || /^p\d+:outcome$/.test(key),
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
      name: "modifierState",
      testKey: (key) => /^mod:\d+$/.test(String(key || "")),
      consumeTyping: false,
      filterFn: () => true,
      domId: "universalPalette",
      parseInitial: () => "",
      parseQuery: (raw) => ({ q: String(raw || "").trim().toLowerCase() }),
      makeItems: (model, parsed, extras = {}) => {
        const q = parsed.q || "";
        const { sel, viewDef } = extras;
        const vd = typeof viewDef === "function" ? viewDef() : null;
        const col = vd?.columns?.[sel?.c];
        const key = String(col?.key || "");
        const id = Number(key.split(":")[1] || NaN);
        const rowIndex = Number(sel?.r);
        const actions = Array.isArray(model?.actions) ? model.actions : [];
        let current = MOD.OFF;
        if (Number.isFinite(rowIndex) && rowIndex >= 0 && rowIndex < actions.length) {
          const row = actions[rowIndex];
          if (row && Number.isFinite(id)) {
            const raw = row.modSet?.[id];
            if (typeof raw === "number") current = raw | 0;
          }
        }
        const lower = q.toLowerCase();
        return MOD_STATE_OPTIONS.filter((opt) => {
          if (!lower) return true;
          return opt.keywords.some((kw) => kw.includes(lower));
        }).map((opt) => ({
          display: opt.sigil ? `${opt.sigil} ${opt.label}` : opt.label,
          description: opt.description,
          data: { value: opt.value },
          isCurrent: opt.value === current,
        }));
      },
      commit: (it) => {
        setCell(sel.r, sel.c, Number(it.data.value));
        render();
      },
      recentKeyOf: (it) => `m:${it.data.value}`,
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
        const seen = new Set();
        const out = [];

        const pairCount = getInteractionsRowCount(model);
        if (pairCount > 0) {
          for (let i = 0; i < pairCount; i++) {
            const p = getInteractionsPair(model, i);
            if (!p) continue;
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
            const variantSig = modIds.length ? modIds.join("+") : "";

            if (mods.length) {
              const lowerMods = modNames.map((s) => s.toLowerCase());
              if (
                !mods.every((tok) => lowerMods.some((nm) => nm.includes(tok)))
              )
                continue;
            }
            const label = formatEndActionLabel(model, act, variantSig);
            const display = label?.plainText || "";
            out.push({
              display,
              displaySegments: Array.isArray(label?.segments)
                ? label.segments
                : null,
              data: {
                endActionId: act.id,
                endVariantSig: variantSig,
              },
            });
          }
        } else {
          // Fallback if no interactionsPairs yet
          for (const aRow of actions) {
            const nm = aRow.name || "";
            if (a && !nm.toLowerCase().startsWith(a)) continue;
            const label = formatEndActionLabel(model, aRow, "");
            out.push({
              display: label?.plainText || "",
              displaySegments: Array.isArray(label?.segments)
                ? label.segments
                : null,
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
    prefillActive: false,
    ownsEditor: false,
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

  function prepareEditorForCell(rect, initialText, opts = {}) {
    if (!editor) return false;
    const { focus = false } = opts || {};
    const wasVisible = editor.style.display !== "none";
    if (rect) {
      editor.style.left = rect.left + "px";
      editor.style.top = rect.top + "px";
      editor.style.width = Math.max(40, rect.width || 0) + "px";
      editor.style.height = (rect.height || 24) + "px";
    }
    if (typeof initialText === "string") {
      try {
        editor.value = initialText;
      } catch (_) {}
    }
    editor.style.display = "block";
    pal.ownsEditor = !wasVisible;
    if (focus) {
      try {
        editor.focus({ preventScroll: true });
      } catch (_) {
        try {
          editor.focus();
        } catch (_) {}
      }
    }
    return true;
  }

  function wantsToHandleCell() {
    const vd = viewDef();
    if (!vd) return false;
    const key = vd.columns?.[sel.c]?.key || "";
    return MODE_MAP.some((m) => m.testKey(String(key)));
  }

  function openForCurrentCell(arg1, arg2, arg3, arg4) {
    const targetArg =
      arg1 && typeof arg1 === "object" &&
      ("r" in arg1 || "c" in arg1 || "initialText" in arg1 || "focusEditor" in arg1)
        ? arg1
        : null;

    const vd = viewDef();
    if (!vd) return false;

    let rowIndex = Number.isFinite(sel?.r) ? sel.r : NaN;
    let colIndex = Number.isFinite(sel?.c) ? sel.c : NaN;
    if (targetArg) {
      if (Number.isFinite(targetArg.r)) rowIndex = targetArg.r;
      if (Number.isFinite(targetArg.c)) colIndex = targetArg.c;
    }

    const key = String(vd.columns?.[colIndex]?.key || "");
    const mode = MODE_MAP.find((m) => m.testKey(key));
    if (!mode) return false;
    ensureDOM();
    pal.mode = mode;
    let left = 0;
    let top = 0;
    let width = 0;
    let initialText = "";
    let rect = null;
    const claimEditor = !!targetArg;
    const focusEditor = targetArg ? targetArg.focusEditor !== false : false;
    if (targetArg) {
      initialText =
        typeof targetArg.initialText === "string"
          ? targetArg.initialText
          : typeof arg2 === "string"
            ? arg2
            : "";
      if (
        typeof getCellRect === "function" &&
        Number.isFinite(rowIndex) &&
        Number.isFinite(colIndex)
      ) {
        rect = getCellRect(rowIndex, colIndex);
      }
      if (rect) {
        left = Number(rect.left) || 0;
        top = Number(rect.top) || 0;
        width = Math.max(200, Number(rect.width) || 0);
      } else {
        left = 0;
        top = HEADER_HEIGHT;
        width = 200;
      }
    } else if (arg1 && typeof arg1 === "object") {
      left = Number(arg1.left) || 0;
      top = Number(arg1.top) || 0;
      width = Number(arg1.width) || 0;
      initialText = typeof arg2 === "string" ? arg2 : "";
    } else {
      left = Number(arg1) || 0;
      top = Number(arg2) || 0;
      width = Number(arg3) || 0;
      initialText = typeof arg4 === "string" ? arg4 : "";
      top += HEADER_HEIGHT;
    }
    width = Math.max(200, width);
    pal.left = left;
    pal.top = top;
    pal.width = width;
    Object.assign(pal.el.style, {
      left: pal.left + "px",
      top: pal.top + "px",
      width: pal.width + "px",
      display: "block",
    });
    pal.isOpen = true;
    pal.showRecent = false;

    if (claimEditor) prepareEditorForCell(rect, initialText, { focus: focusEditor });
    else pal.ownsEditor = false;

    // Initialize query
    const initialQueryRaw = mode.parseInitial(initialText);
    const initialQuery =
      typeof initialQueryRaw === "string"
        ? initialQueryRaw
        : String(initialQueryRaw || "");
    pal.query = initialQuery;
    pal.prefillActive = initialQuery.length > 0;
    if (mode.consumeTyping) {
      try {
        editor.value = "";
      } catch (_) {}
    } else if (editor) {
      const queryText = initialQuery;
      try {
        editor.value = queryText;
      } catch (_) {}
      pal.query = queryText;
      if (editor.select) {
        setTimeout(() => {
          if (!pal.isOpen) return;
          try {
            editor.setSelectionRange(0, editor.value.length);
          } catch (_) {
            try {
              editor.select();
            } catch (_) {}
          }
        }, 0);
      }
    }

    refilter();
    return true;
  }

  function openOutcome(target = {}) {
    const t = target || {};
    const rowIndex = Number.isFinite(t.r) ? t.r : Number.isFinite(sel?.r) ? sel.r : NaN;
    const colIndex = Number.isFinite(t.c) ? t.c : Number.isFinite(sel?.c) ? sel.c : NaN;

    const resolveOutcomeName = (rawId) => {
      const id = Number(rawId);
      if (!Number.isFinite(id)) return "";
      const rows = Array.isArray(model?.outcomes) ? model.outcomes : [];
      const match = rows.find((row) => (row?.id | 0) === (id | 0));
      return match ? match.name || "" : "";
    };

    let initialText =
      typeof t.initialText === "string" ? t.initialText : "";
    if (!initialText) {
      const colKey = t.col?.key || "dualof";
      const fromRow =
        t.row && colKey && typeof t.row[colKey] === "number" ? t.row[colKey] : null;
      const rows = Array.isArray(model?.outcomes) ? model.outcomes : [];
      const modelRow =
        Number.isFinite(rowIndex) && rowIndex >= 0 && rowIndex < rows.length
          ? rows[rowIndex]
          : null;
      const storedId =
        fromRow != null
          ? fromRow
          : modelRow && typeof modelRow[colKey] === "number"
            ? modelRow[colKey]
            : null;
      if (storedId != null) initialText = resolveOutcomeName(storedId);
    }
    if (!initialText && editor) {
      try {
        initialText = editor.value || "";
      } catch (_) {
        initialText = "";
      }
    }

    return openForCurrentCell({
      r: rowIndex,
      c: colIndex,
      initialText,
      focusEditor: true,
    });
  }

  function close() {
    if (!pal.el) return;
    pal.el.style.display = "none";
    pal.isOpen = false;
    pal.items = [];
    pal.selIndex = -1;
    pal.query = "";
    pal.mode = null;
    pal.prefillActive = false;
    if (pal.ownsEditor && editor) {
      editor.style.display = "none";
    }
    pal.ownsEditor = false;
  }

  function refilter() {
    const mode = pal.mode;
    if (!mode) return;
    const parsed = mode.parseQuery(pal.query);
    let items = mode.makeItems(model, parsed, { sel, viewDef, getActiveView });
    items = items || [];
    if (!items.length) pal.selIndex = -1;
    else {
      const preferred = items.findIndex((it) => it && it.isCurrent);
      if (preferred >= 0) pal.selIndex = preferred;
      else if (pal.selIndex < 0 || pal.selIndex >= items.length) pal.selIndex = 0;
    }
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

    const renderSegments = (target, segments, fallback) => {
      if (segments && segments.length) {
        try {
          target.textContent = "";
        } catch (_) {
          /* noop */
        }
        segments.forEach((seg) => {
          if (!seg || typeof seg.text !== "string") {
            return;
          }
          const span = document.createElement("span");
          span.textContent = seg.text;
          if (seg.foreground) span.style.color = seg.foreground;
          target.appendChild(span);
        });
      } else {
        target.textContent = fallback;
      }
    };

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
        item.dataset.index = String(idx);
        item.style.padding = "6px 10px";
        item.style.cursor = "pointer";
        item.className = "pal-item";
        if (it.description) {
          item.style.display = "flex";
          item.style.flexDirection = "column";
          item.style.gap = "2px";
        }
        if (idx === pal.selIndex) {
          item.style.background = "#374151";
          item.setAttribute("aria-selected", "true");
        } else item.removeAttribute("aria-selected");

        const segments = Array.isArray(it.displaySegments)
          ? it.displaySegments
          : null;
        const fallback = typeof it.display === "string" ? it.display : "";
        const ariaLabel = fallback
          || (segments
            ? segments.map((seg) => (seg && seg.text) || "").join("")
            : "");

        if (it.description) {
          const label = document.createElement("div");
          renderSegments(label, segments, fallback);
          label.style.fontWeight = "600";
          const desc = document.createElement("div");
          desc.textContent = it.description;
          desc.style.opacity = "0.72";
          desc.style.fontSize = "11px";
          item.appendChild(label);
          item.appendChild(desc);
        } else {
          renderSegments(item, segments, fallback);
        }

        if (ariaLabel) item.setAttribute("aria-label", ariaLabel);
        else item.removeAttribute("aria-label");

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
    pal.prefillActive = false;
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

    if (pal.prefillActive) {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          pal.prefillActive = false;
          pal.query = "";
          if (!mode.consumeTyping) {
            try {
              editor.value = "";
            } catch (_) {}
          }
          refilter();
          return;
        }
        if (e.key.length === 1) {
          e.preventDefault();
          const ch = e.key;
          pal.prefillActive = false;
          if (mode.consumeTyping) {
            pal.query = ch;
            refilter();
          } else {
            try {
              editor.value = ch;
            } catch (_) {}
            pal.query = ch;
            refilter();
            setTimeout(() => {
              if (!pal.isOpen) return;
              try {
                const pos = editor.value.length;
                editor.setSelectionRange(pos, pos);
              } catch (_) {}
            }, 0);
          }
          return;
        }
      }
      pal.prefillActive = false;
    }

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
      if (n) {
        pick(pal.selIndex >= 0 ? pal.selIndex : 0);
        if (typeof moveSelectionForEnter === "function") {
          moveSelectionForEnter();
        }
      }
      else {
        close();
        endEdit(false);
      }
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      const n = pal.items.length;
      if (n) pick(pal.selIndex >= 0 ? pal.selIndex : 0);
      else {
        close();
        endEdit(false);
      }
      if (typeof moveSelectionForTab === "function") {
        moveSelectionForTab(e.shiftKey);
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
    openOutcome,
    close,
    isOpen: () => pal.isOpen,
  };
}
