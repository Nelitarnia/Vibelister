import { actionGroupStrategy } from "./action-group-strategy.js";
import { consensusStrategy } from "./consensus-strategy.js";
import { inputDefaultStrategy } from "./input-default-strategy.js";
import { modifierProfileStrategy } from "./modifier-profile-strategy.js";
import { propertyStrategy } from "./property-strategy.js";
import { phaseAdjacencyStrategy } from "./phase-adjacency-strategy.js";
import { profileTrendStrategy } from "./profile-trend-strategy.js";

export const DEFAULT_INFERENCE_STRATEGIES = [
  consensusStrategy,
  actionGroupStrategy,
  propertyStrategy,
  modifierProfileStrategy,
  phaseAdjacencyStrategy,
  inputDefaultStrategy,
  profileTrendStrategy,
];

export {
  actionGroupStrategy,
  consensusStrategy,
  inputDefaultStrategy,
  modifierProfileStrategy,
  propertyStrategy,
  phaseAdjacencyStrategy,
  profileTrendStrategy,
};
