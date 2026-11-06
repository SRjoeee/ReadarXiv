// The HTML page's blocks on the translator contract (interfaces/translate/DECISION.md, design-b §2.3): a block's wire, as
// the protector serialised it in the session's format, read as a typed unit; a translation's content written back as
// that wire, for `rehydrate` as it is; the translator's sentences as the wire lengths the renderer's sentence map takes.
// Every pair of the tags wire is a span that must come back (the decision: the HTML page keeps its styled words, a
// reply that loses one is refused, as `validate` refused it); the markers wire holds no pair (the protector flattens
// them there, DESIGN §6.3). An element's kind is the rule file's (`elementKindOf`): it is what a sentence cutter reads it
// as, nothing more. Pure: no DOM is touched (the slot nodes are only asked their kind), so the PDF reader's call site
// reads its engine's wires with the same code.
import type { OutPiece, Piece, Sentences, UnitIn } from '@readarxiv/translate'
import { ENTITY_PATTERN, decodeText, escapeText } from './escape'
import { fromAlpha, MARKER_RE, TAG_RE, type WireFormat, writeVoid } from './tokens'

/** a unit read from a wire, and what writing its translation back needs */
export interface WireUnit {
  unit: UnitIn
  /** the source wire's length, and for each offset of the unit's projection (and its end) where it begins in the wire */
  wireAt: number[]
  /** the source wire's leading and trailing white space: a translation without its own gets them back (the edges of a
   *  block separate it from its neighbours inline; serialize.ts never trims) */
  lead: string
  trail: string
  format: WireFormat
}

const ENTITY = new RegExp(ENTITY_PATTERN, 'iy')
/** The projection's table of wire offsets: each code unit at the offset it came from, or, for the first one inside a pair
 *  just opened, at the opening tag (a sentence that begins there begins before its styled words, as the tags wire's own
 *  boundary markers stand: wire/tags.ts cutAt) */
interface Table {
  at: number[]
  open: number | null
}
const push = (t: Table, offset: number) => {
  t.at.push(t.open ?? offset)
  t.open = null
}

/** `text`, decoded, pushed onto the projection table */
function decodedAt(wire: string, from: number, to: number, t: Table): string {
  let out = ''
  for (let i = from; i < to; ) {
    ENTITY.lastIndex = i
    const m = wire[i] === '&' ? ENTITY.exec(wire) : null
    const one = m && m.index === i && m[0].length <= to - i ? m[0] : (wire[i] as string)
    const s = one.length > 1 ? decodeText(one) : one
    for (let k = 0; k < s.length; k++) push(t, i)
    out += s
    i += one.length
  }
  return out
}

/**
 * A wire as a unit. `kindOf(n)` names placeholder n's element kind (the rule file's, from its slot node). `sentences`:
 * whether the unit lights by sentence (a reference unit does not: DESIGN §8.6's WHOLE_ONLY)
 */
/** what a host states of placeholder n's element: its kind, and what the contract lets it say besides (Piece `el`) */
export interface ElementStatement {
  kind: string
  alone?: boolean
  reads?: string
}

export function unitOfWire(id: string, wire: string, format: WireFormat, o: { elementOf?: (n: number) => ElementStatement; sentences?: boolean; kind?: string } = {}): WireUnit {
  const root: Piece[] = []
  const stack: Piece[][] = [root]
  const table: Table = { at: [], open: null }
  const wireAt = table.at
  const here = () => stack[stack.length - 1] as Piece[]
  const text = (s: string) => {
    if (!s) return
    const last = here().at(-1)
    if (last?.t === 'text') here()[here().length - 1] = { t: 'text', s: last.s + s }
    else here().push({ t: 'text', s })
  }
  const pattern = new RegExp((format === 'markers' ? MARKER_RE : TAG_RE).source, 'g')
  let last = 0
  for (const m of wire.matchAll(pattern)) {
    const at = m.index ?? 0
    text(decodedAt(wire, last, at, table))
    last = at + m[0].length
    if (format === 'markers') {
      if (m[0] === '@@') {
        push(table, at)
        text('@')
        continue
      }
      const n = fromAlpha(m[1] as string)
      push(table, at)
      here().push(elementPiece(`x${n}`, o.elementOf?.(n)))
      continue
    }
    const v = m[1] ?? m[2] ?? m[3]
    const open = m[4] ?? m[5] ?? m[6]
    if (v !== undefined) {
      push(table, at)
      here().push(elementPiece(`x${v}`, o.elementOf?.(Number(v))))
    } else if (open !== undefined) {
      const content: Piece[] = []
      table.open ??= at
      here().push({ t: 'span', id: `t${open}`, style: 'other', must: true, content })
      stack.push(content)
    } else if (stack.length > 1) stack.pop()
  }
  text(decodedAt(wire, last, wire.length, table))
  wireAt.push(wire.length)
  return {
    unit: { id, content: root, ...(o.kind ? { kind: o.kind } : {}), ...(o.sentences ? { sentences: true } : {}) },
    wireAt,
    lead: /^\s*/.exec(wire)?.[0] ?? '',
    trail: /\s*$/.exec(wire)?.[0] ?? '',
    format,
  }
}

const elementPiece = (id: string, e: ElementStatement | undefined): Piece => ({
  t: 'el',
  id,
  kind: e?.kind ?? 'other',
  ...(e?.alone ? { alone: true } : {}),
  ...(e?.reads !== undefined ? { reads: e.reads } : {}),
})

/** a translation's content as the wire of its source's format, and for each offset of its projection where it begins */
export function wireOfContent(content: readonly OutPiece[], from: WireUnit): { wire: string; wireAt: number[] } {
  let body = ''
  const at: number[] = []
  let open: number | null = null
  const mark = () => {
    at.push(open ?? body.length)
    open = null
  }
  const walk = (ps: readonly OutPiece[]) => {
    for (const p of ps) {
      if (p.t === 'text') {
        for (let k = 0; k < p.s.length; k++) {
          mark()
          body += escapeText(p.s[k] as string, from.format)
        }
      } else if (p.t === 'el') {
        mark()
        body += writeVoid(Number(p.id.slice(1)), from.format)
      } else {
        // (a pair only on the tags wire; the markers wire's units hold none)
        open ??= body.length
        body += `<t id="${p.id.slice(1)}">`
        walk(p.content)
        body += '</t>'
      }
    }
  }
  walk(content)
  at.push(body.length)
  const lead = /^\s/.test(body) ? '' : from.lead
  const trail = /\s$/.test(body) ? '' : from.trail
  return { wire: lead + body + trail, wireAt: at.map(x => x + lead.length) }
}

/** Sentence lengths in wire coordinates (the renderer's SentenceAlignment) from a translator's sentences, or undefined
 *  where they do not partition both wires */
export function alignmentOf(sentences: Sentences | undefined, from: WireUnit, sourceWire: string, to: { wire: string; wireAt: number[] }): { source: number[]; target: number[] } | undefined {
  if (!sentences || sentences.src.length !== sentences.tr.length) return undefined
  const lengths = (cuts: readonly number[], wireAt: readonly number[], length: number) => {
    const bounds = [0, ...cuts.map(c => wireAt[c] ?? -1), length]
    const out: number[] = []
    for (let i = 1; i < bounds.length; i++) {
      const a = bounds[i - 1] as number
      const b = bounds[i] as number
      if (b <= a) return undefined
      out.push(b - a)
    }
    return out
  }
  const source = lengths(sentences.src, from.wireAt, sourceWire.length)
  const target = lengths(sentences.tr, to.wireAt, to.wire.length)
  return source && target && source.length === target.length ? { source, target } : undefined
}

/** One sentence, whole to whole: the alignment of a unit aligned without being cut (a reference fragment, DESIGN §8.6) */
export const wholeAlignment = (sourceWire: string, targetWire: string) => ({ source: [sourceWire.length], target: [targetWire.length] })
