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

export function getColumnResizeTests() {
  return [
    {
      name: "pointer cancel restores the starting width and skips undo",
      run(assert) {
        const startWidth = 180;
        const viewKey = "view-1";
        const columnKey = "col-1";
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
        let dispose;

        const headerClassList = makeClassList();
        const handleClassList = makeClassList();

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

        try {
          dispose = initColumnResize({
            container,
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
          });

          const pointerId = 7;
          const startX = 100;
          container.dispatch("pointerdown", {
            button: 0,
            detail: 0,
            pointerId,
            clientX: startX,
            target: eventTarget,
            preventDefault() {},
          });

          assert.strictEqual(capturedPointer, pointerId);
          assert.strictEqual(handleClassList.contains("is-resizing"), true);
          assert.strictEqual(headerClassList.contains("is-resizing"), true);
          assert.strictEqual(containerClassList.contains("is-resizing"), true);

          windowStub.dispatch("pointermove", {
            pointerId,
            clientX: startX + 40,
          });

          assert.strictEqual(mutationLog.length > 0, true);
          const resizeResult = mutationLog[mutationLog.length - 1];
          assert.strictEqual(resizeResult.width, startWidth + 40);
          assert.strictEqual(layoutCount > 0, true);
          assert.strictEqual(renderCount > 0, true);
          assert.strictEqual(invalidateCount > 0, true);

          windowStub.dispatch("pointercancel", {
            pointerId,
          });

          assert.strictEqual(currentWidth, startWidth);
          assert.deepStrictEqual(model.meta, initialMeta);
          assert.strictEqual(undoLog.length, 1);
          assert.strictEqual(undoLog[0].type, "cancel");
          assert.strictEqual(
            mutationLog[mutationLog.length - 1].width,
            startWidth,
          );
          assert.strictEqual(handleClassList.contains("is-resizing"), false);
          assert.strictEqual(headerClassList.contains("is-resizing"), false);
          assert.strictEqual(containerClassList.contains("is-resizing"), false);
          assert.strictEqual(releasedPointer, pointerId);
        } finally {
          dispose?.();
        }
      },
    },
  ];
}
