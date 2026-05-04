import { getInteractionsCoreTests } from "./interactions-core.js";
import { getInteractionsTagTests } from "./interactions-tags.js";
import { getInteractionsPaletteTests } from "./interactions-palette.js";

export function getInteractionsTests() {
  return [
    ...getInteractionsCoreTests(),
    ...getInteractionsTagTests(),
    ...getInteractionsPaletteTests(),
  ];
}
