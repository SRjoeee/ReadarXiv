// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { startxrefOf } from '@/pdf-reader/engine/layout/tail.mjs'

// A PDF's `startxref` read from its bytes (layout/tail.mjs): the CC0 sample's, and the forms a section may end in

const SAMPLE = 'tests/fixtures/pdf/sample-1'
const bytes = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))

describe('startxrefOf', () => {
  it('is the number before the final %%EOF of the PDF', () => {
    const pdf = new Uint8Array(readFileSync(`${SAMPLE}/sample-1.pdf`))
    const n = startxrefOf(pdf)
    expect(n).toBe(211305)
    expect(n!).toBeLessThan(pdf.length)
  })

  it('is the number after the last startxref where the file does not end in %%EOF, and null where there is none', () => {
    expect(startxrefOf(bytes('%PDF-1.4\n...startxref\n77\n%%EOF\n'))).toBe(77)
    expect(startxrefOf(bytes('startxref\n5\n%%EOF\nstartxref\n88\ngarbage'))).toBe(88)
    expect(startxrefOf(bytes('%PDF-1.4\nno section'))).toBeNull()
  })
})
