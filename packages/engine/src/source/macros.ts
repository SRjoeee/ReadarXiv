// The paper's own macros: what each is (its parameters, its body) from TeX's answer at the document's start, or from a
// definition the body makes where the reader meets it; and what its body does with its arguments, worked out on the body's
// tokens: which one it typesets as prose, whether it only stores it, the command it ends in, whether it reads on past its
// parameters, whether it sets words of its own.
import type { Definition, Meaning } from './definitions.ts'
import { SourceFile } from './files.ts'
import { CAPTIONS, CONTENT_BOX, INLINE_TEXT, MATH_ENVS, NO_ARGS, OPERAND_OF, SECOND_OPERAND_OF } from './kinds.ts'
import { type Arg, commandParams, isBegin, isEnd, isOther, type Param, readArgs, skipBlanks } from './roles.ts'
import { CAT, Catcodes, type Token } from './tokens.ts'

/** a definition's body in the source: its file and its tokens [a, b) */
export interface Site {
  file: SourceFile
  a: number
  b: number
}

export interface Macro {
  params: number
  /** its first parameter is optional (LaTeX's \newcommand\x[n][default]) */
  opt: boolean
  /** its parameter text holds delimiters (\def\x#1.#2\end): no reader here takes its arguments */
  delimited: boolean
  /** the body's text, as TeX holds it */
  body: string
  /** the one parameter it typesets as prose (1-based) */
  prose?: number
  /** that parameter is only stored for another command to set (\gdef\@title{#1}) */
  stores?: boolean
  /** the command its body ends in, which reads on past the call's arguments */
  tail?: string
  /** a body of no parameter that reads on (\@ifnextchar, a last command that takes arguments) */
  readsOn: boolean
  words?: boolean
  /** where its body stands in the source (a definition the walk can walk again, for a macro whose text is its body) */
  site?: Site
}

const DEF_PRIMITIVES = new Set(['def', 'gdef', 'edef', 'xdef'])
const LATEX_DEFINERS = /^(?:(?:re)?newcommand|providecommand)$/

/** a body's tokens, read as TeX's \meaning writes them (a control word followed by a blank) with @ a letter */
export function bodyFile(body: string): SourceFile {
  const c = new Catcodes()
  c.set(64, CAT.letter)
  return new SourceFile('', body, c, { inline: () => null, lineEnv: () => false }, new Set())
}

/** the macro TeX holds by a definition's records, or null where it holds none (or one no reader here can take) */
export function macroOf(name: string, d: Definition, isCall: (name: string) => boolean): Macro | null {
  let m: Meaning = d.meaning
  let opt = false
  if (m.k !== 'macro') return null
  // a robust command's work is its internal's; an optional argument's, LaTeX's internal's (\@protected@testopt\x\\x{d})
  if (/^\\protect \\/.test(m.body) && d.robust?.k === 'macro') m = d.robust
  if (/^\\@protected@testopt \\|^\\@testopt \\/.test(m.body) && d.opt?.k === 'macro') {
    m = d.opt
    opt = true
  }
  if (m.k !== 'macro') return null
  if (d.spec !== undefined) {
    // an ltcmd command: its arguments by its specification (mandatory `m`, `+m`; an optional `o` or `O{…}` first), its code
    // its body. Any other argument type (a star, a delimiter, an embellishment) is one no reader here takes
    const spec = d.spec
      .replace(/O\{(?:[^{}]|\{[^{}]*\})*\}/g, 'O')
      .replace(/\+/g, '')
      .replace(/\s+/g, '')
    if (!/^[oO]?m*$/.test(spec) || d.code?.k !== 'macro') return null
    const out: Macro = {
      params: spec.length,
      opt: /^[oO]/.test(spec),
      delimited: false,
      body: d.code.body,
      readsOn: false,
    }
    analyse(name, out, isCall)
    return out
  }
  const params = (m.params.match(/#\d/g) ?? []).length
  const delimited =
    m.params.replace(/#\d/g, '').replace(/^\[\]$/, '') !== '' && !(opt && m.params === `[#1]${m.params.slice(4)}`)
  const out: Macro = {
    params,
    opt,
    delimited: opt ? !/^\[#1\](?:#\d)*$/.test(m.params) : delimited,
    body: m.body,
    readsOn: false,
  }
  analyse(name, out, isCall)
  return out
}

/** what a body does with its parameters (the walker's needs): its prose parameter, whether it stores it, its tail, whether it
 *  reads on */
export function analyse(_name: string, m: Macro, isCall: (name: string) => boolean): void {
  const f = bodyFile(m.body)
  if (m.params === 0) m.readsOn = readsOn(f, isCall)
  const use = paramUse(f, 0, f.toks.length, true, isCall)
  const prose = [...use.text].filter((n) => n <= m.params && !use.other.has(n) && !(m.opt && n === 1))
  if (prose.length === 1) {
    m.prose = prose[0]
    if (use.stored.has(prose[0] as number) && !use.typeset.has(prose[0] as number)) m.stores = true
  }
  if (m.params > 0) {
    const t = tailOf(f)
    if (t) m.tail = t
  }
}

interface Use {
  text: Set<number>
  other: Set<number>
  typeset: Set<number>
  stored: Set<number>
}
const paramAt = (f: SourceFile, i: number): number | null => {
  const t = f.toks[i]
  const n = f.toks[i + 1]
  return t?.k === 'char' && t.cat === CAT.param && n?.k === 'char' && /\d/.test(n.ch) ? Number(n.ch) : null
}
/** where a body's tokens [from, to) set its parameters: `text` those it typesets as prose (bare, in a group, in a font
 *  command or a box, a caption's or a footnote's, the role table's text and content, what a definition inside stores),
 *  `other` those it hands to anything else (math, a name, a dimension, a command that reads on past its known arguments) */
function paramUse(
  f: SourceFile,
  from: number,
  to: number,
  textual: boolean,
  isCall: (name: string) => boolean,
  use: Use = { text: new Set(), other: new Set(), typeset: new Set(), stored: new Set() },
  storing = false,
): Use {
  // (an explicit stack: a body's groups nest as deep as it likes)
  const stack: [number, number, boolean, boolean][] = [[from, to, textual, storing]]
  while (stack.length) {
    const [a, b, tx, st] = stack.pop() as [number, number, boolean, boolean]
    let i = a
    while (i < b) {
      const t = f.toks[i] as Token
      const n = paramAt(f, i)
      if (n !== null) {
        if (tx) {
          use.text.add(n)
          ;(st ? use.stored : use.typeset).add(n)
        } else use.other.add(n)
        i += 2
        continue
      }
      if (t.k === 'char' && t.cat === CAT.math) {
        let j = i + 1
        while (j < b && !(f.toks[j]?.k === 'char' && (f.toks[j] as { cat: number }).cat === CAT.math)) j++
        if (j >= b) {
          i++
          continue
        }
        stack.push([i + 1, j, false, st])
        i = j + 1
        continue
      }
      if (isBegin(t)) {
        const c = f.close[i] ?? -1
        if (c < 0 || c >= b) {
          i++
          continue
        }
        stack.push([i + 1, c, tx, st])
        i = c + 1
        continue
      }
      if (t.k !== 'cs' || NO_ARGS.has(t.name) || !/^[A-Za-z@]+$/.test(t.name)) {
        i++
        continue
      }
      if (t.name === '(' || t.name === '[') {
        i++
        continue
      }
      if (t.name === 'begin') {
        const env = envName(f, i + 1, b)
        if (env && MATH_ENVS.test(env.name)) {
          const e = envEnd(f, env.after, b, env.name)
          stack.push([env.after, e.body, false, st])
          i = e.after
          continue
        }
      }
      const params = commandParams(t.name)
      const r = params ? readArgs(f, i + 1, params, b, isCall) : null
      const args: Arg[] = r?.complete ? r.args : adjacent(f, i + 1, b)
      const knownArgs = !!r?.complete
      const reqs = args.filter((x) => x.shape !== '[' && x.shape !== '*')
      const definer = DEF_PRIMITIVES.has(t.name) || LATEX_DEFINERS.test(t.name)
      const prose =
        INLINE_TEXT.has(t.name) || t.name === 'footnote' || (CAPTIONS.has(t.name) && t.name !== 'captionof')
          ? reqs[0]
          : CONTENT_BOX.has(t.name)
            ? reqs[(CONTENT_BOX.get(t.name) as number) - 1]
            : definer
              ? args.at(-1)
              : undefined
      for (const x of args) {
        const inner = isBegin(f.toks[x.a]) || isOther(f.toks[x.a], '[') ? [x.a + 1, x.b - 1] : [x.a, x.b]
        stack.push([
          inner[0] as number,
          inner[1] as number,
          tx && (x === prose || (knownArgs && (x.role === 't' || x.role === 'c'))),
          st || (definer && x === prose),
        ])
      }
      const e = args.at(-1)?.b ?? r?.end ?? i + 1
      // (a command the table does not know reads what follows up to delimiters only its definition gives: a parameter in
      // the run of tokens right after it is handed to it)
      if (!knownArgs && !/cite/i.test(t.name)) {
        for (let k = skipBlanks(f, e, b); k < b; k++) {
          const u = f.toks[k] as Token
          if (u.k === 'space' || u.k === 'par' || (u.k === 'char' && u.cat === CAT.end)) break
          if (isBegin(u)) {
            const c = f.close[k] ?? -1
            if (c < 0 || c >= b) break
            for (let j = k; j < c; j++) {
              const p = paramAt(f, j)
              if (p !== null) use.other.add(p)
            }
            k = c
            continue
          }
          const p = paramAt(f, k)
          if (p !== null) {
            use.other.add(p)
            k++
          }
        }
      }
      i = Math.max(e, i + 1)
    }
  }
  return use
}

/** every brace group and bracket group right after a command (a command the table does not know) */
export function adjacent(f: SourceFile, i: number, to: number): Arg[] {
  const out: Arg[] = []
  let at = i
  for (let n = 0; n < 9; n++) {
    let k = skipBlanks(f, at, to)
    if (isOther(f.toks[k], '*') && (isBegin(f.toks[k + 1]) || isOther(f.toks[k + 1], '['))) k++
    if (isOther(f.toks[k], '[')) {
      let depth = 0
      let e = -1
      for (let j = k; j < to; j++) {
        const t = f.toks[j] as Token
        if (t.k === 'par') break
        if (isOther(t, '[')) depth++
        else if (isOther(t, ']') && --depth === 0) {
          e = j + 1
          break
        }
      }
      if (e < 0) break
      out.push({ shape: '[', role: 'a', param: n, a: k, b: e })
      at = e
      continue
    }
    if (f.toks[k]?.k === 'raw') {
      out.push({ shape: '{', role: 'a', param: n, a: k, b: k + 1 })
      at = k + 1
      continue
    }
    if (isBegin(f.toks[k])) {
      const c = f.close[k] ?? -1
      if (c < 0 || c >= to) break
      out.push({ shape: '{', role: 'a', param: n, a: k, b: c + 1 })
      at = c + 1
      continue
    }
    break
  }
  return out
}

/** an environment's name after `\begin` or `\end` at token i: `{name}` */
export function envName(f: SourceFile, i: number, to: number): { name: string; after: number } | null {
  const k = skipBlanks(f, i, to)
  if (!isBegin(f.toks[k])) return null
  const c = f.close[k] ?? -1
  if (c < 0 || c >= to) return null
  const name = f.src(k + 1, c).trim()
  return name && !/[\\{}%]/.test(name) ? { name, after: c + 1 } : null
}
/** an environment's end from token i (just after its \begin{name}): its matching \end{name}, \begin and \end of the same
 *  name counted. `body` where the body ends, `after` past the \end{name} */
export function envEnd(f: SourceFile, i: number, to: number, name: string): { body: number; after: number } {
  let depth = 1
  for (let k = i; k < to; k++) {
    const t = f.toks[k] as Token
    if (t.k !== 'cs' || (t.name !== 'begin' && t.name !== 'end')) continue
    const e = envName(f, k + 1, to)
    if (!e || e.name !== name) continue
    if (t.name === 'begin') depth++
    else if (--depth === 0) return { body: k, after: e.after }
  }
  return { body: to, after: to }
}

/** a body that reads on past the call: \@ifnextchar and its kin anywhere, or a last command that takes arguments the body
 *  does not give it */
function readsOn(f: SourceFile, isCall: (name: string) => boolean): boolean {
  const toks = f.toks.filter((t) => t.k !== 'space' && t.k !== 'comment')
  if (
    toks.some(
      (t) =>
        t.k === 'cs' &&
        /^(?:@ifnextchar|@ifstar|kernel@ifnextchar|@ifnch|@testopt|@protected@testopt|@dblarg|futurelet|afterassignment|expandafter|csname|IfBooleanTF|NewDocumentCommand)$/.test(
          t.name,
        ),
    )
  )
    return true
  const last = toks.at(-1)
  if (!last) return false
  if (last.k === 'cs' && /^[A-Za-z@]+$/.test(last.name)) return !NO_ARGS.has(last.name)
  if (isOther(last, ']') || last.k === 'cs') return toks.some((t) => t.k === 'cs')
  if (
    last.k === 'char' &&
    last.cat !== CAT.end &&
    toks.at(-2)?.k === 'char' &&
    (toks.at(-2) as { cat: number }).cat === CAT.param
  )
    return true
  // the last command at the body's top level, and whether what follows it is its arguments in full
  let depth = 0
  let at = -1
  for (let i = 0; i < f.toks.length; i++) {
    const t = f.toks[i] as Token
    if (isBegin(t)) depth++
    else if (t.k === 'char' && t.cat === CAT.end) depth--
    else if (t.k === 'cs' && depth === 0 && /^[A-Za-z@]+$/.test(t.name)) at = i
  }
  if (at < 0) return false
  const name = (f.toks[at] as { name: string }).name
  if (NO_ARGS.has(name)) return false
  const params = commandParams(name)
  if (!params) {
    const rest = adjacent(f, at + 1, f.toks.length)
    const end = rest.at(-1)?.b ?? at + 1
    return !f.toks
      .slice(end)
      .some((t) => t.k !== 'space' && t.k !== 'comment' && !(t.k === 'char' && t.cat === CAT.end))
  }
  return !readArgs(f, at + 1, params, f.toks.length, isCall).complete
}

/** the command a body ends in (its last token, a control word), which reads its arguments past the call's own; not one
 *  that is another's operand (\string\x, \let\a\b) */
function tailOf(f: SourceFile): string | null {
  const toks = f.toks.filter((t) => t.k !== 'space' && t.k !== 'comment')
  const n = toks.length - 1
  const word = (k: number) => {
    const t = toks[k]
    return t?.k === 'cs' && /^[A-Za-z@]/.test(t.name) ? t.name : null
  }
  const name = word(n)
  if (!name || NO_ARGS.has(name)) return null
  const before = isOther(toks[n - 1], '=') ? n - 2 : n - 1
  const w1 = word(n - 1)
  const w2 = word(before - 1)
  return (w1 && OPERAND_OF.has(w1)) || (w2 && SECOND_OPERAND_OF.has(w2)) ? null : name
}

/** whether a macro's body sets words of its own (beyond its arguments): letters outside math, groups' arguments, brackets
 *  and dimensions, as text the body would set around them */
export function setsWords(m: Macro): boolean {
  if (m.words === undefined) {
    const f = bodyFile(m.body)
    let words = false
    let depth = 0
    let math = false
    let run = 0
    for (let i = 0; i < f.toks.length && !words; i++) {
      const t = f.toks[i] as Token
      if (t.k === 'char' && t.cat === CAT.math) {
        math = !math
        run = 0
        continue
      }
      if (isBegin(t)) {
        depth++
        run = 0
        continue
      }
      if (t.k === 'char' && t.cat === CAT.end) {
        depth--
        run = 0
        continue
      }
      if (t.k === 'letter' && depth === 0 && !math && /\p{L}/u.test(f.text.slice(t.s, t.e))) {
        if (++run >= 2) words = true
        continue
      }
      run = 0
    }
    m.words = words
  }
  return m.words
}

/** the paper's own names: those its files define by a definer of TeX or LaTeX (\newcommand, \def, \let, …), read on the
 *  tokens (no comment or verbatim text counts) */
const DEFINERS =
  /^(?:(?:re)?newcommand|providecommand|DeclareRobustCommand|(?:New|Renew|Provide|Declare)(?:Expandable)?DocumentCommand|[gex]?def|let|newtoks|DeclareMathOperator)$/
/** the definers of an environment, its name a group after them (the kernel's, xparse's, the packages' that make one) */
const ENV_DEFINERS =
  /^(?:(?:re)?newenvironment|provideenvironment|(?:New|Renew|Provide|Declare)DocumentEnvironment|(?:re)?newtcolorbox|(?:New|Renew|Declare|Provide)TColorBox|newtcbtheorem|newmdenv|newlist|DeclareFloatingEnvironment|newfloat|lstnewenvironment|(?:exclude|include|special|general|process)comment|(?:Custom|Recustom|Define)VerbatimEnvironment|(?:re)?newtcblisting|(?:Declare|New|Renew|Provide)TCBListing|newminted)$/
export function ownNames(files: readonly SourceFile[]): {
  commands: Set<string>
  envs: Set<string>
  /** each name's definitions' bodies, in the files' order (null where its definer has none the reader finds) */
  bodies: Map<string, (string | null)[]>
  /** each name's definitions' bodies where they stand */
  sites: Map<string, Site[]>
  /** how often each name is written in the files, and how often as a definition's name */
  written: Map<string, number>
  defined: Map<string, number>
} {
  const out = new Set<string>()
  const envs = new Set<string>()
  const bodies = new Map<string, (string | null)[]>()
  const sites = new Map<string, Site[]>()
  const written = new Map<string, number>()
  const defined = new Map<string, number>()
  for (const f of files) {
    for (let i = 0; i < f.toks.length; i++) {
      const t = f.toks[i] as Token
      if (t.k === 'cs' && ENV_DEFINERS.test(t.name)) {
        // an environment's name, in a group: each name of a list (comment.sty's \excludecomment{a,b})
        let k = skipBlanks(f, i + 1, f.toks.length)
        if (isOther(f.toks[k], '*')) k = skipBlanks(f, k + 1, f.toks.length)
        if (isOther(f.toks[k], '[')) {
          while (k < f.toks.length && !isOther(f.toks[k], ']')) k++
          k = skipBlanks(f, k + 1, f.toks.length)
        }
        const c = isBegin(f.toks[k]) ? (f.close[k] ?? -1) : -1
        if (c > 0) for (const n of f.src(k + 1, c).split(',')) if (n.trim() && !/[\\{}]/.test(n)) envs.add(n.trim())
        continue
      }
      if (t.k !== 'cs' || !DEFINERS.test(t.name)) continue
      let k = skipBlanks(f, i + 1, f.toks.length)
      if (isOther(f.toks[k], '*')) k = skipBlanks(f, k + 1, f.toks.length)
      if (isBegin(f.toks[k])) k = skipBlanks(f, k + 1, f.toks.length)
      const n = f.toks[k]
      if (n?.k !== 'cs' || !/^[A-Za-z@]+$/.test(n.name)) continue
      out.add(n.name)
      // the definition's body, where its definer has one the reader can find: a LaTeX definer's after its [n][default], a
      // TeX one's after its parameter text
      let j = k + 1
      if (isEnd(f.toks[j])) j++
      if (/^[gex]?def$/.test(t.name)) while (j < f.toks.length && !isBegin(f.toks[j])) j++
      else if (/newcommand|providecommand|DeclareRobustCommand/.test(t.name))
        for (let m = 0; m < 2; m++) {
          j = skipBlanks(f, j, f.toks.length)
          if (!isOther(f.toks[j], '[')) break
          while (j < f.toks.length && !isOther(f.toks[j], ']')) j++
          j++
        }
      else {
        bodies.set(n.name, [...(bodies.get(n.name) ?? []), null])
        defined.set(n.name, (defined.get(n.name) ?? 0) + 1)
        continue
      }
      j = skipBlanks(f, j, f.toks.length)
      const c = isBegin(f.toks[j]) ? (f.close[j] ?? -1) : -1
      bodies.set(n.name, [...(bodies.get(n.name) ?? []), c > 0 ? f.src(j + 1, c) : null])
      if (c > 0) sites.set(n.name, [...(sites.get(n.name) ?? []), { file: f, a: j + 1, b: c }])
      defined.set(n.name, (defined.get(n.name) ?? 0) + 1)
    }
  }
  for (const f of files) for (const t of f.toks) if (t.k === 'cs') written.set(t.name, (written.get(t.name) ?? 0) + 1)
  return { commands: out, envs, bodies, sites, written, defined }
}

/** a body as TeX holds it, for comparing the paper's definition with TeX's meaning: a control word and a blank, one blank
 *  for any run of them, no comment, no blank TeX skips */
export function canonical(body: string): string {
  const f = bodyFile(body)
  let out = ''
  for (const t of f.toks) {
    if (t.k === 'cs') out += /^[A-Za-z@]+$/.test(t.name) ? `\\${t.name} ` : `\\${t.name}`
    else if (t.k === 'space') {
      if (!t.skipped && !out.endsWith(' ')) out += ' '
    } else if (t.k === 'par') out += '\\par '
    else if (t.k !== 'comment') out += f.text.slice(t.s, t.e)
  }
  return out.trim()
}

/** a definition the body makes at token i (a definer's name): the macro it makes, and where the definition ends; null where
 *  it is none the reader can read (a delimited parameter text it cannot take, a body that does not close) */
export function definitionAt(
  f: SourceFile,
  i: number,
  to: number,
  isCall: (name: string) => boolean,
): { name: string; macro: Macro; end: number; global: boolean; provide: boolean } | null {
  const how = (f.toks[i] as { name: string }).name
  let k = skipBlanks(f, i + 1, to)
  if (DEF_PRIMITIVES.has(how)) {
    const n = f.toks[k]
    if (n?.k !== 'cs') return null
    let j = k + 1
    while (j < to && !isBegin(f.toks[j])) j++
    if (j >= to) return null
    const params = f.src(k + 1, j)
    const c = f.close[j] ?? -1
    if (c < 0 || c >= to) return null
    const m: Macro = {
      params: (params.match(/#\d/g) ?? []).length,
      opt: false,
      delimited: params.replace(/#\d|\s/g, '') !== '',
      body: f.src(j + 1, c),
      readsOn: false,
    }
    analyse(n.name, m, isCall)
    m.site = { file: f, a: j + 1, b: c }
    return { name: n.name, macro: m, end: c + 1, global: how === 'gdef' || how === 'xdef', provide: false }
  }
  if (!LATEX_DEFINERS.test(how) && how !== 'DeclareRobustCommand') return null
  if (isOther(f.toks[k], '*')) k = skipBlanks(f, k + 1, to)
  let name: string | null = null
  if (isBegin(f.toks[k])) {
    const c = f.close[k] ?? -1
    const inner = skipBlanks(f, k + 1, c)
    const n = f.toks[inner]
    if (c < 0 || n?.k !== 'cs') return null
    name = n.name
    k = c + 1
  } else {
    const n = f.toks[k]
    if (n?.k !== 'cs') return null
    name = n.name
    k++
  }
  let params = 0
  let opt = false
  k = skipBlanks(f, k, to)
  if (isOther(f.toks[k], '[')) {
    let e = k + 1
    while (e < to && !isOther(f.toks[e], ']')) e++
    params = Number(f.src(k + 1, e).trim()) || 0
    k = skipBlanks(f, e + 1, to)
    if (isOther(f.toks[k], '[')) {
      let depth = 0
      let e2 = k
      for (; e2 < to; e2++) {
        if (isBegin(f.toks[e2])) depth++
        else if (f.toks[e2]?.k === 'char' && (f.toks[e2] as { cat: number }).cat === CAT.end) depth--
        else if (depth === 0 && isOther(f.toks[e2], ']')) break
      }
      opt = true
      k = skipBlanks(f, e2 + 1, to)
    }
  }
  if (!isBegin(f.toks[k])) return null
  const c = f.close[k] ?? -1
  if (c < 0 || c >= to) return null
  const m: Macro = { params, opt, delimited: false, body: f.src(k + 1, c), readsOn: false, site: { file: f, a: k + 1, b: c } }
  analyse(name, m, isCall)
  return { name, macro: m, end: c + 1, global: false, provide: how === 'providecommand' }
}

export type { Param }
