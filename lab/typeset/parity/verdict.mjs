// lab/typeset/parity/verdict.mjs: the display gate's measures and its verdict, no file read (measure.mjs reads the run and
// writes the sheet). `measurePage` takes one page as render.mjs drew and read it back, the entry's Pages and the part's facts
// (v2.mjs), and the original's lines of today's units; it gives each measure as each side's distance from arXiv's page, the
// differences past a noise floor judged (v2 nearer passes, farther fails the page), and each side's faults against the
// absolute bounds. `coverageOf` holds the run to what it asked: every asked pair drawn by this run from the pages v2.mjs laid
// for it, every page of each drawn and measured. `verdictOf`: the gate passes only on complete coverage with no page worse.
import { judgeJoined, joinedOf, measureFidelity, mutualBest as bestPairs, originalOf, SIZE_STEP } from './fidelity.mjs'
import { sentencesPaired } from './sentences.mjs'

const r2 = (v) => (v === null || v === undefined ? v : Math.round(v * 100) / 100)
/** the stand-in of a crop in a drawn line's text (measure-dom.mjs: a transparent run, the canvas draws its ink) */
const OBJ = '\ufffc'
/** the CJK opening marks, whose advance's blank half stands before their ink */
const OPENING = /[\u3008\u300a\u300c\u300e\u3010\u3014\u3016\u3018\u301a\u301d\u2018\u201c\uff08\uff3b\uff5b\uff5f]/
/** the CJK closing marks (closing brackets, full stops, commas: JLREQ cl-02, cl-06, cl-07; the full-width colon and question
 *  mark, which the SC faces set in the first half of the em, GB/T 15834), whose ink stands in the first half of their advance,
 *  its second half blank */
const CLOSING = /[\u3001\u3002\uff0c\uff0e\uff1a\uff1f\u3009\u300b\u300d\u300f\u3011\u3015\u3017\u3019\u301b\u301e\u301f\u2019\u201d\uff09\uff3d\uff5d\uff60]/
/** the highlight's paint beside a box, PDF units: both readers' pad of 3 CSS px (view/lighting.mjs PAD, packages/reader
 *  compose/highlight.ts PAD) at the parity's drawing scale (render.mjs SCALE: 96/72 CSS px a point) */
export const PAINT_PAD = (3 * 72) / 96

/**
 * The absolute bounds: a side's fault, measured against the original (README.md gives the reason of each). Shown on the
 * sheet beside the verdict; a fault today shares is not v2's.
 */
export const BOUNDS = {
  /** the first line's baseline AND its em top (baseline + 0.8 size) both off by more than this share of the size */
  anchor: 0.25,
  /** a line's start (left, justified), midpoint (centred) or end (right) off the original's by more than this share of the
   *  size, 1 pt at least */
  align: 0.25,
  alignMin: 1,
  /** a word space over this many ems; a gap between two letters over this many */
  word: 1.0,
  letter: 0.25,
  /** a laid line over another unit's box by more than this, points, both ways (a rule crossed is a fault outright) */
  cross: 1,
  /** a follower starting further from its head's end than the original's separation by more than this share of the size */
  gap: 0.5,
  /** device pixels differing from arXiv's page outside every unit's box */
  pixels: 150,
}
/**
 * The noise floors: two sides' distances from the original closer than this are the same; past it, the nearer side wins.
 * Each is a step a reader sees on the page, and above what drawing the same thing twice moves.
 */
export const NEAR = {
  /** positions (anchor, alignment, separation): a tenth of the size, a point at least */
  position: 0.1,
  positionMin: 1,
  /** the text's darkness: a share of the original text's own darkness */
  weight: 0.05,
  /** a size: a share of the original's, half the fit's step of 0.025 (a step is a size a reader sees; two steps, the floor
   *  before 2026-11-08, hid a body grown 5 % over the original's, 2610.10069 p5) */
  size: SIZE_STEP / 2,
  /** a style's share of a unit's characters, and 3 characters at least */
  style: 0.15,
  styleMin: 3,
  /** an over-stretched line's overshoot past its bound, ems */
  stretch: 0.1,
  /** device pixels off arXiv's page outside the units */
  pixels: 150,
  /** the least glyph pixels of translated text each side needs for its darkness to be compared */
  weightPixels: 3000,
}
/** how much each measure weighs in a page's order (each measure's worse differences counted, 8 at most) */
export const WEIGHT = {
  shown: 3,
  weight: 3,
  anchor: 3,
  align: 3,
  cross: 3,
  gap: 3,
  turn: 3,
  over: 3,
  frame: 3,
  lead: 3,
  block: 3,
  elements: 3,
  stretch: 2,
  style: 2,
  pixels: 2,
  figures: 2,
  erased: 2,
  groups: 2,
  labels: 2,
  size: 1,
  links: 1,
  borders: 1,
  highlight: 1,
  folio: 1,
  ink: 1,
  'line-count': 0.5,
}
export const FLAGS = Object.keys(WEIGHT)
/** what each measure is, as a distance from the original */
export const SAYS = {
  shown: "a unit today shows translated that v2 leaves the original's, or its label today relabels that v2 keeps the original's: a translation missing (no nearness judged)",
  weight: "the translated text's ink darkness (mean over its glyph pixels) against the original text's (its units' lines on arXiv's page)",
  anchor: "a unit's first line against the original's first line: the smaller of its baseline's and its em top's offsets",
  align: "TeX's alignment kept: a line's start (left, justified), midpoint (centred) or end (right) against the original's lines'",
  cross: "the original's room kept: a laid line across a vertical rule of arXiv's page or over another unit's box (none on the original)",
  gap: "a run-in follower's start against its head's end, against the original's separation",
  turn: "a unit TeX set turned (a figure's rotated text) drawn upright (the original's, and today's, turned)",
  stretch: 'the spacing kept: a line\'s word space past 1 em or letter gap past 0.25 em (the original\'s none), by how much',
  style: "a unit's share of bold and of slanted characters against the original's style (its TeX font state)",
  pixels: "the page outside every unit's box against arXiv's page: device pixels off it",
  figures: "the figure texts drawn translated (each side's drawn groups): fewer than today's is a translation missing",
  size: "a unit's size against the original's; a size tie's (one paragraph) at its smallest member's, against today's smallest over the same members",
  links: "the links a reader can follow on the page (the anchors each side drew) against the original's link annotations: how many are missing",
  borders: "the links drawn with a border (the anchors each side drew with one) against the original's link annotations PDF.js draws a border round: how many are missing",
  highlight: "the units today highlights: the lines each side's sentence boxes leave uncovered (its drawn lines, its original's), v2's against today's; elsewhere v2's boxes that miss its drawn lines or its original's (none is no fault; covering boxes where today draws none are better)",
  'line-count': "a unit's line count on the page against the original's",
  over: "a side's text drawn over ink that stays (the copy's, a crop's, the original's it keeps): device pixels of its text over other ink (the original: none)",
  frame: "a laid line past its column or the original's text block (a cell: past its own room, the owner's ruling 3), points (the original: none)",
  block: "lines borrowed past TeX's room: under its text block bottom, or the next ink nearer than its paragraph separation (the owner's ruling 1)",
  elements: "an element drawn otherwise than the original sets it: pieces TeX set on one line drawn apart, its scripts set flat as text, drawn as nothing where TeX set ink",
  erased: "the original's glyphs a side shows in part inside its translated units' regions (an erasure's sliver)",
  groups: "a table's grid group translated or kept whole as today decides (the owner's ruling 3); a group v2 is handed already decided is not exercised, apart",
  labels: "a paper's labels in one form, the target word everywhere (the owner's ruling 4)",
  folio: "a page number at its size, right-aligned (the owner's ruling 6)",
  lead: "a text's leading tighter than the original's while its block has room: its pitch over its size against the original's",
  ink: "a text whose original ink is black drawn in another fill (the owner's ruling 7: the PDF's own black)",
}

// ---------------------------------------------------------------- one page
/**
 * One page measured: `v2` v2.mjs's file of the pair (its Pages, the part's facts, the join of part members to today's units),
 * `rec` render.mjs's record of the page (what each side drew, read back, and its pixels), `prepByOrd` today's prepare dump's
 * units by ord (the original's lines of today's units), `todayOf` part ord → today's ord, `turned` the part's members set
 * turned on A, `led` the part's run-ins (follower ord → its leader's ord: Placed.join, a bound name's lead), `top` its title and
 * front matter (Placed.title, Placed.front: anchored at their first line). A page either side did not draw is an error: no comparison made, and the gate incomplete (coverageOf)
 */
export function measurePage(pair, v2, rec, { prepByOrd, todayOf, turned, led, top, frame, groups, keptByGroup, folios }) {
  const n = rec.page
  const out = { pair, page: n, worse: 0, diffs: [], faults: {}, measures: {}, units: [] }
  const error =
    rec.error ??
    (!rec.today ? "today's side not drawn" : !rec.v2 ? "v2's side not drawn" : rec.today.error ? `today's page not laid: ${rec.today.error}` : rec.today.lit.length && !rec.today.litBoxes ? "today's sentence boxes not read (a drawing of before they were)" : null)
  if (error) {
    out.error = error
    return out
  }
  const facts = new Map((v2.facts[n]?.members ?? []).map((m) => [m.ord, m]))
  const laidV2 = new Map((v2.pages[n]?.members ?? []).filter((m) => m.state === 'laid').map((m) => [m.ord, m]))
  const stateOf = new Map((v2.pages[n]?.members ?? []).map((m) => [m.ord, m.state]))
  // (each side's drawn lines by its unit, keyed by today's ord where the unit has one, else the part's ord)
  const keyOfPart = (o) => (todayOf.has(o) ? `t${todayOf.get(o)}` : `p${o}`)
  // (a line's extent is its drawn characters' and its crops': a crop standing on the line (a formula's ink, drawn by the
  // canvas, not the SVG) extends it, at its start as at its end. A crop stands on one line, the one of its unit whose band
  // holds most of its height (its ink's middle nearest the baseline where two hold as much): a formula's ink that dips into the
  // next line's band is its own line's, a raised script's its own line's, never the neighbour's)
  const withCrops = (u, crops) => {
    const ls = raised(u.lines.filter((l) => l.n > 0))
    const on = new Map()
    for (const c of crops) {
      if (c[0] !== u.id) continue
      const meets = ls.filter((l) => !l.rot && c[2] < l.y + 0.8 * l.size && c[4] > l.y - 0.2 * l.size)
      if (!meets.length) continue
      const held = (l) => Math.min(c[4], l.y + 0.8 * l.size) - Math.max(c[2], l.y - 0.2 * l.size)
      const mid = (l) => Math.abs((c[2] + c[4]) / 2 - l.y)
      const host = meets.reduce((a, b) => (held(b) > held(a) || (held(b) === held(a) && mid(b) < mid(a)) ? b : a))
      if (!on.has(host)) on.set(host, [])
      on.get(host).push(c)
    }
    return ls.map((l) => {
      const cs = on.get(l)
      return cs ? { ...l, x0: Math.min(l.x0, ...cs.map((c) => c[1])), x1: Math.max(l.x1, ...cs.map((c) => c[3])) } : l
    })
  }
  const drawn = (units, crops, keyOf) =>
    new Map(units.filter((u) => u.lines.some((l) => l.n > 0)).map((u) => [keyOf(u.id), withCrops(u, crops)]))
  const T = drawn(rec.today.units, rec.today.crops ?? [], (o) => `t${o}`)
  const V = drawn(rec.v2.units, rec.v2.crops ?? [], keyOfPart)
  // (the original's facts of a unit: the part's where it has a member (its lines on A, TeX's alignment and font state, its
  // kind, its label), else today's prepare dump's lines)
  const orig = new Map()
  for (const m of facts.values()) {
    if (turned.has(m.ord)) continue
    const lines = m.lines
      .filter((l) => l[0] === n)
      .map((l) => ({ x0: l[2], x1: l[3], y: l[4], top: Math.max(l[5], l[6]), bottom: Math.min(l[5], l[6]), size: l[10] ?? m.style.size, m0: l[7], m1: l[8] }))
    // (a label TeX set on the first line (a caption's "Table 4:", a numbered head's number), which a side either keeps as the
    // original's ink or draws anew with the translation: the first line may start at the text's start or at the label's)
    const lb = m.label?.ink
    if (lines.length && m.lines[0]?.[0] === n && lb?.[0] === n && Math.abs(lb[5] - lines[0].y) <= 0.5) lines[0] = { ...lines[0], label: lb[1] }
    orig.set(keyOfPart(m.ord), { kind: m.kind, align: m.align, style: m.style, lines, first: m.lines[0]?.[0] === n, last: m.lines.at(-1)?.[0] === n, top: !!top?.has(m.ord), part: m.ord, size: m.style.size, label: m.label ?? null })
  }
  for (const key of T.keys()) {
    if (orig.has(key)) continue
    const u = prepByOrd.get(Number(key.slice(1)))
    if (!u) continue
    const lines = (u.lines ?? []).filter((l) => l.page === n && !l.rot).map((l) => ({ x0: l.x0, x1: l.x1, y: l.baseline, top: Math.max(l.top, l.bottom), bottom: Math.min(l.top, l.bottom), size: l.size }))
    orig.set(key, { kind: u.kind, align: null, style: null, lines, first: u.lines?.[0]?.page === n, part: null, size: lines[0]?.size ?? null })
  }
  // (the run-ins the part states (`led`, follower ord -> its leader's): a follower it joins to the member before it in its flow
  // (Placed.join: the two share that one's last line, TeX's separation between them), and the member a bound name leads
  // (lay/lead.ts); each judged where its first line on this page is the leader's last. Two units set on one line otherwise
  // (an author's address in a column of its own beside another's, a table's cells, a figure's texts) are no run-in: each
  // stands where TeX set it, judged by anchor and align)
  const APART = new Set(['cell', 'figure', 'inkfigures'])
  const runIns = []
  for (const [fk, f] of orig) {
    const lead = f.part === null || !f.first || APART.has(f.kind) ? undefined : led?.get(f.part)
    if (lead === undefined || !f.lines.length) continue
    const hk = keyOfPart(lead),
      h = orig.get(hk)
    if (!h?.lines.length || APART.has(h.kind)) continue
    const hl = [...h.lines].sort((a, b) => a.y - b.y)[0]
    const fl = [...f.lines].sort((a, b) => b.y - a.y)[0]
    if (Math.abs(fl.y - hl.y) > 0.5) continue
    runIns.push({ hk, h, hl, fk, f, fl, sz: fl.size || f.size || 10, sep: fl.x0 - hl.x1 })
  }
  const followers = new Set(runIns.map((r) => r.fk))
  const faults = { today: {}, v2: {} }
  const fault = (side, flag, what) => (faults[side][flag] ??= []).push(what)
  const diff = (flag, unit, what, origV, t, v, worse, nearer) => out.diffs.push({ flag, unit, what, original: origV, today: t, v2: v, nearer, worse })
  /** two distances from the original judged: the nearer side, past the floor `eps` (equal within it) */
  const judge = (flag, unit, what, origV, t, v, eps, fmt = r2) => {
    if (t.d === null || v.d === null || Math.abs(v.d - t.d) <= eps) return
    const nearer = v.d < t.d ? 'v2' : 'today'
    diff(flag, unit, what, typeof origV === 'number' ? fmt(origV) : origV, { value: t.value, off: fmt(t.d) }, { value: v.value, off: fmt(v.d) }, nearer === 'today', nearer)
  }

  // (v2's size ties on the page, the part's (one paragraph's text is even, the owner's ruling: a run-in head with its
  // paragraph, a paragraph a display splits, laid at one scale): each tie of two members or more both sides draw here is
  // judged as one paragraph below, its members' sizes not one by one)
  const tieOf = new Map()
  const ties = []
  for (const ords of v2.facts[n]?.ties ?? []) {
    const keys = [...new Set(ords.map(keyOfPart))].filter((k) => T.has(k) && V.has(k))
    if (keys.length < 2) continue
    for (const k of keys) tieOf.set(k, ties.length)
    ties.push(keys)
  }

  // (the original's style and size read off arXiv's glyphs in each unit's lines, apart from the part: render.mjs's runs of
  // PDF.js's text content; a drawing of before them, the part's)
  const runs = rec.original?.runs ?? null,
    fonts = rec.original?.fonts ?? []
  const aOrig = new Map()
  if (runs)
    for (const [key, o] of orig) {
      const a = originalOf(runs, fonts, o.lines.map((l) => [l.x0, l.bottom ?? l.y - 0.2 * l.size, l.x1, l.top ?? l.y + 0.8 * l.size]))
      if (a) aOrig.set(key, a)
    }
  /** a drawn line by its ink: a CJK opening mark's blank first half and a closing mark's blank second half no ink */
  const inkOf = (l) => {
    if (l.rot) return l
    const t = l.text.trim()
    const x0 = l.x0 + (OPENING.test(t[0] ?? '') ? 0.5 * l.size : 0),
      x1 = l.x1 - (CLOSING.test(t.at(-1) ?? '') ? 0.5 * l.size : 0)
    return x1 > x0 ? { ...l, x0, x1 } : l
  }

  // ------------------------------------------------ per unit, each side's distances from the original
  const units = []
  for (const key of new Set([...T.keys(), ...V.keys()])) {
    const o = orig.get(key)
    const u = { key, kind: o?.kind ?? null, part: o?.part ?? null, align: o?.align ?? null, sides: {} }
    const name = `${key} ${u.kind ?? ''}`.trim()
    for (const [side, M] of [['today', T], ['v2', V]]) {
      const all = M.get(key)
      if (!all) continue
      // (a turned line, a figure's rotated text, is measured by its box alone: no baseline, start or gap to read)
      const ls = all.filter((l) => !l.rot)
      const s = { lines: all.length, size: median(all.map((l) => l.size)), chars: sum(all, 'n'), bold: sum(all, 'bold'), italic: sum(all, 'italic') }
      if (o?.lines.length && ls.length) {
        const ol = [...o.lines].sort((a, b) => b.y - a.y)
        const dl = [...ls].sort((a, b) => b.y - a.y)
        const os = aOrig.get(key)?.size ?? (ol[0].size || o.size || s.size)
        s.osize = os
        // anchor: the unit's first line, where the original starts on this page; a section heading the side sets in fewer lines
        // than the original's (the part's heading, not its title nor its front matter, wholly on this page, its label not kept
        // as the original's ink on its first line) stands on the original's last lines (X.lastLines, the owner's ruling of
        // 2026-10-19): its last line's baseline against the original's last
        const onLast =
          o.first && o.last && o.kind === 'heading' && !o.top && ls.length < o.lines.length && (!o.label?.name || labelOf(ls, o.label) !== 'kept')
        if (onLast) {
          const db = dl.at(-1).y - ol.at(-1).y
          s.anchor = { baseline: r2(db), top: null, off: Math.abs(db), at: ol.at(-1).y, last: true }
          if (Math.abs(db) > BOUNDS.anchor * os) fault(side, 'anchor', `${name}: last line ${r2(db)} pt from the original's last baseline (size ${r2(os)})`)
        } else if (o.first) {
          const db = dl[0].y - ol[0].y
          const dt = dl[0].y + 0.8 * dl[0].size - (ol[0].y + 0.8 * os)
          s.anchor = { baseline: r2(db), top: r2(dt), off: Math.min(Math.abs(db), Math.abs(dt)), at: ol[0].y }
          if (Math.abs(db) > BOUNDS.anchor * os && Math.abs(dt) > BOUNDS.anchor * os)
            fault(side, 'anchor', `${name}: first line ${r2(db)} pt from the original's baseline, ${r2(dt)} from its top (size ${r2(os)})`)
        }
        // alignment, by TeX's statement
        const tol = Math.max(BOUNDS.alignMin, BOUNDS.align * os)
        // (a line that opens with a CJK opening mark starts its advance half an em before its ink)
        const opens = (l) => OPENING.test(l.text.trimStart()[0] ?? '')
        const startOff = (l, at) => Math.max(0, Math.abs(l.x0 - at) - (opens(l) ? 0.5 * l.size : 0))
        let off = null,
          how = null
        if (o.align === 'c') {
          // (TeX centres a first line with its label, which a side draws anew or keeps at its place)
          const mid = median(ol.map((l) => (l.x0 + l.x1) / 2))
          const lb = o.first ? ol[0].label : undefined
          off = Math.max(
            ...dl.map((l, j) => {
              const own = Math.abs((l.x0 + l.x1) / 2 - mid)
              if (j > 0 || lb === undefined) return own
              const whole = (lb + ol[0].x1) / 2
              return Math.min(own, Math.abs((l.x0 + l.x1) / 2 - whole), Math.abs((Math.min(lb, l.x0) + l.x1) / 2 - whole))
            }),
          )
          how = 'centred: a line\'s midpoint'
        } else if (o.align === 'r') {
          const end = median(ol.map((l) => l.x1))
          off = Math.max(...dl.map((l) => Math.abs(l.x1 - end)))
          how = "right: a line's end"
        } else if (o.align === 'l' || o.align === 'j') {
          // (a follower's first line starts after its head, whose translation is another width: the gap measures it; every
          // other line starts where one of the original's lines (but an indented first) starts: its column's margin, a margin
          // beside a float, the margin after a display)
          const first =
            o.first && !followers.has(key)
              ? Math.min(startOff(dl[0], ol[0].x0), ol[0].label !== undefined ? startOff(dl[0], ol[0].label) : Number.POSITIVE_INFINITY)
              : 0
          const starts = (ol.length > 1 && o.first ? ol.slice(1) : ol).map((l) => l.x0)
          const rest = dl.slice(o.first ? 1 : 0).map((l) => Math.min(...starts.map((x) => startOff(l, x))))
          off = Math.max(first, ...rest)
          how = `${o.align === 'l' ? 'left' : 'justified'}: a line's start`
        }
        if (off !== null) {
          s.align = { off, how }
          if (off > tol) fault(side, 'align', `${name} ${how} ${r2(off)} pt from the original's`)
        }
        s.olines = o.lines.length
      }
      // the spacing: each line's overshoot past the bounds
      const over = ls.map((l) => Math.max(0, l.word - BOUNDS.word) + Math.max(0, l.letter - BOUNDS.letter))
      s.word = Math.max(0, ...ls.map((l) => l.word))
      s.letter = Math.max(0, ...ls.map((l) => l.letter))
      s.over = Math.max(0, ...over)
      if (s.over > 0) fault(side, 'stretch', `${name}: word space up to ${r2(s.word)} em, letter gap up to ${r2(s.letter)} em`)
      u.sides[side] = s
    }
    const t = u.sides.today,
      v = u.sides.v2
    if (t && v) {
      const os = v.osize ?? t.osize ?? o?.size ?? t.size
      const eps = Math.max(NEAR.positionMin, NEAR.position * (os || 10))
      const said = (a) => (a.last ? `last line's baseline ${a.baseline} off the original's last` : `baseline ${a.baseline}, top ${a.top}`)
      if (t.anchor && v.anchor)
        judge('anchor', name, "first line off the original's (baseline or top, the nearer); a section heading set in fewer lines, its last line off the original's last", t.anchor.at, { value: said(t.anchor), d: t.anchor.off }, { value: said(v.anchor), d: v.anchor.off }, eps)
      if (t.align && v.align)
        judge('align', name, `${v.align.how} off the original's`, { c: 'centred', l: 'left', j: 'justified', r: 'right' }[o?.align] ?? null, { value: null, d: t.align.off }, { value: null, d: v.align.off }, eps)
      if (os) {
        t.share = t.size / os
        v.share = v.size / os
        if (!tieOf.has(key)) judge('size', name, 'size off the original\'s (share of it)', r2(os), { value: r2(t.size), d: Math.abs(1 - t.share) }, { value: r2(v.size), d: Math.abs(1 - v.share) }, NEAR.size)
      }
      if (t.olines !== undefined && v.olines !== undefined)
        judge('line-count', name, 'lines off the original\'s count on the page', t.olines, { value: t.lines, d: Math.abs(t.lines - t.olines) }, { value: v.lines, d: Math.abs(v.lines - v.olines) }, 0.5)
      // style: against the original's, its share of characters set in a bold and in a slanted face on arXiv's page (the part's
      // font state where no glyph of arXiv's is read)
      const ao = aOrig.get(key)
      if (ao || o?.style)
        for (const [st, on] of [
          ['bold', ao ? ao.bold : o.style.bold ? 1 : 0],
          ['italic', ao ? ao.italic : o.style.slant ? 1 : 0],
        ]) {
          const a = t.chars ? t[st] / t.chars : 0,
            b = v.chars ? v[st] / v.chars : 0
          if (Math.abs(t[st] - v[st]) < NEAR.styleMin) continue
          judge('style', name, `${st} share of its characters off the original's`, r2(on), { value: r2(a), d: Math.abs(a - on) }, { value: r2(b), d: Math.abs(b - on) }, NEAR.style)
        }
      if (t.over > 0 || v.over > 0) judge('stretch', name, 'overshoot past 1 em a word space, 0.25 em a letter gap (ems)', 0, { value: `word ${r2(t.word)}, letter ${r2(t.letter)}`, d: t.over }, { value: `word ${r2(v.word)}, letter ${r2(v.letter)}`, d: v.over }, NEAR.stretch)
    }
    units.push(u)
  }

  // ------------------------------------------------ size of a tie: one paragraph, its smallest member's share of the original's
  // size on each side (today's members laid one by one, its smallest over the same members): a tie member under today's
  // smallest is worse, the tie's members at today's smallest equal
  for (const keys of ties) {
    const side = (k) => keys.map((key) => units.find((u) => u.key === key)?.sides[k]?.share).filter(Number.isFinite)
    const t = side('today'),
      v = side('v2')
    if (t.length !== keys.length || v.length !== keys.length) continue
    const st = Math.min(...t),
      sv = Math.min(...v)
    judge('size', `tie ${keys.join(', ')}`, "a tie (one paragraph) at its smallest member's size, off the original's (share of it)", 1, { value: r2(st), d: Math.abs(1 - st) }, { value: r2(sv), d: Math.abs(1 - sv) }, NEAR.size)
  }

  // ------------------------------------------------ gap: each run-in pair, on each side
  for (const { hk, h, hl, fk, f, fl, sz, sep } of runIns) {
    const g = {}
    for (const [side, M] of [['today', T], ['v2', V]]) {
      const flat = (k) => M.get(k)?.filter((l) => !l.rot)
      // (a head v2 lays with no line of its own stands in its follower's first line, a bound name set as its lead: the two are
      // one drawn line there, no separation between units to read)
      if (side === 'v2' && !flat(hk)?.length && stateOf.get(h.part) === 'laid') continue
      const fd = flat(fk)?.length ? [...flat(fk)].sort((a, b) => b.y - a.y)[0] : { y: fl.y, x0: fl.x0 }
      const hd = flat(hk)?.length ? flat(hk).find((l) => Math.abs(l.y - fd.y) <= 0.5) : Math.abs(hl.y - fd.y) <= 0.5 ? hl : null
      if (!hd || (!flat(fk)?.length && !flat(hk)?.length)) continue
      g[side] = fd.x0 - hd.x1
      const u = units.find((x) => x.key === fk)
      if (u?.sides[side]) u.sides[side].gap = { original: r2(sep), drawn: r2(g[side]) }
      if (g[side] - sep > BOUNDS.gap * sz) fault(side, 'gap', `${fk} ${f.kind} after ${hk} ${h.kind}: starts ${r2(g[side])} pt after its head's end, the original ${r2(sep)}`)
    }
    if (g.today !== undefined && g.v2 !== undefined)
      judge('gap', `${fk} ${f.kind} after ${hk} ${h.kind}`, "the follower's start after its head's end, off the original's separation", sep, { value: r2(g.today), d: Math.abs(g.today - sep) }, { value: r2(g.v2), d: Math.abs(g.v2 - sep) }, Math.max(NEAR.positionMin, NEAR.position * sz))
  }

  // ------------------------------------------------ cross: each side's lines over rules and other units' boxes
  const rules = rec.px?.rules ?? []
  const events = { today: new Map(), v2: new Map() }
  for (const [side, M, laidKeys] of [
    ['today', T, new Set(T.keys())],
    ['v2', V, new Set([...laidV2.keys()].map(keyOfPart))],
  ]) {
    const boxes = []
    for (const [key, ls] of M) for (const l of ls) boxes.push({ key, ...band(l), drawn: true })
    for (const [key, o] of orig) if (!laidKeys.has(key)) for (const l of o.lines) boxes.push({ key, ...band(l), drawn: false })
    for (const [key, ls] of M) {
      const o = orig.get(key)
      const own = (o?.lines ?? []).map(band)
      const said = new Set()
      for (const l of ls) {
        if (l.rot) continue
        const b = band(l)
        for (const r of rules) {
          const x = (r[0] + r[2]) / 2
          if (x <= b.x0 + 0.5 || x >= b.x1 - 0.5 || Math.min(r[3], b.y1) - Math.max(r[1], b.y0) < 0.5 * l.size) continue
          // (a rule the original's own lines cross is no fault of the translation)
          if (own.some((q) => x > q.x0 + 0.5 && x < q.x1 - 0.5 && Math.min(r[3], q.y1) - Math.max(r[1], q.y0) > 0)) continue
          said.add(`a line at ${r2(l.y)} (${r2(l.x0)}–${r2(l.x1)}) across the rule at x ${r2(x)}`)
        }
        for (const q of boxes) {
          if (q.key === key) continue
          const ox = Math.min(b.x1, q.x1) - Math.max(b.x0, q.x0),
            oy = Math.min(b.y1, q.y1) - Math.max(b.y0, q.y0)
          if (ox <= BOUNDS.cross || oy <= BOUNDS.cross) continue
          // (two units whose original lines already overlap on A: not the translation's)
          const oq = (orig.get(q.key)?.lines ?? []).map(band)
          if (own.some((a) => oq.some((c) => Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0) > BOUNDS.cross && Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0) > BOUNDS.cross))) continue
          said.add(`a line at ${r2(l.y)} over ${q.key}'s ${q.drawn ? 'drawn line' : 'original ink'} (${r2(ox)} × ${r2(oy)} pt)`)
        }
      }
      if (said.size) {
        events[side].set(key, [...said])
        for (const w of said) fault(side, 'cross', `${key} ${o?.kind ?? ''}: ${w}`)
      }
    }
  }
  for (const key of new Set([...events.today.keys(), ...events.v2.keys()])) {
    const a = events.today.get(key) ?? [],
      b = events.v2.get(key) ?? []
    if (a.length === b.length) continue
    const kind = orig.get(key)?.kind ?? ''
    diff('cross', `${key} ${kind}`.trim(), 'lines across a rule or over another unit (the original: none)', 0, { value: a[0] ?? null, off: a.length }, { value: b[0] ?? null, off: b.length }, b.length > a.length, b.length < a.length ? 'v2' : 'today')
  }

  // ------------------------------------------------ turn, shown, figures: what v2 draws otherwise or not at all
  for (const [ord] of laidV2) {
    if (!turned.has(ord)) continue
    const ls = V.get(keyOfPart(ord)) ?? []
    if (ls.length && !ls.some((l) => l.rot)) {
      const w = `${keyOfPart(ord)} ${facts.get(ord)?.kind ?? ''}`.trim()
      fault('v2', 'turn', `${w}: turned on A, drawn upright ("${ls[0].text.slice(0, 20)}")`)
      diff('turn', w, 'turned on the original, drawn upright', 'turned', { value: 'turned or the original\'s', off: 0 }, { value: `upright "${ls[0].text.slice(0, 20)}"`, off: 1 }, true, 'today')
    }
  }
  let gained = 0
  // (every unit today draws that v2 does not: where v2's part has its member, that member's state; where no member of v2's part
  // is joined to it (prepare or the join lost it), that is said: a translation missing all the same)
  for (const key of T.keys()) {
    if (V.has(key)) continue
    const o = orig.get(key)
    const why = o?.part !== null && o?.part !== undefined ? (stateOf.get(o.part) ?? 'no member on the page') : "no member of v2's part joined to it"
    diff('shown', `${key} ${o?.kind ?? ''}`.trim(), 'translated by today, left the original\'s by v2', null, { value: 'translated', off: null }, { value: why, off: null }, true, 'today')
  }
  for (const key of V.keys()) if (key.startsWith('t') && !T.has(key)) gained++
  // (a label TeX set with a name word on a unit's first line, "Proposition 1 (": today's drawn in the target, v2's not, is a
  // translation missing within a unit both translate, counted per unit; v2's relabelled where today's is not is no fault)
  // (and each label as each side drew it, for the paper's pass: the owner's ruling 4, the target word everywhere, one form in a
  // paper; v2 relabelling a label today keeps is nearer)
  out.labels = []
  for (const [key, o] of orig) {
    const name = o.label?.name
    if (!o.first || !name?.[1] || name[1][0] !== n || (!T.has(key) && !V.has(key))) continue
    const t = T.has(key) ? labelOf(T.get(key), o.label) : null,
      v = V.has(key) ? labelOf(V.get(key), o.label) : null
    out.labels.push({ unit: `${key} ${o.kind ?? ''}`.trim(), name: name[0], today: t, v2: v })
    if (!T.has(key) || !V.has(key)) continue
    if (t === 'translated' && v !== null && v !== 'translated')
      diff('shown', `${key} ${o.kind ?? ''}`.trim(), `its label ("${name[0]}") drawn in the target by today, ${v === 'kept' ? "kept as the original's ink" : "drawn in the original's words"} by v2`, name[0], { value: 'translated', off: null }, { value: 'label', off: null }, true, 'today')
    if (v === 'translated' && t !== null && t !== 'translated')
      diff('labels', `${key} ${o.kind ?? ''}`.trim(), "its label drawn in the target by v2, kept by today (the owner's ruling 4: the target word everywhere)", name[0], { value: t, off: 1 }, { value: v, off: 0 }, false, 'v2')
  }
  // (the figure texts each side drew: today's groups of their own (g[data-f]), v2's groups of the part's figure members
  // (g[data-axt-ord]), each with a drawn character; the members v2's Page lays kept beside, for diagnosis)
  const figOrds = new Set([...facts.values()].filter((m) => /figure/.test(m.kind ?? '')).map((m) => m.ord))
  const figT = (rec.today.figures ?? []).filter((u) => u.lines.some((l) => l.n > 0)).length
  const figV = rec.v2.units.filter((u) => figOrds.has(u.id) && u.lines.some((l) => l.n > 0)).length
  const figLaid = [...laidV2.keys()].filter((o) => figOrds.has(o)).length
  if (figV < figT) diff('figures', null, 'figure texts drawn translated', null, { value: figT, off: null }, { value: figV, off: null }, true, 'today')

  // ------------------------------------------------ against arXiv's page and the original's facts (fidelity.mjs), and the
  // owner's rulings of 2026-11-08
  const fc = {
    n,
    pair,
    rec,
    v2,
    facts,
    laidV2,
    T,
    V,
    orig,
    keyOfPart,
    todayOf,
    prepByOrd,
    frame: frame ?? null,
    groups: groups ?? [],
    keptByGroup: keptByGroup ?? new Set(),
    folios: new Set([...(folios ?? [])].filter((o) => facts.has(o))),
    figurePairs: figureGroupsOf(rec.today.figures ?? [], [...prepByOrd.values()], [...facts.values()], n),
    judge,
    diff,
    fault,
    inkOf,
    band,
    NEAR,
  }
  const { borrowed } = measureFidelity(fc)
  judgeJoined(fc, fc.figurePairs, new Map((rec.today.figures ?? []).map((u) => [u.id, u])), 'a figure text')
  judgeJoined(fc, joinedOf(rec.today.names ?? [], V, facts, keyOfPart, /^name$/, band), new Map((rec.today.names ?? []).map((u) => [u.id, u])), 'a name')
  // (no ruling stands between v2's line budget and today's: the no-borrowing ruling of 2026-11-08 that made v2's size, line
  // count and their knock-ons on a unit today laid with a borrowed line the ruling's was replaced the same day by borrowing
  // bounded by TeX's facts, which `block` judges; size and line count are judged against today again, but where today's
  // budget was bought past TeX's room, below)

  // ------------------------------------------------ page measures: links, the highlight, darkness, pixels
  const px = rec.px ?? {}
  // (the links a reader can follow: the anchors each side drew; a page today shows as arXiv's is its own page view with the
  // original's link annotations (layer-side.mjs shownOriginal), as v2's original page view is, whose anchors v2page counts.
  // Each side's links as its layout gave them kept beside, for diagnosis)
  const L = { original: rec.original?.links ?? 0, today: rec.today.shownOriginal ? (rec.original?.links ?? 0) : (rec.today.linksDrawn ?? 0), v2: rec.v2.linksDrawn ?? 0 }
  judge('links', null, "links missing against the original's annotations", L.original, { value: L.today, d: Math.max(0, L.original - L.today) }, { value: L.v2, d: Math.max(0, L.original - L.v2) }, 0.5)
  // (their borders, as each side draws them: the anchors drawn with one against the original's annotations PDF.js draws one round
  // (a border width above 0 and a colour), a page today shows as arXiv's the original's; a drawing of before they were read
  // judges none)
  const B =
    rec.original?.bordered === undefined || rec.v2.bordersDrawn === undefined || (!rec.today.shownOriginal && rec.today.bordersDrawn === undefined)
      ? null
      : { original: rec.original.bordered, today: rec.today.shownOriginal ? rec.original.bordered : rec.today.bordersDrawn, v2: rec.v2.bordersDrawn }
  if (B) judge('borders', null, "link borders missing against the original's bordered annotations", B.original, { value: B.today, d: Math.max(0, B.original - B.today) }, { value: B.v2, d: Math.max(0, B.original - B.v2) }, 0.5)
  // (the highlight is a feature of today's for the units today highlights: there each side's sentence boxes are judged by the
  // lines they leave uncovered, its drawn lines on the right and its original's lines on arXiv's page on the left, and v2 is
  // worse where it leaves more of them than today does (today's own misses are not held against v2), nearer where fewer.
  // Elsewhere v2 is judged only on not drawing a wrong one: on a unit today draws without boxes (a figure text both translate
  // among them, matched by its original's box), none is equal, boxes that cover it better; on a unit only v2 translates, none
  // or covering boxes pass. Boxes that do not cover it are v2's fault and worse. Covering, everywhere: a line's box within the
  // boxes' union, every edge within a point)
  const litT = new Set(rec.today.lit.map((id) => `t${id}`))
  const figBoth = figuresMatched(rec.today.figures ?? [], [...prepByOrd.values()], [...facts.values()], n)
  const ordOfKey = new Map(rec.v2.units.map((u) => [keyOfPart(u.id), u.id]))
  // (the highlight as the reader sees it: a drawn line by its ink (a CJK opening mark's blank first half, a closing mark's blank
  // second half, no ink), each side's boxes as its reader paints them: today's as its shapes paint them (today/entry.mjs
  // litBoxes), v2's Laid.lit and its kept ink's boxes padded as the reader's highlight.ts paints them, PAINT_PAD beside and
  // half the page's leading above and below (halfLeading: half the lower quartile of the gaps between a member's rows))
  const leadOf = (side) => {
    const gaps = []
    for (const m of v2.pages[n]?.members ?? [])
      for (const rows of m.lit?.[side] ?? []) {
        const ys = [...rows].sort((a, b) => b[3] - a[3])
        for (let i = 1; i < ys.length; i++) {
          const g = ys[i - 1][1] - ys[i][3]
          if (g >= 0 && g < 2 * (ys[i][3] - ys[i][1])) gaps.push(g)
        }
      }
    gaps.sort((a, b) => a - b)
    return gaps.length ? gaps[Math.floor((gaps.length - 1) / 4)] / 2 : 0
  }
  const halfLead = { right: leadOf('right'), left: leadOf('left') }
  /** v2's boxes of a member on a side as its reader paints them (its sentences' and its kept ink's) */
  // (a turned member's boxes are in its run's frame, Laid.lit's dir: first the page's box each stands in, then the paint)
  const paintedV2 = (lit, side) =>
    [...(lit?.[side] ?? []).flat(), ...(lit?.own ?? []).flatMap(([, b]) => b)]
      .map((b) => (lit?.dir ? pageBoxOf(b, lit.dir) : b))
      .map((b) => [b[0] - PAINT_PAD, b[1] - halfLead[side], b[2] + PAINT_PAD, b[3] + halfLead[side]])
  /** the original's lines of part member `ord` on this page, as boxes (the part's line boxes on A) */
  const origBoxes = (ord) => (facts.get(ord)?.lines ?? []).filter((l) => l[0] === n).map((l) => ({ x0: l[2], y0: Math.min(l[5], l[6]), x1: l[3], y1: Math.max(l[5], l[6]) }))
  /** how many of a unit's drawn lines (`ls`) and original lines (`left`) a side's boxes (`rb` right, `lb` left) leave uncovered */
  const missOf = (ls, left, rb, lb) => ({ r: ls.map(inkOf).map(band).filter((b) => !covered(b, rb)).length, of: ls.length, l: left.filter((b) => !covered(b, lb)).length, ofL: left.length })
  const says = (m) => `${m.r} of ${m.of} drawn, ${m.l} of ${m.ofL} original lines not covered`
  const todays = [...T.keys()].filter((k) => V.has(k) && litT.has(k))
  const hl = { todays: todays.length, todayMissed: 0, v2Missed: 0, unlit: 0, figures: 0, alone: 0, wrong: 0, better: 0 }
  for (const key of todays) {
    const ord = ordOfKey.get(key)
    const name = `${key} ${facts.get(ord)?.kind ?? orig.get(key)?.kind ?? ''}`.trim()
    const left = origBoxes(ord)
    const tb = rec.today.litBoxes[key.slice(1)] ?? { right: [], left: [] }
    const vb = laidV2.get(ord)?.lit
    const t = missOf(T.get(key), left, tb.right, tb.left),
      v = missOf(V.get(key), left, paintedV2(vb, 'right'), paintedV2(vb, 'left'))
    const dt = t.r + t.l,
      dv = v.r + v.l
    if (dt) {
      hl.todayMissed++
      fault('today', 'highlight', `${name}: ${says(t)}`)
    }
    if (dv) {
      hl.v2Missed++
      fault('v2', 'highlight', `${name}: ${says(v)}`)
    }
    if (dv !== dt)
      diff('highlight', name, "lines its sentence boxes leave uncovered: its drawn lines (right), its original's (left)", 0, { value: says(t), off: dt }, { value: says(v), off: dv }, dv > dt, dv < dt ? 'v2' : 'today')
  }
  for (const [key, ls] of V) {
    const ord = ordOfKey.get(key)
    const fig = figBoth.get(ord)
    if (T.has(key) ? litT.has(key) : fig !== undefined && litT.has(`t${fig}`)) continue
    const both = T.has(key) || fig !== undefined
    if (T.has(key)) hl.unlit++
    else if (both) hl.figures++
    else hl.alone++
    const lit = laidV2.get(ord)?.lit
    const rb = paintedV2(lit, 'right'),
      lb = paintedV2(lit, 'left')
    if (!rb.length && !lb.length) continue
    const m = missOf(ls, origBoxes(ord), rb, lb)
    const name = `${key} ${facts.get(ord)?.kind ?? orig.get(key)?.kind ?? ''}`.trim()
    if (!m.r && !m.l) {
      if (both) {
        hl.better++
        diff('highlight', name, "sentence boxes over its drawn lines (right) and its original's (left) where today draws none", 'covered', { value: 'none', off: 1 }, { value: 'covered', off: 0 }, false, 'v2')
      }
      continue
    }
    hl.wrong++
    fault('v2', 'highlight', `${name}: ${m.r} of ${m.of} drawn lines, ${m.l} of ${m.ofL} original lines outside its sentence boxes`)
    diff('highlight', name, "sentence boxes that miss its drawn lines (right) or its original's (left)", 'covered', { value: both ? 'none' : 'not translated', off: null }, { value: says(m), off: null }, true, 'today')
  }
  // (the highlight's granularity, apart from its coverage: a unit today pairs sentence by sentence paired so by v2, judged on
  // its boxes per sentence, sentences.mjs)
  const paired = sentencesPaired(todays, (key) => rec.today.litBoxes[key.slice(1)], (key) => laidV2.get(ordOfKey.get(key))?.lit)
  for (const u of paired.units) {
    if (!u.worse) continue
    const name = `${u.key} ${facts.get(ordOfKey.get(u.key))?.kind ?? orig.get(u.key)?.kind ?? ''}`.trim()
    fault('v2', 'highlight', `${name}: ${u.says}`)
    diff('highlight', name, 'its sentences paired one by one on both panes (today: by sentence)', u.sentences, { value: `${u.sentences} sentences`, off: 0 }, { value: u.says, off: null }, true, 'today')
  }
  const dk = px.darkness
  const ref = dk?.originalText?.mean ?? dk?.original?.mean ?? null
  if (T.size && V.size && ref && dk?.today?.mean && dk?.v2?.mean && dk.today.pixels >= NEAR.weightPixels && dk.v2.pixels >= NEAR.weightPixels)
    judge('weight', null, "the translated text's darkness off the original text's", ref, { value: dk.today.mean, d: Math.abs(dk.today.mean - ref) }, { value: dk.v2.mean, d: Math.abs(dk.v2.mean - ref) }, NEAR.weight * ref, (x) => (x === null ? x : Math.round(x * 10000) / 10000))
  if (px.diff) {
    judge('pixels', null, "device pixels off arXiv's page outside the units' boxes", 0, { value: px.diff.outsideToday, d: px.diff.outsideToday ?? 0 }, { value: px.diff.outside, d: px.diff.outside }, NEAR.pixels)
    if (px.diff.outside > BOUNDS.pixels) fault('v2', 'pixels', `${px.diff.outside} device pixels off arXiv's page outside the units' boxes`)
    if ((px.diff.outsideToday ?? 0) > BOUNDS.pixels) fault('today', 'pixels', `${px.diff.outsideToday} device pixels off arXiv's page outside the units' boxes`)
  }
  out.measures = {
    links: { ...L, todayLaid: rec.today.links, v2Laid: rec.v2.links },
    borders: B,
    highlight: { today: rec.today.lit.length, v2: rec.v2.lit.length, ...hl },
    sentences: { today: paired.today, paired: paired.paired, whole: paired.whole, apart: paired.apart, unread: paired.unread },
    darkness: dk ?? null,
    diff: px.diff ?? null,
    rules: rules.length,
    laid: { today: T.size, v2: V.size, gained },
    figures: { today: figT, v2: figV, v2Laid: figLaid },
  }
  for (const f of FLAGS) {
    const a = faults.today[f] ?? [],
      b = faults.v2[f] ?? []
    if (a.length || b.length) out.faults[f] = { today: a.length, v2: b.length, todaySays: a.slice(0, 6), v2Says: b.slice(0, 6) }
  }
  // (the units each side laid with a line past TeX's room on this page, `block`'s faults: a size or a line count today bought
  // so is today's fault, here and on the unit's other pages, the paper's pass)
  const pastOf = (side) => [...borrowed[side]].filter(([, k]) => k > 0).map(([key]) => key)
  out.pastRoom = { today: pastOf('today'), v2: pastOf('v2') }
  budgetPastRoom(out, new Set(out.pastRoom.today), new Set(out.pastRoom.v2))
  recount(out)
  out.units = units
  return out
}

/**
 * A size or a line count today bought with a line past TeX's room (its text block bottom, or the next ink nearer than the
 * paragraph separation: a `block` fault of today's on the unit, or on a member of its size tie, `today` keys) is today's
 * fault, and v2 keeping the room nearer, never worse, where v2 itself breaks it nowhere (`v2` keys): the coordinator's call
 * of 2026-11-09 under the owner's ruling, today's last line on the page number (2608.16117v1 p23 t86). Over a page's
 * differences, its faults updated; the caller recounts
 */
function budgetPastRoom(p, today, v2) {
  for (const d of p.diffs) {
    if (!d.worse || (d.flag !== 'size' && d.flag !== 'line-count') || !d.unit) continue
    const keys = d.unit.startsWith('tie ') ? d.unit.slice(4).split(', ') : [d.unit.split(' ')[0]]
    if (!keys.some((k) => today.has(k)) || keys.some((k) => v2.has(k))) continue
    d.worse = false
    d.nearer = 'v2'
    d.why = "today's bought with a line past TeX's room (block): today's fault"
    const f = (p.faults[d.flag] ??= { today: 0, v2: 0, todaySays: [], v2Says: [] })
    f.today++
    if (f.todaySays.length < 6) f.todaySays.push(`${d.unit}: its ${d.flag === 'size' ? 'size' : 'line count'} bought with a line past TeX's room`)
  }
}
/** the paper's pass of budgetPastRoom: a unit's size and line count today bought past TeX's room on any of its pages is
 *  today's fault on each (its size is the unit's one; a line borrowed on one page moves its lines on the next) */
export function pastRoomPass(pages, recount) {
  const today = new Set(pages.flatMap((p) => p.pastRoom?.today ?? []))
  const v2 = new Set(pages.flatMap((p) => p.pastRoom?.v2 ?? []))
  for (const p of pages) {
    budgetPastRoom(p, today, v2)
    recount(p)
  }
}

/** a page's differences ordered, its worse ones counted and its score (each measure's worse differences, 8 at most, times its
 *  weight): again after the paper's pass adds its own */
export function recount(out) {
  out.diffs.sort((x, y) => Number(y.worse) - Number(x.worse) || FLAGS.indexOf(x.flag) - FLAGS.indexOf(y.flag))
  out.worse = out.diffs.filter((d) => d.worse).length
  const by = new Map()
  for (const d of out.diffs) if (d.worse) by.set(d.flag, (by.get(d.flag) ?? 0) + 1)
  out.score = [...by].reduce((s, [f, k]) => s + WEIGHT[f] * Math.min(k, 8), 0)
}

/** a run set smaller and raised or lowered off its line's baseline (a footnote mark, a superscript: the typesetter's rise)
 *  is part of the nearest line it stands within 0.6 of that line's size of, not a line of its own */
function raised(lines) {
  const keep = []
  for (const l of [...lines].sort((a, b) => b.size - a.size || b.n - a.n)) {
    const host = keep.find((h) => !h.rot && !l.rot && l.size < 0.85 * h.size && Math.abs(l.y - h.y) < 0.6 * h.size)
    if (!host) {
      keep.push({ ...l })
      continue
    }
    host.x0 = Math.min(host.x0, l.x0)
    host.x1 = Math.max(host.x1, l.x1)
    for (const k of ['n', 'bold', 'italic']) host[k] += l[k]
    host.word = Math.max(host.word, l.word)
    host.letter = Math.max(host.letter, l.letter)
  }
  return keep.sort((a, b) => b.y - a.y)
}

/**
 * A unit's label on its first line as a side drew it (its lines; the part's label: its name word and box, its number), read
 * from the drawn text. TeX's label is a name word and a number (Placed.label name, num); a side that draws it anew draws a
 * word, the target's or the original's, and that number at the line's opening, wherever the line stands (a centred head
 * relabelled starts where its width puts it, past the name's end as often as not). So: 'kept' where the line opens with a
 * crop's stand-in (the original's ink stands there) or does not open with a word and the label's number (the original's ink
 * stands for the label, the line holds the unit's text alone); else drawn anew, 'original' where the line opens with the name word,
 * 'translated' where it does not. A label that states no number (a word alone) is read by its place, no text telling it
 * from the unit's own: kept where the line's ink starts at the name's end or after it. null where nothing is drawn
 */
function labelOf(lines, label) {
  const l = lines.filter((x) => !x.rot && x.n > 0).sort((a, b) => b.y - a.y)[0]
  if (!l) return null
  const text = l.text.trimStart()
  const name = label.name
  if (text.startsWith(OBJ)) return 'kept'
  // (the number as drawn: the part's, the punctuation TeX set about it aside (a caption's "Fig. 4." states ".4"))
  const num = (label.num?.[0] ?? '').replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '')
  if (num) {
    const esc = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (!new RegExp(`^[^\\s\\p{N}\\p{P}]+[\\s\\p{P}]*${esc}(?![\\p{L}\\p{N}])`, 'u').test(text)) return 'kept'
  } else if (l.x0 >= name[1][3] - NEAR.positionMin) return 'kept'
  return text.startsWith(name[0]) ? 'original' : 'translated'
}

/** the box a list of boxes {x0, y0, x1, y1} spans, or null */
const spanOf = (bs) =>
  bs.length ? { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) } : null
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
/** each a of `as` paired with the b of `bs` its box overlaps most, where that a is also the one b's box overlaps most */
function mutualBest(as, bs) {
  const best = (x, ys) => {
    let at = -1,
      most = 0
    ys.forEach((y, i) => {
      const o = overlap(x.box, y.box)
      if (o > most) [at, most] = [i, o]
    })
    return at
  }
  const out = new Map()
  as.forEach((a, i) => {
    const j = best(a, bs)
    if (j >= 0 && best(bs[j], as) === i) out.set(a.id, bs[j].id)
  })
  return out
}

/**
 * The figure texts both sides translate on page n, v2's member ord → today's unit ord: today's own groups (g[data-f], drawn
 * where their original stands) joined to today's figure units (its prepare dump: the original's box) by the drawn box against
 * the original's, those units to v2's figure members by the original's box against the original's (the part's lines on A),
 * each a mutual best overlap
 */
function figuresMatched(groups, prep, facts, n) {
  const figure = (k) => /figure/.test(k ?? '')
  const g = groups.map((u) => ({ id: u.id, box: spanOf(u.lines.filter((l) => l.n > 0).map(band)) })).filter((x) => x.box)
  const t = prep
    .filter((u) => figure(u.kind))
    .map((u) => ({ id: u.ord, box: spanOf((u.lines ?? []).filter((l) => l.page === n).map((l) => ({ x0: l.x0, y0: Math.min(l.top, l.bottom), x1: l.x1, y1: Math.max(l.top, l.bottom) }))) }))
    .filter((x) => x.box)
  const v = facts
    .filter((m) => figure(m.kind))
    .map((m) => ({ id: m.ord, box: spanOf(m.lines.filter((l) => l[0] === n).map((l) => ({ x0: l[2], y0: Math.min(l[5], l[6]), x1: l[3], y1: Math.max(l[5], l[6]) }))) }))
    .filter((x) => x.box)
  const drawnByToday = new Set(mutualBest(g, t).values())
  const out = new Map()
  for (const [today, ord] of mutualBest(t.filter((x) => drawnByToday.has(x.id)), v)) out.set(ord, today)
  return out
}

/** the figure texts both sides translate on page n, v2's member ord → today's own group's id (figuresMatched's join, its group
 *  kept) */
function figureGroupsOf(groups, prep, facts, n) {
  const figure = (k) => /figure/.test(k ?? '')
  const g = groups.map((u) => ({ id: u.id, box: spanOf(u.lines.filter((l) => l.n > 0).map(band)) })).filter((x) => x.box)
  const t = prep
    .filter((u) => figure(u.kind))
    .map((u) => ({ id: u.ord, box: spanOf((u.lines ?? []).filter((l) => l.page === n).map((l) => ({ x0: l.x0, y0: Math.min(l.top, l.bottom), x1: l.x1, y1: Math.max(l.top, l.bottom) }))) }))
    .filter((x) => x.box)
  const v = facts
    .filter((m) => figure(m.kind))
    .map((m) => ({ id: m.ord, box: spanOf(m.lines.filter((l) => l[0] === n).map((l) => ({ x0: l[2], y0: Math.min(l[5], l[6]), x1: l[3], y1: Math.max(l[5], l[6]) }))) }))
    .filter((x) => x.box)
  const groupOf = new Map([...bestPairs(g, t)].map(([gid, tid]) => [tid, gid]))
  const out = new Map()
  for (const [tid, ord] of bestPairs(t.filter((x) => groupOf.has(x.id)), v)) out.set(ord, groupOf.get(tid))
  return out
}

/** whether a box {x0, y0, x1, y1} is covered by the union of boxes [x0, y0, x1, y1], each of its edges within `tol` points */
/** a box in a run's frame along `dir` [s0, t0, s1, t1] (Laid.lit's dir) as the page's box it stands in */
function pageBoxOf([s0, t0, s1, t1], [ux, uy]) {
  const pts = [s0, s1].flatMap((s) => [t0, t1].map((t) => [s * ux - t * uy, s * uy + t * ux]))
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]
}
function covered(b, boxes, tol = NEAR.positionMin) {
  const inset = (a, c) => (c - a > 2 * tol ? [a + tol, c - tol] : [(a + c) / 2, (a + c) / 2])
  const [x0, x1] = inset(b.x0, b.x1),
    [y0, y1] = inset(b.y0, b.y1)
  // (in each slab between the boxes' edges, the boxes across it must cover y0..y1 between them)
  const slab = (xm) => {
    let at = y0,
      got = false
    for (const [a, c] of boxes.filter((q) => q[0] <= xm && q[2] >= xm).map((q) => [q[1], q[3]]).sort((p, q) => p[0] - q[0])) {
      if (a > at) break
      if (c >= at) {
        got = true
        at = Math.max(at, c)
      }
    }
    return got && at >= y1
  }
  const xs = [...new Set([x0, x1, ...boxes.flatMap((q) => [q[0], q[2]]).filter((x) => x > x0 && x < x1)])].sort((p, q) => p - q)
  if (xs.length === 1) return slab(x0)
  for (let i = 0; i + 1 < xs.length; i++) if (!slab((xs[i] + xs[i + 1]) / 2)) return false
  return true
}

function band(l) {
  // (a turned line's band as a level line's, turned with it (measure-dom's `band`); a raw file before it, its box)
  if (l.rot && l.band) return { x0: l.band[0], y0: l.band[1], x1: l.band[2], y1: l.band[3] }
  if (l.rot) return { x0: l.x0, x1: l.x1, y0: l.y0, y1: l.y1 }
  return { x0: l.x0, x1: l.x1, y0: l.y - 0.2 * l.size, y1: l.y + 0.8 * l.size }
}
function median(a) {
  const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y)
  return s.length ? s[s.length >> 1] : null
}
function sum(a, k) {
  return a.reduce((n, x) => n + (x[k] ?? 0), 0)
}

// ---------------------------------------------------------------- the run: coverage and verdict
/**
 * Why a pair's raw file is not this run's drawing of the pages v2.mjs laid for it, or null: `run` the drawing's manifest
 * (render.mjs: <work>/raw/run.json), `raw` the pair's raw file (null where there is none), `v2` the digest of v2.mjs's file of
 * the pair as it stands now. A raw file of an earlier run, or one drawn from pages laid again since, is never measured: the
 * verdict is of the run's own drawing, nothing stale mixed in
 */
export function staleOf(run, pair, raw, v2) {
  const m = run.missing?.find((x) => x.pair === pair)
  if (m) return `not drawn (${m.why})`
  if (!raw) return 'no raw file of this run'
  if (raw.run !== run.id) return "its raw file is another run's"
  if (raw.v2 !== v2) return "v2's pages were laid again after it was drawn"
  return null
}

/**
 * What keeps the run from being judged whole, each a line (none: complete). The pairs the measure was `asked` (null: the
 * manifest's) must be the pairs the drawing was asked; the drawing finished; every asked pair drawn by this run (`notMeasured`:
 * pair → why, staleOf's); every page the drawing was to draw of it there (`drawn`: pair → its raw file); every page measured
 * without error; and at least one page
 */
export function coverageOf(run, { asked = null, notMeasured = new Map(), drawn = new Map(), pages = [] }) {
  if (!run) return ['no run manifest (<work>/raw/run.json): render.mjs has not drawn this work directory']
  const out = []
  const same = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])
  if (asked && !same(asked, run.pairs)) out.push(`the measure was asked ${asked.join(', ') || 'no pair'}, the drawing drew ${run.pairs.join(', ') || 'no pair'}`)
  if (!run.done) out.push(`the drawing did not finish${run.stopped ? `: ${run.stopped}` : ''}`)
  else if (run.stopped) out.push(`the drawing stopped: ${run.stopped}`)
  for (const pair of run.pairs) {
    const why = notMeasured.get(pair)
    if (why) {
      out.push(`${pair}: ${why}`)
      continue
    }
    const raw = drawn.get(pair)
    if (!raw) continue
    const got = new Set(raw.pages.map((p) => p.page))
    for (const n of raw.expected ?? []) if (!got.has(n)) out.push(`${pair} p${n}: not drawn`)
  }
  for (const p of pages) if (p.error) out.push(`${p.pair} p${p.page}: ${p.error}`)
  if (!pages.length) out.push('no page measured')
  return out
}

/** the gate: complete coverage (coverageOf none) and no page worse than today's */
export function verdictOf(incomplete, pages) {
  const worse = pages.filter((p) => p.worse).length
  return { pass: incomplete.length === 0 && worse === 0, worse, incomplete }
}

/** each measure's count of pages (worse, nearer, each side's faults) and the ten worst pages */
export function summaryOf(pages) {
  const summary = {}
  for (const f of FLAGS) {
    const worse = pages.filter((p) => p.diffs.some((d) => d.flag === f && d.worse))
    summary[f] = {
      says: SAYS[f],
      worsePages: worse.length,
      worseUnits: pages.reduce((n, p) => n + p.diffs.filter((d) => d.flag === f && d.worse).length, 0),
      nearerPages: pages.filter((p) => p.diffs.some((d) => d.flag === f && d.nearer === 'v2')).length,
      v2FaultPages: pages.filter((p) => p.faults[f]?.v2).length,
      todayFaultPages: pages.filter((p) => p.faults[f]?.today).length,
    }
  }
  const worst = [...pages]
    .filter((p) => p.worse)
    .sort((a, b) => b.score - a.score || a.pair.localeCompare(b.pair) || a.page - b.page)
    .slice(0, 10)
    .map((p) => ({
      pair: p.pair,
      page: p.page,
      score: r2(p.score),
      worse: Object.fromEntries(FLAGS.filter((f) => p.diffs.some((d) => d.flag === f && d.worse)).map((f) => [f, { units: p.diffs.filter((d) => d.flag === f && d.worse).length, first: p.diffs.find((d) => d.flag === f && d.worse) }])),
    }))
  return { summary, worst }
}
