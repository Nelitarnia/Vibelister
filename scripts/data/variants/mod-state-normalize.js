// mod-state-normalize.js - helpers for interpreting modifier state values

import {
  MOD_STATE_ACTIVE_VALUES,
  MOD_STATE_MARKED_VALUES,
  MOD_STATE_REQUIRED_VALUES,
  MOD_STATE_MAX_VALUE,
  MOD_STATE_MIN_VALUE,
} from "../mod-state.js";

const ACTIVE_STATE_SET = new Set(MOD_STATE_ACTIVE_VALUES);
const MARKED_STATE_SET = new Set(MOD_STATE_MARKED_VALUES);
const REQUIRED_STATE_SET = new Set(MOD_STATE_REQUIRED_VALUES);

export function normalizeModStateValue(v) {
  const num = Number(v);
  if (!Number.isFinite(num)) return null;
  const truncated = Math.trunc(num);
  if (truncated < MOD_STATE_MIN_VALUE || truncated > MOD_STATE_MAX_VALUE) return null;
  return truncated;
}

export function modStateIsOn(v) {
  const value = normalizeModStateValue(v);
  return value != null && ACTIVE_STATE_SET.has(value);
}

export function modStateActiveish(v) {
  const value = normalizeModStateValue(v);
  return value != null && MARKED_STATE_SET.has(value);
}

export function modStateIsRequired(v) {
  const value = normalizeModStateValue(v);
  return value != null && REQUIRED_STATE_SET.has(value);
}

export const modStateSelectors = Object.freeze({
  normalize: normalizeModStateValue,
  isOn: modStateIsOn,
  isActiveish: modStateActiveish,
  isRequired: modStateIsRequired,
});
