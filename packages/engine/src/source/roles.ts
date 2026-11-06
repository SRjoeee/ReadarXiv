// What each argument of a command or environment is (text, typeset content, a dimension, keys, a name, code …), and how TeX
// takes the arguments from the tokens: the role table of the engine's rules (arg-roles.mjs) over the generated tables, read
// on the tokenizer's tokens. A command's parameters are a string of pairs, shape then role (arg-roles.mjs' header):
//   shapes  `{` a group or one token; `[` an optional argument; `*` an optional star; `?` an optional `=`; `=` a literal `=`;
//           `_` TeX's own syntax for the role (a number, a dimension, glue); `u` up to a delimiter not named (not known);
//           `b` tokens up to a brace; `g` a brace group and nothing else
//   roles   `t` text, `c` typeset content, `a` untyped, `d` a dimension, `k` keys, `n` a name, `v` verbatim, `r` a
//           register, `x` code, `m` math, `s` a literal
import type { SourceFile } from './files.ts'
import {
  BINDINGS,
  COMMANDS,
  CURATED,
  CURATED_ENVS,
  ENVIRONMENTS,
  FRONT,
  MORE_FRONT,
  NOT_FRONT_TEXT,
  PACKAGE_COMMANDS,
  PACKAGE_ENVIRONMENTS,
  REQUIRES,
  VALUES,
} from './tables.ts'
import { CAT, type Token } from './tokens.ts'

export interface Param {
  shape: string
  role: string
}
const parse = (spec: string): Param[] =>
  (spec.match(/../g) ?? []).map((p) => ({ shape: p[0] as string, role: p[1] as string }))
export const paramsOf = (spec: string): readonly Param[] => Object.freeze(parse(spec))
export const REGISTER: readonly Param[] = Object.freeze([{ shape: '=', role: 'r' }])
const known = (spec: string | undefined): spec is string =>
  typeof spec === 'string' && spec !== '?' && !spec.includes('u')
const asParams = (spec: string): readonly Param[] => (spec === '=' ? REGISTER : parse(spec))
const BINDING_INDEX = new Map(BINDINGS.map((b, k) => [b, k]))

/** the LaTeXML bindings a paper loads: its class and packages as its files name them (\documentclass, \LoadClass,
 *  \usepackage, \RequirePackage, read on the tokens: no comment or verbatim text counts), with what those load in turn; a
 *  class LaTeXML has no binding for read as the longest one whose name begins its name, as LaTeXML reads it */
export function bindingsOf(files: readonly SourceFile[]): Set<number> {
  const out = new Set<number>()
  const queue: number[] = []
  const add = (k: number | undefined) => {
    if (k !== undefined && !out.has(k)) {
      out.add(k)
      queue.push(k)
    }
  }
  for (const f of files) {
    for (let i = 0; i < f.toks.length; i++) {
      const t = f.toks[i] as Token
      if (
        t.k !== 'cs' ||
        !/^(?:documentclass|LoadClass(?:WithOptions)?|usepackage|RequirePackage(?:WithOptions)?)$/.test(t.name)
      )
        continue
      const cls = /class/i.test(t.name)
      let k = skipBlanks(f, i + 1, f.toks.length)
      if (isOther(f.toks[k], '[')) {
        const e = bracketEnd(f, k, f.toks.length)
        if (e < 0) continue
        k = skipBlanks(f, e, f.toks.length)
      }
      const c = f.close[k] ?? -1
      if (c < 0) continue
      for (const raw of f.src(k + 1, c).split(',')) {
        const name = raw.replace(/%[^\n]*\n?/g, '').trim()
        if (!name) continue
        const own = BINDING_INDEX.get(`${name}.${cls ? 'cls' : 'sty'}`)
        if (own !== undefined || !cls) {
          add(own)
          continue
        }
        let best: string | null = null
        for (const b of BINDINGS)
          if (b.endsWith('.cls') && name.startsWith(b.slice(0, -4)) && (!best || b.length > best.length)) best = b
        if (best) add(BINDING_INDEX.get(best))
      }
    }
  }
  while (queue.length) for (const r of REQUIRES[queue.pop() as number] ?? []) add(r)
  return out
}

/** a name's parameters by LaTeXML's forms for the paper's bindings, none where they differ; else the engine pools' */
function byForms(
  pools: Readonly<Record<string, string>>,
  packages: Readonly<Record<string, readonly (readonly (string | number)[])[]>>,
  name: string,
  bindings: ReadonlySet<number> | null,
): readonly Param[] | null {
  const pkg = Object.hasOwn(packages, name) ? packages[name] : undefined
  if (bindings && pkg) {
    const mine = pkg.filter(([, ...bs]) => bs.some((b) => bindings.has(b as number))).map(([s]) => s as string)
    if (mine.length) return mine.length === 1 ? asParams(mine[0] as string) : null
  }
  const p = Object.hasOwn(pools, name) ? pools[name] : undefined
  return known(p) ? asParams(p) : null
}
/** a command's parameters by the role table, or null where it does not know them */
export function commandParams(name: string, bindings: ReadonlySet<number> | null = null): readonly Param[] | null {
  const c = Object.hasOwn(CURATED, name) ? CURATED[name] : undefined
  return known(c) ? asParams(c) : byForms(COMMANDS, PACKAGE_COMMANDS, name, bindings)
}
export function environmentParams(name: string, bindings: ReadonlySet<number> | null = null): readonly Param[] | null {
  const c = Object.hasOwn(CURATED_ENVS, name) ? CURATED_ENVS[name] : undefined
  return known(c) ? asParams(c) : byForms(ENVIRONMENTS, PACKAGE_ENVIRONMENTS, name, bindings)
}
const NOT_FRONT = new Set(NOT_FRONT_TEXT)
/** the front matter's commands by what their text is (`title`, `author`, `note`, `abstract`, `keywords`, `prose`) and which
 *  argument holds it (1-based; 0 an environment's body), LaTeXML's hooks and the ones written out */
export const FRONT_ROLES: Readonly<Record<string, readonly [string, number]>> = Object.freeze({
  ...Object.fromEntries(Object.entries(FRONT).filter(([k]) => !NOT_FRONT.has(k.replace(/^env:/, '')))),
  ...MORE_FRONT,
})
export const frontRole = (name: string): readonly [string, number] | undefined =>
  Object.hasOwn(FRONT_ROLES, name) ? FRONT_ROLES[name] : undefined

// ---------------------------------------------------------------- reading arguments from the tokens
export const isOther = (t: Token | undefined, ch: string): boolean =>
  !!t && t.k === 'char' && t.ch === ch && t.cat === CAT.other
export const isBegin = (t: Token | undefined): boolean => !!t && t.k === 'char' && t.cat === CAT.begin
export const isEnd = (t: Token | undefined): boolean => !!t && t.k === 'char' && t.cat === CAT.end

/** past blanks and comments before an argument: TeX lets an argument follow on the next line, never across a blank line
 *  (the tokenizer's `par`) */
export function skipBlanks(f: SourceFile, i: number, to: number): number {
  while (i < to) {
    const t = f.toks[i] as Token
    if (t.k === 'space' || t.k === 'comment') i++
    else break
  }
  return i
}
/** past the bracket group opening at token k: the first `]` at its own brace depth (TeX's delimited `[#1]`); -1 where none
 *  before `to` or before a blank line */
export function bracketEnd(f: SourceFile, k: number, to: number): number {
  for (let j = k + 1; j < to; j++) {
    const t = f.toks[j] as Token
    if (t.k === 'par') return -1
    if (isBegin(t)) {
      const c = f.close[j] ?? -1
      if (c < 0 || c >= to) return -1
      j = c
      continue
    }
    if (isEnd(t)) return -1
    if (isOther(t, ']')) return j + 1
  }
  return -1
}
/** a group read raw (url.sty's argument from the file) is one token, and a whole argument */
export const isRaw = (t: Token | undefined): boolean => t?.k === 'raw'
/** past the group whose `{` is token k, or -1 */
export function groupEnd(f: SourceFile, k: number, to: number): number {
  if (isRaw(f.toks[k])) return k + 1 <= to ? k + 1 : -1
  if (!isBegin(f.toks[k])) return -1
  const c = f.close[k] ?? -1
  return c < 0 || c >= to ? -1 : c + 1
}
/** past one argument token at k as TeX takes an undelimited argument: a group, or one token (a parameter `#1` two) */
export function oneArg(f: SourceFile, k: number, to: number): number {
  const t = f.toks[k]
  if (!t) return -1
  if (isBegin(t) || isRaw(t)) return groupEnd(f, k, to)
  if (
    t.k === 'char' &&
    t.cat === CAT.param &&
    f.toks[k + 1]?.k === 'char' &&
    /\d/.test((f.toks[k + 1] as { ch: string }).ch)
  )
    return k + 2
  return k + 1
}

export interface Arg {
  shape: string
  role: string
  param: number
  /** tokens [a, b): a group's from its brace or bracket on */
  a: number
  b: number
}

// TeX's number, dimension and glue (and a box's `to`/`spread`): read on the source text from the token on, its end a token's
// end. A command in it that is a call of its own (\vspace) is not part of the value; one whose expansion is a value is (VALUES)
const UNIT = String.raw`(?:true\s*)?(?:pt|em|ex|cm|mm|in|bp|sp|pc|dd|cc|mu|px|fill?l?)(?![A-Za-z])`
const FACTOR = String.raw`[-+\s]*(?:\d+(?:[.,]\d*)?|[.,]\d+)?\s*`
const QUANTITY = String.raw`${FACTOR}(?:${UNIT}|\\[A-Za-z@]+(?:\s*\d+)?)?`
const TEX_VALUE = new RegExp(
  String.raw`^\s*=?\s*(?:(?:to|spread)(?![A-Za-z])\s*)?(?:${QUANTITY})(?:\s*(?:plus|minus)\s*${QUANTITY})*`,
)
const VALUE_WORDS = new Set(VALUES)
/** the token index where a source offset falls at or after (a value read on the text ends between tokens) */
export function tokenAt(f: SourceFile, offset: number, from: number, to: number): number {
  let j = from
  while (j < to && (f.toks[j] as Token).e <= offset) j++
  return j
}
/** the length of TeX's value (a number, a dimension, glue) at source offset `at`, before `limit` */
export function valueLength(f: SourceFile, at: number, limit: number, isCall: (name: string) => boolean): number {
  const m = TEX_VALUE.exec(f.text.slice(at, Math.min(limit, at + 200)))
  if (!m) return 0
  const call = [...m[0].matchAll(/\\([A-Za-z@]+)/g)].find(
    (c) => !VALUE_WORDS.has(c[1] as string) && isCall(c[1] as string),
  )
  const value = call ? m[0].slice(0, call.index) : m[0]
  return /\S/.test(value) ? value.length : 0
}

/**
 * The arguments of a command whose parameters are known, from token i (just after its name): each with its tokens, an
 * optional one or a star only where given; `complete` false where a required one is missing or runs past `to` (what TeX would
 * take is then not known, and the caller reads the command as one it does not know)
 */
export function readArgs(
  f: SourceFile,
  i: number,
  params: readonly Param[],
  to: number,
  isCall: (name: string) => boolean,
): { args: Arg[]; end: number; complete: boolean } {
  const args: Arg[] = []
  let at = i
  for (const [param, { shape, role }] of params.entries()) {
    const k = skipBlanks(f, at, to)
    const t = f.toks[k]
    if (shape === '[') {
      if (isOther(t, '[')) {
        const e = bracketEnd(f, k, to)
        if (e < 0) return { args, end: at, complete: false }
        args.push({ shape, role, param, a: k, b: e })
        at = e
      }
      continue
    }
    if (shape === '*') {
      if (isOther(t, '*')) {
        args.push({ shape, role, param, a: k, b: k + 1 })
        at = k + 1
      }
      continue
    }
    if (shape === '?' || shape === '=') {
      if (isOther(t, '=')) at = k + 1
      continue
    }
    if (shape === '_' && role === 'd') {
      const from = f.at(at)
      const n = valueLength(f, from, f.at(to), isCall)
      if (n > 0) {
        const e = tokenAt(f, from + n, at, to)
        args.push({ shape, role, param, a: at, b: e })
        at = e
      }
      continue
    }
    if (shape === 'g') {
      const e = groupEnd(f, k, to)
      if (e < 0) return { args, end: at, complete: false }
      args.push({ shape: '{', role, param, a: k, b: e })
      at = e
      continue
    }
    if (shape === 'b') {
      let e = at
      while (e < to && !isBegin(f.toks[e]) && f.toks[e]?.k !== 'comment') e++
      if (e >= to || !isBegin(f.toks[e])) return { args, end: at, complete: false }
      if (e > at) args.push({ shape, role, param, a: at, b: e })
      at = e
      continue
    }
    if (shape !== '{' && shape !== '_') return { args, end: at, complete: false }
    if (k >= to || isEnd(t) || isOther(t, '[') || t?.k === 'par') return { args, end: at, complete: false }
    const e = oneArg(f, k, to)
    if (e < 0 || e > to) return { args, end: at, complete: false }
    args.push({ shape, role, param, a: k, b: e })
    at = e
  }
  return { args, end: at, complete: true }
}
