// @vitest-environment node
// The bake (export/bake.ts): a page's content with the ink of the groups the reader turns off taken out of the stream, on the
// engine's walk (each show's codes and text state as the remover reads them): a show becomes the advance it made, a painted
// path and an image go, a clip stays a clip, our own marks go. A document of our own (pdf-build.ts).
import { deflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { openObjects, openRemover, type PdfLib } from '@readarxiv/engine'
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

describe("the bake reads the page through the export's own objects, nothing of the document loaded whole (round 3, memory)", () => {
  it('bakes the same bytes over openObjects as over the loaded document, with an object layer that cannot load one', async () => {
    const [over] = await baked(offG0)
    // (an object layer whose whole-document load throws: the walk must not ask it)
    const NoLoad = {
      ...(PL as unknown as PdfLib),
      PDFDocument: {
        load: () => {
          throw new Error('the whole document loaded')
        },
      },
    } as unknown as PdfLib
    const X = openObjects(doc(), { PL: NoLoad, objectsMax: 1e5, decodedMax: 1 << 24 })
    const W = await openRemover(X, { PL: NoLoad })
    const st = newBakeStats()
    const out = makeBaker(W).bake(0, offG0, st)
    expect(out && latin1(out)).toBe(over)
    expect(W.numPages).toBe(1)
  })
})

describe("a stream whose filters are named by reference, read through the export's objects (#686: 4705748788)", () => {
  // (the page's content deflated, its /Filter an array whose entry is an indirect name, and its /DecodeParms an indirect
  // dictionary: the object view parses a dictionary where no object is held, so its filters are looked up through the view)
  const indirect = () =>
    pdf([
      '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [6 0 R 7 0 R] /D << /BaseState /ON >> >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> /Properties << /G0 6 0 R /G1 7 0 R >> /XObject << /Im 9 0 R >> >> /Contents 4 0 R >>',
      { dict: '/Filter [10 0 R] /DecodeParms [11 0 R]', data: new Uint8Array(deflateSync(Buffer.from(content))) },
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /Widths [${widths.join(' ')}] >>`,
      '<< /Type /OCG /Name (axt:1.1.t) >>',
      '<< /Type /OCG /Name (axt:2.1.t) >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
      {
        dict: '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8',
        data: '\x80',
      },
      '/FlateDecode',
      '<< /Predictor 1 >>',
    ])
  it('bakes it as the whole load does', async () => {
    const [plainBake] = await baked(offG0)
    const X = openObjects(indirect(), { PL: PL as unknown as PdfLib, objectsMax: 1e5, decodedMax: 1 << 24 })
    const st = newBakeStats()
    const out = makeBaker(await openRemover(X, { PL: PL as unknown as PdfLib })).bake(0, offG0, st)
    expect(out && latin1(out)).toBe(plainBake)
    const whole = makeBaker(await openRemover(indirect(), { PL: PL as unknown as PdfLib })).bake(
      0,
      offG0,
      newBakeStats(),
    )
    expect(whole && latin1(whole)).toBe(plainBake)
  })
})

/** `text` LZW-coded as PDF's LZWDecode reads it with `early` its EarlyChange: codes from 9 bits, a clear first and an end last */
function lzw(text: string, early: 0 | 1): Uint8Array {
  const out: number[] = []
  let acc = 0,
    bits = 0,
    width = 9
  const put = (code: number) => {
    acc = (acc << width) | code
    bits += width
    while (bits >= 8) {
      out.push((acc >> (bits - 8)) & 255)
      bits -= 8
    }
    acc &= (1 << bits) - 1
  }
  const dict = new Map<string, number>()
  for (let c = 0; c < 256; c++) dict.set(String.fromCharCode(c), c)
  let next = 258
  put(256)
  let w = ''
  for (const c of text) {
    if (dict.has(w + c)) {
      w += c
      continue
    }
    put(dict.get(w)!)
    dict.set(w + c, next++)
    // (the reader adds an entry a code later than the writer: it reads the next code wider once its own next entry and the
    // early change reach a power of two)
    const t = next - 1 + early
    if ((t & (t - 1)) === 0 && width < 12) width++
    w = c
  }
  put(dict.get(w)!)
  put(257)
  if (bits) out.push((acc << (8 - bits)) & 255)
  return new Uint8Array(out)
}

describe("a stream's decoding parameters named by reference, read through the export's objects (#686: 4706206060)", () => {
  // (the page's content LZW-coded with an early change of 0, which its parameters name by reference: read as 1, the default,
  // the codes go wrong where they widen and the text after is lost)
  const long = `${content}\n${Array.from({ length: 120 }, (_, i) => `q 1 0 0 1 ${i * 7} ${i * 13 + 5} cm Q`).join('\n')}`
  const lzwDoc = (parms: string) =>
    pdf([
      '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [6 0 R 7 0 R] /D << /BaseState /ON >> >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 8 0 R >> /Properties << /G0 6 0 R /G1 7 0 R >> /XObject << /Im 9 0 R >> >> /Contents 4 0 R >>',
      { dict: `/Filter /LZWDecode /DecodeParms ${parms}`, data: lzw(long, 0) },
      `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 32 /LastChar 126 /Widths [${widths.join(' ')}] >>`,
      '<< /Type /OCG /Name (axt:1.1.t) >>',
      '<< /Type /OCG /Name (axt:2.1.t) >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
      {
        dict: '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8',
        data: '\x80',
      },
      '0',
    ])
  const L2 = PL as unknown as PdfLib
  const stOf = (R: { look(v: unknown): unknown }, X: ReturnType<typeof openObjects>) =>
    R.look(X.pages()[0]!.node.get(L2.PDFName.of('Contents')) as never)
  it('decodes it through the objects as the whole load does, and the whole load as it always has', async () => {
    // (the code, checked first where the parameter is direct: both readings give the content back)
    for (const parms of ['<< /EarlyChange 0 >>', '<< /EarlyChange 10 0 R >>']) {
      const bytes = lzwDoc(parms)
      const X = openObjects(bytes, { PL: L2, objectsMax: 1e5, decodedMax: 1 << 24 })
      const W = await openRemover(X, { PL: L2 })
      const R = await openRemover(bytes, { PL: L2 })
      const whole = R.decode(R.look(R.doc.getPages()[0]!.node.get(L2.PDFName.of('Contents')))!)
      expect(latin1(whole), `the whole load, ${parms}`).toBe(long)
      // (the prepare's own path: the object layer's decoder itself, on the loaded document's stream, byte for byte)
      const st = R.look(R.doc.getPages()[0]!.node.get(L2.PDFName.of('Contents'))) as never
      const own = L2.decodePDFRawStream(st).decode()
      expect(latin1(own), `the object layer's own decoder, ${parms}`).toBe(latin1(whole))
      expect(latin1(W.decode(stOf(W, X) as never)), `through the objects, ${parms}`).toBe(long)
    }
  })
})
