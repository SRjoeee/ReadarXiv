// @vitest-environment node
// The bake (export/bake.ts): a page's content with the ink of the groups the reader turns off taken out of the stream, on the
// engine's walk (each show's codes and text state as the remover reads them): a show becomes the advance it made, a painted
// path and an image go, a clip stays a clip, our own marks go. A document of our own (pdf-build.ts).
import * as PL from '@cantoo/pdf-lib'
import { openRemover, type PdfLib } from '@readarxiv/engine'
import { describe, expect, it } from 'vitest'
import { type BakeStats, makeBaker, newBakeStats } from '../../src/export/bake.ts'
import { latin1, pdf } from './pdf-build.ts'

const W: Record<string, number> = { ' ': 278, H: 722, e: 556, l: 222, o: 556 }
const widths = Array.from({ length: 95 }, (_, k) => W[String.fromCharCode(32 + k)] ?? 500)
const content = [
  'BT /F1 10 Tf 1 Tc 72 700 Td /OC /G0 BDC (Hello) Tj EMC ( World) Tj ET',
  '/OC /G0 BDC 0 0 m 10 10 l S 5 5 20 20 re W n /Im Do EMC',
  '/OC /G1 BDC BT /F1 10 Tf (Kept) Tj ET EMC',
  'BT /F2 10 Tf 72 650 Td /OC /G0 BDC (NoWidth) Tj EMC ET',
].join('\n')
const doc = () =>
  pdf([
    '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [6 0 R 7 0 R] /D << /BaseState /ON >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> /Properties << /G0 6 0 R /G1 7 0 R >> /XObject << /Im 9 0 R >> >> /Contents 4 0 R >>',
    { dict: '', data: content },
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /Widths [${widths.join(' ')}] >>`,
    '<< /Type /OCG /Name (axt:1.1.t) >>',
    '<< /Type /OCG /Name (axt:2.1.t) >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    {
      dict: '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8',
      data: '\x80',
    },
  ])

async function baked(ours: (prop: string) => boolean | null, dropFree = false): Promise<[string, BakeStats]> {
  const R = await openRemover(doc(), { PL: PL as unknown as PdfLib })
  const st = newBakeStats()
  const out = makeBaker(R).bake(0, ours, st, dropFree)
  expect(out).not.toBeNull()
  return [latin1(out as Uint8Array), st]
}
const offG0 = (p: string) => (p === 'G0' ? true : p === 'G1' ? false : null)

describe('the bake', () => {
  it('turns a show in a group turned off into the advance it made, at the text state of the moment (its spacing too)', async () => {
    const [s] = await baked(offG0)
    expect(s).not.toContain('(Hello)')
    // H e l l o: 2278 thousandths of 10, and 1 of character spacing after each of the five
    expect(s).toContain('[-2778] TJ')
    expect(s).toContain('( World) Tj')
  })

  it('drops a painted path and an image of a group off, keeps a clip as a clip', async () => {
    const [s, st] = await baked(offG0)
    expect(s).not.toMatch(/10 10 l\s+S/)
    expect(s).not.toContain('/Im Do')
    expect(s).toMatch(/5 5 20 20 re\s+W\s+n/)
    expect([st.paints, st.images, st.clipsKept]).toEqual([1, 1, 1])
  })

  it('keeps the ink of a group of ours left on, and drops our own marks either way', async () => {
    const [s] = await baked(offG0)
    expect(s).toContain('(Kept) Tj')
    expect(s).not.toContain('/G0 BDC')
    expect(s).not.toContain('/G1 BDC')
  })

  it('leaves a show whose widths cannot be read in place, drawn invisibly, rather than move what follows it', async () => {
    const [s, st] = await baked(offG0)
    expect(s).toMatch(/3 Tr\s+\(NoWidth\) Tj\s+0 Tr/)
    expect([st.shows, st.showsUnknown]).toEqual([2, 1])
  })

  it("for a crop's source, keeps a group's ink alone: every other group and the ink in none dropped", async () => {
    const [s] = await baked((p) => (p === 'G1' ? false : p === 'G0' ? true : null), true)
    expect(s).toContain('(Kept) Tj')
    expect(s).not.toContain('( World) Tj')
    expect(s).not.toContain('(Hello)')
  })
})
