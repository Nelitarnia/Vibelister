import {
  noteKeyForPair,
  getInteractionsCell,
  setInteractionsCell,
  getStructuredCellInteractions,
  applyStructuredCellInteractions,
  clearInteractionsCell,
  clearInteractionsSelection,
  isInteractionPhaseColumnActiveForRow,
  getInteractionsPair,
  getInteractionsRowCount,
  collectInteractionTags,
} from "../../../app/interactions.js";
import { createInteractionTagManager } from "../../../app/interaction-tags.js";
import { INTERACTION_TAGS_EVENT } from "../../../app/tag-events.js";
import { sanitizeStructuredPayload } from "../../../app/clipboard-codec.js";
import { setComment } from "../../../app/comments.js";
import { initPalette } from "../../../ui/palette.js";
import { buildInteractionsPairs } from "../../../data/variants/variants.js";
import { makeModelFixture } from "./model-fixtures.js";

function plainCellText(value) {
  if (value && typeof value === "object" && typeof value.plainText === "string") {
    return value.plainText;
  }
  if (value == null) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function cellSegments(value) {
  if (value && typeof value === "object" && Array.isArray(value.segments)) {
    return value.segments;
  }
  return null;
}

function makeInteractionsView() {
  return {
    columns: [
      { key: "action" },
      { key: "input" },
      { key: "p1:outcome" },
      { key: "p1:end" },
      { key: "notes" },
    ],
  };
}

function getPair(model, rowIndex) {
  return getInteractionsPair(model, rowIndex);
}

function findPairIndex(model, predicate) {
  const total = getInteractionsRowCount(model);
  for (let r = 0; r < total; r++) {
    const pair = getPair(model, r);
    if (pair && predicate(pair)) return r;
  }
  return -1;
}

class PaletteStubElement {
  constructor(tag, isFragment = false) {
    this.tag = tag;
    this.isFragment = isFragment;
    this._children = [];
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.parentElement = null;
    this._textContent = "";
    this.id = "";
  }

  appendChild(child) {
    if (!child) return child;
    if (child.isFragment) {
      child._children.forEach((node) => this.appendChild(node));
      return child;
    }
    this._children.push(child);
    child.parentElement = this;
    return child;
  }

  get children() {
    return this._children;
  }

  set innerHTML(value) {
    this._children = [];
    this._textContent = typeof value === "string" ? value : "";
  }

  set textContent(value) {
    this._children = [];
    this._textContent = typeof value === "string" ? value : String(value ?? "");
  }

  get textContent() {
    return this._textContent;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") this.id = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === "id") this.id = "";
  }

  contains(target) {
    if (!target) return false;
    if (target === this) return true;
    return this._children.some((child) => child.contains?.(target));
  }

  scrollIntoView() {}
}

function makePaletteEnvironment() {
  const host = new PaletteStubElement("div");
  const documentStub = {
    createElement(tag) {
      return new PaletteStubElement(tag);
    },
    createDocumentFragment() {
      return new PaletteStubElement("#fragment", true);
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    activeElement: null,
  };
  const editor = {
    style: {},
    parentElement: host,
    addEventListener: () => {},
    focus: () => {},
    setSelectionRange: () => {},
    select: () => {},
    value: "",
  };
  const sheet = { addEventListener: () => {} };
  return { host, documentStub, editor, sheet };
}

export function getInteractionsTests() {
  return [
    {
      name: "stable ids required for outcome and end cells",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const status = {
          last: "",
          set(msg) {
            this.last = msg || "";
          },
        };
        const action = addAction("Aim");
        addInput("Tap");
        const outcome = addOutcome("Cancels");
        buildInteractionsPairs(model);
        const viewDef = makeInteractionsView();

        setInteractionsCell(model, status, viewDef, 0, 2, "free text");
        assert.ok(
          status.last.includes("Outcome") || status.last.includes("require"),
          "free text outcome rejected",
        );

        status.set("");
        setInteractionsCell(model, status, viewDef, 0, 2, outcome.id);
        const outcomeCell = getInteractionsCell(model, viewDef, 0, 2);
        assert.strictEqual(
          plainCellText(outcomeCell),
          "Cancels",
          "outcome id accepted",
        );

        status.set("");
        setInteractionsCell(model, status, viewDef, 0, 3, "EndString");
        assert.ok(status.last.includes("End"), "free text end rejected");

        status.set("");
        setInteractionsCell(model, status, viewDef, 0, 3, {
          endActionId: action.id,
          endVariantSig: "",
        });
        const endCell = getInteractionsCell(model, viewDef, 0, 3);
        assert.strictEqual(
          plainCellText(endCell),
          "Aim",
          "structured end payload accepted",
        );
      },
    },
    {
      name: "clearing selection spans multiple columns",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const strike = addAction("Strike");
        const followUp = addAction("Follow Up");
        const input = addInput("Tap");
        const outcome = addOutcome("Stagger");
        buildInteractionsPairs(model);
        const viewDef = makeInteractionsView();

        const rowIndex = findPairIndex(
          model,
          (pair) => pair.aId === strike.id && pair.iId === input.id,
        );
        assert.ok(rowIndex >= 0, "pair for action/input present");

        setInteractionsCell(model, { set() {} }, viewDef, rowIndex, 2, outcome.id);
        setInteractionsCell(model, { set() {} }, viewDef, rowIndex, 3, {
          endActionId: followUp.id,
          endVariantSig: "",
        });
        setInteractionsCell(model, { set() {} }, viewDef, rowIndex, 4, "combo notes");

        const selection = {
          rows: new Set([rowIndex]),
          cols: new Set([2, 3, 4]),
          colsAll: false,
        };
        const sel = { r: rowIndex, c: 4 };
        const status = { set() {} };

        const result = clearInteractionsSelection(
          model,
          viewDef,
          selection,
          sel,
          "clearActiveCell",
          status,
          () => {},
        );

        assert.strictEqual(result?.cleared, 4, "clears outcome, end, and notes fields");

        const pair = getPair(model, rowIndex);
        const phaseKey = noteKeyForPair(pair, 1);
        const notesKey = noteKeyForPair(pair, undefined);
        assert.ok(!model.notes[phaseKey], "phase note removed after clearing");
        assert.ok(!model.notes[notesKey], "notes entry removed after clearing");
      },
    },
    {
      name: "horizontal selection clears all editable columns",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const strike = addAction("Strike");
        const followUp = addAction("Follow Up");
        const input = addInput("Tap");
        const outcome = addOutcome("Stagger");
        buildInteractionsPairs(model);
        const viewDef = makeInteractionsView();

        const rowIndex = findPairIndex(
          model,
          (pair) => pair.aId === strike.id && pair.iId === input.id,
        );
        assert.ok(rowIndex >= 0, "pair for action/input present");

        setInteractionsCell(model, { set() {} }, viewDef, rowIndex, 2, outcome.id);
        setInteractionsCell(model, { set() {} }, viewDef, rowIndex, 3, {
          endActionId: followUp.id,
          endVariantSig: "",
        });
        setInteractionsCell(model, { set() {} }, viewDef, rowIndex, 4, "combo notes");

        const selection = {
          rows: new Set([rowIndex]),
          cols: new Set(),
          colsAll: true,
          horizontalMode: true,
        };
        const sel = { r: rowIndex, c: 2 };
        const status = { set() {} };

        const result = clearInteractionsSelection(
          model,
          viewDef,
          selection,
          sel,
          "clearActiveCell",
          status,
          () => {},
        );

        assert.strictEqual(
          result?.cleared,
          4,
          "clears outcome, end, and notes fields when horizontal selection active",
        );

        const pair = getPair(model, rowIndex);
        const phaseKey = noteKeyForPair(pair, 1);
        const notesKey = noteKeyForPair(pair, undefined);
        assert.ok(!model.notes[phaseKey], "phase note removed after clearing");
        assert.ok(!model.notes[notesKey], "notes entry removed after clearing");
      },
    },
    {
      name: "structured copy paste round trip",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Attack");
        addInput("Jab");
        const outcome = addOutcome("Hit");
        buildInteractionsPairs(model);
        const viewDef = makeInteractionsView();

        setInteractionsCell(model, { set() {} }, viewDef, 0, 2, outcome.id);
        setInteractionsCell(model, { set() {} }, viewDef, 0, 3, {
          endActionId: action.id,
          endVariantSig: "",
        });

        const payloadOutcome = getStructuredCellInteractions(
          model,
          viewDef,
          0,
          2,
        );
        const payloadEnd = getStructuredCellInteractions(model, viewDef, 0, 3);
        assert.strictEqual(
          payloadOutcome?.type,
          "outcome",
          "structured outcome type",
        );
        assert.strictEqual(payloadOutcome?.data?.outcomeId, outcome.id);
        assert.strictEqual(payloadEnd?.type, "end", "structured end type");
        assert.strictEqual(payloadEnd?.data?.endActionId, action.id);

        addInput("Kick");
        buildInteractionsPairs(model);

        const applyOutcome = applyStructuredCellInteractions(
          (r, c, v) =>
            setInteractionsCell(model, { set() {} }, viewDef, r, c, v),
          viewDef,
          1,
          2,
          payloadOutcome,
          model,
        );
        assert.ok(applyOutcome, "outcome payload applied");

        const applyEnd = applyStructuredCellInteractions(
          (r, c, v) =>
            setInteractionsCell(model, { set() {} }, viewDef, r, c, v),
          viewDef,
          1,
          3,
          payloadEnd,
          model,
        );
        assert.ok(applyEnd, "end payload applied");

        const pastedOutcome = getInteractionsCell(model, viewDef, 1, 2);
        const pastedEnd = getInteractionsCell(model, viewDef, 1, 3);
        assert.strictEqual(
          plainCellText(pastedOutcome),
          "Hit",
          "pasted outcome visible",
        );
        assert.strictEqual(
          plainCellText(pastedEnd),
          "Attack",
          "pasted end visible",
        );
      },
    },
    {
      name: "tag cells normalize, copy, and clear values",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        addAction("Strike");
        addInput("Tap");
        buildInteractionsPairs(model);
        const tagView = { columns: [{ key: "p0:tag" }] };
        const status = { set() {} };

        setInteractionsCell(
          model,
          status,
          tagView,
          0,
          0,
          " rush , momentum+, Rush ",
        );
        const pair0 = getInteractionsPair(model, 0);
        const noteKey0 = noteKeyForPair(pair0, 0);
        assert.deepStrictEqual(
          model.notes[noteKey0]?.tags,
          ["rush", "momentum+"],
          "tags normalized and deduplicated",
        );
        assert.strictEqual(
          getInteractionsCell(model, tagView, 0, 0),
          "rush, momentum+",
          "formatted tag cell text",
        );
        assert.deepStrictEqual(
          collectInteractionTags(model),
          ["momentum+", "rush"],
          "collectInteractionTags gathers saved tags",
        );

        const payload = getStructuredCellInteractions(model, tagView, 0, 0);
        assert.strictEqual(payload?.type, "tag", "structured tag payload type");
        assert.deepStrictEqual(
          payload?.data?.tags,
          ["rush", "momentum+"],
          "structured tag payload carries normalized list",
        );

        const sanitized = sanitizeStructuredPayload(payload);
        assert.deepStrictEqual(
          sanitized,
          { type: "tag", data: { tags: ["rush", "momentum+"] } },
          "tag payload survives clipboard sanitization",
        );

        addInput("Kick");
        buildInteractionsPairs(model);
        setInteractionsCell(model, status, tagView, 1, 0, ["setup"]);
        assert.deepStrictEqual(
          collectInteractionTags(model),
          ["momentum+", "rush", "setup"],
          "tag catalog aggregates multiple rows",
        );

        addInput("Throw");
        buildInteractionsPairs(model);
        const applied = applyStructuredCellInteractions(
          (r, c, v) => setInteractionsCell(model, status, tagView, r, c, v),
          tagView,
          2,
          0,
          payload,
          model,
        );
        assert.ok(applied, "tag payload applied to third row");
        assert.strictEqual(
          getInteractionsCell(model, tagView, 2, 0),
          "rush, momentum+",
          "copied tag payload visible",
        );

        const clearedFirst = clearInteractionsCell(model, tagView, 0, 0);
        assert.ok(clearedFirst, "clearing tag cell removes first row value");
        assert.strictEqual(
          getInteractionsCell(model, tagView, 0, 0),
          "",
          "cleared tag cell blank",
        );
        assert.deepStrictEqual(
          collectInteractionTags(model),
          ["momentum+", "rush", "setup"],
          "remaining rows still contribute to catalog",
        );

        const clearedThird = clearInteractionsCell(model, tagView, 2, 0);
        assert.ok(clearedThird, "clearing structured target row succeeds");
        assert.deepStrictEqual(
          collectInteractionTags(model),
          ["setup"],
          "catalog reflects final tag set",
        );
      },
    },
    {
      name: "interaction tag edits dispatch tag update events",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        addAction("Strike");
        addInput("Tap");
        buildInteractionsPairs(model);
        const tagView = { columns: [{ key: "p0:tag" }] };
        const status = { set() {} };

        const originalDocument = globalThis.document;
        const originalCustomEvent = globalThis.CustomEvent;
        const events = [];
        globalThis.CustomEvent = function (type, params) {
          this.type = type;
          this.detail = params?.detail;
        };
        globalThis.document = {
          dispatchEvent(evt) {
            events.push(evt);
            return true;
          },
        };

        try {
          const setResult = setInteractionsCell(model, status, tagView, 0, 0, [
            "rush",
          ]);
          assert.ok(setResult, "setting tag should succeed");
          assert.strictEqual(events.length, 1, "setting tags emits an event");
          const setEvent = events.pop();
          assert.strictEqual(
            setEvent.type,
            INTERACTION_TAGS_EVENT,
            "set event type matches",
          );
          assert.strictEqual(setEvent.detail.reason, "setCell", "set reason");
          assert.deepStrictEqual(
            setEvent.detail.tags,
            ["rush"],
            "set event carries tag payload",
          );

          const clearResult = setInteractionsCell(model, status, tagView, 0, 0, []);
          assert.ok(clearResult, "clearing tags via setInteractionsCell works");
          assert.strictEqual(events.length, 1, "clearing emits an event");
          const clearEvent = events.pop();
          assert.strictEqual(
            clearEvent.detail.reason,
            "clearCell",
            "clear event reason",
          );
          assert.strictEqual(clearEvent.detail.count, 1, "clear count matches");

          setInteractionsCell(model, status, tagView, 0, 0, [
            "setup",
            "advantage",
          ]);
          events.length = 0;
          const clearedDirect = clearInteractionsCell(model, tagView, 0, 0);
          assert.ok(clearedDirect, "clearInteractionsCell removes tags");
          assert.strictEqual(events.length, 1, "clearInteractionsCell emits");
          const clearCellEvent = events.pop();
          assert.deepStrictEqual(
            clearCellEvent.detail.tags,
            ["setup", "advantage"],
            "clear event preserves previous tags",
          );

          setInteractionsCell(model, status, tagView, 0, 0, ["again"]);
          events.length = 0;
          const selection = { rows: new Set([0]), cols: new Set([0]), colsAll: false };
          const sel = { r: 0, c: 0 };
          const selectionClear = clearInteractionsSelection(
            model,
            tagView,
            selection,
            sel,
            "clearSelection",
            status,
            () => {},
          );
          assert.ok(selectionClear?.cleared > 0, "selection clear removes tags");
          assert.ok(events.length >= 1, "selection clear dispatches event");
          const selectionEvent = events[events.length - 1];
          assert.strictEqual(
            selectionEvent.detail.reason,
            "clearSelection",
            "selection event reason",
          );
        } finally {
          if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
          else globalThis.CustomEvent = originalCustomEvent;
          if (originalDocument === undefined) delete globalThis.document;
          else globalThis.document = originalDocument;
        }
      },
    },
    {
      name: "interaction tag manager renames and deletes tags via mutation runner",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        addAction("Strike");
        addInput("Tap");
        addInput("Hold");
        buildInteractionsPairs(model);
        const tagView = { columns: [{ key: "p0:tag" }] };
        const status = { set() {} };

        setInteractionsCell(model, status, tagView, 0, 0, ["rush", "setup"]);
        setInteractionsCell(model, status, tagView, 1, 0, ["rush"]);

        const undoConfigs = [];
        const mutationCalls = [];
        const events = [];
        const originalDocument = globalThis.document;
        const originalCustomEvent = globalThis.CustomEvent;
        globalThis.CustomEvent = function (type, params) {
          this.type = type;
          this.detail = params?.detail;
        };
        globalThis.document = {
          dispatchEvent(evt) {
            events.push(evt);
            return true;
          },
        };

        const makeUndoConfig = (options) => {
          undoConfigs.push(options);
          return options;
        };
        const runModelMutation = (label, mutate, options = {}) => {
          mutationCalls.push({ label, options });
          const result = mutate();
          if (typeof options.after === "function") options.after(result);
          return result;
        };

        try {
          const manager = createInteractionTagManager({
            model,
            runModelMutation,
            makeUndoConfig,
            statusBar: status,
          });

          const renameResult = manager.renameTag("rush", "momentum");
          assert.strictEqual(
            renameResult.replacements,
            2,
            "rename updates all matching tags",
          );
          assert.deepStrictEqual(
            collectInteractionTags(model).sort(),
            ["momentum", "setup"],
            "catalog reflects renamed tag",
          );
          assert.ok(
            events.some((evt) => evt.detail?.reason === "rename"),
            "rename emits tag event",
          );

          const renameUndo = undoConfigs[0];
          assert.strictEqual(renameUndo.includeLocation, false, "rename undo omits location");
          assert.strictEqual(renameUndo.includeColumn, false, "rename undo omits column");

          events.length = 0;

          const deleteResult = manager.deleteTag("setup");
          assert.strictEqual(deleteResult.removals, 1, "delete removes matching tags");
          assert.deepStrictEqual(
            collectInteractionTags(model),
            ["momentum"],
            "catalog retains remaining tag",
          );
          assert.ok(
            events.some((evt) => evt.detail?.reason === "delete"),
            "delete emits tag event",
          );

          const deleteUndo = undoConfigs[1];
          assert.strictEqual(deleteUndo.includeLocation, false, "delete undo omits location");
          assert.strictEqual(deleteUndo.includeColumn, false, "delete undo omits column");

          assert.strictEqual(
            mutationCalls[0].label,
            "renameInteractionTag",
            "rename mutation label captured",
          );
          assert.strictEqual(
            mutationCalls[1].label,
            "deleteInteractionTag",
            "delete mutation label captured",
          );
        } finally {
          if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
          else globalThis.CustomEvent = originalCustomEvent;
          if (originalDocument === undefined) delete globalThis.document;
          else globalThis.document = originalDocument;
        }
      },
    },
    {
      name: "AA phase 0 palette edits mirror and clear",
      run(assert) {
        const { model, addAction, addOutcome } = makeModelFixture();
        model.meta.interactionsMode = "AA";
        const left = addAction("Left");
        const right = addAction("Right");
        const win = addOutcome("Win");
        const lose = addOutcome("Lose");
        win.dualof = lose.id;
        lose.dualof = win.id;
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [
            { key: "action" },
            { key: "rhsaction" },
            { key: "p0:outcome" },
          ],
        };
        const row = findPairIndex(
          model,
          (pair) => pair.aId === left.id && pair.rhsActionId === right.id,
        );
        const mirrorRow = findPairIndex(
          model,
          (pair) => pair.aId === right.id && pair.rhsActionId === left.id,
        );
        assert.ok(row >= 0 && mirrorRow >= 0, "expected AA pairs present");
        const status = { set() {} };

        setInteractionsCell(model, status, viewDef, row, 2, win.id);
        const mirroredAfterWin = getInteractionsCell(
          model,
          viewDef,
          mirrorRow,
          2,
        );
        assert.strictEqual(
          plainCellText(mirroredAfterWin),
          "Lose",
          "mirrored row reflects inverted outcome",
        );
        const mirrorKey = noteKeyForPair(getPair(model, mirrorRow), 0);
        assert.strictEqual(
          model.notes[mirrorKey]?.outcomeId,
          lose.id,
          "mirrored note stores inverted outcome id",
        );

        setInteractionsCell(model, status, viewDef, row, 2, null);
        const mirroredAfterClear = getInteractionsCell(
          model,
          viewDef,
          mirrorRow,
          2,
        );
        assert.strictEqual(
          plainCellText(mirroredAfterClear),
          "",
          "clearing source row clears mirrored cell",
        );
        assert.ok(
          !model.notes[mirrorKey],
          "mirrored note entry removed when source cleared",
        );

        setInteractionsCell(model, status, viewDef, mirrorRow, 2, lose.id);
        const sourceAfterMirrorWrite = getInteractionsCell(
          model,
          viewDef,
          row,
          2,
        );
        assert.strictEqual(
          plainCellText(sourceAfterMirrorWrite),
          "Win",
          "mirrored write reflects inverted outcome on source row",
        );
        const sourceKey = noteKeyForPair(getPair(model, row), 0);
        assert.strictEqual(
          model.notes[sourceKey]?.outcomeId,
          win.id,
          "source note stores inverted outcome when mirror edited",
        );

        setInteractionsCell(model, status, viewDef, mirrorRow, 2, null);
        const sourceAfterMirrorClear = getInteractionsCell(
          model,
          viewDef,
          row,
          2,
        );
        assert.strictEqual(
          plainCellText(sourceAfterMirrorClear),
          "",
          "clearing mirrored row clears source cell",
        );
        assert.ok(
          !model.notes[sourceKey],
          "source note entry removed when mirror cleared",
        );
      },
    },
    {
      name: "AA phase 0 command clears mirror both directions",
      run(assert) {
        const { model, addAction, addOutcome } = makeModelFixture();
        model.meta.interactionsMode = "AA";
        const left = addAction("Left");
        const right = addAction("Right");
        const win = addOutcome("Win");
        const lose = addOutcome("Lose");
        win.dualof = lose.id;
        lose.dualof = win.id;
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [
            { key: "action" },
            { key: "rhsaction" },
            { key: "p0:outcome" },
          ],
        };
        const row = findPairIndex(
          model,
          (pair) => pair.aId === left.id && pair.rhsActionId === right.id,
        );
        const mirrorRow = findPairIndex(
          model,
          (pair) => pair.aId === right.id && pair.rhsActionId === left.id,
        );
        assert.ok(row >= 0 && mirrorRow >= 0, "expected AA pairs present");
        const status = { set() {} };

        setInteractionsCell(model, status, viewDef, row, 2, win.id);
        const mirrorKey = noteKeyForPair(getPair(model, mirrorRow), 0);
        const sourceKey = noteKeyForPair(getPair(model, row), 0);
        assert.strictEqual(
          model.notes[mirrorKey]?.outcomeId,
          lose.id,
          "mirrored note stores inverted outcome",
        );

        const cleared = clearInteractionsCell(model, viewDef, mirrorRow, 2);
        assert.ok(cleared, "clearInteractionsCell reports change");
        const sourceAfterCommandClear = getInteractionsCell(
          model,
          viewDef,
          row,
          2,
        );
        assert.strictEqual(
          plainCellText(sourceAfterCommandClear),
          "",
          "clearing mirrored row via command clears source cell",
        );
        assert.ok(
          !model.notes[sourceKey] && !model.notes[mirrorKey],
          "notes removed on both sides after command clear",
        );

        setInteractionsCell(model, status, viewDef, row, 2, win.id);
        assert.strictEqual(
          model.notes[mirrorKey]?.outcomeId,
          lose.id,
          "mirrored note restored for selection clear",
        );

        const selection = { rows: new Set([mirrorRow]) };
        const sel = { r: mirrorRow, c: 2 };
        const statusClear = { set() {} };
        const result = clearInteractionsSelection(
          model,
          viewDef,
          selection,
          sel,
          "clearActiveCell",
          statusClear,
          () => {},
        );
        assert.ok(result?.cleared > 0, "selection clear reports entries cleared");
        const sourceAfterSelectionClear = getInteractionsCell(
          model,
          viewDef,
          row,
          2,
        );
        assert.strictEqual(
          plainCellText(sourceAfterSelectionClear),
          "",
          "selection clear removes mirrored source cell",
        );
        assert.ok(
          !model.notes[sourceKey] && !model.notes[mirrorKey],
          "notes removed on both sides after selection clear",
        );
      },
    },
    {
      name: "clearInteractionsSelection removes stored comments",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        const action = addAction("Lever");
        const input = addInput("Use");
        buildInteractionsPairs(model);
        const viewDef = { key: "interactions", ...makeInteractionsView() };
        const rowIndex = findPairIndex(
          model,
          (pair) => pair.aId === action.id && pair.iId === input.id,
        );
        assert.ok(rowIndex >= 0, "pair found");
        const pair = getPair(model, rowIndex);
        const column = viewDef.columns[2];
        const commentRowId = noteKeyForPair(pair, undefined);
        setComment(
          model,
          viewDef,
          { commentRowId },
          column,
          { text: "annotate" },
        );

        const selection = { rows: new Set([rowIndex]), cols: new Set([2]), colsAll: false };
        const sel = { r: rowIndex, c: 2 };
        const status = { set() {} };
        const result = clearInteractionsSelection(
          model,
          viewDef,
          selection,
          sel,
          "clearActiveCell",
          status,
          () => {},
        );

        assert.ok(result?.cleared > 0, "clearing reports entries removed");
        assert.ok(
          !model.comments.interactions?.[commentRowId],
          "comment bucket cleared for row",
        );
      },
    },
    {
      name: "AA variant pairs cover all modifier combinations",
      run(assert) {
        const { model, addAction, addModifier, groupExact } = makeModelFixture();
        model.meta.interactionsMode = "AA";
        const boost = addModifier("Boost");
        const guard = addModifier("Guard");
        const feint = addModifier("Feint");
        const cancel = addModifier("Cancel");
        groupExact(1, [boost, guard], { name: "primary" });
        groupExact(1, [feint, cancel], { name: "secondary" });
        const modSet = {
          [boost.id]: 1,
          [guard.id]: 1,
          [feint.id]: 1,
          [cancel.id]: 1,
        };
        const left = addAction("Strike", modSet);
        const right = addAction("Block", modSet);

        const result = buildInteractionsPairs(model);

        assert.strictEqual(result.capped, false, "AA combinations remain within cap");
        assert.strictEqual(result.cappedActions, 0, "no AA actions truncated");
        assert.strictEqual(
          result.pairsCount,
          getInteractionsRowCount(model),
          "pairsCount matches generated pairs",
        );

        const expectedVariants = [
          [boost.id, feint.id],
          [boost.id, cancel.id],
          [guard.id, feint.id],
          [guard.id, cancel.id],
        ].map((combo) => combo.slice().sort((a, b) => a - b).join("+"));

        const leftGroup = model.interactionsIndex.groups.find(
          (group) => group.actionId === left.id,
        );
        const rightGroup = model.interactionsIndex.groups.find(
          (group) => group.actionId === right.id,
        );
        assert.ok(leftGroup, "left action group present");
        assert.ok(rightGroup, "right action group present");

        const leftVariants = leftGroup.variants.map((v) => v.variantSig).slice().sort();
        const rightVariants = rightGroup.variants.map((v) => v.variantSig).slice().sort();
        assert.deepStrictEqual(
          leftVariants,
          expectedVariants.slice().sort(),
          "left action variants cover all modifier combinations",
        );
        assert.deepStrictEqual(
          rightVariants,
          expectedVariants.slice().sort(),
          "right action variants mirror left combinations",
        );

        const leftRightPairs = [];
        const totalPairs = getInteractionsRowCount(model);
        for (let i = 0; i < totalPairs; i++) {
          const pair = getPair(model, i);
          if (pair && pair.aId === left.id && pair.rhsActionId === right.id) {
            leftRightPairs.push(pair);
          }
        }
        const expectedPairCount = expectedVariants.length * expectedVariants.length;
        assert.strictEqual(
          leftRightPairs.length,
          expectedPairCount,
          "left-right pairs cover cross product",
        );

        const combos = new Set(
          leftRightPairs.map(
            (pair) => `${pair.variantSig}|${pair.rhsVariantSig}`,
          ),
        );
        assert.strictEqual(
          combos.size,
          expectedPairCount,
          "unique left-right variant pairs match cross product",
        );
        for (const leftSig of expectedVariants) {
          for (const rightSig of expectedVariants) {
            assert.ok(
              combos.has(`${leftSig}|${rightSig}`),
              `missing AA pair for ${leftSig} vs ${rightSig}`,
            );
          }
        }
      },
    },
    {
      name: "phase availability respects action phases",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        const action = addAction("Attack");
        action.phases = { ids: [1], labels: {} };
        addInput("Light");
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [
            { key: "p1:outcome" },
            { key: "p2:outcome" },
            { key: "p1:end" },
            { key: "p2:tag" },
          ],
        };
        assert.ok(
          isInteractionPhaseColumnActiveForRow(model, viewDef, 0, 0),
          "phase 1 outcome active",
        );
        assert.ok(
          !isInteractionPhaseColumnActiveForRow(model, viewDef, 0, 1),
          "phase 2 outcome inactive",
        );
        assert.ok(
          isInteractionPhaseColumnActiveForRow(model, viewDef, 0, 2),
          "phase 1 end active",
        );
        assert.ok(
          !isInteractionPhaseColumnActiveForRow(model, viewDef, 0, 3),
          "phase 2 tag inactive",
        );
      },
    },
    {
      name: "end display canonicalizes variant signatures",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        const m1 = addModifier("Rise");
        const m2 = addModifier("Fall");
        m1.color2 = "#ff0000";
        m2.color2 = "#00ff00";
        const action = addAction("Lift", { [m1.id]: 1, [m2.id]: 1 });
        addInput("Up");
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [{ key: "action" }, { key: "input" }, { key: "p1:end" }],
        };

        setInteractionsCell(model, { set() {} }, viewDef, 0, 2, {
          endActionId: action.id,
          endVariantSig: `${m2.id}+${m1.id}`,
        });
        const cell = getInteractionsCell(model, viewDef, 0, 2);
        const text = plainCellText(cell);
        assert.ok(
          /Lift \((Fall\+Rise|Rise\+Fall)\)/.test(text),
          "end column shows canonical modifier order",
        );
        const segments = cellSegments(cell);
        assert.ok(Array.isArray(segments) && segments.length >= 5, "segments emitted");
        const riseSegment = segments.find((seg) => seg.text === "Rise");
        const fallSegment = segments.find((seg) => seg.text === "Fall");
        assert.strictEqual(riseSegment?.foreground, "#ff0000", "Rise uses color2 foreground");
        assert.strictEqual(fallSegment?.foreground, "#00ff00", "Fall uses color2 foreground");
        const riseIndex = segments.indexOf(riseSegment);
        const fallIndex = segments.indexOf(fallSegment);
        assert.ok(riseIndex >= 0 && fallIndex > riseIndex, "modifier segments preserve canonical order");
      },
    },
    {
      name: "action column emits colored modifier segments",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        const m1 = addModifier("Rise");
        const m2 = addModifier("Fall");
        m1.color2 = "#ff0000";
        m2.color2 = "#00ff00";
        const action = addAction("Lift");
        addInput("Up");
        buildInteractionsPairs(model);
        assert.ok(getInteractionsRowCount(model) > 0, "pairs built for AI mode");
        const actionGroup = model.interactionsIndex.groups.find(
          (group) => group.actionId === action.id,
        );
        assert.ok(actionGroup, "action group recorded");
        if (actionGroup?.variants?.[0]) {
          actionGroup.variants[0].variantSig = `${m2.id}+${m1.id}`;
        }

        const viewDef = { columns: [{ key: "action" }, { key: "input" }] };
        const cell = getInteractionsCell(model, viewDef, 0, 0);
        assert.strictEqual(
          plainCellText(cell),
          "Lift (Rise+Fall)",
          "action column plain text matches legacy format",
        );
        const segments = cellSegments(cell);
        assert.ok(Array.isArray(segments) && segments.length >= 5, "action column emits segments");
        const riseSegment = segments.find((seg) => seg.text === "Rise");
        const fallSegment = segments.find((seg) => seg.text === "Fall");
        assert.strictEqual(riseSegment?.foreground, "#ff0000", "Rise segment uses color2 foreground");
        assert.strictEqual(fallSegment?.foreground, "#00ff00", "Fall segment uses color2 foreground");
      },
    },
    {
      name: "AA action columns emit colored modifier segments",
      run(assert) {
        const { model, addAction, addModifier } = makeModelFixture();
        model.meta.interactionsMode = "AA";
        const boost = addModifier("Boost");
        const guard = addModifier("Guard");
        boost.color2 = "#aa0000";
        guard.color2 = "#00aa00";
        const left = addAction("Left");
        const right = addAction("Right");
        buildInteractionsPairs(model);
        const pairIndex = findPairIndex(
          model,
          (pair) => pair.aId === left.id && pair.rhsActionId === right.id,
        );
        assert.ok(pairIndex >= 0, "expected AA pair present");
        const leftGroup = model.interactionsIndex.groups.find(
          (group) => group.actionId === left.id,
        );
        const targetVariant = leftGroup?.variants?.find(
          (variant) =>
            Number.isFinite(variant?.rowIndex) &&
            Number.isFinite(variant?.rowCount) &&
            pairIndex >= variant.rowIndex &&
            pairIndex < variant.rowIndex + variant.rowCount,
        );
        if (targetVariant) targetVariant.variantSig = `${guard.id}+${boost.id}`;
        const rightGroup = model.interactionsIndex.groups.find(
          (group) => group.actionId === right.id,
        );
        if (rightGroup?.variants?.[0])
          rightGroup.variants[0].variantSig = `${boost.id}`;
        if (model.interactionsIndex.variantCatalog) {
          model.interactionsIndex.variantCatalog[right.id] = [`${boost.id}`];
        }

        const viewDef = { columns: [{ key: "action" }, { key: "rhsaction" }] };
        const leftCell = getInteractionsCell(model, viewDef, pairIndex, 0);
        const rightCell = getInteractionsCell(model, viewDef, pairIndex, 1);

        assert.strictEqual(
          plainCellText(leftCell),
          "Left (Boost+Guard)",
          "left action plain text canonicalizes modifiers",
        );
        assert.strictEqual(
          plainCellText(rightCell),
          "Right (Boost)",
          "rhs action plain text includes modifiers",
        );

        const leftSegments = cellSegments(leftCell);
        const rightSegments = cellSegments(rightCell);
        assert.ok(
          Array.isArray(leftSegments) && leftSegments.length >= 5,
          "left action emits segments",
        );
        assert.ok(
          Array.isArray(rightSegments) && rightSegments.length >= 3,
          "rhs action emits segments",
        );

        const boostLeftSegment = leftSegments.find((seg) => seg.text === "Boost");
        const guardSegment = leftSegments.find((seg) => seg.text === "Guard");
        const boostRightSegment = rightSegments.find((seg) => seg.text === "Boost");
        assert.strictEqual(
          boostLeftSegment?.foreground,
          "#aa0000",
          "Boost segment uses color2 foreground on left action",
        );
        assert.strictEqual(
          guardSegment?.foreground,
          "#00aa00",
          "Guard segment uses color2 foreground on left action",
        );
        assert.strictEqual(
          boostRightSegment?.foreground,
          "#aa0000",
          "Boost segment uses color2 foreground on rhs action",
        );
      },
    },
    {
      name: "palette renders colored modifier spans for end actions",
      run(assert) {
        const { model, addAction, addModifier, addInput } = makeModelFixture();
        const rise = addModifier("Rise");
        const fall = addModifier("Fall");
        rise.color2 = "#ff3366";
        fall.color2 = "#33ff66";
        const action = addAction("Lift");
        const input = addInput("Any");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 1,
              variants: [
                {
                  variantSig: `${rise.id}+${fall.id}`,
                  rowIndex: 0,
                  rowCount: 1,
                },
              ],
            },
          ],
          totalRows: 1,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: [`${rise.id}+${fall.id}`] },
        };
        model.interactionsPairs = [];

        const { documentStub, host, editor, sheet } = makePaletteEnvironment();
        const palette = initPalette({
          editor,
          sheet,
          getActiveView: () => "interactions",
          viewDef: () => ({ columns: [{ key: "p0:end" }] }),
          sel: { r: 0, c: 0 },
          model,
          setCell: () => {},
          render: () => {},
          getCellRect: () => ({ left: 0, top: 0, width: 200, height: 24 }),
          HEADER_HEIGHT: 0,
          endEdit: () => {},
          moveSelectionForTab: () => {},
          moveSelectionForEnter: () => {},
          document: documentStub,
        });

        const opened = palette.openForCurrentCell({
          r: 0,
          c: 0,
          initialText: "",
          focusEditor: false,
        });
        assert.ok(opened, "palette opened for end column");

        const paletteRoot = host.children.find(
          (child) => child && child.id === "universalPalette",
        );
        assert.ok(paletteRoot, "palette root appended to host");
        const listEl = paletteRoot?.children?.[0];
        assert.ok(listEl, "palette list rendered");

        const item = listEl.children.find(
          (child) => child.className === "pal-item",
        );
        assert.ok(item, "palette item created for action variant");
        const spans = item.children.filter((child) => child.tag === "span");
        assert.ok(spans.length >= 5, "rich text spans rendered for palette item");

        const riseSpan = spans.find((child) => child.textContent === "Rise");
        const fallSpan = spans.find((child) => child.textContent === "Fall");
        assert.strictEqual(
          riseSpan?.style?.color,
          "#ff3366",
          "Rise span uses modifier color",
        );
        assert.strictEqual(
          fallSpan?.style?.color,
          "#33ff66",
          "Fall span uses modifier color",
        );
      },
    },
    {
      name: "tag palette suggests existing tags",
      run(assert) {
        const { model, addAction, addInput } = makeModelFixture();
        addAction("Strike");
        addInput("Tap");
        buildInteractionsPairs(model);
        const tagView = { columns: [{ key: "p0:tag" }] };
        const status = { set() {} };

        setInteractionsCell(model, status, tagView, 0, 0, ["rush"]);
        addInput("Kick");
        buildInteractionsPairs(model);
        setInteractionsCell(model, status, tagView, 1, 0, ["setup"]);

        const { documentStub, host, editor, sheet } = makePaletteEnvironment();
        let selectionRange = null;
        editor.setSelectionRange = (start, end) => {
          selectionRange = [start, end];
        };
        const originalSetTimeout = globalThis.setTimeout;
        const scheduled = [];
        globalThis.setTimeout = (fn) => {
          if (typeof fn === "function") scheduled.push(fn);
          return 1;
        };
        const palette = initPalette({
          editor,
          sheet,
          getActiveView: () => "interactions",
          viewDef: () => ({ columns: [{ key: "p0:tag" }] }),
          sel: { r: 0, c: 0 },
          model,
          setCell: (r, c, value) =>
            setInteractionsCell(model, status, tagView, r, c, value),
          render: () => {},
          getCellRect: () => ({ left: 0, top: 0, width: 200, height: 24 }),
          HEADER_HEIGHT: 0,
          endEdit: () => {},
          moveSelectionForTab: () => {},
          moveSelectionForEnter: () => {},
          document: documentStub,
        });

        let opened;
        try {
          opened = palette.openForCurrentCell({
            r: 0,
            c: 0,
            initialText: "rush, ",
            focusEditor: false,
          });
        } finally {
          globalThis.setTimeout = originalSetTimeout;
        }
        for (const task of scheduled) {
          try {
            task();
          } catch (_) {
            /* noop */
          }
        }
        assert.ok(opened, "palette opened for tag column");
        assert.deepStrictEqual(
          selectionRange,
          [6, 6],
          "tag editor keeps caret at end instead of selecting all text",
        );

        const paletteRoot = host.children.find(
          (child) => child && child.id === "universalPalette",
        );
        assert.ok(paletteRoot, "palette root appended to host");
        const listEl = paletteRoot?.children?.[0];
        assert.ok(listEl, "palette list rendered");

        const items = listEl.children.filter((child) => child.className === "pal-item");
        assert.ok(items.length >= 2, "palette lists typed entry and suggestion");

        const firstItem = items[0];
        const firstLabel = firstItem.children?.[0]?.textContent || firstItem.textContent;
        assert.strictEqual(firstLabel, "rush", "typed tags appear first");
        const firstDesc = firstItem.children?.[1]?.textContent || "";
        assert.strictEqual(firstDesc, "Keep current tags", "typed entry describes current state");

        const suggestion = items.find(
          (child) => child.children?.[0]?.textContent === "setup",
        );
        assert.ok(suggestion, "existing tag suggested");
        const suggestionDesc = suggestion.children?.[1]?.textContent || "";
        assert.ok(
          /Add tag/.test(suggestionDesc),
          "suggestion indicates it will add the tag",
        );
      },
    },
  ];
}
