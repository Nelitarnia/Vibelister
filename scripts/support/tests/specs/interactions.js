import {
  noteKeyForPair,
  getInteractionsCell,
  setInteractionsCell,
  getStructuredCellInteractions,
  applyStructuredCellInteractions,
  clearInteractionsCell,
  clearInteractionsSelection,
  isInteractionPhaseColumnActiveForRow,
} from "../../../app/interactions.js";
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
        const row = model.interactionsPairs.findIndex(
          (pair) => pair.aId === left.id && pair.rhsActionId === right.id,
        );
        const mirrorRow = model.interactionsPairs.findIndex(
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
        const mirrorKey = noteKeyForPair(
          model.interactionsPairs[mirrorRow],
          0,
        );
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
        const sourceKey = noteKeyForPair(model.interactionsPairs[row], 0);
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
        const row = model.interactionsPairs.findIndex(
          (pair) => pair.aId === left.id && pair.rhsActionId === right.id,
        );
        const mirrorRow = model.interactionsPairs.findIndex(
          (pair) => pair.aId === right.id && pair.rhsActionId === left.id,
        );
        assert.ok(row >= 0 && mirrorRow >= 0, "expected AA pairs present");
        const status = { set() {} };

        setInteractionsCell(model, status, viewDef, row, 2, win.id);
        const mirrorKey = noteKeyForPair(model.interactionsPairs[mirrorRow], 0);
        const sourceKey = noteKeyForPair(model.interactionsPairs[row], 0);
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
          model.interactionsPairs.length,
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

        const leftRightPairs = model.interactionsPairs.filter(
          (pair) => pair.aId === left.id && pair.rhsActionId === right.id,
        );
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
        assert.ok(model.interactionsPairs.length > 0, "pairs built for AI mode");
        model.interactionsPairs[0].variantSig = `${m2.id}+${m1.id}`;

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
        const pairIndex = model.interactionsPairs.findIndex(
          (pair) => pair.aId === left.id && pair.rhsActionId === right.id,
        );
        assert.ok(pairIndex >= 0, "expected AA pair present");
        const pair = model.interactionsPairs[pairIndex];
        pair.variantSig = `${guard.id}+${boost.id}`;
        pair.rhsVariantSig = `${boost.id}`;

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
        const { model, addAction, addModifier } = makeModelFixture();
        const rise = addModifier("Rise");
        const fall = addModifier("Fall");
        rise.color2 = "#ff3366";
        fall.color2 = "#33ff66";
        const action = addAction("Lift");

        model.interactionsPairs = [
          { aId: action.id, variantSig: `${rise.id}+${fall.id}` },
        ];

        const originalDocument = globalThis.document;

        class StubElement {
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
            this._textContent =
              typeof value === "string" ? value : String(value ?? "");
          }
          get textContent() {
            return this._textContent;
          }
          setAttribute(name, value) {
            this.attributes[name] = String(value);
          }
          removeAttribute(name) {
            delete this.attributes[name];
          }
          scrollIntoView() {}
        }

        const documentStub = {
          createElement(tag) {
            return new StubElement(tag);
          },
          createDocumentFragment() {
            return new StubElement("#fragment", true);
          },
          addEventListener: () => {},
          removeEventListener: () => {},
          activeElement: null,
        };

        globalThis.document = documentStub;

        try {
          const host = new StubElement("div");
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
        } finally {
          if (typeof originalDocument === "undefined") delete globalThis.document;
          else globalThis.document = originalDocument;
        }
      },
    },
  ];
}
