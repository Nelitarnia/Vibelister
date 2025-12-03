import { createAppHarness } from "./app-harness.js";

export function getAppInitTests() {
  return [
    {
      name: "staged bootstrap exposes core APIs",
      run(assert) {
        const harness = createAppHarness();
        assert.ok(typeof harness.renderer.render === "function", "render api");
        assert.ok(typeof harness.view.setActiveView === "function", "setActiveView api");
        assert.ok(typeof harness.history.undo === "function", "undo api");
        assert.ok(typeof harness.history.redo === "function", "redo api");
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
        harness.view.setActiveView("inputs");
        assert.strictEqual(harness.appContext.getActiveView(), "inputs");
        harness.view.setActiveView("interactions");
        assert.strictEqual(harness.appContext.getActiveView(), "interactions");
        harness.teardown();
      },
    },
  ];
}

export default getAppInitTests;
