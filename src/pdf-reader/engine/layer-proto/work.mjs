// src/pdf-reader/engine/layer-proto/work.mjs
// Deterministic work counters of the layer's run: integer counts of the units of work a page costs, which do not depend on
// the machine's speed or load, so that a slowdown the clock hides in noise shows as more work (the speed check,
// lab/pdf/spikes/layer-gate/speed.mjs). Cheap increments of plain integers only: no clock, no allocation in a hot loop.
// The running totals below are the module's; a run takes a mark and charges the difference to a page (run.mjs chargeWork)
// over a stretch of synchronous code, so that the counts of two runs of one input are equal whatever the order the pages
// were asked in. Nothing here is read by the drawing.

/** the counters: `fit` the fit states tried (layer2.mjs layoutUnit2, layoutAt), `measures` the calls of the width
 *  function (w100, cache hits too), `breaks` the line-breaking passes (breakLines), `linkTests` the link matching's
 *  work units (the budget it spent: links.mjs ownersOf, matchUnit, placeUnit), `inkSteps` the cells of the ink maps read
 *  (inkMapOf), `ops` the drawing operations a page's units made, `edges` the page characters a unit's edges read (run.mjs
 *  edgesOf: those within the band of a baseline it reads, and the page's characters as its index of them is made), `fills`
 *  what a page read live reads for its characters' fills (run.mjs liveFillsOf: its list's operations, its glyphs and items) */
export const WORK_KEYS = Object.freeze(['fit', 'measures', 'breaks', 'linkTests', 'inkSteps', 'ops', 'edges', 'fills'])

/** the running totals of this module; incremented in place by the engine */
export const work = { fit: 0, measures: 0, breaks: 0, linkTests: 0, inkSteps: 0, ops: 0, edges: 0, fills: 0 }

/** a copy of the running totals, to take the difference from */
export const markWork = () => ({ ...work })

/** a zeroed record of the counters */
export const newWork = () => ({ fit: 0, measures: 0, breaks: 0, linkTests: 0, inkSteps: 0, ops: 0, edges: 0, fills: 0 })
