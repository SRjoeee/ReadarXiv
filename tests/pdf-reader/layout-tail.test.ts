// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { startxrefOf, tailLinks } from '@/pdf-reader/engine/layout/tail.mjs'
import { fromBase64 } from '@/pdf-reader/engine/layer-proto/units.mjs'

// The add-on's tail read from its bytes (layout/tail.mjs, today's form: the remover's, layout/remove.mjs): the CC0 sample's
// real tail (a cross-reference stream) and a classic section written as the remover writes it

const SAMPLE = 'tests/fixtures/pdf/sample-1'
const bytes = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
const sampleBundle = JSON.parse(readFileSync(`${SAMPLE}/bundle.json`, 'utf8')) as { addon: { tail: string }; base: { bytes: number } }
const sampleTail = fromBase64(sampleBundle.addon.tail, 1 << 20, 'tail')

/** a classic update: some objects, then `xref`, one subsection a number, the trailer, `startxref` and the end marker */
function classic(numbers: number[], prev: number, at: number): Uint8Array {
  const table = numbers.map(n => `${n} 1\n${String(100 + n).padStart(10, '0')} 00000 n\r\n`).join('')
  return bytes(`\n3 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\nxref\n${table}trailer\n<< /Size ${Math.max(...numbers) + 1} /Root 1 0 R /Prev ${prev} >>\nstartxref\n${at}\n%%EOF\n`)
}

describe('tailLinks', () => {
  it('reads the sample\'s real tail (a cross-reference stream): where it starts, what it follows, the root and the fresh run', () => {
    const links = tailLinks(sampleTail)
    expect(links).toEqual({ startxref: 212869, prev: 212001, root: 68, first: 186, last: 187 })
    // (the section lies inside the tail, which follows arXiv's bytes)
    expect(links!.startxref).toBeGreaterThanOrEqual(sampleBundle.base.bytes)
    expect(links!.startxref).toBeLessThan(sampleBundle.base.bytes + sampleTail.length)
  })

  it('reads a classic section: the least number the root, the others the fresh run', () => {
    expect(tailLinks(classic([12, 300, 301, 305], 5000, 7000))).toEqual({ startxref: 7000, prev: 5000, root: 12, first: 300, last: 305 })
  })

  it('is null for what ends in no such section, and never throws', () => {
    expect(tailLinks(new Uint8Array(0))).toBeNull()
    expect(tailLinks(bytes('startxref\n12\n%%EOF\n'))).toBeNull()
    expect(tailLinks(sampleTail.subarray(0, sampleTail.length - 6))).toBeNull()
    expect(tailLinks(classic([12], 5000, 7000))).toBeNull()
    expect(tailLinks(bytes('\nxref\n12 1\n0000000112 00000 n\r\ntrailer\n<< /Size 13 >>\nstartxref\n9\n%%EOF\n'))).toBeNull()
    // a table that does not reach its trailer, a count past its bytes, no /Prev
    expect(tailLinks(bytes('\nxref\n12 2\n0000000112 00000 n\r\ntrailer\n<< /Prev 1 >>\nstartxref\n9\n%%EOF\n'))).toBeNull()
    expect(tailLinks(bytes('\nxref\n12 1\n0000000112 00000 n\r\n300 1\n0000000412 00000 n\r\ntrailer\n<< /Size 301 >>\nstartxref\n9\n%%EOF\n'))).toBeNull()
    expect(tailLinks('not bytes' as unknown as Uint8Array)).toBeNull()
  })

  it('looks at the last 256 KiB only', () => {
    const big = new Uint8Array(300 * 1024 + sampleTail.length)
    big.fill(0x20)
    big.set(sampleTail, 300 * 1024)
    expect(tailLinks(big)).toEqual(tailLinks(sampleTail))
  })
})

describe('startxrefOf', () => {
  it('is the number before the final %%EOF of the PDF, as the remover reads it', () => {
    const pdf = new Uint8Array(readFileSync(`${SAMPLE}/sample-1.pdf`))
    const n = startxrefOf(pdf)
    expect(n).toBe(212001)
    expect(sampleTail.length).toBe(406)
    expect(n!).toBeLessThan(pdf.length)
  })

  it('is the number after the last startxref where the file does not end in %%EOF, and null where there is none', () => {
    expect(startxrefOf(bytes('%PDF-1.4\n...startxref\n77\n%%EOF\n'))).toBe(77)
    expect(startxrefOf(bytes('startxref\n5\n%%EOF\nstartxref\n88\ngarbage'))).toBe(88)
    expect(startxrefOf(bytes('%PDF-1.4\nno section'))).toBeNull()
  })
})
