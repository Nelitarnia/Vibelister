import { getAllInteractionsTests } from "./interactions-all.js";

export function getInteractionsCoreTests() {
  return getAllInteractionsTests().filter(
    (spec) => !/tag|palette/i.test(spec.name),
  );
}
