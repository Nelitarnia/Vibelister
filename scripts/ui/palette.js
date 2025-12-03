import { formatEndActionLabel } from "../data/column-kinds.js";
import { MOD } from "../data/constants.js";
import { enumerateModStates } from "../data/mod-state.js";
import { sortIdsByUserOrder } from "../data/variants/variants.js";
import {
  getInteractionsPair,
  getInteractionsRowCount,
} from "../app/interactions-data.js";
import {
  collectInteractionTags,
  normalizeInteractionTags,
} from "../app/interactions.js";

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
//   - 'tag'     → for ^p\\d+:tag$ (Interactions phase tags)
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
    getCellRect,
    HEADER_HEIGHT,
    endEdit,
    moveSelectionForTab,
    moveSelectionForEnter,
    document: docOverride,
  } = ctx;

  const doc = docOverride || globalThis.document;

  // ---------- Helpers shared by modes ----------
  const idsFromSig = (sig) =>
    String(sig || "")
      .split("+")
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);

  const modNamesFromVariantSig = (variantSig) => {
    const ids = sortIdsByUserOrder(idsFromSig(variantSig), model);
    const modRows = Array.isArray(model?.modifiers) ? model.modifiers : [];
    const names = [];
    for (const id of ids) {
      const nm = modRows.find((m) => (m?.id | 0) === (id | 0))?.name;
      const trimmed = typeof nm === "string" ? nm.trim() : "";
      if (trimmed) names.push(trimmed);
    }
    return names;
  };

  const getBaseActionModNames = (rowIndex) => {
    const activeView = typeof getActiveView === "function" ? getActiveView() : "";
    if (activeView !== "interactions") return [];
    const pair = getInteractionsPair(model, rowIndex);
    if (!pair) return [];
    return modNamesFromVariantSig(pair.variantSig || "");
  };

  // Normalize “Action (A+B)” or “Action — A+B” to “Action +A +B”
  const normalizeCellTextToQuery = (s, model = null) => {
    const txt = String(s || "").trim();
    if (!txt) return "";

    const actionNames = new Set();
    if (model && Array.isArray(model.actions)) {
      for (const row of model.actions) {
        const nm = String(row?.name || "").trim();
        if (nm) actionNames.add(nm);
      }
    }
    if (actionNames.has(txt)) return txt;

    let action = txt;
    let modsPart = "";

    const dashIdx = txt.lastIndexOf("—");
    if (dashIdx > -1 && dashIdx < txt.length - 1) {
      action = txt.slice(0, dashIdx).trim();
      modsPart = txt.slice(dashIdx + 1).trim();
    } else if (txt.endsWith(")")) {
      const end = txt.length - 1;
      let depth = 0;
      let start = -1;
      for (let i = end; i >= 0; i--) {
        const ch = txt[i];
        if (ch === ")") {
          depth++;
        } else if (ch === "(") {
          depth--;
          if (depth === 0) {
            start = i;
            break;
          }
        }
      }
      if (start >= 0 && start < end && depth === 0) {
        const before = txt.slice(0, start).trim();
        const candidate = txt.slice(start + 1, end).trim();
        if (before && candidate) {
          action = before;
          modsPart = candidate;
        }
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
      consumeTyping: false,
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
        if (!q) {
          out.push({
            display: "",
            description: "Clear value",
            data: { clear: true },
            skipRecent: true,
          });
        }
        for (const r of rows) {
          const nm = r.name || "";
          if (q && !nm.toLowerCase().startsWith(q)) continue;
          out.push({ display: nm, data: { outcomeId: r.id } });
        }
        return out;
      },
      commit: (it) => {
        if (it?.data?.clear) {
          setCell(sel.r, sel.c, null);
        } else {
          setCell(sel.r, sel.c, Number(it.data.outcomeId));
        }
        render();
      },
      recentKeyOf: (it) => {
        if (it?.data?.clear) return "";
        return `o:${it.data.outcomeId}`;
      },
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
        const descriptor = enumerateModStates(MOD);
        const lower = q.toLowerCase();
        const normalizedQuery = lower.trim();
        return descriptor.states
          .filter((state) => {
            if (!normalizedQuery) return true;
            const haystack = new Set([
              state.label?.toLowerCase() || "",
              state.name?.toLowerCase() || "",
              ...state.keywords,
              ...state.tokens,
            ]);
            for (const kw of haystack) {
              if (kw && kw.includes(normalizedQuery)) return true;
            }
            return false;
          })
          .map((state) => ({
            display: state.glyph ? `${state.glyph} ${state.label}` : state.label,
            description: state.description,
            data: { value: state.value },
            isCurrent: state.value === current,
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
      supportsRecentToggle: true,
      parseInitial: (s) => normalizeCellTextToQuery(s, model),
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

        if (!a && (!mods || !mods.length)) {
          out.push({
            display: "",
            description: "Clear value",
            data: { clear: true },
            skipRecent: true,
          });
        }

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
        if (it?.data?.clear) setCell(sel.r, sel.c, null);
        else setCell(sel.r, sel.c, it.data);
        render();
      },
      recentKeyOf: (it) =>
        it?.data?.clear ? "" : `a:${it.data.endActionId}|${it.data.endVariantSig || ""}`,
    },
    {
      name: "tag",
      testKey: (key) => /^p\d+:tag$/.test(String(key || "")),
      consumeTyping: false,
      filterFn: () => true,
      domId: "universalPalette",
      supportsRecentToggle: true,
      selectTextOnOpen: false,
      parseInitial: (s) => String(s || ""),
      parseQuery: (raw) => {
        const full = String(raw || "");
        const parts = full.split(",");
        const trailingComma = /,\s*$/.test(full);
        const committed = [];
        let activeRaw = "";
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i].trim();
          const isLast = i === parts.length - 1;
          if (isLast && !trailingComma) activeRaw = part;
          else if (part) committed.push(part);
        }
        const baseNormalized = normalizeInteractionTags(committed);
        const typedSource = trailingComma
          ? committed
          : activeRaw
            ? committed.concat(activeRaw)
            : committed;
        const typedNormalized = normalizeInteractionTags(typedSource);
        return {
          full,
          committed,
          activeRaw,
          activeLower: activeRaw.toLowerCase(),
          trailingComma,
          baseNormalized,
          typedNormalized,
        };
      },
      makeItems: (model, parsed) => {
        const typedNormalized = Array.isArray(parsed.typedNormalized)
          ? parsed.typedNormalized
          : [];
        const baseNormalized = Array.isArray(parsed.baseNormalized)
          ? parsed.baseNormalized
          : [];
        const activeRaw = parsed.activeRaw || "";
        const arraysEqual = (a = [], b = []) =>
          a.length === b.length && a.every((value, index) => value === b[index]);
        const typedDisplay = typedNormalized.length
          ? typedNormalized.join(", ")
          : "Clear tags";
        let typedDescription;
        if (typedNormalized.length) {
          if (arraysEqual(typedNormalized, baseNormalized))
            typedDescription = "Keep current tags";
          else if (activeRaw && !parsed.trailingComma)
            typedDescription = `Apply tags, including “${activeRaw}”`;
          else typedDescription = "Apply tags";
        } else {
          typedDescription = baseNormalized.length
            ? "Remove all tags"
            : "No tags assigned";
        }

        const items = [
          {
            display: typedDisplay,
            description: typedDescription,
            data: { tags: typedNormalized },
            isCurrent: arraysEqual(typedNormalized, baseNormalized),
          },
        ];

        const catalog = collectInteractionTags(model) || [];
        if (catalog.length) {
          const skip = new Set(
            typedNormalized.map((tag) => tag.toLowerCase()),
          );
          for (const tag of catalog) {
            const lower = tag.toLowerCase();
            if (skip.has(lower)) continue;
            if (parsed.activeLower && !lower.includes(parsed.activeLower)) continue;
            const nextTags = normalizeInteractionTags([
              ...baseNormalized,
              tag,
            ]);
            items.push({
              display: tag,
              description: baseNormalized.length
                ? `Add tag → ${nextTags.join(", ")}`
                : `Set tag to “${tag}”`,
              data: { tags: nextTags },
            });
          }
        }

        return items;
      },
      commit: (it) => {
        const normalized = normalizeInteractionTags(it?.data?.tags);
        setCell(sel.r, sel.c, normalized);
        render();
      },
      recentKeyOf: (it) => {
        const tags = normalizeInteractionTags(it?.data?.tags);
        return `t:${tags.join("\u0001")}`;
      },
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
    if (!doc?.createElement) return;
    const root = doc.createElement("div");
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
    const ul = doc.createElement("div");
    ul.style.padding = "4px 0";
    root.appendChild(ul);
    pal.el = root;
    pal.listEl = ul;
    editor.parentElement?.appendChild?.(root);
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
    const marginBelowCell = 6;
    const resolveCellHeight = (maybeRect) => {
      const rectHeight = Number(maybeRect?.height);
      if (Number.isFinite(rectHeight) && rectHeight > 0) return rectHeight;
      const editorHeight = Number(editor?.offsetHeight);
      if (Number.isFinite(editorHeight) && editorHeight > 0) return editorHeight;
      return 24;
    };

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
        top = (Number(rect.top) || 0) + resolveCellHeight(rect) + marginBelowCell;
        width = Math.max(200, Number(rect.width) || 0);
      } else {
        left = 0;
        top = HEADER_HEIGHT + resolveCellHeight(rect) + marginBelowCell;
        width = 200;
      }
    } else if (arg1 && typeof arg1 === "object") {
      left = Number(arg1.left) || 0;
      const baseTop = Number(arg1.top) || 0;
      width = Number(arg1.width) || 0;
      top = baseTop + resolveCellHeight(arg1) + marginBelowCell;
      initialText = typeof arg2 === "string" ? arg2 : "";
    } else {
      left = Number(arg1) || 0;
      top = Number(arg2) || 0;
      width = Number(arg3) || 0;
      initialText = typeof arg4 === "string" ? arg4 : "";
      top += HEADER_HEIGHT + resolveCellHeight(null) + marginBelowCell;
    }
    width = Math.max(200, width);
    let finalTop = top;
    if (pal.el) {
      const style = pal.el.style;
      const restoreDisplay = style.display;
      const restoreVisibility = style.visibility;
      if (style.display === "none") {
        style.visibility = "hidden";
        style.display = "block";
      }
      let paletteHeight = pal.el.offsetHeight || pal.el.scrollHeight || 0;
      if (!paletteHeight) {
        const parsedMax = Number.parseFloat(style.maxHeight);
        if (Number.isFinite(parsedMax) && parsedMax > 0) paletteHeight = parsedMax;
      }
      if (style.display !== restoreDisplay) {
        style.display = restoreDisplay;
        style.visibility = restoreVisibility;
      }
      if (paletteHeight) {
        const headerRaw = Number.isFinite(HEADER_HEIGHT)
          ? Number(HEADER_HEIGHT)
          : Number.parseFloat(HEADER_HEIGHT);
        const headerOffset = Number.isFinite(headerRaw) ? headerRaw : 0;
        const offsetParent =
          pal.el.offsetParent || pal.el.parentElement || editor?.parentElement;
        const offsetRect = offsetParent?.getBoundingClientRect?.();
        const offsetTop = Number(offsetRect?.top);
        const hasOffsetRect = Number.isFinite(offsetTop);
        const toLocal = (value) => {
          if (!Number.isFinite(value)) return value;
          if (hasOffsetRect) return value - offsetTop;
          return Number.NaN;
        };
        const sheetRect = sheet?.getBoundingClientRect?.();
        let sheetTopLocal = toLocal(Number(sheetRect?.top));
        let sheetBottomLocal = toLocal(Number(sheetRect?.bottom));
        if (!Number.isFinite(sheetTopLocal)) {
          const fallbackTop = Number(sheet?.offsetTop);
          if (Number.isFinite(fallbackTop)) sheetTopLocal = fallbackTop;
        }
        if (!Number.isFinite(sheetBottomLocal)) {
          const fallbackTop = Number(sheet?.offsetTop);
          const fallbackHeight = Number(sheet?.offsetHeight);
          if (Number.isFinite(fallbackTop) && Number.isFinite(fallbackHeight)) {
            sheetBottomLocal = fallbackTop + fallbackHeight;
          } else if (
            Number.isFinite(sheetTopLocal) &&
            Number.isFinite(fallbackHeight)
          ) {
            sheetBottomLocal = sheetTopLocal + fallbackHeight;
          }
        }
        let minTop = Number.isFinite(sheetTopLocal)
          ? sheetTopLocal
          : Number.NEGATIVE_INFINITY;
        if (!rect) {
          const headerGuard =
            (Number.isFinite(sheetTopLocal) ? sheetTopLocal : 0) +
            Math.max(0, headerOffset || 0);
          if (Number.isFinite(headerGuard)) {
            minTop = Number.isFinite(minTop)
              ? Math.max(minTop, headerGuard)
              : headerGuard;
          }
        }
        if (Number.isFinite(minTop) && finalTop < minTop) {
          finalTop = minTop;
        }
        const paletteHeightLocal = Number(paletteHeight) || 0;
        if (Number.isFinite(sheetBottomLocal) && paletteHeightLocal >= 0) {
          const maxTop = sheetBottomLocal - paletteHeightLocal;
          if (Number.isFinite(maxTop)) {
            const upperBound = Number.isFinite(minTop)
              ? Math.max(minTop, maxTop)
              : maxTop;
            finalTop = Math.min(finalTop, upperBound);
          }
        }
      }
    }
    pal.left = left;
    pal.top = finalTop;
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
      const modePrefersSelection = pal.mode?.selectTextOnOpen !== false;
      const shouldSelectAll =
        modePrefersSelection && claimEditor && queryText.length > 0;
      const canAdjustSelection =
        typeof editor.setSelectionRange === "function" ||
        typeof editor.select === "function" ||
        (editor && "selectionStart" in editor && "selectionEnd" in editor);
      const moveCaretToEnd = () => {
        if (!editor) return;
        try {
          const end = editor.value.length;
          if (typeof editor.setSelectionRange === "function") {
            editor.setSelectionRange(end, end);
          } else {
            editor.selectionStart = end;
            editor.selectionEnd = end;
          }
        } catch (_) {}
      };
      if (canAdjustSelection) {
        setTimeout(() => {
          if (!pal.isOpen) return;
          try {
            if (shouldSelectAll) {
              if (typeof editor.setSelectionRange === "function") {
                editor.setSelectionRange(0, editor.value.length);
                return;
              }
              if (typeof editor.select === "function") {
                editor.select();
                return;
              }
            }
            moveCaretToEnd();
          } catch (_) {
            if (shouldSelectAll && typeof editor.select === "function") {
              try {
                editor.select();
                return;
              } catch (_) {}
            }
            moveCaretToEnd();
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
    pal.showRecent = false;
    pal.prefillActive = false;
    if (pal.ownsEditor && editor) {
      editor.style.display = "none";
    }
    pal.ownsEditor = false;
  }

  function refilter() {
    const mode = pal.mode;
    if (!mode) return;
    if (pal.showRecent) {
      buildRecentItems();
      return;
    }
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
    if (!mode.supportsRecentToggle) {
      pal.showRecent = false;
      return;
    }
    pal.showRecent = true;
    const bag = pal.recent.get(mode.name) || [];
    pal.items = bag.slice(0);
    pal.selIndex = pal.items.length ? 0 : -1;
    renderList(true);
  }

  function updateRecent(item) {
    const mode = pal.mode;
    if (!mode || !mode.recentKeyOf) return;
    if (item?.skipRecent) return;
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
    if (!ul) return;
    ul.innerHTML = "";
    if (!doc?.createElement || !doc.createDocumentFragment) return;
    const frag = doc.createDocumentFragment();

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
          const span = doc.createElement("span");
          span.textContent = seg.text;
          if (seg.foreground) span.style.color = seg.foreground;
          target.appendChild(span);
        });
      } else {
        target.textContent = fallback;
      }
    };

    if (!pal.items.length) {
      const d = doc.createElement("div");
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
        const h = doc.createElement("div");
        h.textContent = "Recent";
        h.style.fontSize = "11px";
        h.style.opacity = "0.75";
        h.style.padding = "4px 10px";
        frag.appendChild(h);
      }
      pal.items.forEach((it, idx) => {
        const item = doc.createElement("div");
        item.dataset.index = String(idx);
        item.style.padding = "6px 10px";
        item.style.cursor = "pointer";
        item.className = "pal-item";
        if (idx === pal.selIndex) {
          item.style.background = "#374151";
          item.setAttribute("aria-selected", "true");
        } else item.removeAttribute("aria-selected");

        const segments = Array.isArray(it.displaySegments)
          ? it.displaySegments
          : null;
        const fallback = typeof it.display === "string" ? it.display : "";
        const hasLabelContent = Boolean(
          (segments && segments.some((seg) => seg && seg.text)) || fallback,
        );
        const ariaLabel =
          fallback
            || (segments
              ? segments.map((seg) => (seg && seg.text) || "").join("")
              : "")
            || (it.description && !hasLabelContent ? it.description : "");

        if (it.description) {
          if (hasLabelContent) {
            item.style.display = "flex";
            item.style.flexDirection = "column";
            item.style.gap = "2px";

            const label = doc.createElement("div");
            renderSegments(label, segments, fallback);
            label.style.fontWeight = "600";
            const desc = doc.createElement("div");
            desc.textContent = it.description;
            desc.style.opacity = "0.72";
            desc.style.fontSize = "11px";
            item.appendChild(label);
            item.appendChild(desc);
          } else {
            const desc = doc.createElement("div");
            desc.textContent = it.description;
            desc.style.opacity = "0.72";
            desc.style.fontSize = "11px";
            item.appendChild(desc);
          }
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
  doc?.addEventListener?.("mousedown", onDocMouseDown, true);

  // Editor input → query (Outcome wants empty editor, End can keep text)
  const onEditorInput = () => {
    if (!pal.isOpen) return;
    const mode = pal.mode;
    if (!mode) return;
    pal.prefillActive = false;
    pal.showRecent = false;
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

    const wantsRecentToggle =
      mode.supportsRecentToggle &&
      !pal.showRecent &&
      e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      (e.code === "Space" || e.key === " ");
    if (wantsRecentToggle) {
      e.preventDefault();
      buildRecentItems();
      return;
    }

    const wantsBaseModHotkey =
      mode.name === "end" &&
      e.shiftKey &&
      !e.metaKey &&
      (e.key === "." || e.key === ">") &&
      ((e.ctrlKey && !e.altKey) || (e.altKey && !e.ctrlKey));
    if (wantsBaseModHotkey) {
      const baseMods = getBaseActionModNames(Number(sel?.r));
      if (baseMods.length) {
        e.preventDefault();
        e.stopPropagation();
        pal.prefillActive = false;
        pal.showRecent = false;
        const current = String(pal.query || "").trim();
        const existing = new Set(
          current
            .split(/\s+/)
            .filter(Boolean)
            .map((tok) => tok.toLowerCase()),
        );
        const modTokens = baseMods
          .map((name) => `+${name}`)
          .filter((tok) => !existing.has(tok.toLowerCase()));
        if (modTokens.length) {
          const nextQuery = current
            ? `${current} ${modTokens.join(" ")}`
            : modTokens.join(" ");
          pal.query = nextQuery;
          if (!mode.consumeTyping && editor) {
            try {
              editor.value = nextQuery;
            } catch (_) {}
          }
          refilter();
          setTimeout(() => {
            if (!pal.isOpen) return;
            try {
              const end = editor.value.length;
              if (typeof editor.setSelectionRange === "function") {
                editor.setSelectionRange(end, end);
              }
            } catch (_) {}
          }, 0);
        }
      }
      return;
    }

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
      renderList(pal.showRecent);
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

  const onEditorKeyUp = (e) => {
    if (!pal.isOpen) return;
    const mode = pal.mode;
    if (!mode) return;
    if (!pal.showRecent) return;
    if (!e.ctrlKey) {
      pal.showRecent = false;
      refilter();
    }
  };
  editor.addEventListener("keyup", onEditorKeyUp, true);

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
