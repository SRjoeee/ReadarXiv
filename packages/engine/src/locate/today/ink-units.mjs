// COPIED as it is from src/pdf-reader/engine/layout/ink-units.mjs (abe884b5e), its imports pointed at deps.mjs (today's, copied) and, where
// marked COPY, nothing else but eight changes, marked CHANGED (wordsOf's order: glyphs at one x in the stream's order, leftOf; a running
// head's number of its phrase no folio, phrased; a unit's label's glyphs stated, `glyphs.label`; each kept run's glyphs by its
// placeholder stated, `glyphs.runs`; an e-mail address or an identifier a kept run of its own, addressed, and a group of local parts before their
// domain one over its words and lines, groupedAddresses; a formula's TeX specials written as TeX sets
// them, never stripped, MATH_SPECIAL; a script a kept run whatever its face, written as TeX writes one, a label a first line's
// leading raised scripts, no run over a line's break at a script, scriptsOf; a line of no text word the next of its paragraph's unit;
// a paragraph TeX ended between two lines parts them): run
// by locate over arXiv's page (../ink.ts), held equal to today's by tests/pdf-reader/locate-ink-today.test.ts, the changes apart. Today's file stays the production prepare's until the cut-over.
// The ink units of our final pass (docs/route/orphan-text.md, stage 2): text TeX sets that no source unit owns — the running
// heads and feet, the contents and the lists, a note with no unit, prose the front end did not cut — made units from our own
// glyphs, so that it is translated and drawn as any unit. Read from the ledger's lines (layout/ledger.mjs: each line of glyphs
// no unit owns, in stream order, with its class), our pages' glyphs, and the paper's source units; nothing of arXiv's PDF, no
// position estimated: every coordinate is a glyph's our compile set.
//
// The rules (each tested):
//   1. the classes made units: heads (`inkheads`), contents (`inkcontents`), notes (`inknotes`), orphans (`inkorphan`), and a
//      biblatex entry's lines (`inkreferences`: the references' class where the compile's point `bi<n>` stands before the entry,
//      ledger.mjs `entry`, one entry a unit, every line of it whatever it holds, its label the original's, an entry of no text
//      word none); a line of another class is never one;
//   2. a line's words: its glyphs left to right, a word ended where two stand a fifth of their size apart; a head's or a list's
//      line keeps its numbering and its page number the original's ink (a leading section number, a trailing run of leader
//      dots and a number: no unit's, never erased), so that a contents entry's title is drawn up to its leaders, where the
//      number stands apart from the line's text (APART: a folio, a section number's \quad, after leaders) or is a running
//      head's folio (its head's words recur on another page with another number there); a number in the text's own words is
//      the unit's ("… at ICLR 2021", the same on every page); a glyph's text its character, a spacing accent TeX set over its
//      letter joined to it (layout/accents.mjs: OT1's \accent read "F´ısica" for Física, "PE´REZ" for PÉREZ, 2610.20716v1,
//      2610.20285v1); a unit's label, the glyphs of no letter its first line begins with, scripts raised (a footnote's mark, an
//      affiliation's number: labelLength), no text of its own, its glyphs the unit's, kept by the reader where they stand;
//   3. a unit: a head's line alone; the others' lines while they follow on one page and in one region, each within BLOCK_DY of
//      its size below the one before (PARA_DY within one of TeX's paragraphs: a list set double, an indent from the paragraph's
//      first line where the block begins on it) and meeting it across, and in
//      one paragraph of TeX's (ink.mjs `paras`: a contents entry, a note, a paragraph); where the compile marked none, a list's line with the next where it ends in no page number (an
//      entry continued), a note's or an orphan's while they follow;
//   4. inside a unit, a run of a math face's glyphs or of a typewriter face's is a placeholder (`math`, `url`): its ink kept,
//      its source the run's characters; so is a run of scripts in whatever face, each glyph TeX set smaller than its line's text
//      and off its baseline (a formula's digit in a text face, an affiliation's or a note's mark), a formula's (`math`), a run
//      over a line's break one only where no script stands at the break; a word that is a web address is one in whatever face,
//      and so is an e-mail address in a word, or an identifier (a token of word characters joined by underscores), the word's
//      characters around it the text's, and a group of local parts before
//      their one domain, every glyph of it whatever its face, over its words and the break of lines TeX set one after the other
//      (a note of addresses alone is then no unit, a kept block that says so, `address`; a line of no text word, an address or a
//      URL TeX broke onto a line of its own, is the next line of the unit its line before belongs to in one of TeX's paragraphs as
//      the compile marked them, and starts none: CHANGED);
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
//      the names toggle, as the author block is, not always translated (REVTeX's names its marks do not own); so is one that
//      echoes a unit of the author block (rule 5: an affiliation REVTeX prints from its own lists, its source unit laid nowhere);
//   9. its style: the weight, slant and fill most of its text glyphs hold is the unit's, which the reader measures on them; a
//      run of words in another is a group of the commands that set it (`\textbf{`, `\textmd{`, `\textit{`, `\textup{`,
//      `\textcolor[HTML]{…}{`), as a source unit's are, so that its translation keeps each run's (a theorem's bold head before
//      its regular note, a coloured term: the release sweep of 2026-10-25, (d), drew them all in the unit's one style);
//  10. kept blocks (keptUnitsOf): the text no unit owns still once the ink units have claimed theirs — a code listing, an
//      address or a URL alone, a page number, a bibliography not cut into entries — a unit that is never translated (the
//      bundle's KEPT flag), so that it lights as one block on both panes as any unit does (the owner's ruling of 2026-10-30): a
//      block a run of such lines one after the other in TeX's stream with nothing a unit owns between them, on one page, in one
//      region, in one column (each line meeting the block across), one class, each within KEPT_DY of its size below the
//      block's lowest line; a line of no letter pair in a column's body (`symbols`: a listing's brace) joins a block and starts
//      none; a float's text (a figure's, which lights none) never one, nor a glyph of an included graphic by where it sits (in a
//      form XObject, on an image) whatever its line's class, nor a line beside a unit's text on its baseline, within BESIDE of
//      its size across in its column (its label, its number); a line part an ink unit claimed keeps its other runs (a running
//      head's folio). Its rows the lines' boxes alone (no erase, no placeholder: nothing is
//      drawn over it), no pieces (nothing is sent), its glyphs in no group (the wrap and its ledger as before).
// Pure arithmetic; an original module (no port statement).
import { unitClass } from './content-classes.mjs'
import { accentTexts } from './accents.mjs'
import { ADDRESS_GROUP, classifyFont, classOf, EMAIL_ADDRESS, identifiersIn, lineRulesOf, OWN_WORK, RULE_EM, spellOf, UNIT_FLAG, utf8 } from './deps.mjs'

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
/** a unit's label as the reader keeps one: up to three digits or marks of a label (layer-proto/layer2.mjs LABEL, labelOf), or
 *  up to three marks of no letter or digit (layer-proto/tex.mjs, the marks a first line holds before its first word). "⁷,⁸" is
 *  neither: the reader would erase it as the unit's text, and the text no longer saying it, it would be drawn by nobody */
const LABEL_MARKS = /^(?:[\d*†‡§¶•◦▪–·]{1,3}|[^\p{L}\p{N}]{1,3})$/u
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

/** the characters a formula's own frame reads, each written by the token that sets it in a formula (a control word as TeX prints
 *  one, a space after it): the math shift `\$`, a group's braces `\{` `\}`, the escape `\backslash` */
const MATH_SPECIAL = { $: '\\$', '{': '\\{', '}': '\\}', '\\': '\\backslash ' }
/** a kept run's placeholder source: a formula of its characters, or an address; a run of scripts of one sign (`sign`, scriptsOf)
 *  written as TeX writes a script, `$^{…}$` raised and `$_{…}$` lowered, so that every reader of the source reads it as it reads a
 *  source unit's mark (the instrument adapter: a symbol drawn raised, `sym`, a superscript's copy text): written `$*$`, a note's
 *  mark of one symbol was drawn as that symbol on the line's baseline at its size (CHANGED, with scriptsOf). CHANGED: today's
 *  strips `$ \ { }` from a formula's
 *  characters, so a run of a brace alone (2610.21377v1's `\{0,\dots,J-1\}`, 2608.06007v1's `$\{$Intra-Operator$\}$`) was `$$`,
 *  which every reader takes as a display (mt.mjs DISPLAY, classOf, phClassProven): drawn in its own ink, a kept display row in the
 *  middle of its line. Each is written as TeX sets it, so a run's source is an inline formula of every character it has */
const phSource = (fam, text, sign = 0, group = false) => {
  // (CHANGED: a run that holds a group of addresses, groupedAddresses, keeps the group's braces, balanced by its syntax, as
  // `\url{…}` holds balanced braces: its source the characters the page sets, `{ada,alan}@example.org`, where the stripped
  // `ada,alan@example.org` read as one address of another local part)
  if (fam !== 'math') return sourceView(`\\url{${group && balanced(text) ? text.replace(/\\/g, '') : text.replace(/[\\{}]/g, '')}}`)
  const t = text.replace(/[$\\{}]/g, c => MATH_SPECIAL[c])
  return sourceView(sign > 0 ? `$^{${t}}$` : sign < 0 ? `$_{${t}}$` : `$${t}$`)
}
/** whether a text's braces pair, each closing one after its opening one */
const balanced = text => {
  let depth = 0
  for (const c of text) if ((depth += c === '{' ? 1 : c === '}' ? -1 : 0) < 0) return false
  return depth === 0
}
/** a word's scripts' one sign (scriptsOf): raised (1) or lowered (-1) where every glyph of it is a script of that sign, else 0 */
const signOf = w => (w.sc?.every(v => v === w.sc[0]) ? w.sc[0] : 0)
/** two glyphs' order along a line by their starts, those at one x in the stream's order (the line's own, `gs`): a stack, a
 *  fraction's numerator over its denominator, TeX ships top first. One x is one up to the float arithmetic PDF.js composes a
 *  position with (2307.16209v1 p14's 1 and 2 of ½ at 451.282: 451.28200000000004 and 451.282 on one page, 451.28199999999993
 *  and 451.282 on the other), which today's order by x0 read as their order. CHANGED: the locate copy's one change */
const leftOf = (a, b) => (Math.abs(a - b) <= 64 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b)) ? 0 : a - b)
/** a line's words, left to right: { gs (glyph indices), ts (each glyph's text), text, fam (math, mono, or text) }. A glyph's text
 *  is its character, a spacing accent TeX set over its letter joined to it (layout/accents.mjs: "F´ısica" read Física, "Cande`s"
 *  Candès, a capital's raised accent's "PE´REZ" PÉREZ) */
function wordsOf(G, gs, fams) {
  const order = [...gs].filter(g => G[g] && !G[g].blank && /\S/u.test(G[g].u ?? '')).sort((a, b) => leftOf(G[a].x0, G[b].x0))
  const joined = accentTexts(G, gs)
  const out = []
  const scripts = scriptsOf(G, order)
  let cur = null, prev = null
  for (const g of order) {
    const x = G[g], f = famOf(fams, x.font)
    const fam = f === 'math' ? 'math' : f === 'mono' ? 'mono' : scripts.has(g) ? 'math' : 'text'
    if (!cur || (prev !== null && x.x0 - G[prev].x1 > WORD_GAP * Math.max(x.size, G[prev].size)) || cur.fam !== fam) { cur = { gs: [], ts: [], text: '', fam }; out.push(cur) }
    const t = joined.get(g) ?? x.u
    cur.gs.push(g); cur.ts.push(t); cur.text += t
    prev = g
  }
  // (each glyph of a word that holds a script told raised (1), lowered (-1) or neither (0), `sc`: the label's marks and a line's
  // break read it)
  for (const w of out) if (w.gs.some(g => scripts.has(g))) w.sc = w.gs.map(g => scripts.get(g) ?? 0)
  // (an address set in the text's face, \urlstyle{same}: a typewriter run as any, kept, rule 4)
  for (const w of out) if (w.fam === 'text' && URL_WORD.test(w.text)) w.fam = 'mono'
  return out.flatMap(w => (w.fam === 'text' ? addressed(w) : [w]))
}

/** a line's scripts (rule 4), each raised (1) or lowered (-1): of its glyphs `order`, those TeX set smaller than the line's text
 *  and off its baseline — the line's text size the one most of its glyphs have, its baseline the one most of those at that size stand on,
 *  each read on the engine's hundredth of a point, as locate reads a box's glyphs on one baseline (TeX sets one box's glyphs at
 *  one size on one baseline: equal, no threshold). A script is no text of the line's but its formula's, or a mark TeX set over
 *  or under it, whatever its face: C_n²'s "2" in a text face (2610.19274v1), an affiliation's `$^{1,2}$` under Times, whose
 *  digits are the text face's (2610.30854v1 p1's names: read as their text, drawn flat at the names' size, "Jiang1,2"), a
 *  footnote's mark Computer Modern sets in CMR7. A glyph set smaller on the baseline (small capitals) or off it at the line's
 *  size (a capital's accent, a raised box) is none. CHANGED: today's read a text face's glyph a formula's only after a math run,
 *  set at less than SCRIPT of the line's size within a size of the glyph before it and abutting it; every other script in a
 *  text face was the line's text, translated and drawn on its baseline at its size. A figure text's own glyphs are read by it
 *  too (figure-lines.ts setApart, F3's `script`: one definition of a script for both), its row's text size its `largest`: a short
 *  label's scripts can outnumber its letters (2610.22214v1 p4's a_mn x_n = b_m: four of seven glyphs), and a script is set
 *  smaller than its base (TeX's \scriptstyle) */
export function scriptsOf(G, order, largest = false) {
  const body = largest ? Math.max(...order.map(g => r2(G[g].size))) : modeOf(order.map(g => r2(G[g].size)))
  const base = modeOf(order.filter(g => r2(G[g].size) === body).map(g => r2(G[g].y)))
  const out = new Map()
  for (const g of order) if (r2(G[g].size) < body && r2(G[g].y) !== base) out.set(g, r2(G[g].y) > base ? 1 : -1)
  return out
}

/** each e-mail address in a word: a kept run of its own (fam `mono`, rule 4), the address alone, the word's characters around it
 *  the text's (an address's stop, a bracket), as the front end keeps one in a source unit's text (latex-front.mjs keepAddresses,
 *  its pattern EMAIL_ADDRESS: an address is no prose, never translated). CHANGED: today's said it as text, in a colour group of its
 *  run where its ink has another colour, which no translation kept (2609.36054v2 p1's grey addresses drawn black, #28); kept, it is
 *  an element every reply brings back, its ink the original's. A word's text is its glyphs' (`ts`): an address that begins or
 *  ends inside a glyph's text takes that glyph whole. CHANGED too: so is an identifier in a word, a token holding two letters or
 *  digits joined by underscores, whole but its edges' sentence punctuation (the front end's identifiersIn, as keepIdentifiers keeps one: `llm_equal_human` set in a text face, its
 *  words sent, came back with its last part in Chinese), read on its glyphs' compatibility forms (NFKC: a ligature's glyph its letters, as a
 *  figure's text reads it); an address first, so that one holding an underscore stays one address */
const ADDRESSES = new RegExp(EMAIL_ADDRESS.source, 'g')
function addressed(w) {
  // (each glyph's first character in the word's text, and in its compatibility forms')
  const starts = [], folded = w.ts.map(t => t.normalize('NFKC')), fstarts = []
  let n = 0, fn = 0
  w.ts.forEach((t, i) => { starts.push(n); n += t.length; fstarts.push(fn); fn += folded[i].length })
  const glyphIn = (at, o) => { let i = 0; while (i + 1 < at.length && at[i + 1] <= o) i++; return i }
  const found = [...w.text.matchAll(ADDRESSES)].map(m => [glyphIn(starts, m.index), glyphIn(starts, m.index + m[0].length - 1) + 1])
  // (each identifier outside the addresses, its glyphs [a, b))
  if (folded.some(t => t.includes('_')))
    for (const [x, y] of identifiersIn(folded.join(''))) {
      const a = glyphIn(fstarts, x), b = glyphIn(fstarts, y - 1) + 1
      if (!found.some(([p, q]) => p < b && a < q)) found.push([a, b])
    }
  if (!found.length) return [w]
  found.sort((x, y) => x[0] - y[0])
  const out = []
  const part = (a, b, fam) => { if (b > a) out.push({ gs: w.gs.slice(a, b), ts: w.ts.slice(a, b), text: w.ts.slice(a, b).join(''), fam }) }
  let from = 0
  for (const [a, b] of found) {
    if (a < from) continue
    part(from, a, 'text')
    part(a, b, 'mono')
    from = b
  }
  part(from, w.gs.length, 'text')
  return out
}

/** CHANGED: each group of local parts written once before their one domain (`{jyeoj251, bmw5779}@gmail.com`: the front end's
 *  pattern, latex-front.mjs ADDRESS_GROUP, as keepGroups keeps one in a source unit's text) a kept run (fam `mono`, rule 4), every
 *  glyph of it whatever its face, as an address in a word is (addressed). Read over the words of a run of lines TeX set one
 *  right after the other (each line's first glyph the one after the last of the line before in TeX's stream, in one region: a
 *  group TeX broke after a comma), a word's gap a space and a line's break white space. Today's read its local parts as the
 *  text's words, sent: 2611.00342v1 p1's two groups, braces in the symbol font's math face and the first broken over two lines,
 *  came back capitalised, the commas full-width ("{Jyeoj251, BMW5779, …", under the names toggle). Each line's words
 *  (`lineWords`) cut where a group begins or ends inside one, each of its words `group` (phSource keeps its braces) */
const GROUPS = new RegExp(ADDRESS_GROUP.source, 'g')
function groupedAddresses(pages, lines, lineWords) {
  for (let i = 0; i < lines.length; ) {
    let j = i + 1
    while (j < lines.length && lines[j].page === lines[j - 1].page && lines[j].region === lines[j - 1].region && lines[j].gs[0] === lines[j - 1].gs.at(-1) + 1) j++
    const run = lines.slice(i, j)
    i = j
    // (the run's characters, each the glyph it is of, `line|word|glyph`, and null for a space or a break)
    let s = ''
    const at = []
    run.forEach((L, li) => {
      const G = pages[L.page - 1]?.glyphs ?? [], words = lineWords.get(L)
      words.forEach((w, wi) => {
        const sep = wi > 0 ? (gapBefore(G, words[wi - 1], w) ? ' ' : '') : s ? '\n' : ''
        s += sep
        for (let c = 0; c < sep.length; c++) at.push(null)
        w.ts.forEach((t, gi) => { s += t; for (let c = 0; c < t.length; c++) at.push(`${li}|${wi}|${gi}`) })
      })
    })
    if (!s.includes('@')) continue
    const taken = new Set()
    for (const m of s.matchAll(GROUPS)) for (let c = m.index; c < m.index + m[0].length; c++) if (at[c] !== null) taken.add(at[c])
    if (!taken.size) continue
    run.forEach((L, li) => lineWords.set(L, lineWords.get(L).flatMap((w, wi) => {
      const out = []
      for (let gi = 0; gi < w.gs.length; ) {
        const inside = taken.has(`${li}|${wi}|${gi}`)
        let e = gi + 1
        while (e < w.gs.length && taken.has(`${li}|${wi}|${e}`) === inside) e++
        out.push({ gs: w.gs.slice(gi, e), ts: w.ts.slice(gi, e), text: w.ts.slice(gi, e).join(''), fam: inside ? 'mono' : w.fam, ...(inside ? { group: true } : {}), ...(w.sc ? { sc: w.sc.slice(gi, e) } : {}) })
        gi = e
      }
      return out.length === 1 && out[0].fam === w.fam && !out[0].group ? [w] : out
    })))
  }
}

/**
 * How many glyphs a unit's label is, of its first line's words (wordsOf's, left to right): the glyphs the line begins with, each
 * of no letter, a script raised over the line's baseline (scriptsOf: set smaller than its text, whatever its face) (a footnote's
 * mark, an affiliation's number: "¹Instituto de Física", what the class sets before the text, as make.mjs headLabel reads a
 * source unit's), read as the reader keeps a label (LABEL_MARKS), a glyph of the line's own after them; 0 for none. The reader
 * keeps such a label as the original's, its words breaking at the baseline (layer-proto/layer2.mjs charsOfUnit2, labelOf), so
 * the unit's text does not say it: said there, it was drawn twice, the original's beside the translation's (2610.20716v1 p1).
 * CHANGED: today's read a mark in a text face alone, set under 0.85 of the line's size and raised over 0.2 of it: 2610.40394v1
 * p1's "*", 7.77 pt on its note's 7.97 and raised 0.20 pt, was no label, nor any mark in a math face (CMSY's ∗)
 */
function labelLength(G, words) {
  let n = 0, marks = ''
  for (const w of words) for (let i = 0; i < w.gs.length; i++) {
    const x = G[w.gs[i]]
    if (w.sc?.[i] !== 1 || /\p{L}/u.test(x.u ?? '')) return LABEL_MARKS.test(marks) ? n : 0
    n++
    marks += x.u ?? ''
  }
  return 0
}

/** a first line's words with its label's `n` glyphs (labelLength) a text word's, as today's read a label's glyphs: a run of
 *  scripts the label takes whole read as text, one it begins cut after it, its glyphs after the label a run of their own.
 *  CHANGED: today's label was a text word's glyphs alone, a script in a text face being text */
function labelAsText(words, n) {
  const out = []
  for (const w of words) {
    const k = Math.min(n, w.gs.length)
    n -= k
    if (k === 0 || w.fam === 'text') { out.push(w); continue }
    out.push({ gs: w.gs.slice(0, k), ts: w.ts.slice(0, k), text: w.ts.slice(0, k).join(''), fam: 'text' })
    if (k < w.gs.length) out.push({ ...w, gs: w.gs.slice(k), ts: w.ts.slice(k), text: w.ts.slice(k).join(''), ...(w.sc ? { sc: w.sc.slice(k) } : {}) })
  }
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

/** two gaps one glue of TeX's: within this share of their size of each other, the PDF's text unit (a TJ adjustment, a width: whole
 *  thousandths of the size) twice: amsart's head's word spaces 3.990 to 3.999 at 8.97, 2610.21884v1 */
const SAME_GLUE = 0.002
/** whether a head's line's number at its end (`b`) or its start (`a`) stands from the word beside it, a word of letters or digits,
 *  at the line's word space: as far as two of its other words stand from each other, or, the line holding no two others, a word's
 *  gap (CHANGED: a number of the head's phrase, "5 of 21", 2610.30875v1, is no folio) */
function phrased(G, words, side) {
  const n = words.length
  const gapOf = (w, v) => {
    let r = -Infinity, l = Infinity, size = 0
    for (const g of w.gs) { r = Math.max(r, G[g].x1); size = Math.max(size, G[g].size) }
    for (const g of v.gs) { l = Math.min(l, G[g].x0); size = Math.max(size, G[g].size) }
    return [l - r, size]
  }
  // (a mark of no letter or digit beside it sets it apart from the head's words: ACM's "2 • Names", 2610.37668v1)
  if (!/[\p{L}\p{N}]/u.test((side === 'b' ? words[n - 2] : words[1]).text)) return false
  const [gap, size] = side === 'b' ? gapOf(words[n - 2], words[n - 1]) : gapOf(words[0], words[1])
  const rest = side === 'b' ? words.slice(0, -1) : words.slice(1)
  let others = 0
  for (let i = 1; i < rest.length; i++) {
    if (!gapBefore(G, rest[i - 1], rest[i])) continue
    others++
    if (Math.abs(gapOf(rest[i - 1], rest[i])[0] - gap) <= SAME_GLUE * size) return true
  }
  return others === 0 && gap > WORD_GAP * size
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
  // nearer its last word than its words are to each other, 2610.21884v1. CHANGED: not where it stands from the word beside it at
  // the line's word space, a word of the head's phrase: "5 of 21", whose 5 stands from "of" as "of" from "21", was taken for the
  // folio and "of 21" translated beside the original's 5, 2610.30875v1 — the head is one unit, each page's its own, phrased)
  const folio = side => cls === 'heads' && !!folios?.has(folioKey(words, side)) && !phrased(G, words, side)
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
 * [[page, g]], ph: [[page, g]], runs: [[k, [[page, g]]]], label?: [[page, g]] }, rows: { unit: [id, kind, depth, flags, pieces],
 * lines (8 a line, the face's name at 7), frames, erase, ph } }]: `runs` each kept run's glyphs by its placeholder's index among
 * the pieces (CHANGED: today's states them all as one list, `ph`, its file each placeholder's segments, rows.ph; locate gives each
 * element the glyphs it is told, and told one list gave the first every run's ink); `label` the glyphs of its label
 * (labelLength), among its text's, where it has one (CHANGED: today's states none, its reader reading the label off the unit's
 * characters; locate states a member's label from the glyphs it is told, as a source unit's, 2610.22065v1 p1's "2" erased with
 * the translated affiliation and drawn by nobody)
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
  // (CHANGED: every line's words read first, a group of addresses over lines TeX set one after the other one kept run,
  // groupedAddresses)
  const lineWords = new Map((ledger.lines ?? []).map(L => [L, wordsOf(pages[L.page - 1]?.glyphs ?? [], L.gs, fams)]))
  groupedAddresses(pages, ledger.lines ?? [], lineWords)
  // (a running head's folio: a number at its line's end or start where the line's other words recur on another page with
  // another number there; a number the same wherever they recur, a conference's year, is the head's)
  const numbersAt = new Map()
  for (const L of ledger.lines ?? []) {
    if (L.cls !== 'heads') continue
    const words = lineWords.get(L)
    if (words.length < 2) continue
    for (const [side, w] of [['b', words.at(-1)], ['a', words[0]]]) {
      if (!PAGE_NUMBER.test(w.text)) continue
      const key = folioKey(words, side), at = numbersAt.get(key) ?? numbersAt.set(key, new Set()).get(key)
      at.add(w.text)
    }
  }
  const folios = new Set([...numbersAt].filter(([, ns]) => ns.size > 1).map(([key]) => key))
  const segs = []
  const textual = w => w.fam === 'text' && PAIR.test(w.text.normalize('NFKC'))
  for (const L of ledger.lines ?? []) {
    if (!Object.hasOwn(INK_KIND, L.cls) || L.cls === 'names') continue
    // (a bibliography's line is a unit's only where it is a biblatex entry's, its compile's point `bi<n>` before it (ledger.mjs
    // `entry`): a thebibliography's entries are source units, and what they leave, a label, an entry's number, the original's)
    if (L.cls === 'references' && (L.entry === null || L.entry === undefined)) continue
    const G = pages[L.page - 1]?.glyphs ?? []
    // (an entry's first line from its point on: its label, which the list's \item set before it, the original's ink)
    const all = lineWords.get(L)
    const from = L.cls === 'references' && Number.isInteger(L.entryFrom) ? all.filter(w => w.gs.some(g => g >= L.entryFrom)) : all
    const [words, ended] = trimmed(G, from, L.cls, folios)
    // (an entry's line its unit's whatever it holds: a URL alone in a typewriter face, as \url breaks it, or numbers alone — TeX
    // set it in that entry, and left out of the unit it stood the original's where the drawn entry ran over it, 2610.35877v1)
    if (!words.length) continue
    // (a line of no text word — an address, a URL, a formula, a script — is no unit's line but the next of one of TeX's paragraphs
    // whose line before it a unit holds (below). CHANGED: today's left every such line out)
    const bare = L.cls !== 'references' && !words.some(textual)
    // (a list's line whose page number the ledger cut as a line of its own ends its entry as well: ledger.mjs listedOf)
    segs.push({ ...L, words, ended: ended || (L.cls === 'contents' && L.listed === true), ...(bare ? { bare: true } : {}) })
  }
  // units of lines (rule 3)
  const groups = [], entryGroups = new Map()
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
    // (CHANGED: a paragraph TeX ended between the two lines parts them, a start of TeX's after the end marked or not (ink.mjs
    // `paraEnds`): a class's paragraph begun with no point of its own read as the one before. 2610.22065v1 p1, acmart's reference
    // format: its "ACM Reference Format:" line, a paragraph of its own, and the paragraph of the paper's front matter set again
    // under it, which no unit owns there, one unit)
    const ended = !!prev && prev.page === s.page && (pages[s.page - 1]?.paraEnds ?? []).some(e => e.glyph > Math.max(...prev.gs) && e.glyph <= Math.min(...s.gs))
    const joins = follows && !ended && s.cls !== 'heads' && (s.cls !== 'contents' || !prev.ended) && (paras ? prev.para === s.para : s.cls === 'notes' || s.cls === 'orphan' || s.cls === 'contents')
    // (a biblatex entry's lines its unit, by TeX's points alone: one entry over a column's or a page's break too, a running head or
    // foot between its parts its own unit — every entry its own)
    if (s.cls === 'references') { const g = entryGroups.get(s.entry); if (g) g.push(s); else { groups.push([s]); entryGroups.set(s.entry, groups.at(-1)) } continue }
    if (prev?.cls === 'references') { groups.push([s]); continue }
    // (a line of no text word joins the unit its line before belongs to, in one of TeX's paragraphs as the compile marked them —
    // never by the lines' places alone — and starts none: left out, it is a kept block's (rule 10) as before. JCAP's e-mail line
    // broken before its last address, 2609.20976v1; ACM's permission note before its DOI. CHANGED, with the line's filter above)
    if (s.bare) {
      if (joins && paras && prev.para === s.para) last.push(s)
      continue
    }
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
    // (an entry of no text word, a URL alone: nothing to translate, the original's)
    if (lines[0].cls === 'references' && !lines.some(l => l.words.some(textual))) continue
    const id = base + out.length
    let cls = (lines[0].cls === 'orphan' || lines[0].cls === 'notes') && namesOf(lines) ? 'names' : lines[0].cls
    // pieces: text words joined, a run of math or typewriter words a placeholder (rule 4), a run of words in another weight, slant
    // or colour than the unit's a group that sets it (rule 9)
    const pieces = [], phs = [], labelled = []
    let text = '', plain = ''
    const flushText = () => { if (text) { pieces.push({ t: 'text', s: sourceView(text) }); plain += text; text = '' } }
    const style0 = baseStyleOf(lines, pages, faces), open = []
    let runKey = styleKey(style0, style0), pairs = 0
    const closeRun = () => { while (open.length) pieces.push({ t: 'close', id: open.pop(), src: '}' }) }
    lines.forEach((l, li) => {
      // (its label, the glyphs its first line begins with that the class set before its text: kept as the original's, no text of
      // the unit's, its glyphs the unit's still, claimed and erased with its line, so that the reader keeps them where they stand;
      // CHANGED: stated, `labelled`, as the glyphs of the unit's label)
      let label = li === 0 ? labelLength(pages[l.page - 1].glyphs, l.words) : 0, first = 0
      if (label > 0) l.words = labelAsText(l.words, label)
      l.words.forEach((w, wi) => {
        let said = w.text
        if (label > 0) {
          const k = Math.min(label, w.gs.length)
          label -= k
          for (const g of w.gs.slice(0, k)) labelled.push([l.page, g])
          if (k === w.gs.length) { first = wi + 1; return }
          said = w.ts.slice(k).join('')
        }
        // (a space between two words of a line where a word's gap stands between them: none where the face alone cuts them, a
        // formula's stop or its "-axis" set against it)
        const space = wi > first ? gapBefore(pages[l.page - 1].glyphs, l.words[wi - 1], w) : li > 0
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
          text += said
        } else {
          const lastPh = phs.at(-1)
          // (a run of one face over a gap or a line: one placeholder, its source the run's characters whole — the piece's too, which
          // kept the first word's alone. Never over a line where a script stands at the break: TeX sets a script on its line after
          // the atom it belongs to, and breaks a formula only after a binary operation or a relation, so a run that ends its line
          // or opens the next with a script is no formula's part on the other, 2610.20030v1 p1's "Krajnc¹" and "¹Jožef Stefan
          // Institute" two marks. CHANGED: today's read no script in a text face, and joined every run of one face)
          const broken = wi === 0 && !!lastPh && (lastPh.tail !== 0 || (w.sc?.[0] ?? 0) !== 0)
          if (lastPh && lastPh.open && lastPh.fam === w.fam && !broken) {
            lastPh.gs.push(...w.gs.map(g => [l.page, g])); lastPh.src += w.text; lastPh.tail = w.sc?.at(-1) ?? 0
            if (lastPh.sign !== signOf(w)) lastPh.sign = 0
            if (w.group) lastPh.group = true
            pieces[lastPh.k].src = phSource(lastPh.fam, lastPh.src, lastPh.sign, lastPh.group)
            return
          }
          if (space) text += ' '
          flushText()
          const ph = { k: pieces.length, fam: w.fam, gs: w.gs.map(g => [l.page, g]), src: w.text, open: true, tail: w.sc?.at(-1) ?? 0, sign: signOf(w), group: !!w.group }
          phs.push(ph)
          pieces.push({ t: 'ph', src: phSource(w.fam, w.text, ph.sign, ph.group) })
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
    // (and one that echoes a unit of the author block, an affiliation REVTeX prints from its own lists, is of the names toggle as
    // that unit is, rule 8: the whole block one toggle, the owner's ruling of 2026-10-30)
    if (e !== undefined && (cls === 'orphan' || cls === 'notes') && unitClass(units[e]) === 'names') cls = 'names'
    const textGlyphs = lines.flatMap(l => l.words.filter(w => w.fam === 'text').flatMap(w => w.gs.map(g => [l.page, g])))
    if (echo === null && spell.length >= 4 && !inkEchoOf.has(key)) inkEchoOf.set(key, out.length)
    out.push({ id, kind: INK_KIND[cls], cls, echo, pieces: own, glyphs: { text: textGlyphs, ph: kept.flatMap(p => p.gs), runs: kept.map(p => [p.k, p.gs]), ...(labelled.length ? { label: labelled } : {}) }, rows: rowsOf(id, INK_KIND[cls], cls, lines, kept, own.length, pages) })
  }
  return out
}

/** a kept block's next line: within this many of its size below the block's lowest (a listing's blank line, two of its
 *  leading; the skip before a paragraph or a float a unit's text fills) */
export const KEPT_DY = PARA_DY
/** two glyphs on one baseline: within this share of the larger size (ledger.mjs LINE_DY) */
const BASELINE = 0.6

/**
 * The kept blocks of a document (rule 10): units of the ledger's lines no unit owns once the ink units have claimed theirs.
 * `pages` and `ledger` inkUnitsOf's; `owner(page, glyph)` the group that owns a glyph, null where none does (own.mjs's after
 * claimInk, and the figure units'); ids from `from` on (after the ink units). Returns ink units of inkUnitsOf's shape, each
 * `kept`, no pieces, its rows its lines' boxes and frames alone
 */
export function keptUnitsOf(pages, ledger, owner, { from }) {
  const fams = new Map(), images = new Map()
  // (a glyph of an included graphic, by where it sits whatever its line's class: inside a form XObject, or on an image placed on
  // its page — a picture's number, a tick of a plot, which no unit owns and which lights nothing)
  const imagesOf = p => {
    let list = images.get(p)
    if (list) return list
    const pg = pages[p - 1], B = pg?.boxes ?? [], P = pg?.paths ?? []
    list = []
    for (let b = 0; 4 * b + 3 < B.length; b++) if (P[b] === IMAGE_BOX) list.push(B.slice(4 * b, 4 * b + 4))
    images.set(p, list)
    return list
  }
  const graphic = (p, x) => x.form === true || imagesOf(p).some(([x0, y0, x1, y1]) => { const mx = (x.x0 + x.x1) / 2, my = (x.top + x.bottom) / 2; return mx >= x0 && mx <= x1 && my >= y0 && my <= y1 })
  const lines = []
  for (const L of ledger.lines ?? []) {
    const depth = L.region >> 1, body = (L.region & 1) === 1
    if (depth !== 0 || L.cls === 'figures') continue
    const G = pages[L.page - 1]?.glyphs ?? []
    // (its glyphs no unit owns and no graphic holds, in runs along the line: a running head's folio its own run beside the head
    // an ink unit claimed, never cut from its line with it)
    const out = new Set(L.gs.filter(g => !G[g] || owner(L.page, g) != null || graphic(L.page, G[g])))
    for (const run of runsOf(G, L.gs, out)) {
      const words = wordsOf(G, run, fams)
      if (!words.length) continue
      const part = { ...L, gs: run, x0: Math.min(...run.map(g => G[g].x0)), x1: Math.max(...run.map(g => G[g].x1)) }
      // (beside a unit's text on its baseline, its stream's neighbour a unit's glyph close across: that unit's label or number,
      // the original's ink its unit lights)
      if (besideUnit(pages[L.page - 1], part, owner)) continue
      lines.push({ ...part, words, body, lo: Math.min(...run), hi: Math.max(...run) })
    }
  }
  const blocks = []
  for (const s of lines) {
    const b = blocks.at(-1), prev = b?.lines.at(-1)
    const joins = !!b && prev.page === s.page && prev.region === s.region && (s.cls === b.cls || s.cls === 'symbols') &&
      s.y <= b.low + BASELINE * s.size && b.low - s.y <= KEPT_DY * Math.max(s.size, prev.size) && s.x0 < b.x1 && s.x1 > b.x0 &&
      nothingOwnedBetween(s.page, prev.hi, s.lo, owner, pages)
    if (joins) { b.lines.push(s); b.low = Math.min(b.low, s.y); b.x0 = Math.min(b.x0, s.x0); b.x1 = Math.max(b.x1, s.x1); continue }
    // (a line of no letter pair in a column's body starts no block: a brace, a mark beside the text)
    if (s.cls === 'symbols' && s.body) continue
    blocks.push({ cls: s.cls, body: s.body, lines: [s], low: s.y, x0: s.x0, x1: s.x1 })
  }
  return blocks.map((b, j) => {
    const id = from + j, kind = INK_KIND[b.cls] ?? (b.body ? INK_KIND.orphan : INK_KIND.heads)
    const rows = rowsOf(id, kind, b.cls, b.lines, [], 0, pages)
    return { id, kind, cls: b.cls, echo: null, kept: true, ...(addressesAlone(pages, b.lines) ? { address: true } : {}), pieces: [], glyphs: { text: b.lines.flatMap(l => l.gs.map(g => [l.page, g])), ph: [] }, rows: { ...rows, erase: [] } }
  })
}

/** CHANGED (with groupedAddresses): whether a kept block's lines are e-mail addresses and their separators alone — its text (a
 *  word's gap a space, a line's break white space) holding one address at least, plain (EMAIL_ADDRESS) or a group (ADDRESS_GROUP),
 *  and no letter or digit outside them —, stated on the block (`address`) for the lab, which reads such a block as the original's
 *  text where today translated it (the coordinator's ruling of 2026-11-10); nothing the bundle carries */
const ADDRESS_ALONE = new RegExp(`${ADDRESS_GROUP.source}|${EMAIL_ADDRESS.source}`, 'g')
function addressesAlone(pages, lines) {
  let s = ''
  for (const l of lines) {
    const G = pages[l.page - 1]?.glyphs ?? []
    l.words.forEach((w, wi) => { s += (wi > 0 ? (gapBefore(G, l.words[wi - 1], w) ? ' ' : '') : s ? '\n' : '') + w.text })
  }
  const rest = s.replace(ADDRESS_ALONE, '\u0000')
  return rest.includes('\u0000') && !/[\p{L}\p{N}]/u.test(rest)
}

/** a box an image placed (layout/ink.mjs `paths`: -3) */
const IMAGE_BOX = -3
/** a unit's glyph is a line's neighbour within this many of its size across (a label's \labelsep, a section number's \quad) */
const BESIDE = 2

/** a ledger line's glyphs `gs` less those of `out`, in runs: two glyphs one run where no glyph of `out` stands between them along
 *  the line */
function runsOf(G, gs, out) {
  const keep = gs.filter(g => !out.has(g)).sort((a, b) => G[a].x0 - G[b].x0)
  if (!keep.length) return []
  if (!out.size) return [gs]
  const cuts = [...out].filter(g => G[g]).map(g => (G[g].x0 + G[g].x1) / 2)
  const runs = [[keep[0]]]
  for (let k = 1; k < keep.length; k++) {
    const a = G[keep[k - 1]], b = G[keep[k]]
    if (cuts.some(x => x > (a.x0 + a.x1) / 2 && x < (b.x0 + b.x1) / 2)) runs.push([keep[k]])
    else runs.at(-1).push(keep[k])
  }
  return runs
}

/** whether a line's stream neighbour, the first glyph with ink before it or after it, is a unit's on its baseline, close across
 *  (within BESIDE of its size) and in its column on a page of two */
function besideUnit(page, L, owner) {
  const G = page?.glyphs ?? []
  const lo = Math.min(...L.gs), hi = Math.max(...L.gs)
  const two = columnsOf(page ?? {}) === 2, mid = page?.view ? (page.view[0] + page.view[2]) / 2 : 0
  const side = x => (x < mid ? 0 : 1)
  const near = g => {
    const x = G[g], size = Math.max(x?.size ?? 0, L.size)
    if (!x || owner(L.page, g) == null || Math.abs(x.y - L.y) > BASELINE * size || Math.max(L.x0 - x.x1, x.x0 - L.x1) > BESIDE * size) return false
    return !two || side((x.x0 + x.x1) / 2) === side((L.x0 + L.x1) / 2)
  }
  let a = lo - 1
  while (a >= 0 && (G[a]?.blank || !/\S/u.test(G[a]?.u ?? ''))) a--
  let b = hi + 1
  while (b < G.length && (G[b]?.blank || !/\S/u.test(G[b]?.u ?? ''))) b++
  return (a >= 0 && near(a)) || (b < G.length && near(b))
}

/** whether no glyph between two of a page's stream places (exclusive) is a unit's; false where they are not in stream order */
function nothingOwnedBetween(page, a, b, owner, pages) {
  if (b <= a) return false
  const G = pages[page - 1]?.glyphs ?? []
  for (let g = a + 1; g < b; g++) if (G[g] && owner(page, g) != null) return false
  return true
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

/** a column body's bracket or a float's (marks.mjs POINTS_TEX: bs, be, fs, fe and a number) */
const BRACKET = /^([bf])([se])(\d+)$/
/** a point that ends what a paragraph holds: a unit's, a heading's or a cell's end mark, a body's or a float's bracket */
const CLOSES = /^(?:\d+|[th]\d+)e$|^[bf][se]\d+$/
/** a unit's, a heading's or a cell's start mark */
const OPENS = /^(?:\d+|[th]\d+)s$/
/** a paragraph end's code (ink.mjs PARA_END: `qe<n><code>`) */
const endCode = name => name.at(-1)

/**
 * An ink unit's alignment as TeX set its paragraph (rule 6), from the paragraphs' ends of our compile (ink.mjs `paraEnds`,
 * marks.mjs POINTS_TEX `qe<n><code>`): c, l, r or j, or null where no paragraph tells it. The end right after the unit's last
 * glyph, no paragraph begun and no other point between them, is its paragraph's end, and so is the end after a unit that its
 * paragraph's start (`q<n>`) stands before with nothing ended between, no other start between it and that end (a line of the
 * paragraph that is not its last): the unit's last line is its paragraph's last, and its lines are set as TeX set that paragraph
 * (with every end inside the unit the same code; ends of two codes, a unit of paragraphs set two ways: j, not centred): either
 * way with nothing between its last glyph and that end, no paragraph begun and no unit's end or start mark or bracket. An end
 * further on, the first after its last glyph in its body or its float — past the column's or the page's end to the next body,
 * a float in between passed over: a paragraph TeX broke across them —, is the end of the paragraph the unit's last line is
 * inside, or of the paragraph after it where the unit is a line TeX set between paragraphs (a \centerline, a box): where it
 * tells it not centred (l, r, j) the unit is not either way, and is j (never flush: that paragraph may not be the unit's);
 * where it tells c the unit may be neither, and nothing is told. No end before its float's end or a body's start (a running head, a foot), none told. `directOnly`: only
 * the end right after its last glyph tells it (a running head: the body's paragraph after it is no paragraph of its)
 */
function alignOf(lines, pages, directOnly = false) {
  let first = null, last = null
  for (const l of lines) for (const g of l.words ? l.words.flatMap(w => w.gs) : (l.gs ?? [])) {
    if (!first || l.page < first[0] || (l.page === first[0] && g < first[1])) first = [l.page, g]
    if (!last || l.page > last[0] || (l.page === last[0] && g > last[1])) last = [l.page, g]
  }
  if (!last) return null
  // (a page's ends and brackets in its stream's order: an end stands before the point it counts as its `point`, and a point at
  // glyph n before glyph n)
  const marksOn = p => {
    const P = pages[p - 1]
    if (!P) return []
    const out = [], ends = P.paraEnds ?? [], points = P.points ?? []
    let e = 0
    for (let q = 0; q <= points.length; q++) {
      for (; e < ends.length && (ends[e].point ?? points.length) <= q; e++) out.push({ glyph: ends[e].glyph, end: endCode(ends[e].name), point: ends[e].point, para: ends[e].para })
      const m = q < points.length ? BRACKET.exec(points[q].name) : null
      if (m) out.push({ glyph: points[q].glyph, bracket: m[1] + m[2], n: m[3] })
    }
    return out
  }
  // (nothing between the unit's last glyph and an end, the one rule both readings below keep: no paragraph begun, and no unit's,
  // heading's or cell's end or start mark nor a float's or a body's bracket. The end of a paragraph begun after the unit with no
  // glyph of its own, one past another unit's end (a paragraph ended at a source unit's end mark has no end of its own, and the
  // next may begin no `q`), one past another unit's start (a paragraph of that unit's: a table's first cell before its text,
  // 2610.21084v1's captions), a float's or a body's bracket, is no end of the unit's paragraph; a name's or a placeholder's mark,
  // inside a paragraph, is no paragraph's end)
  const L = pages[last[0] - 1]
  const nothingBetween = x => {
    if (x.para !== undefined && x.para !== (L?.paras ?? []).filter(q => q.glyph <= last[1]).length) return false
    if (x.point === undefined) return true
    const pts = L?.points ?? []
    for (let q = pts.filter(t => t.glyph <= last[1]).length; q < x.point; q++) { const n = pts[q]?.name ?? ''; if (CLOSES.test(n) || OPENS.test(n)) return false }
    return true
  }
  // (a unit inside a paragraph, not its last line: its paragraph's start (q<n>, ink.mjs `paras`) before its first glyph on its page
  // with no paragraph end and no unit's end mark or bracket between them, and nothing between its last glyph and the end
  // (nothingBetween): the lines of one paragraph TeX broke with \\, a tabular's cell inside a centred paragraph)
  const F = pages[first[0] - 1]
  const insideOf = x => {
    if (first[0] !== last[0] || !F) return false
    const paras = F.paras ?? []
    let qi = -1
    for (let k = 0; k < paras.length; k++) if (paras[k].glyph <= first[1]) qi = k
    if (qi < 0) return false
    if ((F.paraEnds ?? []).some(e => (e.para ?? 0) > qi && e.glyph <= first[1])) return false
    return !(F.points ?? []).some(t => t.glyph > paras[qi].glyph && t.glyph <= first[1] && CLOSES.test(t.name))
  }
  const inside = new Set()
  for (let p = first[0]; p <= last[0]; p++) for (const x of marksOn(p)) if (x.end && (p > first[0] || x.glyph > first[1]) && (p < last[0] || x.glyph <= last[1])) inside.add(x.end)
  let told = null, direct = false, within = false, float = null, between = false
  walk: for (let p = last[0]; p <= pages.length; p++) {
    for (const x of marksOn(p)) {
      if (p === last[0] && x.glyph <= last[1]) continue
      if (between) { if (x.bracket === 'bs') between = false; continue }
      if (float !== null) { if (x.bracket === 'fe' && x.n === float) float = null; continue }
      if (x.end) { told = x.end; const clear = p === last[0] && nothingBetween(x); direct = clear && x.glyph === last[1] + 1; within = clear && !direct && insideOf(x); break walk }
      if (x.bracket === 'be') between = true
      else if (x.bracket === 'fs') float = x.n
      else break walk
    }
  }
  if (directOnly && !direct) return null
  const codes = new Set(inside)
  if (told) codes.add(told)
  if (!codes.size) return null
  const notC = [...codes].filter(c => c !== 'c')
  if (direct || within || !told) return notC.length === 0 ? (told ? 'c' : null) : notC.length === 1 && codes.size === 1 ? notC[0] : 'j'
  return notC.length === 0 ? null : 'j'
}

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
    // (its baseline, size and face its text words'; a line of none, an entry's URL alone, its own glyphs')
    const set = tg.length ? tg : gs
    const base = modeOf(set.map(g => r2(G[g].y))), size = modeOf(set.map(g => r2(G[g].size))), font = modeOf(set.map(g => G[g].font ?? '?'))
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
  // its alignment as TeX set its paragraph (alignOf: CENTRED, FLUSH_LEFT, FLUSH_RIGHT or JUSTIFIED, layout/file.mjs UNIT_FLAG), a
  // running head's by its paragraph's own end alone; where none tells it, a head's line centred where it stands on its page's
  // middle and short of its width, a contents list's line JUSTIFIED as before (no paragraph end is set in a contents list, whose
  // gate keeps the marks out: its lines a list's, never the reader's to read, where one centred on its page by chance would be
  // drawn so, 2610.19274v1's list of figures), and any other unit's alignment nothing (the reader's reading of its lines:
  // layer2.mjs blocksOf2). A kept block (no pieces: nothing drawn over it) none
  const told = nPieces > 0 ? alignOf(lines, pages, cls === 'heads') : null
  let flags = told === 'c' ? UNIT_FLAG.CENTRED : told === 'l' ? UNIT_FLAG.FLUSH_LEFT : told === 'r' ? UNIT_FLAG.FLUSH_RIGHT : told === 'j' ? UNIT_FLAG.JUSTIFIED : 0
  if (told === null && nPieces > 0 && cls === 'contents') flags = UNIT_FLAG.JUSTIFIED
  if (cls === 'heads' && lines.length === 1 && flags !== UNIT_FLAG.CENTRED) {
    const view = pages[lines[0].page - 1].view, mid = (view[0] + view[2]) / 2, a = lineRows[1], b = lineRows[2]
    if (Math.abs((a + b) / 2 - mid) <= CENTRE && b - a < 0.8 * (view[2] - view[0])) flags = UNIT_FLAG.CENTRED
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
