import { makeMutationRunner } from "../../../data/mutation-runner.js";
import { createInitialModel } from "../../../app/model-init.js";
import { createGridRenderer } from "../../../app/grid-renderer.js";

class GridStubElement {
  constructor(tag, isFragment = false) {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this._classSet = new Set();
    this._isConnected = !isFragment;
    this.parentNode = null;
    this.className = "";
    this.style = { setProperty() {}, removeProperty() {} };
    this._textContent = "";
  }

  appendChild(child) {
    if (!child) return child;
    this.children.push(child);
    child.parentNode = this;
    child._isConnected = true;
    return child;
  }

  insertBefore(child, reference) {
    if (!child) return child;
    const idx = reference ? this.children.indexOf(reference) : -1;
    if (idx >= 0) this.children.splice(idx, 0, child);
    else this.children.push(child);
    child.parentNode = this;
    child._isConnected = true;
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) this.children.splice(idx, 1);
    child.parentNode = null;
    child._isConnected = false;
    return child;
  }

  set textContent(value) {
    this.children = [];
    this._textContent = value == null ? "" : String(value);
  }

  get textContent() {
    return this._textContent;
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.children.indexOf(this);
    return idx > 0 ? this.parentNode.children[idx - 1] : null;
  }

  get isConnected() {
    return this._isConnected;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  get classList() {
    return {
      add: (...tokens) => tokens.forEach((t) => this._classSet.add(t)),
      remove: (...tokens) => tokens.forEach((t) => this._classSet.delete(t)),
      contains: (token) => this._classSet.has(token),
    };
  }
}

function withGridEnvironment(run) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const documentStub = {
    createElement: (tag) => new GridStubElement(tag),
    createDocumentFragment: () => new GridStubElement("#fragment", true),
  };
  const windowStub = { __cellPool: [], __hdrPool: [], __rhdrPool: [] };
  globalThis.document = documentStub;
  globalThis.window = windowStub;
  try {
    return run();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
}

function createGridHarness({ model, columns, viewKey, dataArray }) {
  const sheet = new GridStubElement("div");
  sheet.clientWidth = 240;
  sheet.clientHeight = 120;
  sheet.scrollLeft = 0;
  sheet.scrollTop = 0;

  const cellsLayer = new GridStubElement("div");
  const spacer = new GridStubElement("div");
  const colHdrs = new GridStubElement("div");
  const rowHdrs = new GridStubElement("div");

  const selection = {
    rows: new Set([0]),
    cols: new Set([0]),
    colsAll: false,
    horizontalMode: false,
    anchor: 0,
    colAnchor: 0,
  };
  const SelectionNS = { isAllCols: () => false };
  const sel = { r: 0, c: 0 };

  const viewDef = () => ({ key: viewKey, columns });

  const renderer = createGridRenderer({
    sheet,
    cellsLayer,
    spacer,
    colHdrs,
    rowHdrs,
    selection,
    SelectionNS,
    sel,
    getActiveView: () => viewKey,
    viewDef,
    dataArray,
    getRowCount: () => dataArray().length,
    getCell: (r, c) => {
      const col = columns[c];
      const row = dataArray()[r];
      return row && col ? row[col.key] : undefined;
    },
    isRowSelected: () => false,
    model,
    rebuildInteractionPhaseColumns: () => {},
    noteKeyForPair: () => null,
    parsePhaseKey: () => null,
    ROW_HEIGHT: 26,
    updateSelectionSnapshot: () => {},
    isModColumn: () => false,
    modIdFromKey: () => null,
    getInteractionsPair: () => null,
    describeInteractionInference: () => null,
    getCommentColors: () => null,
    commentColors: [],
  });

  renderer.layout();
  renderer.render();

  const runner = makeMutationRunner({
    model,
    rebuildActionColumnsFromModifiers: () => {},
    rebuildInteractionsInPlace: () => {},
    pruneNotesToValidPairs: () => {},
    invalidateViewDef: () => {},
    layout: () => {},
    render: () => renderer.render(),
    status: {},
  });

  return { renderer, selection, SelectionNS, sel, cellsLayer, model, runner };
}

function createRunner(model, renderSpy) {
  return makeMutationRunner({
    model,
    rebuildActionColumnsFromModifiers: () => {},
    rebuildInteractionsInPlace: () => {},
    pruneNotesToValidPairs: () => {},
    invalidateViewDef: () => {},
    layout: () => {},
    render: renderSpy,
    status: {},
  });
}

export function getDataVersionTests() {
  return [
    {
      name: "edits bump dataVersion and mark redraws without changing view",
      run(assert) {
        const model = createInitialModel();
        const renderObservations = [];
        let lastSeenVersion = model.meta.dataVersion;
        const runner = createRunner(model, () => {
          if (model.meta.dataVersion === lastSeenVersion) {
            renderObservations.push({ skipped: true, version: model.meta.dataVersion });
            return;
          }
          lastSeenVersion = model.meta.dataVersion;
          renderObservations.push({ skipped: false, version: lastSeenVersion });
        });

        runner.runModelMutation(
          "add action name",
          () => {
            model.actions.push({ id: model.nextId++, name: "Hero", color: "", color2: "", notes: "" });
            return { changed: true };
          },
          { render: true },
        );

        assert.strictEqual(model.meta.dataVersion, 1, "dataVersion increments for grid redraw");
        assert.deepStrictEqual(
          renderObservations,
          [{ skipped: false, version: 1 }],
          "renderer sees version bump and redraws within same view",
        );
      },
    },
    {
      name: "palette commits still repaint when meta is missing",
      run(assert) {
        withGridEnvironment(() => {
          const columns = [
            { key: "name", title: "Name", width: 120 },
            { key: "notes", title: "Notes", width: 120 },
          ];

          const model = {
            meta: undefined,
            actions: [{ id: 1, name: "Old", notes: "" }],
            inputs: [],
            modifiers: [],
            outcomes: [],
          };

          const harness = createGridHarness({
            model,
            columns,
            viewKey: "actions",
            dataArray: () => model.actions,
          });

          harness.runner.runModelMutation(
            "palette commit",
            () => {
              model.actions[0].name = "New";
              harness.selection.cols.clear();
              harness.selection.cols.add(1);
              harness.selection.colAnchor = 1;
              harness.sel.c = 1;
              return { changed: true };
            },
            { render: true },
          );

          const cell = harness.cellsLayer.children.find(
            (child) => child?.dataset?.r === 0 && child?.dataset?.c === 0,
          );
          assert.ok(cell, "cell should exist");
          assert.strictEqual(cell._contentEl.textContent, "New", "cell re-rendered after palette commit");
          assert.ok(Number.isFinite(model.renderEpoch), "renderEpoch should track renders without meta");
        });
      },
    },
    {
      name: "structured paste refreshes interactions grid without meta",
      run(assert) {
        withGridEnvironment(() => {
          const columns = [
            { key: "outcome", title: "Outcome", width: 120 },
            { key: "end", title: "End", width: 120 },
          ];

          const model = {
            meta: undefined,
            actions: [],
            inputs: [],
            modifiers: [],
            outcomes: [{ id: 1, outcome: "Old", end: "" }],
          };

          const harness = createGridHarness({
            model,
            columns,
            viewKey: "interactions",
            dataArray: () => model.outcomes,
          });

          harness.runner.runModelMutation(
            "structured paste",
            () => {
              model.outcomes[0].outcome = "Pasted";
              return { changed: true };
            },
            { render: true },
          );

          const cell = harness.cellsLayer.children.find(
            (child) => child?.dataset?.r === 0 && child?.dataset?.c === 0,
          );
          assert.ok(cell, "outcome cell should exist");
          assert.strictEqual(cell._contentEl.textContent, "Pasted", "structured paste repaint should apply immediately");
          assert.ok(Number.isFinite(model.renderEpoch), "renderEpoch advances after structured paste");
        });
      },
    },
  ];
}

export default getDataVersionTests;
