// The placement's classes, carried as today's marks writer has them (layout/marks.mjs classOf, LOOKS_AHEAD, READS_NOTHING,
// pairOf; arg-roles.mjs textless; latex-front.mjs inMath, LETTER_GROUP): which piece of a unit gets marks of which class,
// decided from its source's spelling. Equivalence first (contract stage 1c-2, item 2): the name classes stay until the gate
// shows what TeX's own answers can replace. Patterns generated into tex.ts from today's modules; textless reads its
// arguments on the source reader's tokens (roles.ts), as the reader does.
import type { SourcePiece } from '../source/read.ts'
import { bodyFile } from '../source/macros.ts'
import { commandParams, REGISTER, readArgs } from '../source/roles.ts'
import { DISPLAY_SOURCE, TEXT_SYMBOLS } from '../source/tables.ts'
import {
  BACKREF_LIST,
  CITE,
  CODE,
  EQREF,
  FOOTNOTE_MARK,
  INK_FREE,
  INVISIBLE,
  MATH,
  NUMBER,
  PREFIX,
  REF,
  STRUCTURE,
  TEXTLESS,
  URL,
} from './tex.ts'

/** a piece the marking reads: the reader's, or a mark it writes (no place of its own: it stands where it is inserted) */
export type MarkPiece = SourcePiece | Mark
export interface Mark {
  t: 'ph'
  src: string
  /** the mark's name (`p3.4a`), its kind and the piece it brackets (an index in its unit's pieces), -1 none */
  mark: { name: string; kind: MarkKind; piece: number; moved?: string }
  /** it opens the piece after it (an opening mark): the unit's start mark goes before it */
  opens?: true
  at?: undefined
  to?: undefined
}
export type MarkKind =
  | 'sentence'
  | 'start'
  | 'end'
  | 'lines'
  | 'open'
  | 'close'
  | 'colour'
  | 'backref'
  | 'cell-start'
  | 'cell-end'
  | 'heading-start'
  | 'heading-end'
  /** a paper's macro at a unit's head, before its start mark: its opening point (\axthpk), the start its closing one */
  | 'head'
  /** a paper's macro after a unit's last text, after its end mark: a point after the group it stands in (\axttg) */
  | 'after'
export const isMark = (p: MarkPiece | undefined): p is Mark => !!p && 'mark' in p && !!p.mark

export const DISPLAY = new RegExp(DISPLAY_SOURCE)
const srcOf = (p: MarkPiece | undefined): string => (p && 'src' in p && typeof p.src === 'string' ? p.src : '')

/** LaTeX's prefix of the next token (\protect: tex-kernel.mjs prefixWord) */
export const prefixWord = (src: string | null | undefined): boolean => PREFIX.test(src ?? '')
/** a LaTeX text symbol's text (rules/text-symbols.mjs symbolText): `\S`, `\%`, alone or before `{}` */
export function symbolText(src: string | null | undefined): string | null {
  const m = /^(\\(?:[A-Za-z]+|[%&#$_{}]))(?:\{\})?$/.exec(src ?? '')
  return m && Object.hasOwn(TEXT_SYMBOLS, m[1] as string) ? (TEXT_SYMBOLS[m[1] as string] as string) : null
}

const UNIT = String.raw`(?:true\s*)?(?:pt|em|ex|cm|mm|in|bp|sp|pc|dd|cc|mu|px|fill?l?)(?![A-Za-z])`
const FACTOR = String.raw`[-+\s]*(?:\d+(?:[.,]\d*)?|[.,]\d+)?\s*`
const QUANTITY = String.raw`${FACTOR}(?:${UNIT}|\\[A-Za-z@]+(?:\s*\d+)?)?`
const TEX_VALUE = new RegExp(
  String.raw`^\s*=?\s*(?:(?:to|spread)(?![A-Za-z])\s*)?(?:${QUANTITY})(?:\s*(?:plus|minus)\s*${QUANTITY})*`,
)
const registers = (v: string) =>
  [...v.matchAll(/\\([A-Za-z@]+)/g)].every((m) => commandParams(m[1] as string) === REGISTER)
/**
 * Whether a placeholder can never be a text rendering (arg-roles.mjs textless, with no paper): one of TeX's own that set no
 * ink and read nothing, or one command of TEXTLESS (or \noalign around one) with its arguments all there and nothing after
 * them, or a register's assignment
 */
export function textless(src: string): boolean {
  const s = src.trim().replace(/^(\\cmidrule\s*(?:\[[^\]]*\]\s*)?)\([^()]*\)/, '$1')
  if (INK_FREE.test(src)) return true
  const m = /^\\([A-Za-z@]+)/.exec(s)
  if (!m) return false
  const name = m[1] as string
  const params = commandParams(name)
  if (!TEXTLESS.has(name) && name !== 'noalign' && params !== REGISTER) return false
  if (!params?.length) return false
  const rest = s.slice(m[0].length)
  if (params === REGISTER) {
    const v = TEX_VALUE.exec(rest)
    return !!v && /\S/.test(v[0]) && !rest.slice(v[0].length).trim() && registers(v[0])
  }
  const f = bodyFile(s)
  const r = readArgs(f, 1, params, f.toks.length, () => false)
  const after = r.end < f.toks.length ? f.text.slice((f.toks[r.end] as { s: number }).s) : ''
  if (!r.complete || after.trim()) return false
  if (
    !r.args.every(
      (a) => a.shape !== '_' || f.text[(f.toks[a.a] as { s: number }).s] === '{' || registers(f.src(a.a, a.b)),
    )
  )
    return false
  if (name !== 'noalign') return true
  const a0 = r.args[0]
  const inner = a0
    ? f
        .src(a0.a, a0.b)
        .replace(/^\{([\s\S]*)\}$/, '$1')
        .trim()
    : ''
  return !inner || textless(inner)
}

/** \rule's call: what TeX's ink section measures, not the role table */
const RULE = /^\s*\\rule\b/
/** a piece's class, or null where it is not marked (marks.mjs classOf) */
export function classOf(p: MarkPiece | undefined): string | null {
  if (p?.t === 'nested') return 'footnote'
  if (p?.t !== 'ph') return null
  const src = p.src ?? ''
  if (INVISIBLE.test(src) || STRUCTURE.test(src)) return null
  if (textless(src) && !RULE.test(src)) return null
  if (DISPLAY.test(src)) return 'display'
  if (MATH.test(src)) return 'math'
  if (CITE.test(src)) return 'cite'
  if (EQREF.test(src)) return 'eqref'
  if (REF.test(src)) return 'ref'
  if (CODE.test(src)) return 'code'
  if (URL.test(src)) return 'url'
  if (FOOTNOTE_MARK.test(src)) return 'footnote'
  if (NUMBER.test(src)) return 'number'
  return 'macro'
}
/** a piece's leading command (marks.mjs commandOf) */
export const commandOf = (p: MarkPiece | undefined): string | null =>
  (p?.t === 'nested'
    ? /^\\[A-Za-z@]+/.exec(p.pre ?? '')?.[0]
    : p?.t === 'ph'
      ? /^\\[A-Za-z@]+/.exec(p.src ?? '')?.[0]
      : null) ?? null
/** a placeholder whose macro may look at what follows it (marks.mjs LOOKS_AHEAD) */
export const LOOKS_AHEAD = (p: MarkPiece | null | undefined): boolean => {
  const cls = classOf(p ?? undefined)
  return (
    cls === 'macro' ||
    cls === 'footnote' ||
    (p?.t === 'ph' &&
      /\\(?:xspace\*?|protect|noexpand|expandafter|string|unexpanded|detokenize|global|long|outer|protected|immediate)$/.test(
        p.src ?? '',
      ))
  )
}
/** a placeholder that reads nothing after it: a text symbol (marks.mjs READS_NOTHING) */
export const READS_NOTHING = (p: MarkPiece | null | undefined): boolean => p?.t === 'ph' && symbolText(p.src) !== null
/** backref's list after an entry (latex-front.mjs BACKREF_LIST) */
export const backrefPiece = (p: MarkPiece | undefined): boolean => p?.t === 'ph' && p.src === BACKREF_LIST
/** a unit TeX reads in math mode in part: a piece `_` or `^` outside a formula (latex-front.mjs inMath) */
export const inMath = (pieces: readonly MarkPiece[]): boolean =>
  pieces.some((p) => p.t === 'ph' && (p.src === '_' || p.src === '^'))
/** a group's pieces that are one command setting a letter of its own (`{\L}ukasz`: latex-front.mjs LETTER_GROUP) */
export const LETTER_GROUP = (inner: readonly MarkPiece[]): boolean => {
  const real = inner.filter((p) => !(p.t === 'text' && !/\S/.test(p.s)))
  return (
    real.length === 1 &&
    real[0]?.t === 'ph' &&
    /^\\(?:L|l|O|o|ss|SS|ae|AE|oe|OE|aa|AA|i|j|DH|dh|TH|th|NG|ng|DJ|dj)\s*$/.test(srcOf(real[0]))
  )
}
