// The ink units of our final pass (docs/route/orphan-text.md, stage 2): text TeX sets that no source unit owns — the running
// heads and feet, the contents and the lists, a note with no unit, prose the front end did not cut — made units from our own
// glyphs, so that it is translated and drawn as any unit. Read from the ledger's lines (layout/ledger.mjs: each line of glyphs
// no unit owns, in stream order, with its class), our pages' glyphs, and the paper's source units; nothing of arXiv's PDF, no
// position estimated: every coordinate is a glyph's our compile set.
//
// The rules (each tested):
//   1. the classes made units: heads (`inkheads`), contents (`inkcontents`), notes (`inknotes`), orphans (`inkorphan`), and a
//      biblatex entry's lines (`inkreferences`: the references' class where the compile's point `bi<n>` stands before the entry,
//      ledger.mjs `entry`, one entry a unit, its label the original's); a line of another class is never one;
//   2. a line's words: its glyphs left to right, a word ended where two stand a fifth of their size apart; a head's or a list's
//      line keeps its numbering and its page number the original's ink (a leading section number, a trailing run of leader
//      dots and a number: no unit's, never erased), so that a contents entry's title is drawn up to its leaders, where the
//      number stands apart from the line's text (APART: a folio, a section number's \quad, after leaders) or is a running
//      head's folio (its head's words recur on another page with another number there); a number in the text's own words is
//      the unit's ("… at ICLR 2021", the same on every page);
//   3. a unit: a head's line alone; the others' lines while they follow on one page and in one region, each within BLOCK_DY of
//      its size below the one before (PARA_DY within one of TeX's paragraphs: a list set double, an indent from the paragraph's
//      first line where the block begins on it) and meeting it across, and in
//      one paragraph of TeX's (ink.mjs `paras`: a contents entry, a note, a paragraph); where the compile marked none, a list's line with the next where it ends in no page number (an
//      entry continued), a note's or an orphan's while they follow;
//   4. inside a unit, a run of a math face's glyphs or of a typewriter face's is a placeholder (`math`, `url`): its ink kept,
//      its source the run's characters; a word that is a web address is one in whatever face (a note of an address alone
//      is then no unit);
//   5. echo: a unit whose letters (stream.mjs spellOf) and count of kept runs equal a source unit's letters and count of
//      visible placeholders (a heading first, then a caption, then any) takes that unit's pieces, each visible placeholder
//      placed by its kept run in turn, and is drawn with its row: the contents read as the headings they repeat, and no
//      translation is made for them; one that equals no source unit but an ink unit before it (a running head on every
//      page) echoes that one;
//   6. its rows as the layout maker writes a unit's (layout/make.mjs rowsOf): each line's box, baseline, size and face from its
//      glyphs, its erase rectangles merged as there, its frames by page and column with the room below each, a placeholder's
//      segments its glyphs' boxes, a head's line centred where TeX centred it on the page;
//   7. what it owns: its text glyphs `u<id>`, its placeholders' `u<id>.p` (own.mjs's groups), claimed in the wrap
//      (claimInk), every one a glyph no unit owned;
//   8. a block of notes or orphans whose letters are mostly an author unit's words (NAMES_SHARE) is its names (`inknames`): of
//      the names toggle, as the author block is, not always translated (REVTeX's names its marks do not own);
//   9. its style: the weight, slant and fill most of its text glyphs hold is the unit's, which the reader measures on them; a
//      run of words in another is a group of the commands that set it (`\textbf{`, `\textmd{`, `\textit{`, `\textup{`,
//      `\textcolor[HTML]{…}{`), as a source unit's are, so that its translation keeps each run's (a theorem's bold head before
//      its regular note, a coloured term: the release sweep of 2026-10-25, (d), drew them all in the unit's one style).
// Pure arithmetic; an original module (no port statement).
import { classifyFont } from '../layer-proto/fonts.mjs'
import { utf8 } from '../translate/mt.mjs'
import { classOf } from './marks.mjs'
import { lineRulesOf, OWN_WORK, RULE_EM } from './own.mjs'
import { spellOf } from './stream.mjs'

/** the ledger's classes made units, and each one's kind (rules/content-classes.mjs UNIT_CLASS gives the class back) */
export const INK_KIND = Object.freeze({ heads: 'inkheads', contents: 'inkcontents', notes: 'inknotes', orphan: 'inkorphan', names: 'inknames', references: 'inkreferences' })
/** a block of the names an author unit holds: this share of its letters, at least, in words of an author unit's (rule 8) */
export const NAMES_SHARE = 0.6
/** a block's next line: within this many of its size below the one before */
export const BLOCK_DY = 1.75
/** a paragraph's next line, where TeX's paragraphs are marked (`paras`): within this many of its size below the one before */
export const PARA_DY = 3
/** a line at a paragraph's first line's edge, within this many of its size across, is the next item of a list, not the paragraph's
 *  next line: more than a digit's width (a right-aligned label's: [9] and [10] start half a size apart, 2610.20266v1 p21), less
 *  than an em (the narrowest indent) */
export const EDGE = 0.75
/** and a line further across than this many of its size from the paragraph's first starts no line of it: past the widest hanging
 *  label or number measured (a bibliography's [26], 4 sizes; a list of figures' 2.3em), short of where a centred heading's list
 *  starts (2610.20266v1 p21's "REFERENCES", 20 sizes) */
export const INDENT = 6
/** two glyphs one word: closer than this share of their size */
const WORD_GAP = 0.12
/** a script: a glyph set at this share of its line's text size or less */
const SCRIPT = 0.85
/** a word that numbers a heading or an entry: 1, 1.2, A.3, IV, (a) */
const NUMBERING = /^\(?(?:\d{1,4}|[ivxlcdm]{1,6}|[IVXLCDM]{1,6}|[A-Z])(?:[.\-–](?:\d{1,4}|[A-Za-z]))*[.:)]?$/u
/** a page number at a line's end: arabic or roman */
const PAGE_NUMBER = /^(?:\d{1,4}|[ivxlcdm]{1,8})$/
/** a word that is a web address, a note's mark before it or not */
const URL_WORD = /(?:https?|ftp):\/\/|^\d{0,3}www\.[^\s.]+\.[a-z]/iu
/** a leader: dots alone */
const LEADER = /^[.·•…]+$/u
/** a number set apart from the word beside it, the page's own ink: more than this share of its size between them (a section
 *  number's \quad, an entry's number box, a folio's \hfil); a word space is a quarter to a third, after a full stop under a half */
const APART = 0.5
/** a line's erase rectangles at most, merged where they meet (layout/make.mjs MERGE, ERASE_MAX) */
const MERGE = 0.5, ERASE_MAX = 16
/** a placeholder's segments at most, an inline one's (layout/file.mjs SEGS_INLINE) */
const SEGS_INLINE = 4
/** the room below a frame where nothing is below it: to the page's foot, less this (layout/make.mjs FOOT) */
const FOOT = 36
/** a head's line centred: its middle within this of its page's, PDF units */
const CENTRE = 4
/** two of a unit's placeholder glyphs are one formula's where their boxes stand within this share of their size apart */
const PH_GAP = 0.3
const r2 = v => Math.round(v * 100) / 100
const PAIR = /\p{L}{2}/u

/** a text as the front end holds a source's: its UTF-8 bytes in a Latin-1 view (latex-front.mjs latin1, read back by mt.mjs utf8) */
const ENCODER = new TextEncoder()
function sourceView(s) {
  const b = ENCODER.encode(s)
  let out = ''
  for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
  return out
}

/** the font family of a face, read once a face */
function famOf(cache, name) {
  let f = cache.get(name)
  if (f === undefined) { f = classifyFont(name ?? '').fam; cache.set(name, f) }
  return f
}

/** a face's weight and slant, read once a face (fonts.mjs classifyFont) */
function faceOf(cache, name) {
  let f = cache.get(name)
  if (f === undefined) { const c = classifyFont(name ?? ''); f = { bold: c.bold, italic: c.italic }; cache.set(name, f) }
  return f
}
/** glyphs' style (rule 9): bold and italic where more than half of them are, in their faces' names, and the fill most of those
 *  whose fill is told hold (null where none is: a pattern, a stroke alone) */
function styleOfGlyphs(list, faces) {
  let bold = 0, italic = 0
  const fills = new Map()
  for (const x of list) {
    const f = faceOf(faces, x.font)
    if (f.bold) bold++
    if (f.italic) italic++
    if (Number.isInteger(x.fill) && x.fill >= 0) fills.set(x.fill, (fills.get(x.fill) ?? 0) + 1)
  }
  let fill = null, most = 0
  for (const [v, c] of fills) if (c > most) { most = c; fill = v }
  return { bold: 2 * bold > list.length, italic: 2 * italic > list.length, fill }
}
/** a word's style: its glyphs' */
const wordStyle = (G, gs, faces) => styleOfGlyphs(gs.map(g => G[g]), faces)
/** a unit's style: its text words' glyphs' */
const baseStyleOf = (lines, pages, faces) => styleOfGlyphs(lines.flatMap(l => l.words.filter(w => w.fam === 'text').flatMap(w => w.gs.map(g => pages[l.page - 1].glyphs[g]))), faces)
/** a style as a run tells it: a fill not told is the unit's */
const styleKey = (st, base) => `${st.bold ? 1 : 0}${st.italic ? 1 : 0}${st.fill ?? base.fill}`
/** the groups a run of words opens where its style is not the unit's, outermost first: its colour (xcolor's \textcolor, the
 *  fill its glyphs hold, which the reader measures on them), its weight, its slant (layer2.mjs STYLE_CMDS reads each) */
function groupsOf(st, base) {
  const out = [], fill = st.fill ?? base.fill
  if (fill !== null && fill !== base.fill) out.push(`\\textcolor[HTML]{${fill.toString(16).padStart(6, '0').toUpperCase()}}{`)
  if (st.bold !== base.bold) out.push(st.bold ? '\\textbf{' : '\\textmd{')
  if (st.italic !== base.italic) out.push(st.italic ? '\\textit{' : '\\textup{')
  return out
}

/** a kept run's placeholder source: a formula of its characters, or an address */
const phSource = (fam, text) => sourceView(fam === 'math' ? `$${text.replace(/[$\\{}]/g, '')}$` : `\\url{${text.replace(/[\\{}]/g, '')}}`)
/** a line's words, left to right: { gs (glyph indices), text, fam (math, mono, or text) } */
function wordsOf(G, gs, fams) {
  const order = [...gs].filter(g => G[g] && !G[g].blank && /\S/u.test(G[g].u ?? '')).sort((a, b) => G[a].x0 - G[b].x0)
  const out = []
  // (the line's text size, the one most of its glyphs have: a script set smaller than it, raised or lowered, is no text of the
  // line's but its formula's — C_n²'s "2", a text face's digit, drawn on the baseline as a word of the translation, 2610.19274v1)
  const sizes = new Map()
  for (const g of order) { const z = Math.round(G[g].size * 10) / 10; sizes.set(z, (sizes.get(z) ?? 0) + 1) }
  let body = 0, most = 0
  for (const [z, n] of sizes) if (n > most) { most = n; body = z }
  let cur = null, prev = null
  for (const g of order) {
    const x = G[g], f = famOf(fams, x.font)
    let fam = f === 'math' ? 'math' : f === 'mono' ? 'mono' : 'text'
    if (fam === 'text' && cur?.fam === 'math' && prev !== null && x.size < SCRIPT * body && Math.abs(x.y - G[prev].y) < body && x.x0 - G[prev].x1 <= WORD_GAP * body && !/\p{L}{2}/u.test(x.u ?? '')) fam = 'math'
    if (!cur || (prev !== null && x.x0 - G[prev].x1 > WORD_GAP * Math.max(x.size, G[prev].size)) || cur.fam !== fam) { cur = { gs: [], text: '', fam }; out.push(cur) }
    cur.gs.push(g); cur.text += x.u
    prev = g
  }
  // (an address set in the text's face, \urlstyle{same}: a typewriter run as any, kept, rule 4)
  for (const w of out) if (w.fam === 'text' && URL_WORD.test(w.text)) w.fam = 'mono'
  return out
}

/** whether two words of a line, `w` left of `v`, stand APART */
function apart(G, w, v) {
  let r = -Infinity, l = Infinity, size = 0
  for (const g of w.gs) { r = Math.max(r, G[g].x1); size = Math.max(size, G[g].size) }
  for (const g of v.gs) { l = Math.min(l, G[g].x0); size = Math.max(size, G[g].size) }
  return l - r > APART * size
}

/** whether word `v` begins a word's gap (WORD_GAP) after word `w` before it on its line, as wordsOf cuts a word by its gap, not
 *  by its face alone */
function gapBefore(G, w, v) {
  let r = -Infinity, l = Infinity, size = 0
  for (const g of w.gs) { r = Math.max(r, G[g].x1); size = Math.max(size, G[g].size) }
  for (const g of v.gs) { l = Math.min(l, G[g].x0); size = Math.max(size, G[g].size) }
  return l - r > WORD_GAP * size
}

/** a head's line's number at its end (`b`) or its start (`a`), keyed by the line's other words: the numbers set there wherever
 *  those words recur */
const folioKey = (words, side) => `${side}|${(side === 'b' ? words.slice(0, -1) : words.slice(1)).map(w => w.text).join(' ')}`

/** a list's or a head's line less its numbering and its page number: [kept words, whether it ended in a page number]. A number is
 *  the page's own ink only where it stands apart from the line's text, a folio or a numbering, or is a running head's folio (its
 *  head's words recur on another page with another number there, `folios`); one in the text's own words is the unit's, translated
 *  in its flow ("Published as a conference paper at ICLR 2021", 2010.11929v2's head on every page: its year was left the
 *  original's ink and drawn apart from its line) */
function trimmed(G, words, cls, folios = null) {
  if (cls !== 'heads' && cls !== 'contents') return [words, false]
  let a = 0, b = words.length
  let ended = false
  // (a running head's folio however close TeX set it: amsart's \llap{\thepage} after a title as wide as the line, its two digits
  // nearer its last word than its words are to each other, 2610.21884v1)
  const folio = side => cls === 'heads' && !!folios?.has(folioKey(words, side))
  // (its page number: its last word, one number, after its leaders, set apart from the text before it or a running head's folio)
  if (b - 1 > a && PAGE_NUMBER.test(words[b - 1].text) && (LEADER.test(words[b - 2].text) || apart(G, words[b - 2], words[b - 1]) || folio('b'))) { ended = true; b-- }
  // (its leaders: dots each a word a word's gap from the one before it, \@dottedtocline's \mkern\@dotsep; a stop that abuts the
  // word before it, a word of its own by its face alone, is the sentence's: "… strength $C_n^2$." in 2610.19274v1's list of
  // figures, which was left the original's ink beside the drawn entry)
  while (b > a && LEADER.test(words[b - 1].text) && (b - 1 === a || gapBefore(G, words[b - 2], words[b - 1]))) b--
  // (its numbering, set apart from the text after it: a section number, an entry's in its box; a head's even page's folio)
  while (a < b - 1 && NUMBERING.test(words[a].text) && words[a].fam === 'text' && apart(G, words[a], words[a + 1])) a++
  if (cls === 'heads' && a === 0 && a < b - 1 && PAGE_NUMBER.test(words[a].text) && folio('a')) a++
  return [words.slice(a, b), ended]
}

/** a source unit's echo key: the letters of its text pieces (stream.mjs spellOf; its text the source's bytes in a Latin-1 view,
 *  latex-front.mjs, read as UTF-8 first: mt.mjs utf8) and the count of its visible placeholders (marks.mjs classOf: one that sets
 *  ink), where its pieces are text, placeholders and a group's open and close alone (no nested unit); null else */
function echoKey(u) {
  if (!u?.pieces?.every(p => p.t === 'text' || p.t === 'ph' || p.t === 'open' || p.t === 'close')) return null
  const s = spellOf(utf8(u.pieces.filter(p => p.t === 'text').map(p => p.s ?? '').join(' ')))
  return s.length < 4 ? null : `${s}#${u.pieces.filter(p => p.t === 'ph' && classOf(p) !== null).length}`
}
const ECHO_ORDER = { heading: 0, caption: 1 }

/**
 * The ink units of a document. `pages` as the wrap reads them (layout/wrap.mjs: each glyph { u, x0, x1, ix0, ix1, y, size, top,
 * bottom, font, blank? }, its points, its view); `ledger` ledgerOf's over them (its `lines`); `units` the paper's source units,
 * their ids their indices, or null (no echo). Ids from `from` on: the bundle's units before them, the source units' and the
 * paper's structural names' (layer-proto/units.mjs bundleUnitsOf), units.length where it is not given. Returns [{ id, kind, cls, echo, pieces, glyphs: { text:
 * [[page, g]], ph: [[page, g]] }, rows: { unit: [id, kind, depth, flags, pieces], lines (8 a line, the face's name at 7),
 * frames, erase, ph } }]
 */
export function inkUnitsOf(pages, ledger, { units = null, from = null } = {}) {
  const fams = new Map(), faces = new Map()
  const base = Number.isInteger(from) && from >= (units?.length ?? 0) ? from : units?.length ?? 0
  // the source units an ink unit may echo, by their letters
  const echoOf = new Map()
  if (units) units.forEach((u, i) => {
    const key = echoKey(u)
    if (key === null) return
    const at = echoOf.get(key)
    if (at === undefined || (ECHO_ORDER[u.kind] ?? 9) < (ECHO_ORDER[units[at].kind] ?? 9)) echoOf.set(key, i)
  })
  // each line of a class made units, its words trimmed (rule 2)
  const lineWords = new Map()
  // (a running head's folio: a number at its line's end or start where the line's other words recur on another page with
  // another number there; a number the same wherever they recur, a conference's year, is the head's)
  const numbersAt = new Map()
  for (const L of ledger.lines ?? []) {
    if (L.cls !== 'heads') continue
    const words = wordsOf(pages[L.page - 1]?.glyphs ?? [], L.gs, fams)
    lineWords.set(L, words)
    if (words.length < 2) continue
    for (const [side, w] of [['b', words.at(-1)], ['a', words[0]]]) {
      if (!PAGE_NUMBER.test(w.text)) continue
      const key = folioKey(words, side), at = numbersAt.get(key) ?? numbersAt.set(key, new Set()).get(key)
      at.add(w.text)
    }
  }
  const folios = new Set([...numbersAt].filter(([, ns]) => ns.size > 1).map(([key]) => key))
  const segs = []
  for (const L of ledger.lines ?? []) {
    if (!Object.hasOwn(INK_KIND, L.cls) || L.cls === 'names') continue
    // (a bibliography's line is a unit's only where it is a biblatex entry's, its compile's point `bi<n>` before it (ledger.mjs
    // `entry`): a thebibliography's entries are source units, and what they leave, a label, an entry's number, the original's)
    if (L.cls === 'references' && (L.entry === null || L.entry === undefined)) continue
    const G = pages[L.page - 1]?.glyphs ?? []
    // (an entry's first line from its point on: its label, which the list's \item set before it, the original's ink)
    const all = lineWords.get(L) ?? wordsOf(G, L.gs, fams)
    const from = L.cls === 'references' && Number.isInteger(L.entryFrom) ? all.filter(w => w.gs.some(g => g >= L.entryFrom)) : all
    const [words, ended] = trimmed(G, from, L.cls, folios)
    if (!words.some(w => w.fam === 'text' && PAIR.test(w.text.normalize('NFKC')))) continue
    segs.push({ ...L, words, ended })
  }
  // units of lines (rule 3)
  const groups = []
  for (const s of segs) {
    const last = groups.at(-1), prev = last?.at(-1)
    // (by TeX's paragraphs where the compile marked them, ink.mjs `paras`: a block one paragraph, a contents entry one; else by the
    // lines' places, as before)
    const paras = prev && prev.para !== null && prev.para !== undefined && s.para !== null && s.para !== undefined
    // (the next line of one of TeX's paragraphs at the paper's own leading, PARA_DY of its size at most: a thesis's list of figures
    // set double, its lines 2.4 of their size apart, was cut line by line, each translated alone, 2610.19274v1 pp67-69; never the
    // skip between a list's items, which no point of their own tells apart: 2610.20266v1 p21's bibliography and its heading read
    // as one paragraph; BLOCK_DY where no paragraph is marked)
    const drop = prev ? prev.y - s.y : 0, size = prev ? Math.max(prev.size, s.size) : 0
    // (past BLOCK_DY, within PARA_DY, a marked paragraph's line is its next only where it starts an indent from the paragraph's first
    // line, past EDGE and within INDENT: a hanging line, or a paragraph's own run after its indented first; a line at the first's
    // edge is the next item of a list, which no point of its own tells apart, single-line or not, and a list after a centred
    // heading starts further across than any indent). The paragraph's first line is the block's only where its point lies on it
    // (the ledger's `opens`): a block that begins where a paragraph runs on, at a column's or a page's top, begins at a line of
    // its run, and a list whose items set no point of their own (REVTeX's bibliography, every entry's lines one paragraph's) has
    // every next item's first line an indent from that run's edge; measured from it, an orphan bibliography read as a hanging
    // paragraph a column long, each entry's start bridged over the line of its link no unit holds (2610.21770v1 p6-p7,
    // 2610.20595v1 p20)
    const dx = prev ? Math.abs(s.x0 - last[0].x0) : 0
    const near = drop <= BLOCK_DY * size || (paras && prev.para === s.para && last[0].opens === true && drop <= PARA_DY * size && dx > EDGE * size && dx <= INDENT * size)
    const follows = prev && prev.page === s.page && prev.cls === s.cls && prev.region === s.region && drop > 0 && near && s.x0 < prev.x1 && s.x1 > prev.x0
    // (a paragraph with no point of its own reads as the one before: a contents line ending in its page number ends its entry
    // whatever its point)
    const joins = follows && s.cls !== 'heads' && (s.cls !== 'contents' || !prev.ended) && (paras ? prev.para === s.para : s.cls === 'notes' || s.cls === 'orphan' || s.cls === 'contents')
    // (a biblatex entry's lines its unit, by TeX's points alone: one entry over a column's or a page's break too, every entry its own)
    if (s.cls === 'references' || prev?.cls === 'references') { if (prev && prev.cls === s.cls && prev.entry === s.entry) last.push(s); else groups.push([s]); continue }
    if (joins) last.push(s)
    else groups.push([s])
  }
  const out = []
  // (the ink units an ink unit may echo, by their letters: each one echoing none, rule 5)
  const inkEchoOf = new Map()
  // (the author units' words: a block whose letters are an author unit's names is that unit's, of the names toggle, rule 8)
  const authorWords = new Set()
  if (units) for (const u of units) if (u?.kind === 'author') for (const w of utf8(u.pieces.filter(p => p.t === 'text').map(p => p.s ?? '').join(' ')).split(/[^\p{L}]+/u)) { const s = spellOf(w); if (s.length >= 2) authorWords.add(s) }
  const namesOf = lines => {
    if (!authorWords.size) return false
    let all = 0, named = 0
    for (const l of lines) for (const w of l.words) if (w.fam === 'text') for (const part of w.text.split(/[^\p{L}]+/u)) { const s = spellOf(part); if (!s) continue; all += s.length; if (authorWords.has(s)) named += s.length }
    return all > 0 && named >= NAMES_SHARE * all
  }
  for (const lines of groups) {
    const id = base + out.length, cls = (lines[0].cls === 'orphan' || lines[0].cls === 'notes') && namesOf(lines) ? 'names' : lines[0].cls
    // pieces: text words joined, a run of math or typewriter words a placeholder (rule 4), a run of words in another weight, slant
    // or colour than the unit's a group that sets it (rule 9)
    const pieces = [], phs = []
    let text = '', plain = ''
    const flushText = () => { if (text) { pieces.push({ t: 'text', s: sourceView(text) }); plain += text; text = '' } }
    const style0 = baseStyleOf(lines, pages, faces), open = []
    let runKey = styleKey(style0, style0), pairs = 0
    const closeRun = () => { while (open.length) pieces.push({ t: 'close', id: open.pop(), src: '}' }) }
    lines.forEach((l, li) => {
      l.words.forEach((w, wi) => {
        // (a space between two words of a line where a word's gap stands between them: none where the face alone cuts them, a
        // formula's stop or its "-axis" set against it)
        const space = wi > 0 ? gapBefore(pages[l.page - 1].glyphs, l.words[wi - 1], w) : li > 0
        if (w.fam === 'text') {
          // (a hyphen ending a line before a lowercase letter: the word goes on)
          let sep = ''
          if (space && !(wi === 0 && li > 0 && /-$/.test(text) && /^\p{Ll}/u.test(w.text))) sep = ' '
          else if (wi === 0 && li > 0 && /-$/.test(text)) text = text.slice(0, -1)
          // (a word in another style than the run's: the run closed, the space before the word outside every group, and a group
          // of each command that sets what the word holds and the unit does not opened)
          const st = wordStyle(pages[l.page - 1].glyphs, w.gs, faces), k = styleKey(st, style0)
          if (k === runKey) text += sep
          else {
            const styled = open.length > 0
            if (!styled) text += sep
            flushText()
            closeRun()
            if (styled) text = sep
            const groups = groupsOf(st, style0)
            if (groups.length) flushText()
            for (const src of groups) { open.push(++pairs); pieces.push({ t: 'open', id: pairs, src }) }
            runKey = k
          }
          text += w.text
        } else {
          const lastPh = phs.at(-1)
          // (a run of one face over a gap or a line: one placeholder, its source the run's characters whole — the piece's too, which
          // kept the first word's alone)
          if (lastPh && lastPh.open && lastPh.fam === w.fam) { lastPh.gs.push(...w.gs.map(g => [l.page, g])); lastPh.src += w.text; pieces[lastPh.k].src = phSource(lastPh.fam, lastPh.src); return }
          if (space) text += ' '
          flushText()
          const ph = { k: pieces.length, fam: w.fam, gs: w.gs.map(g => [l.page, g]), src: w.text, open: true }
          phs.push(ph)
          pieces.push({ t: 'ph', src: phSource(w.fam, w.text) })
          return
        }
        for (const p of phs) p.open = false
      })
    })
    flushText()
    closeRun()
    // echo (rule 5): its letters and its placeholders' count a source unit's; its pieces then that unit's, each visible placeholder
    // of it placed by the ink unit's kept run in its turn
    let echo = null, own = pieces, kept = phs
    const spell = spellOf(plain), key = `${spell}#${phs.length}`
    const e = units ? echoOf.get(key) : undefined
    const before = e === undefined && spell.length >= 4 ? inkEchoOf.get(key) : undefined
    if (e !== undefined || before !== undefined) {
      echo = e ?? out[before].id
      own = (e !== undefined ? units[e].pieces : out[before].pieces).map(p => ({ ...p }))
      const visible = own.flatMap((p, k) => (p.t === 'ph' && classOf(p) !== null ? [k] : []))
      kept = phs.map((p, j) => ({ ...p, k: visible[j] }))
    }
    const textGlyphs = lines.flatMap(l => l.words.filter(w => w.fam === 'text').flatMap(w => w.gs.map(g => [l.page, g])))
    if (echo === null && spell.length >= 4 && !inkEchoOf.has(key)) inkEchoOf.set(key, out.length)
    out.push({ id, kind: INK_KIND[cls], cls, echo, pieces: own, glyphs: { text: textGlyphs, ph: kept.flatMap(p => p.gs) }, rows: rowsOf(id, INK_KIND[cls], cls, lines, kept, own.length, pages) })
  }
  return out
}

/** the most frequent of values */
function modeOf(values) {
  const n = new Map()
  let best = values[0], most = 0
  for (const v of values) { const c = (n.get(v) ?? 0) + 1; n.set(v, c); if (c > most) { most = c; best = v } }
  return best
}

/** a page's columns, by its column mark (MARK_DEF's c<n>-<k>): 1 or 2 */
const columnsOf = P => { for (const pt of P.points ?? []) { const m = /^c([12])-\d+$/.exec(pt.name); if (m) return Number(m[1]) } return 1 }

/** an ink unit's rows (rule 6) */
function rowsOf(id, kind, cls, lines, phs, nPieces, pages) {
  const lineRows = [], erase = [], frames = []
  const fs = []
  lines.forEach((l, j) => {
    const P = pages[l.page - 1], G = P.glyphs, view = P.view
    const gs = l.words.flatMap(w => w.gs)
    const tg = l.words.filter(w => w.fam === 'text').flatMap(w => w.gs)
    let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
    for (const g of gs) { const x = G[g]; x0 = Math.min(x0, x.x0, x.ix0 ?? x.x0); x1 = Math.max(x1, x.x1, x.ix1 ?? x.x1); top = Math.max(top, x.top); bottom = Math.min(bottom, x.bottom) }
    const base = modeOf(tg.map(g => r2(G[g].y))), size = modeOf(tg.map(g => r2(G[g].size))), font = modeOf(tg.map(g => G[g].font ?? '?'))
    const [a, c, b, d] = solid(view, x0, Math.min(bottom, base), x1, Math.max(top, base))
    lineRows.push(l.page, a, b, Math.min(d, Math.max(c, base)), d, c, Math.min(200, size), font)
    // the erase: the line's text glyphs' boxes, merged (layout/make.mjs rowsOf)
    const rects = tg.map(g => { const x = G[g]; return [x.ix0 ?? x.x0, x.bottom, x.ix1 ?? x.x1, x.top, x.size] }).sort((p, q) => p[0] - q[0])
    const merged = []
    for (const e of rects) {
      const last = merged.at(-1)
      if (last && e[0] - last[2] <= MERGE * Math.max(last[4], e[4])) merged[merged.length - 1] = [Math.min(last[0], e[0]), Math.min(last[1], e[1]), Math.max(last[2], e[2]), Math.max(last[3], e[3]), Math.max(last[4], e[4])]
      else merged.push(e)
    }
    while (merged.length > ERASE_MAX) {
      let best = 0, gap = Infinity
      for (let q = 0; q + 1 < merged.length; q++) { const g = merged[q + 1][0] - merged[q][2]; if (g < gap) { gap = g; best = q } }
      const p = merged[best], q = merged[best + 1]
      merged.splice(best, 2, [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3]), Math.max(p[4], q[4])])
    }
    for (const e of merged) erase.push(j, ...solid(view, e[0], e[1], e[2], e[3]))
    const cols = columnsOf(P), mid = (view[0] + view[2]) / 2
    const col = cols < 2 ? 0 : a < mid - 4 && b > mid + 4 ? 2 : (a + b) / 2 >= mid ? 1 : 0
    const lastF = fs.at(-1)
    if (lastF && lastF.page === l.page && lastF.col === col) lastF.n++
    else fs.push({ page: l.page, col, first: j, n: 1 })
  })
  // frames: by page and column, each with its share of the text and the room below it
  const total = lines.reduce((n, l) => n + l.words.length, 0) || 1
  let share = -1, seen = 0
  fs.forEach((f, q) => {
    if (q > 0) share = Math.max(share, 0, Math.min(1000, Math.round((1000 * seen) / total)))
    for (let j = f.first; j < f.first + f.n; j++) seen += lines[j].words.length
    const P = pages[f.page - 1], view = P.view, G = P.glyphs
    const last = f.first + f.n - 1, bottomOf = lineRows[8 * last + 5], fx0 = Math.min(...Array.from({ length: f.n }, (_, k) => lineRows[8 * (f.first + k) + 1])), fx1 = Math.max(...Array.from({ length: f.n }, (_, k) => lineRows[8 * (f.first + k) + 2]))
    const foot = bottomOf - 0.5
    let next = -Infinity
    for (const x of G) if (x.top < foot && x.x1 > fx0 && x.x0 < fx1 && x.top > next) next = x.top
    const H = view[3] - view[1]
    const below = Math.min(H, Math.max(0, r2(bottomOf - (Number.isFinite(next) ? next : view[1] + FOOT))))
    frames.push(f.page, f.col, f.first, f.n, q === 0 ? -1 : share, below)
  })
  // a head's line centred where it stands on its page's middle and short of its width (rule 6)
  let flags = 0
  if (cls === 'heads' && lines.length === 1) {
    const view = pages[lines[0].page - 1].view, mid = (view[0] + view[2]) / 2, a = lineRows[1], b = lineRows[2]
    if (Math.abs((a + b) / 2 - mid) <= CENTRE && b - a < 0.8 * (view[2] - view[0])) flags = 4
  }
  const ph = phs.map(p => {
    const segs = []
    for (const l of lines) {
      const mine = p.gs.filter(([pg, g]) => pg === l.page && l.words.some(w => w.gs.includes(g)))
      if (!mine.length) continue
      const G = pages[l.page - 1].glyphs, view = pages[l.page - 1].view
      let x0 = Infinity, x1 = -Infinity, top = -Infinity, bottom = Infinity
      for (const [, g] of mine) { const x = G[g]; x0 = Math.min(x0, x.ix0 ?? x.x0); x1 = Math.max(x1, x.ix1 ?? x.x1); top = Math.max(top, x.top); bottom = Math.min(bottom, x.bottom) }
      const [a, c, b, d] = solid(view, x0, bottom, x1, top)
      segs.push(l.page, a, Math.min(d, Math.max(c, r2(G[mine[0][1]].y))), b, d, c)
    }
    return segs.length / 6 > SEGS_INLINE ? null : [p.k, p.fam === 'math' ? 'math' : 'url', 0, ...segs]
  }).filter(Boolean)
  return { unit: [id, kind, 9, flags, nPieces], lines: lineRows, frames, erase, ph }
}

/** a rectangle as the layout file holds it (layout/make.mjs solid): to a hundredth, within its view, a hundredth across at least */
function solid(view, x0, y0, x1, y1) {
  const cx = v => Math.min(view[2], Math.max(view[0], r2(v))), cy = v => Math.min(view[3], Math.max(view[1], r2(v)))
  let a = cx(x0), b = cx(x1), c = cy(y0), d = cy(y1)
  if (b <= a) { if (a + 0.01 <= view[2]) b = r2(a + 0.01); else a = r2(b - 0.01) }
  if (d <= c) { if (c + 0.01 <= view[3]) d = r2(c + 0.01); else c = r2(d - 0.01) }
  return [a, c, b, d]
}

/** the ink units' glyphs claimed in own.mjs's ownership (rule 7): `own.glyphs[p - 1][g]` set to `u<id>` (text) or `u<id>.p`
 *  (a placeholder) where no unit owns it; with `pages` (the wrap's: boxes and paths), each unit's text also takes the rules TeX
 *  painted on its lines that no group holds (own.mjs lineRulesOf, MR 2b: an OT1 \_ in an orphan line, 2610.19159v1's agent
 *  logs), `own.boxes[p - 1][b]`; returns the glyphs claimed */
export function claimInk(own, ink, pages = null) {
  let n = 0
  // (the rules' search of every ink unit together, each page's boxes read once and each unit's near ones: OWN_WORK, past which
  // the rest keep theirs the page's)
  let left = OWN_WORK
  // (each page's painted boxes no group holds that could be a rule or a frame's side, once a page)
  const thin = new Map()
  const thinOn = p => {
    let list = thin.get(p)
    if (list) return list
    const pg = pages[p - 1], B = pg.boxes, O = own.boxes?.[p - 1] ?? []
    list = []
    for (let b = 0; b < B.length / 4; b++) if ((pg.paths[b] ?? -1) >= 0 && O[b] == null && Math.min(B[4 * b + 2] - B[4 * b], B[4 * b + 3] - B[4 * b + 1]) <= RULE_EM * 200) list.push(b)
    left -= B.length / 4
    thin.set(p, list)
    return list
  }
  for (const u of ink) {
    for (const [p, g] of u.glyphs.text) if (own.glyphs[p - 1] && own.glyphs[p - 1][g] == null) { own.glyphs[p - 1][g] = `u${u.id}`; n++ }
    for (const [p, g] of u.glyphs.ph) if (own.glyphs[p - 1] && own.glyphs[p - 1][g] == null) { own.glyphs[p - 1][g] = `u${u.id}.p`; n++ }
    // (and the rules TeX painted on its lines, as a source unit's text takes them, own.mjs MR 2b: an OT1 \_ in an orphan line)
    if (!pages || !own.boxes || left <= 0) continue
    const near = []
    for (const [p, box] of extentsOf(pages, u.glyphs.text)) {
      const B = pages[p - 1].boxes, list = thinOn(p)
      left -= list.length
      // (those that meet its glyphs' extent, a size about it: a rule on its lines and any frame it is part of stand there)
      for (const b of list) if (B[4 * b] <= box[2] && box[0] <= B[4 * b + 2] && B[4 * b + 1] <= box[3] && box[1] <= B[4 * b + 3]) near.push([p, b])
    }
    if (left <= 0) continue
    const r = lineRulesOf(pages, u.glyphs.text, near, left)
    left -= r.work
    if (r.over) continue
    // (a rule inside one of its placeholders' extent is that placeholder's, `u<id>.p`, as a source unit's placeholder takes the
    // boxes of its range (own.mjs): an inline fraction's bar between its numerator and its denominator, which the formula's crop
    // redraws with the text's groups hidden (layer-proto/visibility.mjs cropSourceOff))
    const phs = placeholderBoxesOf(pages, u.glyphs.ph)
    for (const [p, b] of r.rules) {
      if (own.boxes[p - 1][b] != null) continue
      const B = pages[p - 1].boxes, x0 = B[4 * b], y0 = B[4 * b + 1], x1 = B[4 * b + 2], y1 = B[4 * b + 3], mid = (y0 + y1) / 2
      const inPh = phs.some(c => c.p === p && x0 >= c.x0 - 0.1 * c.size && x1 <= c.x1 + 0.1 * c.size && mid >= c.y0 && mid <= c.y1)
      own.boxes[p - 1][b] = inPh ? `u${u.id}.p` : `u${u.id}`
    }
  }
  return n
}

/** a unit's placeholder glyphs as boxes, one a formula: glyphs of a page whose boxes meet, or stand within PH_GAP of their size
 *  apart, on one line (within a size across): [{ p, x0, y0, x1, y1, size }], by their advances and their tops and bottoms */
function placeholderBoxesOf(pages, gs) {
  const out = []
  for (const [p, g] of gs) {
    const G = pages[p - 1]?.glyphs?.[g]
    if (!G || !(G.size > 0)) continue
    const box = { p, x0: G.x0, y0: G.bottom, x1: G.x1, y1: G.top, size: G.size }
    for (let i = out.length - 1; i >= 0; i--) {
      const c = out[i], gap = PH_GAP * Math.max(c.size, box.size)
      if (c.p !== p || box.x0 > c.x1 + gap || c.x0 > box.x1 + gap || box.y0 > c.y1 + box.size || c.y0 > box.y1 + box.size) continue
      box.x0 = Math.min(box.x0, c.x0); box.y0 = Math.min(box.y0, c.y0); box.x1 = Math.max(box.x1, c.x1); box.y1 = Math.max(box.y1, c.y1); box.size = Math.max(box.size, c.size)
      out.splice(i, 1)
    }
    out.push(box)
  }
  return out
}

/** each page's extent of `glyphs` (their advances, baseline to baseline), a size of its largest glyph past it on every side:
 *  page -> [x0, y0, x1, y1] */
function extentsOf(pages, glyphs) {
  const out = new Map()
  for (const [p, g] of glyphs) {
    const G = pages[p - 1].glyphs[g]
    if (!(G?.size > 0)) continue
    const e = out.get(p)
    if (!e) { out.set(p, [G.x0, G.y, G.x1, G.y, G.size]); continue }
    e[0] = Math.min(e[0], G.x0); e[1] = Math.min(e[1], G.y); e[2] = Math.max(e[2], G.x1); e[3] = Math.max(e[3], G.y); e[4] = Math.max(e[4], G.size)
  }
  return [...out].map(([p, [x0, y0, x1, y1, s]]) => [p, [x0 - s, y0 - s, x1 + s, y1 + s]])
}

/** the ink units the wrap could not hide alone, as it reads a source unit (wrap.mjs `unhidden`): one with a glyph on a page it did
 *  not wrap, or a placeholder on a page whose groups it merged (its placeholder's ink then folded into its text's). `pages` the
 *  wrap's (wrapOf's `pages`: page -> { ok, merged }). The page pass lays none of them (pipeline/ink-pass.mjs inkOfHost `off`) */
export function inkOff(ink, pages) {
  const out = []
  for (const u of ink) {
    const on = new Set([...u.glyphs.text, ...u.glyphs.ph].map(([p]) => p)), ph = new Set(u.glyphs.ph.map(([p]) => p))
    for (const p of on) { const x = pages.get(p); if (!x?.ok || (x.merged && ph.has(p))) { out.push(u.id); break } }
  }
  return out
}
