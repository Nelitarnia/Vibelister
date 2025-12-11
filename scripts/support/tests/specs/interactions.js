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
  describeInteractionInference,
  DEFAULT_INTERACTION_SOURCE,
} from "../../../app/interactions.js";
import { createInteractionBulkActions } from "../../../app/interaction-bulk-actions.js";
import { createInteractionTagManager } from "../../../app/interaction-tags.js";
import { INTERACTION_TAGS_EVENT } from "../../../app/tag-events.js";
import { sanitizeStructuredPayload } from "../../../app/clipboard-codec.js";
import { createInferenceController } from "../../../app/inference-controller.js";
import {
  HEURISTIC_SOURCES,
  proposeInteractionInferences,
} from "../../../app/inference-heuristics.js";
import { captureInferenceProfilesSnapshot, resetInferenceProfiles } from "../../../app/inference-profiles.js";
import { setComment } from "../../../app/comments.js";
import { initPalette } from "../../../ui/palette.js";
import { formatEndActionLabel } from "../../../data/column-kinds.js";
import { MOD } from "../../../data/constants.js";
import { buildInteractionsPairs } from "../../../data/variants/variants.js";
import { MOD_STATE_ID } from "../../../data/mod-state.js";
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

function stubGlobalValue(name, replacement) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  const previous = globalThis[name];

  if (!descriptor || descriptor.configurable) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: replacement,
    });
    return () => {
      if (!descriptor) {
        delete globalThis[name];
      } else {
        Object.defineProperty(globalThis, name, descriptor);
      }
    };
  }

  if (Object.prototype.hasOwnProperty.call(descriptor, "value") && descriptor.writable) {
    globalThis[name] = replacement;
    return () => {
      globalThis[name] = previous;
    };
  }

  return () => {};
}

function stubDocumentDispatch(events) {
  const dispatchStub = (evt) => {
    events.push(evt);
    return true;
  };

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  if (!descriptor || descriptor.configurable) {
    const stubDocument = { dispatchEvent: dispatchStub };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: stubDocument,
    });
    return () => {
      if (!descriptor) {
        delete globalThis.document;
      } else {
        Object.defineProperty(globalThis, "document", descriptor);
      }
    };
  }

  const existing = globalThis.document;
  if (existing && typeof existing === "object") {
    const originalDispatch = existing.dispatchEvent;
    existing.dispatchEvent = dispatchStub;
    return () => {
      existing.dispatchEvent = originalDispatch;
    };
  }

  return () => {};
}

function captureInteractionTagEvents() {
  const events = [];
  const restoreDocument = stubDocumentDispatch(events);
  const restoreCustomEvent = stubGlobalValue(
    "CustomEvent",
    function CustomEventStub(type, params) {
      this.type = type;
      this.detail = params?.detail;
    },
  );

  return {
    events,
    restore() {
      restoreCustomEvent();
      restoreDocument();
    },
  };
}

export function getInteractionsTests() {
  return [
    {
      name: "note key handles missing pairs",
      run(assert) {
        assert.strictEqual(
          noteKeyForPair(null, 0),
          "",
          "null pair returns empty key",
        );
        assert.strictEqual(
          noteKeyForPair(undefined, undefined),
          "",
          "undefined pair returns empty key",
        );
      },
    },
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
      name: "structured metadata defaults and inference preservation",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        addAction("Block");
        addInput("Jab");
        const outcome = addOutcome("Hit");
        buildInteractionsPairs(model);
        const viewDef = makeInteractionsView();

        setInteractionsCell(model, { set() {} }, viewDef, 0, 2, outcome.id);
        const pair0 = getPair(model, 0);
        const noteKey0 = noteKeyForPair(pair0, 1);
        assert.ok(!("confidence" in model.notes[noteKey0]));
        assert.ok(!("source" in model.notes[noteKey0]));

        const payloadDefault = getStructuredCellInteractions(
          model,
          viewDef,
          0,
          2,
        );
        assert.deepStrictEqual(
          payloadDefault,
          { type: "outcome", data: { outcomeId: outcome.id } },
          "default metadata omitted",
        );

        setInteractionsCell(model, { set() {} }, viewDef, 0, 2, {
          outcomeId: outcome.id,
          confidence: 0.6,
          source: "model",
        });
        const metaPayload = getStructuredCellInteractions(model, viewDef, 0, 2);
        assert.deepStrictEqual(
          metaPayload,
          {
            type: "outcome",
            data: { outcomeId: outcome.id, confidence: 0.6, source: "model" },
          },
          "non-default metadata exported",
        );

        const sanitized = sanitizeStructuredPayload(metaPayload);
        assert.deepStrictEqual(
          sanitized,
          {
            type: "outcome",
            data: { outcomeId: outcome.id, confidence: 0.6, source: "model" },
          },
          "metadata survives sanitize",
        );

        addInput("Kick");
        buildInteractionsPairs(model);
        const applied = applyStructuredCellInteractions(
          (r, c, v) => setInteractionsCell(model, { set() {} }, viewDef, r, c, v),
          viewDef,
          1,
          2,
          sanitized,
          model,
        );
        assert.ok(applied, "metadata payload applied");
        const pair1 = getPair(model, 1);
        const noteKey1 = noteKeyForPair(pair1, 1);
        assert.strictEqual(model.notes[noteKey1].confidence, 0.6);
        assert.strictEqual(model.notes[noteKey1].source, "model");
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
        const { events, restore } = captureInteractionTagEvents();

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
          restore();
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
        const { events, restore } = captureInteractionTagEvents();

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
          assert.strictEqual(
            typeof renameUndo.applyAttachments,
            "function",
            "rename undo attaches tag refresh hook",
          );

          events.length = 0;
          renameUndo.applyAttachments?.(null, "undo");
          assert.ok(
            events.some((evt) => evt.detail?.reason === "undo"),
            "undo emits tag refresh event",
          );
          assert.ok(
            events.some((evt) => evt.detail?.force === true),
            "undo event forces sidebar refresh",
          );

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
            typeof deleteUndo.applyAttachments,
            "function",
            "delete undo attaches tag refresh hook",
          );

          events.length = 0;
          deleteUndo.applyAttachments?.(null, "redo");
          assert.ok(
            events.some((evt) => evt.detail?.reason === "redo"),
            "redo emits tag refresh event",
          );
          assert.ok(
            events.some((evt) => evt.detail?.force === true),
            "redo event forces sidebar refresh",
          );

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
          restore();
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

        const paletteItems = listEl.children.filter(
          (child) => child.className === "pal-item",
        );
        assert.ok(paletteItems.length >= 1, "palette should render items");
        const item = paletteItems.find((child) =>
          Array.isArray(child.children) &&
          child.children.some((grand) => grand.tag === "span"),
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
      name: "palette lists variants for parenthesized action names",
      run(assert) {
        const { model, addAction, addModifier, addInput, groupExact } =
          makeModelFixture();
        const guard = addModifier("Guard");
        const boost = addModifier("Boost");
        const cancel = addModifier("Cancel");
        const feint = addModifier("Feint");
        groupExact(1, [guard, boost], { name: "primary" });
        groupExact(1, [cancel, feint], { name: "secondary" });
        const modSet = {
          [guard.id]: MOD.ON,
          [boost.id]: MOD.ON,
          [cancel.id]: MOD.ON,
          [feint.id]: MOD.ON,
        };
        const action = addAction("Ledge (Latch)", modSet);
        addInput("Any");
        buildInteractionsPairs(model);

        const guardCancelSig = [guard.id, cancel.id]
          .slice()
          .sort((a, b) => a - b)
          .join("+");
        const label = formatEndActionLabel(model, action, guardCancelSig, {
          style: "parentheses",
        });
        const initialText = label.plainText;

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
          initialText,
          focusEditor: false,
        });

        assert.ok(opened, "palette opened for end column with variant text");
        assert.strictEqual(
          editor.value,
          "Ledge (Latch) +Guard +Cancel",
          "query normalizes modifiers into +tokens",
        );

        const paletteRoot = host.children.find(
          (child) => child && child.id === "universalPalette",
        );
        assert.ok(paletteRoot, "palette root appended to host");
        const listEl = paletteRoot?.children?.[0];
        assert.ok(listEl, "palette rendered item list");
        const items = Array.isArray(listEl?.children) ? listEl.children : [];
        const firstItem = items.find((child) => child && child.className === "pal-item");
        assert.ok(firstItem, "palette rendered at least one variant item");
        const spanTexts = Array.isArray(firstItem?.children)
          ? firstItem.children.map((child) => child?.textContent || "")
          : [];
        assert.ok(
          spanTexts.some((text) => text.includes("Guard")),
          "rendered item includes Guard modifier",
        );
        assert.ok(
          spanTexts.some((text) => text.includes("Cancel")),
          "rendered item includes Cancel modifier",
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
    {
      name: "inference helper flags non-manual notes",
      run(assert) {
        const defaults = describeInteractionInference({});
        assert.strictEqual(defaults.inferred, false, "empty note not inferred");

        const inferred = describeInteractionInference({
          source: "model",
          confidence: 0.4,
          sourceMetadata: { sources: ["phase-adjacency"] },
        });
        assert.strictEqual(inferred.inferred, true, "non-manual source inferred");
        assert.strictEqual(inferred.source, "model");
        assert.strictEqual(inferred.confidence, 0.4);
        assert.deepStrictEqual(
          inferred.sourceMetadata,
          { sources: ["phase-adjacency"] },
          "source metadata returned",
        );

        const confOnly = describeInteractionInference({ confidence: 0.25 });
        assert.strictEqual(confOnly.inferred, true, "low confidence still inferred");
      },
    },
    {
      name: "inference heuristics propagate modifier agreements",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome } =
          makeModelFixture();
        const action = addAction("Slash");
        const modifier = addModifier("Heavy");
        const outcome = addOutcome("Hit");
        const inputA = addInput("Light");
        const inputB = addInput("Fierce");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 4,
              variants: [
                { variantSig: "", rowIndex: 0, rowCount: 2 },
                { variantSig: `${modifier.id}`, rowIndex: 2, rowCount: 2 },
              ],
            },
          ],
          totalRows: 4,
          actionsOrder: [action.id],
          inputsOrder: [inputA.id, inputB.id],
          variantCatalog: { [action.id]: ["", `${modifier.id}`] },
        };

        const basePair = getPair(model, 0);
        const baseKey = noteKeyForPair(basePair, 1);
        model.notes[baseKey] = { outcomeId: outcome.id };

        const targets = [];
        for (let r = 0; r < 4; r++) {
          const pair = getPair(model, r);
          const key = noteKeyForPair(pair, 1);
          targets.push({
            key,
            field: "outcome",
            phase: 1,
            note: model.notes[key],
            pair,
            row: r,
          });
        }

        const suggestions = proposeInteractionInferences(targets);
        const modPair = getPair(model, 2);
        const modSuggestion = suggestions.get(noteKeyForPair(modPair, 1))?.outcome;
        assert.ok(modSuggestion, "modifier row received suggestion");
        assert.strictEqual(
          modSuggestion.source,
          HEURISTIC_SOURCES.modifierPropagation,
          "propagation uses modifier source",
        );
        assert.strictEqual(
          modSuggestion.value.outcomeId,
          outcome.id,
          "propagation carries base outcome",
        );
      },
    },
    {
      name: "higher-confidence suggestions replace earlier heuristics",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome } = makeModelFixture();
        const action = addAction("Blend");
        const modifier = addModifier("Charged");
        const outcome = addOutcome("Stun");
        const input = addInput("Heavy");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 2,
              variants: [
                { variantSig: "", rowIndex: 0, rowCount: 1 },
                { variantSig: `${modifier.id}`, rowIndex: 1, rowCount: 1 },
              ],
            },
          ],
          totalRows: 2,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: ["", `${modifier.id}`] },
        };

        const basePair = getPair(model, 0);
        const baseKey = noteKeyForPair(basePair, 1);
        model.notes[baseKey] = { outcomeId: outcome.id };

        const targets = [];
        for (let r = 0; r < 2; r++) {
          const pair = getPair(model, r);
          const key = noteKeyForPair(pair, 1);
          targets.push({
            key,
            field: "outcome",
            phase: 1,
            note: model.notes[key],
            pair,
            row: r,
          });
        }

        const inputKey = `in:${input.id}`;
        const profiles = {
          input: {
            [inputKey]: {
              outcome: {
                phases: {
                  1: {
                    change: 10,
                    noop: 0,
                    clear: 0,
                    values: {
                      [`o:${outcome.id}`]: {
                        count: 10,
                        value: { outcomeId: outcome.id },
                      },
                    },
                  },
                },
              },
            },
          },
        };

        const suggestions = proposeInteractionInferences(targets, profiles, {
          profileTrendMinObservations: 1,
          profileTrendMinPreferenceRatio: 0,
        });
        const inferredPair = getPair(model, 1);
        const suggestion = suggestions.get(noteKeyForPair(inferredPair, 1))?.outcome;

        assert.ok(suggestion, "modifier row receives a suggestion");
        assert.strictEqual(
          suggestion.source,
          HEURISTIC_SOURCES.profileTrend,
          "profile trend overrides earlier consensus",
        );
        assert.ok(suggestion.confidence > 0.6, "higher-confidence source wins");
      },
    },
    {
      name: "consensus ignores inferred anchors unless opted in",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome } = makeModelFixture();
        const action = addAction("Resin");
        const modifierA = addModifier("Twist");
        const modifierB = addModifier("Jab");
        const input = addInput("Strong");
        const outcome = addOutcome("Poison");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 3,
              variants: [
                { variantSig: "", rowIndex: 0, rowCount: 1 },
                { variantSig: `${modifierA.id}`, rowIndex: 1, rowCount: 1 },
                { variantSig: `${modifierB.id}`, rowIndex: 2, rowCount: 1 },
              ],
            },
          ],
          totalRows: 3,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: {
            [action.id]: ["", `${modifierA.id}`, `${modifierB.id}`],
          },
        };

        const manualPair = getPair(model, 0);
        const manualKey = noteKeyForPair(manualPair, 1);
        model.notes[manualKey] = { outcomeId: outcome.id };

        const inferredPair = getPair(model, 1);
        const inferredKey = noteKeyForPair(inferredPair, 1);
        model.notes[inferredKey] = {
          outcomeId: outcome.id,
          source: "model",
          confidence: 0.4,
        };

        const targets = [];
        for (let r = 0; r < 3; r++) {
          const pair = getPair(model, r);
          const key = noteKeyForPair(pair, 1);
          targets.push({
            key,
            field: "outcome",
            phase: 1,
            note: model.notes[key],
            pair,
            row: r,
          });
        }

        const suggestions = proposeInteractionInferences(targets);
        const emptyKey = noteKeyForPair(getPair(model, 2), 1);

        assert.strictEqual(
          suggestions.get(emptyKey)?.outcome,
          undefined,
          "inferred sources do not drive consensus",
        );
        assert.strictEqual(
          suggestions.get(inferredKey)?.outcome,
          undefined,
          "inferred targets stay untouched without opt-in",
        );

        const optInTargets = targets.map((t) =>
          t.key === inferredKey
            ? { ...t, allowInferredExisting: true, allowInferredTargets: true }
            : t,
        );
        const optInSuggestions = proposeInteractionInferences(optInTargets);
        const optedSuggestion = optInSuggestions.get(emptyKey)?.outcome;

        assert.strictEqual(
          optedSuggestion?.value.outcomeId,
          outcome.id,
          "opt-in allows inferred value to seed consensus",
        );
      },
    },
    {
      name: "lower-confidence suggestions cannot displace existing ones",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome } = makeModelFixture();
        const action = addAction("Crash");
        const modifier = addModifier("Brutal");
        const outcome = addOutcome("Knockdown");
        const input = addInput("Mid");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 2,
              variants: [
                { variantSig: "", rowIndex: 0, rowCount: 1 },
                { variantSig: `${modifier.id}`, rowIndex: 1, rowCount: 1 },
              ],
            },
          ],
          totalRows: 2,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: ["", `${modifier.id}`] },
        };

        const basePair = getPair(model, 0);
        const baseKey = noteKeyForPair(basePair, 1);
        model.notes[baseKey] = { outcomeId: outcome.id };

        const targets = [];
        for (let r = 0; r < 2; r++) {
          const pair = getPair(model, r);
          const key = noteKeyForPair(pair, 1);
          targets.push({
            key,
            field: "outcome",
            phase: 1,
            note: model.notes[key],
            pair,
            row: r,
          });
        }

        const suggestions = proposeInteractionInferences(targets);
        const inferredPair = getPair(model, 1);
        const suggestion = suggestions.get(noteKeyForPair(inferredPair, 1))?.outcome;

        assert.ok(suggestion, "modifier row receives a suggestion");
        assert.strictEqual(
          suggestion.source,
          HEURISTIC_SOURCES.modifierPropagation,
          "early high-confidence suggestion remains",
        );
        assert.ok(
          suggestion.confidence > 0.3 && suggestion.confidence < 0.5,
          "modifier consensus confidence preserved over later defaults",
        );
      },
    },
    {
      name: "phase adjacency fills single missing phase between matching anchors",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Leap");
        action.phases = { ids: [0, 1, 2], labels: {} };
        const input = addInput("High");
        const outcome = addOutcome("Connect");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 1,
              variants: [{ variantSig: "", rowIndex: 0, rowCount: 1 }],
            },
          ],
          totalRows: 1,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: [""] },
        };

        const pair = getPair(model, 0);
        const startKey = noteKeyForPair(pair, 0);
        const endKey = noteKeyForPair(pair, 2);
        model.notes[startKey] = { outcomeId: outcome.id };
        model.notes[endKey] = { outcomeId: outcome.id };

        const targets = [];
        for (let phase = 0; phase <= 2; phase++) {
          const key = noteKeyForPair(pair, phase);
          targets.push({
            key,
            field: "outcome",
            phase,
            note: model.notes[key],
            pair,
            actionGroup: "",
          });
        }

        const suggestions = proposeInteractionInferences(targets);
        const gapKey = noteKeyForPair(pair, 1);
        const suggestion = suggestions.get(gapKey)?.outcome;
        assert.ok(suggestion, "phase gap receives suggestion");
        assert.strictEqual(
          suggestion.source,
          HEURISTIC_SOURCES.phaseAdjacency,
          "phase adjacency source used",
        );
        assert.strictEqual(
          suggestion.value.outcomeId,
          outcome.id,
          "phase gap uses anchor value",
        );
        assert.strictEqual(suggestion.confidence, 0.31);
        assert.deepStrictEqual(suggestion.sourceMetadata, {
          sources: [HEURISTIC_SOURCES.phaseAdjacency],
        });
      },
    },
    {
      name: "phase adjacency ignores divergent anchors",
      run(assert) {
        const setupGapTargets = (actionsPhases) => {
          const { model, addAction, addInput, addOutcome } = makeModelFixture();
          const action = addAction("Weave");
          action.phases = { ids: actionsPhases, labels: {} };
          const input = addInput("Low");
          const outcome = addOutcome("Graze");

          model.interactionsIndex = {
            mode: "AI",
            groups: [
              {
                actionId: action.id,
                rowIndex: 0,
                totalRows: 1,
                variants: [{ variantSig: "", rowIndex: 0, rowCount: 1 }],
              },
            ],
            totalRows: 1,
            actionsOrder: [action.id],
            inputsOrder: [input.id],
            variantCatalog: { [action.id]: [""] },
          };

          const pair = getPair(model, 0);
          const targets = [];
          for (const phase of actionsPhases) {
            const key = noteKeyForPair(pair, phase);
            targets.push({
              key,
              field: "outcome",
              phase,
              note: model.notes[key],
              pair,
              actionGroup: "",
            });
          }
          return { model, outcome, pair, targets };
        };

        const { model: divergentModel, outcome: divergentOutcome, pair: divergentPair, targets: divergentTargets } =
          setupGapTargets([0, 1, 2]);
        const startKey = noteKeyForPair(divergentPair, 0);
        const endKey = noteKeyForPair(divergentPair, 2);
        divergentModel.notes[startKey] = {
          outcomeId: divergentOutcome.id,
          source: HEURISTIC_SOURCES.modifierPropagation,
        };
        divergentModel.notes[endKey] = {
          outcomeId: divergentOutcome.id,
          source: HEURISTIC_SOURCES.profileTrend,
        };
        for (const target of divergentTargets) {
          target.note = divergentModel.notes[target.key];
        }

        const divergentSuggestions = proposeInteractionInferences(divergentTargets);
        const divergentGap = divergentSuggestions.get(noteKeyForPair(divergentPair, 1))?.outcome;
        assert.ok(!divergentGap, "no suggestion when anchors disagree on source");
      },
    },
    {
      name: "phase adjacency ignores inferred anchors unless opted in",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Anchor");
        action.phases = { ids: [0, 1, 2], labels: {} };
        const input = addInput("High");
        const outcome = addOutcome("Connect");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 1,
              variants: [{ variantSig: "", rowIndex: 0, rowCount: 1 }],
            },
          ],
          totalRows: 1,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: [""] },
        };

        const pair = getPair(model, 0);
        const phase0Key = noteKeyForPair(pair, 0);
        const phase2Key = noteKeyForPair(pair, 2);
        model.notes[phase0Key] = {
          outcomeId: outcome.id,
          source: "model",
          confidence: 0.35,
        };
        model.notes[phase2Key] = {
          outcomeId: outcome.id,
          source: "model",
          confidence: 0.38,
        };

        const targets = [];
        for (let p = 0; p < 3; p++) {
          const key = noteKeyForPair(pair, p);
          targets.push({
            key,
            field: "outcome",
            phase: p,
            note: model.notes[key],
            pair,
            actionGroup: null,
          });
        }

        const suggestions = proposeInteractionInferences(targets);
        assert.strictEqual(
          suggestions.get(noteKeyForPair(pair, 1))?.outcome,
          undefined,
          "inferred anchors do not seed adjacency",
        );

        const optInTargets = targets.map((t) => ({
          ...t,
          allowInferredExisting: true,
        }));
        const optInSuggestions = proposeInteractionInferences(optInTargets);
        const adjacencySuggestion = optInSuggestions.get(
          noteKeyForPair(pair, 1),
        )?.outcome;

        assert.strictEqual(
          adjacencySuggestion?.value.outcomeId,
          outcome.id,
          "opt-in re-enables adjacency from inferred anchors",
        );
      },
    },
    {
      name: "phase adjacency fills multi-phase gaps with scaled confidence and respects eligibility",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Trace");
        action.phases = { ids: [0, 1, 2, 3, 4], labels: {} };
        const input = addInput("Mid");
        const outcome = addOutcome("Circle");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 1,
              variants: [{ variantSig: "", rowIndex: 0, rowCount: 1 }],
            },
          ],
          totalRows: 1,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: [""] },
        };

        const pair = getPair(model, 0);
        const startKey = noteKeyForPair(pair, 0);
        const endKey = noteKeyForPair(pair, 4);
        model.notes[startKey] = { outcomeId: outcome.id };
        model.notes[endKey] = { outcomeId: outcome.id };

        const targets = [];
        for (const phase of action.phases.ids) {
          const key = noteKeyForPair(pair, phase);
          targets.push({
            key,
            field: "outcome",
            phase,
            note: model.notes[key],
            pair,
            actionGroup: "",
          });
        }

        const inputKey = `in:${input.id}`;
        const profiles = {
          input: {
            [inputKey]: {
              outcome: {
                phases: {
                  1: {
                    change: 0,
                    noop: 5,
                    clear: 0,
                    values: { "o:999": { count: 5, value: { outcomeId: 999 } } },
                  },
                },
              },
            },
          },
        };

        const suggestions = proposeInteractionInferences(targets, profiles, {
          phaseAdjacencyMaxGap: 4,
        });

        const gapOne = suggestions.get(noteKeyForPair(pair, 1))?.outcome;
        const gapTwo = suggestions.get(noteKeyForPair(pair, 2))?.outcome;
        const gapThree = suggestions.get(noteKeyForPair(pair, 3))?.outcome;

        assert.ok(!gapOne, "profile preferences can skip adjacent gap phase");
        assert.ok(gapTwo, "middle gap receives suggestion");
        assert.ok(gapThree, "later interior gap receives suggestion");
        assert.strictEqual(
          gapTwo.source,
          HEURISTIC_SOURCES.phaseAdjacency,
          "phase adjacency source used for middle gap",
        );
        assert.strictEqual(gapTwo.value.outcomeId, outcome.id);
        assert.strictEqual(gapThree.source, HEURISTIC_SOURCES.phaseAdjacency);
        assert.strictEqual(gapThree.value.outcomeId, outcome.id);
        assert.ok(
          Math.abs(gapThree.confidence - 0.155) < 1e-9,
          "confidence scales down for longer gaps",
        );
        assert.deepStrictEqual(gapThree.sourceMetadata, {
          sources: [HEURISTIC_SOURCES.phaseAdjacency],
        });
      },
    },
    {
      name: "phase adjacency avoids gaps with conflicting interior phases",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Arc");
        action.phases = { ids: [0, 1, 2, 3], labels: {} };
        const input = addInput("Low");
        const outcome = addOutcome("Graze");
        const otherOutcome = addOutcome("Skip");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 1,
              variants: [{ variantSig: "", rowIndex: 0, rowCount: 1 }],
            },
          ],
          totalRows: 1,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: [""] },
        };

        const pair = getPair(model, 0);
        const startKey = noteKeyForPair(pair, 0);
        const endKey = noteKeyForPair(pair, 3);
        model.notes[startKey] = {
          outcomeId: outcome.id,
          source: HEURISTIC_SOURCES.actionGroup,
        };
        model.notes[endKey] = {
          outcomeId: outcome.id,
          source: HEURISTIC_SOURCES.actionGroup,
        };

        const conflictingKey = noteKeyForPair(pair, 1);
        model.notes[conflictingKey] = {
          outcomeId: otherOutcome.id,
          source: HEURISTIC_SOURCES.actionGroup,
        };

        const targets = [];
        for (const phase of action.phases.ids) {
          const key = noteKeyForPair(pair, phase);
          targets.push({
            key,
            field: "outcome",
            phase,
            note: model.notes[key],
            pair,
            actionGroup: "",
          });
        }

        const suggestions = proposeInteractionInferences(targets);
        const interiorSuggestion = suggestions.get(noteKeyForPair(pair, 2))?.outcome;
        assert.ok(
          !interiorSuggestion,
          "intervening differing values prevent spanning the gap",
        );
      },
    },
    {
      name: "phase adjacency can be disabled via threshold overrides",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Shelve");
        action.phases = { ids: [0, 1, 2], labels: {} };
        const input = addInput("Mid");
        const outcome = addOutcome("Hold");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 1,
              variants: [{ variantSig: "", rowIndex: 0, rowCount: 1 }],
            },
          ],
          totalRows: 1,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: [""] },
        };

        const pair = getPair(model, 0);
        model.notes[noteKeyForPair(pair, 0)] = {
          outcomeId: outcome.id,
          source: HEURISTIC_SOURCES.actionGroup,
        };
        model.notes[noteKeyForPair(pair, 2)] = {
          outcomeId: outcome.id,
          source: HEURISTIC_SOURCES.actionGroup,
        };

        const targets = action.phases.ids.map((phase) => ({
          key: noteKeyForPair(pair, phase),
          field: "outcome",
          phase,
          note: model.notes[noteKeyForPair(pair, phase)],
          pair,
          actionGroup: "",
        }));

        const overrides = {
          consensusMinGroupSize: 99,
          actionGroupMinGroupSize: 99,
          actionGroupPhaseMinGroupSize: 99,
          inputDefaultMinGroupSize: 99,
          phaseAdjacencyEnabled: false,
        };

        const suggestions = proposeInteractionInferences(targets, null, overrides);
        const gap = suggestions.get(noteKeyForPair(pair, 1))?.outcome;

        assert.ok(!gap, "disabling phase adjacency suppresses gap suggestions");
      },
    },
    {
      name: "phase adjacency respects tightened max gap threshold",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Strafe");
        action.phases = { ids: [0, 1, 2, 3], labels: {} };
        const input = addInput("High");
        const outcome = addOutcome("Glide");

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 1,
              variants: [{ variantSig: "", rowIndex: 0, rowCount: 1 }],
            },
          ],
          totalRows: 1,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: [""] },
        };

        const pair = getPair(model, 0);
        model.notes[noteKeyForPair(pair, 0)] = {
          outcomeId: outcome.id,
          source: HEURISTIC_SOURCES.actionGroup,
        };
        model.notes[noteKeyForPair(pair, 3)] = {
          outcomeId: outcome.id,
          source: HEURISTIC_SOURCES.actionGroup,
        };

        const targets = action.phases.ids.map((phase) => ({
          key: noteKeyForPair(pair, phase),
          field: "outcome",
          phase,
          note: model.notes[noteKeyForPair(pair, phase)],
          pair,
          actionGroup: "",
        }));

        const overrides = {
          consensusMinGroupSize: 99,
          actionGroupMinGroupSize: 99,
          actionGroupPhaseMinGroupSize: 99,
          inputDefaultMinGroupSize: 99,
          phaseAdjacencyMaxGap: 2,
          phaseAdjacencyEnabled: true,
        };

        const suggestions = proposeInteractionInferences(targets, null, overrides);
        const gapOne = suggestions.get(noteKeyForPair(pair, 1))?.outcome;
        const gapTwo = suggestions.get(noteKeyForPair(pair, 2))?.outcome;

        assert.ok(!gapOne, "gaps beyond the tightened max gap are ignored");
        assert.ok(!gapTwo, "interior gaps remain empty when max gap is too small");
      },
    },
    {
      name: "applyInference fills empty cells with heuristic metadata",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome } =
          makeModelFixture();
        const action = addAction("Strike");
        const modifier = addModifier("Swift");
        const outcome = addOutcome("Hit");
        const input = addInput("Jab");
        const viewDef = {
          columns: [{ key: "action" }, { key: "input" }, { key: "p1:outcome" }],
        };

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 2,
              variants: [
                { variantSig: "", rowIndex: 0, rowCount: 1 },
                { variantSig: `${modifier.id}`, rowIndex: 1, rowCount: 1 },
              ],
            },
          ],
          totalRows: 2,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: ["", `${modifier.id}`] },
        };

        const basePair = getPair(model, 0);
        const baseKey = noteKeyForPair(basePair, 1);
        model.notes[baseKey] = { outcomeId: outcome.id, source: "manual" };

        const selection = { rows: new Set(), colsAll: true };
        const controller = createInferenceController({
          model,
          selection,
          sel: { r: 0, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: { set() {} },
          runModelMutation: (label, mutate, opts = {}) => {
            const res = mutate();
            if (opts.status) res.status = opts.status(res);
            return res;
          },
          makeUndoConfig: () => ({}),
          getInteractionsPair: (m, r) => getInteractionsPair(m, r),
          getInteractionsRowCount: (m) => getInteractionsRowCount(m),
        });

        const res = controller.runInference({ scope: "project" });
        const inferredPair = getPair(model, 1);
        const inferredKey = noteKeyForPair(inferredPair, 1);
        const inferredNote = model.notes[inferredKey];

        assert.strictEqual(res.sources[HEURISTIC_SOURCES.modifierPropagation], 1);
        assert.strictEqual(inferredNote.outcomeId, outcome.id);
        assert.strictEqual(
          inferredNote.source,
          HEURISTIC_SOURCES.modifierPropagation,
          "heuristic source stored on inferred note",
        );
        assert.strictEqual(
          inferredNote.confidence,
          0.41,
          "heuristic confidence scales with agreement",
        );
        assert.ok(
          /modifier propagation: 1/.test(res.status || ""),
          "status text lists heuristic count",
        );
      },
    },
    {
      name: "inference emits status once through mutation runner",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        addAction("Strike");
        addInput("High");
        addOutcome("Hit");
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [
            { key: "action" },
            { key: "input" },
            { key: "p0:outcome" },
          ],
        };

        const statusBar = {
          messages: [],
          set(msg) {
            this.messages.push(msg);
          },
        };

        const controller = createInferenceController({
          model,
          selection: { rows: new Set([0]), colsAll: true },
          sel: { r: 0, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar,
          runModelMutation: (label, mutate, opts = {}) => {
            const res = mutate();
            if (typeof opts.status === "function") {
              const message = opts.status(res);
              if (message) statusBar.set(message);
            }
            return res;
          },
          makeUndoConfig: () => ({}),
          getInteractionsPair: (m, r) => getInteractionsPair(m, r),
          getInteractionsRowCount: (m) => getInteractionsRowCount(m),
        });

        const res = controller.runInference({ scope: "project" });
        assert.ok(res.status, "status text produced by formatter");
        assert.deepStrictEqual(
          statusBar.messages,
          [res.status],
          "status applied exactly once",
        );
      },
    },
    {
      name: "bypass inference respects selection rows from base index",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome, groupExact } =
          makeModelFixture();
        const modifier = addModifier("Bypassable");
        addAction("Base", { [modifier.id]: MOD_STATE_ID.BYPASS });
        const target = addAction("Target");
        const inputA = addInput("High");
        addInput("Low");
        const outcome = addOutcome("Hit");

        groupExact(1, [modifier], { required: false, name: "Bypassable" });

        buildInteractionsPairs(model);
        buildInteractionsPairs(model, {
          includeBypass: true,
          targetIndexField: "interactionsIndexBypass",
        });

        const sourcePair = getInteractionsPair(model, 0);
        const sourceKey = noteKeyForPair(sourcePair, 0);
        model.notes[sourceKey] = {
          outcomeId: outcome.id,
          source: DEFAULT_INTERACTION_SOURCE,
        };

        const targetPair = getInteractionsPair(model, 2);
        const targetKey = noteKeyForPair(targetPair, 0);
        assert.ok(!model.notes[targetKey], "target row starts empty");

        const viewDef = {
          columns: [
            { key: "action" },
            { key: "input" },
            { key: "p0:outcome" },
          ],
        };
        const includeBypassCalls = [];
        const controller = createInferenceController({
          model,
          selection: { rows: new Set([2]), colsAll: true },
          sel: { r: 2, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: { set() {} },
          runModelMutation: (label, mutate) => mutate(),
          makeUndoConfig: () => ({}),
          getInteractionsPair: (m, r, opts) => {
            includeBypassCalls.push(!!opts?.includeBypass);
            return getInteractionsPair(m, r, opts);
          },
          getInteractionsRowCount: (m, opts) => {
            includeBypassCalls.push(!!opts?.includeBypass);
            return getInteractionsRowCount(m, opts);
          },
        });

        const res = controller.runInference({
          scope: "selection",
          inferFromBypassed: true,
          inferToBypassed: true,
          thresholdOverrides: {
            consensusMinGroupSize: 1,
            consensusMinExistingRatio: 0,
            actionGroupMinGroupSize: 1,
            actionGroupMinExistingRatio: 0,
            inputDefaultMinGroupSize: 1,
            inputDefaultMinExistingRatio: 0,
          },
        });

        assert.strictEqual(
          model.notes[targetKey]?.outcomeId,
          outcome.id,
          "selection row mapped into bypass index targets expected pair",
        );
        assert.ok(res.applied >= 1, "inference applied after bypass remap");
        assert.ok(
          includeBypassCalls.some(Boolean),
          "bypass flags forwarded through selection run",
        );
        assert.strictEqual(
          targetPair?.aId,
          target.id,
          "selection still resolves to target action id",
        );
        assert.strictEqual(
          targetPair?.iId,
          inputA.id,
          "selection still resolves to target input id",
        );
      },
    },
    {
      name: "rebuilds bypass indexes after cleanup before inference",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome, groupExact } =
          makeModelFixture();
        const modifier = addModifier("Bypassable");
        const source = addAction("Base", { [modifier.id]: MOD_STATE_ID.BYPASS });
        const target = addAction("Target");
        const input = addInput("High");
        const outcome = addOutcome("Hit");

        groupExact(1, [modifier], { required: false, name: "Bypassable" });

        buildInteractionsPairs(model);

        const bypassPair = {
          kind: "AI",
          aId: source.id,
          iId: input.id,
          variantSig: String(modifier.id),
        };
        const bypassKey = noteKeyForPair(bypassPair, 0);
        model.notes[bypassKey] = {
          outcomeId: outcome.id,
          source: DEFAULT_INTERACTION_SOURCE,
        };

        delete model.interactionsIndexBypass;
        delete model.interactionsIndexBypassScoped;
        delete model.interactionsIndexBypassCache;
        delete model.interactionsIndexBypassScopedCache;

        const targetRow = findPairIndex(model, (p) => p.aId === target.id);
        assert.ok(targetRow >= 0, "target row found in base index");
        const viewDef = {
          columns: [
            { key: "action" },
            { key: "input" },
            { key: "p0:outcome" },
          ],
        };
        const controller = createInferenceController({
          model,
          selection: { rows: new Set([targetRow]), colsAll: true },
          sel: { r: targetRow, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: { set() {} },
          runModelMutation: (label, mutate) => mutate(),
          makeUndoConfig: () => ({}),
          getInteractionsPair: (m, r, opts) => getInteractionsPair(m, r, opts),
          getInteractionsRowCount: (m, opts) => getInteractionsRowCount(m, opts),
        });

        const res = controller.runInference({
          scope: "project",
          inferFromBypassed: true,
          inferToBypassed: true,
          thresholdOverrides: {
            consensusMinGroupSize: 1,
            consensusMinExistingRatio: 0,
            actionGroupMinGroupSize: 1,
            actionGroupMinExistingRatio: 0,
            inputDefaultMinGroupSize: 1,
            inputDefaultMinExistingRatio: 0,
          },
        });

        const bypassIndex = model.interactionsIndexBypass;
        const rebuiltPair = (() => {
          const total = Number(bypassIndex?.totalRows) || 0;
          for (let i = 0; i < total; i++) {
            const pair = getInteractionsPair(model, i, {
              includeBypass: true,
              index: bypassIndex,
            });
            if (pair?.aId === source.id && pair?.variantSig === String(modifier.id))
              return pair;
          }
          return null;
        })();

        assert.ok(
          Array.isArray(bypassIndex?.groups),
          "bypass index rebuilt for inference run",
        );
        assert.ok(rebuiltPair, "rebuilt bypass index exposes bypass pair");
        assert.ok(
          model.notes[noteKeyForPair(rebuiltPair, 0)],
          "bypass note remains accessible after rebuild",
        );
        assert.ok(res, "inference run completed after bypass rebuild");
      },
    },
    {
      name: "bypass cache invalidates after base index rebuild",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome, groupExact } =
          makeModelFixture();
        const modifier = addModifier("Bypassable");
        const source = addAction("Bypassed", { [modifier.id]: MOD_STATE_ID.BYPASS });
        addAction("Other");
        const input = addInput("High");
        const outcome = addOutcome("Hit");

        groupExact(1, [modifier], { required: false, name: "Bypassable" });

        buildInteractionsPairs(model);
        buildInteractionsPairs(model, {
          includeBypass: true,
          targetIndexField: "interactionsIndexBypass",
        });

        const target = addAction("Target");
        buildInteractionsPairs(model); // rebuild base after adding target

        const sourceRow = findPairIndex(
          model,
          (p) => p.aId === source.id && p.iId === input.id,
        );
        const sourcePair = getInteractionsPair(model, sourceRow);
        const sourceKey = noteKeyForPair(sourcePair, 0);
        model.notes[sourceKey] = {
          outcomeId: outcome.id,
          source: DEFAULT_INTERACTION_SOURCE,
        };

        const targetRow = findPairIndex(
          model,
          (p) => p.aId === target.id && p.iId === input.id,
        );
        const targetPair = getInteractionsPair(model, targetRow);
        const targetKey = noteKeyForPair(targetPair, 0);

        const viewDef = {
          columns: [
            { key: "action" },
            { key: "input" },
            { key: "p0:outcome" },
          ],
        };
        const controller = createInferenceController({
          model,
          selection: { rows: new Set([targetRow]), colsAll: true },
          sel: { r: targetRow, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: { set() {} },
          runModelMutation: (label, mutate) => mutate(),
          makeUndoConfig: () => ({}),
          getInteractionsPair,
          getInteractionsRowCount,
        });

        const res = controller.runInference({
          scope: "selection",
          inferFromBypassed: true,
          inferToBypassed: true,
          thresholdOverrides: {
            consensusMinGroupSize: 1,
            consensusMinExistingRatio: 0,
            actionGroupMinGroupSize: 1,
            actionGroupMinExistingRatio: 0,
            inputDefaultMinGroupSize: 1,
            inputDefaultMinExistingRatio: 0,
          },
        });

        assert.strictEqual(
          model.notes[targetKey]?.outcomeId,
          outcome.id,
          "bypass cache rebuilt after base index change",
        );
        assert.ok(res.applied >= 1, "inference applied after cache rebuild");
      },
    },
    {
      name: "inference can source bypass variants when opted in",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome, groupExact } =
          makeModelFixture();
        const modifier = addModifier("Bypassable");
        const action = addAction("Strike", { [modifier.id]: MOD_STATE_ID.BYPASS });
        const input = addInput("High");
        const outcome = addOutcome("Hit");

        groupExact(1, [modifier], { required: false, name: "Bypassable" });

        buildInteractionsPairs(model);
        buildInteractionsPairs(model, {
          includeBypass: true,
          targetIndexField: "interactionsIndexBypass",
        });

        const bypassPair = getInteractionsPair(model, 1, { includeBypass: true });
        assert.ok(bypassPair, "bypass pair available when opt-in index is built");
        const bypassKey = noteKeyForPair(bypassPair, 0);
        model.notes[bypassKey] = {
          outcomeId: outcome.id,
          source: DEFAULT_INTERACTION_SOURCE,
        };

        const basePair = getInteractionsPair(model, 0, { includeBypass: true });
        const baseKey = noteKeyForPair(basePair, 0);

        const viewDef = {
          columns: [
            { key: "action" },
            { key: "input" },
            { key: "p0:outcome" },
          ],
        };
        const includeBypassCalls = [];
        const controller = createInferenceController({
          model,
          selection: { rows: new Set([0]), colsAll: true },
          sel: { r: 0, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: { set() {} },
          runModelMutation: (label, mutate, opts = {}) => {
            const res = mutate();
            if (opts.status) res.status = opts.status(res);
            return res;
          },
          makeUndoConfig: () => ({}),
          getInteractionsPair: (m, r, opts) => {
            includeBypassCalls.push(!!opts?.includeBypass);
            return getInteractionsPair(m, r, opts);
          },
          getInteractionsRowCount: (m, opts) => {
            includeBypassCalls.push(!!opts?.includeBypass);
            return getInteractionsRowCount(m, opts);
          },
        });

        controller.runInference({ scope: "project" });
        assert.ok(!model.notes[baseKey], "legacy path ignores bypass-only sources");

        const res = controller.runInference({
          scope: "project",
          inferFromBypassed: true,
          inferToBypassed: true,
          thresholdOverrides: {
            consensusMinGroupSize: 1,
            consensusMinExistingRatio: 0,
            actionGroupMinGroupSize: 1,
            actionGroupMinExistingRatio: 0,
            inputDefaultMinGroupSize: 1,
            inputDefaultMinExistingRatio: 0,
          },
        });

        assert.strictEqual(
          model.notes[baseKey]?.outcomeId,
          outcome.id,
          "base variant inferred from bypass source when opt-in enabled",
        );
        assert.ok(
          includeBypassCalls.some(Boolean),
          "inference passes bypass-inclusive flag to accessors",
        );
        assert.ok((res?.applied || 0) >= 1, "inference applied at least one change");
      },
    },
    {
      name: "clear inference targets bypass rows when opted in",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome, groupExact } =
          makeModelFixture();
        const modifier = addModifier("Bypassable");
        const action = addAction("Sweep", { [modifier.id]: MOD_STATE_ID.BYPASS });
        addInput("Light");
        const outcome = addOutcome("Graze");

        groupExact(1, [modifier], { required: false, name: "Bypassable" });

        buildInteractionsPairs(model);
        buildInteractionsPairs(model, {
          includeBypass: true,
          targetIndexField: "interactionsIndexBypass",
        });

        const bypassPair = getInteractionsPair(model, 1, { includeBypass: true });
        assert.ok(bypassPair, "bypass row present when index includes marked modifiers");
        const bypassKey = noteKeyForPair(bypassPair, 0);
        model.notes[bypassKey] = {
          outcomeId: outcome.id,
          source: HEURISTIC_SOURCES.modifierPropagation,
        };

        const viewDef = {
          columns: [
            { key: "action" },
            { key: "input" },
            { key: "p0:outcome" },
          ],
        };
        const includeBypassCalls = [];
        const controller = createInferenceController({
          model,
          selection: { rows: new Set([0]), colsAll: true },
          sel: { r: 0, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: { set() {} },
          runModelMutation: (label, mutate) => mutate(),
          makeUndoConfig: () => ({}),
          getInteractionsPair: (m, r, opts) => getInteractionsPair(m, r, opts),
          getInteractionsRowCount: (m, opts) => {
            includeBypassCalls.push(!!opts?.includeBypass);
            return getInteractionsRowCount(m, opts);
          },
        });

        const baseClear = controller.runClear({ scope: "project" });
        assert.strictEqual(baseClear.cleared, 0, "legacy clear ignores bypass rows");
        assert.ok(!includeBypassCalls.some(Boolean), "bypass flag stays off by default");

        const bypassClear = controller.runClear({
          scope: "project",
          inferFromBypassed: true,
          inferToBypassed: true,
        });

        assert.strictEqual(
          bypassClear.cleared,
          1,
          "bypass-inclusive clear removes inferred bypass note",
        );
        assert.ok(
          includeBypassCalls.some(Boolean),
          "bypass-inclusive flag forwarded to row counter",
        );
        assert.ok(!model.notes[bypassKey], "bypass note cleared after opt-in run");
      },
    },
    {
      name: "bypass inference on large selections matches baseline speed and counts",
      run(assert) {
        function buildRun(options = {}) {
          const {
            model,
            addAction,
            addInput,
            addModifier,
            addOutcome,
            groupExact,
          } = makeModelFixture();
          const modifier = addModifier("Bypassable");
          const outcome = addOutcome("Hit");
          groupExact(1, [modifier], { required: false, name: "Bypassable" });

          Array.from({ length: 4 }, (_, idx) => addInput(`Input ${idx + 1}`));
          const bypassActionIds = new Set();
          Array.from({ length: 24 }, (_, idx) => {
            const modSet = idx % 2 ? { [modifier.id]: MOD_STATE_ID.BYPASS } : {};
            const action = addAction(`Action ${idx + 1}`, modSet);
            if (modSet[modifier.id] === MOD_STATE_ID.BYPASS)
              bypassActionIds.add(action.id);
          });

          buildInteractionsPairs(model);
          buildInteractionsPairs(model, {
            includeBypass: true,
            targetIndexField: "interactionsIndexBypass",
          });

          const baseRowCount = getInteractionsRowCount(model);
          for (let row = 0; row < baseRowCount; row += 6) {
            const pair = getInteractionsPair(model, row);
            const key = noteKeyForPair(pair, 0);
            model.notes[key] = {
              outcomeId: outcome.id,
              source: DEFAULT_INTERACTION_SOURCE,
            };
          }

          const selectionRows = new Set(
            Array.from({ length: Math.min(baseRowCount, 120) }, (_, idx) => idx),
          );
          const bypassRow = findPairIndex(
            model,
            (pair) => pair?.variantSig === String(modifier.id),
          );
          if (bypassRow >= 0) selectionRows.add(bypassRow);
          const viewDef = {
            columns: [
              { key: "action" },
              { key: "input" },
              { key: "p1:outcome" },
            ],
          };

          const calls = [];
          const controller = createInferenceController({
            model,
            selection: { rows: selectionRows, colsAll: true },
            sel: { r: 0, c: 2 },
            getActiveView: () => "interactions",
            viewDef: () => viewDef,
            statusBar: { set() {} },
            runModelMutation: (label, mutate) => mutate(),
            makeUndoConfig: () => ({}),
            getInteractionsPair: (m, r, opts) => getInteractionsPair(m, r, opts),
            getInteractionsRowCount: (m, opts = {}) => {
              const count = getInteractionsRowCount(m, opts);
              calls.push({
                includeBypass: !!opts?.includeBypass,
                indexTotal: opts?.index?.totalRows,
                count,
              });
              return count;
            },
          });

          const start = performance.now();
          const res = controller.runInference({
            scope: "selection",
            thresholdOverrides: {
              consensusMinGroupSize: 1,
              consensusMinExistingRatio: 0,
              actionGroupMinGroupSize: 1,
              actionGroupMinExistingRatio: 0,
              inputDefaultMinGroupSize: 1,
              inputDefaultMinExistingRatio: 0,
            },
            ...options,
          });
          const elapsed = performance.now() - start;
          const bypassSelected = Array.from(selectionRows).some((row) => {
            const pair = getInteractionsPair(model, row);
            return pair?.aId && bypassActionIds.has(pair.aId);
          });

          return { res, elapsed, model, calls, selectionSize: selectionRows.size, bypassSelected };
        }

        const baseRun = buildRun();
        const bypassRun = buildRun({ inferFromBypassed: true, inferToBypassed: true });

        assert.ok(baseRun.selectionSize > 30, "covers large selection set");
        assert.ok(baseRun.bypassSelected, "selection includes bypassed actions");
        assert.strictEqual(
          baseRun.res?.applied || 0,
          bypassRun.res?.applied || 0,
          "bypass inference matches applied count from baseline run",
        );
        assert.strictEqual(
          baseRun.res?.empty || 0,
          bypassRun.res?.empty || 0,
          "bypass inference counts empties same as baseline",
        );

        const bypassIndexSize = bypassRun.model.interactionsIndexBypass?.totalRows;
        const bypassCounts = bypassRun.calls
          .filter((call) => call.includeBypass && Number.isFinite(call.indexTotal))
          .map((call) => call.indexTotal);
        assert.ok(
          bypassCounts.length && bypassCounts.every((count) => count === bypassIndexSize),
          "full bypass index used for inference run",
        );

        const runtimeBuffer = Math.max(5, baseRun.elapsed * 0.5);
        assert.ok(
          bypassRun.elapsed <= baseRun.elapsed + runtimeBuffer,
          "bypass run stays within baseline runtime budget",
        );
      },
    },
    {
      name: "bypass inference honors scoped selection suggestions",
      run(assert) {
        function buildRun(enableBypass = false) {
          const { model, addAction, addInput, addModifier, addOutcome, groupExact } =
            makeModelFixture();

          const modifier = addModifier("Bypassable");
          const outcome = addOutcome("Hit");
          const inputs = Array.from({ length: 6 }, (_, idx) =>
            addInput(`Input ${idx + 1}`),
          );

          groupExact(1, [modifier], { required: false, name: "Bypassable" });

          const sharedActions = Array.from({ length: 4 }, (_, idx) => {
            const action = addAction(`Shared ${idx + 1}`, {});
            action.actionGroup = "Shared";
            return action;
          });

          Array.from({ length: 24 }, (_, idx) => {
            const modSet = idx % 3 === 0 ? { [modifier.id]: MOD_STATE_ID.BYPASS } : {};
            const action = addAction(`Action ${idx + 1}`, modSet);
          });

          buildInteractionsPairs(model);
          buildInteractionsPairs(model, {
            includeBypass: true,
            targetIndexField: "interactionsIndexBypass",
          });

          const viewDef = {
            columns: [{ key: "action" }, { key: "input" }, { key: "p0:outcome" }],
          };

          const sourceRow = findPairIndex(
            model,
            (pair) => pair?.aId === sharedActions[0].id && pair?.iId === inputs[0].id,
          );
          const sourcePair = getInteractionsPair(model, sourceRow, {
            includeBypass: enableBypass,
          });
          const sourceKey = noteKeyForPair(sourcePair, 0);
          model.notes[sourceKey] = {
            outcomeId: outcome.id,
            source: DEFAULT_INTERACTION_SOURCE,
          };

          const targetRow = findPairIndex(
            model,
            (pair) => pair?.aId === sharedActions[1].id && pair?.iId === inputs[0].id,
          );
          const selectionRows = new Set();
          const selectedActions = new Set([sharedActions[0].id, sharedActions[1].id]);
          const baseRowCount = getInteractionsRowCount(model);
          for (let r = 0; r < baseRowCount; r++) {
            const pair = getInteractionsPair(model, r);
            if (pair && selectedActions.has(pair.aId)) selectionRows.add(r);
          }
          const selection = { rows: selectionRows, colsAll: true };

          let pairCalls = 0;
          const controller = createInferenceController({
            model,
            selection,
            sel: { r: targetRow, c: 2 },
            getActiveView: () => "interactions",
            viewDef: () => viewDef,
            statusBar: { set() {} },
            runModelMutation: (label, mutate) => mutate(),
            makeUndoConfig: () => ({}),
            getInteractionsPair: (m, r, opts) => {
              pairCalls++;
              return getInteractionsPair(m, r, opts);
            },
            getInteractionsRowCount: (m, opts) => getInteractionsRowCount(m, opts),
          });

          const totalRows = getInteractionsRowCount(model, { includeBypass: enableBypass });

          const res = controller.runInference({
            scope: "selection",
            inferFromBypassed: enableBypass,
            inferToBypassed: enableBypass,
            thresholdOverrides: {
              consensusMinGroupSize: 1,
              consensusMinExistingRatio: 0,
              actionGroupMinGroupSize: 1,
              actionGroupMinExistingRatio: 0,
            },
          });

          return { res, pairCalls, totalRows };
        }

        const baseline = buildRun(false);
        const bypass = buildRun(true);

        assert.ok(
          baseline.res.applied >= 1,
          "baseline inference applies within scoped selection",
        );
        assert.strictEqual(
          bypass.res.applied,
          baseline.res.applied,
          "bypass run keeps applied count stable",
        );
        assert.strictEqual(
          bypass.res.empty,
          baseline.res.empty,
          "bypass run preserves empty count",
        );
        assert.ok(
          bypass.pairCalls <= baseline.pairCalls * 4,
          `bypass run avoids ballooning lookups on scoped selections (baseline: ${baseline.pairCalls}, bypass: ${bypass.pairCalls})`,
        );
      },
    },
    {
      name: "profile trends ignore reverted inference edits",
      run(assert) {
        const { model, addAction, addInput, addModifier, addOutcome } =
          makeModelFixture();
        resetInferenceProfiles(model.inferenceProfiles);
        const action = addAction("Strike");
        const modifier = addModifier("Swift");
        const outcome = addOutcome("Hit");
        const input = addInput("Jab");
        const viewDef = {
          columns: [{ key: "action" }, { key: "input" }, { key: "p1:outcome" }],
        };

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 2,
              variants: [
                { variantSig: "", rowIndex: 0, rowCount: 1 },
                { variantSig: `${modifier.id}`, rowIndex: 1, rowCount: 1 },
              ],
            },
          ],
          totalRows: 2,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: ["", `${modifier.id}`] },
        };

        const status = { set() {} };
        setInteractionsCell(model, status, viewDef, 0, 2, {
          outcomeId: outcome.id,
          source: "manual",
        });

        const inputKey = `in:${input.id}`;
        const manualSnapshot = captureInferenceProfilesSnapshot(
          model.inferenceProfiles,
        );
        const manualChange = manualSnapshot.input[inputKey].outcome.all.change;
        const decayFactor = 0.94;
        assert.ok(
          manualChange > 0.9 && manualChange <= 1,
          "manual edits populate profile counts once",
        );

        const undoStack = [];
        const runModelMutation = (label, mutate, options = {}) => {
          const beforeNotes = structuredClone(model.notes);
          const result = mutate();
          const shouldRecord =
            typeof options.shouldRecord === "function"
              ? options.shouldRecord(result)
              : typeof options.undo?.shouldRecord === "function"
                ? options.undo.shouldRecord(result)
                : true;
          if (shouldRecord) {
            undoStack.push(() => {
              model.notes = structuredClone(beforeNotes);
            });
          }
          if (typeof options.status === "function") {
            result.status = options.status(result);
          }
          return result;
        };

        const selection = { rows: new Set(), colsAll: true };
        const controller = createInferenceController({
          model,
          selection,
          sel: { r: 0, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: status,
          runModelMutation,
          makeUndoConfig: (opts = {}) => opts,
          getInteractionsPair: (m, r) => getInteractionsPair(m, r),
          getInteractionsRowCount: (m) => getInteractionsRowCount(m),
          heuristicThresholds: { profileTrendMinObservations: 1 },
        });

        const res = controller.runInference({ scope: "project" });
        assert.strictEqual(res.applied, 1, "inference applies propagated value");

        const snapshotAfterInference = captureInferenceProfilesSnapshot(
          model.inferenceProfiles,
        );
        const inferenceChange = snapshotAfterInference.input[inputKey].outcome.all.change;
        assert.ok(
          Math.abs(inferenceChange / manualChange - decayFactor * decayFactor) < 1e-9,
          "inferred edits do not inflate profile counts",
        );

        const undo = undoStack.pop();
        if (undo) undo();

        const snapshotAfterUndo = captureInferenceProfilesSnapshot(
          model.inferenceProfiles,
        );
        const undoChange = snapshotAfterUndo.input[inputKey].outcome.all.change;
        assert.ok(
          Math.abs(undoChange / inferenceChange - decayFactor) < 1e-9,
          "undoing inference leaves profiles with manual edits only",
        );

        const inferredPair = getPair(model, 1);
        const inferredKey = noteKeyForPair(inferredPair, 1);
        const targets = [
          {
            key: inferredKey,
            field: "outcome",
            phase: 1,
            note: model.notes[inferredKey],
            pair: inferredPair,
            actionGroup: "",
          },
        ];
        const suggestions = proposeInteractionInferences(targets, snapshotAfterUndo, {
          profileTrendMinObservations: 2,
          profileTrendMinPreferenceRatio: 0,
        });
        const suggestion = suggestions.get(inferredKey)?.outcome;
        assert.ok(
          suggestion == null || suggestion.source !== HEURISTIC_SOURCES.profileTrend,
          "profile trend is gated without additional manual observations",
        );
      },
    },
    {
      name: "inference ignores phases not defined on the action",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Guard");
        action.phases = { ids: [0], labels: {} };
        const input = addInput("Brace");
        const outcome = addOutcome("Hold");
        const viewDef = {
          columns: [
            { key: "action" },
            { key: "input" },
            { key: "p0:outcome" },
            { key: "p1:outcome" },
          ],
        };

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 1,
              variants: [{ variantSig: "", rowIndex: 0, rowCount: 1 }],
            },
          ],
          totalRows: 1,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: [""] },
        };

        const pair = getPair(model, 0);
        const allowedKey = noteKeyForPair(pair, 0);
        const blockedKey = noteKeyForPair(pair, 1);
        model.notes[allowedKey] = { outcomeId: outcome.id, source: "auto" };
        model.notes[blockedKey] = { outcomeId: outcome.id, source: "auto" };

        const selection = { rows: new Set([0]), colsAll: true };
        const controller = createInferenceController({
          model,
          selection,
          sel: { r: 0, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: { set() {} },
          runModelMutation: (label, mutate, opts = {}) => {
            const res = mutate();
            if (opts.status) res.status = opts.status(res);
            return res;
          },
          makeUndoConfig: () => ({}),
          getInteractionsPair: (m, r) => getInteractionsPair(m, r),
          getInteractionsRowCount: (m) => getInteractionsRowCount(m),
        });

        const res = controller.runClear({ scope: "project" });

        assert.strictEqual(res.cleared, 1);
        assert.ok(!model.notes[allowedKey], "clears phases defined for action");
        assert.deepStrictEqual(
          model.notes[blockedKey],
          { outcomeId: outcome.id, source: "auto" },
          "preserves notes for phases outside action range",
        );
      },
    },
    {
      name: "inference skips end/tag when manual outcome uses defaults and skip option",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        addAction("Strike");
        addInput("Jab");
        const outcome = addOutcome("Hit");
        buildInteractionsPairs(model);
        const viewDef = {
          columns: [
            { key: "action" },
            { key: "input" },
            { key: "p0:outcome" },
            { key: "p0:end" },
            { key: "p0:tag" },
          ],
        };

        const pair = getPair(model, 0);
        const noteKey = noteKeyForPair(pair, 0);
        model.notes[noteKey] = { outcomeId: outcome.id };

        const selection = { rows: new Set(), colsAll: true };
        const controller = createInferenceController({
          model,
          selection,
          sel: { r: 0, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: { set() {} },
          runModelMutation: (label, mutate, opts = {}) => {
            const res = mutate();
            if (opts.status) res.status = opts.status(res);
            return res;
          },
          makeUndoConfig: () => ({}),
          getInteractionsPair: (m, r) => getInteractionsPair(m, r),
          getInteractionsRowCount: (m) => getInteractionsRowCount(m),
        });

        const res = controller.runInference({
          scope: "project",
          skipManualOutcome: true,
        });

        assert.strictEqual(res.applied, 0, "no inference applied to manual phase");
        assert.strictEqual(res.skippedManual, 1, "manual outcome skipped");
        assert.strictEqual(
          res.skippedManualOutcome,
          2,
          "end and tag skipped when manual outcome present",
        );
        assert.strictEqual(res.empty, 0, "skipped cells not treated as empty");
        assert.deepStrictEqual(
          model.notes[noteKey],
          { outcomeId: outcome.id },
          "notes unchanged when skipping manual outcome phase",
        );
      },
    },
    {
      name: "selection scope infers end/tag when toggles enabled",
      run(assert) {
        const { model, addAction, addInput, addModifier } = makeModelFixture();
        const action = addAction("Strike");
        const followUp = addAction("Follow up");
        const input = addInput("High");
        const modifier = addModifier("Swift");
        const viewDef = {
          columns: [
            { key: "action" },
            { key: "input" },
            { key: "p0:outcome" },
            { key: "p0:end" },
            { key: "p0:tag" },
          ],
        };

        model.interactionsIndex = {
          mode: "AI",
          groups: [
            {
              actionId: action.id,
              rowIndex: 0,
              totalRows: 2,
              variants: [
                { variantSig: "", rowIndex: 0, rowCount: 1 },
                { variantSig: `${modifier.id}`, rowIndex: 1, rowCount: 1 },
              ],
            },
          ],
          totalRows: 2,
          actionsOrder: [action.id],
          inputsOrder: [input.id],
          variantCatalog: { [action.id]: ["", `${modifier.id}`] },
        };

        const basePair = getPair(model, 0);
        const baseKey = noteKeyForPair(basePair, 0);
        model.notes[baseKey] = {
          endActionId: followUp.id,
          endVariantSig: "",
          tags: ["Stun"],
        };

        const selection = { rows: new Set([1]), cols: new Set([2]), colsAll: false };
        const controller = createInferenceController({
          model,
          selection,
          sel: { r: 1, c: 2 },
          getActiveView: () => "interactions",
          viewDef: () => viewDef,
          statusBar: { set() {} },
          runModelMutation: (label, mutate, opts = {}) => {
            const res = mutate();
            if (opts.status) res.status = opts.status(res);
            return res;
          },
          makeUndoConfig: () => ({}),
          getInteractionsPair: (m, r) => getInteractionsPair(m, r),
          getInteractionsRowCount: (m) => getInteractionsRowCount(m),
        });

        const res = controller.runInference({ scope: "selection" });

        const targetPair = getPair(model, 1);
        const targetKey = noteKeyForPair(targetPair, 0);
        const targetNote = model.notes[targetKey];

        assert.strictEqual(res.applied, 2, "applies end and tag suggestions");
        assert.strictEqual(res.empty, 1, "counts missing outcome suggestions as empty");
        assert.strictEqual(
          res.sources[HEURISTIC_SOURCES.modifierPropagation],
          2,
          "tracks heuristic source for end/tag suggestions",
        );
        assert.strictEqual(targetNote.endActionId, followUp.id);
        assert.strictEqual(targetNote.endVariantSig, "");
        assert.deepStrictEqual(targetNote.tags, ["Stun"]);
        assert.strictEqual(targetNote.source, HEURISTIC_SOURCES.modifierPropagation);
      },
    },
    {
      name: "bulk actions promote or clear inferred values without touching manual cells",
      run(assert) {
        const { model, addAction, addInput, addOutcome } = makeModelFixture();
        const action = addAction("Strike");
        const followUp = addAction("Follow");
        const inputPrimary = addInput("High");
        const inputSecondary = addInput("Low");
        const inferredOutcome = addOutcome("Hit");
        const manualOutcome = addOutcome("Block");
        buildInteractionsPairs(model);
        const viewDef = makeInteractionsView();

        const inferredRow = findPairIndex(
          model,
          (pair) => pair.aId === action.id && pair.iId === inputPrimary.id,
        );
        const manualRow = findPairIndex(
          model,
          (pair) => pair.aId === followUp.id && pair.iId === inputSecondary.id,
        );
        assert.ok(inferredRow >= 0 && manualRow >= 0, "target rows exist");

        setInteractionsCell(model, { set() {} }, viewDef, inferredRow, 2, {
          outcomeId: inferredOutcome.id,
          confidence: 0.6,
          source: "model",
        });
        setInteractionsCell(model, { set() {} }, viewDef, manualRow, 2, {
          outcomeId: manualOutcome.id,
        });

        const selection = {
          rows: new Set([inferredRow, manualRow]),
          cols: new Set([2]),
          colsAll: false,
        };
        const sel = { r: inferredRow, c: 2 };

        const runModelMutation = (label, mutate, options = {}) => {
          const res = mutate();
          if (options.status) res.status = options.status(res);
          return res;
        };

        const actions = createInteractionBulkActions({
          model,
          selection,
          sel,
          getActiveView: () => "interactions",
          viewDef,
          runModelMutation,
          getInteractionsPair: (m, r) => getPair(m, r),
        });

        const acceptResult = actions.acceptInferred();
        const inferredKey = noteKeyForPair(getPair(model, inferredRow), 1);
        const manualKey = noteKeyForPair(getPair(model, manualRow), 1);

        assert.strictEqual(acceptResult.promoted, 1, "inferred cell promoted");
        assert.ok(
          /Promoted/.test(acceptResult.status || ""),
          "status conveys promotion",
        );
        assert.strictEqual(
          "source" in model.notes[inferredKey],
          false,
          "manual source cleared after promotion",
        );
        assert.strictEqual(
          "confidence" in model.notes[inferredKey],
          false,
          "default confidence omitted after promotion",
        );

        setInteractionsCell(model, { set() {} }, viewDef, inferredRow, 2, {
          outcomeId: inferredOutcome.id,
          confidence: 0.5,
          source: "model",
        });

        const clearResult = actions.clearInferenceMetadata();
        assert.strictEqual(clearResult.cleared, 1, "inferred value cleared");
        assert.strictEqual(
          model.notes[inferredKey],
          undefined,
          "inferred note removed after clearing",
        );
        assert.strictEqual(
          model.notes[manualKey].outcomeId,
          manualOutcome.id,
          "manual note left intact",
        );
        assert.ok(
          /Cleared/.test(clearResult.status || ""),
          "status conveys clearing",
        );
      },
    },
  ];
}
