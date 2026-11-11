// lab/pdf/prepare-back/stated.mjs: stage 1a's --baseline statement (run.mjs, and restate.mjs over a run's dumps): each unit of
// the baseline's the candidate does not make, stated as the candidate's, with the cause the differential reads
// (baseline/tools/diff.mjs: a loss whose cause an entry of baseline/acceptance.json matches is accepted). For one of today's ink
// units and figure texts, a unit made on arXiv's page that stands for it, read otherwise there: of its kind (a names unit's, or of
// the ledger class the author block's rule gives it back outside the block), no baseline unit's
// id, at its place (its first line's page and box) or, with no line, at its ord (today's bundle's order, which the dump keeps),
// with how it reads otherwise (CAUSE); none of its kind, a kept block of its kind at its place; none of either, a unit of the
// author block's now holding its glyphs, a unit of the block standing for it after the name before's trail, one unit holding it
// whole, or the block's units holding its line between them. And one the candidate makes and the guard left unmarked, held whole
// by one drawn unit with its text ((i)): that statement (`own`, the candidate's unit) is written on the candidate's unit itself,
// its own reason kept (`stated.was`), since the differential pairs today's unit with it. Each cause the coordinator's rulings of 2026-11-09 and 2026-11-10
// accept is a check of the units (and of the trails the candidate's members carry, and of arXiv's glyphs on the line), never a
// list of ids. Each statement names the unit of the candidate's that holds today's whole, where one does (`holder`): the parity
// joins the two by it (lab/typeset/parity/join.mjs heldJoin)
import { readingOf, scriptsKeptAsElements, scriptsKeptInAnotherOrder } from '../../../packages/typeset/tests/replay/l1.ts'
import { classifyFont } from '../../../packages/engine/src/locate/facts.ts'
import { unitClass } from '../../../packages/engine/src/locate/today/content-classes.mjs'
import { symbolText } from '../../../src/pdf-reader/engine/rules/text-symbols.mjs'
import { identifiersIn, inMemory, loadProject } from '../../../src/pdf-reader/engine/source/latex-front.mjs'
import { isInkless } from '../../../src/pdf-reader/engine/translate/mt.mjs'

/** how a unit made on arXiv's page reads where it stands for one of the baseline's */
export const CAUSE = Object.freeze({
  order: 'its characters in another order',
  head: "its head's number in its phrase",
  // ((a): an ink unit whose raised or lowered marks today held as text, or as text and a placeholder, are now its elements
  // (rebuild/script-face), its text and theirs read as today's unit's, keptJoin's reading)
  scripts: 'its scripts kept as elements',
  // ((d): (a) with an element's characters, as many and each as often, in another order than today's there)
  orderAsElement: 'its characters in another order, read as an element',
  // ((b'): a unit whose glyphs a unit of the author block now holds (an author or affiliation unit the front end reads from the
  // class's definitions, or an ink unit ink-units.mjs reads as theirs, inknames), the names toggle's, whatever today's kind)
  names: 'a line of the author block, kept by the names toggle',
  // ((c): today's line whose leading marks are the trail rebuild/front-matter gives the name before, the rest v2's unit; (c'),
  // 2026-11-10: v2's unit a unit of the author block of any kind, today's of another)
  trail: "its marks are the name before's trail",
  // ((e): a unit whose every line v2 now keeps whole as a block of its kind, no text of it sent, every one inside a display the
  // engine states (a display element's box on A of a candidate unit's: TeX's marked compile states the display): accepted)
  display: "its display lines kept as the original's",
  // ((e)'s first condition alone, no display the engine states over them (2608.25210v2's address lines; 2608.08481v1's displays
  // (7), (8), set at the page's foot, no source unit's): stated, not accepted)
  kept: "its lines kept whole as the original's",
  // ((f): a unit of today's whose every line one unit of the candidate's holds and no other meets (its lines, its elements' boxes,
  // its label's), of any class, today's glyph text an in-order part of that unit's: accepted)
  held: 'held whole by another unit',
  // ((o), the coordinator's rulings of 2026-11-11 on lane style-wire: a source unit of today's the candidate writes as today's
  // TeX with each kernel or textcomp text symbol that is a character of its text now (latex-front.mjs textCharacter: `\%`, `\&`,
  // `\#`, `\$`, `\{`, `\}`, \textasciitilde, \textbar, \textless, \textgreater, \textbackslash) its character, and each group
  // that carries nothing its content (instrument.mjs passThroughOf), and the marks a command prints around its argument text
  // (latex-front.mjs wrapOf: \\enquote's quotation marks): the same unit, its id moved with its pieces, wherever either lays it
  // (its holder the candidate's unit))
  characters: 'the same unit as v2 writes it: its escaped characters text, a group that carries nothing its content, the marks a command prints text, a link with no address its argument',
  // ((f)'s holding by a kept block, no text of it sent (2608.06007v1's biblatex bibliography kept whole): no text to read, stated
  // apart, not accepted)
  heldKept: 'held whole by a kept block, no text of it sent',
  // ((F), 2026-11-10: (f)'s holding by a kept block of a line whose text is e-mail addresses and their separators alone: no word
  // of it a translator is sent, wherever it stands (2610.40576v1's e-mail line, a kept block of the candidate's): accepted)
  addresses: 'a line of e-mail addresses, kept whole',
  // ((f'), 2026-11-10: a line of today's whose every glyph of ink a unit of the author block holds, two or more of them, one
  // after the other, no glyph of ink between them: TeX's inter-word or inter-member space alone, read off arXiv's glyphs on the
  // line (2609.26457v1 t279: the name before's raised "1", then "and"): accepted)
  heldBlock: "held whole by the author block's units on its line",
  // ((j), 2026-11-10: a unit whose glyph text is one contiguous part of consecutive units' of the candidate's, in their order,
  // each on today's box (2610.19159v1 t1906: today's orphan line, v2's two figure texts on it): accepted)
  split: 'split across consecutive units, its text theirs in order',
  // ((g), the coordinator's ruling of 2026-11-10, round 8 B2: v2's unit made on arXiv's page, laid, on today's lines, its text
  // arXiv's glyph text there and today's a subsequence of it: characters our old compile did not set, 2610.21084v1's initials,
  // which cas-common lost where our marks stood in the names it took apart: accepted)
  arxivText: "another reading, now arXiv's text",
  // ((g) over (j)'s parts, the coordinator's ruling of 2026-11-10, round 8 B3: v2's stand-in of today's unit and the units after
  // it, consecutive, on today's lines, made on arXiv's page and laid, their texts joined arXiv's glyph text on those lines
  // exactly, today's an in-order subsequence of it (2610.21084v1 t587, rebuild/author-lines-3 parting its note at TeX's
  // paragraph ends): accepted)
  arxivParts: "another reading, now arXiv's text, over consecutive units",
  // ((h), the same ruling: v2's unit today's text on today's lines and whole lines more that carry no text word, each held by its
  // elements, which the join rule adds (ink-units.mjs: an address or a URL TeX broke onto a line of its own, 2610.22214v1's ACM
  // DOI): accepted)
  wrapped: 'held whole, with its wrapped no-word lines',
  // ((k), 2026-11-10: a unit the prepare keeps for its text set wholly in a face of one pitch (Rule 1, PDF-READER §18.22: the
  // engine's `pitch`, the dump's `keptBy: 'pitch'`), the original's text, no translation missing; the candidate's own unit's
  // cause, keptWhyOf: accepted)
  pitch: 'kept as the original: set wholly in a face of one pitch',
  // ((k) by group, lane b5-fixes, the owner's ruling of 2026-11-11 (PDF-READER §18.22, Rule 1 read by group): a source unit of
  // today's the candidate writes as one TeX source, a group of it one element its prepare keeps for its pitch (the dump's element
  // `keptBy: 'pitch'`): the same unit, its id moved with its content, that group the original's ink, never sent, the rest of it
  // translated)
  pitchGroup: 'a group of it kept as the original: set wholly in a face of one pitch',
  // ((l), the coordinator's ruling of 2026-11-10, round 8 B5, and (l'), its extension the same day: today's ink unit whose every
  // line one source unit of v2's holds (no other meets them), both read as the reader sees them (seenOf): each formula's span one
  // placeholder (today's formula runs: its placeholders and the digits its ledger read as text inside or right beside them; v2's
  // math elements, digits beside them alike), every other element and a label as their ink on arXiv's page prints them, v2's text
  // through TeX's ligatures, letters case apart where today's glyphs are in a face of small capitals; today's then holding a letter
  // and a contiguous stretch of v2's, white space aside: 2610.21377v1 pp. 34-43, which today's front end read off arXiv's ink
  // after a `$…\)` and v2's reads as TeX's paragraphs: accepted)
  seen: 'held whole by a source unit, read as arXiv prints it',
  // ((k) for the identifier rule, the coordinator's ruling of 2026-11-10 on rebuild/literal-fixes (PDF-READER §18.25): what the
  // prepare keeps whole as identifiers, the original's text, no translation missing: the candidate's figure text kept for one
  // (the engine's `figure: identifier`, the dump's `keptBy: 'identifier'`), and today's unit of identifiers alone the candidate
  // makes no unit of (a cell: the front end's identifiersIn holds its whole text) or holds in a kept block alone (a line of ink),
  // stated with the same mark: accepted)
  identifier: 'kept as the original: an identifier is never sent',
  // ((n), F0 (rebuild/fig-text): today's unit now wholly a stretch of a figure text a decoration holds (a frame, an underline or
  // a tone under it: the dump's `keptBy: 'decoration'`), kept as the original's ink with its decoration inside the translated
  // text: accepted, the coordinator's ruling of 2026-11-10 on F0)
  decoration: 'kept as the original: a stretch a decoration holds, carried with it',
  // ((m), F1 (rebuild/fig-text): today's unit inside a formula of a figure, kept as the original: wholly a formula element of a
  // figure text (`keptBy: 'formula'` on the element), or held whole by a figure's line no word of which stands outside its
  // formulas, kept whole (`keptBy: 'formula'` on the unit, whose own cause it is too); not accepted until the coordinator rules)
  formula: 'kept as the original: inside a formula of a figure',
  another: 'another reading',
  // ((p), F3 (rebuild/fig-text, PDF-READER §18.36): today's figure text an item's marker and its words, v2's the words, the marker
  // its label, kept as the original's ink (the dump's `label` at today's line start): the item holds today's whole)
  item: "held whole, its marker now its label, the original's ink",
  // ((q), F3: a figure text drawn twice over itself, kept as the original by the owner's ruling (two translations would be drawn
  // over each other; the dump's `keptBy: 'double'`, the engine's `double`): the candidate's own unit's cause)
  double: 'kept as the original: drawn twice',
  // ((f): a unit the candidate does not make, every line of it inside a line the engine reads as a display's formula (a display
  // TeX's marked compile states, its text-mode glyphs read as text: locate's `displays`): the display's ink, kept with it — the
  // coordinator's ruling of 2026-11-09; 2608.08481v1 t118-t121, (7)'s and (8)'s parts)
  displayPart: "kept on arXiv's page as part of a display",
})
/** how the parity joins (lab/typeset/parity/join.mjs) a member of the candidate's to the unit of today's a statement names it the
 *  holder of, by the statement's cause: 'whole', the holder holds today's unit whole, its member is today's unit (heldJoin one
 *  for one; joinedJoin where one holds two or more in order); 'element', today's unit is now wholly an element of the holder,
 *  one of the units it holds in order (joinedJoin alone: joined one for one, the holder's other text would be read as today's).
 *  Every cause a statement names a holder by is declared here, and statedOf refuses one that is not (holdersDeclared): round 8
 *  B8's first parity read none of lane style-wire's `characters` statements, the join's own list having gained b5-fixes'
 *  `pitchGroup` by hand and not it, nor (l')'s `seen` */
export const HOLDER_JOIN = Object.freeze({
  held: 'whole',
  names: 'whole',
  heldBlock: 'whole',
  order: 'whole',
  seen: 'whole',
  pitchGroup: 'whole',
  characters: 'whole',
  pitch: 'element',
  decoration: 'element',
  formula: 'element',
  item: 'whole',
})
/** `out` (statedOf's statements) where every one naming a holder has its cause declared in HOLDER_JOIN; else an error naming the
 *  cause, so that a run never writes a statement the parity's join would not read */
export function holdersDeclared(out) {
  for (const s of out)
    if (s.holder && !Object.hasOwn(HOLDER_JOIN, s.cause))
      throw new Error(`stated.mjs: the cause '${s.cause}' names a holder, and HOLDER_JOIN does not say how the parity joins it`)
  return out
}

/** the ledger's classes of the blocks rule 8 makes names (ink-units.mjs: notes and orphans), which a names unit outside the author
 *  block is again */
const LEDGER_OF_NAMES = new Set(['inknotes', 'inkorphan'])
/** the reason a dump gives a unit the layout guard left unmarked (its marks taken out: locate finds none, run.mjs `unlocated:
 *  <cause>`), which (i) reads */
const UNMARKED = 'unlocated: marks'
/** the reason a dump gives a unit of the candidate's set in a paragraph that sets a unit again (rebuild/author-lines-3's re-set
 *  paragraph: acmart's reference format one ink unit), which (i) reads too (the coordinator's ruling of 2026-11-10, round 8 B3) */
const RESET = 'unlocated: set in a paragraph that sets a unit again'
/** (k): the cause a candidate's own unit states where the prepare keeps it for its text set wholly in a face of one pitch, or
 *  for an identifier, by the mark it writes (the dump's `keptBy`, 'pitch' or 'identifier', which the parity's rulings read too);
 *  (m) where it keeps a figure's line of formulas alone (`keptBy: 'formula'`, F1), (q) a figure text drawn twice (`keptBy:
 *  'double'`, F3); else null: a unit kept otherwise (a code
 *  environment's kept block, a crowded figure text) states none */
export const keptWhyOf = (u) =>
  u?.keptBy === 'pitch'
    ? CAUSE.pitch
    : u?.keptBy === 'identifier'
      ? CAUSE.identifier
      : u?.keptBy === 'formula'
        ? CAUSE.formula
        : u?.keptBy === 'double'
          ? CAUSE.double
          : null

/** (l'): TeX's ligatures of a text face's input, its font's ligature table (Knuth's cmr, and every text font after it): an em dash,
 *  an en dash, the curly double and single quotes */
const TEX_LIGATURES = [['---', '\u2014'], ['--', '\u2013'], ['``', '\u201c'], ["''", '\u201d'], ['`', '\u2018'], ["'", '\u2019']]
const ligatured = (s) => TEX_LIGATURES.reduce((t, [a, b]) => t.replaceAll(a, b), s)
/** (l): the elements of a source unit that are formulas (the dump's element kinds: an inline formula, a display) */
const MATH_ELEMENTS = new Set(['math', 'display'])
/** (l): a formula's span as one character, and an element that reads as nothing of today's */
const FORMULA_MARK = '\ufffc'
const UNREAD = '\u2400'
/** how near two boxes' edges are one edge (PDF units: lines and boxes are stated to a hundredth) */
const ON = 0.05
/** how many groups opened after `from` are open at `at` (a piece directly in a group whose content begins at `from`: 0) */
const depthAt = (ps, from, at) => {
  let d = 0
  for (let k = from; k < at; k++) d += ps[k].kind === 'open' ? 1 : ps[k].kind === 'close' ? -1 : 0
  return d
}
/** today's TeX of a unit as v2 writes it: each text symbol that is a character of v2's text its character (a control word's
 *  skipped spaces and a group around it alone with it, as TeX reads them), the pieces of `drop` (the ends of the groups v2
 *  writes as their content) out, white space as one space; null where no piece is either */
function writtenAs(ps, drop, marked = new Set(), verbatim = new Set()) {
  // (literal stretches, and where a command's pair stood that v2 writes as the marks it prints: those marks or nothing)
  const parts = ['']
  let changed = drop.size > 0 || verbatim.size > 0
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k]
    // (a group v2 writes as one placeholder of the same TeX: as it is written, its symbols the source's)
    if (verbatim.has(k)) {
      parts[parts.length - 1] += p.kind === 'text' ? p.s : (p.src ?? '')
      continue
    }
    if (drop.has(k)) {
      if (marked.has(k)) parts.push(null, '')
      continue
    }
    const sym = p.kind === 'ph' ? characterOf(p.src) : null
    const group = p.kind === 'open' && p.src === '{' && ps[k + 1]?.kind === 'ph' && characterOf(ps[k + 1].src) !== null && ps[k + 2]?.kind === 'close'
    let add = ''
    if (group) {
      add = characterOf(ps[k + 1].src)
      changed = true
      k += 2
    } else if (sym !== null) {
      add = sym
      changed = true
      // (TeX skips the spaces after a control word, not after the empty group that ends one)
      if (/^\\[A-Za-z]/.test(p.src) && !/\{\}$/.test(p.src) && ps[k + 1]?.kind === 'text') add += ps[++k].s.replace(/^[ \t]+/, '')
    } else add = p.kind === 'text' ? p.s : (p.src ?? '')
    parts[parts.length - 1] += add
  }
  if (!changed) return null
  // (no marks: today's TeX with those pairs out, white space as one space over the whole, as texOf reads a unit)
  const plain = parts.filter((x) => x !== null).join('').replace(/\s+/g, ' ').trim()
  if (parts.length === 1) return (x) => x === plain
  // (pairs side by side one place)
  const t = parts.map((x) => x ?? '\ue000').join('').replace(/\s+/g, ' ').replace(/\ue000+/g, '\ue000').trim()
  // (or marks, characters no letter, digit or space, at one place or more: a place between two spaces holds its marks before one of
  // them, or none and one space)
  const escape = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const M = '[^\\p{L}\\p{N}\\s]'
  const bits = t.split('\ue000')
  let src = ''
  for (let i = 0; i < bits.length; i++) {
    let left = bits[i]
    if (i === bits.length - 1) { src += escape(left); break }
    const right = bits[i + 1]
    if ((left.endsWith(' ') || i === 0 && left === '') && right.startsWith(' ')) { src += `${escape(left)}(?:${M}+ )?`; bits[i + 1] = right.slice(1); continue }
    if (left.endsWith(' ') && i + 1 === bits.length - 1 && right === '') { left = left.slice(0, -1); src += `${escape(left)}(?: ${M}+)?`; continue }
    src += `${escape(left)}${M}*`
  }
  const re = new RegExp(`^${src}$`, 'u')
  return (x) => x === plain || re.test(x)
}
/** REVTeX's link with no address, a placeholder of today's */
const NOOP = /^\\href@noop(?![A-Za-z@])/
/** a placeholder's source as the front end reads it in a bibliography entry now (latex-front.mjs: REVTeX's \\href@noop one of
 *  its text commands, step D), as dump pieces: the entry's pieces after a word of ours (an entry of no words is no unit), its
 *  text as characters; null where it makes no entry */
function entryPiecesOf(src) {
  const tex = `\\documentclass{article}\\begin{document}\nSome text.\n\\begin{thebibliography}{1}\n\\bibitem{a}Qzxv ${src}\n\\end{thebibliography}\n\\end{document}\n`
  const p = loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex')
  const first = p.units.find((x) => x.kind === 'reference')?.pieces
  if (first?.[0]?.t !== 'text' || !/^\s*Qzxv /.test(first[0].s)) return null
  const u = { pieces: first }
  const chars = (x) => new TextDecoder().decode(Uint8Array.from([...x].map((c) => c.charCodeAt(0))))
  const out = u.pieces.map((q) => (q.t === 'text' ? { kind: 'text', s: chars(q.s) } : { kind: q.t, src: chars(q.src ?? '') }))
  out[0].s = out[0].s.replace(/^\s*Qzxv /, '')
  if (!out[0].s) out.shift()
  if (out.at(-1)?.kind === 'text') out.at(-1).s = out.at(-1).s.replace(/\s+$/, '')
  return out
}
/** a dump unit's TeX: its text and each other piece's source, white space as one space */
const texOf = (x) => (x.pieces ?? []).map((p) => (p.kind === 'text' ? p.s : (p.src ?? ''))).join('').replace(/\s+/g, ' ').trim()
/** the text symbols that are characters of v2's text (latex-front.mjs TEXT_CHARACTERS) */
const TEXT_CHARACTERS = new Set(['\\%', '\\&', '\\#', '\\$', '\\{', '\\}', '\\textasciitilde', '\\textbar', '\\textless', '\\textgreater', '\\textbackslash'])
/** a placeholder's source as that character (alone or before `{}`, its control word's trailing spaces aside), else null */
const characterOf = (src) => {
  const m = /^(\\(?:[A-Za-z]+|[%&#$_{}]))(?:\{\})?[ \t]*$/.exec(src ?? '')
  return m && TEXT_CHARACTERS.has(m[1]) ? symbolText(m[1]) : null
}
/** an e-mail address as a line of addresses writes it: one local part, or several in braces before one domain, at a domain of
 *  two labels or more (RFC 5322's dot-atom, its letters any script's) */
const ADDRESS = /(?:\{[^{}@]+\}|[\p{L}\p{N}!#$%&'*+/=?^_`|~.-]+)@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
/** a text of e-mail addresses and their separators alone: one address at least, no letter or digit outside them */
export const addressesOnly = (s) => {
  const rest = s.replace(ADDRESS, '\u0000')
  return rest.includes('\u0000') && !/[\p{L}\p{N}]/u.test(rest)
}

/** a text of identifiers alone (the front end's identifiersIn: a token holding an underscore between two word characters, its
 *  brackets with it): one identifier at least, no letter or digit outside them */
export const identifiersOnly = (s) => {
  let rest = '',
    at = 0
  const ids = identifiersIn(s)
  for (const [a, b] of ids) {
    rest += s.slice(at, a)
    at = b
  }
  rest += s.slice(at)
  return ids.length > 0 && !/[\p{L}\p{N}]/u.test(rest)
}

/** the trails among a candidate's elements (`[k, el]`, as locate's members and a part's members carry them: El.trail, its ink
 *  one box `[page, x0, bottom, x1, top, baseline]`, its characters `copy`), each as statedOf reads one */
export const trailsOf = (els) =>
  els
    .filter(([, e]) => e?.trail && e.ink?.length === 1)
    .map(([, e]) => {
      const [page, x0, bottom, x1, top, baseline] = e.ink[0]
      return { page, x0, x1, bottom, top, baseline, text: e.copy ?? '' }
    })

/**
 * `base` the baseline dump's units, `units` the candidate's own (none stated yet), `trails` the trails the candidate's members
 * carry (rebuild/front-matter's El.trail: its ink's box `page`, `x0`, `x1`, `top`, `bottom`, `baseline` and its characters
 * `text`), `labels` the number each candidate unit's label states (Label.num, by the unit's ord in the dump), `glyphs` arXiv's
 * glyphs on a page as the engine reads A (DocGlyph: `u`, `x0`, `x1` its advance, `y` its baseline, `blank`), null where not read,
 * `displays` the lines on arXiv's page the candidate reads as a display's formula (locate's `displays`: `[page, x0, bottom, x1,
 * top, baseline]`):
 * each baseline unit the candidate does not make, in the baseline's order, `{ u, why, cause, holder }` (`cause` CAUSE's key, or
 * `content` for a content difference, `keptAt` for a kept block at its place; `holder` the id of the candidate's unit holding
 * it whole, held (f), by the block (b') or by the block's units (f'), the one whose glyph text is today's, or a names unit's
 * stand-in of its ledger class with today's characters in another order; `keptBy` the prepare's mark of a unit kept by a
 * rule, 'identifier', which the dump writes on the statement as on a unit of its own); one it has no statement for (absent
 * from the candidate) is left out
 */
export function statedOf(base, units, { trails = [], labels = new Map(), glyphs = () => null, displays: shown = [] } = {}) {
  const out = []
  const have = new Map()
  for (const u of units) have.set(u.id, (have.get(u.id) ?? 0) + 1)
  const baseIds = new Set(base.map((u) => u.id))
  const free = units.filter((u) => !baseIds.has(u.id) && !u.replaced)
  const meets = (a, b) =>
    a.page === b.page &&
    a.x0 < b.x1 &&
    b.x0 < a.x1 &&
    Math.min(a.top, a.bottom) < Math.max(b.top, b.bottom) &&
    Math.min(b.top, b.bottom) < Math.max(a.top, a.bottom)
  const sameLine = (a, b) =>
    a.page === b.page && Math.abs(a.x0 - b.x0) <= ON && Math.abs(a.x1 - b.x1) <= ON && Math.abs(a.baseline - b.baseline) <= ON
  const standsFor = (u) => {
    const L = u.lines?.[0]
    const at = (c) => (L && c.lines?.[0] ? meets(L, c.lines[0]) : c.ord === u.ord)
    let k = free.findIndex((c) => c.kind === u.kind && at(c))
    // (none of its kind: a names unit of today's rule 8 the author block's rule moved out of the block, its ledger class's now
    // (rebuild/author-toggle: the names toggle the block under the title's alone), 2610.21084v1's page-foot note of the e-mails,
    // 2610.21106v1's end addresses; never a kept block, which the rule makes none of)
    if (k < 0 && u.kind === 'inknames') k = free.findIndex((c) => LEDGER_OF_NAMES.has(c.kind) && !c.kept && c.pieces?.length && at(c))
    return k < 0 ? null : free.splice(k, 1)[0]
  }
  const chars = (p) => [...(p.kind === 'text' ? p.s : p.kind === 'ph' ? p.src : '')].sort().join('')
  // (the dump's flat pieces as sourcePieces' form, which keptJoin's reading takes)
  const flatOf = (ps) => ps.map((p) => ({ ...p, t: p.kind }))
  // (a unit's glyphs' characters, white space no glyph: its texts' and its elements' readings, null where an element has none)
  const glyphsOf = (ps) => {
    let s = ''
    for (const p of ps) {
      const r = p.kind === 'text' ? p.s : p.kind === 'ph' ? readingOf(p.src ?? '') : ''
      if (r === null) return null
      s += r
    }
    return s.replace(/\s+/g, '')
  }
  // ((c): one line each; today's line from the trail's first glyph to v2's line's end, the trail before v2's line on it;
  // today's characters with the trail's taken out, in their order (today's reading may have dropped a raised one), v2's)
  const trailOf = (u, c) => {
    if (u.lines?.length !== 1 || c.lines?.length !== 1) return false
    const L = u.lines[0],
      K = c.lines[0]
    if (L.page !== K.page || Math.abs(L.x1 - K.x1) > ON) return false
    const t = trails.find((t) => t.page === L.page && Math.abs(t.x0 - L.x0) <= ON && t.x1 <= K.x0 + ON && meets(L, t))
    if (!t) return false
    const today = glyphsOf(u.pieces),
      mine = glyphsOf(c.pieces)
    if (today === null || mine === null) return false
    let i = 0
    for (const m of t.text.replace(/\s+/g, '')) if (today[i] === m) i++
    return i > 0 && today.slice(i) === mine
  }
  // ((e): v2's unit a kept block of its kind (no text of it sent), its lines today's, every one)
  const keptWhole = (u, c) =>
    !c.pieces?.length &&
    !!u.lines?.length &&
    c.lines?.length === u.lines.length &&
    u.lines.every((l) => c.lines.some((k) => sameLine(l, k)))
  // ((e): the displays the candidate's units state, each element of kind display's boxes on A; a line inside one: on its page,
  // its extent within the box's, its baseline between the box's bottom and top)
  const displays = units.flatMap((n) => (n.replaced ? [] : (n.elements ?? []).filter((e) => e.kind === 'display').flatMap((e) => e.segs)))
  const inside = (l, k) =>
    k.page === l.page &&
    k.x0 <= l.x0 + ON &&
    k.x1 >= l.x1 - ON &&
    Math.min(k.top, k.bottom) <= l.baseline &&
    l.baseline <= Math.max(k.top, k.bottom)
  const howOf = (u, c) => {
    if (c.why?.startsWith('content difference')) return c.why
    // (a running head's number of its phrase, which today's took for its folio: "5 of 21" for "of 21", ink-units.mjs phrased; a
    // running head's alone, the coordinator's ruling of 2026-11-10: no figure text joined with its number)
    if (u.kind === 'inkheads' && typeof c.text === 'string' && c.text !== u.text && c.text.replace(/^\d{1,4} | \d{1,4}$/, '') === u.text)
      return CAUSE.head
    const same = u.pieces.length === c.pieces.length && u.pieces.every((p, k) => p.kind === c.pieces[k].kind && chars(p) === chars(c.pieces[k]))
    if (same) return CAUSE.order
    if (/^ink/.test(u.kind) && scriptsKeptAsElements(flatOf(c.pieces), u)) return CAUSE.scripts
    if (/^ink/.test(u.kind) && scriptsKeptInAnotherOrder(flatOf(c.pieces), u)) return CAUSE.orderAsElement
    if (trailOf(u, c)) return CAUSE.trail
    if (keptWhole(u, c)) return u.lines.every((l) => displays.some((k) => inside(l, k))) ? CAUSE.display : CAUSE.kept
    if (arxivTextOf(u, c)) return CAUSE.arxivText
    if (wrappedOf(u, c)) return CAUSE.wrapped
    return CAUSE.another
  }
  // ((g): made on A and laid (its text arXiv's glyph text by its making), on today's lines one for one, today's glyph text a
  // subsequence of its; not a contiguous part of it, which is today's characters every one, held whole by a stand-in (f): F0's
  // line holding today's words and its run of one pitch, 2608.06701v1 p1's "Action:")
  const onLines = (u, c, n) => n <= (c.lines?.length ?? 0) && u.lines.length === n && u.lines.every((l, i) => meets(l, c.lines[i]))
  const subsequence = (t, h) => {
    let i = 0
    for (const ch of h) if (ch === t[i]) i++
    return i === t.length
  }
  const arxivTextOf = (u, c) => {
    if (!/^ink/.test(c.kind) || !['drawn', 'laid'].includes(c.state) || c.why || !u.lines?.length) return false
    if (!onLines(u, c, c.lines?.length ?? 0)) return false
    const t = glyphTextOf(u),
      h = glyphTextOf(c)
    return !!t && t !== h && !h.includes(t) && subsequence(t, h)
  }
  // ((h): today's lines its first ones, each line past them held by its elements alone, and its glyph text without those
  // elements today's)
  const wrappedOf = (u, c) => {
    const n = u.lines?.length ?? 0
    if (!n || (c.lines?.length ?? 0) <= n || !u.lines.every((l, i) => meets(l, c.lines[i]))) return false
    const extra = c.lines.slice(n)
    const on = (k, l) => k.page === l.page && Math.abs(k.baseline - l.baseline) <= ON && k.x0 < l.x1 && l.x0 < k.x1
    const els = (c.elements ?? []).filter((e) => e.segs.length && e.segs.every((k) => extra.some((l) => on(k, l))))
    if (!extra.every((l) => els.some((e) => e.segs.some((k) => on(k, l))))) return false
    const drop = new Set(els.map((e) => e.k))
    const t = glyphTextOf(u)
    return !!t && glyphTextOf({ ...c, pieces: c.pieces.filter((p) => !drop.has(p.k)) }) === t
  }
  // ((b'): a unit of the author block's (the names class: author, affiliation, inknames) holding every line of today's unit: a
  // line of its, or an element's box, on that line's baseline across its whole width; today's made it too or not (2610.21313v1's
  // e-mails, an ink note's today, now the elements of the affiliations today made too))
  const covers = (k, l) =>
    k.page === l.page && Math.abs(k.baseline - l.baseline) <= ON && k.x0 <= l.x0 + ON && k.x1 >= l.x1 - ON
  const heldByBlock = (u) =>
    u.lines?.length
      ? units.find(
          (n) =>
            !n.replaced &&
            unitClass(n.kind) === 'names' &&
            u.lines.every((l) => (n.lines ?? []).some((k) => covers(k, l)) || (n.elements ?? []).some((e) => e.segs.some((k) => covers(k, l)))),
        )
      : undefined
  // ((f): the one unit of the candidate's meeting every line of today's (a line of its, an element's box or its label's on that
  // baseline, across it), the same for every line; its text read as glyphs: texts, an inked element's reading (none: a glyph no
  // reading names), an element with no ink nothing (a tie, \newblock: no glyph), white space none)
  // ((f''), 2026-11-10: a box of the candidate's meets today's line where the two overlap across and up and down by their ink, the
  // glyphs' own height, whatever their baselines: today's reading gives a line its first glyph's baseline, a raised mark's where
  // the line begins with the name before's marks (2610.20030v1 t91: 709.17, its "and" at 705.55, which v2 states); two edges
  // within ON one edge, the two readings' hundredths (2610.21765v1: the name before's line to 321.24, today's from 321.2))
  const boxesOf = (n) => [...(n.lines ?? []), ...(n.elements ?? []).flatMap((e) => e.segs), ...(n.label ?? [])]
  const across = (a, b) =>
    a.page === b.page &&
    a.x0 < b.x1 - ON &&
    b.x0 < a.x1 - ON &&
    Math.min(a.top, a.bottom) < Math.max(b.top, b.bottom) - ON &&
    Math.min(b.top, b.bottom) < Math.max(a.top, a.bottom) - ON
  // (a unit's glyph text: its text pieces, each placeholder that is a text symbol its character (symbolText: `\_`, `\%`, `\&`,
  // text whatever ink a dump states of it, as the front end reads it), any other its reading (readingOf: a tie, an address, an
  // identifier) or an unread mark where its dump states ink of it, else nothing. The two dumps read alike so: the candidate's
  // lists an element only with its ink, today's every placeholder its ledger looked for, `\%`, `\&`, `\_` and a `\code{…}`
  // head with none of their own (the coordinator's ruling of 2026-11-10 on rebuild/literal-fixes: an element read as printed,
  // one with no ink of its own as nothing))
  const glyphTextOf = (x) => {
    const inked = new Set((x.elements ?? []).filter((e) => e.segs?.length).map((e) => e.k))
    // (an element the unit keeps as the original's ink (`keptBy`, F0's: a run of one pitch, a stretch a decoration holds) reads
    // as its source, the characters it shows)
    const kept = new Set((x.elements ?? []).filter((e) => e.keptBy).map((e) => e.k))
    let s = ''
    for (const p of x.pieces ?? [])
      s +=
        p.kind === 'text'
          ? p.s
          : p.kind === 'ph'
            ? kept.has(p.k)
              ? (p.src ?? '')
              : (symbolText(p.src ?? '') ?? (inked.has(p.k) ? (readingOf(p.src ?? '') ?? '\ufffc') : ''))
            : ''
    return s.replace(/\s+/g, '')
  }
  // ((f) over a line-end hyphen, F3: today's line ending in a hyphen the break set, the holder's text going on with the word's next
  // letter there, the joined word its (2610.35877v1 p3's "policy propen-" in its path's text "policy propensities directly."))
  const holdsText = (h, t) => {
    if (h.includes(t)) return true
    if (!/[-\u2010]$/u.test(t) || t.length < 2) return false
    const w = t.slice(0, -1)
    for (let i = h.indexOf(w); i >= 0; i = h.indexOf(w, i + 1)) if (/\p{L}/u.test(h[i + w.length] ?? '')) return true
    return false
  }
  const heldBy = (u) => {
    if (!u.lines?.length) return null
    let one = null
    for (const l of u.lines) {
      const at = units.filter((n) => !n.replaced && boxesOf(n).some((k) => across(k, l)))
      if (at.length !== 1 || (one && at[0] !== one)) return null
      one = at[0]
    }
    return one
  }
  // (today's glyph text an in-order part of the holder's; or the holder's label (its number as the part states it, the rest its
  // punctuation) at today's line start, then the holder's text from its start)
  const partOf = (u, n) => {
    const t = glyphTextOf(u),
      h = glyphTextOf(n)
    if (!t || !h) return false
    if (holdsText(h, t)) return true
    const L = u.lines[0],
      num = labels.get(n.ord)
    const lab = (n.label ?? []).some((b) => b.page === L.page && Math.abs(b.baseline - L.baseline) <= ON && Math.abs(b.x0 - L.x0) <= ON)
    if (!lab || !num) return false
    for (let i = 1; i < t.length; i++)
      if (h.startsWith(t.slice(i))) {
        const p = t.slice(0, i)
        return p.includes(num) && !/[\p{L}\p{N}]/u.test(p.replace(num, ''))
      }
    return false
  }
  // ((l'): arXiv's glyphs of ink whose middle stands in one of the boxes (an element's segments, a label's), box by box, each in x
  // order: what the reader sees printed there; null where the page is not read)
  const printedIn = (boxes) => {
    let s = ''
    for (const k of boxes) {
      const page = glyphs(k.page)
      if (!page) return null
      s += page
        .filter((g) => !g.blank && (g.x0 + g.x1) / 2 >= k.x0 - ON && (g.x0 + g.x1) / 2 <= k.x1 + ON && g.y >= Math.min(k.top, k.bottom) - ON && g.y <= Math.max(k.top, k.bottom) + ON)
        .sort((a, b) => a.x0 - b.x0)
        .map((g) => g.u)
        .join('')
    }
    return s
  }
  // ((l'): a unit as the reader sees it, white space aside: its label and every element as printed (an element TeX set no ink of
  // reads as nothing), each formula's span one placeholder with the digits right beside it or between two (the upright digits
  // today's ledger reads as text), the source's text through TeX's ligatures (`source`); a mark that reads as nothing of today's
  // where an element's print cannot be read)
  const seenOf = (n, isFormula, source) => {
    const segs = new Map((n.elements ?? []).map((e) => [e.k, e.segs ?? []]))
    let s = n.label?.length ? (printedIn(n.label) ?? UNREAD) : ''
    for (const p of n.pieces ?? [])
      s +=
        p.kind === 'text'
          ? source
            ? ligatured(p.s)
            : p.s
          : p.kind !== 'ph'
            ? ''
            : isFormula(p)
              ? FORMULA_MARK
              : segs.has(p.k)
                ? (printedIn(segs.get(p.k)) || readingOf(p.src ?? '')) ?? UNREAD
                : ''
    return s
      .replace(/\s+/g, '')
      .replace(new RegExp(`\\p{Nd}*${FORMULA_MARK}(?:\\p{Nd}*${FORMULA_MARK})*\\p{Nd}*`, 'gu'), FORMULA_MARK)
  }
  // ((l'): today's letters on arXiv's page every one in a face of small capitals (the engine's face fact, facts.ts classifyFont):
  // their case is the face's, not the text's)
  const inSmallCaps = (u) => {
    const letters = []
    for (const l of u.lines ?? []) {
      const page = glyphs(l.page)
      if (!page) return false
      for (const g of page)
        if (/\p{L}/u.test(g.u) && (g.x0 + g.x1) / 2 >= l.x0 - ON && (g.x0 + g.x1) / 2 <= l.x1 + ON && g.y >= Math.min(l.top, l.bottom) - ON && g.y <= Math.max(l.top, l.bottom) + ON)
          letters.push(classifyFont(g.base ?? ''))
    }
    const text = letters.filter((f) => f.fam !== 'math')
    return text.length > 0 && text.every((f) => f.caps)
  }
  const seenApart = (u, n) => {
    const kinds = (x) => new Map((x.elements ?? []).map((e) => [e.k, e.kind]))
    const ku = kinds(u),
      kn = kinds(n)
    let t = seenOf(u, (p) => !ku.has(p.k) || ku.get(p.k) === 'math', false)
    let v = seenOf(n, (p) => MATH_ELEMENTS.has(kn.get(p.k)), true)
    if (inSmallCaps(u)) {
      t = t.toLowerCase()
      v = v.toLowerCase()
    }
    return /\p{L}/u.test(t.replaceAll(FORMULA_MARK, '')) && v.includes(t)
  }
  const isBlock = (n) => !n.replaced && unitClass(n.kind) === 'names'
  // ((c'): a unit of the author block's, of any kind, standing for today's line after the name before's trail)
  const trailBlock = (u) => {
    const L = u.lines?.[0]
    return L ? (units.find((n) => isBlock(n) && n.lines?.[0] && meets(L, n.lines[0]) && trailOf(u, n)) ?? null) : null
  }
  // ((f'): each line's glyphs of ink on arXiv's page (its advance across the line's, its baseline within its ink), each in one
  // box of one unit of those meeting the line, every one of them the author block's, two or more, each holding a run of the
  // line's glyphs one after the other; a glyph of no ink (a space) anywhere. The holder: the one whose glyph text is today's)
  const heldByBlockUnits = (u) => {
    if (!u.lines?.length) return null
    const all = new Set()
    for (const l of u.lines) {
      const page = glyphs(l.page)
      if (!page) return null
      const ink = page
        .filter((g) => !g.blank && g.x0 >= l.x0 - ON && g.x1 <= l.x1 + ON && g.y >= Math.min(l.top, l.bottom) - ON && g.y <= Math.max(l.top, l.bottom) + ON)
        .sort((a, b) => a.x0 - b.x0)
      const at = units.filter((n) => !n.replaced && boxesOf(n).some((k) => across(k, l)))
      if (!ink.length || !at.length || !at.every(isBlock)) return null
      const inBox = (g, k) =>
        k.page === l.page && g.x0 >= k.x0 - ON && g.x1 <= k.x1 + ON && g.y >= Math.min(k.top, k.bottom) - ON && g.y <= Math.max(k.top, k.bottom) + ON
      const run = []
      for (const g of ink) {
        const owners = at.filter((n) => boxesOf(n).some((k) => inBox(g, k)))
        if (owners.length !== 1) return null
        if (run.at(-1) !== owners[0]) {
          if (run.includes(owners[0])) return null
          run.push(owners[0])
        }
      }
      for (const n of run) all.add(n)
    }
    if (all.size < 2) return null
    const mine = glyphTextOf(u)
    const whole = [...all].filter((n) => glyphTextOf(n) === mine)
    return { holder: whole.length === 1 ? whole[0] : null }
  }
  // ((k) on elements and (n), F0 (rebuild/fig-text): today's unit now wholly an element one unit of the candidate's keeps as the
  // original's ink (`keptBy`): every line of it inside one box of that element, its glyph text the element's source's, white
  // space aside (2608.06701v1 p1's "The path", today's run of one pitch, F0's element of "Observation: …")
  const keptElementOf = (u) => {
    const t = u.lines?.length ? glyphTextOf(u) : ''
    if (!t) return null
    for (const n of units) {
      if (n.replaced) continue
      for (const e of n.elements ?? []) {
        if (!e.keptBy || !u.lines.every((l) => e.segs.some((k) => inside(l, k)))) continue
        const p = (n.pieces ?? []).find((q) => q.k === e.k && q.kind === 'ph')
        if (p && (p.src ?? '').replace(/\s+/g, '') === t)
          return { n, cause: e.keptBy === 'pitch' ? CAUSE.pitch : e.keptBy === 'formula' ? CAUSE.formula : CAUSE.decoration }
      }
    }
    return null
  }
  // ((f), its stand-in of today's kind at its place, 2026-11-10: every line of today's meets a box of it and its glyph text holds
  // today's whole, in order (rebuild/run-on-kept's figure text not cut at a face or colour change, standing for one of today's
  // pieces))
  const standInHolds = (u, c) => {
    if (!u.lines?.length || !u.lines.every((l) => boxesOf(c).some((k) => across(k, l)))) return false
    const t = glyphTextOf(u)
    return !!t && holdsText(glyphTextOf(c), t)
  }
  // ((p), F3: an item of a figure, its marker the label v2 keeps as the original's ink (the dump's `label`, at today's line start),
  // every line of today's on the item's boxes: today's glyph text the marker, then the item's text from its start. The marker a
  // short mark (a letter or digit or three in their brackets, or a bullet), or what the label prints where arXiv's page is read
  // (a glyph beside a narrow mark can stand within the box's reach: 2608.06007v1's "- identify", its "i")
  const MARK = /^(?:[([]?[\p{L}\p{N}]{1,3}[)\].:]?|[-\u2010-\u2014\u2022\u00b7\u25aa\u25e6\u2219*>])$/u
  const itemOf = (u, n) => {
    const L = u.lines?.[0]
    if (!L || !n.label?.length || !n.pieces?.length) return false
    if (!n.label.some((b) => b.page === L.page && Math.abs(b.baseline - L.baseline) <= ON && Math.abs(b.x0 - L.x0) <= ON)) return false
    if (!u.lines.every((l) => boxesOf(n).some((k) => across(k, l)))) return false
    const t = glyphTextOf(u),
      h = glyphTextOf(n)
    if (!t || !h) return false
    const printed = printedIn(n.label)
    for (let i = 1; i <= Math.min(4, t.length - 1); i++) {
      if (!h.startsWith(t.slice(i))) continue
      const mark = t.slice(0, i)
      if (MARK.test(mark) || printed?.replace(/\s+/g, '') === mark) return true
    }
    return false
  }
  // ((j): the candidate's units meeting today's lines (by their boxes), two or more, consecutive in the dump's order, today's
  // glyph text one contiguous part of their glyph texts joined in that order, every character of it)
  const splitOf = (u) => {
    if (!u.lines?.length) return null
    const at = units.filter((n) => !n.replaced && u.lines.some((l) => boxesOf(n).some((k) => across(k, l)))).sort((a, b) => a.ord - b.ord)
    if (at.length < 2) return null
    const lo = at[0].ord,
      hi = at.at(-1).ord
    if (units.some((n) => !n.replaced && n.ord > lo && n.ord < hi && !at.includes(n))) return null
    const t = glyphTextOf(u)
    return t && at.map(glyphTextOf).join('').includes(t) ? at : null
  }
  // ((j) from a stand-in that reads otherwise, the coordinator's ruling of 2026-11-10, round 8 B3: the units meeting today's
  // lines, the stand-in the first of them, two or more, consecutive in the dump's order, null otherwise)
  const partsFrom = (u, c) => {
    if (!u.lines?.length) return null
    const at = units.filter((n) => !n.replaced && u.lines.some((l) => boxesOf(n).some((k) => across(k, l)))).sort((a, b) => a.ord - b.ord)
    if (at.length < 2 || at[0] !== c) return null
    const lo = at[0].ord,
      hi = at.at(-1).ord
    return units.some((n) => !n.replaced && n.ord > lo && n.ord < hi && !at.includes(n)) ? null : at
  }
  // ((g) over the parts: arXiv's glyphs of ink on the parts' own lines (made on arXiv's page, where arXiv set them), part by
  // part and line by line, each by its advance across the line and its baseline within it, in x order; their characters, white
  // space no glyph)
  const arxivOn = (lines) => {
    let s = ''
    for (const l of lines) {
      const page = glyphs(l.page)
      if (!page) return null
      s += page
        .filter((g) => !g.blank && g.x0 >= l.x0 - ON && g.x1 <= l.x1 + ON && g.y >= Math.min(l.top, l.bottom) - ON && g.y <= Math.max(l.top, l.bottom) + ON)
        .sort((a, b) => a.x0 - b.x0)
        .map((g) => g.u)
        .join('')
    }
    return s.replace(/\s+/g, '')
  }
  const arxivParts = (u, at) => {
    if (!at.every((n) => /^ink/.test(n.kind) && ['drawn', 'laid'].includes(n.state) && !n.why)) return false
    const h = at.map(glyphTextOf).join(''),
      t = glyphTextOf(u)
    return !!t && t !== h && arxivOn(at.flatMap((n) => n.lines ?? [])) === h && subsequence(t, h)
  }
  // (a unit's text as the front end reads it for identifiers (latex-front.mjs keepRead): a placeholder its text symbol's
  // character (`\_`, `\{`), any other no character of a word, a formula never an underscore (a bare `_` is TeX's subscript))
  const typedOf = (x) => (x.pieces ?? []).map((p) => (p.kind === 'text' ? p.s : p.kind === 'ph' ? (symbolText(p.src ?? '') ?? '\u0000') : '')).join('')
  // (a unit's text as written, an address its element reads as itself: what (F) reads)
  const writtenOf = (x) => (x.pieces ?? []).map((p) => (p.kind === 'text' ? p.s : p.kind === 'ph' ? (readingOf(p.src ?? '') ?? '\ufffc') : '')).join('')
  const keyOf = (why) => Object.keys(CAUSE).find((k) => CAUSE[k] === why) ?? 'content'
  // ((f): a line inside the display lines on its page whose box holds its baseline, from the first one's start to the last one's
  // end — a formula row the ledger cut at its gaps is one row)
  const inDisplay = (l) => {
    const on = shown.filter(([p, , bottom, , top]) => p === l.page && Math.min(bottom, top) <= l.baseline && l.baseline <= Math.max(bottom, top))
    return on.length > 0 && Math.min(...on.map((d) => d[1])) <= l.x0 + ON && Math.max(...on.map((d) => d[3])) >= l.x1 - ON
  }
  // ((i), the coordinator's ruling of 2026-11-10, round 8 B2: a unit today drew (a loss, else nothing to state) that the candidate
  // makes and leaves unlaid with the reason the guard's unmarking gives it (UNMARKED: its marks taken out, the paper compiled again), every line of it held by one drawn unit
  // of the candidate's whose glyph text is its: held whole by another unit (2610.21084v1 t4, cas-common's abstract, whose lines an
  // ink unit draws). The candidate's own unit of today's is the one the differential pairs it with: of its id, in ord order)
  const seen = new Map()
  const ownOf = (u) => {
    const k = seen.get(u.id) ?? 0
    seen.set(u.id, k + 1)
    return units.filter((n) => !n.replaced && n.id === u.id).sort((a, b) => a.ord - b.ord)[k] ?? null
  }
  // ((k) by group: the candidate's unit of today's kind writing today's TeX source, white space as one space, an element of it kept
  // for its pitch; the one at today's place first)
  const pitchGroupOf = (u) => {
    const src = texOf(u)
    const L = u.lines?.[0]
    const all = units.filter(
      (n) => !n.replaced && n.kind === u.kind && !baseIds.has(n.id) && (n.elements ?? []).some((e) => e.keptBy === 'pitch') && texOf(n) === src,
    )
    return all.find((n) => L && n.lines?.[0] && meets(L, n.lines[0])) ?? all.sort((a, b) => a.ord - b.ord)[0] ?? null
  }
  // ((o): today's TeX of a unit, each text symbol that is a character of v2's text its character (a control word's skipped
  // spaces and a group around it alone with it, as TeX reads them), and the opens and closes of the groups the candidate writes
  // as their content out (a pair that sets its argument alone, a bare group with no declaration of its own: instrument.mjs
  // passThroughOf), white space as one space; the candidate's unit of today's kind, not one of today's ids, writing it, its
  // groups' ends today's in their order, one fewer at least where no character moved: the one at today's place first)
  /** each group of a unit's pieces, in order: its open's index, its close's (-1 where the unit holds none), its open's source */
  const groupsIn = (ps) => {
    const out = [], stack = []
    ps.forEach((p, k) => {
      if (p.kind === 'open') { const g = { open: k, close: -1, src: p.src ?? '' }; out.push(g); stack.push(g) }
      else if (p.kind === 'close' && stack.length) stack.pop().close = k
    })
    return out
  }
  const charactersOf = (u) => {
    // (today's pieces; else, where they hold a placeholder of a link with no address, REVTeX's \\href@noop {} {…}, with each
    // read as the front end now reads it in an entry: its groups, its letters, its placeholders; latex-front.mjs BIB_TEXT, step D)
    const own = writtenWith(u, u.pieces ?? [])
    if (own || !(u.pieces ?? []).some((p) => p.kind === 'ph' && NOOP.test(p.src ?? ''))) return own
    return writtenWith(u, (u.pieces ?? []).flatMap((p) => (p.kind === 'ph' && NOOP.test(p.src ?? '') ? (entryPiecesOf(p.src) ?? [p]) : [p])))
  }
  /** the candidates (o) found writing a group of today's as one placeholder of the same TeX (an element of theirs kept whole) */
  const wroteVerbatim = new Set()
  /** the candidate's unit writing today's unit `u` with pieces `ps` (o), or null */
  const writtenWith = (u, ps) => {
    // (a bare group holding no declaration of its own, the instrument's rule read off today's pieces; then a command's pair the
    // candidate does not write, read off its groups, each command's pairs all kept or all dropped by the front end's reading)
    const groups = groupsIn(ps)
    const bare = (g) => g.src === '{' && g.close >= 0 && !ps.slice(g.open + 1, g.close).some((q, j) => q.kind === 'ph' && isInkless({ t: 'ph', src: q.src }) && depthAt(ps, g.open + 1, g.open + 1 + j) === 0)
    const L = u.lines?.[0]
    const all = units.filter((n) => {
      if (n.replaced || n.kind !== u.kind || baseIds.has(n.id)) return false
      const theirs = groupsIn(n.pieces ?? []).map((g) => g.src)
      const drop = new Set(), marked = new Set(), verbatim = new Set()
      // (the candidate's placeholders' TeX: a group of today's it writes as one of them, an element it keeps whole (b5-fixes'
      // group kept for its pitch, or a link around one), is today's TeX as it is written; the merge of round 8 B8)
      const phs = new Set((n.pieces ?? []).filter((p) => p.kind === 'ph').map((p) => (p.src ?? '').replace(/\s+/g, ' ').trim()))
      let i = 0
      for (const g of groups) {
        if (verbatim.has(g.open)) continue
        if (g.close >= 0 && phs.has(texOf({ pieces: ps.slice(g.open, g.close + 1) }))) {
          for (let k = g.open; k <= g.close; k++) verbatim.add(k)
          continue
        }
        if (bare(g)) { drop.add(g.open).add(g.close); continue }
        if (theirs[i] === g.src) { i++; continue }
        if (g.close < 0) return false
        // (a command's pair v2 does not write: its content, between the marks it prints where it prints some, \\enquote's)
        drop.add(g.open).add(g.close)
        marked.add(g.open).add(g.close)
      }
      if (i !== theirs.length) return false
      const same = writtenAs(ps, drop, marked, verbatim)
      const ok = same?.(texOf(n)) ?? false
      if (ok && verbatim.size) wroteVerbatim.add(n)
      return ok
    })
    return all.find((n) => L && n.lines?.[0] && meets(L, n.lines[0])) ?? all.sort((a, b) => a.ord - b.ord)[0] ?? null
  }
  for (const u of base) {
    if ((have.get(u.id) ?? 0) === 0 && !/^ink/.test(u.kind)) {
      // ((k) by group before (o): a unit the candidate writes with a group of it kept as an element for its pitch is that
      // statement, the more particular; (o) states the rest of the units it writes as today's TeX)
      const grouped = pitchGroupOf(u)
      if (grouped) {
        out.push({ u, why: `written as ${grouped.id.slice(0, 12)}: ${CAUSE.pitchGroup}`, cause: 'pitchGroup', holder: grouped.id })
        continue
      }
      const n = charactersOf(u)
      if (n) {
        // ((k) by group read with (o): a group of today's the candidate writes as one placeholder of the same TeX, an element of
        // its unit kept for its pitch, is (k) by group's statement, the rest of the unit as (o) reads it)
        const pitched = wroteVerbatim.has(n) && (n.elements ?? []).some((e) => e.keptBy === 'pitch')
        out.push(pitched
          ? { u, why: `written as ${n.id.slice(0, 12)}: ${CAUSE.pitchGroup}`, cause: 'pitchGroup', holder: n.id }
          : { u, why: `written as ${n.id.slice(0, 12)}: ${CAUSE.characters}`, cause: 'characters', holder: n.id })
        continue
      }
    }
    if ((have.get(u.id) ?? 0) > 0) {
      have.set(u.id, have.get(u.id) - 1)
      const own = ownOf(u)
      // (unmarked: the holder's glyph text today's; set again in a re-set paragraph: the paragraph's holding today's whole)
      const n = u.state === 'drawn' && own?.state === 'unlaid' && (own.why === UNMARKED || own.why === RESET) ? heldBy(u) : null
      const t = n ? glyphTextOf(u) : ''
      const whole = !!n && !!t && (own.why === UNMARKED ? glyphTextOf(n) === t : glyphTextOf(n).includes(t))
      if (n && n !== own && n.state === 'drawn' && whole)
        out.push({ u, own, why: `made on arXiv's page as ${n.id.slice(0, 12)}: ${CAUSE.held}`, cause: keyOf(CAUSE.held), holder: n.id })
      continue
    }
    // ((F) first, the coordinator's ruling of 2026-11-10 on rebuild/mail-group: a line of e-mail addresses and their separators
    // alone that one kept block of the candidate's holds whole is (F)'s whatever its kinds, before that block, a stand-in of
    // today's kind, reads it otherwise (2610.17024v1 t504: the block's line ends 0.06 pt before today's))
    const mail = addressesOnly(writtenOf(u)) ? heldBy(u) : null
    if (mail && !mail.pieces?.length) {
      out.push({ u, why: `made on arXiv's page as ${mail.id.slice(0, 12)}: ${CAUSE.addresses}`, cause: 'addresses' })
      continue
    }
    // ((k) for the identifier rule: a unit of today's whose text, as the front end reads it, is identifiers alone, every unit of
    // the candidate's on its lines a kept block, no text of it sent, or none (a cell the front end makes no unit of; a line of
    // ink the ledger keeps whole): before the block's own cause, as (F))
    const named = identifiersOnly(typedOf(u))
    if (named && u.lines?.length && u.lines.every((l) => units.every((n) => n.replaced || !n.pieces?.length || !boxesOf(n).some((k) => across(k, l))))) {
      out.push({ u, why: CAUSE.identifier, cause: 'identifier', keptBy: 'identifier' })
      continue
    }
    // ((k) on elements and (n) before a stand-in: the element's unit stands for the words beside it as well)
    const keptEl = /^ink/.test(u.kind) ? keptElementOf(u) : null
    if (keptEl) {
      out.push({ u, why: keptEl.cause, cause: keyOf(keptEl.cause), holder: keptEl.n.id })
      continue
    }
    // (a unit made on A stands only for one of today's ink units, kept blocks and figure texts)
    const c = /^ink/.test(u.kind) ? standsFor(u) : null
    // (none: an item of its kind at its place holding today's marker as its label and its words, whatever its id ((p): another of
    // the baseline's units of the same words elsewhere has it))
    const itemN = !c && /^ink/.test(u.kind) ? units.find((n) => !n.replaced && n.kind === u.kind && itemOf(u, n)) : null
    // (none: a kept block of its kind at its place, no text of it sent: its lines the ledger reads as no unit's text, a formula's
    // interior (ledger.mjs CHANGED))
    const L0 = u.lines?.[0]
    const kept =
      !c && !itemN && /^ink/.test(u.kind) && L0
        ? units.find((k) => k.kind === u.kind && !k.pieces?.length && !k.replaced && k.lines?.some((l) => meets(L0, l)))
        : null
    // (none of either: a unit of the author block's now holding its glyphs, whatever today's kind)
    const names = !c && !kept ? heldByBlock(u) : undefined
    // (none of these: every line of it inside the display lines the candidate reads on its baseline, between their ends
    // (rebuild/display-marks: a display's ink, kept with it))
    const part = !c && !kept && !names && !!u.lines?.length && u.lines.every((l) => inDisplay(l))
    // (none of these: a unit of the author block's standing for it after the name before's trail (c'))
    const trailed = !c && !kept && !names && !part && /^ink/.test(u.kind) ? trailBlock(u) : null
    // (none of these: one unit of the candidate's, of any class, holding it whole (f); a kept block holding a line of addresses (F))
    const holder = !c && !kept && !names && !part && !trailed ? heldBy(u) : null
    const held = !holder
      ? null
      : !holder.pieces?.length
        ? addressesOnly(writtenOf(u))
          ? CAUSE.addresses
          : CAUSE.heldKept
        : partOf(u, holder)
          ? CAUSE.held
          : null
    // (none of these: today's ink unit a source unit of v2's holds whole, both read as arXiv prints them (l'))
    const apart =
      !held && holder && /^ink/.test(u.kind) && !/^ink/.test(holder.kind) && holder.state === 'drawn' && seenApart(u, holder)
    // (none of these: the author block's units holding its line between them (f'); consecutive units holding its text (j))
    const block = !c && !kept && !names && !part && !trailed && !held && !apart ? heldByBlockUnits(u) : null
    const split = !c && !kept && !names && !part && !trailed && !held && !apart && !block ? splitOf(u) : null
    // (a stand-in of its kind that reads otherwise, holding today's whole text: held whole (f))
    const how = c ? howOf(u, c) : null
    const standIn = how === CAUSE.another && standInHolds(u, c)
    // (an item holding today's marker as its label, its words today's ((p)))
    const itemC = how === CAUSE.another && !standIn && itemOf(u, c)
    // (one that holds no whole: (j) from it onward, its text the parts' in order; else (g) over the parts)
    const parts = how === CAUSE.another && !standIn && !itemC ? partsFrom(u, c) : null
    const fromIt = parts ? (parts.map(glyphTextOf).join('').includes(glyphTextOf(u)) && !!glyphTextOf(u) ? CAUSE.split : arxivParts(u, parts) ? CAUSE.arxivParts : null) : null
    // (a names unit's stand-in of its ledger class, its characters today's in another order: its kind moved, the candidate's
    // unit holding today's whole, named as the holder so that the parity joins the two (heldJoin), as while (f) stated them: the
    // coordinator's ruling of 2026-11-10, round 8 B2b, 2610.30034v1 t309-t311)
    const moved = c && c.kind !== u.kind && how === CAUSE.order
    const said = c
      ? standIn
        ? { by: c, cause: CAUSE.held, holder: c }
        : itemC
          ? { by: c, cause: CAUSE.item, holder: c }
          : fromIt
          ? { by: c, cause: fromIt }
          : { by: c, cause: how, ...(moved ? { holder: c } : {}) }
      : itemN
        ? { by: itemN, cause: CAUSE.item, holder: itemN }
        : kept
        ? null
        : names
          ? { by: names, cause: CAUSE.names, holder: names }
          : trailed
            ? { by: trailed, cause: CAUSE.trail }
            : held
              ? { by: holder, cause: held, ...(held === CAUSE.held ? { holder } : {}) }
              : apart
                ? { by: holder, cause: CAUSE.seen, holder }
                : block
                ? { by: block.holder ?? [...units].find((n) => !n.replaced && boxesOf(n).some((k) => across(k, u.lines[0]))), cause: CAUSE.heldBlock, ...(block.holder ? { holder: block.holder } : {}) }
                : split
                  ? { by: split[0], cause: CAUSE.split }
                  : null
    if (kept) out.push({ u, why: "kept on arXiv's page as the original's, no text of it sent", cause: 'keptAt' })
    else if (!said && part) out.push({ u, why: CAUSE.displayPart, cause: 'displayPart' })
    else if (said) {
      // ((m): held whole by a figure's line kept whole for its formulas: inside a formula, kept as the original)
      if (said.cause === CAUSE.held && said.by?.keptBy === 'formula') said.cause = CAUSE.formula
      out.push({
        u,
        why: `made on arXiv's page as ${said.by.id.slice(0, 12)}: ${said.cause}`,
        cause: keyOf(said.cause),
        ...(said.holder ? { holder: said.holder.id } : {}),
      })
    }
  }
  return holdersDeclared(out)
}
