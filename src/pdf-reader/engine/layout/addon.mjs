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
import { makeAddon, openRemover, SETS } from './remove.mjs'

/** the share of the manifest's byte and value caps that the paper's `dirty` and `rules` boxes may take, in page order: the
 *  other half is for the rest of the manifest (an entry a page, its units' ids, its reasons), which no page's ink changes */
const BOXES_BYTES = ADDON_MANIFEST_CAP / 2, BOXES_VALUES = ADDON_MANIFEST_VALUES / 2

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

/** why a planned page's kept ink `dirty` and `rules` cannot go into the manifest, or null, and then their cost is taken out
 *  of `budget` (the boxes' share of the caps, in page order): a box past the page's view by the reader's slack or an empty
 *  one (addon-manifest.mjs checkBoxes, the reader's own), or more than the budget has left */
function unfit(views, page, dirty, rules, budget) {
  try {
    checkBoxes(dirty, page, views, 'dirty')
    checkBoxes(rules, page, views, 'rules')
  } catch (e) { return `its kept ink or rules cannot be written: ${reasonOf(e)}` }
  let bytes = 0, values = 0
  for (const boxes of [dirty, rules]) if (boxes.length) { bytes += JSON.stringify(boxes).length; values += boxes.length + 1 }
  if (budget.bytes + bytes > BOXES_BYTES || budget.values + values > BOXES_VALUES) return `its kept ink and rules (${dirty.length + rules.length} numbers) are more than the manifest has left`
  budget.bytes += bytes
  budget.values += values
  return null
}

async function shipped({ bytes, index, doc, OPS, PL, deflate, inflate }) {
  if (!(bytes instanceof Uint8Array)) return refusal('the PDF is not bytes')
  const ms = {}
  let t = performance.now()
  const R = await openRemover(bytes, { PL, inflate })
  ms.parse = performance.now() - t
  const N = R.numPages
  if (doc.numPages !== N || index.file.paper.pages !== N) return refusal(`the PDF has ${N} pages, PDF.js ${doc.numPages}, the layout file ${index.file.paper.pages}`)

  // each page's plan, dirty ink and rules from its own ink; no operator list is kept here (the pages the add-on removes ask
  // for theirs again, which PDF.js holds already)
  const planned = [], dirty = {}, rules = {}, swapped = { pages: {} }, unwritable = {}, budget = { bytes: 0, values: 0 }
  ms.ops = 0
  ms.ink = 0
  ms.plan = 0
  for (let p = 1; p <= N; p++) {
    const page = await doc.getPage(p)
    t = performance.now()
    const list = await page.getOperatorList()
    ms.ops += performance.now() - t
    t = performance.now()
    const ink = pageInk(OPS, list, page.commonObjs, { rotate: page.rotate, indices: true })
    ms.ink += performance.now() - t
    // (a page rotated, or past the ink reader's cap, has no plan: the layer lays over neither)
    if (ink.rotated || ink.capped) continue
    t = performance.now()
    const { own: _own, ...pp } = pagePlan(index, p, ink)
    if (pp.units.length || pp.names.length) {
      const d = pageDirty(index, p, ink, pp), r = pageRules(index, p, ink)
      const why = unfit(index.file.views, p, d, r, budget)
      if (why) unwritable[p] = why
      else {
        planned.push(p)
        if (d.length) { dirty[p] = d; swapped.pages[p] = pp }
        if (r.length) rules[p] = r
      }
    }
    ms.plan += performance.now() - t
  }

  // the removed page, R, only where kept ink lies under a unit's rectangles, and not on a page whose ink the manifest cannot
  // hold: compact
  t = performance.now()
  const made = await makeAddon({ R, bytes, OPS, opListOf: async p => (await doc.getPage(p)).getOperatorList(), deflate, plan: swapped, sets: SETS, compact: true })
  const manifest = made.manifest
  for (const p of planned) {
    if (!dirty[p]) manifest.page[p] = { ok: true }
    else if (manifest.page[p].ok) manifest.page[p].dirty = dirty[p]
    if (rules[p]) manifest.page[p].rules = rules[p]
  }
  for (const p of Object.keys(unwritable)) manifest.page[p] = { ok: false, refused: unwritable[p] }
  for (const entry of Object.values(manifest.page)) if (entry.refused !== undefined && entry.refused.length > REFUSED_MAX) entry.refused = entry.refused.slice(0, REFUSED_MAX)

  // (the update's length, as the remover counts it, against what a reader takes and what the manifest says: a bundle's
  // reader needs the tail to be the manifest's `appended` bytes. The tail is a copy: a view would carry arXiv's bytes with
  // it across a worker's boundary)
  if (made.appended > ADDON_CAP) return refusal(`the add-on is ${made.appended} bytes, past the ${ADDON_CAP} a reader takes`)
  if (manifest.appended !== made.appended || made.bytes.length !== bytes.length + made.appended) return refusal('the add-on\'s bytes are not what its manifest counts')
  const tail = made.bytes.slice(bytes.length)
  ms.make = performance.now() - t

  // the backstop: the manifest as the reader reads it, byte and value caps and all
  try { parseAddonManifest(new TextEncoder().encode(JSON.stringify(manifest)), { pages: N, views: index.file.views, shipped: true }) } catch (e) { return refusal(`the manifest is outside the reader's bounds: ${reasonOf(e)}`) }
  return { ok: true, tail, manifest, ms }
}
