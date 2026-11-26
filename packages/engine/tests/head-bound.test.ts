// The head's size and its bound (docs/PDF-READER.md §6.3): the head grows with the paper it names (a part's digest a page, a
// refused page's entry, 22 characters a ORIGINAL_CHUNK of arXiv's PDF, an outline entry and a printed number a heading), and
// its bound in the format (BOUNDS.head) is what write and read hold it to. A paper the prepare admits is never refused for the
// size of its head: the paper then gets no layer at all, whatever its pages hold.
import { type Head, ORIGINAL_CHUNK, write } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { PAGES_MAX } from '../src/prepare.ts'

const hex = (n: number, salt: string) => (salt + n.toString(16)).padStart(64, '0').slice(-64)

/** a head as the bundle writes one: `pages` pages each with its part (those in `refused` with none), an original of
 *  `originalBytes`, `units` Units objects, and `headings` located headings spread over the pages, each numbered as TeX
 *  numbers a section three levels deep ("12.3.4") */
function headOf(o: { pages: number; originalBytes: number; units: number; headings: number; refused?: number }): Head {
  const chunks = Math.ceil(o.originalBytes / ORIGINAL_CHUNK)
  const refused = o.refused ?? 0
  const outline: [number, number, string][] = []
  const numbers: [number, string][] = []
  for (let i = 0; i < o.headings; i++) {
    const ord = i * 7 + 3
    outline.push([ord, 1 + Math.floor((i * o.pages) / o.headings), hex(i, 'b')])
    numbers.push([ord, `${1 + Math.floor(i / 24)}.${1 + (Math.floor(i / 4) % 6)}.${1 + (i % 4)}`])
  }
  return {
    format: 1,
    paper: { id: '2501.00001', version: 1, pages: o.pages },
    made: 'a prepare of ours',
    original: { bytes: o.originalBytes, sha256: hex(1, 'a'), chunk: ORIGINAL_CHUNK, chunks: 'Q'.repeat(22 * chunks) },
    addOn: { digest: hex(2, 'a'), bytes: 1_000_000 },
    units: Array.from({ length: o.units }, (_, i) => hex(i, 'c')),
    parts: Array.from({ length: o.pages }, (_, i) => (i < refused ? null : hex(i, 'd'))),
    ...(refused ? { refused: Array.from({ length: refused }, (_, i) => [i + 1, 'page'] as [number, 'page']) } : {}),
    ...(outline.length ? { outline, numbers } : {}),
  }
}

describe("the head's bound", () => {
  it("writes the head of a long thesis with its headings' numbers (300 pages, 480 numbered headings, 20 MB)", () => {
    // (its head without the numbers is 64,498 bytes, within the 64 KiB the head was held to; the numbers add 7,318)
    const h = headOf({ pages: 300, originalBytes: 20_000_000, units: 3, headings: 480 })
    const { numbers: _, ...before } = h
    expect(() => write('head', before)).not.toThrow()
    expect(() => write('head', h)).not.toThrow()
  })
  it("writes the head of a paper at the prepare's page bound, every page's part named and two numbered headings a page", () => {
    const h = headOf({ pages: PAGES_MAX, originalBytes: 256 * 1024 * 1024, units: 64, headings: 2 * PAGES_MAX })
    expect(() => write('head', h)).not.toThrow()
  })
  it('writes the head of a paper at the page bound every page of which was refused', () => {
    const h = headOf({ pages: PAGES_MAX, originalBytes: 256 * 1024 * 1024, units: 64, headings: 0, refused: PAGES_MAX })
    expect(() => write('head', h)).not.toThrow()
  })
})
