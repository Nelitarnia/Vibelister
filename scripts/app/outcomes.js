// outcomes.js — tiny helpers for Outcomes metadata & mirroring
// Schema expectation per row in model.outcomes:
// { id:number, name:string, color?:string, notes?:string, mirrored?:boolean, dualof?:number }

/**
 * Return the mirrored Outcome id for a given outcomeId, honoring the Outcomes sheet metadata.
 * Policy:
 *  - if row.dualof is a valid outcome id → return that id
 *  - else if row.mirrored truthy → return the same id (self-dual)
 *  - else → return null (no auto-mirror)
 */
export function invertOutcomeId(model, outcomeId){
	if (!model || !Array.isArray(model.outcomes)) return null;
	if (typeof outcomeId !== 'number') return null;
	const rows = model.outcomes;
	const row = rows.find(o => o && o.id === outcomeId);
	if (!row) return null;
	if (typeof row.dualof === 'number' && rows.some(o => o && o.id === row.dualof)) return row.dualof|0;
	if (row.mirrored) return outcomeId|0;
	return null;
}

/**
 * Ensure new metadata fields exist on outcome rows (non-destructive).
 * Useful after loading old projects.
 */
export function normalizeOutcomeMetadata(model){
	if (!model || !Array.isArray(model.outcomes)) return;
	for (const o of model.outcomes){
		if (!o || typeof o !== 'object') continue;
		if (!('mirrored' in o)) o.mirrored = false;
		if (!('dualof' in o)) o.dualof = null;
	}
}
