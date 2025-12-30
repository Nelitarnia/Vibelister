import { createAppHarness } from "./app-harness.js";
import { sel, SelectionCtl } from "../../../app/selection.js";

export function getPropertiesPaletteTests() {
  return [
    {
      name: "properties palette opens on first edit and closes cleanly",
      run(assert) {
        const harness = createAppHarness();
        const palette = harness.appContext.state.paletteAPI;
        assert.ok(palette, "palette API should be available after bootstrap");
        assert.ok(!palette.isOpen?.(), "palette should start closed");

        SelectionCtl.startSingle(0, 3);
        sel.r = 0;
        sel.c = 3;
        harness.app.GridNS.beginEdit(0, 3);
        assert.ok(palette.isOpen(), "properties palette should open during first edit");

        palette.close();
        assert.ok(!palette.isOpen(), "palette should close without errors");
        harness.app.GridNS.endEdit(false);
        harness.teardown();
      },
    },
  ];
}

export default getPropertiesPaletteTests;
