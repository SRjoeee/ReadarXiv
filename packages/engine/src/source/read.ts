// readSource: a paper's TeX source cut into units, read on the one tokenizer's tokens. The cut is the one the engine's front
// end makes (src/pdf-reader/engine/source/latex-front.mjs walk): paragraphs by TeX's own paragraph ends, headings, captions,
// footnotes nested in their paragraph, abstracts, theorems with their titles, list items, table cells, author names and
// places, bibliography entries, the texts of a TikZ picture; pieces for everything that is not prose, typed where they are
// cut (math, a display, a citation, a reference, an address, code, a note's mark …), spans for the text arguments of the
// commands that set them. What a macro of the paper's is comes from TeX (`definitions`), or from a definition the body makes
// where the walk meets it; what its body does with its arguments is worked out on its tokens (macros.ts).
import { type BUnit, Builder, close, hasAddress, IN_TEXT } from './build.ts'
import { type Definitions, fileArgs, INPUTS, jobName, type Tree } from './definitions.ts'
import { Files, type SourceFile } from './files.ts'
import {
  ACCENT_MARKS,
  ACCENTS,
  BIB_KEPT_FIELD,
  BIB_TEXT,
  CAPTIONS,
  CITATION,
  CONTENT_BOX,
  DEPTH,
  displayEnv,
  elementKind,
  FLOAT_ENVS,
  FRONT_BOXES,
  FRONT_LINES,
  FRONT_MATTER,
  FRONT_NAMES,
  FRONT_PROSE,
  HEADINGS,
  INLINE_TEXT,
  LETTER_COMMANDS,
  LISTINGS,
  lexRules,
  MATH_ENVS,
  NO_ARGS,
  OPT_ONLY,
  OWN_UNIT_ARG,
  RUNNING_HEADS,
  SETTABLE,
  SKIP_ENVS,
  TABLE_ENVS,
  TEX_IFS,
  UNIT_FORMS,
} from './kinds.ts'
import {
  adjacent,
  bodyFile,
  canonical,
  definitionAt,
  envEnd,
  envName,
  type Macro,
  macroOf,
  ownNames,
  type Site,
  setsWords,
} from './macros.ts'
import {
  type Arg,
  bindingsOf,
  bracketEnd,
  commandParams,
  environmentParams,
  frontRole,
  groupEnd,
  isBegin,
  isEnd,
  isOther,
  type Param,
  paramsOf,
  REGISTER,
  readArgs,
  skipBlanks,
  tokenAt,
} from './roles.ts'
import { TEXT_SYMBOLS } from './tables.ts'
import { CAT, type Token } from './tokens.ts'
import type { Piece } from './types.ts'

/** a unit of the source: its content (the translation's grammar), and where it stands */
export interface SourceUnit {
  id: string
  kind: string
  content: Piece[]
  file: string
  /** source offsets in its file's text (lines ended at LF) */
  start: number
  end: number
  depth?: number
  title?: true
  front?: true
  held?: true
  nested?: true
  bracketed?: true
  inFloat?: true
}
export interface SourceDoc {
  main: string
  /** the units in TeX's order (a nested unit before the unit it stands in) */
  units: SourceUnit[]
  /** the files TeX reads, in the order it first reads them */
  files: string[]
}

const ASSIGNMENT_DIMEN = String.raw`[-+]?[ \t]*(?:\d+(?:\.\d*)?|\.\d+)[ \t]*(?:true[ \t]*)?(?:pt|em|ex|cm|mm|in|bp|sp|pc|dd|cc|mu|fill?l?|\\[A-Za-z@]+)?`
const ASSIGNMENT = new RegExp(
  String.raw`^[ \t]*(?:[=<>][ \t]*(?:${ASSIGNMENT_DIMEN}|\\[A-Za-z@]+)|${ASSIGNMENT_DIMEN})(?:[ \t]*(?:plus|minus)[ \t]*${ASSIGNMENT_DIMEN})*(?![A-Za-z])`,
)
/** a body that ends a table's row and does nothing else but draw its rules (`\\`, \tabularnewline, \cr, booktabs' or
 *  LaTeX's rules after it), and one that ends with such a row end after what it sets */
const ROW_RULES = String.raw`(?:\\(?:hline|midrule|toprule|bottomrule|cline\s*\{[^}]*\}|cmidrule\s*(?:\([^)]*\))?\s*\{[^}]*\}|addlinespace(?:\s*\[[^\]]*\])?)\s*)*$`
const ROW_END = new RegExp(String.raw`^(?:\\\\\*?\s*(?:\[[^\]]*\])?|\\tabularnewline|\\cr)\s*${ROW_RULES}`)
const ROW_END_TAIL = new RegExp(
  String.raw`(?:^|[^\\])(?:\\\\\*?\s*(?:\[[^\]]*\])?|\\tabularnewline|\\cr)\s*${ROW_RULES}`,
)
const RULE_SPEC = new RegExp(String.raw`^(?:[ \t]*(?:height|depth|width)[ \t]*${ASSIGNMENT_DIMEN})+(?![A-Za-z])`)
const THEOREM_PARAMS = paramsOf('[t')
const PDF_STRING = 'texorpdfstring'
const ROLE_OF = (name: string) => (FRONT_NAMES.has(name) ? 'names' : 'places')
const AUTHOR_KINDS = new Set(['author', 'affiliation'])

interface Ctx {
  files: Files
  bindings: ReadonlySet<number>
  own: ReadonlySet<string>
  /** the macros in force: TeX's at the document's start, and the body's own definitions as the walk meets them */
  macros: Map<string, Macro>
  theorems: Set<string>
  /** the paper's environments whose begin opens a display (eqsplit: \equation\aligned) */
  displayEnvs: Set<string>
  /** the paper's environments whose body is code */
  skipEnvs: Set<string>
  /** the paper's shorthands of an environment's begin or end (\be: \begin{equation}) */
  envMacros: ReadonlyMap<string, { side: 'begin' | 'end'; env: string }>
  /** the paper's own environments' parameters (by TeX's begin code: \newenvironment's count) */
  envParams: Map<string, readonly Param[]>
  /** the newif values TeX holds at the document's start, by name, as the body changes them */
  ifs: Map<string, boolean>
  defs: Definitions
  ended: boolean
  seen: Set<string>
  order: string[]
  dirs: string[]
  bbl: string | null
  /** a cell's row ends of the paper's own (a macro whose body is `\\`) */
  rowEnds: Set<string>
  /** the paper's macros whose body ends a row after its arguments */
  rowEndsAfter: Set<string>
  /** backref is loaded with its parscan: an entry's list stands after its first paragraph */
  backref: boolean
  /** the calls of the paper's macros of no argument the walk met: how many, in which kinds of unit */
  calls: Map<string, { n: number; kinds: Set<string> }>
  /** the paper's environments whose begin opens a table their end closes */
  tableWraps: Set<string>
}

const name = (t: Token | undefined): string | null => (t?.k === 'cs' ? t.name : null)
const isLetterName = (n: string) => /^[A-Za-z@]+$/.test(n)

class Walker {
  readonly ctx: Ctx
  constructor(ctx: Ctx) {
    this.ctx = ctx
  }
  isCall = (n: string): boolean => {
    const p = this.params(n)
    return !!p?.length && p !== REGISTER
  }
  params(n: string): readonly Param[] | null {
    return this.ctx.own.has(n) ? null : commandParams(n, this.ctx.bindings)
  }

  /** a command's arguments as the walk reads them: a citation's every adjacent one; the role table's form where it knows the
   *  command (a last argument that is a command taking its own arguments read on through them); else every adjacent one */
  commandArgs(f: SourceFile, i: number, n: string, to: number): { args: Arg[]; end: number; known: boolean } {
    if (CITATION.test(n)) return this.citationArgs(f, i, n, to)
    const params = this.params(n)
    if (params) {
      if (params.length === 1 && params[0]?.shape === '=') return { args: [], end: i, known: true }
      const r = readArgs(f, i, params, to, this.isCall)
      if (r.complete) {
        const last = r.args.at(-1)
        const lt = last ? f.toks[last.a] : undefined
        if (
          last &&
          last.b === r.end &&
          last.shape !== '[' &&
          'tca'.includes(last.role) &&
          lt?.k === 'cs' &&
          last.b === last.a + 1 &&
          isLetterName(lt.name)
        ) {
          const own = this.commandArgs(f, last.b, lt.name, to)
          const inner = own.known
            ? own.args
                .filter((a) => a.shape !== '[' && isBegin(f.toks[a.a]) && (a.role === 't' || a.role === 'c'))
                .map((a) => ({ ...a, param: -1 }))
            : []
          if (own.end > last.b)
            return { args: [...r.args.slice(0, -1), { ...last, b: own.end }, ...inner], end: own.end, known: true }
        }
        return { args: r.args, end: r.end, known: true }
      }
    }
    const args = adjacent(f, i, to)
    return { args, end: args.at(-1)?.b ?? i, known: false }
  }
  citationArgs(f: SourceFile, i: number, n: string, to: number): { args: Arg[]; end: number; known: boolean } {
    const notes: Arg[] = []
    let at = i
    const multi = /cites$/i.test(n)
    for (let k2 = 0; k2 < 2; k2++) {
      const k = skipBlanks(f, at, to)
      let e = -1
      if (!multi && k2 === 0 && isOther(f.toks[k], '<')) e = this.until(f, k, to, '>')
      else if (multi && isOther(f.toks[k], '(')) e = this.until(f, k, to, ')')
      if (e < 0) break
      notes.push({ shape: '[', role: 'a', param: k2, a: k, b: e })
      at = e
    }
    const rest = notes.length ? adjacent(f, at, to) : null
    if (rest?.some((a) => a.shape === '{'))
      return { args: [...notes, ...rest], end: rest.at(-1)?.b ?? at, known: false }
    const args = adjacent(f, i, to)
    return { args, end: args.at(-1)?.b ?? i, known: false }
  }
  /** past a delimiter `close` at the group level of token k, within the paragraph */
  until(f: SourceFile, k: number, to: number, ch: string): number {
    for (let j = k + 1; j < to; j++) {
      const t = f.toks[j] as Token
      if (t.k === 'par') return -1
      if (isBegin(t)) {
        const c = f.close[j] ?? -1
        if (c < 0) return -1
        j = c
        continue
      }
      if (isEnd(t)) return -1
      if (isOther(t, ch)) return j + 1
    }
    return -1
  }

  /** a command's form for a heading, a caption, a footnote: the paper's own definition's where it gives an arity, else
   *  LaTeX's */
  unitForm(n: string): string {
    const m = this.ctx.macros.get(n)
    if (m && m.params > 0) return (m.opt ? '[' : '') + '{'.repeat(m.params - (m.opt ? 1 : 0))
    return UNIT_FORMS[n] ?? '[{'
  }
  argsOfForm(f: SourceFile, i: number, form: string, to: number): { args: Arg[]; end: number } {
    const args: Arg[] = []
    let at = i
    const k0 = skipBlanks(f, at, to)
    if (isOther(f.toks[k0], '*') && (isBegin(f.toks[k0 + 1]) || isOther(f.toks[k0 + 1], '['))) at = k0 + 1
    for (const shape of form) {
      const k = skipBlanks(f, at, to)
      if (shape === '[') {
        if (!isOther(f.toks[k], '[')) continue
        const e = bracketEnd(f, k, to)
        if (e < 0) break
        args.push({ shape, role: 'a', param: args.length, a: k, b: e })
        at = e
        continue
      }
      const e = groupEnd(f, k, to)
      if (e < 0) break
      args.push({ shape: '{', role: 'a', param: args.length, a: k, b: e })
      at = e
    }
    return { args, end: at }
  }

  // ---------------------------------------------------------------- files
  /** a file TeX reads at this place: its units walked with a builder of its own */
  visit(rel: string, dirs: string[], inFloat: boolean, codes: SourceFile['after'] | null, units: BUnit[]): void {
    const path = this.ctx.files.find(rel, dirs)
    if (!path || this.ctx.seen.has(path)) return
    const f = this.ctx.files.file(path, codes)
    if (!f) return
    this.ctx.seen.add(path)
    this.ctx.order.push(path)
    const b = new Builder(path, units, f.text)
    if (inFloat) b.inFloat = true
    const outer = this.ctx.dirs
    this.ctx.dirs = dirs
    this.walk(f, 0, f.toks.length, b)
    b.flush()
    this.ctx.dirs = outer
  }

  // ---------------------------------------------------------------- the walk
  walk(f: SourceFile, from: number, to: number, b: Builder): void {
    const toks = f.toks
    const ctx = this.ctx
    let i = from
    let textStart = -1
    let textEnd = -1
    const endText = () => {
      if (textStart >= 0 && textEnd > textStart) b.text_(f.text.slice(textStart, textEnd), textStart, textEnd)
      textStart = -1
    }
    const addText = (t: Token) => {
      if (textStart < 0) textStart = t.s
      textEnd = t.e
    }
    // (plain groups and spans walked in place, not by recursion: a group's close is where the walk takes its frame off)
    const frames: { close: number; after: () => void }[] = []
    while (!ctx.ended) {
      const top = frames.at(-1)
      if (top && i === top.close) {
        endText()
        frames.pop()
        top.after()
        i = top.close + 1
        continue
      }
      if (i >= to) break
      const t = toks[i] as Token
      switch (t.k) {
        case 'comment':
          endText()
          i++
          continue
        case 'par': {
          // (today's reading of empty lines, kept so that the units' ids are today's: it takes a line end and the empty line
          // after it as one \par, two by two, and a comment's own empty line after it only where a unit is open; a line end
          // left over begins the next text, as a blank. TeX reads all of them as one \par: only blanks differ)
          const prevComment = toks[i - 1]?.k === 'comment'
          endText()
          let n = 0
          for (let k = t.s; k < t.e; k++) if (f.text.charCodeAt(k) === 10) n++
          if (prevComment && b.cur) n--
          b.flush()
          if (n % 2 === 1) {
            textStart = t.e - 1
            textEnd = t.e
          }
          i++
          continue
        }
        case 'space':
        case 'letter':
          addText(t)
          i++
          continue
        case 'verb':
          endText()
          b.ph(f.text.slice(t.s, t.e), 'code', t.s, t.e)
          i++
          continue
        case 'verbatim':
          endText()
          b.flush()
          i++
          continue
        case 'raw':
          endText()
          b.ph(f.text.slice(t.s, t.e), 'url', t.s, t.e)
          i++
          continue
        case 'char': {
          if (t.cat === CAT.other) {
            addText(t)
            i++
            continue
          }
          if (t.cat === CAT.math) {
            const e = this.mathEnd(f, i, to)
            if (e < 0) {
              i++
              continue
            }
            endText()
            const display = isChar(toks[i + 1], CAT.math)
            b.ph(f.src(i, e), display ? 'display' : 'math', t.s, f.at(e - 1) + 1, display)
            i = e
            continue
          }
          if (t.cat === CAT.active) {
            endText()
            b.ph(t.ch, 'space', t.s, t.e)
            i++
            continue
          }
          if (t.cat === CAT.begin) {
            const c = f.close[i] ?? -1
            if (c < 0 || c >= to) {
              i++
              continue
            }
            // a group around an accent or a letter command alone: the letter, in its word
            const letter = this.groupLetter(f, i, c)
            if (letter) {
              endText()
              b.letter(letter, f.src(i, c + 1), t.s, (toks[c] as Token).e)
              i = c + 1
              continue
            }
            endText()
            b.open('{', 'group', t.s)
            const closeTok = toks[c] as Token
            frames.push({ close: c, after: () => b.close('}', closeTok.e) })
            i++
            continue
          }
          if (t.cat === CAT.align && b.cellMode) {
            endText()
            b.flush()
            i++
            continue
          }
          // a `}` with no group open here, `&`, `#`, `^`, `_`: an element of its own
          endText()
          b.ph(t.ch, t.cat === CAT.sup || t.cat === CAT.sub ? 'math' : 'other', t.s, t.e)
          i++
          continue
        }
        case 'cs':
          break
      }
      if (t.k !== 'cs') {
        i++
        continue
      }
      const r = this.command(f, i, to, b, endText)
      if (r.frame) frames.push(r.frame)
      i = r.next
    }
    endText()
    // (frames whose close lies past `to`: never, as a group's close is found within the walk's bounds)
  }

  /** past the formula opening at token i ($, $$): its closing shift at its own group depth */
  mathEnd(f: SourceFile, i: number, to: number): number {
    const double = isChar(f.toks[i + 1], CAT.math)
    for (let j = i + (double ? 2 : 1); j < to; j++) {
      const t = f.toks[j] as Token
      if (isBegin(t)) {
        const c = f.close[j] ?? -1
        if (c < 0) return -1
        j = c
        continue
      }
      if (t.k === 'char' && t.cat === CAT.math) {
        if (!double) return j + 1
        if (isChar(f.toks[j + 1], CAT.math)) return j + 2
      }
    }
    return -1
  }
  /** past `\)` or `\]` after `\(` or `\[` at token i */
  mathCsEnd(f: SourceFile, i: number, to: number, close: string): number {
    for (let j = i + 1; j < to; j++) if (name(f.toks[j]) === close) return j + 1
    return -1
  }

  /** an accent's letter or a letter command alone in a group (`{\'e}`, `{\L}`): the letter */
  groupLetter(f: SourceFile, i: number, c: number): string | null {
    const k = skipBlanks(f, i + 1, c)
    const t = f.toks[k]
    if (t?.k !== 'cs') return null
    const a = this.accentLetter(f, k, c)
    if (a && skipBlanks(f, a.end, c) === c) return a.letter
    if (k === i + 1) {
      const l = this.letterCommand(f, k, c)
      if (l && l.end === c) return l.letter
    }
    return null
  }
  /** an accent at token k and its letter, where the accented letter is one every target font sets */
  accentLetter(f: SourceFile, k: number, to: number): { letter: string; end: number } | null {
    const n = name(f.toks[k])
    if (n === null || !Object.hasOwn(ACCENT_MARKS, n) || this.ctx.macros.has(n)) return null
    const mark = ACCENT_MARKS[n] as string
    const base = this.accentBase(f, k + 1, to)
    const letter = base && (base.base + mark).normalize('NFC')
    return letter && SETTABLE.has(letter) ? { letter, end: base.end } : null
  }
  accentBase(f: SourceFile, k: number, to: number): { base: string; end: number } | null {
    k = skipBlanks(f, k, to)
    const t = f.toks[k]
    if (!t || k >= to) return null
    if (t.k === 'letter' && /[A-Za-z]/.test(f.text[t.s] as string)) return { base: f.text[t.s] as string, end: k + 1 }
    if (t.k === 'cs' && (t.name === 'i' || t.name === 'j')) {
      let e = skipBlanks(f, k + 1, to)
      if (isBegin(f.toks[e]) && f.close[e] === e + 1) e += 2
      else e = k + 1
      return e <= to ? { base: t.name, end: e } : null
    }
    if (!isBegin(t)) return null
    const c = f.close[k] ?? -1
    if (c < 0 || c >= to) return null
    const inner = this.accentBase(f, k + 1, c)
    return inner && skipBlanks(f, inner.end, c) === c ? { base: inner.base, end: c + 1 } : null
  }
  /** a kernel letter command at token k (\L ukasz, \L{}ukasz, Bj\o rn): the letter, TeX's skipped blanks with it */
  letterCommand(f: SourceFile, k: number, to: number): { letter: string; end: number } | null {
    const n = name(f.toks[k])
    if (n === null || !LETTER_COMMANDS.has(n) || this.ctx.macros.has(n)) return null
    const letter = TEXT_SYMBOLS[`\\${n}`]
    if (!letter) return null
    let e = k + 1
    const sp = f.toks[e]
    if (sp?.k === 'space' && !f.text.slice(sp.s, sp.e).includes('\n')) e++
    if (isBegin(f.toks[e]) && f.close[e] === e + 1) e += 2
    return e <= to ? { letter, end: e } : null
  }

  /** one command at token i: what it is decides what the walk does; the token to go on from, and a frame where the walk
   *  goes into a group in place */
  command(
    f: SourceFile,
    i: number,
    to: number,
    b: Builder,
    endText: () => void,
  ): { next: number; frame?: { close: number; after: () => void } } {
    const toks = f.toks
    const ctx = this.ctx
    const t = toks[i] as Token & { k: 'cs' }
    const n = t.name
    // (a starred control word: its star with it, as the walk reads it)
    let end = i + 1
    if (isLetterName(n) && isOther(toks[end], '*') && (toks[end] as Token).s === t.e) end++
    const at = t.s
    const src = (e: number) => f.text.slice(at, f.at(e - 1) < at ? at : (toks[e - 1] as Token).e)
    const ph = (e: number, kind: string) => {
      endText()
      b.ph(src(e), kind, at, (toks[e - 1] as Token).e)
      return { next: e }
    }

    // definitions the body makes: recorded as TeX makes them, the definition itself one placeholder
    if (/^(?:(?:re)?newcommand|providecommand|DeclareRobustCommand|[gex]?def)$/.test(n)) {
      const d = definitionAt(f, i, to, this.isCall)
      if (d) {
        // (\providecommand and \newcommand define nothing defined already: TeX's meaning at the document's start, or a
        // definition the walk met; \renewcommand and \def always define)
        const held = definitions(ctx.defs, d.name)
        if (!((d.provide || n === 'newcommand') && (ctx.macros.has(d.name) || held))) {
          ctx.macros.set(d.name, d.macro)
          const body = d.macro.body.trim()
          if (d.macro.params === 0 && ROW_END.test(body)) ctx.rowEnds.add(d.name)
          else if (ROW_END_TAIL.test(body)) ctx.rowEndsAfter.add(d.name)
        }
        return ph(d.end, 'other')
      }
    }
    // an environment the body defines (\newenvironment{x}[n][d]{begin}{end}), or a theorem (\newtheorem{x}…): what it is
    // from here on, as TeX defines it here; the definition itself read as any command is
    if (/^(?:re)?newenvironment$|^provideenvironment$/.test(n)) this.environmentAt(f, end, to)
    if (/^newtheorem$|^spnewtheorem$|^declaretheorem$/.test(n)) {
      const a = adjacent(f, end, to).find((x) => x.shape === '{')
      if (a) for (const x of f.src(a.a + 1, a.b - 1).split(',')) if (x.trim()) ctx.theorems.add(x.trim())
    }
    // conditionals
    if (n === 'iffalse' || (n === 'if' && this.ifWords(f, end))) {
      const stop = this.branchEnd(f, end, to, false)
      if (stop > 0) {
        endText()
        b.flush()
        return { next: stop }
      }
    }
    if (this.isConditional(n) && n !== 'ifcase') {
      const r = this.conditional(f, i, end, to, b, endText, n)
      if (r) return r
    }
    if (n === '(' || n === '[') {
      const e = this.mathCsEnd(f, i, to, n === '(' ? ')' : ']')
      if (e > 0) {
        endText()
        b.ph(f.src(i, e), n === '[' ? 'display' : 'math', at, (toks[e - 1] as Token).e, n === '[')
        return { next: e }
      }
    }
    const shorthand = ctx.envMacros.get(n)
    if (
      shorthand?.side === 'begin' &&
      (MATH_ENVS.test(shorthand.env) ||
        ctx.displayEnvs.has(shorthand.env) ||
        SKIP_ENVS.test(shorthand.env) ||
        ctx.skipEnvs.has(shorthand.env))
    ) {
      let stop = end
      for (let k = end; k < to; k++) {
        const u = toks[k] as Token
        if (u.k !== 'cs') continue
        const e2 = ctx.envMacros.get(u.name)
        if (e2?.side === 'end' && e2.env === shorthand.env) {
          stop = k + 1
          break
        }
        if (u.name === 'end' && envName(f, k + 1, to)?.name === shorthand.env) {
          stop = envName(f, k + 1, to)?.after ?? k + 1
          break
        }
      }
      endText()
      b.ph(
        src(stop),
        displayEnv(shorthand.env) || ctx.displayEnvs.has(shorthand.env) ? 'display' : 'math',
        at,
        (toks[stop - 1] as Token).e,
        true,
      )
      return { next: stop }
    }
    if (n === 'begin') return this.begin(f, i, end, to, b, endText)
    if (n === 'end') {
      endText()
      b.flush()
      const e = envName(f, end, to)
      if (e?.name === 'document') {
        ctx.ended = true
        return { next: to }
      }
      return { next: e ? e.after : end }
    }
    if (n === 'bibliography') {
      const a = adjacent(f, end, to)[0]
      if (a?.shape === '{') {
        endText()
        b.flush()
        if (ctx.bbl) this.visit(ctx.bbl, [], b.inFloat, null, b.units)
        return { next: a.b }
      }
    }
    if (b.kind === 'reference' && BIB_TEXT.has(n)) {
      const before = BIB_TEXT.get(n) as number
      const args = adjacent(f, end, to).slice(0, before + 1)
      if (args.length === before + 1 && args.every((a) => a.shape === '{')) {
        const text = args[before] as Arg
        const field = before ? f.src((args[0] as Arg).a + 1, (args[0] as Arg).b - 1).trim() : ''
        endText()
        if (n === 'bibinfo' && BIB_KEPT_FIELD.test(field)) return ph(text.b, 'other')
        b.open(f.text.slice(at, (toks[text.a] as Token).e), 'group', at)
        const closeTok = toks[text.b - 1] as Token
        return { next: text.a + 1, frame: { close: text.b - 1, after: () => b.close('}', closeTok.e) } }
      }
    }
    if (n === 'item') {
      endText()
      b.flush()
      const a = adjacent(f, end, to)[0]
      return { next: a?.shape === '[' ? a.b : end }
    }
    const input = INPUTS.get(n)
    if (input) {
      endText()
      b.flush()
      const codes = f.codesAt.get(i) ?? null
      const lx = { text: f.text, pos: t.e }
      const named = fileArgs(lx as never, input)
      // (the file's name read off the text: the walk goes on at the token after it)
      const nextTok = tokenAt(f, lx.pos, end, to)
      for (const a of named) {
        const dirs = a.dirs.length
          ? [a.dirs[0] === '' ? '' : (input === 'subimport' ? `${ctx.dirs[0] ?? ''}/` : '') + a.dirs[0], ...ctx.dirs]
          : ctx.dirs
        this.visit(
          a.name,
          dirs.map((d) => d.replace(/\/+$/, '')),
          b.inFloat,
          codes,
          b.units,
        )
      }
      return { next: Math.max(nextTok, end) }
    }
    if (HEADINGS.has(n) || OWN_UNIT_ARG.has(n)) return this.ownUnit(f, i, end, to, b, endText, n)
    if ((n === 'multicolumn' || n === 'multirow' || n === 'makecell' || n === 'shortstack') && b.cellMode) {
      const read = this.commandArgs(f, end, n, to)
      const last = read.known ? read.args.findLast((a) => a.shape !== '[' && a.role === 'c') : undefined
      if (last && isBegin(toks[last.a]) && last.b === read.end) {
        endText()
        b.open(f.text.slice(at, (toks[last.a] as Token).e), 'group', at)
        const closeTok = toks[last.b - 1] as Token
        return { next: last.a + 1, frame: { close: last.b - 1, after: () => b.close('}', closeTok.e) } }
      }
    }
    if (n === 'subfloat') {
      const args = adjacent(f, end, to).slice(0, 3)
      const opt = args[0]?.shape === '[' ? args[0] : undefined
      const content = args.find((a) => a.shape === '{')
      if (content) {
        endText()
        b.flush()
        if (opt) this.inKind(f, opt.a + 1, opt.b - 1, b, 'caption')
        this.walk(f, content.a + 1, content.b - 1, b)
        b.flush()
        return { next: content.b }
      }
    }
    if (FRONT_MATTER.has(n)) {
      const { args, end: e } = this.frontArgs(f, end, n, to)
      endText()
      b.flush()
      for (const a of args) {
        if (a.shape === '{') this.frontBlock(f, a.a + 1, a.b - 1, b, ROLE_OF(n))
        else this.frontNotes(f, a.a + 1, a.b - 1, b)
      }
      return { next: e }
    }
    if ((FRONT_PROSE.has(n) || FRONT_BOXES.has(n)) && AUTHOR_KINDS.has(b.kind ?? '')) {
      const a = adjacent(f, end, to)[0]
      if (a?.shape === '{') {
        endText()
        const lines = FRONT_LINES.get(n)
        const saved = b.kind
        if (lines) {
          b.flush()
          b.kind = lines
        }
        b.open(f.text.slice(at, (toks[a.a] as Token).e), 'group', at)
        this.walk(f, a.a + 1, a.b - 1, b)
        b.close('}', (toks[a.b - 1] as Token).e)
        if (lines) {
          b.flush()
          b.kind = saved
        }
        return { next: a.b }
      }
    }
    if (CONTENT_BOX.has(n)) {
      const reqs = adjacent(f, end, to).filter((a) => a.shape === '{')
      const content = reqs[(CONTENT_BOX.get(n) as number) - 1]
      if (content) {
        endText()
        b.open(f.text.slice(at, (toks[content.a] as Token).e), 'group', at)
        const closeTok = toks[content.b - 1] as Token
        return { next: content.a + 1, frame: { close: content.b - 1, after: () => b.close('}', closeTok.e) } }
      }
    }
    const style = INLINE_TEXT.get(n)
    if (style) {
      const a = adjacent(f, end, to)[0]
      if (a?.shape === '{') {
        endText()
        b.open(f.text.slice(at, (toks[a.a] as Token).e), style, at)
        const closeTok = toks[a.b - 1] as Token
        return { next: a.a + 1, frame: { close: a.b - 1, after: () => b.close('}', closeTok.e) } }
      }
    }
    if (b.cellMode && ctx.rowEnds.has(n)) {
      endText()
      b.flush()
      const k = skipBlanks(f, end, to)
      return { next: isBegin(toks[k]) && f.close[k] === k + 1 ? k + 2 : end }
    }
    // the paper's macros
    const macro = ctx.macros.get(n)
    const call =
      macro && !(macro.params === 0 && ACCENTS.has(n)) && !macro.delimited && !(macro.params === 0 && macro.readsOn)
        ? this.macroArgs(f, end, macro, to)
        : null
    if (call && macro) {
      // (one whose body ends the row after its arguments, in a cell: a row of its own, its prose a cell of its own)
      if (b.cellMode && ctx.rowEndsAfter.has(n) && !macro.stores) {
        endText()
        b.flush()
        const arg = macro.prose ? call.reqs[macro.prose - 1 - (macro.opt ? 1 : 0)] : undefined
        if (arg?.group) {
          this.walk(f, arg.a + 1, arg.b - 1, b)
          b.flush()
        }
        return { next: call.end }
      }
      if (!macro.prose && frontRole(n)?.[1]) {
        endText()
        const e = this.frontCommand(f, end, n, to, b, true)
        if (e > 0) return { next: e }
      }
      if (macro.prose) {
        const arg = call.reqs[macro.prose - 1 - (macro.opt ? 1 : 0)]
        if (arg?.group && macro.stores) {
          endText()
          b.flush()
          const before = b.units.length
          this.inKind(f, arg.a + 1, arg.b - 1, b, 'para')
          for (const u of b.units.slice(before)) {
            u.front = true
            u.held = true
          }
          return { next: call.end }
        }
        if (arg && !macro.tail && setsWords(macro)) {
          endText()
          const text = this.expandedText(f, macro, call.reqs)
          if (text) b.letter(text, src(call.end), at, (toks[call.end - 1] as Token).e)
          else b.ph(src(call.end), 'other', at, (toks[call.end - 1] as Token).e)
          return { next: call.end }
        }
        if (arg?.group) {
          if (this.holdsBlock(f, arg.a + 1, arg.b - 1)) {
            endText()
            b.flush()
            this.walk(f, arg.a + 1, arg.b - 1, b)
            b.flush()
            return { next: call.end }
          }
          endText()
          b.open(f.text.slice(at, (toks[arg.a] as Token).e), 'group', at)
          const closeSrc = f.text.slice((toks[arg.b - 1] as Token).s, (toks[call.end - 1] as Token).e)
          const closeEnd = (toks[call.end - 1] as Token).e
          const walkedTo = arg.b - 1
          // (the call's arguments after its prose one go with its close)
          if (call.end === arg.b)
            return { next: arg.a + 1, frame: { close: walkedTo, after: () => b.close(closeSrc, closeEnd) } }
          this.walk(f, arg.a + 1, walkedTo, b)
          b.close(closeSrc, closeEnd)
          return { next: call.end }
        }
      }
      let e = call.end
      if (!macro.params) {
        const k = skipBlanks(f, e, to)
        if (isBegin(toks[k]) && f.close[k] === k + 1) e = k + 2
        // (a call of a macro of no argument, counted: one whose every call the walk meets has its body walked where it is
        // defined, its text the paper's own words: storedBodies)
        const c = ctx.calls.get(n) ?? { n: 0, kinds: new Set<string>() }
        c.n++
        c.kinds.add(b.kind ?? 'para')
        ctx.calls.set(n, c)
      }
      return ph(e, 'other')
    }
    if (n === 'tikz') {
      const stop = this.tikzEnd(f, end, to)
      if (stop > 0) return ph(stop, 'other')
    }
    if (n === 'par') {
      endText()
      b.flush()
      return { next: end }
    }
    if (n === 'endinput') return { next: end }
    // an accent and its letter: the letter in its word, else one element
    const letter = ACCENTS.has(n) ? this.accentLetter(f, i, to) : null
    if (letter) {
      endText()
      b.letter(letter.letter, f.src(i, letter.end), at, (toks[letter.end - 1] as Token).e)
      return { next: letter.end }
    }
    const kernel = this.letterCommand(f, i, to)
    if (kernel) {
      endText()
      b.letter(kernel.letter, f.src(i, kernel.end), at, (toks[kernel.end - 1] as Token).e)
      return { next: kernel.end }
    }
    if (ACCENTS.has(n)) {
      let k = /^[A-Za-z]$/.test(n) ? skipBlanks(f, end, to) : end
      const u = toks[k]
      if (isBegin(u)) k = groupEnd(f, k, to)
      else k = k + 1
      if (k > 0 && k <= to) return ph(k, 'other')
    }
    if (n === '\\') {
      const a = adjacent(f, end, to)[0]
      const stop = a?.shape === '[' ? a.b : end
      endText()
      if (b.cellMode) {
        b.flush()
        return { next: stop }
      }
      return ph(stop, 'break')
    }
    if (frontRole(n)?.[1]) {
      endText()
      const e = this.frontCommand(f, end, n, to, b, false)
      if (e > 0) return { next: e }
    }
    if (RUNNING_HEADS.has(n)) return ph(this.commandArgs(f, end, n, to).end, 'other')
    // any other command: its text arguments walked, the rest kept with it; one the table does not know with every adjacent
    // argument
    let from = end
    if (n === 'cmidrule') {
      const k0 = skipBlanks(f, adjacent(f, end, to).slice(0, 1).at(-1)?.b ?? end, to)
      if (isOther(toks[k0], '(')) {
        const c0 = this.until(f, k0, to, ')')
        if (c0 > 0) from = c0
      }
    }
    const args = !isLetterName(n) || NO_ARGS.has(n) ? null : this.commandArgs(f, from, n, to)
    const pdfString =
      n === PDF_STRING &&
      (args?.args.length ?? 0) >= 2 &&
      isBegin(toks[args?.args[0]?.a ?? -1]) &&
      isBegin(toks[args?.args[1]?.a ?? -1])
    const walked = pdfString
      ? (args?.args.slice(0, 1) ?? [])
      : args?.known
        ? args.args.filter((a) => (a.role === 't' || a.role === 'c') && (isBegin(toks[a.a]) || a.shape === '['))
        : []
    const callEnd = pdfString ? (args?.args[1]?.b ?? end) : (args?.end ?? end)
    if (walked.length) {
      endText()
      this.walkArgs(f, i, callEnd, walked, b)
      return { next: callEnd }
    }
    let e = !isLetterName(n) ? end : NO_ARGS.has(n) ? this.optsAfter(f, from, to, OPT_ONLY.has(n)) : (args?.end ?? end)
    if (e < end) e = end
    if (args?.known) {
      const k = skipBlanks(f, e, to)
      if (isBegin(toks[k]) && f.close[k] === k + 1 && k + 2 <= to) e = k + 2
    }
    if (e === end && isLetterName(n) && !NO_ARGS.has(n) && !(args?.known && this.params(n)?.length === 0)) {
      const offset = (toks[e - 1] as Token).e
      const m = f.text
        .slice(offset, Math.min(f.at(to), offset + 120))
        .match(n === 'hrule' || n === 'vrule' ? RULE_SPEC : ASSIGNMENT)
      if (m?.[0].length) e = Math.max(e, tokenAt(f, offset + m[0].length, e, to))
    }
    return ph(e, elementKind(n))
  }

  optsAfter(f: SourceFile, i: number, to: number, opts: boolean): number {
    if (!opts) return i
    for (;;) {
      const k = skipBlanks(f, i, to)
      if (!isOther(f.toks[k], '[')) return i
      const e = bracketEnd(f, k, to)
      if (e < 0) return i
      i = e
    }
  }

  /** a macro's call: its optional argument and its required ones, each a group or one token */
  macroArgs(
    f: SourceFile,
    i: number,
    m: Macro,
    to: number,
  ): { reqs: { a: number; b: number; group: boolean }[]; end: number } | null {
    const reqs: { a: number; b: number; group: boolean }[] = []
    let k = i
    if (m.opt) {
      const k0 = skipBlanks(f, k, to)
      if (isOther(f.toks[k0], '[')) {
        const e0 = bracketEnd(f, k0, to)
        if (e0 < 0) return null
        k = e0
      }
    }
    while (reqs.length < m.params - (m.opt ? 1 : 0)) {
      const k0 = skipBlanks(f, k, to)
      const t = f.toks[k0]
      if (!t || k0 >= to || isEnd(t) || t.k === 'par') return null
      const e0 = isBegin(t) ? groupEnd(f, k0, to) : k0 + 1
      if (e0 < 0 || e0 > to) return null
      reqs.push({ a: k0, b: e0, group: isBegin(t) })
      k = e0
    }
    return { reqs, end: k }
  }
  /** a macro whose body sets words of its own around its argument: its call's text, where the body expands to text alone */
  expandedText(f: SourceFile, m: Macro, reqs: { a: number; b: number; group: boolean }[]): string | null {
    if (m.opt) return null
    const args = reqs.map((r) => (r.group ? f.src(r.a + 1, r.b - 1) : f.src(r.a, r.b)))
    const body = m.body.replace(/#(\d)/g, (_, d: string) => args[Number(d) - 1] ?? '')
    let out = ''
    // the body as text: letters, others, blanks; a tie or a control space a blank; anything else and it is no text
    const re = /\\[A-Za-z@]+ ?|\\.|[{}$&#^_]|~|[^\\{}$&#^_~]+/gs
    for (const m2 of body.matchAll(re)) {
      const x = m2[0]
      if (x === '~' || x === '\\ ') out += ' '
      else if (x.startsWith('\\') || /^[{}$&#^_]$/.test(x)) return null
      else out += x
    }
    return /\p{L}/u.test(out) && !hasAddress(out) ? out : null
  }
  holdsBlock(f: SourceFile, a: number, b: number): boolean {
    for (let k = a; k < b; k++) {
      const t = f.toks[k] as Token
      if (t.k === 'par') return true
      if (t.k === 'cs' && /^(?:par|item|part|chapter|(?:sub)*section|(?:sub)?paragraph|caption)$/.test(t.name))
        return true
      if (t.k === 'cs' && t.name === 'begin') {
        const e = envName(f, k + 1, b)
        if (!e || !MATH_ENVS.test(e.name)) return true
      }
    }
    return false
  }

  /** a walk of [a, b) whose units are of `kind` */
  inKind(f: SourceFile, a: number, b: number, bld: Builder, kind: string): void {
    const saved = bld.kind
    bld.kind = kind
    this.walk(f, a, b, bld)
    bld.flush()
    bld.kind = saved
  }

  /** a command's text arguments walked: within a paragraph each a span around its text, the command's other arguments with
   *  the span's open or close; one that holds paragraphs ends the paragraph and is walked as a body */
  walkArgs(f: SourceFile, i: number, end: number, walked: Arg[], b: Builder): void {
    const toks = f.toks
    if (walked.some((a) => a.shape === '[' || this.holdsBlock(f, a.a + 1, a.b - 1))) {
      b.flush()
      for (const a of walked) {
        const before = b.units.length
        this.walk(f, a.a + 1, a.b - 1, b)
        b.flush()
        if (a.shape === '[') for (const u of b.units.slice(before)) u.bracketed = true
      }
      return
    }
    let from = (toks[i] as Token).s
    walked.forEach((a, k) => {
      if (k > 0 && !b.cur) {
        this.walk(f, a.a + 1, a.b - 1, b)
        b.flush()
        from = (toks[a.b - 1] as Token).e
        return
      }
      const n = name(toks[i]) ?? ''
      const must = n === 'href' || n === 'hyperlink' || n === 'hyperref'
      b.open(f.text.slice(from, (toks[a.a] as Token).e), must ? 'link' : 'group', from, must)
      this.walk(f, a.a + 1, a.b - 1, b)
      const last = k === walked.length - 1
      const closeTok = toks[a.b - 1] as Token
      b.close(
        last ? f.text.slice(closeTok.s, (toks[end - 1] as Token).e) : '}',
        last ? (toks[end - 1] as Token).e : closeTok.e,
      )
      from = closeTok.e
    })
  }

  // ---------------------------------------------------------------- units of their own
  ownUnit(
    f: SourceFile,
    i: number,
    end: number,
    to: number,
    b: Builder,
    endText: () => void,
    n: string,
  ): { next: number } {
    const toks = f.toks
    const at = (toks[i] as Token).s
    const read = n === 'captionof' || n === 'tablecaption' ? this.commandArgs(f, end, n, to) : null
    const { args, end: e } = read?.known ? read : this.argsOfForm(f, end, this.unitForm(n), to)
    const req = read?.known
      ? args.findLast((a) => a.shape !== '[' && a.role === 't')
      : n === 'captionof'
        ? args.findLast((a) => a.shape === '{')
        : args.find((a) => a.shape === '{')
    if (!req) {
      endText()
      b.ph(f.src(i, end), 'other', at, (toks[end - 1] as Token).e)
      return { next: end }
    }
    const saved = b.kind
    if (n === 'footnote' || n === 'footnotetext' || n === 'thanks') {
      endText()
      const parent = b.cur
      const before = b.units.length
      const title = b.title
      const depth = b.depth
      b.cur = null
      b.kind = 'footnote'
      b.title = false
      b.depth = undefined
      this.walk(f, req.a + 1, req.b - 1, b)
      b.flush()
      b.kind = saved
      b.title = title
      b.depth = depth
      const made = b.units.length - before
      if (n === 'thanks') for (const u of b.units.slice(before)) u.front = true
      b.cur = parent
      const eTok = toks[e - 1] as Token
      if (parent && made === 1) {
        const inner = b.units[b.units.length - 1] as BUnit
        inner.nested = true
        parent.pieces.push({
          t: 'nested',
          pre: f.text.slice(at, inner.start),
          unit: inner,
          post: f.text.slice(inner.end, eTok.e),
        })
        parent.end = eTok.e
      } else if (parent && made === 0) {
        parent.pieces.push({ t: 'ph', src: f.text.slice(at, eTok.e), kind: 'note-mark' })
        parent.end = eTok.e
      } else if (parent) b.flush()
      return { next: e }
    }
    endText()
    b.flush()
    b.kind = CAPTIONS.has(n) ? 'caption' : n === 'abstract' ? 'abstract' : 'heading'
    b.title = n === 'title'
    b.depth = Object.hasOwn(DEPTH, n) ? DEPTH[n] : undefined
    this.walk(f, req.a + 1, req.b - 1, b)
    b.flush()
    b.title = false
    b.depth = undefined
    b.kind = saved
    return { next: e }
  }

  frontArgs(f: SourceFile, i: number, n: string, to: number): { args: Arg[]; end: number } {
    const { args, end: formEnd } = this.argsOfForm(f, i, this.unitForm(n), to)
    let end = formEnd
    if (args.at(-1)?.shape === '{')
      for (;;) {
        const k = skipBlanks(f, end, to)
        if (!isOther(f.toks[k], '[')) break
        const e = bracketEnd(f, k, to)
        if (e < 0 || e > to) break
        args.push({ shape: '[', role: 'a', param: args.length, a: k, b: e })
        end = e
      }
    return { args, end }
  }
  /** a front matter command of the role table's (its hook's argument a heading, an author block, a note, an abstract …) */
  frontCommand(f: SourceFile, end: number, n: string, to: number, b: Builder, front: boolean): number {
    const role = frontRole(n) as readonly [string, number]
    const call = this.commandArgs(f, end, n, to)
    const reqs = call.args.filter((a) => a.shape !== '[' && isBegin(f.toks[a.a]))
    const arg = call.known
      ? call.args.find((a) => a.param === role[1] - 1 && isBegin(f.toks[a.a]))
      : (reqs[role[1] - 1] ?? reqs.at(-1))
    if (!arg) return -1
    b.flush()
    const before = b.units.length
    const saved = b.kind
    if (role[0] === 'author') this.frontBlock(f, arg.a + 1, arg.b - 1, b, ROLE_OF(n))
    else if (role[0] === 'note' || role[0] === 'prose') {
      this.inKind(f, arg.a + 1, arg.b - 1, b, role[0] === 'note' ? 'footnote' : 'para')
      for (const u of b.units.slice(before)) u.front = true
    } else {
      b.kind = role[0] === 'abstract' ? 'abstract' : 'heading'
      b.title = role[0] === 'title'
      this.walk(f, arg.a + 1, arg.b - 1, b)
      b.flush()
      b.title = false
      b.kind = saved
    }
    if (front) for (const u of b.units.slice(before)) u.front = true
    return call.end
  }
  frontNotes(f: SourceFile, a: number, z: number, b: Builder): void {
    let past = a
    for (let k = a; k < z; k++) {
      const n = name(f.toks[k])
      if ((n !== 'thanks' && n !== 'footnote') || k < past) continue
      const { args, end } = this.argsOfForm(f, k + 1, this.unitForm(n), z)
      if (!args.some((x) => x.shape === '{')) continue
      this.frontNote(f, k, end, b)
      past = end
      k = end - 1
    }
  }
  frontNote(f: SourceFile, a: number, z: number, b: Builder): void {
    const before = b.units.length
    this.walk(f, a, z, b)
    b.flush()
    for (const u of b.units.slice(before)) u.front = true
  }
  /** an author block: its notes, and the text between them units of names or places by the rows TeX sets it in */
  frontBlock(f: SourceFile, a: number, z: number, b: Builder, role: 'names' | 'places'): void {
    const toks = f.toks
    if (/(^|[,{\s])[A-Za-z]+\s*=\s*\{/.test(f.src(a, z))) {
      if (role === 'places') this.frontValues(f, a, z, b)
      else this.frontNotes(f, a, z, b)
      return
    }
    const notes: { at: number; end: number }[] = []
    for (let k = a; k < z; k++) {
      const n = name(toks[k])
      if (n !== 'thanks' && n !== 'footnote') continue
      if (notes.length && k < (notes.at(-1) as { end: number }).end) continue
      const { args, end } = this.argsOfForm(f, k + 1, this.unitForm(n), z)
      if (args.some((x) => x.shape === '{')) notes.push({ at: k, end })
    }
    const ends = this.frontEnds(f, a, z).filter((e) => !notes.some((x) => e.at >= x.at && e.at < x.end))
    const blocks: [number, number][][] = [[]]
    let start = a
    for (const e of ends) {
      ;(blocks.at(-1) as [number, number][]).push([start, e.at])
      start = e.end
      if (e.and) blocks.push([])
    }
    ;(blocks.at(-1) as [number, number][]).push([start, z])
    const kindAt: [number, string][] = []
    for (const rows of blocks) {
      const led = rows.map(([x, y]) => this.markFirst(f, x, y))
      const marked = led.indexOf(true)
      const noted = ([x, y]: [number, number]) =>
        notes.some((q) => q.at >= x && q.at < y) || toks.slice(x, y).some((t) => name(t) === 'footnotemark')
      rows.forEach((row, r) => {
        const names =
          role === 'names' &&
          !led[r] &&
          (r === 0 ||
            (marked >= 0 && r < marked) ||
            noted(row) ||
            this.markAfter(f, row[0], row[1]) ||
            /^and(?![A-Za-z@])/.test(this.rowText(f, row[0], row[1])))
        kindAt.push([row[0], names ? 'author' : 'affiliation'])
      })
    }
    const kindOf = (x: number) => kindAt.findLast(([y]) => y <= x)?.[1] ?? 'affiliation'
    let span: BUnit[] = []
    const unit = (x: number, y: number) => {
      if (y <= x) return
      b.flush()
      const saved = b.kind
      const before = b.units.length
      b.kind = kindOf(x)
      this.walk(f, x, y, b)
      b.flush()
      b.kind = saved
      span.push(...b.units.slice(before))
    }
    const closeSpan = () => {
      // (an author block's units after its first, between two notes: numbered after the rest, as today's reading of an
      // author block numbers them; their order is no part of their identity)
      const nested = new Set(
        span.flatMap((u) => u.pieces.filter((p) => p.t === 'nested').map((p) => (p as { unit: BUnit }).unit)),
      )
      const top = span.filter((u) => !nested.has(u))
      for (const u of top.slice(1)) u.later = true
      span = []
    }
    let past = a
    const cuts = [
      ...notes.map((x) => ({ ...x, note: true, and: false })),
      ...ends.map((x) => ({ ...x, note: false })),
    ].sort((p, q) => p.at - q.at)
    for (const c of cuts) {
      if (c.at < past) continue
      unit(past, c.at)
      if (c.note) {
        closeSpan()
        this.frontNote(f, c.at, c.end, b)
      }
      past = c.end
    }
    unit(past, z)
    closeSpan()
  }
  frontValues(f: SourceFile, a: number, z: number, b: Builder): void {
    this.frontNotes(f, a, z, b)
    for (let k = a; k < z; k++) {
      if (!isBegin(f.toks[k])) continue
      // a key = { value }: the key's letters, then `=`, then the group
      let j = k - 1
      while (j >= a && f.toks[j]?.k === 'space') j--
      if (!isOther(f.toks[j], '=')) continue
      j--
      while (j >= a && f.toks[j]?.k === 'space') j--
      let w = j
      while (w >= a && f.toks[w]?.k === 'letter') w--
      const key = f.src(w + 1, j + 1)
      const c = f.close[k] ?? -1
      if (!key || c < 0 || c >= z || /^(?:postcode|postalcode|zipcode|zip)$/i.test(key)) continue
      const inner = f.src(k + 1, c)
      if (!/\p{L}{2}/u.test(inner) || /\\(?:thanks|footnote)(?![A-Za-z@])/.test(inner)) continue
      b.flush()
      const before = b.units.length
      this.inKind(f, k + 1, c, b, 'affiliation')
      for (const u of b.units.slice(before)) u.later = true
      k = c
    }
  }
  /** an author block's row and block ends at its top level: `\\`, \newline, \tabularnewline, \cr; \and, \And, \AND */
  frontEnds(f: SourceFile, a: number, z: number): { at: number; end: number; and: boolean }[] {
    const out: { at: number; end: number; and: boolean }[] = []
    for (let k = a; k < z; k++) {
      const t = f.toks[k] as Token
      if (isBegin(t)) {
        const c = f.close[k] ?? -1
        if (c >= 0 && c < z) k = c
        continue
      }
      if (t.k === 'char' && t.cat === CAT.math) {
        const e = this.mathEnd(f, k, z)
        if (e > 0) k = e - 1
        continue
      }
      if (t.k !== 'cs') continue
      if (this.isConditional(t.name)) {
        const e = this.branchEnd(f, k + 1, z, true)
        if (e > 0) k = e - 1
        continue
      }
      if (t.name === '(' || t.name === '[') {
        const e = this.mathCsEnd(f, k, z, t.name === '(' ? ')' : ']')
        if (e > 0) k = e - 1
        continue
      }
      if (t.name === 'begin') {
        const env = envName(f, k + 1, z)
        if (env) {
          k = Math.min(envEnd(f, env.after, z, env.name).after, z) - 1
          continue
        }
      }
      if (/^(?:\\|newline|tabularnewline|cr|crcr)$/.test(t.name)) {
        let e = k + 1
        if (t.name === '\\' && isOther(f.toks[e], '*')) e++
        const j = skipBlanks(f, e, z)
        if (t.name === '\\' && isOther(f.toks[j], '[')) {
          const g = bracketEnd(f, j, z)
          if (g > 0) e = g
        }
        out.push({ at: k, end: e, and: false })
        k = e - 1
        continue
      }
      if (/^(?:and|And|AND)$/.test(t.name)) out.push({ at: k, end: k + 1, and: true })
    }
    return out
  }
  /** a row's text with what stands before it taken off: blanks, comments, a group's opening, a declaration, a space */
  rowText(f: SourceFile, a: number, z: number): string {
    let k = a
    for (; k < z; k++) {
      const t = f.toks[k] as Token
      if (t.k === 'space' || t.k === 'comment' || isBegin(t)) continue
      if (t.k === 'cs' && (NO_ARGS.has(t.name) || FRONT_BOXES.has(t.name) || /^[,;:! ]$/.test(t.name))) continue
      if (t.k === 'cs' && /^(?:vspace|hspace|vskip)$/.test(t.name)) {
        const g = adjacent(f, k + 1, z)[0]
        if (g?.shape === '{') {
          k = g.b - 1
          continue
        }
      }
      break
    }
    return f.text.slice(f.at(k), f.at(z))
  }
  markFirst(f: SourceFile, a: number, z: number): boolean {
    return /^(?:\$\s*(?:\{\s*\})?\s*\^|\\\(\s*(?:\{\s*\})?\s*\^|\\(?:textsuperscript|IEEEauthorrefmark|affmark)(?![A-Za-z@]))/.test(
      this.rowText(f, a, z),
    )
  }
  markAfter(f: SourceFile, a: number, z: number): boolean {
    return /[^\s{$\\]\s*(?:\$\s*(?:\{\s*\})?\s*\^|\\\(\s*(?:\{\s*\})?\s*\^|\\(?:textsuperscript|IEEEauthorrefmark|affmark)(?![A-Za-z@]))/.test(
      f.src(a, z),
    )
  }

  /** an environment the body defines: its parameters, and whether its begin opens code, a display or a table */
  environmentAt(f: SourceFile, i: number, to: number): void {
    const ctx = this.ctx
    let k = skipBlanks(f, i, to)
    if (isOther(f.toks[k], '*')) k = skipBlanks(f, k + 1, to)
    const nameEnd = groupEnd(f, k, to)
    if (nameEnd < 0) return
    const env = f.src(k + 1, nameEnd - 1).trim()
    let params = 0
    let opt = false
    k = skipBlanks(f, nameEnd, to)
    if (isOther(f.toks[k], '[')) {
      const e = bracketEnd(f, k, to)
      if (e < 0) return
      params = Number(f.src(k + 1, e - 1).trim()) || 0
      k = skipBlanks(f, e, to)
      if (isOther(f.toks[k], '[')) {
        const e2 = bracketEnd(f, k, to)
        if (e2 < 0) return
        opt = true
        k = skipBlanks(f, e2, to)
      }
    }
    const beginEnd = groupEnd(f, k, to)
    if (beginEnd < 0) return
    const k2 = skipBlanks(f, beginEnd, to)
    const endEnd = groupEnd(f, k2, to)
    if (endEnd < 0) return
    const begin = f.src(k + 1, beginEnd - 1)
    const endCode = f.src(k2 + 1, endEnd - 1)
    ctx.envParams.set(env, paramsOf(`${opt ? '[a' : ''}${'{a'.repeat(params - (opt ? 1 : 0))}`))
    const cmds = opened(begin)
    if (
      ((cmds.includes('ttfamily') || cmds.includes('tt')) && cmds.includes('obeylines')) ||
      cmds.some((c) => LISTINGS.has(c) || ctx.skipEnvs.has(c))
    )
      ctx.skipEnvs.add(env)
    if (
      /^\\(?:begin\s*\{)?(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath)\*?/.test(
        begin.trim(),
      ) &&
      /\\(?:end\s*\{)?(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath)/.test(endCode)
    )
      ctx.displayEnvs.add(env)
    if (
      cmds.some((c) => TABLE_ENVS.test(c)) &&
      /\\end\s*\{(?:tabular|tabularx|longtable|tabu|tabulary|supertabular|xtabular)\*?\}|\\end(?:tabular|tabularx|longtable|tabu|tabulary|supertabular|xtabular)\b/.test(
        endCode,
      )
    )
      ctx.tableWraps.add(env)
  }

  // ---------------------------------------------------------------- environments
  begin(f: SourceFile, i: number, end: number, to: number, b: Builder, endText: () => void): { next: number } {
    const toks = f.toks
    const ctx = this.ctx
    const at = (toks[i] as Token).s
    const env = envName(f, end, to)
    if (!env) return { next: end }
    const e = envEnd(f, env.after, to, env.name)
    if (MATH_ENVS.test(env.name) || ctx.displayEnvs.has(env.name)) {
      endText()
      const display = displayEnv(env.name) || ctx.displayEnvs.has(env.name)
      b.ph(f.src(i, e.after), display ? 'display' : 'math', at, f.at(e.after - 1) + 1, display)
      return { next: e.after }
    }
    endText()
    b.flush()
    if (env.name === 'tikzpicture') {
      this.tikzText(f, env.after, e.body, b)
      return { next: e.after }
    }
    if (env.name === 'thebibliography' && !ctx.skipEnvs.has(env.name)) {
      this.bibliography(f, env.after, e.body, b)
      return { next: e.after }
    }
    if (SKIP_ENVS.test(env.name) || ctx.skipEnvs.has(env.name)) return { next: e.after }
    if (ctx.tableWraps.has(env.name)) {
      const { end: argsEnd } = this.envArgs(f, env.after, e.body, env.name)
      const saved = b.kind
      const savedCell = b.cellMode
      b.kind = AUTHOR_KINDS.has(b.kind ?? '') ? b.kind : 'cell'
      b.cellMode = true
      this.walk(f, argsEnd, e.body, b)
      b.flush()
      b.kind = saved
      b.cellMode = savedCell
      return { next: e.after }
    }
    if (TABLE_ENVS.test(env.name)) {
      const tp = ctx.envParams.has(env.name) ? null : environmentParams(env.name, ctx.bindings)
      const tr = tp ? readArgs(f, env.after, tp, e.body, this.isCall) : null
      const argsEnd = tr?.complete
        ? tr.end
        : this.argsOfForm(
            f,
            env.after,
            env.name.startsWith('tabularx') || env.name === 'tabular*' || env.name === 'tabulary' ? '{[{' : '[{',
            e.body,
          ).end
      const saved = b.kind
      const savedCell = b.cellMode
      b.kind = AUTHOR_KINDS.has(b.kind ?? '') ? b.kind : 'cell'
      b.cellMode = true
      this.walk(f, argsEnd, e.body, b)
      b.flush()
      b.kind = saved
      b.cellMode = savedCell
      return { next: e.after }
    }
    const { end: argsEnd, title } = this.envArgs(f, env.after, e.body, env.name)
    const outside = b.inFloat
    if (FLOAT_ENVS.test(env.name)) b.inFloat = true
    if (title) {
      const before = b.units.length
      this.inKind(f, title.a + 1, title.b - 1, b, 'heading')
      for (const u of b.units.slice(before)) u.bracketed = true
    }
    const saved = b.kind
    b.kind = AUTHOR_KINDS.has(b.kind ?? '')
      ? b.kind
      : env.name === 'abstract'
        ? 'abstract'
        : ctx.theorems.has(env.name)
          ? 'theorem'
          : saved
    this.walk(f, argsEnd, e.body, b)
    b.flush()
    b.kind = saved
    b.inFloat = outside
    return { next: e.after }
  }
  envArgs(f: SourceFile, at: number, to: number, env: string): { end: number; title: Arg | null } {
    const ctx = this.ctx
    const params =
      ctx.envParams.get(env) ?? (ctx.theorems.has(env) ? THEOREM_PARAMS : null) ?? environmentParams(env, ctx.bindings)
    const r = params ? readArgs(f, at, params, to, this.isCall) : null
    if (!r?.complete) return { end: adjacent(f, at, to).at(-1)?.b ?? at, title: null }
    let end = r.end
    for (;;) {
      const k = skipBlanks(f, end, to)
      if (!isOther(f.toks[k], '[')) break
      const e = bracketEnd(f, k, to)
      if (e < 0 || e > to) break
      end = e
    }
    const t = r.args.find((a) => a.role === 't' && a.shape === '[')
    return { end, title: t && !/^\s*[A-Za-z][\w\s-]*=/.test(f.src(t.a + 1, t.b - 1)) ? t : null }
  }

  /** the texts of a TikZ picture, each a unit of kind figure: a node's group, a legend entry, an axis label or title */
  tikzText(f: SourceFile, a: number, z: number, b: Builder): void {
    const toks = f.toks
    for (let k = a; k < z; k++) {
      const t = toks[k] as Token
      let j = -1
      const word = (x: number, w: string) =>
        f.text.startsWith(w, (toks[x] as Token).s) &&
        toks.slice(x, x + w.length).every((u) => u.k === 'letter') &&
        toks[x + w.length]?.k !== 'letter' &&
        toks[x - 1]?.k !== 'letter'
      if ((t.k === 'cs' && t.name === 'node') || (t.k === 'letter' && word(k, 'node'))) {
        j = t.k === 'cs' ? k + 1 : k + 4
        for (;;) {
          j = skipBlanks(f, j, z)
          if (isOther(toks[j], '[')) {
            const e = bracketEnd(f, j, z)
            if (e < 0) break
            j = e
            continue
          }
          if (isOther(toks[j], '(')) {
            const e = this.until(f, j, z, ')')
            if (e < 0) break
            j = e
            continue
          }
          if (word(j, 'at')) {
            j += 2
            continue
          }
          break
        }
      } else if (t.k === 'cs' && t.name === 'addlegendentry') {
        j = skipBlanks(f, k + 1, z)
        if (isOther(toks[j], '[')) {
          const e = bracketEnd(f, j, z)
          if (e > 0) j = skipBlanks(f, e, z)
        }
      } else if (t.k === 'letter' && ['xlabel', 'ylabel', 'zlabel', 'title'].some((w) => word(k, w))) {
        const w = ['xlabel', 'ylabel', 'zlabel', 'title'].find((x) => word(k, x)) as string
        j = skipBlanks(f, k + w.length, z)
        if (!isOther(toks[j], '=')) continue
        j = skipBlanks(f, j + 1, z)
      } else continue
      if (!isBegin(toks[j])) continue
      const c = f.close[j] ?? -1
      if (c < 0 || c >= z) continue
      b.flush()
      this.inKind(f, j + 1, c, b, 'figure')
      k = c
    }
  }
  /** an inline TikZ picture: past its options, its group, else its path to the first `;` outside every group */
  tikzEnd(f: SourceFile, i: number, to: number): number {
    let k = skipBlanks(f, i, to)
    while (isOther(f.toks[k], '[')) {
      const e = bracketEnd(f, k, to)
      if (e < 0) return -1
      k = skipBlanks(f, e, to)
    }
    if (isBegin(f.toks[k])) return groupEnd(f, k, to)
    for (let j = k; j < to; j++) {
      const t = f.toks[j] as Token
      if (t.k === 'par') return -1
      if (isBegin(t)) {
        const c = f.close[j] ?? -1
        if (c < 0) return -1
        j = c
        continue
      }
      if (isOther(t, ';')) return j + 1
    }
    return -1
  }

  /** a thebibliography: each \bibitem's entry a reference unit */
  bibliography(f: SourceFile, a: number, z: number, b: Builder): void {
    const { end: start } = this.argsOfForm(f, a, '{', z)
    const items: number[] = []
    let depth = 0
    for (let k = start; k < z; k++) {
      const t = f.toks[k] as Token
      if (isBegin(t)) depth++
      else if (isEnd(t)) depth = Math.max(0, depth - 1)
      else if (depth === 0 && t.k === 'cs' && t.name === 'bibitem') items.push(k)
    }
    const saved = b.kind
    b.flush()
    items.forEach((k, n) => {
      let x = this.argsOfForm(f, k + 1, '[{', z).end
      let y = n + 1 < items.length ? (items[n + 1] as number) : z
      for (let j = x; j < y; j++) {
        const nm = name(f.toks[j])
        if (nm === 'BibitemOpen' && !f.toks.slice(x, j).some((u) => u.k !== 'space' && u.k !== 'comment')) x = j + 1
        if (nm === 'BibitemShut' && j > x) {
          y = j
          break
        }
      }
      b.kind = 'reference'
      const before = b.units.length
      this.walk(f, x, y, b)
      b.flush()
      // backref (with its parscan) sets an entry's list of pages after the entry's first paragraph: an element there
      if (this.ctx.backref) {
        const made = b.units
          .slice(before)
          .filter((u) => u.kind === 'reference' && u.file === b.file)
          .sort((p, q) => p.start - q.start)
        const ends = (u: BUnit, next: BUnit | undefined) => {
          const from = tokenAt(f, u.end, x, y)
          const upto = next ? tokenAt(f, next.start, x, y) : y
          return f.toks.slice(from, upto).some((t) => t.k === 'par' || (t.k === 'cs' && t.name === 'par'))
        }
        const first = made.find((u, j) => ends(u, made[j + 1])) ?? made.at(-1)
        first?.pieces.push({ t: 'ph', src: '\\axtbackref', kind: 'backref' })
      }
    })
    b.kind = saved
  }

  // ---------------------------------------------------------------- conditionals
  isConditional(n: string): boolean {
    if (TEX_IFS.has(n) || /^if@/.test(n)) return true
    const d = this.ctx.defs.names.get(n)
    return (
      this.ctx.ifs.has(n) ||
      (d?.meaning.k === 'other' && (d.meaning.text === '\\iftrue' || d.meaning.text === '\\iffalse'))
    )
  }
  /** `\if` followed by two letters: an author's way of commenting a passage out */
  ifWords(f: SourceFile, k: number): boolean {
    return /^[ \t]*\n?[ \t]*[A-Za-z]{2}/.test(f.text.slice(f.at(k), f.at(k) + 8))
  }
  /** past the \else, \or or \fi that ends the branch from token k (`toFi`: the \fi alone), conditionals nested counted */
  branchEnd(f: SourceFile, k: number, to: number, toFi: boolean): number {
    let depth = 0
    for (let j = k; j < to; j++) {
      const n = name(f.toks[j])
      if (n === null) continue
      if (this.isConditional(n)) depth++
      else if (n === 'fi') {
        if (depth-- === 0) return j + 1
      } else if ((n === 'else' || n === 'or') && depth === 0 && !toFi) return j + 1
    }
    return -1
  }
  /** a conditional TeX can decide from what it holds at the document's start (a \newif's value, as the body sets it), or
   *  whose own text decides it (\iftrue, \if of two characters): the live branch walked, the rest kept as it is */
  conditional(
    f: SourceFile,
    i: number,
    end: number,
    to: number,
    b: Builder,
    endText: () => void,
    n: string,
  ): { next: number } | null {
    const ctx = this.ctx
    const first = this.branchEnd(f, end, to, false)
    if (first < 0) return null
    const firstName = name(f.toks[first - 1])
    if (firstName === 'or') return null
    const thenTo = first - 1
    let elseFrom = -1
    let elseTo = -1
    let stop = first
    if (firstName === 'else') {
      const fi = this.branchEnd(f, first, to, true)
      if (fi < 0) return null
      elseFrom = first
      elseTo = fi - 1
      stop = fi
    }
    let value: boolean | null = null
    let thenFrom = end
    if (n === 'iftrue') value = true
    else if (n === 'if' || n === 'ifx') {
      const k = skipBlanks(f, end, to)
      const x = f.toks[k]
      const y = f.toks[k + 1]
      if (
        x &&
        y &&
        (x.k === 'letter' || isOther(x, x.k === 'char' ? x.ch : '')) &&
        (y.k === 'letter' || y.k === 'space' || (y.k === 'char' && y.cat === CAT.other))
      ) {
        value = f.text.slice(x.s, x.e) === (y.k === 'space' ? ' ' : f.text.slice(y.s, y.e))
        thenFrom = k + 2
      }
    } else if (ctx.ifs.has(n)) value = ctx.ifs.get(n) as boolean
    if (value === null) return null
    const [from, upto] = value ? [thenFrom, thenTo] : elseFrom >= 0 ? [elseFrom, elseTo] : [thenTo, thenTo]
    endText()
    const toks = f.toks
    const at = (toks[i] as Token).s
    if (from > i)
      b.ph(
        f.text.slice(at, f.at(from) > at ? (toks[from - 1] as Token).e : at),
        'other',
        at,
        (toks[from - 1] as Token).e,
      )
    this.walk(f, from, upto, b)
    if (upto < stop) b.ph(f.src(upto, stop), 'other', f.at(upto), (toks[stop - 1] as Token).e)
    return { next: stop }
  }
}

/** whether TeX holds a command of that name at the document's start (neither undefined nor \relax, as \csname leaves one) */
const definitions = (defs: Definitions, n: string): boolean => {
  const m = defs.names.get(n)?.meaning
  return !!m && m.k !== 'undefined' && !(m.k === 'other' && m.text === '\\relax')
}

const isChar = (t: Token | undefined, cat: number): boolean => !!t && t.k === 'char' && t.cat === cat

/** what TeX's definitions say of the paper, read once: its own macros, newif values, theorems, display and code
 *  environments, shorthands, row ends */
function paperFacts(
  defs: Definitions,
  own: ReadonlySet<string>,
  ownEnv: ReadonlySet<string>,
  isCall: (n: string) => boolean,
  sites: ReadonlyMap<string, Site[]>,
) {
  const macros = new Map<string, Macro>()
  const ifs = new Map<string, boolean>()
  const theorems = new Set<string>()
  const displayEnvs = new Set<string>()
  const envMacros = new Map<string, { side: 'begin' | 'end'; env: string }>()
  const rowEnds = new Set<string>()
  const rowEndsAfter = new Set<string>()
  const envParams = new Map<string, readonly Param[]>()
  for (const [n, d] of defs.names) {
    const m = d.meaning
    if (m.k === 'other' && (m.text === '\\iftrue' || m.text === '\\iffalse') && n.startsWith('if'))
      ifs.set(n, m.text === '\\iftrue')
    if (m.k !== 'macro') continue
    // a theorem-like environment: one that sets a run-in head, as the kernel's \newtheorem (\@thm), amsthm's, thmtools',
    // llncs' \spnewtheorem make one, and amsthm's proof (\trivlist \item [\hskip \labelsep \itshape #1…], its optional
    // argument's internal)
    const code = d.opt?.k === 'macro' ? d.opt.body : m.body
    if (
      /^\\@thm |^\\@spthm|^\\thmt@parsetheoremargs |^\\@begintheorem/.test(m.body) ||
      /\\trivlist \\item \[/.test(code)
    )
      theorems.add(n)
    if (own.has(n)) {
      const mac = macroOf(n, d, isCall)
      if (mac) {
        // (its body where it stands: the last of the paper's definitions whose body is the one TeX holds)
        const held = canonical(mac.body)
        const site = (sites.get(n) ?? []).findLast((x) => canonical(x.file.src(x.a, x.b)) === held)
        if (site) mac.site = site
        macros.set(n, mac)
      }
      const body = m.body.trim()
      const sh = /^\\(begin|end) \{([^{}]+)\}$/.exec(body)
      if (sh && m.params === '') envMacros.set(n, { side: sh[1] as 'begin' | 'end', env: (sh[2] as string).trim() })
      if (m.params === '' && ROW_END.test(body)) rowEnds.add(n)
      else if (ROW_END_TAIL.test(body)) rowEndsAfter.add(n)
    }
  }
  // the paper's own environments that set a display: their begin opens a math environment their end closes
  for (const [n, d] of defs.names) {
    const endD = defs.names.get(`end${n}`)
    if (d.meaning.k !== 'macro' || endD?.meaning.k !== 'macro' || !ownEnv.has(n)) continue
    const open = /^\\(?:begin \{)?(equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath)\*?/.exec(
      d.meaning.body.trim(),
    )
    if (
      open &&
      /\\(?:end \{)?(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|dmath)/.test(
        endD.meaning.body,
      )
    )
      displayEnvs.add(n)
  }
  // the paper's own environments' parameters, by what TeX holds of their begin (\newenvironment{x}[n][d]: an optional
  // argument first), and those whose begin opens a table their end closes (their body the table's rows)
  const tableWraps = new Set<string>()
  for (const [n, d] of defs.names) {
    const endD = defs.names.get(`end${n}`)
    if (!ownEnv.has(n) || d.meaning.k !== 'macro' || !endD) continue
    const mac = macroOf(n, d, isCall)
    if (mac && !mac.delimited)
      envParams.set(n, paramsOf(`${mac.opt ? '[a' : ''}${'{a'.repeat(mac.params - (mac.opt ? 1 : 0))}`))
    const begins = opened(mac?.body ?? d.meaning.body).filter((x) => TABLE_ENVS.test(x))
    if (
      begins.length &&
      endD.meaning.k === 'macro' &&
      /\\end \{(?:tabular|tabularx|longtable|tabu|tabulary|supertabular|xtabular)\*?\}|\\end(?:tabular|tabularx|longtable|tabu|tabulary|supertabular|xtabular)\b/.test(
        endD.meaning.body,
      )
    )
      tableWraps.add(n)
  }
  return { macros, ifs, theorems, displayEnvs, envMacros, rowEnds, rowEndsAfter, envParams, tableWraps }
}

/** the paper's own environments read by lines: those whose begin code begins one of the packages' (\newenvironment{code}
 *  {\verbatim}…, \let\code\verbatim) */
function ownLineEnvs(defs: Definitions, own: ReadonlySet<string>, base: (env: string) => boolean): Set<string> {
  const out = new Set<string>()
  for (const [n, d] of defs.names) {
    if (!own.has(n)) continue
    const m = d.meaning
    const first =
      m.k === 'macro'
        ? /^\\(?:begin \{)?([A-Za-z]+\*?)/.exec(m.body.trim())?.[1]
        : m.k === 'other'
          ? /^\\([A-Za-z]+)$/.exec(m.text)?.[1]
          : undefined
    // (or one that runs a package's line reader: comment.sty's \ProcessComment, fancyvrb's, listings', minted's)
    if ((first && base(first)) || (m.k === 'macro' && /\\ProcessComment |\\FV@|\\FVB@|\\lst@|\\minted@/.test(m.body)))
      out.add(n)
  }
  return out
}

/** the commands a begin code runs where it stands (not those inside a definition it makes), and the environments it begins */
function opened(body: string): string[] {
  const f = bodyFile(body)
  const out: string[] = []
  for (let k = 0; k < f.toks.length; k++) {
    const t = f.toks[k] as Token
    if (t.k !== 'cs') continue
    if (/^(?:[gex]?def|(?:re)?newcommand|providecommand)$/.test(t.name)) {
      let j = k + 1
      while (j < f.toks.length && !isBegin(f.toks[j])) j++
      const c = f.close[j] ?? -1
      if (c > 0) k = c
      continue
    }
    if (t.name === 'begin') {
      const e = envName(f, k + 1, f.toks.length)
      if (e) out.push(e.name, e.name.replace(/\*$/, ''))
      continue
    }
    out.push(t.name)
  }
  return out
}
/** the paper's own code environments: one read by lines, one whose begin code opens a package's code environment or
 *  another of these, or sets its body as alltt does (typewriter type, its lines obeyed) */
function codeEnvs(defs: Definitions, own: ReadonlySet<string>, lines: ReadonlySet<string>): Set<string> {
  const code = new Set<string>(lines)
  const runs = new Map<string, string[]>()
  for (const [n, d] of defs.names) {
    if (!own.has(n) || d.meaning.k !== 'macro' || !defs.names.has(`end${n}`)) continue
    const cmds = opened(d.meaning.body)
    if ((cmds.includes('ttfamily') || cmds.includes('tt')) && cmds.includes('obeylines')) code.add(n)
    runs.set(n, cmds)
  }
  for (let found = true; found; ) {
    found = false
    for (const [n, cmds] of runs)
      if (!code.has(n) && cmds.some((c) => LISTINGS.has(c) || code.has(c))) {
        code.add(n)
        found = true
      }
  }
  return code
}

/**
 * A paper's units, from its source tree and TeX's definitions (definitions.ts). The units are in TeX's order, a nested unit
 * before the unit it stands in; each has its id (its content's hash: equal units, one id).
 */
export function readSource(tree: Tree, definitions: Definitions): SourceDoc {
  const inputs = new Set(INPUTS.keys())
  // (the paper's own names, read on the tokens of every TeX file it ships; its line environments then from TeX's meanings)
  const scan = new Files(tree, lexRules(), inputs)
  const shipped = [...tree.files.keys()]
    .filter((p) => /\.(?:tex|sty|cls)$/i.test(p))
    .map((p) => scan.file(p, null))
    .filter((x): x is SourceFile => !!x)
  const names = ownNames(shipped)
  // (a command is the paper's where TeX holds one of the paper's definitions of it, or none at the document's start (a
  // definition the body makes, or a local one); where TeX's meaning is none of them, a package's overrides the paper's
  // fallback, \providecommand\href{…} under hyperref: its arguments are the role table's)
  const own = new Set(
    [...names.commands].filter((n) => {
      const d = definitions.names.get(n)
      const list = names.bodies.get(n) ?? []
      if (!d || d.meaning.k === 'undefined' || list.some((x) => x === null)) return true
      const held = [d.meaning, d.opt, d.robust, d.code]
        .filter((m) => m?.k === 'macro')
        .map((m) => canonical((m as { body: string }).body))
      return list.some((x) => held.includes(canonical(x as string)))
    }),
  )
  // (an environment is the paper's where it defines it by an environment's definer, or by a command's: \let\code\verbatim)
  const ownEnv = new Set([...names.envs, ...own])
  const base = lexRules()
  const lines = ownLineEnvs(definitions, ownEnv, (e) => base.lineEnv(e))
  const rules = lexRules(lines)
  const files = new Files(tree, rules, inputs)
  // (the encoding the main file declares to inputenc: what a file that is not UTF-8 is read in)
  const mainScan = scan.file(tree.main, null)
  if (mainScan)
    for (let k = 0; k < mainScan.toks.length; k++) {
      if (name(mainScan.toks[k]) !== 'usepackage') continue
      const a = adjacent(mainScan, k + 1, mainScan.toks.length)
      const pkg = a.find((x) => x.shape === '{')
      const opts = a.find((x) => x.shape === '[')
      if (
        pkg &&
        opts &&
        mainScan.src(pkg.a + 1, pkg.b - 1).trim() === 'inputenc' &&
        /\b(?:cp1252|ansinew)\b/.test(mainScan.src(opts.a, opts.b))
      )
        files.encoding = scan.encoding = 'cp1252'
    }
  const bindings = bindingsOf(shipped)
  const isCall = (n: string) => {
    const p = own.has(n) ? null : commandParams(n, bindings)
    return !!p?.length && p !== REGISTER
  }
  const facts = paperFacts(definitions, own, ownEnv, isCall, names.sites)
  const stem = jobName(tree.main)
  const bbl = tree.files.has(`${stem}.bbl`) ? `${stem}.bbl` : null
  const ctx: Ctx = {
    files,
    bindings,
    own,
    macros: facts.macros,
    theorems: new Set(
      [
        ...facts.theorems,
        'proof',
        'theorem',
        'lemma',
        'corollary',
        'proposition',
        'definition',
        'remark',
        'example',
      ].filter((x) => facts.theorems.has(x) || !definitions.names.has(x)),
    ),
    displayEnvs: facts.displayEnvs,
    skipEnvs: codeEnvs(definitions, ownEnv, lines),
    envMacros: facts.envMacros,
    envParams: facts.envParams,
    tableWraps: facts.tableWraps,
    ifs: facts.ifs,
    defs: definitions,
    ended: false,
    seen: new Set(),
    order: [],
    dirs: [],
    bbl,
    rowEnds: facts.rowEnds,
    rowEndsAfter: facts.rowEndsAfter,
    calls: new Map(),
    // (LaTeX records a package loaded as the macro \ver@<name>.sty; \@ifpackageloaded leaves \relax where it is not)
    backref:
      definitions.names.get('ver@backref.sty')?.meaning.k === 'macro' &&
      (definitions.names.get('ifbackrefparscan')?.meaning as { text?: string } | undefined)?.text !== '\\iffalse',
  }
  const w = new Walker(ctx)
  const units: BUnit[] = []
  const main = files.file(tree.main, null)
  if (!main) throw new Error(`main file ${tree.main} not found`)
  ctx.seen.add(tree.main)
  ctx.order.push(tree.main)
  const b = new Builder(tree.main, units, main.text)
  // the document's body from its \begin{document}; the preamble's front matter before it
  let body = -1
  for (let k = 0; k < main.toks.length; k++) {
    const t = main.toks[k] as Token
    if (t.k === 'cs' && t.name === 'begin' && envName(main, k + 1, main.toks.length)?.name === 'document') {
      body = envName(main, k + 1, main.toks.length)?.after ?? k + 1
      break
    }
  }
  if (body >= 0) {
    frontMatter(w, main, 0, body, b)
    w.walk(main, body, main.toks.length, b)
  } else w.walk(main, 0, main.toks.length, b)
  b.flush()
  storedBodies(w, units, names.written, names.defined)
  // later units (an author block's parts after its first) after the rest, then the bibliography's entries: today's numbering,
  // which no id depends on
  const later = units.filter((u) => u.later && u.kind !== 'reference')
  const entries = units.filter((u) => u.kind === 'reference')
  const rest = units.filter((u) => !u.later && u.kind !== 'reference')
  const ordered = [...rest, ...later, ...entries]
  for (const u of ordered) close(u)
  return {
    main: tree.main,
    files: ctx.order,
    units: ordered.map((u) => {
      const out: SourceUnit = {
        id: u.id as string,
        kind: u.kind,
        content: u.content as Piece[],
        file: u.file,
        start: u.start,
        end: u.end,
      }
      if (u.depth !== undefined) out.depth = u.depth
      if (u.title) out.title = true
      if (u.front) out.front = true
      if (u.held) out.held = true
      if (u.nested) out.nested = true
      if (u.bracketed) out.bracketed = true
      if (u.inFloat) out.inFloat = true
      return out
    }),
  }
}

/**
 * The paper's macros of no argument whose text is the paper's own words (\newcommand{\CILTITLE}{CLASSO: a practical …},
 * a table kept in \newcommand{\toponelthree}{…}): one whose every call the walk met (the times its name is written, less
 * its definitions), called in units of one kind, defined in the paper's TeX (no package's or class's), with no unit of its
 * body's place yet, has its body walked where it stands, as units of that kind; kept where they hold four words or more
 * (an author block's, whatever they hold)
 */
function storedBodies(
  w: Walker,
  units: BUnit[],
  written: ReadonlyMap<string, number>,
  defined: ReadonlyMap<string, number>,
): void {
  const ctx = w.ctx
  ctx.ended = false
  for (const [n, call] of ctx.calls) {
    const macro = ctx.macros.get(n)
    const site = macro?.site
    if (!site || call.kinds.size !== 1 || macro.params !== 0) continue
    const kind = [...call.kinds][0] as string
    if (/\.(?:sty|cls)$/i.test(site.file.path)) continue
    if ((written.get(n) ?? 0) - (defined.get(n) ?? 0) !== call.n) continue
    const from = site.file.at(site.a)
    const upto = site.file.at(site.b)
    if (units.some((u) => u.file === site.file.path && u.start < upto && u.end > from)) continue
    const before = units.length
    const b = new Builder(site.file.path, units, site.file.text)
    if (AUTHOR_KINDS.has(kind)) w.frontBlock(site.file, site.a, site.b, b, kind === 'author' ? 'names' : 'places')
    else w.inKind(site.file, site.a, site.b, b, kind)
    const words =
      units
        .slice(before)
        .flatMap((u) => u.pieces.filter((p) => p.t === 'text').map((p) => (p as { s: string }).s))
        .join(' ')
        .match(/\p{L}{2,}/gu)?.length ?? 0
    if (!AUTHOR_KINDS.has(kind) && words < 4) units.length = before
  }
}

/** the preamble's prose: the title TeX keeps (the last at the top level), author blocks and their notes, the front matter's
 *  commands, an abstract as an environment or an argument, and the same in a file the preamble reads */
function frontMatter(w: Walker, f: SourceFile, a: number, z: number, b: Builder): void {
  const toks = f.toks
  // (what a definition's body holds is no front matter: a group at depth > 0 in the preamble is a body or an argument)
  let depth = 0
  const top: number[] = []
  const titles: number[] = []
  for (let k = a; k < z; k++) {
    const t = toks[k] as Token
    if (isBegin(t)) depth++
    else if (isEnd(t)) depth = Math.max(0, depth - 1)
    else if (t.k === 'cs') {
      if (depth === 0) top.push(k)
      if (t.name === 'title') titles.push(k)
    }
  }
  const topTitles = titles.filter((k) => top.includes(k))
  const title = topTitles.at(-1) ?? titles.at(-1)
  let past = a
  for (const k of top) {
    if (k < past) continue
    const n = (toks[k] as { name: string }).name
    if (n === 'title') {
      if (k !== title) continue
      const { args, end } = w.argsOfForm(f, k + 1, w.unitForm('title'), z)
      const req = args.find((x) => x.shape === '{')
      if (req) {
        b.kind = 'heading'
        b.title = true
        w.walk(f, req.a + 1, req.b - 1, b)
        b.flush()
        b.title = false
        b.kind = undefined
        past = end
      }
      continue
    }
    if (FRONT_MATTER.has(n)) {
      const { args, end } = w.frontArgs(f, k + 1, n, z)
      for (const x of args) {
        if (x.shape === '{') w.frontBlock(f, x.a + 1, x.b - 1, b, ROLE_OF(n))
        else w.frontNotes(f, x.a + 1, x.b - 1, b)
      }
      past = end
      continue
    }
    if (n === 'thanks') {
      const { args, end } = w.argsOfForm(f, k + 1, w.unitForm('thanks'), z)
      if (args.some((x) => x.shape === '{')) {
        b.flush()
        w.frontNote(f, k, end, b)
        past = end
      }
      continue
    }
    if (n === 'begin') {
      const env = envName(f, k + 1, z)
      const role = env ? frontRole(`env:${env.name}`) : undefined
      if (env && role) {
        const e = envEnd(f, env.after, z, env.name)
        const { end: argsEnd } = w.envArgs(f, env.after, e.body, env.name)
        b.flush()
        w.inKind(f, argsEnd, e.body, b, role[0] === 'abstract' ? 'abstract' : 'heading')
        past = e.after
      }
      continue
    }
    if (n === 'abstract') {
      const j = skipBlanks(f, k + 1, z)
      const e = groupEnd(f, j, z)
      if (e > 0) {
        b.flush()
        w.inKind(f, j + 1, e - 1, b, 'abstract')
        past = e
      }
      continue
    }
    if (n === 'input' || n === 'include') {
      const lx = { text: f.text, pos: (toks[k] as Token).e }
      const named = fileArgs(lx as never, 'file')
      for (const x of named) {
        const path = w.ctx.files.find(x.name, w.ctx.dirs)
        if (!path || w.ctx.seen.has(path)) continue
        const g = w.ctx.files.file(path, f.codesAt.get(k) ?? null)
        if (!g) continue
        w.ctx.seen.add(path)
        const fb = new Builder(path, b.units, g.text)
        frontMatter(w, g, 0, g.toks.length, fb)
        fb.flush()
      }
      past = tokenAt(f, lx.pos, k + 1, z)
      continue
    }
    if (frontRole(n)?.[1]) {
      const e = w.frontCommand(f, k + 1, n, z, b, false)
      if (e > 0) past = e
    }
  }
  b.flush()
}

export { IN_TEXT }
