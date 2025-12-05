import { createAppHarness } from "./app-harness.js";

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
  ];
}

export default getAppInitTests;
