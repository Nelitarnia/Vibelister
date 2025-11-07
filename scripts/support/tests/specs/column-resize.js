import { initColumnResize } from "../../../ui/column-resize.js";

function makeClassList() {
  const values = new Set();
  return {
    add(token) {
      values.add(token);
    },
    remove(token) {
      values.delete(token);
    },
    contains(token) {
      return values.has(token);
    },
    toJSON() {
      return Array.from(values);
    },
  };
}

function makeListenerMap() {
  const map = new Map();
  return {
    add(type, cb) {
      const arr = map.get(type) || [];
      arr.push(cb);
      map.set(type, arr);
    },
    remove(type, cb) {
      const arr = map.get(type);
      if (!arr) return;
      const idx = arr.indexOf(cb);
      if (idx >= 0) {
        arr.splice(idx, 1);
        if (arr.length === 0) {
          map.delete(type);
        } else {
          map.set(type, arr);
        }
      }
    },
    dispatch(type, event) {
      const arr = map.get(type);
      if (!arr) return;
      for (const cb of [...arr]) {
        cb(event);
      }
    },
    snapshot(type) {
      return map.get(type) ? [...map.get(type)] : [];
    },
  };
}

function createResizeHarness({
  startWidth = 180,
  viewKey = "view-1",
  columnKey = "col-1",
} = {}) {
  const overrideKey = `${viewKey}::${columnKey}`;
  const initialMeta = { columnWidths: { [overrideKey]: startWidth } };
  const model = { meta: JSON.parse(JSON.stringify(initialMeta)) };
  let currentWidth = startWidth;

  const mutationLog = [];
  function runModelMutation(_label, mutator) {
    const result = mutator();
    mutationLog.push(result);
    if (result?.width != null) {
      currentWidth = result.width;
    }
    return result;
  }

  const undoLog = [];
  function beginUndoableTransaction() {
    const snapshot = JSON.parse(JSON.stringify(model.meta));
    return {
      commit(result) {
        undoLog.push({ type: "commit", result });
      },
      cancel() {
        undoLog.push({ type: "cancel" });
        model.meta = JSON.parse(JSON.stringify(snapshot));
        currentWidth = startWidth;
      },
    };
  }

  function makeUndoConfig() {
    return { label: "resize column" };
  }

  let layoutCount = 0;
  let renderCount = 0;
  let invalidateCount = 0;

  const containerListeners = makeListenerMap();
  const containerClassList = makeClassList();
  const windowListeners = makeListenerMap();
  const windowStub = {
    addEventListener(type, cb, opts) {
      windowListeners.add(type, cb, opts);
    },
    removeEventListener(type, cb) {
      windowListeners.remove(type, cb);
    },
    dispatch(type, event) {
      windowListeners.dispatch(type, event);
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };

  const headerClassList = makeClassList();
  const handleClassList = makeClassList();
  const containerRect = { left: 0, right: 400 };
  const sheet = {
    scrollLeft: 0,
    scrollWidth: 2000,
    clientWidth: 400,
  };

  const header = {
    dataset: { colIndex: "0", viewKey },
    classList: headerClassList,
    closest(selector) {
      if (selector === ".hdr") return header;
      if (selector === ".hdr__resize-handle") return handle;
      return null;
    },
  };

  let capturedPointer = null;
  let releasedPointer = null;
  const handle = {
    classList: handleClassList,
    closest(selector) {
      if (selector === ".hdr__resize-handle") return handle;
      if (selector === ".hdr") return header;
      return null;
    },
    setPointerCapture(id) {
      capturedPointer = id;
    },
    releasePointerCapture(id) {
      releasedPointer = id;
    },
  };

  const container = {
    classList: containerClassList,
    addEventListener(type, cb) {
      containerListeners.add(type, cb);
    },
    removeEventListener(type, cb) {
      containerListeners.remove(type, cb);
    },
    contains(node) {
      return node === handle;
    },
    dispatch(type, event) {
      containerListeners.dispatch(type, event);
    },
    getBoundingClientRect() {
      return containerRect;
    },
  };

  const eventTarget = {
    closest(selector) {
      if (selector === ".hdr__resize-handle") return handle;
      return null;
    },
  };

  function viewDef() {
    return {
      columns: [
        {
          key: columnKey,
          defaultWidth: 160,
          width: currentWidth,
        },
      ],
    };
  }

  function init(options = {}) {
    return initColumnResize({
      container,
      sheet,
      model,
      getActiveView: () => viewKey,
      viewDef,
      runModelMutation,
      beginUndoableTransaction,
      makeUndoConfig,
      invalidateViewDef() {
        invalidateCount++;
      },
      layout() {
        layoutCount++;
      },
      render() {
        renderCount++;
      },
      window: windowStub,
      ...options,
    });
  }

  return {
    startWidth,
    overrideKey,
    initialMeta,
    model,
    sheet,
    container,
    eventTarget,
    windowStub,
    mutationLog,
    undoLog,
    headerClassList,
    handleClassList,
    containerClassList,
    containerRect,
    getCurrentWidth: () => currentWidth,
    runModelMutation,
    beginUndoableTransaction,
    makeUndoConfig,
    viewDef,
    init,
    containerListeners,
    windowListeners,
    getCapturedPointer: () => capturedPointer,
    getReleasedPointer: () => releasedPointer,
    get layoutCount() {
      return layoutCount;
    },
    get renderCount() {
      return renderCount;
    },
    get invalidateCount() {
      return invalidateCount;
    },
  };
}

export function getColumnResizeTests() {
  return [
    {
      name: "pointer cancel restores the starting width and skips undo",
      run(assert) {
        const harness = createResizeHarness();
        let dispose;

        try {
          dispose = harness.init();

          const pointerId = 7;
          const startX = 100;
          harness.container.dispatch("pointerdown", {
            button: 0,
            detail: 0,
            pointerId,
            clientX: startX,
            target: harness.eventTarget,
            preventDefault() {},
          });

          assert.strictEqual(harness.getCapturedPointer(), pointerId);
          assert.strictEqual(
            harness.handleClassList.contains("is-resizing"),
            true,
          );
          assert.strictEqual(
            harness.headerClassList.contains("is-resizing"),
            true,
          );
          assert.strictEqual(
            harness.containerClassList.contains("is-resizing"),
            true,
          );

          harness.windowStub.dispatch("pointermove", {
            pointerId,
            clientX: startX + 40,
          });

          assert.strictEqual(harness.mutationLog.length > 0, true);
          const resizeResult =
            harness.mutationLog[harness.mutationLog.length - 1];
          assert.strictEqual(resizeResult.width, harness.startWidth + 40);
          assert.strictEqual(harness.layoutCount > 0, true);
          assert.strictEqual(harness.renderCount > 0, true);
          assert.strictEqual(harness.invalidateCount > 0, true);

          harness.windowStub.dispatch("pointercancel", {
            pointerId,
          });

          assert.strictEqual(harness.getCurrentWidth(), harness.startWidth);
          assert.deepStrictEqual(harness.model.meta, harness.initialMeta);
          assert.strictEqual(harness.undoLog.length, 1);
          assert.strictEqual(harness.undoLog[0].type, "cancel");
          assert.strictEqual(
            harness.mutationLog[harness.mutationLog.length - 1].width,
            harness.startWidth,
          );
          assert.strictEqual(
            harness.handleClassList.contains("is-resizing"),
            false,
          );
          assert.strictEqual(
            harness.headerClassList.contains("is-resizing"),
            false,
          );
          assert.strictEqual(
            harness.containerClassList.contains("is-resizing"),
            false,
          );
          assert.strictEqual(harness.getReleasedPointer(), pointerId);
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "column width accounts for scroll delta while resizing",
      run(assert) {
        const harness = createResizeHarness();
        let dispose;

        try {
          dispose = harness.init();

          const pointerId = 11;
          const startX = 140;
          harness.container.dispatch("pointerdown", {
            button: 0,
            detail: 0,
            pointerId,
            clientX: startX,
            target: harness.eventTarget,
            preventDefault() {},
          });

          harness.sheet.scrollLeft = 75;

          harness.windowStub.dispatch("pointermove", {
            pointerId,
            clientX: startX,
          });

          assert.strictEqual(harness.mutationLog.length > 0, true);
          const resizeResult =
            harness.mutationLog[harness.mutationLog.length - 1];
          assert.strictEqual(resizeResult.width, harness.startWidth + 75);

          harness.windowStub.dispatch("pointerup", { pointerId });
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "auto scroll does not fight the drag direction",
      run(assert) {
        const harness = createResizeHarness();
        harness.windowStub.setInterval = () => {
          throw new Error("auto-scroll should not start");
        };
        harness.windowStub.clearInterval = () => {};
        let dispose;

        try {
          dispose = harness.init();

          const pointerId = 23;
          const startX = harness.containerRect.right - 8;
          harness.container.dispatch("pointerdown", {
            button: 0,
            detail: 0,
            pointerId,
            clientX: startX,
            target: harness.eventTarget,
            preventDefault() {},
          });

          harness.windowStub.dispatch("pointermove", {
            pointerId,
            clientX: startX - 24,
          });

          assert.strictEqual(harness.mutationLog.length > 0, true);
          const resizeResult =
            harness.mutationLog[harness.mutationLog.length - 1];
          assert.strictEqual(resizeResult.width, harness.startWidth - 24);
          assert.strictEqual(harness.sheet.scrollLeft, 0);

          harness.windowStub.dispatch("pointerup", { pointerId });
        } finally {
          dispose?.();
        }
      },
    },
    {
      name: "auto scroll waits for the pointer to leave the viewport",
      run(assert) {
        const harness = createResizeHarness();
        harness.windowStub.requestAnimationFrame = () => {
          throw new Error("auto-scroll should not start");
        };
        harness.windowStub.cancelAnimationFrame = () => {};
        harness.windowStub.setInterval = () => {
          throw new Error("auto-scroll should not start");
        };
        harness.windowStub.clearInterval = () => {};
        let dispose;

        try {
          dispose = harness.init();

          const pointerId = 37;
          const startX = harness.containerRect.right - 8;
          harness.container.dispatch("pointerdown", {
            button: 0,
            detail: 0,
            pointerId,
            clientX: startX,
            target: harness.eventTarget,
            preventDefault() {},
          });

          harness.windowStub.dispatch("pointermove", {
            pointerId,
            clientX: startX + 6,
          });

          assert.strictEqual(harness.mutationLog.length > 0, true);
          const resizeResult =
            harness.mutationLog[harness.mutationLog.length - 1];
          assert.strictEqual(resizeResult.width, harness.startWidth + 6);
          assert.strictEqual(harness.sheet.scrollLeft, 0);

          harness.windowStub.dispatch("pointermove", {
            pointerId,
            clientX: startX + 8,
          });

          const latest = harness.mutationLog[harness.mutationLog.length - 1];
          assert.strictEqual(latest.width, harness.startWidth + 8);
          assert.strictEqual(harness.sheet.scrollLeft, 0);

          harness.windowStub.dispatch("pointerup", { pointerId });
        } finally {
          dispose?.();
        }
      },
    },
  ];
}
