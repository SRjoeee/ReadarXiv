// A paper's shipped add-on (Plan 8's layer bundle holds it): arXiv's PDF with the text of the paper's units taken out
// of the pages where the layer cannot simply fill paper over them, written as an incremental update (layout/remove.mjs),
// and the manifest that tells a reader which pages it removes and where kept ink lies. The bytes after arXiv's own are the
// add-on's `tail`: arXiv's bytes followed by it are the document the reader opens. It is one a paper whatever the target
// (the plan comes from the layout file alone, layer-proto/removal.mjs pagePlan), made where the layout file is made, and
// before 2026-10-08 only by the layer gate's spike (spikes/layer-gate.mjs buildAddon), which now calls this: one
// implementation, the server's.
//
// What it holds, page by page:
//   - a page the plan names (a unit the file locates there owns glyphs or rules) and where kept ink lies under a unit's
//     rectangles (pageDirty: a glyph no unit takes, a rule, an image): the removed page, R, compact (only these pages, each
//     named in its entry's `at`), and the entry's `dirty`, the boxes of that ink, where the reader swaps R in;
//   - a planned page with none: `{ ok: true }` and no page, for a fill with paper over the file's rectangles needs no
//     removed page, only the manifest's word that the page is drawn so. The remover never reads such a page, so it never
//     refuses one; the layer gate's check (every set made, every page checked) is the gate's own and may refuse more;
//   - a planned page the remover refuses (a form painted twice, a font it cannot walk, a budget): `{ ok: false, refused }`
//     and nothing removed, the reader draws its units the old way, erased and put back, which loses no unit;
//   - a page no unit is planned on, or one that is rotated or past the ink reader's cap: `{ ok: false, refused: 'not
//     planned' }`;
//   - on a planned page the entry's `rules` too (pageRules): the rules near a table cell's lines, which the reader keeps a
//     taller script's text clear of; they are the PDF's own geometry, so the remover's refusal of the page leaves them.
// The manifest is the shipped form (addon-manifest.mjs): no set past R, no outline table, no crop colours. Every reason
// is cut to REFUSED_MAX characters, and the manifest is checked by the reader's own bounds before it is returned, so that
// what is shipped is what every reader accepts: a manifest the bundle's reader refused would refuse the whole bundle.
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
import { ADDON_CAP, checkAddonManifest, REFUSED_MAX } from './addon-manifest.mjs'
import { pageInk } from './ink.mjs'
import { makeAddon, openRemover, SETS } from './remove.mjs'

const refusal = why => ({ ok: false, refused: String(why).slice(0, REFUSED_MAX) })

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
    return refusal(`the add-on could not be made: ${String(e?.message ?? e)}`)
  }
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
  const planned = [], dirty = {}, rules = {}, swapped = { pages: {} }
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
    if (pp.units.length) {
      planned.push(p)
      const d = pageDirty(index, p, ink, pp)
      if (d.length) { dirty[p] = d; swapped.pages[p] = pp }
      const r = pageRules(index, p, ink)
      if (r.length) rules[p] = r
    }
    ms.plan += performance.now() - t
  }

  // the removed page, R, only where kept ink lies under a unit's rectangles; compact
  t = performance.now()
  const made = await makeAddon({ R, bytes, OPS, opListOf: async p => (await doc.getPage(p)).getOperatorList(), deflate, plan: swapped, sets: SETS, compact: true })
  const manifest = made.manifest
  for (const p of planned) {
    if (!dirty[p]) manifest.page[p] = { ok: true }
    else if (manifest.page[p].ok) manifest.page[p].dirty = dirty[p]
    if (rules[p]) manifest.page[p].rules = rules[p]
  }
  for (const entry of Object.values(manifest.page)) if (entry.refused !== undefined && entry.refused.length > REFUSED_MAX) entry.refused = entry.refused.slice(0, REFUSED_MAX)
  const tail = made.bytes.slice(bytes.length)
  ms.make = performance.now() - t

  if (tail.length > ADDON_CAP) return refusal(`the add-on is ${tail.length} bytes, past the ${ADDON_CAP} a reader takes`)
  try { checkAddonManifest(manifest, { pages: N, views: index.file.views, shipped: true }) } catch (e) { return refusal(`the manifest is outside the reader's bounds: ${String(e?.message ?? e)}`) }
  return { ok: true, tail, manifest, ms }
}
