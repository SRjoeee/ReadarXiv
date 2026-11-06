// A prepared paper's units for the measurements: the `*.units` objects of a bundle directory (packages/format's Units,
// as the prepare writes them), each unit's first page from its `*.part` objects. A nested unit's piece (`t: 'unit'`) is an
// element here, as the translator sees it; a unit the paper keeps (`kept`) is left out. With no directory, a synthetic
// paper of `n` units cycled from a fixed set of shapes.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Piece, UnitIn } from '../../../packages/translate/src/index.ts'

type FormatPiece =
  | { t: 'text'; s: string }
  | { t: 'el'; id: string; kind: string }
  | { t: 'span'; id: string; style: string; must?: 1; content: FormatPiece[] }
  | { t: 'unit'; id: string }
const typed = (ps: FormatPiece[]): Piece[] =>
  ps.map(p =>
    p.t === 'unit' ? { t: 'el', id: p.id, kind: 'note-mark' } : p.t === 'span' ? { t: 'span', id: p.id, style: p.style, ...(p.must ? { must: true } : {}), content: typed(p.content) } : p,
  )

export interface Paper {
  units: UnitIn[]
  pageOf: Map<string, number>
  pages: number
}

export function paperOf(dir: string | undefined, n = 1200): Paper {
  if (!dir) return synthetic(n)
  const units: UnitIn[] = []
  const pageOf = new Map<string, number>()
  const seen = new Set<string>()
  let pages = 1
  for (const f of readdirSync(dir).sort()) {
    // (the bundle's other objects, the head, the add-on's bytes, are not read)
    if (!f.endsWith('.units') && !f.endsWith('.part')) continue
    const o = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    if (f.endsWith('.units')) {
      for (const u of o.units as { id: string; kind: string; content: FormatPiece[]; sentences?: true; kept?: true }[]) {
        if (u.kept || seen.has(u.id)) continue
        seen.add(u.id)
        units.push({ id: u.id, kind: u.kind, content: typed(u.content), ...(u.sentences ? { sentences: true } : {}) })
      }
    } else if (f.endsWith('.part')) {
      pages = Math.max(pages, o.page as number)
      for (const flow of o.flows as { text: unknown }[][]) for (const p of flow) if (typeof p.text === 'string' && !pageOf.has(p.text)) pageOf.set(p.text, o.page as number)
    }
  }
  return { units, pageOf, pages }
}

function synthetic(n: number): Paper {
  const units: UnitIn[] = []
  const pageOf = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const id = `u${i}`
    const content: Piece[] =
      i % 3 === 0
        ? [{ t: 'text', s: `Paragraph ${i} states a result about the model. It holds for every input we tried, as shown in ` }, { t: 'el', id: 'c', kind: 'cite' }, { t: 'text', s: '.' }]
        : i % 3 === 1
          ? [{ t: 'text', s: `Let ` }, { t: 'el', id: 'm', kind: 'math' }, { t: 'text', s: ` be the ${i}-th estimate; then ` }, { t: 'el', id: 'n', kind: 'math' }, { t: 'text', s: ' converges.' }]
          : [{ t: 'span', id: 'b', style: 'bold', content: [{ t: 'text', s: `Step ${i}.` }] }, { t: 'text', s: ' We train the network and report the loss on the held-out split.' }]
    units.push({ id, kind: 'para', content, sentences: true })
    pageOf.set(id, 1 + Math.floor(i / 25))
  }
  return { units, pageOf, pages: 1 + Math.floor((n - 1) / 25) }
}
