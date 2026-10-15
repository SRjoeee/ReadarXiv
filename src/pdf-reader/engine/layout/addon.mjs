// A paper's shipped add-on (Plan 8's layer bundle holds it): arXiv's PDF with the text of the paper's units taken out
// of the pages where the layer cannot simply fill paper over them, written as an incremental update (layout/remove.mjs),
// and the manifest that tells a reader which pages it removes and where kept ink lies. The bytes after arXiv's own are the
// add-on's `tail`: arXiv's bytes followed by it are the document the reader opens. It is one a paper whatever the target
// (the plan comes from the layout file alone, layer-proto/removal.mjs pagePlan), made where the layout file is made, and
// before 2026-10-08 only by the layer gate's spike (spikes/layer-gate.mjs buildAddon), which now calls this: one
// implementation, the server's.
//
// What it holds, page by page:
//   - a page the plan names (a unit the file locates there owns glyphs or rules, or a babel name's glyphs are there) and
//     where kept ink lies under a unit's
//     rectangles (pageDirty: a glyph no unit takes, a rule, an image): the removed page, R, compact (only these pages, each
//     named in its entry's `at`), and the entry's `dirty`, the boxes of that ink, where the reader swaps R in;
//   - a planned page with none: `{ ok: true }` and no page, for a fill with paper over the file's rectangles needs no
//     removed page, only the manifest's word that the page is drawn so. The remover never reads such a page, so it never
//     refuses one; the layer gate's check (every set made, every page checked) is the gate's own and may refuse more;
//   - a planned page the remover refuses (a form painted twice, a font it cannot walk, a budget): `{ ok: false, refused }`
//     and nothing removed, the reader draws its units the old way, erased and put back, which loses no unit;
//   - a planned page whose kept ink or rules the manifest cannot hold (a box past the page's view, an empty one, more
//     boxes than the manifest's caps leave it): the same, `{ ok: false, refused }`, and it is left out of R, so that the
//     tail never holds a page the manifest does not name. One such page costs that page, not the paper;
//   - a page no unit is planned on, or one that is rotated or past the ink reader's cap: `{ ok: false, refused: 'not
//     planned' }`;
//   - on a planned page the entry's `rules` too (pageRules): the rules near a table cell's lines, which the reader keeps a
//     taller script's text clear of; they are the PDF's own geometry, so the remover's refusal of the page leaves them.
// The manifest is the shipped form (addon-manifest.mjs): no set past R, no outline table, no crop colours. Every reason
// is cut to REFUSED_MAX characters, and the finished manifest is read back by parseAddonManifest (its byte and value caps
// too) before it is returned, so that what is shipped is what every reader accepts: a manifest the bundle's reader
// refused would refuse the whole bundle. That check is a backstop (the pages' own checks above keep the manifest within
// it); where it does fail the paper is refused whole.
//
// An original module (no port statement). It imports only the engine's own modules, and no `node:*` one: the object
// layer (@cantoo/pdf-lib), PDF.js's operator codes and document, zlib's deflate and a bounded inflate are given, so that a
// Node child and a browser worker run the same code.
//
// Isolation, the caller's contract (layout/remove.mjs head, the coordinator's ruling of 2026-10-07): arXiv's PDF is
// untrusted, and the hard bound on what it may cost is the process, not this module. Run it in a child process or a
// worker of its own, under a hard memory limit and a wall clock, one paper at a time, and give `inflate` that stops at
// `limit + 1` bytes or throws. It refuses the paper and never throws on any error of its own (`{ ok: false, refused }`);
// on a refusal, a crash, a limit reached or the clock run out, ship no add-on for the paper: its readers erase and
// restore every unit, which loses none.
import { pageDirty, pagePlan, pageRules } from '../layer-proto/removal.mjs'
import { ADDON_CAP, ADDON_MANIFEST_CAP, ADDON_MANIFEST_VALUES, checkBoxes, parseAddonManifest, REFUSED_MAX } from './addon-manifest.mjs'
import { pageInk } from './ink.mjs'
import { alignOf, makeAddon, openRemover, SETS } from './remove.mjs'

/** the share of the manifest's byte and value caps that the paper's `dirty` and `rules` boxes may take, in page order: the
 *  other half is for the rest of the manifest (an entry a page, its units' ids, its reasons), which no page's ink changes.
 *  A paper-wide bound: a paper cut into parts spends it over the parts in page order (layout/chain.mjs), so that many parts
 *  hold no more boxes than one add-on of the whole paper could */
export const BOXES_BYTES = ADDON_MANIFEST_CAP / 2, BOXES_VALUES = ADDON_MANIFEST_VALUES / 2

const refusal = why => ({ ok: false, refused: String(why).slice(0, REFUSED_MAX) })
/** an error's message, and never a throw of its own (an object with no prototype has none to read, and no string) */
const reasonOf = e => { try { return String(e?.message ?? e) } catch { return 'an error that cannot be read' } }

/**
 * The paper's shipped add-on: `bytes` arXiv's PDF; `index` its layout file (file.mjs indexLayout); `doc` PDF.js's document
 * of `bytes`, read page by page for its operator lists (the ink's outline boxes are PDF.js's where it gives them: Node);
 * `OPS` PDF.js's operator codes; `PL` the object layer's exports; `deflate` bytes -> zlib bytes; `inflate` (bytes, limit ->
 * bytes, no more than limit + 1 of them or a throw). Returns { ok: true, tail, manifest, ms } (`ms`: the time of the
 * remover's parse, the operator lists, the ink, the plan and the add-on), or { ok: false, refused } for any error, a
 * disagreement of the PDF, PDF.js and the layout file on the pages, an add-on past ADDON_CAP or a manifest the reader's
 * bounds refuse. Never throws
 */
export async function paperAddon(o) {
  try {
    return await shipped(o)
  } catch (e) {
    return refusal(`the add-on could not be made: ${reasonOf(e)}`)
  }
}

/**
 * A page's plan for the add-on, from the layout file (`index`, file.mjs indexLayout: every unit framed on the page, an
 * earlier part's too) and the page's ink (`ink`, layout/ink.mjs pageInk with `indices`) alone: null where nothing is planned
 * (a page rotated or past the ink reader's cap, or no unit and no babel name of the file on it), else { dirty, the kept ink
 * under the page's units (pageDirty), rules, the rules near its cells' lines (pageRules), unfit, why the manifest cannot hold
 * them (a box past the page's view by the reader's slack, or empty: addon-manifest.mjs checkBoxes, the reader's own; null
 * where it can), cost { bytes, values }, what they take of the manifest's boxes' share, and, on a page with kept ink the
 * manifest can hold (the remover's to remove), remove { units: [id, glyphs, paths][], names: [occurrence, glyphs][], crops:
 * [glyphs, paths][], shows, align } }: what the remover takes out and checks (a crop's glyphs must align too), with `align`
 * the page's alignment facts (remove.mjs alignOf of the operator list `ink` was read from; `facts`, or a function giving
 * them, called only for such a page). Page-local and pure: no budget is spent here
 */
export function pagePlanOf(index, p, ink, facts) {
  if (ink.rotated || ink.capped) return null
  const { own: _own, ...pp } = pagePlan(index, p, ink)
  if (!pp.units.length && !pp.names.length) return null
  const dirty = pageDirty(index, p, ink, pp), rules = pageRules(index, p, ink)
  let unfit = null
  try {
    checkBoxes(dirty, p, index.file.views, 'dirty')
    checkBoxes(rules, p, index.file.views, 'rules')
  } catch (e) { unfit = `its kept ink or rules cannot be written: ${reasonOf(e)}` }
  let bytes = 0, values = 0
  for (const boxes of [dirty, rules]) if (boxes.length) { bytes += JSON.stringify(boxes).length; values += boxes.length + 1 }
  const plan = { dirty, rules, unfit, cost: { bytes, values } }
  if (dirty.length && unfit === null) {
    plan.remove = {
      units: pp.units.map(u => [u.id, u.glyphs, u.paths]), names: pp.names.map(nm => [nm.occurrence, nm.glyphs]), crops: pp.crops.map(c => [c.glyphs, c.paths]),
      shows: pp.shows, align: typeof facts === 'function' ? facts() : facts,
    }
  }
  return plan
}

/**
 * Every page's plan (pagePlanOf) of PDF.js's document `doc` of arXiv's PDF, `OPS` PDF.js's operator codes, `index` the layout
 * file's: { plans, a Map from each planned page to its plan, ms { ops, ink, plan } }. Reads each page's operator list once
 * and keeps none
 */
export async function pagePlansOf({ doc, OPS, index }) {
  const plans = new Map(), ms = { ops: 0, ink: 0, plan: 0 }
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    let t = performance.now()
    const list = await page.getOperatorList()
    ms.ops += performance.now() - t
    t = performance.now()
    const ink = pageInk(OPS, list, page.commonObjs, { rotate: page.rotate, indices: true })
    ms.ink += performance.now() - t
    t = performance.now()
    const plan = pagePlanOf(index, p, ink, () => alignOf(OPS, list))
    if (plan) plans.set(p, plan)
    ms.plan += performance.now() - t
  }
  return { plans, ms }
}

/**
 * Pages `from` to `to` of the add-on's manifest as far as the plans tell them, before the remover: `planOf(p)` each page's
 * plan (pagePlanOf's, or null), `spent` { bytes, values } the boxes' share taken by the pages before (the paper's, in page
 * order). A page with no plan is not planned; one whose boxes the manifest cannot hold, or more than the share has left, is
 * refused (and spends none); a planned page with no kept ink is `{ ok: true }` (with its rules), filled with paper where
 * the reader draws; one with kept ink is the remover's (`asked`, rising; its entry null until withRemoved). Returns
 * { page, asked, spent }, `spent` the share taken after `to`. Pure
 */
export function rangeEntries(planOf, from, to, spent) {
  const page = {}, asked = []
  let { bytes, values } = spent
  for (let p = from; p <= to; p++) {
    const plan = planOf(p)
    if (!plan) { page[p] = { ok: false, refused: 'not planned' }; continue }
    if (plan.unfit !== null) { page[p] = refusal(plan.unfit); continue }
    if (bytes + plan.cost.bytes > BOXES_BYTES || values + plan.cost.values > BOXES_VALUES) { page[p] = refusal(`its kept ink and rules (${plan.dirty.length + plan.rules.length} numbers) are more than the manifest has left`); continue }
    bytes += plan.cost.bytes
    values += plan.cost.values
    if (plan.dirty.length) { asked.push(p); page[p] = null } else page[p] = plan.rules.length ? { ok: true, rules: plan.rules } : { ok: true }
  }
  return { page, asked, spent: { bytes, values } }
}

/** the asked pages' entries (rangeEntries' `asked`) with the remover's word on each (`removed[p]`: { ok: true, units, at }
 *  or { ok: false, refused }): a removed page its units, its removed page and its kept ink, a refused one its reason; each
 *  its rules. Writes into `page` */
export function withRemoved(page, asked, planOf, removed) {
  for (const p of asked) {
    const e = removed[p], plan = planOf(p)
    const out = e.ok ? { ok: true, units: e.units, ...(e.at ? { at: e.at } : {}), dirty: plan.dirty } : refusal(e.refused)
    if (plan.rules.length) out.rules = plan.rules
    page[p] = out
  }
  return page
}

/** a plan's `remove` as makeAddon's plan entry reads it */
export const removalEntry = r => ({ shows: r.shows, units: r.units.map(([id, glyphs, paths]) => ({ id, glyphs, paths })), names: r.names.map(([occurrence, glyphs]) => ({ occurrence, glyphs })), crops: r.crops.map(([glyphs, paths]) => ({ glyphs, paths })) })

async function shipped({ bytes, index, doc, OPS, PL, deflate, inflate }) {
  if (!(bytes instanceof Uint8Array)) return refusal('the PDF is not bytes')
  const ms = {}
  let t = performance.now()
  const R = await openRemover(bytes, { PL, inflate })
  ms.parse = performance.now() - t
  const N = R.numPages
  if (doc.numPages !== N || index.file.paper.pages !== N) return refusal(`the PDF has ${N} pages, PDF.js ${doc.numPages}, the layout file ${index.file.paper.pages}`)

  // each page's plan, dirty ink, rules and alignment facts from its own ink and operator list; no list is kept
  const read = await pagePlansOf({ doc, OPS, index })
  Object.assign(ms, read.ms)
  const planOf = p => read.plans.get(p) ?? null

  // the removed page, R, only where kept ink lies under a unit's rectangles, and not on a page whose ink the manifest cannot
  // hold: compact; the boxes' share spent over the paper in page order
  t = performance.now()
  const { page, asked } = rangeEntries(planOf, 1, N, { bytes: 0, values: 0 })
  const made = await makeAddon({ R, bytes, alignOf: p => planOf(p).remove.align, deflate, plan: { pages: Object.fromEntries(asked.map(p => [p, removalEntry(planOf(p).remove)])) }, sets: SETS, compact: true, pages: asked })
  const manifest = made.manifest
  manifest.page = withRemoved(page, asked, planOf, manifest.page)

  // (the update's length, as the remover counts it, against what a reader takes and what the manifest says: a bundle's
  // reader needs the tail to be the manifest's `appended` bytes. The tail is the update's own bytes, not a view of arXiv's)
  if (made.appended > ADDON_CAP) return refusal(`the add-on is ${made.appended} bytes, past the ${ADDON_CAP} a reader takes`)
  if (manifest.appended !== made.appended || made.tail.length !== made.appended) return refusal('the add-on\'s bytes are not what its manifest counts')
  const tail = made.tail
  ms.make = performance.now() - t

  // the backstop: the manifest as the reader reads it, byte and value caps and all
  try { parseAddonManifest(new TextEncoder().encode(JSON.stringify(manifest)), { pages: N, views: index.file.views, shipped: true }) } catch (e) { return refusal(`the manifest is outside the reader's bounds: ${reasonOf(e)}`) }
  return { ok: true, tail, manifest, ms }
}
