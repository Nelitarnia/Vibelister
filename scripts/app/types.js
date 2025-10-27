//**

* JSDoc model types (authoritative, lightweight)
* ---
* These typedefs document the persistent data model and enable
* editor IntelliSense without changing runtime behavior.
* They reflect the post–column-kinds overhaul and the Interactions
* structured clipboard schema.
  */

/** @typedef {Object} BaseRow

* @property {number} id
* @property {string=} name
* @property {string=} color
* @property {string=} notes
  */

/** @typedef {import("../data/mod-state.js").ModStateValue} ModStateValue */

/** Action rows may contain a per-modifier state map and optional phases. */
/** @typedef {BaseRow & {

* modSet?: Record<number, ModStateValue>,
* phases?: { ids: number[] }
* }} ActionRow */

/** @typedef {BaseRow} InputRow */
/** @typedef {BaseRow} ModifierRow */
/** @typedef {BaseRow} OutcomeRow */

/** Interactions mode: Actions×Inputs (AI) or Actions×Actions (AA). */
/** @typedef {"AI"|"AA"} InteractionsMode */

/**

* A single generated pair in the Interactions view.
* * AI: left Action (aId) × Input (iId), with a left variant signature.
* * AA: left Action (aId) × right Action (rhsActionId), with signatures for both sides.
    */
    /** @typedef {(
* { kind: 'AI', aId: number, iId: number, variantSig?: string }
* | { kind: 'AA', aId: number, rhsActionId: number, variantSig?: string, rhsVariantSig?: string }
* )} InteractionPair */

/**

* Notes are stored in a flat record keyed by a composed string ("note key").
* The key includes the base pair identity (and, in modern form, the kind),
* and may include a phase suffix (e.g., `|p0:outcome`, `|p1:end`).
*
* Examples (current canonical forms):
* * AI base:       `ai|<aId>|<iId>|<variantSig>`
* * AA base:       `aa|<aId>|<rhsActionId>|<lhsSig>|<rhsSig>`
* * With phase:    `<base>|p<phaseIndex>:<field>` where field ∈ { 'outcome', 'end' }
*
* Older projects may omit the `ai|` prefix or store reduced AA forms; the
* pruning/migration utilities preserve back-compat.
  */
  /** @typedef {Object} NoteRecord
* @property {number=} outcomeId        // formal outcome (stable id)
* @property {number=} endActionId      // formal end target action id
* @property {string=} endVariantSig    // variant signature for end action
* @property {string=} result           // legacy free-text outcome (read-only)
* @property {string=} endFree          // legacy free-text end (read-only)
* @property {string=} notes            // free-form user notes
  */

/**

* Project-level metadata.
* * schema: monotonically increasing integer for migrations
* * projectName: user-visible name (usually filename stem)
* * interactionsMode: 'AI' or 'AA'
    */
    /** @typedef {{ schema: number, projectName: string, interactionsMode: InteractionsMode }} Meta */

/**

* The full model persisted to disk.
  */
  /** @typedef {Object} Model
* @property {Meta} meta
* @property {ActionRow[]} actions
* @property {InputRow[]} inputs
* @property {ModifierRow[]} modifiers
* @property {OutcomeRow[]} outcomes
* @property {Array<Object>} modifierGroups      // group definitions; see rules.js
* @property {Array<Object>} modifierConstraints // rule constraints; see rules.js
* @property {Record<string, NoteRecord>} notes  // flat map from noteKey → note
* @property {InteractionPair[]} interactionsPairs
* @property {{
*   mode: string,
*   groups: Array<Object>,
*   totalRows?: number,
*   actionsOrder?: number[],
*   inputsOrder?: number[],
*   variantCatalog?: Record<number, string[]>
* }} interactionsIndex
* @property {number} nextId
  */

/**

* Structured clipboard payloads (canonical wrapper used across the app).
  */
  /** @typedef {{ type: 'action',  data: { id: number, variantSig?: string } }} StructuredActionRef */
  /** @typedef {{ type: 'input',   data: { id: number } }} StructuredInputRef */
  /** @typedef {{ type: 'outcome', data: { outcomeId: number } }} StructuredOutcomeRef */
  /** @typedef {{ type: 'end',     data: { endActionId: number, endVariantSig?: string } }} StructuredEndRef */
  /** @typedef {(StructuredActionRef|StructuredInputRef|StructuredOutcomeRef|StructuredEndRef)} StructuredPayload */

/**

* Column kind context object passed to kind handlers.
* Only the commonly used fields are documented here for IntelliSense.
  */
  /** @typedef {Object} KindCtx
* @property {number=} r
* @property {number=} c
* @property {Object=} col
* @property {ActionRow|InputRow|ModifierRow|OutcomeRow=} row
* @property {Model=} model
* @property {function():Object} viewDef
* @property {string=} activeView
  */

