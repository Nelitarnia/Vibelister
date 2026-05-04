import { getAllInteractionsTests } from "./interactions-all.js";

export function getInteractionsPaletteTests() {
  return getAllInteractionsTests().filter((spec) => /palette/i.test(spec.name));
}
