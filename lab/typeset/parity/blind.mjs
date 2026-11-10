// lab/typeset/parity/blind.mjs: two measures for defects today and v2 share, which a verdict of v2 against today cannot see
// (lane parity-blind, 2026-11-09: the maintainer found them by eye, both sides alike). Each judges both sides against the
// original itself, v2 worse where it departs from it more than today does; where both depart, a `both` entry on the page (the
// shared defect, no verdict), listed on the sheet apart.
//   - scripts: the original's scripts (a run of arXiv's glyphs set smaller than its line's text and off its baseline: a
//     superscript, a subscript, a footnote or affiliation mark) a side draws flat or loses (2610.20967v1 p1: "Song-Ze Yu¹"
//     drawn by both with its mark on the baseline at the line's size; `size` is a unit's median, so a few marks vanish in it,
//     and `elements` reads an element's own two baselines, never a mark that is an element or a text alone);
//   - toggles: a unit the toggles keep the original's ("What to translate", docs/PDF-READER.md §15: under the defaults the
//     author block and the references) drawn translated, its class read off the original, never off either reader's
//     classification: an author block's unit holds an author's name where arXiv's metadata states it (the PDF's Info /Author,
//     which arXiv's GenPDF writes from the submission's metadata), at its first occurrence on arXiv's page; a reference is the
//     unit an anchor `cite.<key>` stands over (hyperref's \bibitem). The same page's names, translated by both with the author
//     toggle off: neither reader classed them as the author block (the class's own \name was in no role table), so `shown`, v2
//     against today, stayed silent. A unit neither fact names (a place, an e-mail, a paper without the metadata or without
//     hyperref) is not judged: no fact, no judgement.
// verdict.mjs's measurePage calls measureBlind with the page's drawing and its judging helpers; measure.mjs reads each paper's
// facts once (originalFacts off arXiv's PDF, keptFacts over the drawing's glyphs and both readers' lines of their units).
import { CLASS_DEFAULTS } from '../../../packages/reader/src/compose/classes.ts'
import { ACCENT, KEPT_SHARE, runsIn, SCRIPT_SIZE } from './fidelity.mjs'

/** a script stands off its line's baseline: TeX shifts one by its math font's sub1 at the least (a subscript alone; cmsy10's
 *  fontdimen 16, 0.15 em: 2610.30034v1 p7's S_J 1.49 pt under its 9.96 pt line), read at half of it, far above the readings'
 *  rounding (0.01 pt); smaller too (SCRIPT_SIZE: scriptstyle is 0.7 of the text's), so a faked small capital on the baseline is
 *  none */
const SHIFT = 0.075
/** and never under half its line's text: LaTeX's least size beside a text (\scriptscriptstyle, \tiny: half of it in the standard
 *  sizes), less PDF.js's rounding; a figure's own 1.18 pt text standing in a paragraph's line (2602.23285v2 p9) is no script */
const LEAST = 0.45
/** a script's run stands by its nucleus's (or another script's): TeX sets no glue between a nucleus and its scripts, a kern at
 *  most, and a footnote's label at most a word space from its text (2610.22065v1 p1's "* Corresponding author", 0.3 em): no
 *  wider apart than a word space at its widest natural (cmr10's interword space and stretch, 0.5 em); an author's place set a
 *  column beside the name (2609.36054v2 p1, 5 em) is none */
const TOUCH = 0.5
/** a run raised or lowered off its line stands within this share of the line's size of its baseline (verdict.mjs `raised`): TeX
 *  raises a superscript by sup1 (0.413 em in cmsy10) at the most beside a nucleus of a line's height */
const RAISED_REACH = 0.6
/** the classes of "What to translate" a fact of the original names (a unit's class: its toggle, the reader's TOGGLE_OF) */
const FACT_CLASSES = ['names', 'references']
/** a text by its letters and digits, case and diacritics aside (NFKD, its marks dropped: an OT1 accent set apart, "So¨ren", and a
 *  composed "Sören" read alike), what a name and a drawn text are compared by */
export const plain = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLowerCase()
/** the character a string's index of its plain letters stands at in the string itself (the inverse of `plain`, per run) */
function plainIndex(s) {
  const at = []
  ;[...String(s ?? '')].forEach((ch, i) => {
    for (let j = 0; j < plain(ch).length; j++) at.push(i)
  })
  return at
}
/** whether `a`'s characters stand in `b` in their order (a subsequence): a drawn text that holds nothing but the original's
 *  letters and digits, in the original's order (its elements cut as crops, drawn as nothing in its text) */
function within(a, b) {
  let j = 0
  for (const ch of a) {
    j = b.indexOf(ch, j)
    if (j < 0) return false
    j++
  }
  return true
}
const r2 = (v) => (v === null || v === undefined ? v : Math.round(v * 100) / 100)

// ---------------------------------------------------------------- scripts
/** the characters a reader reads in a run (letters, digits, marks, punctuation, symbols): a glyph PDF.js maps to no text (a
 *  private-use or a control character: a rule's piece, a delimiter's segment, 2610.10069v1 p12) is none */
const read = (s) => [...String(s ?? '')].filter((ch) => /[\p{L}\p{N}\p{M}\p{P}\p{S}]/u.test(ch)).length

/**
 * The original's scripts in a unit's lines on the page: the runs of arXiv's glyphs (render.mjs's PDF.js runs [x0, y0, x1, y1,
 * base, size, font, text, turned]) whose middle stands in one of `lines` ({x0, x1, y, top, bottom, size}: the unit's original
 * lines), each set smaller than its line's text (under SCRIPT_SIZE of it, and at LEAST of it or more) and off its baseline (SHIFT
 * of its size or more, within RAISED_REACH of it, as a side's drawn script is read: a big operator of the math extension font,
 * hung from a reference point TeX sets near its top, 2610.10069v1 p10's ∑ 0.67 of its line's size over it, and a numerator TeX
 * lifts over a tall one stand past it, no mark a translation carries): TeX's script. A line's text is TeX's line: its
 * baseline and size as the part (or today's prepare dump) states them, never the size most of its characters take (a line of a
 * fraction's numerator and denominator, 2608.25210v2 p9) and its baseline the one A's characters at that size stand on; an accent
 * set apart is no script, a turned run none. Each script: its
 * box (PDF.js's run, its advance from 0.2 of its size under its baseline to 0.8 over: a big operator of the math extension font,
 * hung from a reference point TeX sets near its top, stands over its ink, 2610.10069v1 p10's ∑), baseline, size, its rise off
 * the line's baseline (up positive), its characters (those a reader reads), its text. A script touches its nucleus (TOUCH): a
 * smaller text set a column away, an author's place beside the name (2609.36054v2 p1), is none
 */
export function scriptsOf(runs, lines) {
  const out = []
  const seen = new Set()
  for (const l of lines ?? []) {
    const box = [l.x0, l.bottom ?? l.y - 0.2 * l.size, l.x1, l.top ?? l.y + 0.8 * l.size]
    const rs = runsIn(runs, [box]).filter((r) => !r[8] && !seen.has(r) && read(r[7]))
    for (const r of rs) seen.add(r)
    const most = (key, list) => {
      const by = new Map()
      for (const r of list) by.set(key(r), (by.get(key(r)) ?? 0) + read(r[7]))
      return [...by].sort((a, b) => b[1] - a[1])[0]?.[0]
    }
    // (the line's text: TeX's line, the size the part states it at (a line stated with no size: the size most of its characters on
    // A are set at), and the baseline most of A's characters at that size stand on (the part's where none is: a line whose stated
    // baseline is a script's, 2610.21880v1 p5's cell, is read by its text all the same)
    const size = l.size > 0 ? l.size : most((r) => r2(r[5]), rs)
    if (!size) continue
    const base =
      most(
        (r) => r2(r[4]),
        rs.filter((r) => Math.abs(r[5] - size) <= 0.01),
      ) ?? l.y
    if (!Number.isFinite(base)) continue
    const off = (r) => r[5] < SCRIPT_SIZE * size && r[5] >= LEAST * size && Math.abs(r[4] - base) >= SHIFT * size && Math.abs(r[4] - base) < RAISED_REACH * size && !ACCENT.test(r[7])
    // (a script touches its nucleus, or a script that does: TeX sets no glue between them, a kern at most; a smaller text a
    // column away, an author's place beside the name, is none)
    const touch = (a, b) => Math.max(a[0], b[0]) - Math.min(a[2], b[2]) < TOUCH * size
    const held = new Set(rs.filter((r) => !off(r)))
    const scripts = new Set()
    for (let grew = true; grew; ) {
      grew = false
      for (const r of rs)
        if (off(r) && !scripts.has(r) && [...held, ...scripts].some((q) => touch(r, q))) {
          scripts.add(r)
          grew = true
        }
    }
    for (const r of rs) if (scripts.has(r)) out.push({ box: [r[0], r[1], r[2], r[3]], base: r[4], size: r[5], rise: r[4] - base, n: read(r[7]), text: r[7] })
  }
  return out
}

/** a side's drawn line set smaller than another of the unit's and off its baseline, within its reach: a run drawn as a script
 *  (measure-dom reads a line a baseline, so a raised run is a line of its own) */
const raisedOver = (l, ls) =>
  ls.find((h) => h !== l && l.size < SCRIPT_SIZE * h.size && Math.abs(l.y - h.y) >= SHIFT * h.size && Math.abs(l.y - h.y) < RAISED_REACH * h.size)
/** whether a script's run meets a box of A's ink (a crop's source, a kept element's ink): its middle across, its box up and down
 *  (a run's box is its advance's, not its ink's: a big operator's stands over its ink) */
const inBox = (s, b) => {
  const x = (s.box[0] + s.box[2]) / 2
  return x >= b[0] - 0.5 && x <= b[2] + 0.5 && s.box[1] < b[3] + 0.5 && s.box[3] > b[1] - 0.5
}
/** whether a crop as a side drew it (`c`: its source box on A, its drawn bottom, its scale, the drawn line it stands on) sets a
 *  script of its source as a script: the script's baseline in the drawn crop off that line's baseline by SHIFT of the line's size
 *  or more on the side A sets it, its drawn size under SCRIPT_SIZE of the line's; a crop on no drawn line sets it as A did */
function cropSets(c, s) {
  if (!c.host) return true
  const rise = c.y0 + c.k * (s.base - c.src[1]) - c.host.y
  return Math.abs(rise) >= SHIFT * c.host.size && Math.sign(rise) === Math.sign(s.rise) && c.k * s.size < SCRIPT_SIZE * c.host.size
}

/**
 * The page's record of the scripts measure (`out.blind`), judged over the paper by scriptsPass: each unit either side lays on
 * the page with the original's scripts on its lines here (scriptsOf), each side's units laid here (its translation erases their
 * lines here: drawn, or v2's member laid), its text drawn as scripts (raised or lowered and smaller off a line of the unit, its
 * characters per unit), its crops (each with its source page and box on A, as drawn: on this page or another, a translation
 * flowing its text over a page break: 2608.16117v1 p3's "(·)′" set on page 4 by both), the boxes of the elements whose ink it
 * keeps in place (the original's as TeX set it: a display inside a theorem, 2610.30034v1 p7) and its own lines of the unit on A
 * (the ink its translation takes; a script outside them it never erased)
 */
function scriptsRecord(c, keys, linesOf, keptOf) {
  const { n, rec, orig, keyOfPart, laidV2 } = c
  const runs = rec.original?.runs ?? null
  const units = {}
  if (runs)
    for (const key of keys) {
      const o = orig.get(key)
      if (!o?.lines.length) continue
      const scripts = scriptsOf(runs, o.lines)
      if (scripts.length) units[key] = { name: `${key} ${o.kind ?? ''}`.trim(), scripts: scripts.map(({ box, base, size, rise, n, text }) => ({ box, base, size, rise, n, text })) }
    }
  const laid = { today: [], v2: [] },
    raised = { today: {}, v2: {} },
    crops = { today: [], v2: [] },
    skip = []
  for (const key of keys) {
    const lt = linesOf('today', key)
    if (lt === undefined) skip.push(key)
    for (const [side, ls] of [['today', lt], ['v2', linesOf('v2', key)]]) {
      if (ls) {
        laid[side].push(key)
        const flat = ls.filter((l) => !l.rot && l.n > 0)
        const r = flat.filter((l) => raisedOver(l, flat)).reduce((s, l) => s + l.n, 0)
        if (r) raised[side][key] = r
      }
    }
  }
  for (const ord of laidV2?.keys() ?? []) if (!laid.v2.includes(keyOfPart(ord))) laid.v2.push(keyOfPart(ord))
  for (const side of ['today', 'v2']) {
    const lines = new Map()
    for (const u of rec[side].units ?? []) {
      const key = side === 'today' ? `t${u.id}` : keyOfPart(u.id)
      lines.set(key, [...(lines.get(key) ?? []), ...u.lines.filter((l) => !l.rot && l.n > 0)])
    }
    for (const cr of rec[side].crops ?? []) {
      if (cr.length < 11 || cr[6] === null) continue
      const key = side === 'today' ? `t${cr[0]}` : keyOfPart(cr[0])
      const ls = lines.get(key) ?? []
      const mains = ls.filter((l) => !raisedOver(l, ls))
      const held = (l) => Math.min(cr[4], l.y + 0.8 * l.size) - Math.max(cr[2], l.y - 0.2 * l.size)
      const meets = mains.filter((l) => held(l) > 0)
      const host = meets.length ? meets.reduce((a, b) => (held(b) > held(a) ? b : a)) : null
      crops[side].push({ key, page: cr[10], src: [cr[6], cr[7], cr[8], cr[9]], y0: cr[2], k: (cr[3] - cr[1]) / Math.max(1e-6, cr[8] - cr[6]), host: host ? { y: host.y, size: host.size } : null })
    }
  }
  // (each side's own lines of the unit on A, the ink its translation erases: today's its prepare dump's, v2's the part's; a script
  // outside them is the original's ink it never took, in place: 2602.23285v2 p1's ♠ before today's line of the affiliation)
  const own = { today: {}, v2: {} }
  const box = (l) => [l.x0, l.bottom, l.x1, l.top]
  for (const key of Object.keys(units)) {
    const t = key.startsWith('t') ? c.prepByOrd?.get(Number(key.slice(1))) : undefined
    const tl = (t?.lines ?? []).filter((l) => l.page === n && !l.rot).map((l) => [l.x0, Math.min(l.top, l.bottom), l.x1, Math.max(l.top, l.bottom)])
    if (tl.length) own.today[key] = tl
    own.v2[key] = orig.get(key).lines.map(box)
  }
  return { page: n, units, laid, raised, crops, own, kept: { today: Object.fromEntries(keptOf.today), v2: Object.fromEntries(keptOf.v2) }, skip }
}

/**
 * The scripts measure over a paper's pages (each page's `blind` record, scriptsRecord's), its differences, `both` entries and
 * faults written again on each page (the page's own, measurePage's, replaced): a side's script characters on a page carried as
 * scripts are those in the ink it keeps there or never takes (outside its own lines of the unit), those its crops set as scripts
 * wherever it draws them (cropSets), then its text
 * drawn as scripts (raised or lowered and smaller), on the page itself first and what is left of it over the unit's other pages
 * in their order (its text flows over the page break as its crops do); a page whose lines of the unit a side does not lay keeps
 * the original's scripts there. Each page with scripts the side lays departs by those not carried. `recount` (verdict.mjs's) is
 * called on every page
 */
export function scriptsPass(pages, recount = null) {
  const what = "the original's scripts (raised or lowered and smaller: a footnote or affiliation mark, a superscript) drawn flat or lost: characters"
  const keys = new Set()
  for (const p of pages) {
    p.diffs = p.diffs.filter((d) => d.flag !== 'scripts')
    if (p.both) p.both = p.both.filter((d) => d.flag !== 'scripts')
    if (p.faults) delete p.faults.scripts
    for (const k of Object.keys(p.blind?.units ?? {})) keys.add(k)
  }
  const skip = new Set(pages.flatMap((p) => p.blind?.skip ?? []))
  for (const key of keys) {
    if (skip.has(key)) continue
    const on = pages.filter((p) => p.blind?.units[key]).sort((a, b) => a.page - b.page)
    const out = { today: new Map(), v2: new Map() }
    for (const side of ['today', 'v2']) {
      const crops = pages.flatMap((p) => (p.blind?.crops[side] ?? []).filter((c) => c.key === key))
      const left = new Map()
      for (const p of on) {
        if (!p.blind.laid[side].includes(key)) continue
        const kept = p.blind.kept[side][key] ?? []
        const own = p.blind.own?.[side]?.[key]
        let u = 0
        for (const s of p.blind.units[key].scripts) {
          if (kept.some((b) => inBox(s, b)) || (own && !own.some((b) => inBox(s, b)))) continue
          // (a crop whose source meets the script and sets it as a script: an element's ink cut as one crop, or as several)
          if (crops.some((c) => c.page === p.page && inBox(s, c.src) && cropSets(c, s))) continue
          u += s.n
        }
        left.set(p, u)
      }
      // (its text drawn as scripts: on the page itself first, then what is left of it over the unit's other pages)
      let spare = 0
      for (const p of pages) {
        const r = p.blind?.raised[side][key] ?? 0
        if (!r) continue
        const u = left.get(p) ?? 0
        left.set(p, Math.max(0, u - r))
        if (left.has(p)) spare += Math.max(0, r - u)
        else spare += r
      }
      for (const p of on) {
        if (!left.has(p) || !spare) continue
        const take = Math.min(spare, left.get(p))
        left.set(p, left.get(p) - take)
        spare -= take
      }
      for (const p of on) out[side].set(p, left.get(p))
    }
    for (const p of on) {
      const u = p.blind.units[key]
      const total = u.scripts.reduce((s, x) => s + x.n, 0)
      const at = (side) => {
        const d = out[side].get(p)
        return d === undefined ? { value: "the original's", off: 0 } : { value: `${total - d} of ${total} drawn as scripts`, off: d }
      }
      const t = at('today'),
        v = at('v2')
      if (t.value === "the original's" && v.value === "the original's") continue
      for (const [side, x] of [['today', t], ['v2', v]]) {
        if (!x.off) continue
        const f = (p.faults.scripts ??= { today: 0, v2: 0, todaySays: [], v2Says: [] })
        f[side]++
        const says = f[`${side}Says`]
        if (says.length < 6) says.push(`${u.name}: ${x.off} of ${total} script characters drawn flat or lost (${u.scripts.map((q) => q.text.trim()).join(' ')})`)
      }
      if (t.off && v.off) p.both.push({ flag: 'scripts', unit: u.name, what, original: total, today: t, v2: v })
      if (t.off !== v.off) p.diffs.push({ flag: 'scripts', unit: u.name, what, original: total, today: t, v2: v, nearer: v.off < t.off ? 'v2' : 'today', worse: v.off > t.off })
    }
  }
  if (recount) for (const p of pages) recount(p)
}

// ---------------------------------------------------------------- the original's facts of a unit's class
/**
 * arXiv's PDF read for the facts of the classes the toggles keep (PDF.js over `data`, its bytes): the authors arXiv's metadata
 * names (the Info dictionary's /Author, which arXiv's GenPDF writes from the submission's metadata, its names "; " apart; empty
 * on a PDF made before it stamped them, and then no author is read) and every anchor hyperref names `cite.<key>` (its
 * \bibitem's: an XYZ destination, its page and point)
 */
export async function originalFacts(data) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(data), verbosity: 0, isEvalSupported: false })
  const doc = await task.promise
  try {
    const info = (await doc.getMetadata())?.info ?? {}
    const authors = String(info.Author ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => plain(s))
    const dests = (await doc.getDestinations()) ?? {}
    const cites = []
    for (const [name, d] of dests instanceof Map ? dests : Object.entries(dests)) {
      if (!name.startsWith('cite.') || !Array.isArray(d) || d[1]?.name !== 'XYZ' || typeof d[2] !== 'number' || typeof d[3] !== 'number') continue
      let page
      try {
        page = typeof d[0] === 'number' ? d[0] + 1 : (await doc.getPageIndex(d[0])) + 1
      } catch {
        continue
      }
      cites.push({ page, x: d[2], y: d[3] })
    }
    cites.sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x)
    return { authors, cites }
  } finally {
    await task.destroy()
  }
}

/**
 * The units each fact names, by each reader's own lines of its units (geometry only: where a unit's lines stand on A, never its
 * kind): `authors` and `cites` originalFacts's, `pages` [{page, runs}] arXiv's glyphs as the drawing read them (PDF.js's runs in
 * its text content's order, which is TeX's), `today` and `part` [{ord, lines: [{page, x0, x1, y, top, bottom}]}] today's units
 * (its prepare dump) and the part's members.
 * - names: an author's name (letters and digits, case and diacritics aside) at its first occurrence in A's text, pages in order
 *   (\maketitle sets the author block before any text that could repeat a name); its place the middle of its characters, by
 *   their share of the run's advance (a PDF.js run holds no glyph's place: 2610.21106v1 p1 sets three units in one run); the
 *   unit whose line holds it. A name A never sets (initials, another spelling: "Yuni Xiang" for the page's "YUNI XIONG") is not
 *   found, and no unit is named for it.
 * - references: for each anchor, the unit whose line starts nearest below and right of it (the entry's first line, its text
 *   after its label; hyperref raises the anchor a \baselineskip over it, so the line stands half its size or more under it, and
 *   the entry before's last line at the anchor's height is not it: 1512.03385v1 p9's entries set with no space between them),
 *   nearest by the two distances' sum: the other column's line at the anchor's height is a column away. And every unit standing
 *   on those units' lines (each of its lines on one of them: its page, its baseline within half the line's height, inside that
 *   line's column, the extent across of the anchored units' lines on the page that overlap it): a line of TeX's paragraph is
 *   one entry's, and a reader that cut the entry draws its pieces there (2608.25210v2 p17: today's t518, the tail of [64] after
 *   its year on the entry's second line). Not merely at its height: an entry crossing columns or pages has lines in both
 *   columns, and a unit level with one of them in the other column is no piece of it (round 8's 1810.04805 p12 t195,
 *   2608.06701 p11 t283, 2610.22065 p7's 114).
 * Returns {names: {today, part}: ord -> the names it holds, references: {today, part}: the ords, found: the names found}
 */
export function keptFacts({ authors = [], cites = [], pages = [], today = [], part = [] }) {
  const unitsAt = (units, page, x, y) =>
    units.filter((u) => u.lines.some((l) => l.page === page && x >= l.x0 - 0.5 && x <= l.x1 + 0.5 && y >= l.bottom - 0.5 && y <= l.top + 0.5)).map((u) => u.ord)
  const names = { today: new Map(), part: new Map() }
  const found = []
  const streams = [...pages]
    .sort((a, b) => a.page - b.page)
    .map((p) => {
      let s = ''
      const at = []
      ;(p.runs ?? []).forEach((r, i) => {
        if (r[8]) return
        plainIndex(r[7]).forEach((c) => at.push([i, c]))
        s += plain(r[7])
      })
      return { page: p.page, runs: p.runs ?? [], s, at }
    })
  for (const a of authors) {
    const key = plain(a)
    if (!key) continue
    for (const st of streams) {
      const i = st.s.indexOf(key)
      if (i < 0) continue
      // (the name's middle character, placed by its share of its run's advance)
      const [ri, c] = st.at[i + (key.length >> 1)]
      const r = st.runs[ri]
      const len = [...r[7]].length
      const x = r[0] + ((r[2] - r[0]) * (c + 0.5)) / Math.max(1, len),
        y = (r[1] + r[3]) / 2
      for (const [side, units] of [['today', today], ['part', part]])
        for (const ord of unitsAt(units, st.page, x, y)) names[side].set(ord, [...(names[side].get(ord) ?? []), a])
      found.push(a)
      break
    }
  }
  const references = { today: new Set(), part: new Set() }
  for (const c of cites)
    for (const [side, units] of [['today', today], ['part', part]]) {
      let best = null
      for (const u of units)
        for (const l of u.lines) {
          if (l.page !== c.page || l.y > c.y - 0.5 * (l.size ?? l.top - l.bottom) || l.x0 < c.x - 0.5) continue
          const d = c.y - l.y + (l.x0 - c.x)
          if (!best || d < best.d) best = { d, ord: u.ord }
        }
      if (best) references[side].add(best.ord)
    }
  // (a unit standing on an entry's lines is the entry's too, a reader that cut it drawing its pieces there: each of its lines on
  // a line of an anchored unit (its page, its baseline) and inside that line's column, the bibliography's own extent there: the
  // extent across of the anchored units' lines on the page that overlap it across. Not the entry's whole extent: an entry
  // crossing columns or pages spans both columns, and a unit level with its line in the other column is no piece of it)
  for (const [side, units] of [['today', today], ['part', part]]) {
    const lines = units.filter((u) => references[side].has(u.ord)).flatMap((u) => u.lines)
    const onEntry = (l) =>
      lines.some((x) => {
        if (x.page !== l.page || Math.abs(x.y - l.y) > 0.5 * (x.size ?? x.top - x.bottom)) return false
        const column = lines.filter((o) => o.page === x.page && o.x0 < x.x1 && o.x1 > x.x0)
        return l.x0 >= Math.min(...column.map((o) => o.x0)) - 0.5 && l.x1 <= Math.max(...column.map((o) => o.x1)) + 0.5
      })
    for (const u of units) if (!references[side].has(u.ord) && u.lines.length && u.lines.every(onEntry)) references[side].add(u.ord)
  }
  return { names, references, found }
}

// ---------------------------------------------------------------- the page
/**
 * The two measures on one page (verdict.mjs's measurePage: `c` the page's context as measureFidelity takes it, `out` the page's
 * result, whose `diffs` and `both` they add to), `kept` keptFacts's (none: the toggles measure judges nothing), `toggles` the
 * reader's toggles the pages were laid and drawn under ('on': every switch on, nothing kept; else the defaults)
 */
export function measureBlind(c, out, { kept = null, toggles = 'defaults' } = {}) {
  const { n, rec, orig, keyOfPart, T, V, diff, fault } = c
  const runs = rec.original?.runs ?? null
  const kindOf = (key) => orig.get(key)?.kind ?? ''
  const name = (key) => `${key} ${kindOf(key)}`.trim()
  const both = (flag, unit, what, original, t, v) => out.both.push({ flag, unit, what, original, today: t, v2: v })
  // (each side's drawn lines of a unit as read back, by the unit's key: today's units by its ord, v2's by its part ord's
  // key; a figure text or a name v2 draws, which today draws in groups of its own, by the group joined to it)
  const rawOf = (side) => {
    const m = new Map()
    for (const u of rec[side].units ?? []) {
      const key = side === 'today' ? `t${u.id}` : keyOfPart(u.id)
      m.set(key, [...(m.get(key) ?? []), ...u.lines])
    }
    return m
  }
  const raw = { today: rawOf('today'), v2: rawOf('v2') }
  const apart = new Map()
  for (const [ord, gid] of c.figurePairs ?? new Map()) {
    const g = (rec.today.figures ?? []).find((x) => x.id === gid)
    if (g) apart.set(keyOfPart(ord), g.lines)
  }
  for (const [ord, gid] of c.namePairs ?? new Map()) {
    const g = (rec.today.names ?? []).find((x) => x.id === gid)
    if (g) apart.set(keyOfPart(ord), g.lines)
  }
  // (the boxes of a unit's elements whose ink a side shows in place, the original's as TeX set it (render.mjs reads how much of
  // each element's ink on A each side's drawing without its text shows there: KEPT_SHARE or more is kept): v2's the part's
  // El.ink, today's its prepare dump's segments)
  const shown = rec.px?.fidelity?.shown ?? null
  const keptHere = (side, id) => {
    const s = shown?.[side]?.[id]
    return !!s && s.ink > 0 && s.shown >= KEPT_SHARE * s.ink
  }
  const keptOf = { today: new Map(), v2: new Map() }
  for (const u of rec.today.units ?? [])
    for (const e of c.prepByOrd?.get(u.id)?.elements ?? [])
      if (keptHere('today', `${u.id}:${e.k}`))
        for (const g of (e.segs ?? []).filter((g) => g.page === n))
          keptOf.today.set(`t${u.id}`, [...(keptOf.today.get(`t${u.id}`) ?? []), [g.x0, Math.min(g.top, g.bottom), g.x1, Math.max(g.top, g.bottom)]])
  for (const u of rec.v2.units ?? [])
    for (const [k, , boxes] of c.facts?.get(u.id)?.els ?? [])
      if (keptHere('v2', `${u.id}:${k}`)) keptOf.v2.set(keyOfPart(u.id), [...(keptOf.v2.get(keyOfPart(u.id)) ?? []), ...boxes.map((b) => [b[0], b[1], b[2], b[3]])])
  const keys = [...new Set([...T.keys(), ...V.keys()])]
  /** a side's drawn lines of a unit, or null where it does not draw it (the original's ink stays): today's group of a figure text
   *  or name v2 draws; undefined where today may draw it in a group no box joins (not judged) */
  const linesOf = (side, key) => {
    if (side === 'v2') return V.has(key) ? (raw.v2.get(key) ?? []) : null
    if (T.has(key)) return raw.today.get(key) ?? []
    if (apart.has(key)) return apart.get(key)
    return /figure/.test(kindOf(key)) || kindOf(key) === 'name' ? undefined : null
  }

  // ---------------- scripts: the original's scripts on the lines of each unit a side lays here, recorded for the paper's pass
  // (a translation's text and crops flow over a page break), judged here as if the paper were this page
  out.blind = scriptsRecord(c, keys, linesOf, keptOf)
  scriptsPass([out])

  // ---------------- toggles: a unit the toggles keep the original's, by the original's facts, drawn translated
  const keep = new Set(toggles === 'on' ? [] : FACT_CLASSES.filter((k) => CLASS_DEFAULTS[k] === false))
  if (!kept || !runs || !keep.size) return
  const classOf = new Map()
  const classify = (map, cls) => {
    for (const ord of map.today instanceof Map ? map.today.keys() : map.today) classOf.set(`t${ord}`, classOf.get(`t${ord}`) ?? cls)
    for (const ord of map.part instanceof Map ? map.part.keys() : map.part) classOf.set(keyOfPart(ord), classOf.get(keyOfPart(ord)) ?? cls)
  }
  classify(kept.names, 'names')
  classify(kept.references, 'references')
  for (const key of keys) {
    const cls = classOf.get(key)
    if (!cls || !keep.has(cls)) continue
    const o = orig.get(key)
    const source = plain(
      runsIn(
        runs,
        (o?.lines ?? []).map((l) => [l.x0, l.bottom ?? l.y - 0.2 * l.size, l.x1, l.top ?? l.y + 0.8 * l.size]),
      )
        .map((r) => r[7])
        .join(''),
    )
    if (!source) continue
    const side = (ls) => {
      if (!ls) return { value: "the original's", off: 0 }
      const said = plain(ls.map((l) => l.text).join(''))
      return within(said, source) ? { value: "the original's words", off: 0 } : { value: 'translated', off: 1 }
    }
    const t = side(linesOf('today', key) ?? null),
      v = side(linesOf('v2', key))
    const what =
      cls === 'names'
        ? "an author's name (arXiv's metadata) drawn translated, the toggles keeping the author block the original's"
        : "a reference (hyperref's anchor) drawn translated, the toggles keeping the references the original's"
    for (const [s, x] of [['today', t], ['v2', v]]) if (x.off) fault(s, 'toggles', `${name(key)}: ${cls === 'names' ? 'an author block' : 'a reference'} drawn translated`)
    if (t.off && v.off) both('toggles', name(key), what, cls, t, v)
    else if (t.off !== v.off) diff('toggles', name(key), what, cls, t, v, v.off > t.off, v.off < t.off ? 'v2' : 'today')
  }
  // (a unit today translates that the toggles keep, by the original's fact: v2 leaving it the original's is the toggles' intent,
  // no translation missing. Its class is the fact, whether or not its words can be read against the original's runs: a piece of
  // an entry today cut apart stands on a run that is not its alone, 2608.25210v2 p17's t518)
  for (const d of out.diffs) {
    const key = String(d.unit).split(' ')[0]
    if (d.flag !== 'shown' || !d.worse || !d.what.startsWith('translated by today') || !keep.has(classOf.get(key))) continue
    d.worse = false
    d.nearer = 'v2'
    d.why = `the toggles keep it the original's (${classOf.get(key)}, by the original's fact): no translation missing`
  }
}
