// mod-state.js — canonical descriptor for modifier state values
// Central registry for modifier states, glyphs, and parsing helpers.

const RAW_STATES = [
  {
    name: "OFF",
    id: 0,
    label: "Off",
    glyph: "✕",
    glyphs: ["✕", "✖", "✗", "✘", "×"],
    description: "Hide this modifier for the action.",
    keywords: ["off", "0", "disable", "none", "hide", "✕", "x", "cross"],
    tokens: [
      "0",
      "off",
      "false",
      "x",
      "cross",
      "hide",
      "disable",
      "none",
      "✕",
      "✖",
      "✗",
      "✘",
      "×",
    ],
    isActive: false,
    isMarked: false,
  },
  {
    name: "ON",
    id: 1,
    label: "On",
    glyph: "✓",
    glyphs: ["✓", "✔", "☑"],
    description: "Mark this modifier as compatible.",
    keywords: ["on", "1", "enable", "yes", "show", "active", "✓", "check"],
    tokens: [
      "1",
      "on",
      "true",
      "enable",
      "enabled",
      "yes",
      "show",
      "active",
      "compatible",
      "✓",
      "✔",
      "☑",
    ],
    isActive: true,
    isMarked: true,
  },
  {
    name: "BYPASS",
    id: 2,
    label: "Bypass",
    glyph: "◐",
    glyphs: ["◐", "◑", "◓", "◎"],
    description: "Allow the modifier without filtering by it.",
    keywords: [
      "bypass",
      "2",
      "skip",
      "allow",
      "inherit",
      "optional",
      "neutral",
      "◐",
      "partial",
    ],
    tokens: [
      "2",
      "bypass",
      "pass",
      "skip",
      "allow",
      "inherit",
      "optional",
      "neutral",
      "◐",
      "◑",
      "◓",
      "◎",
    ],
    isActive: false,
    isMarked: true,
  },
  {
    name: "REQUIRES",
    id: 3,
    label: "Requires",
    glyph: "!",
    glyphs: ["!", "‼", "❗", "⚠"],
    description: "Require this modifier for the action to function.",
    keywords: ["requires", "require", "need", "must", "!", "mandatory"],
    tokens: [
      "3",
      "requires",
      "require",
      "required",
      "need",
      "needs",
      "must",
      "mandatory",
      "!",
      "‼",
      "❗",
      "⚠",
    ],
    isActive: true,
    isMarked: true,
  },
];

function freezeState(state) {
  return Object.freeze({
    ...state,
    keywords: Object.freeze(state.keywords.slice()),
    tokens: Object.freeze(state.tokens.map((t) => t.toLowerCase())),
    glyphs: Object.freeze(state.glyphs.slice()),
  });
}

export const MOD_STATES = Object.freeze(RAW_STATES.map(freezeState));

export const MOD_STATE_ID = Object.freeze(
  MOD_STATES.reduce((map, state) => {
    map[state.name] = state.id;
    return map;
  }, {}),
);

export const MOD_STATE_DEFAULT_NAME = "OFF";
export const MOD_STATE_BOOLEAN_TRUE_NAME = "ON";
export const MOD_STATE_MIN_VALUE = Math.min(...MOD_STATES.map((s) => s.id));
export const MOD_STATE_MAX_VALUE = Math.max(...MOD_STATES.map((s) => s.id));
export const MOD_STATE_DEFAULT_VALUE =
  MOD_STATES.find((s) => s.name === MOD_STATE_DEFAULT_NAME)?.id ?? 0;

const DEFAULT_CYCLE = MOD_STATES.map((s) => s.name);

export function enumerateModStates(override = null) {
  const states = MOD_STATES.map((state) => {
    const raw = override && typeof override === "object" ? override[state.name] : undefined;
    const value = Number.isFinite(raw) ? Number(raw) : state.id;
    return Object.freeze({ ...state, value });
  });

  const map = Object.freeze(
    states.reduce((acc, state) => {
      acc[state.name] = state.value;
      return acc;
    }, {}),
  );

  const cycleStates = DEFAULT_CYCLE.filter((name) =>
    states.some((st) => st.name === name),
  )
    .map((name) => states.find((st) => st.name === name))
    .filter(Boolean);

  const defaultState =
    states.find((st) => st.name === MOD_STATE_DEFAULT_NAME) || states[0];

  const valueToState = new Map(states.map((st) => [st.value, st]));

  return {
    states,
    map,
    defaultState,
    cycleStates,
    valueToState,
  };
}

export const MOD_STATE_ACTIVE_VALUES = Object.freeze(
  MOD_STATES.filter((s) => s.isActive).map((s) => s.id),
);

export const MOD_STATE_MARKED_VALUES = Object.freeze(
  MOD_STATES.filter((s) => s.isMarked || s.isActive).map((s) => s.id),
);

/** @typedef {typeof MOD_STATE_ID[keyof typeof MOD_STATE_ID]} ModStateValue */
