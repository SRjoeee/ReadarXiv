// @vitest-environment node
// The translate equivalence check's records and today's typing of them (lab/translate/records.ts): today's typing is written
// once over a capture (today-typed.ts, while today's engine runs) and read by equivalence.ts in its place; read over another
// capture, or of another format, it is refused rather than compared with records it was not made of. Synthetic records in a
// temporary folder.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { keyOf, recordsOf, type Typed, typedFile, typedOf } from '../../lab/translate/records.ts'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const capture = (lines: object[]) => {
  const d = mkdtempSync(join(tmpdir(), 'translate-records-'))
  dirs.push(d)
  const f = join(d, 'capture.jsonl')
  writeFileSync(f, `${lines.map(l => JSON.stringify(l)).join('\n')}\n`)
  return f
}
const html = { src: 'html', format: 'tags', wire: 'a <x id="1"/> b', reply: 'A <x id="1"/> B', today: true }
const pdf = { src: 'pdf', format: 'markers', kind: 'para', pieces: [{ t: 'text', s: 'x' }], wire: 'x', reply: 'y', today: true }

describe("today's typing of the equivalence check's records", () => {
  it("reads the capture's records, then the web's table", () => {
    const records = recordsOf(capture([html, pdf]))
    expect(records.slice(0, 2).map(r => r.src)).toEqual(['html', 'pdf'])
    expect(records.slice(2).every(r => r.src === 'web')).toBe(true)
    expect(records.length).toBe(12)
  })
  it("gives each record its frozen typing by its key, none for a record it was not made of", () => {
    const c = capture([html, pdf])
    const [h, p] = recordsOf(c) as [ReturnType<typeof recordsOf>[number], ReturnType<typeof recordsOf>[number]]
    const typed: [string, Typed][] = [
      [keyOf(h), { unit: { id: 'u', content: [{ t: 'text', s: 'a ' }] }, notes: [], order: [1] }],
      [keyOf(p), { skip: true }],
    ]
    const f = join(c, '..', 'today.json')
    writeFileSync(f, JSON.stringify(typedFile(c, typed)))
    const of = typedOf(f, c)
    expect(of(h)).toEqual(typed[0]?.[1])
    expect(of(p)).toEqual({ skip: true })
    expect(of({ ...h, reply: 'C' })).toBeUndefined()
  })
  it('refuses a typing made over another capture, or of another format', () => {
    const c = capture([html])
    const other = capture([html, pdf])
    const f = join(c, '..', 'today.json')
    writeFileSync(f, JSON.stringify(typedFile(other, [])))
    expect(() => typedOf(f, c)).toThrow(/another capture/)
    writeFileSync(f, JSON.stringify({ ...typedFile(c, []), format: 'readarxiv-equivalence-today 0' }))
    expect(() => typedOf(f, c)).toThrow(/format/)
  })
})
