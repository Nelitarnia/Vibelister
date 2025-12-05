export function createGridCells({
  viewDef,
  dataArray,
  kindCtx,
  state,
  model,
  runModelMutation,
  setCellForKind,
  getCellForKind,
  makeRow,
  parsePhasesSpec,
  setCommentInactive,
  emitCommentChangeEvent,
  rebuildInteractionsInPlace,
  getStructuredForKind,
  applyStructuredForKind,
  getActiveView,
  makeGetStructuredCell,
  makeApplyStructuredCell,
  isCanonicalStructuredPayload,
  MOD_STATE_ID,
}) {
  function isModColumn(c) {
    return !!c && typeof c.key === "string" && c.key.startsWith("mod:");
  }

  function modIdFromKey(k) {
    const s = String(k || "");
    const i = s.indexOf(":");
    return i >= 0 ? Number(s.slice(i + 1)) : NaN;
  }

  function isModStateBypassed(row, col) {
    if (!row || !col) return false;
    const id = modIdFromKey(col.key);
    if (!Number.isFinite(id)) return false;
    const raw = row?.modSet?.[id];
    return Number(raw) === MOD_STATE_ID.BYPASS;
  }

  function getCell(r, c) {
    const vd = viewDef();
    const col = vd.columns[c];
    if (state.activeView === "interactions") {
      const k = String(col?.kind || "");
      if (k === "interactions") {
        return getCellForKind("interactions", kindCtx({ r, c, col, row: null }));
      }
      if (k) {
        return getCellForKind(k, kindCtx({ r, c, col, row: null }));
      }
      return getCellForKind("interactions", kindCtx({ r, c, col, row: null }));
    }
    if (col && col.kind) {
      const arr = dataArray();
      const row = arr ? arr[r] : null;
      return getCellForKind(col.kind, kindCtx({ r, c, col, row }));
    }
    return "";
  }

  function cellValueToPlainText(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "object") {
      if (typeof value.plainText === "string") return value.plainText;
      if (Array.isArray(value.segments)) {
        return value.segments
          .map((seg) => (seg && seg.text != null ? String(seg.text) : ""))
          .join("");
      }
      if (typeof value.text === "string") return value.text;
      if (typeof value.value === "string") return value.value;
    }
    return "";
  }

  function setCell(r, c, v) {
    const vd = viewDef();
    const col = vd.columns[c];

    let shouldRebuildInteractions = false;
    const result = runModelMutation(
      "setCell",
      () => {
        const commentChanges = [];
        if (state.activeView === "interactions") {
          const k = String(col?.kind || "interactions");
          const ctx = kindCtx({ r, c, col, row: null, v });
          const wrote = setCellForKind(k, ctx, v);
          return {
            view: "interactions",
            changed: wrote !== false,
            ensuredRows: 0,
            commentChanges,
          };
        }

        const arr = dataArray();
        const beforeLen = arr.length;
        while (arr.length <= r) arr.push(makeRow(model));
        const row = arr[r];

        let changed = false;

        if (col && col.kind) {
          let wasBypassed = null;
          if (col.kind === "modState") {
            wasBypassed = isModStateBypassed(row, col);
          }
          setCellForKind(col.kind, kindCtx({ r, c, col, row, v }), v);
          changed = true;
          if (col.kind === "modState") {
            const isBypassed = isModStateBypassed(row, col);
            if (wasBypassed !== isBypassed) {
              const change = setCommentInactive(model, vd, row, col, isBypassed);
              if (change) {
                commentChanges.push({
                  change,
                  target: { vd, rowIdentity: row, column: col },
                });
              }
              shouldRebuildInteractions = true;
            }
          }
        } else if (state.activeView === "actions" && col?.key === "phases") {
          const before = row?.phases;
          row.phases = parsePhasesSpec(v);
          changed = changed || before !== row?.phases;
        } else if (col?.key) {
          const before = row[col.key];
          if (before !== v) changed = true;
          row[col.key] = v;
        }

        return {
          view: state.activeView,
          changed,
          ensuredRows: arr.length - beforeLen,
          commentChanges,
        };
      },
      {
        layout: (res) => (res?.ensuredRows ?? 0) > 0,
        render: true,
      },
    );
    if (shouldRebuildInteractions) {
      rebuildInteractionsInPlace();
    }
    if (result?.commentChanges?.length) {
      for (const entry of result.commentChanges) {
        if (!entry?.change) continue;
        emitCommentChangeEvent(entry.change, entry.target || {});
      }
    } else if (shouldRebuildInteractions) {
      emitCommentChangeEvent(null, { viewKey: "interactions", force: true });
    }
    return result;
  }

  const getStructuredCell = makeGetStructuredCell({
    viewDef,
    dataArray,
    getStructuredForKind,
    kindCtx,
    getActiveView,
    isCanonical: isCanonicalStructuredPayload,
  });

  const baseApplyStructuredCell = makeApplyStructuredCell({
    viewDef,
    dataArray,
    applyStructuredForKind,
    kindCtx,
    getActiveView,
  });

  function applyStructuredCell(r, c, payload) {
    const vd = viewDef();
    if (!vd) return false;
    const col = vd.columns?.[c];
    const arr = dataArray();
    const row = Array.isArray(arr) ? arr[r] : null;
    let wasBypassed = null;
    if (state.activeView !== "interactions" && col?.kind === "modState" && row) {
      wasBypassed = isModStateBypassed(row, col);
    }
    const applied = baseApplyStructuredCell(r, c, payload);
    if (
      applied &&
      state.activeView !== "interactions" &&
      col?.kind === "modState" &&
      row
    ) {
      const isBypassed = isModStateBypassed(row, col);
      if (wasBypassed !== isBypassed) {
        const change = setCommentInactive(model, vd, row, col, isBypassed);
        rebuildInteractionsInPlace();
        if (change) {
          emitCommentChangeEvent(change, { vd, rowIdentity: row, column: col });
        } else {
          emitCommentChangeEvent(null, {
            vd,
            rowIdentity: row,
            column: col,
            force: true,
            viewKey: "interactions",
          });
        }
      }
    }
    return applied;
  }

  return {
    isModColumn,
    modIdFromKey,
    getCell,
    cellValueToPlainText,
    setCell,
    applyStructuredCell,
    getStructuredCell,
  };
}
