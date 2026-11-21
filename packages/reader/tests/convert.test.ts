// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { type Head, type Part, read, type Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { fixtureLay, pagesOf, type ReaderDump } from '../e2e/page/convert.ts'

const dir = new URL('../e2e/fixtures/', import.meta.url)
function fixture(name: string) {
  const at = (f: string) => new URL(`${name}/${f}`, dir)
  const ref = (readdirSync(at('bundle')).find((f) => f.endsWith('.head')) as string).slice(0, -5)
  const head = read('head', new Uint8Array(readFileSync(at(`bundle/${ref}.head`))), ref) as Head
  const parts = new Map<number, Part>()
  head.parts.forEach((p, i) => {
    if (p) parts.set(i + 1, read('part', new Uint8Array(readFileSync(at(`bundle/${p}.part`))), p) as Part)
  })
  const dump = JSON.parse(readFileSync(at('de.reader.json'), 'utf8')) as ReaderDump
  const rows = (JSON.parse(readFileSync(at('de.rows.json'), 'utf8')) as { rows: Row[] }).rows
  return { head, parts, dump, rows }
}

describe("the Page fixtures, from a reader dump over the bundle's parts", () => {
  it('makes every unit the dump lays a laid member of its page, its crops its own elements', () => {
    const { parts, dump } = fixture('s1-columns')
    const pages = pagesOf(parts, dump, () => 'sans')
    const laid = [...pages.values()].flatMap((p) => p.members.filter((m) => m.state === 'laid'))
    expect(laid.length).toBe(dump.units.length)
    for (const m of laid) {
      expect(m.off & 1).toBe(1)
      expect(m.lines.length).toBeGreaterThan(0)
      expect(m.lit.left.length).toBe(m.lit.right.length)
    }
    const crops = laid.flatMap((m) => m.lines.flatMap((l) => l[3].filter((i) => 'src' in i)))
    expect(crops.length).toBe(dump.units.reduce((a, u) => a + (u.elements?.length ?? 0), 0))
    // (an element moved: its group off with the text's)
    expect(laid.filter((m) => m.off & 2).length).toBe(dump.units.filter((u) => u.elements?.length).length)
  })
  it("waits for the rows a page needs, and is the original's where none will come", () => {
    const { parts, dump, rows } = fixture('s1-columns')
    const pages = pagesOf(parts, dump, () => 'sans')
    const lay = fixtureLay(pages, parts)
    const part = parts.get(1) as Part
    const none = lay(part, { get: () => undefined, done: false })
    expect(none.wait.rows.length).toBeGreaterThan(0)
    expect(none.members.every((m) => m.state === 'waiting' && m.off === 0)).toBe(true)
    const all = new Map(rows.map((r) => [r.id, r]))
    const page = lay(part, { get: (id) => all.get(id), done: false })
    expect(page.wait.rows).toEqual([])
    expect(page).toBe(pages.get(1))
    const gone = lay(part, { get: () => undefined, done: true })
    expect(gone.wait.rows).toEqual([])
    expect(gone.members.every((m) => m.state !== 'laid' && m.off === 0)).toBe(true)
  })
})
