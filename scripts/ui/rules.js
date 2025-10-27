// rules.js - contains code for the dialog window where you set Modifier rules.

export function openRulesDialog(model) {
  const mods = (model.modifiers || []).filter((m) => (m.name || "").trim());
  const groups = JSON.parse(JSON.stringify(model.modifierGroups || []));
  const cons = JSON.parse(JSON.stringify(model.modifierConstraints || []));

  const sheet = document.getElementById("sheet");
  const status = document.getElementById("status");

  const ov = document.createElement("div");
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;display:grid;place-items:center;";
  const box = document.createElement("div");
  box.style.cssText =
    "width:min(980px,92vw);max-height:86vh;overflow:auto;background:#0f1320;border:1px solid #303854;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.45);padding:14px;";
  ov.appendChild(box);

  // --- modal focus shield & trap ---
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.tabIndex = -1;
  function getFocusables() {
    return Array.from(
      box.querySelectorAll(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled"));
  }
  function focusFirst() {
    const f = getFocusables();
    if (f[0]) {
      f[0].focus();
    } else {
      ov.focus();
    }
  }
  let modalActive = true;
  function keyShield(e) {
    if (!modalActive) return;
    e.stopPropagation();
    if (e.key === "Tab") {
      const f = getFocusables();
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      const ni =
        i < 0
          ? 0
          : e.shiftKey
            ? (i - 1 + f.length) % f.length
            : (i + 1) % f.length;
      e.preventDefault();
      f[ni].focus();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
  }
  ov.addEventListener("keydown", keyShield, true);
  function close() {
    modalActive = false;
    ov.removeEventListener("keydown", keyShield, true);
    if (ov.parentNode) ov.parentNode.removeChild(ov);
    sheet && sheet.focus && sheet.focus();
  }

  function h(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        const v = attrs[k];
        if (k === "style") {
          e.style.cssText += v || "";
          continue;
        }
        if (k === "class") {
          e.className = v || "";
          continue;
        }
        if (v === null || v === undefined) continue;
        if (k === "checked") {
          e.checked = !!v;
          continue;
        }
        if (k === "value") {
          e.value = v;
          continue;
        }
        e.setAttribute(k, String(v));
      }
    (children || []).forEach((ch) => {
      if (typeof ch === "string") e.appendChild(document.createTextNode(ch));
      else if (ch) e.appendChild(ch);
    });
    return e;
  }
  function nameOf(id) {
    const m = (model.modifiers || []).find((x) => x.id === id);
    return (m && m.name) || "mod " + id;
  }

  function render() {
    box.innerHTML = "";
    box.appendChild(h("h2", null, ["Modifier Rules"]));
    const gWrap = h(
      "div",
      {
        style:
          "margin:8px 0;padding:8px;border:1px solid #273052;border-radius:10px;background:#0c1224;",
      },
      [h("h3", null, ["Groups"])],
    );
    groups.forEach((g, gi) => {
      const line = h(
        "div",
        {
          style:
            "display:grid;grid-template-columns:1fr auto auto auto auto;gap:6px;align-items:center;margin:6px 0;padding:6px;border:1px solid #1f2743;border-radius:8px;background:#0b1020;",
        },
        [],
      );
      const name = h("input", {
        value: g.name || "",
        placeholder: "Group name",
        style:
          "background:#0e152b;color:#e6e6e6;border:1px solid #2b3558;border-radius:8px;padding:6px;",
      });
      name.oninput = () => (g.name = name.value);
      const mode = h(
        "select",
        {
          style:
            "background:#0e152b;color:#e6e6e6;border:1px solid #2b3558;border-radius:8px;padding:6px;",
        },
        ["EXACT", "AT_LEAST", "AT_MOST", "RANGE"].map((m) => {
          const o = h("option", null, [m]);
          o.value = m;
          if ((g.mode || "EXACT") === m) o.selected = true;
          return o;
        }),
      );
      mode.onchange = () => {
        g.mode = mode.value;
        render();
      };
      const req = h("label", null, [
        h("input", {
          type: "checkbox",
          checked: g.required ? "checked" : null,
        }),
        document.createTextNode(" required"),
      ]);
      req.querySelector("input").onchange = () => {
        g.required = !!req.querySelector("input").checked;
      };
      const del = h(
        "button",
        {
          style:
            "background:#2a1b1b;border:1px solid #5b2a2a;color:#f5c2c2;border-radius:8px;padding:6px 10px;",
        },
        ["Delete"],
      );
      del.onclick = () => {
        groups.splice(gi, 1);
        render();
      };
      line.appendChild(name);
      line.appendChild(mode);
      const param = h("div", null, []);
      function num(label, prop) {
        const inp = h("input", {
          type: "number",
          value: g[prop] ?? "",
          style:
            "width:80px;background:#0e152b;color:#e6e6e6;border:1px solid #2b3558;border-radius:8px;padding:6px;",
        });
        inp.oninput = () => (g[prop] = Number(inp.value));
        return h(
          "label",
          {
            style:
              "display:inline-flex;gap:6px;align-items:center;margin-left:6px;",
          },
          [label, inp],
        );
      }
      if ((g.mode || "EXACT") === "EXACT") param.appendChild(num("k", "k"));
      else if (g.mode === "AT_LEAST") param.appendChild(num("k≥", "k"));
      else if (g.mode === "AT_MOST") param.appendChild(num("k≤", "k"));
      else if (g.mode === "RANGE") {
        param.appendChild(num("kmin", "kMin"));
        param.appendChild(num("kmax", "kMax"));
      }
      line.appendChild(param);
      line.appendChild(req);
      line.appendChild(del);
      const memHdr = h("div", { style: "grid-column:1/-1;margin-top:6px;" }, [
        h("div", { style: "opacity:.8;margin-bottom:4px;" }, ["Members"]),
      ]);
      const mems = h(
        "div",
        { style: "display:flex;flex-wrap:wrap;gap:8px;" },
        mods.map((m) => {
          const lab = h(
            "label",
            {
              style:
                "display:inline-flex;gap:6px;align-items:center;border:1px solid #1f2743;padding:6px;border-radius:8px;background:#0d1325;",
            },
            [],
          );
          const cb = h("input", {
            type: "checkbox",
            checked: g.memberIds?.includes(m.id) ? "checked" : null,
          });
          cb.onchange = () => {
            g.memberIds = g.memberIds || [];
            const i = g.memberIds.indexOf(m.id);
            if (cb.checked && i < 0) g.memberIds.push(m.id);
            if (!cb.checked && i >= 0) g.memberIds.splice(i, 1);
          };
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(m.name || "mod " + m.id));
          return lab;
        }),
      );
      gWrap.appendChild(line);
      gWrap.appendChild(memHdr);
      gWrap.appendChild(mems);
    });
    const addG = h(
      "button",
      {
        style:
          "margin-top:6px;background:#1b2a1f;border:1px solid #305a3a;color:#cfeacc;border-radius:8px;padding:8px 12px;",
      },
      ["+ Add Group"],
    );
    addG.onclick = () => {
      groups.push({
        id: Date.now() + Math.floor(Math.random() * 999),
        name: "",
        memberIds: [],
        mode: "EXACT",
        k: 1,
        required: false,
      });
      render();
    };
    gWrap.appendChild(addG);
    box.appendChild(gWrap);

    const cWrap = h(
      "div",
      {
        style:
          "margin:8px 0;padding:8px;border:1px solid #273052;border-radius:10px;background:#0c1224;",
      },
      [h("h3", null, ["Constraints"])],
    );
    function modSelect() {
      const s = h(
        "select",
        {
          style:
            "background:#0e152b;color:#e6e6e6;border:1px solid #2b3558;border-radius:8px;padding:6px;",
        },
        mods.map((m) => {
          const o = h("option", null, [m.name || "mod " + m.id]);
          o.value = String(m.id);
          return o;
        }),
      );
      return s;
    }
    const rowRF = h(
      "div",
      {
        style:
          "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0;",
      },
      [],
    );
    const aSel = modSelect(),
      bSel = modSelect();
    const addReq = h(
      "button",
      {
        style:
          "background:#1b2a1f;border:1px solid #305a3a;color:#cfeacc;border-radius:8px;padding:6px 10px;",
      },
      ["+ Requires"],
    );
    addReq.onclick = () => {
      const a = Number(aSel.value),
        b = Number(bSel.value);
      if (a && b && a !== b) {
        cons.push({ type: "REQUIRES", a, b });
        render();
      }
    };
    const addFor = h(
      "button",
      {
        style:
          "background:#2a261b;border:1px solid #5a4a30;color:#f0e0b0;border-radius:8px;padding:6px 10px;",
      },
      ["+ Forbids"],
    );
    addFor.onclick = () => {
      const a = Number(aSel.value),
        b = Number(bSel.value);
      if (a && b && a !== b) {
        cons.push({ type: "FORBIDS", a, b });
        render();
      }
    };
    rowRF.appendChild(aSel);
    rowRF.appendChild(h("span", null, ["→"]));
    rowRF.appendChild(bSel);
    rowRF.appendChild(addReq);
    rowRF.appendChild(addFor);
    cWrap.appendChild(rowRF);

    const mxBox = h(
      "div",
      { style: "display:flex;flex-wrap:wrap;gap:8px;margin:6px 0;" },
      mods.map((m) => {
        const lab = h(
          "label",
          {
            style:
              "display:inline-flex;gap:6px;align-items:center;border:1px solid #1f2743;padding:6px;border-radius:8px;background:#0d1325;",
          },
          [],
        );
        const cb = h("input", { type: "checkbox" });
        cb.dataset.id = String(m.id);
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(m.name || "mod " + m.id));
        return lab;
      }),
    );
    const addMx = h(
      "button",
      {
        style:
          "background:#1b2130;border:1px solid #32426a;color:#d6e0ff;border-radius:8px;padding:6px 10px;",
      },
      ["+ Add MUTEX Set (from selection)"],
    );
    addMx.onclick = () => {
      const ids = [...mxBox.querySelectorAll("input[type=checkbox]")]
        .filter((cb) => cb.checked)
        .map((cb) => Number(cb.dataset.id));
      if (ids.length >= 2) {
        cons.push({ type: "MUTEX", ids });
        render();
      }
    };
    cWrap.appendChild(mxBox);
    cWrap.appendChild(addMx);

    const list = h(
      "div",
      { style: "margin-top:8px;" },
      cons.map((c, ci) => {
        let txt = "";
        if (c.type === "REQUIRES")
          txt = `${nameOf(c.a)} requires ${nameOf(c.b)}`;
        else if (c.type === "FORBIDS")
          txt = `${nameOf(c.a)} forbids ${nameOf(c.b)}`;
        else if (c.type === "MUTEX")
          txt = `Mutex: ${c.ids.map(nameOf).join(", ")}`;
        const row = h(
          "div",
          {
            style:
              "display:flex;justify-content:space-between;align-items:center;border:1px solid #1f2743;padding:6px;border-radius:8px;background:#0d1325;margin:4px 0;",
          },
          [h("div", null, [txt])],
        );
        const rm = h(
          "button",
          {
            style:
              "background:#2a1b1b;border:1px solid #5b2a2a;color:#f5c2c2;border-radius:8px;padding:4px 8px;",
          },
          ["Delete"],
        );
        rm.onclick = () => {
          cons.splice(ci, 1);
          render();
        };
        row.appendChild(rm);
        return row;
      }),
    );
    cWrap.appendChild(list);
    box.appendChild(cWrap);

    const foot = h(
      "div",
      {
        style: "display:flex;gap:8px;justify-content:flex-end;margin-top:8px;",
      },
      [],
    );
    const cancel = h(
      "button",
      {
        style:
          "background:#1b2130;border:1px solid #32426a;color:#d6e0ff;border-radius:8px;padding:8px 14px;",
      },
      ["Close"],
    );
    cancel.onclick = () => close();
    const saveBtn = h(
      "button",
      {
        style:
          "background:#1b2a1f;border:1px solid #305a3a;color:#cfeacc;border-radius:8px;padding:8px 14px;",
      },
      ["Save"],
    );
    saveBtn.onclick = () => {
      // Build a set of valid modifier IDs (guards against stale IDs)
      const validIds = new Set(
        (model.modifiers || []).map((m) => m.id).filter(Number.isFinite),
      );
      const uniqNums = (arr) =>
        Array.from(
          new Set((arr || []).map(Number).filter((n) => Number.isFinite(n))),
        );

      // --- Groups: sanitize ---
      let newGroups = (groups || []).map((g) => {
        const memberIds = uniqNums(g.memberIds)
          .filter((id) => validIds.has(id))
          .sort((a, b) => a - b);
        const mode = g.mode || "EXACT";
        const ng = {
          id: g.id ?? (Date.now() + Math.random() * 1000) | 0,
          name: g.name || "",
          mode,
          required: !!g.required,
          memberIds,
          k: undefined,
          kMin: undefined,
          kMax: undefined,
        };
        // keep only sane numeric params
        if (mode === "EXACT" || mode === "AT_LEAST" || mode === "AT_MOST") {
          const k = Number(g.k);
          if (Number.isFinite(k) && k >= 0) ng.k = k;
        }
        if (mode === "RANGE") {
          let kMin = Number(g.kMin),
            kMax = Number(g.kMax);
          if (!Number.isFinite(kMin)) kMin = undefined;
          if (!Number.isFinite(kMax)) kMax = undefined;
          if (kMin !== undefined && kMax !== undefined && kMin > kMax)
            [kMin, kMax] = [kMax, kMin];
          ng.kMin = kMin;
          ng.kMax = kMax;
        }
        return ng;
      });
      // Drop groups with no members; singleton groups must persist for unary rules
      newGroups = newGroups.filter(
        (g) => Array.isArray(g.memberIds) && g.memberIds.length > 0,
      );

      // --- Constraints: sanitize ---
      let newCons = (cons || [])
        .map((c) => {
          if (c.type === "MUTEX") {
            const ids = uniqNums(c.ids)
              .filter((id) => validIds.has(id))
              .sort((a, b) => a - b);
            return ids.length >= 2 ? { type: "MUTEX", ids } : null;
          }
          if (c.type === "REQUIRES" || c.type === "FORBIDS") {
            const a = Number(c.a),
              b = Number(c.b);
            if (
              Number.isFinite(a) &&
              Number.isFinite(b) &&
              a !== b &&
              validIds.has(a) &&
              validIds.has(b)
            ) {
              return { type: c.type, a, b };
            }
            return null;
          }
          return null;
        })
        .filter(Boolean);
      // De-duplicate constraints by structural key
      {
        const seen = new Set();
        newCons = newCons.filter((c) => {
          let key;
          if (c.type === "MUTEX") key = `MUTEX:${c.ids.join(",")}`;
          else {
            const a = Math.min(c.a, c.b),
              b = Math.max(c.a, c.b);
            key = `${c.type}:${a},${b}`;
          }
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      model.modifierGroups = newGroups;
      model.modifierConstraints = newCons;
      close();
      if (status?.set) status.set("Rules saved (validated)");
      else if (status) status.textContent = "Rules saved (validated)";
    };
    foot.appendChild(cancel);
    foot.appendChild(saveBtn);
    box.appendChild(foot);
  }

  document.body.appendChild(ov);
  render();
  focusFirst();
}
