import { createAppHarness, createStubDocument } from "./app-harness.js";
import { initMenus } from "../../../ui/menus.js";

export function getAppInitTests() {
  return [
    {
      name: "factory bootstrap exposes core APIs",
      run(assert) {
        const harness = createAppHarness();
        assert.ok(typeof harness.app.init === "function", "init lifecycle exposed");
        assert.ok(typeof harness.app.GridNS.render === "function", "render api");
        assert.ok(typeof harness.app.ViewsNS.setActiveView === "function", "setActiveView api");
        assert.ok(typeof harness.app.appContext.destroy === "function", "destroy on context");
        harness.teardown();
      },
    },
    {
      name: "view controller wires tab callbacks",
      run(assert) {
        const harness = createAppHarness();
        const { tabs } = harness.dom;
        assert.ok(tabs.tabInputs.onclick, "tab input handler");
        assert.ok(tabs.tabInteractions.onclick, "tab interactions handler");
        tabs.tabInputs.onclick();
        assert.strictEqual(harness.appContext.getActiveView(), "inputs");
        tabs.tabInteractions.onclick();
        assert.strictEqual(harness.appContext.getActiveView(), "interactions");
        harness.teardown();
      },
    },
    {
      name: "menus register undo/redo handlers",
      run(assert) {
        const harness = createAppHarness();
        const { menus } = harness.dom;
        assert.strictEqual(typeof menus.undoMenuItem.onclick, "function", "undo wired");
        assert.strictEqual(typeof menus.redoMenuItem.onclick, "function", "redo wired");
        harness.teardown();
      },
    },
    {
      name: "menus teardown removes global listeners",
      run(assert) {
        const { documentStub, elements, restore } = createStubDocument();
        const popup = documentStub.getElementById("menu:popup");
        const trigger = documentStub.getElementById("menu:trigger");
        trigger.getBoundingClientRect = () => ({ left: 0, bottom: 0 });
        const originalSetAttribute = popup.setAttribute.bind(popup);
        let closeCalls = 0;
        popup.setAttribute = (name, value) => {
          if (name === "data-open") closeCalls++;
          originalSetAttribute(name, value);
        };
        const menus = { file: { popup, trigger } };
        const menuDeps = {
          dom: { menus, items: {}, viewRadios: {} },
          setActiveView() {},
          newProject() {},
          openFromDisk() {},
          saveToDisk() {},
          doGenerate() {},
          runSelfTests() {},
          model: {},
          openSettings() {},
          openProjectInfo() {},
          openCleanup() {},
          openInference() {},
          addRowsAbove() {},
          addRowsBelow() {},
          clearCells() {},
          deleteRows() {},
          undo() {},
          redo() {},
          getUndoState() {
            return {};
          },
        };
        const first = initMenus(menuDeps);
        first.destroy();
        const second = initMenus(menuDeps);
        const docClick = elements.get("document:click");
        docClick.dispatchEvent({ type: "click" });
        assert.strictEqual(closeCalls, 1, "only one click listener active after reinit");
        second.destroy();
        restore();
      },
    },
  ];
}

export default getAppInitTests;
