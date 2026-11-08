// lab/typeset/parity/fidelity.mjs: the measures that judge each side's drawing against arXiv's page and the original's own facts,
// never against v2's (lane rc-gate, 2026-11-08: what the maintainer found by eye on the converge-7 sheet and no measure flagged),
// and the maintainer's rulings of 2026-11-08 the gate judges by (README.md, "The maintainer's rulings"). verdict.mjs's
// measurePage calls measureFidelity with the page's drawing and its judging helpers; measure.mjs reads each paper's frame
// (frameOf) and, once a paper's pages are measured, its labels (labelsPass).
//   - the original's style and size are read off arXiv's glyphs (render.mjs's runs of PDF.js's text content, their PDF fonts'
//     names: the engine's classifyFont), not off the part;
//   - every measure judges each side's distance from the original, v2's passing where it is nearer or equal (README.md).
import { classifyFont } from '../../../packages/engine/src/locate/facts.ts'

const r2 = (v) => (v === null || v === undefined ? v : Math.round(v * 100) / 100)
/** the fit's step (data/rules/scripts.ts: 0.025 of the size): a size off by half of it or more is a step a reader sees */
export const SIZE_STEP = 0.025
/** device pixels of a side's text over other ink that a reader sees: three crossings of two strokes at reading size (a stroke
 *  of 10 pt type is 1.6 to 2.7 device px wide at the parity's 2.67 px a point) */
export const OVER_MIN = 20
/** an original glyph shown in part (an erasure's sliver): at least this many device px of it shown, and at least SLIVER_SHARE
 *  of it, at most PART_SHARE (more is the glyph kept, its edge a sub-pixel phase off) */
export const SLIVER_PX = 6
export const SLIVER_SHARE = 0.05
export const PART_SHARE = 0.75
/** an element whose ink a side shows in place on at least this share is kept as the original's, not drawn */
export const KEPT_SHARE = 0.5
/** the least glyph pixels a class of texts needs on each side for its darkness to be compared (the mean's spread at 500 px is
 *  under a third of the 5 % floor at the original's darkness) */
export const CLASS_PIXELS = 500
/** a script: a run of an element's glyphs whose baseline stands off another's by this share of the size, or whose size is under
 *  this share of another's (TeX sets one hbox's glyphs on one baseline at one size: a script, a fraction, an accent or a
 *  \raisebox shifts one, each by a third of an em or more) */
const SCRIPT_RISE = 0.15
const SCRIPT_SIZE = 0.85
/** a paragraph's leading off the original's that a reader sees: a twentieth of its pitch (0.6 pt of a 12 pt pitch) */
export const LEAD_SHARE = 0.05
/** an accent set apart (TeX's \accent: a modifier symbol or letter, or a combining mark, alone in its run) is no script */
const ACCENT = /^[\p{Sk}\p{Lm}\p{M}\s]+$/u
/** a cased letter (Unicode: it has another case) */
const cased = (ch) => ch.toLowerCase() !== ch.toUpperCase()
const bare = (s) => String(s ?? '').normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()

// ---------------------------------------------------------------- the original read off arXiv's glyphs
/** the runs of arXiv's page whose middle stands in one of `boxes` ([x0, y0, x1, y1], PDF units, padded half a point) */
export function runsIn(runs, boxes) {
  if (!runs?.length || !boxes?.length) return []
  return runs.filter((r) => {
    const x = (r[0] + r[2]) / 2,
      y = (r[1] + r[3]) / 2
    return boxes.some((b) => x >= b[0] - 0.5 && x <= b[2] + 0.5 && y >= b[1] - 0.5 && y <= b[3] + 0.5)
  })
}

/**
 * A text's original style and size, read off arXiv's glyphs in its lines' boxes (`runs` render.mjs's, `fonts` their PDF font
 * names): the share of its characters (white space and math fonts' aside) set in a bold and in a slanted face, and its size,
 * the size TeX was asked for: its largest cased letter's (faked small capitals set the capitals at it and the rest smaller;
 * a script is smaller, never larger), else the median character's. null where no glyph stands there
 */
export function originalOf(runs, fonts, boxes) {
  const rs = runsIn(runs, boxes)
  let chars = 0,
    bold = 0,
    italic = 0,
    big = 0
  const sizes = []
  for (const r of rs) {
    const c = classifyFont(fonts?.[r[6]] ?? '')
    if (c.fam === 'math') continue
    const n = [...r[7]].filter((ch) => /\S/.test(ch)).length
    chars += n
    if (c.bold) bold += n
    if (c.italic) italic += n
    for (let i = 0; i < n; i++) sizes.push(r[5])
    if ([...r[7]].some(cased)) big = Math.max(big, r[5])
  }
  if (!chars) return null
  sizes.sort((a, b) => a - b)
  return { chars, bold: bold / chars, italic: italic / chars, size: big || sizes[sizes.length >> 1] }
}

/** whether an element's glyphs on A (the runs in its ink's boxes) stand on two baselines or at two sizes: scripts a flat text
 *  cannot carry */
export function scriptedOf(runs, boxes) {
  const rs = runsIn(runs, boxes).filter((r) => !r[8] && !ACCENT.test(r[7]))
  if (rs.length < 2) return false
  const big = Math.max(...rs.map((r) => r[5]))
  const bases = rs.map((r) => r[4])
  return Math.max(...bases) - Math.min(...bases) > SCRIPT_RISE * big || Math.min(...rs.map((r) => r[5])) < SCRIPT_SIZE * big
}

// ---------------------------------------------------------------- the paper's frame: its columns and text block
/**
 * A paper's text frame, read off the original's own lines (until the engine states TeX's \textwidth and \columnwidth): the
 * edges its paragraphs' lines start and end at, each an edge where a fifth or more of them do (a justified line ends at its
 * column's edge, a paragraph's lines start at its margin; an indent or a last line is no edge), paired left to right into its
 * columns, and the text block they make. `facts` v2.mjs's facts by page (each member's lines on A once, by its ord)
 */
export function frameOf(facts) {
  const seen = new Set(),
    x0s = [],
    x1s = []
  for (const f of Object.values(facts ?? {}))
    for (const m of f.members ?? []) {
      if (m.kind !== 'para' || seen.has(m.ord)) continue
      seen.add(m.ord)
      for (const l of m.lines) {
        x0s.push(l[2])
        x1s.push(l[3])
      }
    }
  if (!x0s.length) return null
  const edges = (xs, low) => {
    const s = [...xs].sort((a, b) => a - b)
    const out = []
    let k = 0
    while (k < s.length) {
      let j = k
      while (j + 1 < s.length && s[j + 1] - s[j] <= 1) j++
      if (j - k + 1 >= 0.2 * s.length) out.push(low ? s[k] : s[j])
      k = j + 1
    }
    return out
  }
  const lo = edges(x0s, true),
    hi = edges(x1s, false)
  const block = [lo.length ? Math.min(...lo) : Math.min(...x0s), hi.length ? Math.max(...hi) : Math.max(...x1s)]
  const columns = lo.length === hi.length && lo.every((x, i) => x < hi[i] && (i === 0 || hi[i - 1] < x)) ? lo.map((x, i) => [x, hi[i]]) : [block]
  return { columns, block }
}

/** the frame a text's original lines on the page stand in: the column that holds them (2 pt either side), else the text block;
 *  widened to the lines' own extent (a line the original set past it may stand as far) */
export function frameFor(frame, lines) {
  if (!lines.length) return null
  const ux0 = Math.min(...lines.map((l) => l.x0)),
    ux1 = Math.max(...lines.map((l) => l.x1))
  if (!frame) return [ux0, ux1]
  const col = frame.columns.find((c) => ux0 >= c[0] - 2 && ux1 <= c[1] + 2)
  const f = col ?? frame.block
  return [Math.min(f[0], ux0), Math.max(f[1], ux1)]
}

// ---------------------------------------------------------------- joins: figure texts and names, drawn by both sides
const boxOfLines = (ls, band) => {
  const bs = ls.filter((l) => l.n > 0).map(band)
  return bs.length ? { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) } : null
}
const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
/** each a paired with the b its box overlaps most, where that a is also the one b's box overlaps most */
export function mutualBest(as, bs) {
  const best = (x, ys) => {
    let at = -1,
      most = 0
    ys.forEach((y, i) => {
      const o = area(x.box, y.box)
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

// ---------------------------------------------------------------- the page
/**
 * The page's measures against the original (each side's distance from it, judged by `judge`/`diff`, faults by `fault`), from
 * `c`: the page's number `n`, its drawing (`rec`, render.mjs's), v2.mjs's file (`v2`), the part's facts by ord (`facts`), v2's
 * laid members (`laidV2`), each side's drawn lines by key (`T`, `V`, crops in their extent), the original's facts by key
 * (`orig`), `keyOfPart`, today's prepare units (`prepByOrd`), the paper's frame, its tables' grid groups (`groups`: today's
 * ledger, TeX's grid), the cells whose door row today's group decision kept (`keptByGroup`), the page's page numbers (`folios`,
 * part ords) and the helpers. Returns what the size and line-count rulings and the paper's label pass read
 */
export function measureFidelity(c) {
  const { n, rec, v2, facts, laidV2, T, V, orig, keyOfPart, prepByOrd, judge, diff, fault, inkOf, NEAR } = c
  const runs = rec.original?.runs ?? null,
    fonts = rec.original?.fonts ?? []
  const fid = rec.px?.fidelity ?? null
  const kindOf = (key) => orig.get(key)?.kind ?? ''
  const name = (key) => `${key} ${kindOf(key)}`.trim()
  const both = [...T.keys()].filter((k) => V.has(k))
  const v2Only = [...V.keys()].filter((k) => !T.has(k))
  const ordOfV = new Map([...(rec.v2.units ?? [])].map((u) => [keyOfPart(u.id), u.id]))
  const sizeOf = (key) => orig.get(key)?.size || 10
  const pos = (key) => Math.max(NEAR.positionMin, NEAR.position * sizeOf(key))
  const flat = (ls) => (ls ?? []).filter((l) => !l.rot && l.n > 0)

  // ---------------- frame: a line past its column or the original's text block (a cell: past its own room, the owner's
  // ruling 3); each side's overshoot in points, the original's 0
  const overshoot = (key, ls) => {
    const o = orig.get(key)
    if (!o?.lines.length || /figure/.test(o.kind ?? '')) return null
    const f = o.kind === 'cell' ? [Math.min(...o.lines.map((l) => l.x0)), Math.max(...o.lines.map((l) => l.x1))] : frameFor(c.frame, o.lines)
    if (!f) return null
    return Math.max(0, ...flat(ls).map(inkOf).map((l) => Math.max(l.x1 - f[1], f[0] - l.x0)))
  }
  const past = { today: new Map(), v2: new Map() }
  for (const [side, M] of [['today', T], ['v2', V]])
    for (const [key, ls] of M) {
      const d = overshoot(key, ls)
      if (d === null) continue
      past[side].set(key, d)
      if (d > pos(key)) fault(side, 'frame', `${name(key)}: a line ${r2(d)} pt past ${kindOf(key) === 'cell' ? 'its own room' : "its column or the original's text block"}`)
    }
  for (const key of [...both, ...v2Only]) {
    const t = T.has(key) ? past.today.get(key) : 0,
      v = past.v2.get(key)
    if (t === undefined || v === undefined) continue
    judge('frame', name(key), kindOf(key) === 'cell' ? "a line past the cell's own room (its original's extent), points" : "a line past its column or the original's text block, points", 0, { value: r2(t), d: t }, { value: r2(v), d: v }, pos(key))
  }

  // ---------------- block: lines borrowed past TeX's room (the owner's ruling of 2026-11-08: a paragraph may take lines in the
  // space under a run of its lines, never past TeX's text block bottom in its column, nor bringing the next ink nearer than
  // TeX's paragraph separation): each side's drawn lines under a run's last original line on the page, the part's room under
  // it (Room.runs: the depth of the next ink's baseline, of TeX's text block bottom; Room.sep, \baselineskip and \parskip),
  // a line under the lowest baseline that room allows by more than `pos` a fault. A drawn line is judged where it stands under
  // the unit's lowest original line on the page whose column (TeX's measure) it meets, the space below its own last line
  // there: a line over another of its own original lines in its column (laid on from the unit before over the rows it left,
  // beside a float TeX set inside the paragraph: 2608.16117v1 p17 t57, p19 t59) borrows nothing under its last. A run the
  // part states no room under, no judgement (no TeX fact to judge by); one with no separation stated, its bottom alone
  const borrowed = { today: new Map(), v2: new Map() }
  const roomOf = (key) => {
    const o = orig.get(key)
    const m = o?.part !== null && o?.part !== undefined ? c.facts.get(o.part) : null
    if (!m?.lines?.length || /figure/.test(o.kind ?? '')) return null
    const runs = new Map((m.room?.runs ?? []).map(([j, ink, foot]) => [j, { ink, foot }]))
    return { lines: m.lines.map((l, j) => ({ j, y: l[4], m0: Math.min(l[7], l[2]), m1: Math.max(l[8], l[3]), kept: l[9] & 1 })).filter((l, j) => m.lines[j][0] === n), runs, sep: m.room?.sep }
  }
  for (const [side, M] of [['today', T], ['v2', V]])
    for (const [key, ls] of M) {
      const r = roomOf(key)
      if (!r?.runs.size) continue
      let k = 0
      for (const l of flat(ls)) {
        const column = r.lines.filter((o) => o.m1 > l.x0 && o.m0 < l.x1)
        const over = column.length && column.every((o) => o.y > l.y + pos(key)) ? column.sort((a, b) => a.y - b.y)[0] : null
        const run = over && r.runs.get(over.j)
        if (!run) continue
        const free = r.sep === undefined ? run.foot : Math.min(run.foot, run.ink - r.sep)
        const past = over.y - Math.max(0, free) - l.y
        if (!(past > pos(key))) continue
        k++
        fault(side, 'block', r.sep !== undefined && run.ink - r.sep < run.foot ? `${name(key)}: a line ${r2(past)} pt nearer the next ink than TeX's paragraph separation` : `${name(key)}: a line ${r2(past)} pt past TeX's text block bottom`)
      }
      borrowed[side].set(key, k)
    }
  for (const key of [...both, ...v2Only]) {
    const t = T.has(key) ? (borrowed.today.get(key) ?? 0) : 0,
      v = borrowed.v2.get(key) ?? 0
    if (!borrowed.v2.has(key) && !borrowed.today.has(key)) continue
    if (t === v) continue
    diff('block', name(key), "lines borrowed past TeX's room: under its text block bottom, or the next ink nearer than its paragraph separation", 0, { value: t, off: t }, { value: v, off: v }, v > t, v < t ? 'v2' : 'today')
  }

  // ---------------- over: a side's text drawn over ink that stays (its text over the copy's ink, its crops', the original's
  // kept), device pixels per drawn group; figure texts and names judged as the page's whole
  if (fid) {
    const ov = fid.over
    const tOf = (key) => ov.today[`t:${key.slice(1)}`] ?? 0
    const vOf = (key) => ov.v2[`p:${ordOfV.get(key)}`] ?? 0
    for (const key of [...both, ...v2Only]) {
      const t = T.has(key) ? tOf(key) : 0,
        v = vOf(key)
      if (v > OVER_MIN) fault('v2', 'over', `${name(key)}: ${v} device px of its text over ink that stays`)
      if (t > OVER_MIN) fault('today', 'over', `${name(key)}: ${t} device px of its text over ink that stays`)
      judge('over', name(key), 'its text drawn over ink that stays (device px)', 0, { value: t, d: t }, { value: v, d: v }, OVER_MIN)
    }
    const sum = (o, re) => Object.entries(o).filter(([k]) => re.test(k)).reduce((s, [, x]) => s + x, 0)
    const figV = new Set([...facts.values()].filter((m) => /figure/.test(m.kind ?? '')).map((m) => `p:${m.ord}`))
    const nameV = new Set([...facts.values()].filter((m) => m.kind === 'name').map((m) => `p:${m.ord}`))
    const vs = (set) => Object.entries(ov.v2).filter(([k]) => set.has(k)).reduce((s, [, x]) => s + x, 0)
    judge('over', 'figure texts', 'the figure texts drawn over ink that stays (device px)', 0, { value: sum(ov.today, /^f:/), d: sum(ov.today, /^f:/) }, { value: vs(figV), d: vs(figV) }, OVER_MIN)
    judge('over', 'names', 'the names drawn over ink that stays (device px)', 0, { value: sum(ov.today, /^n:/), d: sum(ov.today, /^n:/) }, { value: vs(nameV), d: vs(nameV) }, OVER_MIN)
  }

  // ---------------- erased: the original's glyphs a side shows in part inside its translated units' regions (a sliver an
  // erasure or a crop's margin leaves); a side whose copy is not arXiv's page (today's over a delta's replaced page) is not read
  if (fid) {
    const slivers = (side) => (fid.parts[side] ?? []).filter((p) => p.shown >= SLIVER_PX && p.shown >= SLIVER_SHARE * p.size && p.shown <= PART_SHARE * p.size)
    const keyAt = (p) => {
      const x = (p.box[0] + p.box[2]) / 2,
        y = (p.box[1] + p.box[3]) / 2
      for (const [key, o] of orig) if (o.lines.some((l) => x >= l.x0 - 0.5 && x <= l.x1 + 0.5 && y >= l.bottom - 0.5 && y <= l.top + 0.5)) return key
      return null
    }
    const by = { today: new Map(), v2: new Map() }
    const read = { today: !rec.today.replaced, v2: true }
    for (const side of ['today', 'v2']) {
      if (!read[side]) continue
      for (const p of slivers(side)) {
        const key = keyAt(p) ?? 'page'
        by[side].set(key, (by[side].get(key) ?? 0) + 1)
      }
      for (const [key, k] of by[side]) fault(side, 'erased', `${key === 'page' ? 'page' : name(key)}: ${k} original glyph${k > 1 ? 's' : ''} shown in part`)
    }
    for (const key of new Set([...by.today.keys(), ...by.v2.keys()])) {
      const t = read.today ? (by.today.get(key) ?? 0) : 0,
        v = by.v2.get(key) ?? 0
      if (t === v) continue
      diff('erased', key === 'page' ? null : name(key), `the original's glyphs shown in part inside the translated units' regions${read.today ? '' : " (today's copy over a delta's page: today's not read)"}`, 0, { value: read.today ? t : null, off: t }, { value: v, off: v }, v > t, v < t ? 'v2' : 'today')
    }
  }

  // ---------------- elements: an element drawn otherwise than the original sets it: its pieces apart that TeX set on one line,
  // its scripts or sizes set flat as text, or drawn as nothing where TeX set ink for it
  const wrong = { today: new Map(), v2: new Map() }
  const note = (side, key, what) => {
    if (!wrong[side].has(key)) wrong[side].set(key, [])
    wrong[side].get(key).push(what)
  }
  // (a) split: two crops of one element whose sources stand on one of its unit's original lines, drawn otherwise placed to
  // each other than on A
  for (const [side, crops, keyOf] of [
    ['today', rec.today.crops ?? [], (u) => `t${u}`],
    ['v2', rec.v2.crops ?? [], keyOfPart],
  ]) {
    const byEl = new Map()
    for (const cr of crops) {
      if (cr.length < 11 || cr[6] === null || cr[10] !== n || cr[5] === 'label' || cr[5] === 'counter') continue
      const key = keyOf(cr[0])
      const o = orig.get(key)
      if (!o?.lines.length) continue
      const held = (l) => Math.min(cr[9], l.y + 0.8 * l.size) - Math.max(cr[7], l.y - 0.2 * l.size)
      const line = o.lines.reduce((a, b) => (held(b) > held(a) ? b : a))
      const id = `${key}|${cr[5]}|${line.y}`
      if (!byEl.has(id)) byEl.set(id, { key, piece: cr[5], list: [] })
      byEl.get(id).list.push(cr)
    }
    for (const { key, piece, list } of byEl.values()) {
      if (list.length < 2) continue
      const [a, ...rest] = list
      const k = (a[3] - a[1]) / Math.max(1e-6, a[8] - a[6])
      const mid = (cr, o) => [(cr[o] + cr[o + 2]) / 2, (cr[o + 1] + cr[o + 3]) / 2]
      const [ax, ay] = mid(a, 1),
        [sx, sy] = mid(a, 6)
      const apart = rest.some((b) => {
        const [bx, by] = mid(b, 1),
          [tx, ty] = mid(b, 6)
        return Math.abs(bx - ax - k * (tx - sx)) > 1 || Math.abs(by - ay - k * (ty - sy)) > 1
      })
      if (apart) note(side, key, `element ${piece}: its ${list.length} pieces TeX set on one line drawn apart`)
    }
  }
  // (b) scripts set flat, (c) drawn as nothing: v2's elements from the part (El: its ink's boxes here, its text), each read
  // against arXiv's glyphs in its ink's boxes and against TeX's points (today's prepare dump: its ink found on this page, or a
  // piece TeX's points hold that its reading lost, its ink not outside the unit's lines)
  // (an element is drawn as a crop where a crop of its unit is cut from its ink: the crop's source on A holds half of its ink's
  // box or more; a crop's piece names its place in the row, not the element)
  const cropsBy = { today: new Map(), v2: new Map() }
  for (const [side, list] of [['today', rec.today.crops ?? []], ['v2', rec.v2.crops ?? []]])
    for (const cr of list) {
      if (cr.length < 11 || cr[6] === null) continue
      if (!cropsBy[side].has(cr[0])) cropsBy[side].set(cr[0], [])
      cropsBy[side].get(cr[0]).push(cr)
    }
  const cropped = (side, unit, boxes) =>
    boxes.some((b) => {
      const whole = Math.max(1e-6, (b[2] - b[0]) * (b[3] - b[1]))
      return (cropsBy[side].get(unit) ?? []).some((cr) => cr[10] === n && area({ x0: cr[6], y0: cr[7], x1: cr[8], y1: cr[9] }, { x0: b[0], y0: b[1], x1: b[2], y1: b[3] }) >= 0.5 * whole)
    })
  const keptHere = (side, id) => {
    const s = fid?.shown?.[side]?.[id]
    return !!s && s.ink > 0 && s.shown >= KEPT_SHARE * s.ink
  }
  const VISIBLE = (kind) => kind !== 'space' && kind !== 'zero'
  // (today's element kinds that set their characters as written, as the engine's El.literal: a URL, a code mark)
  const LITERAL_KINDS = new Set(['url', 'code'])
  for (const ord of laidV2.keys()) {
    const m = facts.get(ord)
    if (!m?.els) continue
    const key = keyOfPart(ord)
    const today = c.todayOf.get(ord)
    const tu = today !== undefined ? prepByOrd.get(today) : undefined
    const firstLaid = Math.min(...Object.entries(v2.pages).filter(([, p]) => p.members.some((x) => x.ord === ord && x.state === 'laid')).map(([pg]) => Number(pg)))
    for (const [k, kind, boxes, inkAll, text, raised, keep, literal] of m.els) {
      if (!VISIBLE(kind) || keep) continue
      const id = `${ord}:${k}`
      if (cropped('v2', ord, boxes) || keptHere('v2', id)) continue
      // (with ink here and no crop cut from it, drawn as its text: its scripts flat where its glyphs on A have them; a literal
      // element (a URL, a code mark: TeX sets its characters as written, so it has no scripts) TeX broke over lines is drawn as
      // its text by design, its glyphs on two baselines its lines', no scripts)
      if (boxes.length) {
        if (text === 1 && !raised && !literal && runs && scriptedOf(runs, boxes.map((b) => [b[0], b[1], b[2], b[3]]))) note('v2', key, `element ${k}: its scripts or sizes set flat as text`)
        continue
      }
      // (with no ink here, drawn as nothing (typeset lay/read.ts: a visible class with no ink is none), but a symbol, drawn from
      // its source's name, and a text macro whose text the part states, drawn as that text; one the instrument states empty,
      // TeX set nothing: no element missing. Missing where TeX's points hold ink: today's reading finds it on this page, or its
      // points hold ink its reading lost)
      if (text === 2 || kind === 'symbol' || ((kind === 'macro' || kind === 'umacro') && text === 1)) continue
      const te = tu?.elements?.find((e) => String(e.k) === k)
      const found = te?.segs?.some((g) => g.page === n)
      // (a piece whose ink stands outside its unit's lines, OUTSIDE, stays the original's in place on both sides: an IEEE drop
      // cap, 2610.20484 p1)
      const lost = te?.flags?.includes('LOST') && !te.flags.includes('OUTSIDE') && !inkAll && n === firstLaid
      if (found || lost) note('v2', key, `element ${k}: drawn as nothing where TeX set ${found ? 'ink' : 'ink its reading did not find'}`)
    }
  }
  // (today's elements drawn as text: today draws an element whose ink it does not find as nothing never, leaving its unit the
  // original's (tex.mjs cropsOf); one it draws as text is read as v2's)
  for (const key of T.keys()) {
    const tu = prepByOrd.get(Number(key.slice(1)))
    for (const e of tu?.elements ?? []) {
      const boxes = (e.segs ?? []).filter((g) => g.page === n).map((g) => [g.x0, Math.min(g.top, g.bottom), g.x1, Math.max(g.top, g.bottom)])
      const id = `${key.slice(1)}:${e.k}`
      // (today's `url` and `code` elements are literal as v2's: no scripts to set flat)
      if (!boxes.length || LITERAL_KINDS.has(e.kind) || cropped('today', Number(key.slice(1)), boxes) || keptHere('today', id) || e.flags?.includes('RAISED') || e.flags?.includes('EMPTY')) continue
      if (runs && scriptedOf(runs, boxes)) note('today', key, `element ${e.k}: its scripts or sizes set flat as text`)
    }
  }
  for (const side of ['today', 'v2']) for (const [key, ws] of wrong[side]) for (const w of ws) fault(side, 'elements', `${name(key)}: ${w}`)
  for (const key of new Set([...wrong.today.keys(), ...wrong.v2.keys()])) {
    if (!T.has(key) && !V.has(key)) continue
    const t = wrong.today.get(key) ?? [],
      v = wrong.v2.get(key) ?? []
    if (t.length === v.length) continue
    diff('elements', name(key), 'elements drawn otherwise than the original sets them (pieces apart, scripts flat, drawn as nothing)', 0, { value: t[0] ?? null, off: t.length }, { value: v[0] ?? null, off: v.length }, v.length > t.length, v.length < t.length ? 'v2' : 'today')
  }

  // ---------------- groups: a table's grid groups (TeX's grid: the header, each column, the cells spanning the same columns),
  // translated or kept whole as today decides (the owner's ruling 3)
  const groupState = (side, M, cells) => {
    const st = cells.map(({ key, src }) => {
      const ls = M.get(key)
      if (!ls) return 'original'
      return bare(ls.map((l) => l.text).join('')) === bare(src) ? 'original' : 'target'
    })
    return st.every((x) => x === st[0]) ? st[0] : 'mixed'
  }
  for (const g of c.groups ?? []) {
    const cells = g.ids
      .map((id) => ({ id, u: prepByOrd.get(id) }))
      .filter(({ u }) => u?.lines?.some((l) => l.page === n))
      .map(({ id, u }) => ({ id, key: `t${id}`, src: u.text }))
    if (cells.length < 2) continue
    const t = groupState('today', T, cells),
      v = groupState('v2', V, cells)
    if (t === 'mixed') fault('today', 'groups', `${g.group}: its cells part translated, part the original's`)
    if (v === 'mixed') fault('v2', 'groups', `${g.group}: its cells part translated, part the original's`)
    // (a group both sides draw the same, kept on both or translated on both, is no difference; one drawn otherwise than today
    // decides is worse)
    if (t !== v) diff('groups', `group ${g.group}`, "a table's grid group translated or kept whole, as today decides (the owner's ruling)", 'whole', { value: t, off: t === 'mixed' ? 1 : 0 }, { value: v, off: 1 }, true, 'today')
    // (a group today's decision kept whole reaches v2 as no rows: the stored rows hold no translation of its cells, so v2's own
    // decision is not exercised there and what v2 draws is today's decision. Recorded apart, as the ruling's are: never worse,
    // never nearer; a run over rows that hold the translator's answers for those cells exercises it)
    const inherited = cells.filter(({ id }) => c.keptByGroup?.has(id))
    if (inherited.length && t === v)
      diff('groups', `group ${g.group}`, "kept whole by today's group decision, handed to v2 as rows already decided: v2's own group decision not exercised", 'whole', { value: 'decided', off: null }, { value: `${inherited.length} cells undecided`, off: null }, false, 'unexercised')
  }

  // ---------------- page numbers: their size kept, set right-aligned (the owner's ruling 6)
  for (const ord of c.folios ?? []) {
    const key = keyOfPart(ord)
    const o = orig.get(key)
    if (!o?.lines.length) continue
    const a = originalOf(runs, fonts, o.lines.map((l) => [l.x0, l.bottom, l.x1, l.top]))
    const os = a?.size ?? o.size
    const end = Math.max(...o.lines.map((l) => l.x1))
    const d = {}
    for (const [side, M] of [['today', T], ['v2', V]]) {
      const ls = flat(M.get(key))
      if (!ls.length) continue
      const size = Math.min(...ls.map((l) => l.size))
      const shrink = Math.max(0, 1 - size / os)
      const off = Math.abs(Math.max(...ls.map((l) => inkOf(l).x1)) - end)
      d[side] = { size, shrink, off }
      if (shrink > SIZE_STEP / 2 || off > pos(key)) fault(side, 'folio', `${name(key)}: ${r2(size)} pt (the original's ${r2(os)}), its end ${r2(off)} pt off the original's`)
    }
    if (d.today && d.v2) {
      judge('folio', name(key), "a page number at its size (shrink, share of the original's)", r2(os), { value: r2(d.today.size), d: d.today.shrink }, { value: r2(d.v2.size), d: d.v2.shrink }, SIZE_STEP / 2)
      judge('folio', name(key), "a page number right-aligned: its end off the original's, points", r2(end), { value: r2(d.today.off), d: d.today.off }, { value: r2(d.v2.off), d: d.v2.off }, pos(key))
    }
  }

  // ---------------- ink: the PDF's own black (the owner's ruling 7): a text whose original ink is black drawn in another fill
  if (fid) {
    const black = (id) => (fid.orig[id]?.least ?? 1) <= 0.05
    const notBlack = (ls) => flat(ls).filter((l) => l.fill && !/^rgb\(0, 0, 0\)$|^#000(000)?$|^black$/i.test(l.fill)).length
    const ink = { today: 0, v2: 0 }
    for (const key of both) {
      const id = orig.get(key)?.part !== null && orig.get(key)?.part !== undefined ? `p:${orig.get(key).part}` : `q:${key.slice(1)}`
      if (!black(id) && !black(`q:${key.slice(1)}`)) continue
      if (notBlack(T.get(key))) ink.today++
      if (notBlack(V.get(key))) ink.v2++
    }
    for (const side of ['today', 'v2']) if (ink[side]) fault(side, 'ink', `${ink[side]} units whose original ink is black drawn in another fill`)
    if (ink.today !== ink.v2) diff('ink', null, "units whose original ink is black drawn in another fill (the owner's ruling: the PDF's own black)", 0, { value: ink.today, off: ink.today }, { value: ink.v2, off: ink.v2 }, ink.v2 > ink.today, ink.v2 < ink.today ? 'v2' : 'today')
  }

  // ---------------- weight of figure texts, captions and cells, against the original's darkness of the same texts
  if (fid) {
    const cls = { figure: [], caption: [], cell: [] }
    for (const key of both) {
      const k = kindOf(key)
      const id = orig.get(key)?.part !== null && orig.get(key)?.part !== undefined ? `p:${orig.get(key).part}` : `q:${key.slice(1)}`
      const entry = { t: fid.dark.today[`t:${key.slice(1)}`], v: fid.dark.v2[`p:${ordOfV.get(key)}`], o: fid.orig[id] }
      if (k === 'caption') cls.caption.push(entry)
      else if (k === 'cell') cls.cell.push(entry)
    }
    for (const [ord, fgId] of c.figurePairs ?? new Map()) cls.figure.push({ t: fid.dark.today[`f:${fgId}`], v: fid.dark.v2[`p:${ord}`], o: fid.orig[`p:${ord}`] })
    const pool = (xs) => {
      let s = 0,
        k = 0
      for (const x of xs) if (x?.mean !== null && x?.mean !== undefined && x.pixels) [s, k] = [s + x.mean * x.pixels, k + x.pixels]
      return k ? { mean: s / k, pixels: k } : null
    }
    for (const [k, xs] of Object.entries(cls)) {
      const full = xs.filter((x) => x.t && x.v && x.o)
      const t = pool(full.map((x) => x.t)),
        v = pool(full.map((x) => x.v)),
        o = pool(full.map((x) => x.o))
      if (!t || !v || !o || t.pixels < CLASS_PIXELS || v.pixels < CLASS_PIXELS) continue
      judge('weight', `${k}s`, `the ${k === 'figure' ? 'figure texts' : `${k}s`}' darkness off the original's (the same texts on arXiv's page)`, r2(o.mean), { value: r2(t.mean), d: Math.abs(t.mean - o.mean) }, { value: r2(v.mean), d: Math.abs(v.mean - o.mean) }, NEAR.weight * o.mean, (x) => (x === null ? x : Math.round(x * 10000) / 10000))
    }
  }

  // ---------------- lead: a text set tighter than the original's leading while its block has room (the maintainer's 2010.11929
  // p5, 1810.04805 p8): its pitch over its size against the original's, where its last line stands a pitch or more over the
  // original's last
  const pitchOf = (ls) => {
    const ys = ls.map((l) => l.y).sort((a, b) => b - a)
    const size = ls.map((l) => l.size).sort((a, b) => a - b)[ls.length >> 1] || 10
    const gaps = []
    for (let i = 1; i < ys.length; i++) {
      const g = ys[i - 1] - ys[i]
      if (g > 0 && g < 2.5 * size) gaps.push(g)
    }
    gaps.sort((a, b) => a - b)
    return gaps.length ? { pitch: gaps[gaps.length >> 1], size } : null
  }
  const tight = { today: new Map(), v2: new Map() }
  const leadOf = new Map()
  for (const [side, M] of [['today', T], ['v2', V]])
    for (const [key, ls] of M) {
      const o = orig.get(key)
      if (!o || o.lines.length < 2 || /figure/.test(o.kind ?? '') || o.kind === 'cell') continue
      const fl = flat(ls)
      const d = pitchOf(fl),
        a = pitchOf(o.lines)
      if (!d || !a) continue
      const room = Math.min(...fl.map((l) => l.y)) - Math.min(...o.lines.map((l) => l.y)) >= a.pitch - 0.5
      const t = room ? Math.max(0, 1 - d.pitch / d.size / (a.pitch / a.size)) : 0
      tight[side].set(key, t)
      leadOf.set(`${side}|${key}`, d.pitch / d.size)
      if (t > LEAD_SHARE) fault(side, 'lead', `${name(key)}: its pitch ${r2(d.pitch)} pt at ${r2(d.size)} pt, the original's ${r2(a.pitch)} at ${r2(a.size)}, with a line of room left`)
    }
  for (const key of [...both, ...v2Only]) {
    const t = T.has(key) ? tight.today.get(key) : 0,
      v = tight.v2.get(key)
    if (t === undefined || v === undefined) continue
    judge('lead', name(key), "its leading tighter than the original's while its block has room (share of the original's pitch over size)", 0, { value: r2(leadOf.get(`today|${key}`) ?? null), d: t }, { value: r2(leadOf.get(`v2|${key}`)), d: v }, LEAD_SHARE)
  }

  return { borrowed, past }
}

/**
 * The style and size of the figure texts and names both sides draw (today's own groups joined to v2's members), judged against
 * arXiv's glyphs as the units' are: `pairs` v2 ord → today's group id, `todays` today's groups by id, `V` v2's lines by key
 */
export function judgeJoined(c, pairs, todays, what) {
  const { rec, facts, V, keyOfPart, judge, NEAR } = c
  const runs = rec.original?.runs ?? null,
    fonts = rec.original?.fonts ?? []
  for (const [ord, gid] of pairs) {
    const m = facts.get(ord)
    const tl = (todays.get(gid)?.lines ?? []).filter((l) => l.n > 0),
      vl = (V.get(keyOfPart(ord)) ?? []).filter((l) => l.n > 0)
    if (!m || !tl.length || !vl.length) continue
    const a = originalOf(
      runs,
      fonts,
      m.lines.filter((l) => l[0] === c.n).map((l) => [l[2], Math.min(l[5], l[6]), l[3], Math.max(l[5], l[6])]),
    )
    const os = a?.size ?? m.style?.size
    const nm = `p${ord} ${m.kind}`
    const med = (ls) => {
      const s = ls.map((l) => l.size).sort((x, y) => x - y)
      return s[s.length >> 1]
    }
    if (os) judge('size', nm, `${what}: size off the original's (share of it)`, r2(os), { value: r2(med(tl)), d: Math.abs(1 - med(tl) / os) }, { value: r2(med(vl)), d: Math.abs(1 - med(vl) / os) }, SIZE_STEP / 2)
    if (!a) continue
    for (const st of ['bold', 'italic']) {
      const share = (ls) => ls.reduce((s, l) => s + l[st], 0) / Math.max(1, ls.reduce((s, l) => s + l.n, 0))
      const tc = tl.reduce((s, l) => s + l[st], 0),
        vc = vl.reduce((s, l) => s + l[st], 0)
      if (Math.abs(tc - vc) < NEAR.styleMin) continue
      judge('style', nm, `${what}: ${st} share of its characters off the original's (arXiv's glyphs)`, r2(a[st]), { value: r2(share(tl)), d: Math.abs(share(tl) - a[st]) }, { value: r2(share(vl)), d: Math.abs(share(vl) - a[st]) }, NEAR.style)
    }
  }
}

/** today's figure groups and names joined to v2's figure and name members by their drawn boxes (each drawn where its original
 *  stands: a mutual best overlap) */
export function joinedOf(todays, V, facts, keyOfPart, kinds, band) {
  const t = todays.map((u) => ({ id: u.id, box: boxOfLines(u.lines, band) })).filter((x) => x.box)
  const v = [...facts.values()].filter((m) => kinds.test(m.kind ?? '')).map((m) => ({ id: m.ord, box: boxOfLines(V.get(keyOfPart(m.ord)) ?? [], band) })).filter((x) => x.box)
  const out = new Map()
  for (const [tid, ord] of mutualBest(t, v)) out.set(ord, tid)
  return out
}

/**
 * A paper's labels (the owner's ruling 4: the target word everywhere, consistent within a paper): `pages` the paper's measured
 * pages, each with `labels` (each unit's label as each side drew it: translated, kept, original). A side whose paper holds a
 * translated label and a kept or original one mixes them: a fault; v2 mixing where today does not is worse on each page v2
 * keeps one, today mixing where v2 does not nearer. Adds the differences to the pages and counts them again
 */
export function labelsPass(pages, recount) {
  const mixes = (side) => {
    const st = new Set(pages.flatMap((p) => (p.labels ?? []).map((x) => x[side]).filter(Boolean)))
    return st.has('translated') && (st.has('kept') || st.has('original'))
  }
  const t = mixes('today'),
    v = mixes('v2')
  for (const p of pages) {
    for (const x of p.labels ?? []) {
      const kept = (s) => s === 'kept' || s === 'original'
      if (t && kept(x.today)) (p.faults.labels ??= { today: 0, v2: 0, todaySays: [], v2Says: [] }).today++
      if (v && kept(x.v2)) (p.faults.labels ??= { today: 0, v2: 0, todaySays: [], v2Says: [] }).v2++
      if (v === t) continue
      if (v && kept(x.v2)) p.diffs.push({ flag: 'labels', unit: x.unit, what: "a label kept in a paper whose other labels are translated (the owner's ruling: the target word everywhere)", original: x.name, today: { value: x.today, off: 0 }, v2: { value: x.v2, off: 1 }, nearer: 'today', worse: true })
      if (t && kept(x.today) && !kept(x.v2)) p.diffs.push({ flag: 'labels', unit: x.unit, what: "a label kept in a paper whose other labels are translated (the owner's ruling: the target word everywhere)", original: x.name, today: { value: x.today, off: 1 }, v2: { value: x.v2, off: 0 }, nearer: 'v2', worse: false })
    }
    recount(p)
  }
  return { today: t, v2: v }
}
