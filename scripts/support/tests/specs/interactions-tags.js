import { getAllInteractionsTests } from "./interactions-all.js";

export function getInteractionsTagTests() {
  return getAllInteractionsTests().filter((spec) => /tag/i.test(spec.name));
}
