// The runs floor (design-a §1.2 invariant 4): a unit no translator rebuilt is cut into its text stretches, each sent
// through the whole chain as a unit with no element, and put back between the elements, which stay where the source has
// them. A span that is not `must` is no edge (its words are its sentence's: cut there, a styled word came back alone,
// word salad, mt.mjs runsOf); a `must` span is rebuilt around its own stretches.
import type { OutPiece, Piece, UnitIn } from './contract.ts'

type Tpl =
  | { t: 'run'; k: number }
  | { t: 'text'; s: string }
  | { t: 'el'; id: string }
  | { t: 'span'; id: string; content: Tpl[] }

export interface Runs {
  /** the stretches to send, each a unit of one text piece; one with fewer than two letters is kept as it stands */
  parts: { text: string; lead: string; trail: string; send: boolean }[]
  /** the unit rebuilt from each stretch's translation (null: the stretch's own words) */
  join(tr: readonly (string | null)[]): OutPiece[]
}

const LETTERS = /\p{L}/gu

export function runsOf(unit: UnitIn): Runs {
  const parts: Runs['parts'] = []
  const build = (content: readonly Piece[]): Tpl[] => {
    const out: Tpl[] = []
    let text: string | null = null
    const close = () => {
      if (text === null) return
      const lead = /^\s*/.exec(text)?.[0] ?? ''
      const body = text.trim()
      const trail = body ? (/\s*$/.exec(text)?.[0] ?? '') : ''
      parts.push({ text: body, lead, trail, send: (body.match(LETTERS) ?? []).length >= 2 })
      out.push({ t: 'run', k: parts.length - 1 })
      text = null
    }
    const walk = (ps: readonly Piece[]) => {
      for (const p of ps) {
        if (p.t === 'text') text = (text ?? '') + p.s
        else if (p.t === 'el') {
          close()
          out.push({ t: 'el', id: p.id })
        } else if (p.must) {
          close()
          out.push({ t: 'span', id: p.id, content: build(p.content) })
        } else walk(p.content)
      }
    }
    walk(content)
    close()
    return out
  }
  const tpl = build(unit.content)
  const join = (tr: readonly (string | null)[]): OutPiece[] => {
    const fill = (ts: readonly Tpl[]): OutPiece[] =>
      ts.flatMap((x): OutPiece[] => {
        if (x.t === 'el') return [{ t: 'el', id: x.id }]
        if (x.t === 'span') return [{ t: 'span', id: x.id, content: fill(x.content) }]
        if (x.t === 'text') return [{ t: 'text', s: x.s }]
        const part = parts[x.k]
        if (!part) return []
        const s = part.lead + (tr[x.k] ?? part.text) + part.trail
        return s ? [{ t: 'text', s }] : []
      })
    return fill(tpl)
  }
  return { parts, join }
}
