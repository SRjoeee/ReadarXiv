// lab/pdf/prepare-back/link-targets.mjs: the link targets' record of one paper (docs/PDF-READER.md §20), written by run.mjs into
// its located dump as `linkTargets`, which floats-gate.mjs reads. Not shipped.
// - floats: each float's box as locate made it (packages/engine/src/locate/floats.ts FloatBox), or why it has none, and `stated`
//   where a target of the head states it;
// - wrong: each box a target of the head states, of every kind, read against the bundle's own parts, apart from the engine's
//   counts (boxesWrongOf below): its own ink outside it, its own ink untold, another member's ink in it;
// - landings: each destination's landing (locate/targets.ts) as [dest, kind, page, ord]; dests: how many keys, resolved,
//   landed by kind, refused by the engine by kind and cause, landed nowhere; each stated landing's evidence read again here
//   (`proof` by kind: proved by the edge, its kind claimed by its name alone, wrong) and every wrong one by its cause: a page
//   anchor (`pages`), another member's left edge at its point (`edge`: the line, label or display whose ink begins at the
//   destination's x on the format's grid, its baseline the first under the point), its name's claim another kind
//   (`disagree`), its name claiming nothing and no edge confirming it (`unproven`): the gate fails on any;
// - a citation whose name holds one unit's key (`keys`, run.mjs: each unit holding a bibliography key, with its one located
//   member's ord or null): `byKey` where it lands on that member, whatever the edge reading names (the key decides), wrong where
//   it lands on another (`keyWrong`); each landing by key that the point's rule lands elsewhere (`keyGeometry`: [dest, ord,
//   geometry]) and each one whose point the edge reading gives another member (`keyEdge`: [dest, ord, edge's ord]), each refusal
//   for the key (its entry beginning on another page) with the key's member and the edge's (`keyRefused`: [dest, key's ord,
//   edge's ord or null]), and the keys taken against the citations' names (`keys`: taken, named, matched, the names no key
//   reads, the keys no name reads);
// - bytes: the head's targets as written, raw and gzipped, and the head gzipped with and without them.
import { gzipSync } from 'node:zlib'

/** hyperref's anchor names and the kind each says (hyperref's \theH<counter> anchors: cite., figure., table., section., …) */
const NAMED = [
  [/^Hfootnote\.|footnote\.\d+$/, 'footnote'],
  [/^cite\./, 'reference'],
  [/^(?:figure|table|subfigure|subtable|algorithm)\./, 'float'],
  [/^(?:chapter|section|subsection|subsubsection|paragraph|appendix)\./, 'heading'],
  [/^(?:equation|AMS)\./, 'display'],
]
/** the kind a destination's name claims (the engine's targets.ts CLAIMS and SIMPLE_NAME, read again here) */
const CLAIMS = { cite: 'reference', Hfootnote: 'footnote', page: 'page', part: 'heading', chapter: 'heading', section: 'heading', subsection: 'heading', subsubsection: 'heading', paragraph: 'heading', subparagraph: 'heading', appendix: 'heading', figure: 'float', table: 'float', equation: 'display' }
const SIMPLE_NAME = /^(?:(cite)\.(.+)|([A-Za-z]+)\.([A-Za-z0-9.]+))$/
function claimOf(dest) {
  let name = null
  try { name = JSON.parse(dest) } catch {}
  const m = typeof name === 'string' ? SIMPLE_NAME.exec(name) : null
  const scheme = m?.[1] ?? m?.[3]
  return scheme && Object.hasOwn(CLAIMS, scheme) ? CLAIMS[scheme] : null
}
const r2 = (v) => Math.round(v * 100) / 100
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
/** a member's ink, every page, in page coordinates: each line's band (its ink across, its band up and down), its label's ink,
 *  its elements' ink (`only`: that element's alone), each [page, box, the line or null] */
function inkOf({ pl, back }, only) {
  const out = []
  if (only === undefined) {
    for (const l of pl.lines ?? []) out.push([l[0], pageBox([l[2], l[6], l[3], l[5]], back), l])
    const lab = pl.label?.ink
    if (lab) out.push([lab[0], pageBox([lab[1], lab[2], lab[3], lab[4]], back), null])
  }
  for (const [id, el] of pl.els ?? [])
    if (only === undefined || id === only) for (const k of el.ink ?? []) out.push([k[0], pageBox([k[1], k[2], k[3], k[4]], back), null])
  return out
}
/** the classes the bundle states an element's ink for (format's El: cite, num, other, display, macro, umacro) */
const INKED = new Set(['cite', 'num', 'other', 'display', 'macro', 'umacro'])
/** an element TeX set whose ink the part does not state (format's El): one TeX set outside its unit's text (`keep`; a space sets
 *  no ink), or one of no ink of an inked class stated neither to set nothing (`text` '') nor to be its unit's own text */
const untold = (el) => !el.ink?.length && (el.keep ? el.kind !== 'space' : INKED.has(el.kind) && el.text === undefined)

/**
 * Every box a target of the head states, read against the bundle's parts, by kind (the lead's ruling of 2026-11-28: a stated box
 * holds the whole of what it names or it is not stated). Its own: its member (a float's: its members and captions, as locate
 * states them; a display's: the display element of its member sharing the most of the box). Wrong where:
 * - `own ink outside`: any ink of its own (a line's band, its label's ink, an element's ink) stands on a page that is not the
 *   box's (nor its `next`'s), or outside the box there;
 * - `own ink untold`: its member (not a float's, whose box is its bracket's ink, nor a display's) holds an element TeX set whose
 *   ink the part does not state: no box can be told to hold it;
 * - `foreign text`: another member's ink (a line's band, its label's ink, an element's ink) meets the box's inside. A heading's
 *   window holds by design what stands under its top across its column's measure (its section's paragraphs, a float set there):
 *   there, foreign is another's line whose TeX measure is not inside the window's across or whose band reaches above its top
 *   (another column, a block across both, the text before the heading reaching into it), and another's label or element ink reaching above
 *   the top or whose member has no line in the window that is not foreign (a line set turned has no measure on the page).
 * Each row: the target's dest, kind, page, ord, the member it reads (`by`) and why; one row a member and cause.
 */
export function boxesWrongOf({ floats, parts, head }) {
  const all = parts.flatMap((p) => membersOf(p).map((m) => ({ ...m, page: p.page })))
  const byOrd = new Map()
  for (const m of all) if (!byOrd.has(m.pl.ord)) byOrd.set(m.pl.ord, m)
  const wrong = []
  for (const t of head?.targets ?? []) {
    const [dest, kind, page, ord, box, np, nbox] = t
    const boxes = [[page, box], ...(np ? [[np, nbox]] : [])]
    const row = (by, why) => {
      if (!wrong.some((w) => w.dest === dest && w.by === by && w.why === why)) wrong.push({ dest, kind, page, ord, by, why })
    }
    // (its own)
    const float = kind === 'float' ? floats.find((f) => f.box && f.caption === ord && f.page === page) : null
    const own = float ? [...float.members, ...float.captions] : [ord]
    let only
    if (kind === 'display') {
      // (its element: the display element of its member whose ink on the page shares the most of the box; one the box cuts is
      // found so and read outside below; none sharing any of it: the box holds no display ink of its member, its own outside)
      const pl = byOrd.get(ord)?.pl
      const shared = (e) => {
        let a = 0
        for (const k of e.ink ?? []) if (k[0] === page) a += Math.max(0, Math.min(k[3], box[2]) - Math.max(k[1], box[0])) * Math.max(0, Math.min(k[4], box[3]) - Math.max(k[2], box[1]))
        return a
      }
      const best = (pl?.els ?? []).filter(([, e]) => e.kind === 'display' && shared(e) > 0).sort((x, y) => shared(y[1]) - shared(x[1]))[0]
      if (!best) row(ord, 'own ink outside')
      only = best?.[0] ?? ''
    }
    for (const o of own) {
      const m = byOrd.get(o)
      if (!m) continue
      for (const [p, r] of inkOf(m, only)) if (!boxes.some(([bp, b]) => bp === p && within(r, b))) row(o, 'own ink outside')
      if (kind !== 'float' && kind !== 'display' && (m.pl.els ?? []).some(([, e]) => untold(e))) row(o, 'own ink untold')
    }
    // (another's ink in it)
    const mine = new Set(own)
    for (const [bp, b] of boxes) {
      const window = kind === 'heading'
      const measured = (l) => l[7] >= b[0] && l[8] <= b[2]
      const there = []
      for (const m of all) {
        if (mine.has(m.pl.ord)) continue
        for (const [p, r, l] of inkOf(m)) if (p === bp && meets(r, b)) there.push([m, r, l])
      }
      const under = ([m, r, l]) => !!l && !m.back && measured(l) && r[3] <= b[3]
      const held = new Set(there.filter(under).map(([m]) => m.pl.ord))
      for (const x of there) {
        const [m, r, l] = x
        if (window && (l ? under(x) : r[3] <= b[3] && held.has(m.pl.ord))) continue
        row(m.pl.ord, 'foreign text')
      }
    }
  }
  return wrong
}

/** the record (above) of a paper's floats, landings and destinations, read against its parts and its head */
/** the ord of the one located member of the one unit whose key a citation's name holds: `cite.` and the key byte for byte
 *  (the engine's targets.ts entryOfName, read again here); undefined where no one unit's key reads it, null where that unit has
 *  no one located member */
function keyOrdOf(dest, keys) {
  let name = null
  try { name = JSON.parse(dest) } catch {}
  if (typeof name !== 'string' || !name.startsWith('cite.')) return undefined
  const holders = keys.filter(([k]) => k === name.slice('cite.'.length))
  return holders.length === 1 ? holders[0][1] : undefined
}

export function linkTargetsOf({ floats, landings, refused = [], dests, parts, head, keys = [] }) {
  const wrong = boxesWrongOf({ floats, parts, head })
  // (the floats a target states)
  const stated = new Set((head?.targets ?? []).filter((t) => t[1] === 'float').map((t) => `${t[2]}|${t[3]}`))
  const landed = {}
  for (const l of landings) landed[l.kind] = (landed[l.kind] ?? 0) + 1
  // (each landing's evidence, as the engine reads it (packages/engine/src/locate/targets.ts `contradicted`), read here again from
  // the bundle's parts and the destinations: the name's claim, by the scheme of the package that makes it; the edge reading)
  const partByPage = new Map(parts.map((p) => [p.page, p]))
  const floatOfOrd = new Map()
  for (const f of floats) for (const o of [...f.members, ...f.captions]) floatOfOrd.set(o, f)
  const edgeOf = (pt) => {
    const part = pt && pt.x !== null ? partByPage.get(pt.page) : null
    if (!part) return null
    const at = []
    for (const { pl, back } of membersOf(part)) {
      if (back) continue
      for (const ln of pl.lines ?? []) if (ln[0] === pt.page) at.push([pl.ord, ln[2], ln[4]])
      const lab = pl.label?.ink
      if (lab && lab[0] === pt.page) at.push([pl.ord, lab[1], lab[5]])
      for (const [, el] of pl.els ?? []) if (el.kind === 'display') for (const k of el.ink ?? []) if (k[0] === pt.page) at.push([pl.ord, k[1], k[5]])
    }
    const gx = r2(pt.x), gy = r2(pt.y)
    const under = at.filter((e) => Math.abs(r2(e[1]) - gx) <= 0.01 && r2(e[2]) <= gy && pt.y - e[2] <= 24).sort((a, b) => b[2] - a[2])[0]
    if (!under) return null
    const f = floatOfOrd.get(under[0])
    return f ? f.caption : under[0]
  }
  const disagree = [], edge = [], unproven = [], pages = [], keyWrong = [], keyGeometry = [], keyEdge = []
  const proof = {}
  for (const l of landings) {
    const claim = claimOf(l.dest)
    const e = edgeOf(dests.get(l.dest))
    const k = keyOrdOf(l.dest, keys)
    const p = (proof[l.kind] ??= { byKey: 0, proved: 0, kindOnly: 0, wrong: 0 })
    let bad = true
    const byKey = k !== undefined && k !== null
    if (claim === 'page') pages.push([l.dest, l.kind, l.ord])
    else if (byKey && k !== l.ord) keyWrong.push([l.dest, l.kind, l.ord, k])
    else if (!byKey && e !== null && e !== l.ord) edge.push([l.dest, l.kind, l.ord, e])
    else if (claim && claim !== l.kind) disagree.push([l.dest, l.kind, claim])
    else if (!claim && e !== l.ord) unproven.push([l.dest, l.kind, l.ord])
    else bad = false
    if (bad) p.wrong++
    else if (k !== undefined && k !== null) p.byKey++
    else if (e === l.ord) p.proved++
    else p.kindOnly++
    if (!bad && l.byKey && l.byKey.geometry !== l.ord) keyGeometry.push([l.dest, l.ord, l.byKey.geometry])
    // (the key decides; where the edge reading names another member, counted)
    if (!bad && byKey && e !== null && e !== l.ord) keyEdge.push([l.dest, l.ord, e])
  }
  // (each refusal for the key: the key's member and the edge's at the point)
  const keyRefused = refused.filter(([, , cause]) => cause === 'key').map(([dest]) => [dest, keyOrdOf(dest, keys) ?? null, edgeOf(dests.get(dest))])
  // (the keys taken, against the names of the citations' destinations: matched by one unit's key, or not)
  const citeNames = []
  for (const [d] of dests) {
    let name = null
    try { name = JSON.parse(d) } catch {}
    if (typeof name === 'string' && name.startsWith('cite.')) citeNames.push([d, name])
  }
  const read = new Set()
  const unmatchedNames = []
  for (const [d, name] of citeNames) {
    const by = keys.filter(([k]) => k === name.slice('cite.'.length))
    if (keyOrdOf(d, keys) === undefined) unmatchedNames.push(name)
    for (const [k] of by) read.add(k)
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
  // (what the engine refused to state, by kind and cause, and what landed nowhere)
  const refusedBy = {}
  for (const [, kind, cause] of refused) {
    const r = (refusedBy[kind] ??= {})
    r[cause] = (r[cause] ?? 0) + 1
  }
  const resolved = [...dests.values()].filter(Boolean).length
  const targets = head?.targets ? JSON.stringify(head.targets) : ''
  const { targets: _, ...bare } = head ?? {}
  return {
    floats: floats.map(({ serial, page, caption, captions, type, box, union, cause, foreign, cut, outside, unpaired, members }) => ({ serial, page, caption, captions, type, box, union, cause, foreign, cut, outside, unpaired, members, ...(box && stated.has(`${page}|${caption}`) ? { stated: 1 } : {}) })),
    wrong,
    landings: landings.map((l) => [l.dest, l.kind, l.page, l.ord]),
    dests: { keys: dests.size, resolved, landed, refused: refusedBy, nowhere: dests.size - landings.length - refused.length, named },
    proof,
    disagree,
    edge,
    unproven,
    pages,
    keyWrong,
    keyGeometry,
    keyEdge,
    keyRefused,
    keys: {
      taken: keys.length,
      named: citeNames.length,
      matched: citeNames.length - unmatchedNames.length,
      unmatchedNames,
      unmatchedKeys: keys.map(([k]) => k).filter((k) => !read.has(k)),
    },
    bytes: {
      targets: targets.length,
      targetsGzip: targets ? gzipSync(targets).length : 0,
      head: head ? gzipSync(JSON.stringify(head)).length : 0,
      headBare: head ? gzipSync(JSON.stringify(bare)).length : 0,
    },
  }
}
