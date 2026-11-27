// lab/pdf/prepare-back/link-targets.mjs: the link targets' record of one paper (docs/PDF-READER.md §20), written by run.mjs into
// its located dump as `linkTargets`, which floats-gate.mjs reads. Not shipped.
// - floats: each float's box as locate made it (packages/engine/src/locate/floats.ts FloatBox), or why it has none;
// - wrong: each boxed float read against the bundle's own parts, apart from the engine's counts: a member of its own (its
//   members and captions, by ord) with ink outside the box (a line's ink across at its baseline, an element's or a label's ink:
//   `own ink outside`), or another member's line band, element or label ink meeting the box's inside (`foreign text`);
// - landings: each destination's landing (locate/targets.ts) as [dest, kind, page, ord]; dests: how many keys, resolved,
//   landed by kind, landed nowhere; disagree: each landing whose kind its hyperref name does not say ([dest, kind, the
//   name's kind]): a check of the rule, never a rule (the design's L4);
// - bytes: the head's targets as written, raw and gzipped, and the head gzipped with and without them.
import { gzipSync } from 'node:zlib'

/** hyperref's anchor names and the kind each says (hyperref's \theH<counter> anchors: cite., figure., table., section., …) */
const NAMED = [
  [/^cite\./, 'reference'],
  [/^(?:figure|table|subfigure|subtable|algorithm)\./, 'float'],
  [/^(?:chapter|section|subsection|subsubsection|paragraph|appendix)\./, 'heading'],
  [/^(?:equation|AMS)\./, 'display'],
  [/^Hfootnote\./, 'footnote'],
]
const meets = (r, u) => r[0] < u[2] && r[2] > u[0] && r[1] < u[3] && r[3] > u[1]
const within = (r, u) => r[0] >= u[0] && r[2] <= u[2] && r[1] >= u[1] && r[3] <= u[3]

/** a part's members on its page in page coordinates: its flows', and its turned frames' turned back by their direction */
function membersOf(part) {
  const out = (part.flows ?? []).flat().map((pl) => ({ pl, back: null }))
  for (const f of part.frames ?? []) for (const pl of f.flows.flat()) out.push({ pl, back: f.dir })
  return out
}
/** a box of a frame (x0 y0 x1 y1 in the frame) on the page: its corners turned back by `dir`, the page's (x, y) = (ux fx - uy fy,
 *  uy fx + ux fy) */
function pageBox(b, dir) {
  if (!dir) return b
  const [ux, uy] = dir
  const xs = [], ys = []
  for (const [fx, fy] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
    xs.push(ux * fx - uy * fy)
    ys.push(uy * fx + ux * fy)
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
/** a member's ink on a page: its lines (each its band, and its ink across at its baseline), its elements' and its label's ink */
function inkOf({ pl, back }, page) {
  const bands = [], ink = []
  for (const l of pl.lines ?? []) {
    if (l[0] !== page) continue
    bands.push(pageBox([l[2], l[6], l[3], l[5]], back))
    ink.push(pageBox([l[2], l[4], l[3], l[4]], back))
  }
  for (const [, el] of pl.els ?? []) for (const k of el.ink ?? []) if (k[0] === page) ink.push(pageBox([k[1], k[2], k[3], k[4]], back))
  const lab = pl.label?.ink
  if (lab && lab[0] === page) ink.push(pageBox([lab[1], lab[2], lab[3], lab[4]], back))
  return { bands, ink }
}

/** the record (above) of a paper's floats, landings and destinations, read against its parts and its head */
export function linkTargetsOf({ floats, landings, dests, parts, head }) {
  const wrong = []
  for (const f of floats) {
    if (!f.box) continue
    const own = new Set([...f.members, ...f.captions])
    const part = parts.find((p) => p.page === f.page)
    for (const m of part ? membersOf(part) : []) {
      const { bands, ink } = inkOf(m, f.page)
      if (own.has(m.pl.ord)) {
        if (ink.some((r) => !within(r, f.box))) wrong.push({ serial: f.serial, page: f.page, ord: m.pl.ord, why: 'own ink outside' })
      } else if ([...bands, ...ink].some((r) => meets(r, f.box))) wrong.push({ serial: f.serial, page: f.page, ord: m.pl.ord, why: 'foreign text' })
    }
  }
  const landed = {}
  for (const l of landings) landed[l.kind] = (landed[l.kind] ?? 0) + 1
  const disagree = []
  for (const l of landings) {
    let name = null
    try { name = JSON.parse(l.dest) } catch {}
    if (typeof name !== 'string') continue
    const said = NAMED.find(([re]) => re.test(name))?.[1]
    if (said && said !== l.kind) disagree.push([l.dest, l.kind, said])
  }
  // (each destination with a name hyperref's says a kind of, by that kind: how many, and how many of them landed)
  const named = {}
  const landedSet = new Set(landings.map((l) => l.dest))
  for (const [k] of dests) {
    let name = null
    try { name = JSON.parse(k) } catch {}
    const said = typeof name === 'string' ? NAMED.find(([re]) => re.test(name))?.[1] ?? 'other' : 'explicit'
    const n = (named[said] ??= { keys: 0, landed: 0 })
    n.keys++
    if (landedSet.has(k)) n.landed++
  }
  const resolved = [...dests.values()].filter(Boolean).length
  const targets = head?.targets ? JSON.stringify(head.targets) : ''
  const { targets: _, ...bare } = head ?? {}
  return {
    floats: floats.map(({ serial, page, caption, captions, type, box, cause, foreign, cut, outside, unpaired, members }) => ({ serial, page, caption, captions, type, box, cause, foreign, cut, outside, unpaired, members })),
    wrong,
    landings: landings.map((l) => [l.dest, l.kind, l.page, l.ord]),
    dests: { keys: dests.size, resolved, landed, nowhere: dests.size - landings.length, named },
    disagree,
    bytes: {
      targets: targets.length,
      targetsGzip: targets ? gzipSync(targets).length : 0,
      head: head ? gzipSync(JSON.stringify(head)).length : 0,
      headBare: head ? gzipSync(JSON.stringify(bare)).length : 0,
    },
  }
}
