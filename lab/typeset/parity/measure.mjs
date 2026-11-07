// lab/typeset/parity/measure.mjs --work=<dir> --out=<dir>: the display gate's verdict, "display ≥ today": no page of v2 worse
// than today's, a difference allowed only where v2 is nearer the original. Reads what render.mjs drew and read back
// (<work>/raw/<pair>.json), the entry's Pages and the part's facts (<work>/v2/<pair>.json), today's prepare dump
// (baseline/prepare/<paper>.prepare.json: the original's lines of today's units) and the part's turned members (the L1
// bundle). For every unit and page, each measure is taken as a distance from arXiv's page itself (the original's anchoring,
// alignment, separation, size, style, spacing, room, ink, links), for today's side and v2's; where the two distances differ
// by more than the measure's stated noise floor (NEAR), the difference is judged: v2 nearer the original passes, v2 farther
// fails the page. A unit today shows translated that v2 leaves English (or a figure text) is a translation missing, judged
// worse whatever its nearness. Each side's faults against the absolute bounds (BOUNDS) are measured too and shown beside: a
// fault both share is no verdict of this gate. Writes <out>/parity.json and <out>/index.html (the sheet: arXiv's page,
// today's and v2's side by side, the pages v2 makes worse first, each difference with the original's value, both sides'
// and which is nearer). Exits 1 where any page is worse than today's: a cut-over blocker (lab/release-check/CI.md).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { l1Paper } from '../../../packages/typeset/tests/replay/l1.ts'
import { LAB } from '../../../packages/typeset/tests/replay/tap.ts'
import { whyNot } from './inputs.mjs'
import { FIRST, PAIRS } from './pairs.mjs'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const WORK = arg('work')
const OUT = arg('out')
if (!WORK || !OUT) throw new Error('measure.mjs: --work=<dir> and --out=<dir> are required')
const PREPARE = join(LAB, 'refactor-2026-11', 'baseline', 'prepare')
const json = (f) => JSON.parse(readFileSync(f, 'utf8'))
const r2 = (v) => (v === null || v === undefined ? v : Math.round(v * 100) / 100)
/** the CJK opening marks, whose advance's blank half stands before their ink */
const OPENING = /[〈《「『【〔〖〘〚〝‘“（［｛｟]/

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
  /** a size: a share of the original's (two of the fit's steps of 0.025) */
  size: 0.05,
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
const WEIGHT = { shown: 3, weight: 3, anchor: 3, align: 3, cross: 3, gap: 3, turn: 3, stretch: 2, style: 2, pixels: 2, figures: 2, size: 1, links: 1, highlight: 1, 'line-count': 0.5 }
export const FLAGS = Object.keys(WEIGHT)
/** what each measure is, as a distance from the original */
const SAYS = {
  shown: "a unit today shows translated that v2 leaves the original's: a translation missing (no nearness judged)",
  weight: "the translated text's ink darkness (mean over its glyph pixels) against the original text's (its units' lines on arXiv's page)",
  anchor: "a unit's first line against the original's first line: the smaller of its baseline's and its em top's offsets",
  align: "TeX's alignment kept: a line's start (left, justified), midpoint (centred) or end (right) against the original's lines'",
  cross: "the original's room kept: a laid line across a vertical rule of arXiv's page or over another unit's box (none on the original)",
  gap: "a run-in follower's start against its head's end, against the original's separation",
  turn: "a unit TeX set turned (a figure's rotated text) drawn upright (the original's, and today's, turned)",
  stretch: 'the spacing kept: a line\'s word space past 1 em or letter gap past 0.25 em (the original\'s none), by how much',
  style: "a unit's share of bold and of slanted characters against the original's style (its TeX font state)",
  pixels: "the page outside every unit's box against arXiv's page: device pixels off it",
  figures: "the figure texts drawn translated: fewer than today's is a translation missing",
  size: "a unit's size against the original's",
  links: "the page's links against the original's link annotations: how many are missing",
  highlight: "the laid units with no sentence boxes for the highlight (the original's every unit has its sentences)",
  'line-count': "a unit's line count on the page against the original's",
}

// ---------------------------------------------------------------- reading
const pairs = PAIRS.filter((p) => existsSync(join(WORK, 'raw', `${p}.json`)))
const missing = existsSync(join(WORK, 'raw', 'missing.json')) ? json(join(WORK, 'raw', 'missing.json')) : []
for (const p of FIRST) if (!pairs.includes(p) && !missing.some((m) => m.pair === p)) missing.push({ pair: p, why: whyNot(p, WORK) ?? 'not drawn by this run' })

const pages = []
for (const pair of pairs) {
  const raw = json(join(WORK, 'raw', `${pair}.json`))
  const v2 = json(join(WORK, 'v2', `${pair}.json`))
  const prep = json(join(PREPARE, `${raw.paper}.prepare.json`))
  const prepByOrd = new Map(prep.units.map((u) => [u.ord, u]))
  // (part ord -> today's ord)
  const todayOf = new Map(Object.entries(v2.today).map(([o, t]) => [Number(o), t.today]))
  // (the part's members set turned on A (a figure's rotated text: Placed.dir), whose lines are no horizontal band)
  const turned = new Set()
  for (const part of l1Paper(raw.paper)?.parts.values() ?? [])
    for (const f of part.flows) for (const m of f) if (m.dir && (Math.abs(m.dir[1]) > 1e-3 || m.dir[0] < 0)) turned.add(m.ord)
  for (const rec of raw.pages) pages.push(measurePage(pair, v2, rec, { prepByOrd, todayOf, turned }))
}

// ---------------------------------------------------------------- one page
function measurePage(pair, v2, rec, { prepByOrd, todayOf, turned }) {
  const n = rec.page
  const out = { pair, page: n, worse: 0, diffs: [], faults: {}, measures: {}, units: [] }
  if (rec.error || !rec.today || !rec.v2) {
    out.error = rec.error ?? 'not drawn'
    return out
  }
  const facts = new Map((v2.facts[n]?.members ?? []).map((m) => [m.ord, m]))
  const laidV2 = new Map((v2.pages[n]?.members ?? []).filter((m) => m.state === 'laid').map((m) => [m.ord, m]))
  const stateOf = new Map((v2.pages[n]?.members ?? []).map((m) => [m.ord, m.state]))
  // (each side's drawn lines by its unit, keyed by today's ord where the unit has one, else the part's ord)
  const keyOfPart = (o) => (todayOf.has(o) ? `t${todayOf.get(o)}` : `p${o}`)
  // (a line's extent is its drawn characters' and its crops': a crop standing on the line (a formula's ink, drawn by the
  // canvas, not the SVG) extends it, at its start as at its end)
  const withCrops = (u, crops) =>
    raised(u.lines.filter((l) => l.n > 0)).map((l) => {
      if (l.rot) return l
      const on = crops.filter((c) => c[0] === u.id && c[2] < l.y + 0.8 * l.size && c[4] > l.y - 0.2 * l.size)
      return on.length ? { ...l, x0: Math.min(l.x0, ...on.map((c) => c[1])), x1: Math.max(l.x1, ...on.map((c) => c[3])) } : l
    })
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
      .map((l) => ({ x0: l[2], x1: l[3], y: l[4], size: l[10] ?? m.style.size, m0: l[7], m1: l[8] }))
    // (a label TeX set on the first line (a caption's "Table 4:", a numbered head's number), which a side either keeps as the
    // original's ink or draws anew with the translation: the first line may start at the text's start or at the label's)
    const lb = m.label?.ink
    if (lines.length && m.lines[0]?.[0] === n && lb?.[0] === n && Math.abs(lb[5] - lines[0].y) <= 0.5) lines[0] = { ...lines[0], label: lb[1] }
    orig.set(keyOfPart(m.ord), { kind: m.kind, align: m.align, style: m.style, lines, first: m.lines[0]?.[0] === n, part: m.ord, size: m.style.size })
  }
  for (const key of T.keys()) {
    if (orig.has(key)) continue
    const u = prepByOrd.get(Number(key.slice(1)))
    if (!u) continue
    const lines = (u.lines ?? []).filter((l) => l.page === n && !l.rot).map((l) => ({ x0: l.x0, x1: l.x1, y: l.baseline, size: l.size }))
    orig.set(key, { kind: u.kind, align: null, style: null, lines, first: u.lines?.[0]?.page === n, part: null, size: lines[0]?.size ?? null })
  }
  // (the pairs a line of the original sets one after the other: a head (a run-in heading, a name, a label of its own) and the
  // unit it leads, in one measure of TeX's (the part's m0..m1: one column); a table's cells and a figure's texts are set apart
  // by their columns, not by a separation of the text's)
  const APART = new Set(['cell', 'figure', 'inkfigures'])
  const onA = [...orig.entries()].filter(([, o]) => o.lines.length && o.part !== null && !APART.has(o.kind))
  const runIns = []
  for (const [hk, h] of onA) {
    const hl = [...h.lines].sort((a, b) => a.y - b.y)[0]
    for (const [fk, f] of onA) {
      if (fk === hk || !f.first) continue
      const fl = [...f.lines].sort((a, b) => b.y - a.y)[0]
      const sz = fl.size || f.size || 10
      const sep = fl.x0 - hl.x1
      if (Math.abs(fl.m0 - hl.m0) > 1 || Math.abs(fl.m1 - hl.m1) > 1 || Math.abs(fl.y - hl.y) > 0.5 || sep < -0.5 || sep > 3 * sz) continue
      runIns.push({ hk, h, hl, fk, f, fl, sz, sep })
    }
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
        const os = ol[0].size || o.size || s.size
        s.osize = os
        // anchor: the unit's first line, where the original starts on this page
        if (o.first) {
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
      if (t.anchor && v.anchor)
        judge('anchor', name, 'first line off the original\'s (baseline or top, the nearer)', t.anchor.at, { value: `baseline ${t.anchor.baseline}, top ${t.anchor.top}`, d: t.anchor.off }, { value: `baseline ${v.anchor.baseline}, top ${v.anchor.top}`, d: v.anchor.off }, eps)
      if (t.align && v.align)
        judge('align', name, `${v.align.how} off the original's`, { c: 'centred', l: 'left', j: 'justified', r: 'right' }[o?.align] ?? null, { value: null, d: t.align.off }, { value: null, d: v.align.off }, eps)
      if (os) {
        const dt = Math.abs(t.size - os) / os,
          dv = Math.abs(v.size - os) / os
        judge('size', name, 'size off the original\'s (share of it)', r2(os), { value: r2(t.size), d: dt }, { value: r2(v.size), d: dv }, NEAR.size)
      }
      if (t.olines !== undefined && v.olines !== undefined)
        judge('line-count', name, 'lines off the original\'s count on the page', t.olines, { value: t.lines, d: Math.abs(t.lines - t.olines) }, { value: v.lines, d: Math.abs(v.lines - v.olines) }, 0.5)
      // style: against the original's font state (bold: 1 where TeX set the unit bold; slanted likewise)
      if (o?.style)
        for (const [st, on] of [
          ['bold', o.style.bold ? 1 : 0],
          ['italic', o.style.slant ? 1 : 0],
        ]) {
          const a = t.chars ? t[st] / t.chars : 0,
            b = v.chars ? v[st] / v.chars : 0
          if (Math.abs(t[st] - v[st]) < NEAR.styleMin) continue
          judge('style', name, `${st} share of its characters off the original's`, on, { value: r2(a), d: Math.abs(a - on) }, { value: r2(b), d: Math.abs(b - on) }, NEAR.style)
        }
      if (t.over > 0 || v.over > 0) judge('stretch', name, 'overshoot past 1 em a word space, 0.25 em a letter gap (ems)', 0, { value: `word ${r2(t.word)}, letter ${r2(t.letter)}`, d: t.over }, { value: `word ${r2(v.word)}, letter ${r2(v.letter)}`, d: v.over }, NEAR.stretch)
    }
    units.push(u)
  }

  // ------------------------------------------------ gap: each run-in pair, on each side
  for (const { hk, h, hl, fk, f, fl, sz, sep } of runIns) {
    const g = {}
    for (const [side, M] of [['today', T], ['v2', V]]) {
      const flat = (k) => M.get(k)?.filter((l) => !l.rot)
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
  for (const key of T.keys()) {
    if (V.has(key)) continue
    const o = orig.get(key)
    if (o?.part === null || o?.part === undefined) continue
    diff('shown', `${key} ${o.kind}`, 'translated by today, left the original\'s by v2', null, { value: 'translated', off: null }, { value: stateOf.get(o.part) ?? 'no member on the page', off: null }, true, 'today')
  }
  for (const key of V.keys()) if (key.startsWith('t') && !T.has(key)) gained++
  const figT = (rec.today.figures ?? []).filter((u) => u.lines.some((l) => l.n > 0)).length
  const figV = [...laidV2.values()].filter((m) => /figure/.test(facts.get(m.ord)?.kind ?? '')).length
  if (figV < figT) diff('figures', null, 'figure texts drawn translated', null, { value: figT, off: null }, { value: figV, off: null }, true, 'today')

  // ------------------------------------------------ page measures: links, the highlight, darkness, pixels
  const px = rec.px ?? {}
  const L = { original: rec.original?.links ?? 0, today: rec.today.links, v2: rec.v2.links }
  judge('links', null, "links missing against the original's annotations", L.original, { value: L.today, d: Math.max(0, L.original - L.today) }, { value: L.v2, d: Math.max(0, L.original - L.v2) }, 0.5)
  const litT = rec.today.lit.filter((id) => T.has(`t${id}`)).length,
    litV = rec.v2.lit.filter((o) => V.has(keyOfPart(o))).length
  judge('highlight', null, 'laid units with no sentence boxes', 0, { value: `boxes on ${litT} of ${T.size}`, d: T.size - litT }, { value: `boxes on ${litV} of ${V.size}`, d: V.size - litV }, 0.5)
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
    links: { ...L, todayDrawn: rec.today.linksDrawn, v2Drawn: rec.v2.linksDrawn },
    highlight: { today: rec.today.lit.length, v2: rec.v2.lit.length },
    darkness: dk ?? null,
    diff: px.diff ?? null,
    rules: rules.length,
    laid: { today: T.size, v2: V.size, gained },
    figures: { today: figT, v2: figV },
  }
  for (const f of FLAGS) {
    const a = faults.today[f] ?? [],
      b = faults.v2[f] ?? []
    if (a.length || b.length) out.faults[f] = { today: a.length, v2: b.length, todaySays: a.slice(0, 6), v2Says: b.slice(0, 6) }
  }
  out.diffs.sort((x, y) => Number(y.worse) - Number(x.worse) || FLAGS.indexOf(x.flag) - FLAGS.indexOf(y.flag))
  out.worse = out.diffs.filter((d) => d.worse).length
  const by = new Map()
  for (const d of out.diffs) if (d.worse) by.set(d.flag, (by.get(d.flag) ?? 0) + 1)
  out.score = [...by].reduce((s, [f, k]) => s + WEIGHT[f] * Math.min(k, 8), 0)
  out.units = units
  return out
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

function band(l) {
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

// ---------------------------------------------------------------- the summary, the file and the sheet
const isFirst = (p) => (p.pair === '1706.03762v7-zh' && p.page === 10) || (p.pair === '2303.11366v4-zh' && p.page === 1)
const order = [...pages].sort(
  (a, b) => Number(isFirst(b)) - Number(isFirst(a)) || Number(b.worse > 0) - Number(a.worse > 0) || b.score - a.score || a.pair.localeCompare(b.pair) || a.page - b.page,
)
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
const result = {
  format: 'readarxiv-parity 2',
  verdict: 'display ≥ today: no page worse than today\'s, a difference only where nearer the original',
  bounds: BOUNDS,
  near: NEAR,
  measures: SAYS,
  pairs,
  missing,
  pagesDrawn: pages.length,
  pagesWorse: pages.filter((p) => p.worse).length,
  errors: pages.filter((p) => p.error).map((p) => `${p.pair} p${p.page}: ${p.error}`),
  summary,
  worst,
  pages: order,
}
writeFileSync(join(OUT, 'parity.json'), `${JSON.stringify(result)}\n`)
writeFileSync(join(OUT, 'index.html'), sheet(result))
console.log(`parity: ${pages.length} pages of ${pairs.length} pairs; ${result.pagesWorse} worse than today; missing ${missing.map((m) => m.pair).join(', ') || 'none'}`)
for (const f of FLAGS) {
  const x = summary[f]
  console.log(`  ${f.padEnd(11)} ${String(x.worsePages).padStart(4)} pages worse (${x.worseUnits} differences), ${x.nearerPages} nearer; faults: v2 ${x.v2FaultPages} pages, today ${x.todayFaultPages}`)
}
console.log('worst:')
for (const w of worst) console.log(`  ${w.pair} p${w.page} (${w.score}): ${Object.entries(w.worse).map(([f, x]) => `${f} ${x.units}`).join(', ')}`)
process.exitCode = result.pagesWorse ? 1 : 0

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}
function sheet(r) {
  const rows = FLAGS.map((f) => {
    const x = r.summary[f]
    return `<tr><th>${f}</th><td class="bad">${x.worsePages}</td><td>${x.worseUnits}</td><td class="good">${x.nearerPages}</td><td>${x.v2FaultPages}</td><td>${x.todayFaultPages}</td><td class="says">${esc(SAYS[f])}</td></tr>`
  }).join('')
  const miss = r.missing.map((m) => `<article class="card missing"><h2>${esc(m.pair)}</h2><p>Not drawn: ${esc(m.why)}.</p></article>`).join('')
  const side = (x) => `${x.value === null || x.value === undefined ? '' : `${esc(x.value)} `}${x.off === null || x.off === undefined ? '' : `<span class="off">off ${esc(x.off)}</span>`}`
  const cards = r.pages
    .map((p) => {
      const id = `${p.pair}-p${p.page}`
      const diffs = p.diffs.length
        ? `<table class="diffs"><thead><tr><th>measure</th><th>unit</th><th>what</th><th>original</th><th>today</th><th>v2</th><th>nearer</th></tr></thead><tbody>${p.diffs
            .map((d) => `<tr class="${d.worse ? 'worse' : 'better'}"><td><b>${d.flag}</b></td><td>${esc(d.unit ?? 'page')}</td><td>${esc(d.what)}</td><td>${esc(d.original)}</td><td>${side(d.today)}</td><td>${side(d.v2)}</td><td class="n">${d.nearer === 'v2' ? 'v2' : 'today'}</td></tr>`)
            .join('')}</tbody></table>`
        : '<p class="ok">no difference past a noise floor</p>'
      const fl = FLAGS.filter((f) => p.faults[f])
        .map((f) => {
          const x = p.faults[f]
          const list = [...x.v2Says.map((s) => `<li>v2: ${esc(s)}</li>`), ...x.todaySays.map((s) => `<li class="t">today: ${esc(s)}</li>`)].join('')
          return `<details class="fault"><summary>${f}: v2 ${x.v2}, today ${x.today}</summary><ul>${list}</ul></details>`
        })
        .join('')
      const m = p.measures ?? {}
      const nums = p.error
        ? `<p class="err">${esc(p.error)}</p>`
        : `<p class="nums">laid: today ${m.laid?.today}, v2 ${m.laid?.v2} · links: original ${m.links?.original}, today ${m.links?.today}, v2 ${m.links?.v2} · sentence boxes: today ${m.highlight?.today}, v2 ${m.highlight?.v2} · darkness: original text ${m.darkness?.originalText?.mean ?? m.darkness?.original?.mean ?? '–'}, today ${m.darkness?.today?.mean ?? '–'}, v2 ${m.darkness?.v2?.mean ?? '–'} · off arXiv's page outside the units: today ${m.diff?.outsideToday ?? '–'}, v2 ${m.diff?.outside ?? '–'} px</p>`
      const img = (k, alt) => `<figure><figcaption>${alt}</figcaption><img loading="lazy" src="img/${id}-${k}.webp" alt="${esc(`${alt}, ${p.pair} page ${p.page}`)}"></figure>`
      const verdict = p.error ? '' : p.worse ? `<span class="v bad">worse than today: ${p.worse}</span>` : '<span class="v good">not worse than today</span>'
      return `<article class="card${p.worse ? ' flagged' : ''}" id="${esc(id)}"><h2>${esc(p.pair)} · page ${p.page} ${verdict}</h2>${nums}${diffs}${fl ? `<div class="faults"><p class="h">Faults against the bounds (each side's, shared ones no verdict):</p>${fl}</div>` : ''}<div class="panes">${img('a', 'original')}${img('t', 'today')}${img('v', 'v2')}<figure class="diff"><figcaption>v2 against today (red v2's ink alone, blue today's)</figcaption><img loading="lazy" src="img/${id}-d.webp" alt="${esc(`difference, ${p.pair} page ${p.page}`)}"></figure></div></article>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Display parity sheet</title>
<style>
:root { --bg: #f6f6f4; --card: #fff; --ink: #1b1b1b; --muted: #666; --line: #ddd; --bad: #c0392b; --good: #2e7d32; --today: #2e6db4; --badbg: #fbeaea; --goodbg: #eaf5ea; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #161616; --card: #202020; --ink: #eee; --muted: #aaa; --line: #3a3a3a; --badbg: #3a2020; --goodbg: #1f331f; } }
:root[data-theme="dark"] { --bg: #161616; --card: #202020; --ink: #eee; --muted: #aaa; --line: #3a3a3a; --badbg: #3a2020; --goodbg: #1f331f; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; }
table { border-collapse: collapse; background: var(--card); }
.summary { margin: 12px 0 20px; }
th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
.summary td { text-align: right; } .summary td.says { text-align: left; color: var(--muted); max-width: 560px; }
td.bad, .v.bad { color: var(--bad); font-weight: 600; } td.good, .v.good { color: var(--good); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 0 0 16px; }
.card.flagged { border-left: 4px solid var(--bad); }
.card h2 { font-size: 16px; margin: 0 0 4px; }
.v { font-size: 13px; margin-left: 8px; }
.nums, .ok, .h { color: var(--muted); margin: 0 0 6px; font-size: 13px; }
.err { color: var(--bad); }
.diffs { font-size: 13px; margin: 6px 0; width: 100%; }
.diffs tr.worse { background: var(--badbg); } .diffs tr.better { background: var(--goodbg); }
.diffs td.n { font-weight: 600; } .diffs tr.worse td.n { color: var(--bad); } .diffs tr.better td.n { color: var(--good); }
.off { color: var(--muted); }
.fault summary { cursor: pointer; font-size: 13px; }
.fault ul { margin: 4px 0 8px; padding-left: 20px; font-size: 13px; }
.fault li.t { color: var(--today); }
.panes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.panes figure { margin: 0; }
.panes figcaption { font-size: 12px; color: var(--muted); }
.panes img { width: 100%; height: auto; border: 1px solid var(--line); background: #fff; }
.panes .diff { grid-column: 1 / -1; max-width: 33%; }
@media (max-width: 800px) { .panes { grid-template-columns: 1fr; } .panes .diff { max-width: none; } .diffs { display: block; overflow-x: auto; } }
</style>
</head>
<body>
<h1>Display ≥ today: v2 against today's output, judged against arXiv's page</h1>
<p>${r.pagesDrawn} pages of ${r.pairs.length} pairs drawn offline with the same rows on both sides (today: the door over the release's bundle; v2: the reader drawing the entry's Page). A difference between the two passes only where v2 is nearer the original; <b>${r.pagesWorse} pages are worse than today's</b>. Each difference below shows the original's value, both sides' and their distance from it (“off”), and which is nearer. Measures, noise floors and bounds: lab/typeset/parity/README.md.</p>
<table class="summary"><thead><tr><th>measure</th><th>pages worse</th><th>differences worse</th><th>pages v2 nearer</th><th>v2 faults (pages)</th><th>today faults (pages)</th><th>distance from the original</th></tr></thead><tbody>${rows}</tbody></table>
${miss}
${cards}
</body>
</html>
`
}
