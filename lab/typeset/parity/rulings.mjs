// lab/typeset/parity/rulings.mjs: the owner's rulings on the display gate's classes of difference, as the gate reads them. On
// 2026-11-12 the owner looked at one example of each class of difference the gate still read as worse (the review page
// display-classes.zh.html, three crops a class: the original, today's, v2's) and gave a verdict on each. A ruling here is a class
// stated by a condition the gate measures on the page, never a list of pages or units: the next paper's page of the same kind is
// judged the same way, and a page that only looks like it stays worse. Each entry names the class, the condition in words and in
// code (`holds`), his words as he wrote them, the date and the example he saw. A difference worse by its measure that a ruling's
// condition holds for is `covered` (its measure's reading kept: `nearer` today, `worse` false, `covered` the ruling's id): the
// sheet lists it apart from the differences no ruling covers, and the gate passes only when no page is worse outside his rulings.
// No floor is widened: a bound a condition needs is a measure's own noise floor (verdict.mjs NEAR), a fact the page states, or a
// number in his own words.
import { NEAR } from './verdict.mjs'
import { OVER_MIN } from './fidelity.mjs'

/** the date of the owner's verdicts, and the page he gave them on */
export const DATE = '2026-11-12'
export const SEEN = 'verification/display-classes.zh.html (lab-data refactor-2026-11); his verdicts: verification/owner-comments-display-classes-2026-11-12.json'
/** his general words, on the second class's card: the limits of one size a page and a fixed leading are not set, what counts is
 *  that the eye sees no clear difference of size or leading */
export const GENERAL =
  '是否要完全做到“一页一个字号”，或者行距一定要固定，这些限制我们可以不设。只要肉眼看起来字号和行距没有明显的差别，就是 OK 的。'

/** his verdict on each class ruled here, as he gave it */
const ACCEPTED = '可以接受'
/** a position's noise floor at a size (anchor, align, gap, frame: a tenth of the size, a point at least) */
const posFloor = (size) => Math.max(NEAR.positionMin, NEAR.position * (size || 10))
const shareOf = (s) => (s?.size && s?.osize ? s.size / s.osize : null)
const atOriginal = (s) => {
  const k = shareOf(s)
  return k !== null && Math.abs(k - 1) <= NEAR.size
}
/** the CJK opening marks, whose advance's blank half stands before their ink (verdict.mjs OPENING) */
const OPENING = /[\u3008\u300a\u300c\u300e\u3010\u3014\u3016\u3018\u301a\u301d\u2018\u201c\uff08\uff3b\uff5b\uff5f]/

/**
 * The rows a side draws a unit in on the page, by baseline: its drawn lines (a line of crops' stand-ins alone has one too, today's
 * SVG), and its crops, each on the baseline of the original line its source stands on, moved as the crop is (a crop is drawn
 * rigidly: its offset from its source is its line's). One row a baseline within half the size. `id` the side's id of the unit
 * (today's ord, v2's part ord), `ol` the original's lines of the unit (the part's, [page, -, x0, x1, baseline, top, bottom, …])
 */
export function rowsOf(drawn, crops, id, ol, size) {
  const ys = []
  for (const u of drawn ?? []) if (u.id === id) for (const l of u.lines ?? []) if (!l.rot && Number.isFinite(l.y)) ys.push(l.y)
  for (const c of crops ?? []) {
    if (c[0] !== id || c.length < 11 || c[7] === null || c[7] === undefined) continue
    const held = (l) => Math.min(c[9], l[4] + 0.8 * (l[10] ?? size)) - Math.max(c[7], l[4] - 0.2 * (l[10] ?? size))
    const on = (ol ?? []).filter((l) => l[0] === c[10])
    if (!on.length) continue
    const l = on.reduce((a, b) => (held(b) > held(a) ? b : a))
    if (held(l) <= 0) continue
    ys.push(l[4] + (c[2] - c[7]))
  }
  ys.sort((a, b) => b - a)
  const rows = []
  for (const y of ys) if (!rows.length || rows.at(-1) - y > 0.5 * size) rows.push(y)
  return rows
}
/** the leading of rows (baselines, top first): the least gap between two consecutive ones, none for one row */
export function pitchOf(rows) {
  let p = null
  for (let i = 1; i < rows.length; i++) {
    const g = rows[i - 1] - rows[i]
    if (p === null || g < p) p = g
  }
  return p
}

/** a `line-count` difference of a unit v2 sets in exactly one line fewer than today's on the page, both at most the original's
 *  count, v2 at the original's size; with each side's rows and the paragraph's leading, or null */
function lineFewer(d, x) {
  if (d.flag !== 'line-count' || !d.unit) return null
  const t = d.today?.value,
    v = d.v2?.value,
    o = d.original
  if (![t, v, o].every(Number.isFinite) || t - v !== 1 || v >= o || t > o) return null
  const u = x.unit(d)
  if (!u?.sides?.today || !u.sides.v2 || u.part === null || u.part === undefined || !atOriginal(u.sides.v2)) return null
  const size = u.sides.v2.osize
  const all = x.member(u.part)?.lines ?? []
  const ol = all.filter((l) => l[0] === x.n)
  const tr = rowsOf(x.rec.today?.units, x.rec.today?.crops, Number(u.key.slice(1)), all, size)
  const vr = rowsOf(x.rec.v2?.units, x.rec.v2?.crops, u.part, all, size)
  if (!tr.length || !vr.length) return null
  const orow = ol.map((l) => l[4]).sort((a, b) => b - a)
  return { u, size, tr, vr, orow, tEnd: tr.at(-1), vEnd: vr.at(-1), tPitch: pitchOf(tr), vPitch: pitchOf(vr), oPitch: pitchOf(orow) }
}

/**
 * The rulings, in the order a difference is tried against them (the first whose condition holds covers it). `holds(d, x)`: d a
 * difference worse by its measure, x the page's context (rulingsPass). An entry with no `holds` is a class he accepted that no
 * condition of the page tells from a fault that merely resembles it: listed, never applied, its pages left worse
 */
export const RULINGS = [
  {
    id: 'L1',
    title: "a paragraph a line shorter than today's, in the height today's takes",
    verdict: ACCEPTED,
    words: null,
    example:
      "2610.21312v1-zh p1 t7: 9 lines at 9.96 pt (the original's size) against today's 10 at 10.16, the original's 13, both last baselines at 267.05; 1706.03762v7-zh p1 t8: 10 lines against 11, the original's 15, the last baselines 0.55 pt apart",
    condition:
      "line-count: v2 sets the unit in exactly one line fewer than today on the page (both at most the original's count), at the original's size (within the size floor), and its last row on the page stands within half a line of today's last row: the measure's own floor (half a line) read on the drawn extent, a line the smaller of the two sides' leadings there (the original's where neither draws two rows). The line fewer costs no height",
    holds(d, x) {
      const f = lineFewer(d, x)
      if (!f) return false
      const line = [f.tPitch, f.vPitch].filter((p) => p !== null).reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY)
      const l = Number.isFinite(line) ? line : f.oPitch
      return l !== null && Math.abs(f.vEnd - f.tEnd) <= l / 2
    },
  },
  {
    id: 'L2',
    title: "a paragraph a line shorter than today's, ending higher",
    verdict: ACCEPTED,
    words:
      '这其中你提到是不是要开放“一页一个字号”，以及行距是否必须全部固定。\n其实这并不是一个定死的项，我们最终想达到的目的是页面自然均匀。\n所以，是否要完全做到“一页一个字号”，或者行距一定要固定，这些限制我们可以不设。只要肉眼看起来字号和行距没有明显的差别，就是 OK 的。\n实际上，如果我们做了一些高级的设计和调整，用户看起来没有什么差别，但页面实际上更加自然均匀了，这也是没有问题的。',
    example:
      "2610.40645v1-ja p4 t13: 6 lines at 10.91 pt against today's and the original's 7 (today at 11.12), its last baseline 12.93 pt over theirs on a leading of 14.23; 2608.06701v1-zh p5 t132: 6 lines against today's 7 at the same size, 13 pt over today's last, the paragraph's 14 lines in all against today's 15",
    condition:
      "line-count: v2 sets the unit in exactly one line fewer than today on the page (both at most the original's count), at the original's size (within the size floor), its last row higher than today's by no more than one of its own lines (its leading on the page, else today's, else the original's, and the position floor): the room of under a line he saw left under it; and the line has one of the two causes the lanes traced (cover-area C1, C2), each read off the page: (C1) today draws the unit larger than the original's by more than the size floor (today's misread of TeX's justification as size), or (C2) the translation's punctuation rule: v2's own lay of the pair with no CJK line squeezed to take the group it misses (its marks' blank halves, light compression before stretching; v2.mjs `unsqueezed`) sets the unit, over the pages it stands on, in more lines than v2 and no fewer than today",
    holds(d, x) {
      const f = lineFewer(d, x)
      if (!f || !(f.vEnd > f.tEnd)) return false
      const line = f.vPitch ?? f.tPitch ?? f.oPitch
      if (line === null || f.vEnd - f.tEnd > line + posFloor(f.size)) return false
      const tShare = shareOf(f.u.sides.today)
      if (tShare !== null && tShare - 1 > NEAR.size) return true
      return x.squeezeSaved(f.u)
    },
  },
  {
    id: 'S1',
    title: "a figure's labels at their group's size",
    verdict: ACCEPTED,
    words: null,
    example:
      "1512.03385v1-zh p6, Figure 5's five \"relu\" labels (p523-p527): v2 translates all five at one size, 4.37 pt (the original's 5.46); today translates the two lowest, at 4.95, and leaves three the original's",
    condition:
      "size, a figure text: v2 lays it in a size tie of the part (a figure's set laid at one size, the owner's ruling of 2026-10-29) and draws every text of the tie translated, at one size (within the size floor), where today translates some of the tie's texts and not all: today holds no size of the group, v2 the one size all its texts fit at",
    holds(d, x) {
      if (d.flag !== 'size' || !d.unit || !(d.v2?.value < d.today?.value)) return false
      const key = d.unit.split(' ')[0]
      const ord = key.startsWith('p') ? Number(key.slice(1)) : x.unit(d)?.part
      if (!Number.isFinite(ord) || !/figure/.test(x.member(ord)?.kind ?? '')) return false
      const tie = (x.v2.facts?.[x.n]?.ties ?? []).find((t) => t.includes(ord))
      if (!tie || tie.length < 2) return false
      const sizes = tie.map((o) => {
        const ls = (x.rec.v2?.units ?? []).filter((u) => u.id === o).flatMap((u) => u.lines.filter((l) => l.n > 0))
        return ls.length ? ls.map((l) => l.size).sort((a, b) => a - b)[ls.length >> 1] : null
      })
      if (sizes.some((s) => s === null)) return false
      if (Math.max(...sizes) / Math.min(...sizes) - 1 > NEAR.size) return false
      const joined = tie.filter((o) => x.figurePairs.has(o)).length
      return joined >= 1 && joined < tie.length
    },
  },
  {
    id: 'S2',
    title: "a table cell's text smaller than today's, kept to its cell",
    verdict: ACCEPTED,
    words: null,
    example:
      "2608.04322v1-zh p10 t256: v2 at 6.10 pt, 2.67 pt past its cell and centred, where today keeps the original's 6.97 by running 12.98 pt past it, 6.49 off its centre; 2602.23285v2-ja p18 t156: 6.48 against today's 6.66 (the original's 7.4), 6.13 pt past its cell against today's 7.39",
    condition:
      "size, a cell: v2 draws it smaller than today where today runs past the cell's own room (the owner's ruling 3: a cell's frame is its own original's extent) and v2 runs past it less (the frame measure on the same unit: today past it by more than the position floor, v2 nearer by more than that floor), its text still reaching the room's edge (v2's own reading past it more than none): the size given for room, never more than the room asks",
    holds(d, x) {
      if (d.flag !== 'size' || !d.unit || !(d.v2?.value < d.today?.value)) return false
      if (x.unit(d)?.kind !== 'cell') return false
      const fr = x.p.diffs.find((y) => y.flag === 'frame' && y.unit === d.unit)
      if (fr?.nearer !== 'v2') return false
      const floor = posFloor(d.original)
      return fr.today?.value > floor && fr.v2?.value > 0 && fr.today.value - fr.v2.value > floor
    },
  },
  {
    id: 'S3',
    title: 'a heading kept on its one line at a smaller size; a small-capitals heading at the size TeX set it',
    verdict: ACCEPTED,
    words: '这里如果你按样式的话，主站和现在其实都行。关键取决于我们怎么做性能更好、实现更简洁长期更好维护，效果我们都可以接受。',
    example:
      "2608.16117v1-de p4 t12: on its original one line at 11.06 pt where today keeps the original's 11.96 on two lines; 2610.21312v1-zh p6 t70: a heading TeX sets in small capitals at 9.96 pt (its letters at 0.8 of it, 7.97, as the measure reads the original), v2's translation at 9.96, today's at 9.76",
    condition:
      "size, a heading: (a) v2 draws it on the original's line count on the page at a smaller size than today's, where today keeps a larger size on more lines than the original's; or (b) the part states it set in small capitals (its letters at `sc` of TeX's size, the size the measure reads the original at, within the size floor) and v2 draws its translation at TeX's size for it (within the floor), the size of a script that has no small capitals",
    holds(d, x) {
      if (d.flag !== 'size' || !d.unit) return false
      const u = x.unit(d)
      if (u?.kind !== 'heading' || !u.sides?.today || !u.sides.v2) return false
      const t = u.sides.today,
        v = u.sides.v2
      if (v.lines === v.olines && t.lines > t.olines && v.size < t.size) return true
      const st = x.member(u.part)?.style
      if (!st?.caps || !st.sc || !st.size || !v.osize) return false
      return Math.abs(v.osize / (st.size * st.sc) - 1) <= NEAR.size && Math.abs(v.size / st.size - 1) <= NEAR.size
    },
  },
  {
    id: 'S4',
    title: "a theorem shrunk a little more than today's",
    verdict: ACCEPTED,
    words: null,
    example:
      "2610.40645v1-ja p22 t174: a theorem v2 sets at 10.64 pt where today sets 10.98, the original's 10.91",
    condition: null,
    unstated:
      "no condition of the page tells a theorem v2 must shrink a little more than today's from one v2 shrinks more than it needs: on his own example the theorem ends a line above its original's last on the next page (p23), so the page does not show the shrink was needed, and how much more is a little would be a number of the gate's, not his. Its pages stay worse",
    holds: null,
  },
  {
    id: 'E1',
    title: 'a web or e-mail address cut over two lines at its own break point',
    verdict: ACCEPTED,
    words: '不想破坏通用性。我感觉现在这样也行，除非你认为这是一个非常大的问题，那我们再讨论要不要修',
    example: '2610.21880v1-zh p1 t3: a footnote\'s e-mail address cut after "uni-" (since round B12 drawn whole there: an address stays whole unless the line before it would be justified and visibly stretched)',
    condition:
      "elements, its pieces TeX set on one line drawn apart: the element they are cut from (the part's El whose ink holds their sources) is one the part states TeX sets as written (El.literal: a URL, an address, a code mark), and v2 draws its pieces in their order, each two either placed as on arXiv's page or cut at a line's end: the first ends its drawn row (no text of the unit after it there), the next opens the row under it (none before it), no row of the unit between",
    holds(d, x) {
      if (d.flag !== 'elements' || !d.unit) return false
      const m = /^element (\S+): its \d+ pieces TeX set on one line drawn apart/.exec(String(d.v2?.value ?? ''))
      if (!m) return false
      const key = d.unit.split(' ')[0]
      const ord = key.startsWith('p') ? Number(key.slice(1)) : x.unit(d)?.part
      const crops = (x.rec.v2?.crops ?? []).filter((c) => c[0] === ord && String(c[5]) === m[1] && c.length >= 11 && c[6] !== null).sort((a, b) => a[6] - b[6])
      if (crops.length < 2) return false
      // (the element the pieces are cut from: the part's El whose ink holds every piece's source on arXiv's page (a fresh row
      // numbers its pieces its own way, so the piece's number need not be the El's), one TeX sets as written)
      const holds = (b, c) => Math.min(b[2], c[8]) - Math.max(b[0], c[6]) > 0 && Math.min(b[3], c[9]) - Math.max(b[1], c[7]) > 0
      const el = (x.member(ord)?.els ?? []).find((e) => crops.every((c) => (e[2] ?? []).some((b) => holds(b, c))))
      if (!el?.[7]) return false
      const lines = (x.rec.v2?.units ?? []).filter((u) => u.id === ord).flatMap((u) => u.lines.filter((l) => !l.rot && l.n > 0))
      const rowOf = (c) => lines.filter((l) => l.y - 0.2 * l.size < (c[2] + c[4]) / 2 && (c[2] + c[4]) / 2 < l.y + 0.8 * l.size)
      let cuts = 0
      for (let i = 1; i < crops.length; i++) {
        const a = crops[i - 1],
          b = crops[i]
        const k = (a[3] - a[1]) / Math.max(1e-6, a[8] - a[6])
        const placed = Math.abs((b[1] + b[3]) / 2 - (a[1] + a[3]) / 2 - (k * ((b[6] + b[8]) / 2 - (a[6] + a[8]) / 2))) <= 1 && Math.abs((b[2] + b[4]) / 2 - (a[2] + a[4]) / 2 - (k * ((b[7] + b[9]) / 2 - (a[7] + a[9]) / 2))) <= 1
        if (placed) continue
        if (!(b[4] <= a[2] + 1)) return false
        if (rowOf(a).some((l) => l.x1 > a[3] + 1) || rowOf(b).some((l) => l.x0 < b[1] - 1)) return false
        if (lines.some((l) => l.y < (a[2] + a[4]) / 2 - 0.5 * l.size && l.y > b[4])) return false
        cuts++
      }
      return cuts > 0
    },
  },
  {
    id: 'A1',
    title: 'a last line of one character',
    verdict: ACCEPTED,
    words: '看起来效果我都能接受，用当前最简洁最干净最长期好维护的方式去做就行',
    example:
      '2610.30034v1-zh p7 t139, t140: two items of a theorem, each with its last line one character before its display, at the original\'s 9.96 pt on the original\'s two lines, where today shrinks them to 9.71 to keep one',
    condition:
      "align: v2 draws the unit at the original's size on the original's line count on the page, every line where TeX's alignment puts it (within the position floor) but its last, which holds one character and starts at the unit's own margin (its first original line's start, within the floor)",
    holds(d, x) {
      if (d.flag !== 'align' || !d.unit) return false
      const u = x.unit(d)
      const v = u?.sides?.v2
      if (!v || v.lines !== v.olines || !atOriginal(v)) return false
      const ol = (x.member(u.part)?.lines ?? []).filter((l) => l[0] === x.n)
      const lines = (x.rec.v2?.units ?? []).filter((w) => w.id === u.part).flatMap((w) => w.lines.filter((l) => !l.rot && l.n > 0 && l.x0 !== null)).sort((a, b) => b.y - a.y)
      if (!ol.length || lines.length < 2) return false
      const floor = posFloor(v.osize)
      const last = lines.at(-1)
      if (last.n !== 1 || Math.abs(last.x0 - ol[0][2]) > floor) return false
      const label = x.member(u.part)?.label?.ink
      const inkX = (l) => l.x0 + (OPENING.test([...l.text].find((c) => !/\s|￼/u.test(c)) ?? '') ? 0.5 * l.size : 0)
      const starts = (ol.length > 1 ? ol.slice(1) : ol).map((l) => l[2])
      return lines.slice(0, -1).every((l, j) =>
        j === 0
          ? Math.abs(inkX(l) - ol[0][2]) <= floor || (label && Math.abs(l.x0 - label[1]) <= floor)
          : starts.some((s) => Math.abs(inkX(l) - s) <= floor),
      )
    },
  },
  {
    id: 'O',
    title: 'a translated figure text touching the figure where today keeps it English',
    verdict: ACCEPTED,
    words: null,
    example:
      '2610.21312v1-zh p5, Figure 2(c)\'s legend "(isotropic)": v2 draws it translated at the original\'s place and size, over the top of the orange bar (173 device px); today keeps it English',
    condition:
      "over, a figure text (and the page's figure texts as a whole): v2 draws it translated where today draws no translation of it (no group of today's joined to it: the original's ink), at the original's place (its anchor and alignment within the position floor) and size (within the size floor): the translation in the right place, its ink over the figure's; the page's figure texts covered where, less those texts' pixels, v2's count is within the measure's floor of today's",
    holds(d, x) {
      if (d.flag !== 'over' || !d.unit) return false
      if (d.unit === 'figure texts') {
        const ov = x.rec.px?.fidelity?.over
        if (!ov) return false
        let rest = d.v2?.value ?? 0
        for (const [k, px] of Object.entries(ov.v2 ?? {})) if (px > 0 && k.startsWith('p:') && inPlaceKept(Number(k.slice(2)), x)) rest -= px
        return rest !== d.v2?.value && rest - (d.today?.value ?? 0) <= OVER_MIN
      }
      const key = d.unit.split(' ')[0]
      return key.startsWith('p') && inPlaceKept(Number(key.slice(1)), x)
    },
  },
  {
    id: 'A2',
    title: "a reference's next line set flush where the original indents it, as today's",
    verdict: ACCEPTED,
    words: null,
    example:
      "2610.10069v1-zh p27 t238 (every switch on): its second line starts 11.7 pt left of the original's indented one on both sides; today's is a row of crops alone, which the measure gave no reading",
    condition:
      "align: each line of v2's that stands off the original's line starts by more than the position floor has a line of today's on the same row that is a row of crops alone (no text: the alignment measure reads no start of it) whose first crop starts where v2's line's ink starts (within the floor): both sides set the line alike, the measure read today's not at all",
    holds(d, x) {
      if (d.flag !== 'align' || !d.unit) return false
      const u = x.unit(d)
      if (!u?.sides?.v2 || (u.align !== 'j' && u.align !== 'l')) return false
      const ol = (x.member(u.part)?.lines ?? []).filter((l) => l[0] === x.n)
      const lines = (x.rec.v2?.units ?? []).filter((w) => w.id === u.part).flatMap((w) => w.lines.filter((l) => !l.rot && l.n > 0 && l.x0 !== null)).sort((a, b) => b.y - a.y)
      if (!ol.length || !lines.length) return false
      const floor = posFloor(u.sides.v2.osize)
      const label = x.member(u.part)?.label?.ink
      const starts = (ol.length > 1 ? ol.slice(1) : ol).map((l) => l[2])
      const off = lines.filter((l, j) =>
        j === 0 ? Math.abs(l.x0 - ol[0][2]) > floor && !(label && Math.abs(l.x0 - label[1]) <= floor) : !starts.some((s) => Math.abs(l.x0 - s) <= floor),
      )
      if (!off.length) return false
      const tid = Number(u.key.slice(1))
      const tLines = (x.rec.today?.units ?? []).filter((w) => w.id === tid).flatMap((w) => w.lines)
      const tCrops = (x.rec.today?.crops ?? []).filter((c) => c[0] === tid)
      return off.every((l) => {
        const row = tLines.find((t) => Math.abs(t.y - l.y) <= 0.5 * l.size)
        if (!row || row.n > 0) return false
        const on = tCrops.filter((c) => c[2] < row.y + 0.8 * l.size && c[4] > row.y - 0.2 * l.size)
        return on.length > 0 && Math.abs(Math.min(...on.map((c) => c[1])) - l.x0) <= floor
      })
    },
  },
]
/** the classes he accepted that hold no page of the sheets the rulings were read against (round B13): no entry */
export const NO_PAGE_LEFT = [
  { id: 'W', title: 'figure text drawn lighter', words: '我看到你好像在小标题加粗的地方已经修了呀？没有看到什么肉眼可见的问题', why: "the gate's correction 10 (verification/gate-corrections.md): the `weight` measure reads each class's ink at another weight than the original's; both pages left worse before it (2608.25210 p2, 2609.20976 p11) are not worse" },
]

/** a figure member v2 draws translated, at the original's place and size, where today draws no translation of it (the O ruling) */
function inPlaceKept(ord, x) {
  if (!/figure/.test(x.member(ord)?.kind ?? '') || x.figurePairs.has(ord)) return false
  if (!(x.rec.v2?.units ?? []).some((u) => u.id === ord && u.lines.some((l) => l.n > 0))) return false
  const v = x.p.units?.find((u) => u.part === ord)?.sides?.v2
  if (!v?.anchor || !v.align || !atOriginal(v)) return false
  const floor = posFloor(v.osize)
  return v.anchor.off <= floor && v.align.off <= floor
}

/**
 * The paper's pass of the owner's rulings: each difference of `pages` worse by its measure (and not judged on the fresh rule's
 * re-lay: `relaid`, which the re-lay's own pass covered, verdict.mjs freshResolve) that a ruling's condition holds for is
 * covered (`worse` false, `covered` the ruling's id, its measure's `nearer` kept); each page counted again. `recOf(n)` the
 * drawing's record of page n as measured (the re-lay's merged in for its pages), `v2` the pair's v2 file, `laid` the v2 Pages
 * laid (n -> Page), `unsqueezed` the lay with no CJK line squeezed (n -> ord -> lines)
 */
export function rulingsPass(pages, { recOf, v2, laid, unsqueezed }, recount) {
  // (each unit's line count over the paper's pages: today's drawn, v2's laid, and with no CJK line squeezed)
  const todayLines = new Map()
  for (const p of pages) for (const u of p.units ?? []) if (typeof u.sides?.today?.lines === 'number') todayLines.set(u.key, (todayLines.get(u.key) ?? 0) + u.sides.today.lines)
  const laidOf = (ord) => Object.values(laid ?? {}).reduce((n, pg) => n + (pg?.members ?? []).filter((m) => m.ord === ord).reduce((k, m) => k + (m.lines?.length ?? 0), 0), 0)
  const unsqueezedOf = (ord) => Object.values(unsqueezed ?? {}).reduce((n, pg) => n + (pg?.[ord] ?? 0), 0)
  for (const p of pages) {
    if (p.error) continue
    const rec = recOf(p.page)
    if (!rec) continue
    const facts = new Map((v2.facts?.[p.page]?.members ?? []).map((m) => [m.ord, m]))
    const x = {
      p,
      n: p.page,
      rec,
      v2,
      figurePairs: new Map(p.figurePairs ?? []),
      unit: (d) => p.units?.find((u) => u.key === d.unit.split(' ')[0]),
      member: (ord) => facts.get(ord) ?? Object.values(v2.facts ?? {}).flatMap((f) => f.members ?? []).find((m) => m.ord === ord),
      squeezeSaved: (u) => {
        if (!unsqueezed) return false
        const un = unsqueezedOf(u.part),
          own = laidOf(u.part),
          today = todayLines.get(u.key) ?? null
        return today !== null && un > own && un >= today
      },
    }
    let moved = false
    for (const d of p.diffs ?? []) {
      if (!d.worse || d.relaid || d.covered) continue
      const r = RULINGS.find((q) => q.holds?.(d, x))
      if (!r) continue
      d.worse = false
      d.covered = r.id
      moved = true
    }
    if (moved) recount(p)
  }
}

/** the rulings as the sheet and parity.json state them: each with the pages it covers and how many differences, and the classes
 *  accepted with no page left */
export function rulingsOf(pages) {
  return {
    date: DATE,
    seen: SEEN,
    general: GENERAL,
    rulings: RULINGS.map(({ holds: _h, ...r }) => {
      const on = pages.filter((p) => p.diffs?.some((d) => d.covered === r.id))
      return { ...r, pages: on.map((p) => `${p.pair} p${p.page}${p.worse ? ' (worse beside it)' : ''}`), differences: on.reduce((k, p) => k + p.diffs.filter((d) => d.covered === r.id).length, 0) }
    }),
    noPageLeft: NO_PAGE_LEFT,
  }
}
