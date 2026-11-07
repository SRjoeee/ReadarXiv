// The mark probe, asked of TeX in the compile plan's first pass instead of a pass of its own (design §4.3: one unmarked
// pass, which also writes the definitions; contract stage 1b: the probe's vetoes protect nothing, but what it states is
// needed: whether a closing mark after a call of a paper's macro moves nothing — the macro reads nothing past its
// arguments —, whether a mark may stand between a macro and the placeholder after it, which macros set no ink, which begin
// their box apart from a word, and the text each sets). Today's probe (layout/marks.mjs probeSamples … readInkApart,
// layout/paper.mjs's probe stage) is ported as it is, with two changes of where and of what:
//   - where: the probe's file is read at the first pass's end (`enddocument/end`, after the aux and biblatex's control file
//     are written and closed), its boxes inside a box of its own that is never shipped: nothing it sets or cites reaches the
//     pass's outputs (the definitions are written at the document's start, the bibliography is made from the aux), and an
//     error of a sample cannot cut the pass short. Today's probe ran in a document of the paper's preamble alone; at the
//     end, the body's own definitions are in force, as they are where the marked compile sets the calls;
//   - what: its samples are chosen before TeX, from a reading of the source with no definitions (readSource with
//     NO_DEFINITIONS: the reader's body definitions, no preamble's), so which of the paper's macros read nothing past their
//     arguments is not known yet (TeX's meanings say so, after the pass: SourceDoc `complete`). So every macro the paper
//     defines and its units call is asked about, by its first call (today's: the complete ones'), and the marks writer takes
//     an answer only for a call of a complete macro (mark.ts `probed`).
// Not asked: the babel names' capitals (today's `name` section: no reader of the instrument takes them).
import { LOG_MAX } from '../compile/recover.ts'
import { jobName, type Tree } from '../source/definitions.ts'
import { Files } from '../source/files.ts'
import { LEX_RULES } from '../source/kinds.ts'
import { definitionAt, envName } from '../source/macros.ts'
import type { SourceDoc, SourceUnit } from '../source/read.ts'
import { groupEnd, skipBlanks } from '../source/roles.ts'
import { backrefPiece, classOf, commandOf, type MarkPiece, prefixWord, symbolText } from './classes.ts'
import { aheadKey, COMPLETE_PROBE_MAX, COMPLETE_SRC_MAX, headEnd, pairOf, probeFit } from './mark.ts'
import * as X from './tex.ts'

/** the probe's rows' schema (marks.mjs PROBE_SCHEMA) */
export const PROBE_SCHEMA = 1
/** the followers a call is set before: each punctuation mark, a word, a second call (marks.mjs FOLLOWERS) */
export const FOLLOWERS = Object.freeze(['.', ',', ';', ':', '!', '?', 'word', 'call'])
const PUNCT = '.,;:!?'
/** the classes whose commands the probe asks about (marks.mjs ASKED), at most PROBE_MAX commands a paper */
const ASKED = new Set(['cite', 'ref', 'eqref', 'url', 'footnote'])
export const PROBE_MAX = 16
/** the look-ahead pairs asked about at most (marks.mjs AHEAD_PROBE_MAX), and the classes of the placeholder after the macro */
export const AHEAD_PROBE_MAX = 128
const AHEAD_FOLLOWS = new Set(['math', 'cite', 'ref', 'eqref', 'code', 'url', 'footnote', 'number'])
/** the ink section's code units in all (marks.mjs INK_BUDGET), and a macro's text as it shows it, at most */
export const INK_BUDGET = 65536
export const INK_TEXT_MAX = 64
/** one glyph of a formula whose character a text does not spell (marks.mjs INK_ANY) */
export const INK_ANY = '\uFFFC'
/** the file the first pass reads at its end */
export const PROBE_FILE = 'axt-probe.tex'

/** a sample of the punctuation section: a command's call (`own` a paper's macro), the placeholder glued after it (`glued`),
 *  a footnote's call set twice (`call`) */
export interface PunctSample {
  command: string
  src: string
  call?: true
  own?: true
  glued?: string
}
export interface AheadSample {
  key: string
  src: string
  gap: string
  follows: string
  math: boolean
}
/** what the probe asks, in its sections' order; stored with the answers (the rows are numbered by these lists) */
export interface ProbeSamples {
  punct: PunctSample[]
  ahead: AheadSample[]
  ink: string[]
  leads: string[]
  /** the commands of the asked classes the units hold (asked or not): mark.ts `seen` */
  seen: string[]
}

const BIB = (u: SourceUnit) => u.kind === 'reference' || u.kind === 'refnames'
/** a bibliography's entries after every other unit (marks.mjs sampleOrder) */
const sampleOrder = (units: readonly SourceUnit[]) =>
  units.some(BIB) ? [...units.filter((u) => !BIB(u)), ...units.filter(BIB)] : units
const srcOf = (p: MarkPiece | undefined) => (p && 'src' in p && typeof p.src === 'string' ? p.src : '')
const balanced = (s: string) => {
  let d = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++
      continue
    }
    if (s[i] === '{') d++
    else if (s[i] === '}' && --d < 0) return false
  }
  return d === 0
}
/** a `%` or a `#` no backslash escapes (marks.mjs rawSign) */
const rawSign = (s: string) => {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++
      continue
    }
    if (s[i] === '%' || s[i] === '#') return true
  }
  return false
}
/** a source TeX can set in a box of its own (marks.mjs boxable) */
const boxable = (src: string) =>
  !!src && !rawSign(src) && !/\\(?:verb|lstinline|begin|end|par)(?![A-Za-z@])/.test(src) && balanced(src)

/**
 * The probe's samples from a reading of the source (marks.mjs probeSamples, aheadSamples, inkSamples, leadSamples): each
 * command of the asked classes, once, by its first call TeX can set in a box (at most PROBE_MAX); each macro the paper defines
 * (`doc.own`) that its units call, once, by its first such call (at most COMPLETE_PROBE_MAX, each source at most
 * COMPLETE_SRC_MAX, its braces balanced: its tests are one argument, ownGuard), with the placeholder glued after it; each pair of a paper's macro and the placeholder of AHEAD_FOLLOWS
 * right after it (AHEAD_PROBE_MAX); each distinct source of a paper's macro and the bibliography entries' leads and calls
 * while INK_BUDGET lasts; and the units' leads no mark goes before
 */
export function probeSamples(doc: Pick<SourceDoc, 'units' | 'own'>): ProbeSamples {
  const units = doc.units
  const own = new Set(doc.own)
  const asked = new Map<string, PunctSample>()
  const mine = new Map<string, PunctSample>()
  const seen = new Set<string>()
  for (const u of sampleOrder(units))
    for (const [k, p] of u.pieces.entries()) {
      const cmd = commandOf(p)
      const cls = classOf(p)
      if (!cmd) continue
      if (cls && ASKED.has(cls)) {
        seen.add(cmd)
        if (asked.has(cmd) || asked.size >= PROBE_MAX) continue
        const src = p.t === 'nested' ? `${p.pre}A note.${p.post}` : srcOf(p)
        if (probeFit(src))
          asked.set(cmd, cls === 'footnote' ? { command: cmd, src, call: true } : { command: cmd, src })
      } else if (
        cls === 'macro' &&
        p.t === 'ph' &&
        own.has(cmd.slice(1)) &&
        balanced(p.src) &&
        !mine.has(cmd) &&
        mine.size < COMPLETE_PROBE_MAX &&
        probeFit(p.src) &&
        p.src.length <= COMPLETE_SRC_MAX
      ) {
        const next = u.pieces[k + 1]
        const glued =
          next?.t === 'ph' &&
          balanced(next.src) &&
          probeFit(next.src.replace(/(?<!\\)((?:\\\\)*)\\[%#]/g, '$1')) &&
          next.src.length <= COMPLETE_SRC_MAX
            ? next.src
            : null
        mine.set(cmd, glued ? { command: cmd, src: p.src, own: true, glued } : { command: cmd, src: p.src, own: true })
      }
    }
  // (the look-ahead pairs)
  const ahead = new Map<string, AheadSample>()
  pairs: for (const u of sampleOrder(units)) {
    const pieces = u.pieces as readonly MarkPiece[]
    for (let q = 0; q < pieces.length; q++) {
      if (ahead.size >= AHEAD_PROBE_MAX) break pairs
      const pair = pairOf(pieces, q)
      const next = pieces[q] as MarkPiece
      const cls = classOf(next)
      const src = srcOf(next)
      if (!pair || !cls || !AHEAD_FOLLOWS.has(cls) || prefixWord(src) || !probeFit(src) || !src.length) continue
      if (src.length > COMPLETE_SRC_MAX) continue
      const key = aheadKey(srcOf(pair[0]), pair[1], src)
      if (!ahead.has(key))
        ahead.set(key, { key, src: srcOf(pair[0]), gap: pair[1], follows: src, math: cls === 'math' })
    }
  }
  // (the ink section's: the body's macros, then the entries' leads, then their other calls, in the budget)
  const body: string[] = []
  const calls: string[] = []
  const once = new Set<string>()
  const leadsOf = new Set<string>()
  for (const u of sampleOrder(units)) {
    const head = BIB(u) ? headEnd(u.pieces, 0) : 0
    u.pieces.forEach((p, k) => {
      if (p.t !== 'ph' || classOf(p) !== 'macro' || backrefPiece(p) || symbolText(p.src) !== null || !boxable(p.src))
        return
      if (BIB(u) && k < head) leadsOf.add(p.src)
      if (once.has(p.src)) return
      once.add(p.src)
      ;(BIB(u) ? calls : body).push(p.src)
    })
  }
  const ink: string[] = []
  let room = INK_BUDGET
  for (const src of [...body, ...calls.filter((c) => leadsOf.has(c)), ...calls.filter((c) => !leadsOf.has(c))]) {
    if (src.length > room) continue
    ink.push(src)
    room -= src.length
  }
  // (the units' leads that no mark goes before, in the budget left)
  const asked2 = new Set(ink)
  const leads: string[] = []
  for (const u of sampleOrder(units)) {
    const pieces = u.pieces
    const head = headEnd(pieces, 0)
    for (let k = 0; k < head; k++) {
      const p = pieces[k] as MarkPiece
      const cls = classOf(p)
      const src = srcOf(p)
      if ((cls !== 'macro' && cls !== 'code') || asked2.has(src) || symbolText(src) !== null || !boxable(src)) continue
      if (src.length > room) continue
      asked2.add(src)
      leads.push(src)
      room -= src.length
    }
  }
  return {
    punct: [...asked.values(), ...mine.values()],
    ahead: [...ahead.values()],
    ink,
    leads,
    seen: [...seen].sort(),
  }
}

// ---------------------------------------------------------------- the probe's TeX (marks.mjs's sections, as they are)
const probeRow = (tag: string, ...fields: (string | number)[]) =>
  `\\typeout{LAYOUT-PROBE ${PROBE_SCHEMA} ${tag} ${fields.join(' ')}}`
const PROBE_LEVEL = '\\xdef\\axt@level{\\the\\currentgrouplevel}'
const PROBE_UNWIND =
  '\\gdef\\axt@unwind{\\global\\let\\axt@unwound\\relax\\ifnum\\currentgrouplevel>\\axt@level\\relax\\ifnum\\currentgrouptype=14 \\global\\let\\axt@unwound\\axt@unwind\\endgroup\\else\\ifnum\\currentgrouptype<6 \\ifnum\\currentgrouptype>0 \\global\\let\\axt@unwound\\axt@unwind\\egroup\\fi\\fi\\fi\\fi\\axt@unwound}'
const PROBE_RESET =
  '\\edef\\axt@qfn{\\ifdefined\\c@footnote\\the\\c@footnote\\else0\\fi}\\def\\axt@qreset{\\ifdefined\\c@footnote\\global\\c@footnote=\\axt@qfn\\relax\\fi\\ifdefined\\citereset\\citereset\\fi}'
const BOXY = /^(?:\$|\\\(|\\(?:ensuremath|mbox|textsuperscript)(?![A-Za-z@]))/
/** after each box of the punctuation and look-ahead sections, an empty paragraph, which starts TeX's error count again (TeX
 *  stops at a hundred errors in one paragraph): today's probe ended one after each sample, whose forty boxes a macro that is
 *  not complete — asked here, as the reading before TeX cannot tell (\and, a \sys of \xspace) — fills with a hundred */
export const BOX_RESET = '\\noindent\\par'
/** `@` a letter again where the probe's own TeX follows a sample (a paper's macro may run \makeatother, and the probe's names
 *  after it, read with `@` another character, define \axt: `\def\axt@qat`): at each box's start, after the sample inside its
 *  box and after the box */
export const AT_LETTER = '\\makeatletter'
/** the control words a body that sets more than a piece of a line names (macros.ts STRUCTURAL, completeArity), and `\\` and
 *  `&` */
const STRUCTURAL_WORDS = [
  'begin',
  'end',
  'par',
  'item',
  'cr',
  'crcr',
  'noalign',
  'hline',
  'tabularnewline',
  'newline',
  'newpage',
  'clearpage',
]
/**
 * A paper's macro asked about only where TeX's meaning of it names none of them: the reading before TeX cannot tell which of
 * the paper's macros read nothing past their arguments, and one that sets an environment's end or an alignment's row (the
 * kernel's \and, `\end{tabular}\hskip1em\begin{tabular}`) leaves TeX inside an alignment whose cells end no paragraph, so
 * that TeX's error count never starts again and the probe stops at a hundred. Such a macro is never complete; its tests are
 * skipped, its row not written (no answer). TeX's meaning of it is read with its internals', a robust command's (`\x␣`: a
 * class's \and is `\protect \and␣`) and an optional argument's (`\\x`). `cmd` the command (`\x`); `tests` its sample's TeX,
 * read as an argument whole
 */
export const ownGuard = (cmd: string, tests: string): string =>
  `\\axt@qoktrue\\edef\\axt@qm{\\meaning${cmd}\\expandafter\\meaning\\csname ${cmd.slice(1)}\\space\\endcsname\\expandafter\\meaning\\csname\\string${cmd}\\endcsname}${[
    ...STRUCTURAL_WORDS.map((w) => `\\${w} `),
    '\\\\',
    '&',
  ]
    .map((w) => `\\edef\\axt@qt{\\noexpand\\in@{\\detokenize{${w}}}{\\axt@qm}}\\axt@qt\\ifin@\\axt@qokfalse\\fi`)
    .join('')}\\ifaxt@qok\\expandafter\\@firstofone\\else\\expandafter\\@gobble\\fi{${tests}}`

/** the punctuation section (marks.mjs punctuationSection): rows `punct <i> <a code a follower>`, `punct-at <i> <j> <box>` */
export function punctuationSection(samples: readonly PunctSample[], from = 0): string {
  const box = (i: number, j: number, n: string, body: string) =>
    `${AT_LETTER}${probeRow('punct-at', i, j, n)}\\global\\setbox\\axt@qbox\\box\\voidb@x\\gdef\\axt@qn{}\\axt@qreset${PROBE_LEVEL}\\setbox\\axt@qbox\\hbox{way ${body} \\unskip${AT_LETTER}\\xdef\\axt@qn{\\the\\lastnodetype\\ifinner\\ifhmode/in\\fi\\fi}}${AT_LETTER}\\axt@unwind\\xdef\\axt@q${n}{\\the\\wd\\axt@qbox/\\the\\ht\\axt@qbox/\\the\\dp\\axt@qbox/\\axt@qn}${BOX_RESET}`
  const put = (d: number) => `\\xdef\\axt@qo{\\axt@qo${d}}`
  const tests = samples.map(({ command, src, call, glued, own }, n) => {
    const i = from + n
    const open = `\\axtpma{q${i}a}`
    const close = `\\axtpm{q${i}b}`
    const moved = (f: string) =>
      f === ' x'
        ? put(2)
        : `${box(i, PUNCT.indexOf(f), 'm', `${src}${f} x`)}${box(i, PUNCT.indexOf(f), 'p', `${open}${src}${f}${close} x`)}\\ifx\\axt@qm\\axt@qp${put(3)}\\else${put(2)}\\fi`
    const each = [...PUNCT, ' x']
      .map(
        (f, j) =>
          `\\begingroup${box(i, j, 'a', `${src}${f}`)}${box(i, j, 'b', `${src}{}${f}`)}${box(i, j, 'c', `${open}${src}${close}${f}`)}${box(i, j, 'd', `${open}${src}${f}`)}\\ifx\\axt@qa\\axt@qb\\endgroup\\ifx\\axt@qa\\axt@qd\\ifx\\axt@qa\\axt@qc${put(0)}\\else${put(1)}\\fi\\else${put(2)}\\fi\\else${moved(f)}\\endgroup\\fi`,
      )
      .join('')
    const again = call
      ? `\\begingroup${box(i, 7, 'a', `${src}${src}`)}${box(i, 7, 'e', `${src}\\axtpma{q${i}c}${src}`)}\\endgroup\\ifx\\axt@qa\\axt@qe${put(0)}\\else${put(2)}\\fi`
      : glued
        ? `\\begingroup${box(i, 7, 'a', `${src}${glued}`)}${box(i, 7, 'b', `${src}{}${glued}`)}${box(i, 7, 'c', `${open}${src}${close}${glued}`)}\\endgroup\\ifx\\axt@qa\\axt@qb\\ifx\\axt@qa\\axt@qc${put(0)}\\else${put(1)}\\fi\\else${put(2)}\\fi`
        : put(0)
    const sample = `${each}${again}${probeRow('punct', i, '\\axt@qo')}\\gdef\\axt@qo{}\\noindent\\par`
    return own ? ownGuard(command, sample) : sample
  })
  return `${PROBE_UNWIND}\\begingroup\\newbox\\axt@qbox\\gdef\\axt@qo{}${PROBE_RESET}\\newif\\ifaxt@qok${tests.join('\n')}\\endgroup`
}
/** the look-ahead section (marks.mjs aheadSection): rows `ahead <j> <code>`, `ahead-at <j> <box>` */
export function aheadSection(samples: readonly AheadSample[]): string {
  const box = (j: number, n: string, body: string) =>
    `${AT_LETTER}${probeRow('ahead-at', j, n)}\\global\\setbox\\axt@qbox\\box\\voidb@x\\gdef\\axt@qn{}\\axt@qreset${PROBE_LEVEL}\\setbox\\axt@qbox\\hbox{way ${body} \\unskip${AT_LETTER}\\xdef\\axt@qn{\\the\\lastnodetype\\ifinner\\ifhmode/in\\fi\\fi}}${AT_LETTER}\\axt@unwind\\xdef\\axt@q${n}{\\the\\wd\\axt@qbox/\\the\\ht\\axt@qbox/\\the\\dp\\axt@qbox/\\axt@qn}${BOX_RESET}`
  const put = (d: number) => `\\xdef\\axt@qo{${d}}`
  const tests = samples.map(({ src, gap, follows, math }, j) => {
    const open = `\\axtpma{q${j}a}`
    const close = `\\axtpm{q${j}b}`
    const next = `\\${math ? 'axtpmm' : 'axtpma'}{q${j}c}`
    const boxes = `${box(j, 'w', `${src}${gap}${follows}`)}${box(j, 'a', `${src}${gap}${follows}`)}${box(j, 'c', `${open}${src}${close}${gap}${next}${follows}`)}${box(j, 'd', `${open}${src}${gap}${next}${follows}`)}\\gdef\\axt@qend{2}${box(j, 'g', `${open}${src}${gap}\\axt@qat${next}${follows}`)}`
    const word = BOXY.test(follows) ? put(1) : put(2)
    return `\\begingroup${boxes}\\endgroup\\ifx\\axt@qa\\axt@qd\\ifcase\\axt@qend\\relax\\ifx\\axt@qa\\axt@qc${put(0)}\\else${put(1)}\\fi\\or${word}\\else${put(2)}\\fi\\else${put(2)}\\fi${probeRow('ahead', j, '\\axt@qo')}\\gdef\\axt@qo{}\\noindent\\par`
  })
  const at =
    '\\def\\axt@qat{\\xdef\\axt@qend{\\ifcase\\lastnodetype 1\\or0\\or0\\or0\\or0\\or0\\or0\\or1\\or2\\or2\\or0\\or0\\or1\\else0\\fi}}'
  return `${PROBE_UNWIND}\\begingroup\\newbox\\axt@qbox\\gdef\\axt@qo{}${PROBE_RESET}${at}${tests.join('\n')}\\endgroup`
}
/** the ink section (marks.mjs inkSection): each sample \showbox-ed between rows `ink-at <i>` and `ink-end <i>` */
export function inkSection(samples: readonly string[], from = 0): string {
  const show =
    '\\begingroup\\showboxbreadth=100000 \\showboxdepth=100000 \\tracingonline=0 \\showbox\\axt@ibox\\endgroup'
  const tests = samples.map(
    (src, i) =>
      `${AT_LETTER}${probeRow('ink-at', from + i)}\\begingroup\\global\\setbox\\axt@ibox\\box\\voidb@x${PROBE_LEVEL}\\setbox\\axt@ibox\\hbox{${src}}${AT_LETTER}\\axt@unwind${show}\\endgroup${probeRow('ink-end', from + i)}\\noindent\\par`,
  )
  return `${PROBE_UNWIND}\\begingroup\\newbox\\axt@ibox${tests.join('\n')}\\endgroup`
}
/** the skip section (marks.mjs skipSection): one row `lineskip <\lineskip> <\lineskiplimit>` */
export const skipSection = (): string =>
  probeRow('lineskip', '\\the\\dimexpr\\lineskip\\relax', '\\space\\the\\lineskiplimit')
/** the probe's sections in today's order (marks.mjs markProbeTex), the name section left out: the asked commands', the ink
 *  section, the skip section, the paper's own macros', the leads' ink, the look-ahead pairs' */
export function probeTex(s: ProbeSamples): string {
  const n = s.punct.findIndex((x) => x.own)
  const asked = n < 0 ? s.punct : s.punct.slice(0, n)
  return `\\makeatletter${[
    punctuationSection(asked),
    ...(s.ink.length ? [inkSection(s.ink)] : []),
    skipSection(),
    ...(n < 0 ? [] : [punctuationSection(s.punct.slice(n), n)]),
    ...(s.leads.length ? [inkSection(s.leads, s.ink.length)] : []),
    ...(s.ahead.length ? [aheadSection(s.ahead)] : []),
  ].join('\n')}\\makeatother\n`
}
/**
 * The definitions a paper's bibliography makes for itself (live.mjs bblProvides): TeX reads them where \bibliography stands,
 * inside thebibliography's group, so that none is in force at the document's end, where the probe sets the entries' calls
 * (natbib's \natexlab, elsarticle's \urlprefix, a style's \doi). Its .bbl's text before its first entry (\bibitem,
 * \harvarditem), on the tokenizer's tokens, for TeX to read again inside the probe's group: its \begin{thebibliography} and
 * that environment's argument left out, a \newcommand set as a \providecommand (where the paper defined the name before,
 * the .bbl's \newcommand is an error and the paper's stands) and a \renewcommand left out (it would replace the paper's own
 * for the body's samples). '' where the paper has no .bbl, or one with no such entry (biblatex's)
 */
export function bblHead(tree: Tree): string {
  const path = `${jobName(tree.main)}.bbl`
  const f = tree.files.has(path) ? new Files(tree, LEX_RULES, new Set()).file(path, null) : null
  if (!f) return ''
  const end = f.toks.findIndex((t) => t.k === 'cs' && (t.name === 'bibitem' || t.name === 'harvarditem'))
  if (end < 0) return ''
  const no = () => false
  let out = ''
  let from = 0
  for (let k = 0; k < end; k++) {
    const t = f.toks[k] as (typeof f.toks)[number]
    if (t.k !== 'cs') continue
    let skip = -1
    if (t.name === 'begin' && envName(f, k + 1, end)?.name === 'thebibliography') {
      const after = envName(f, k + 1, end)?.after as number
      const g = groupEnd(f, skipBlanks(f, after, end), end)
      skip = g > 0 ? g : after
    } else if (t.name === 'renewcommand') skip = definitionAt(f, k, end, no)?.end ?? -1
    else if (t.name === 'newcommand') {
      out += `${f.text.slice(f.at(from), t.s)}\\providecommand`
      from = k + 1
      continue
    }
    if (skip < 0) continue
    out += f.text.slice(f.at(from), t.s)
    from = skip
    k = skip - 1
  }
  return out + f.text.slice(f.at(from), f.at(end))
}

/**
 * The file the first pass reads at its end (`enddocument/end`): the marks' definitions (the marked compile's: MARK_DEF,
 * LAYOUT_TEX and the DVI drivers'), then in a group a box that is never shipped, holding the bibliography's own definitions
 * and the probe's sections; a row `probe-begin` first, so that the pass's own log is what stands before it (unprobed)
 */
export function probeFile(s: ProbeSamples, compiler: string, bbl = ''): string {
  const dvi = compiler === 'latex'
  return [
    "% readarxiv: the mark probe, asked at the first pass's end (packages/engine/src/marks/probe.ts)",
    probeRow('probe-begin', s.punct.length, s.ink.length, s.leads.length, s.ahead.length),
    // (the marks' definitions at the top level: their hooks are global, and a sample that closes more groups than it opens
    // (acronym's \\ac at the document's end, 2609.20976v1) would leave the hooks with no definition for every paragraph after)
    X.MARK_DEF + (dvi ? X.DVI_MARK_DEF : '') + X.LAYOUT_TEX + (dvi ? X.DVI_LAYOUT_TEX : ''),
    PRELUDE,
    // (no file written inside the probe's group: the kernel and biblatex write on after it in the same hook, \@abspage@last to
    // the aux, the rest of the control file; the footnote counter as the document left it after)
    '\\begingroup\\setbox0\\vbox{\\@fileswfalse%',
    bbl,
    probeTex(s),
    '}\\endgroup\\ifdefined\\c@footnote\\global\\c@footnote=\\axt@fnsave\\relax\\fi',
    probeRow('probe-end'),
    '',
  ].join('\n')
}
const CP1252 = new TextDecoder('windows-1252')
/**
 * The probe file's bytes in the encoding the paper declares to inputenc (SourceDoc `encoding`), as its own files hold the
 * samples' text: UTF-8; or each character its byte, Latin-1's code point or cp1252's (a character neither holds: `?`, which
 * no sample's answer then is)
 */
export function probeBytes(text: string, encoding: SourceDoc['encoding']): Uint8Array {
  if (encoding === 'utf8') return new TextEncoder().encode(text)
  const back = new Map<string, number>()
  if (encoding === 'cp1252') for (let b = 0x80; b < 0x100; b++) back.set(CP1252.decode(new Uint8Array([b])), b)
  return Uint8Array.from(text, (c) => {
    const n = c.codePointAt(0) as number
    if (n < 0x80) return n
    if (encoding === 'latin1') return n <= 0xff ? n : 0x3f
    return back.get(c) ?? 0x3f
  })
}
/**
 * Before the sections, at the top level: the state today's probe began in, a document's start (the footnote counter at 0,
 * put back after the probe's group, where no file is written); and global copies of what the sections
 * define in their groups (their boxes, PROBE_RESET's, the look-ahead's \axt@qat, the guard's conditional), so that a sample
 * that closes more groups than it opens (2610.20266v1, 2610.40576v1: the sections' \axt@qreset gone, every box after it an
 * error) leaves the probe after it as it was
 */
const PRELUDE =
  '\\makeatletter\\xdef\\axt@fnsave{\\ifdefined\\c@footnote\\the\\c@footnote\\else0\\fi}\\ifdefined\\c@footnote\\global\\c@footnote=0\\fi' +
  '\\newbox\\axt@qbox\\newbox\\axt@ibox\\newif\\ifaxt@qok' +
  '\\xdef\\axt@qfn{\\ifdefined\\c@footnote\\the\\c@footnote\\else0\\fi}\\gdef\\axt@qreset{\\ifdefined\\c@footnote\\global\\c@footnote=\\axt@qfn\\relax\\fi\\ifdefined\\citereset\\citereset\\fi}' +
  '\\gdef\\axt@qat{\\xdef\\axt@qend{\\ifcase\\lastnodetype 1\\or0\\or0\\or0\\or0\\or0\\or0\\or1\\or2\\or2\\or0\\or0\\or1\\else0\\fi}}'
/** the hook that reads it, for the first pass's command line */
export const PROBE_HOOK = `\\AddToHook{enddocument/end}{\\input{${PROBE_FILE}}}`

// ---------------------------------------------------------------- the answers, read from the log
interface Row {
  schema: number
  tag: string
  fields: string[]
}
const ROW = /^LAYOUT-PROBE (\d+) ([a-z][a-z0-9-]*)((?: [^ \n]+)*) *$/
function readRow(line: string): Row | null {
  const m = ROW.exec(line)
  return m
    ? {
        schema: Number(m[1]),
        tag: m[2] as string,
        fields: (m[3] as string).trim().split(' ').filter(Boolean),
      }
    : null
}
/** the pass's own log: what stands before the probe's first row (the recovery compares a marked compile's errors with it) */
export function unprobed(log: string): string {
  const at = log.search(/^LAYOUT-PROBE \d+ probe-begin /m)
  return at < 0 ? log : log.slice(0, at)
}
/** an error line, or a character set in \nullfont (marks.mjs TEX_ERROR) */
const TEX_ERROR = /^(?:! |[^\s:]+:\d+: |Missing character: There is no .* in font nullfont!$)/
/** each punctuation sample's codes by command, each look-ahead pair's by key (marks.mjs readMarkProbe) */
export function readSwitches(log: string, s: ProbeSamples): Record<string, string> {
  const out: Record<string, string> = {}
  const errored = new Map<string, Set<string>>()
  let at: [string, string] | null = null
  for (const line of log.split('\n')) {
    if (TEX_ERROR.test(line)) {
      if (at) (errored.get(at[0]) ?? (errored.set(at[0], new Set()).get(at[0]) as Set<string>)).add(at[1])
      continue
    }
    const r = readRow(line)
    if (!r || r.schema !== PROBE_SCHEMA) continue
    if (r.tag === 'punct-at' && r.fields.length === 3) {
      at = [`${r.fields[0]}:${r.fields[1]}`, r.fields[2] as string]
      continue
    }
    if (r.tag === 'ahead-at' && r.fields.length === 2) {
      at = [`ahead:${r.fields[0]}`, r.fields[1] as string]
      continue
    }
    at = null
    if (r.tag === 'ahead' && r.fields.length === 2) {
      const x = s.ahead[Number(r.fields[0])]
      const code = r.fields[1] as string
      if (!x || !/^\d+$/.test(r.fields[0] as string) || !/^[012]$/.test(code)) continue
      const bad = errored.get(`ahead:${r.fields[0]}`)
      out[x.key] = !bad
        ? code
        : bad.has('w') || bad.has('a')
          ? 'x'
          : bad.has('d') || bad.has('g')
            ? '2'
            : code === '2'
              ? '2'
              : '1'
      continue
    }
    if (r.tag !== 'punct' || r.fields.length !== 2) continue
    const i = r.fields[0] as string
    const x = s.punct[Number(i)]
    const codes = r.fields[1] as string
    if (!x || !/^[0123]+$/.test(codes) || codes.length !== FOLLOWERS.length) continue
    out[x.command] = [...codes]
      .map((c, j) => {
        const bad = errored.get(`${i}:${j}`)
        if (!bad) return c
        if (bad.has('a') || bad.has('b')) return 'x'
        if (bad.has('d') || bad.has('e') || c === '3') return '2'
        return c === '2' ? '2' : '1'
      })
      .join('')
  }
  return out
}
/** the listing of each ink sample's box: its lines after TeX's `> \box…=` up to its `! OK.` (`listed`, `done`), and whether
 *  an error stood between its rows before that, or the `OK` came before any listing (`bad`) */
interface Listing {
  lines: string[]
  listed: boolean
  done: boolean
  bad: boolean
}
function listings(log: string, n: number): (Listing | null)[] {
  const out: (Listing | null)[] = Array.from({ length: n }, () => null)
  let at: number | null = null
  let cur: Listing | null = null
  for (const line of log.split('\n')) {
    const r = /^LAYOUT-PROBE /.test(line) ? readRow(line) : null
    if (r && r.schema === PROBE_SCHEMA && (r.tag === 'ink-at' || r.tag === 'ink-end') && r.fields.length === 1) {
      const i = Number(r.fields[0])
      if (r.tag === 'ink-at') {
        at = i
        cur = { lines: [], listed: false, done: false, bad: false }
        continue
      }
      if (at === i && cur && i < n) out[i] = cur
      at = null
      cur = null
      continue
    }
    if (at === null || !cur || cur.done) continue
    if (/^(?:! |[^\s:]+:\d+: )OK\.$/.test(line)) {
      if (cur.listed) cur.done = true
      else cur.bad = true
      continue
    }
    if (TEX_ERROR.test(line)) {
      cur.bad = true
      continue
    }
    if (/^> \\box\d+=/.test(line)) {
      cur.listed = true
      continue
    }
    if (cur.listed) cur.lines.push(line)
  }
  return out
}
/** a node that sets no ink (marks.mjs NO_INK_NODE), a rule (RULE_NODE) */
const NO_INK_NODE =
  /^\.+\\(?:glue|kern|penalty|mathon|mathoff|[hv]box\(|mark|pdfcolorstack|write|openout|closeout|pdfdest|pdfsave|pdfrestore|pdfsetmatrix|vadjust|discretionary|leaders|cleaders|xleaders)/
const RULE_NODE = /^\.+\\rule\(([-\d.*]+)\+([-\d.*]+)\)x([-\d.*]+)$/
/** the sources TeX set no ink for (marks.mjs readInkProbe) */
function inkless(list: ReturnType<typeof listings>, samples: readonly string[]): string[] {
  const out: string[] = []
  list.forEach((x, i) => {
    if (!x?.listed || x.bad || samples[i] === undefined) return
    for (const line of x.lines) {
      if (/^\\hbox\(/.test(line) && line === x.lines[0]) continue
      if (NO_INK_NODE.test(line) || line === '') continue
      const rule = RULE_NODE.exec(line)
      if (rule && rule[3] !== '*' && Number(rule[3]) <= 0) continue
      if (rule && rule[1] !== '*' && rule[2] !== '*' && Number(rule[1]) + Number(rule[2]) <= 0) continue
      return
    }
    out.push(samples[i] as string)
  })
  return out
}
const CHAR_NODE = /^\.+\\([A-Za-z0-9]+)\/\S+ (\S|\^\^[0-9a-f]{2}|\^\^.)(?: \(ligature (\S{2,3})\))?$/
const TEXT_ENCODING = new Set(['OT1', 'T1', 'LY1', 'TU'])
const PUNCT_ALL = '!#%&()*+,-./:;=@[]'
const PUNCT_WIDE = `${PUNCT_ALL}"$<>\\^_{|}~`
const TEXT_PASS = /^\.+\\(?:glue|kern|penalty|mathon|mathoff|[hv]box\()/
/** the text each sample sets (marks.mjs readInkTexts) */
function inkTexts(list: ReturnType<typeof listings>, samples: readonly string[]): [string, string][] {
  const out: [string, string][] = []
  list.forEach((x, i) => {
    if (!x?.done || x.bad || samples[i] === undefined) return
    let text = ''
    let math = 0
    for (const [k, line] of x.lines.entries()) {
      if (/^\\hbox\(/.test(line) && k === 0) continue
      if (/^\.+\\mathon(?![A-Za-z])/.test(line)) math++
      else if (/^\.+\\mathoff(?![A-Za-z])/.test(line) && --math < 0) return
      const c = CHAR_NODE.exec(line)
      if (c) {
        const [, enc, ch, lig] = c as unknown as [string, string, string, string | undefined]
        const punct = enc === 'T1' || enc === 'TU' ? PUNCT_WIDE : PUNCT_ALL
        if (
          TEXT_ENCODING.has(enc) &&
          (lig ? /^[A-Za-z0-9]+$/.test(lig) : /^[A-Za-z0-9]$/.test(ch) || (ch.length === 1 && punct.includes(ch)))
        )
          text += lig ?? ch
        else if (math > 0 && !lig && enc === 'OML' && /^[A-Za-z0-9]$/.test(ch)) text += ch
        else if (math > 0) text += INK_ANY
        else return
        continue
      }
      if (TEXT_PASS.test(line) || line === '') continue
      return
    }
    if (math === 0 && text && text.length <= INK_TEXT_MAX && text.replaceAll(INK_ANY, '') !== '')
      out.push([samples[i] as string, text])
  })
  return out
}
const APART_NODE =
  /^\.\\(?:glue|kern|penalty|pdfcolorstack|write|openout|closeout|special|pdfliteral|pdfdest|pdfsave|pdfrestore|pdfsetmatrix|mark)/
/** the samples whose box TeX began with a node apart from a word (marks.mjs readInkApart) */
function inkApart(list: ReturnType<typeof listings>, samples: readonly string[]): string[] {
  const out: string[] = []
  list.forEach((x, i) => {
    if (!x?.done || x.bad || samples[i] === undefined) return
    const first = x.lines.find((l) => /^\.(?!\.)/.test(l))
    if (first && APART_NODE.test(first)) out.push(samples[i] as string)
  })
  return out
}
const TEX_PT = /^(-?\d+(?:\.\d+)?)pt$/
const BP_PER_PT = 72 / 72.27
/** \lineskip and \lineskiplimit in PDF units (marks.mjs readSkipProbe) */
function lineskipOf(log: string): [number, number] | null {
  const rows = log
    .split('\n')
    .map(readRow)
    .filter((r): r is Row => !!r && r.schema === PROBE_SCHEMA && r.tag === 'lineskip')
  if (rows.length !== 1 || rows[0]?.fields.length !== 2) return null
  const pt = rows[0].fields.map((f) => Number(TEX_PT.exec(f)?.[1] ?? Number.NaN))
  return pt.every((x) => Number.isFinite(x) && Math.abs(x) <= 16384)
    ? (pt.map((x) => x * BP_PER_PT) as [number, number])
    : null
}

/** what the probe answered, as the marks writer (mark.ts Answers, with TeX's complete macros) and the instrument take it */
export interface ProbeAnswers {
  switches: Record<string, string>
  inkless: string[]
  apart: string[]
  texts: [string, string][]
  lineskip: [number, number] | null
  probed: { command: string; src: string; glued?: string }[]
  seen: string[]
}
/** the probe's answers from the first pass's log and the samples it was written for; none from a log longer than LOG_MAX
 *  (the recovery's resource limit: the marks then as with no probe) */
export function readAnswers(log: string, s: ProbeSamples): ProbeAnswers {
  if (log.length > LOG_MAX)
    return { switches: {}, inkless: [], apart: [], texts: [], lineskip: null, probed: [], seen: [] }
  const ink = listings(log, s.ink.length + s.leads.length)
  const head = ink.slice(0, s.ink.length)
  return {
    switches: readSwitches(log, s),
    inkless: inkless(head, s.ink),
    apart: inkApart(head, s.ink),
    texts: inkTexts(ink, [...s.ink, ...s.leads]),
    lineskip: lineskipOf(log),
    probed: s.punct
      .filter((x) => x.own)
      .map((x) => (x.glued ? { command: x.command, src: x.src, glued: x.glued } : { command: x.command, src: x.src })),
    seen: s.seen,
  }
}
/** the first pass's probe for a tree: its samples from a reading with no definitions (the reader's own, `pre`), and its file */
export function firstProbe(pre: Pick<SourceDoc, 'units' | 'own'>, tree: Pick<Tree, 'main'>, compiler: string) {
  const samples = probeSamples(pre)
  return { samples, file: probeFile(samples, compiler), main: tree.main }
}
