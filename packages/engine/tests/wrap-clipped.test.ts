// @vitest-environment node
// A form whose paths a clip hides but one, that one a unit's ink: the page is wrapped, not refused (RED until the wrap reads
// a paint wholly outside the clip in force as the ink of no one, as the reading does).
//
// A logo drawn by \includegraphics[trim=…,clip]{…} is a form whose own stream paints every path of the file it was cut from;
// the clip TeX writes around it shows a few. The page's reading (ink.ts pageInk: each box cut to the clip in force, one wholly
// outside it left out) gives a box to the paths it shows alone, so the ownership can give those to a unit (here, as the
// ownership gives them, the text of the line the logo stands in) and the others to no one: they have no box to give. The wrap
// (wrap.ts wrapPage, the forms' groups) then counts each hidden path as ink no unit owns beside the owned one, `a form partly
// owned`, and refuses the whole page: every unit on it is drawn as the original's (2611.18114v1's first page: its title,
// abstract and introduction, for one path of a logo in its affiliations). A path no one can see is nothing to hide or to keep.
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { pageInk } from '../src/ink.ts'
import { alignOf } from '../src/remove.ts'
import { planOf, wrapOf } from '../src/wrap.ts'

const OPTIONS = { verbosity: 0, useSystemFonts: false, isEvalSupported: false, fontExtraProperties: true }
const O = OPS as unknown as Record<string, number>
const deflate = (b: Uint8Array) => new Uint8Array(deflateSync(b, { level: 6 }))
const inflate = (b: Uint8Array, limit: number) => new Uint8Array(inflateSync(b, { maxOutputLength: limit + 1 }))

/** one page painting one form (`form`: its stream) at (72, 600); every box the reading gives is the group `0.1.t`'s */
async function wrapForm(form: string) {
  const doc = await PL.PDFDocument.create()
  const page = doc.addPage([612, 792])
  const fm = doc.context.register(
    doc.context.stream(form, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 400, 400], Resources: {} }),
  )
  page.node.set(PL.PDFName.of('Resources'), doc.context.obj({ XObject: { Fm: fm } }))
  page.node.set(PL.PDFName.of('Contents'), doc.context.register(doc.context.stream('q 1 0 0 1 72 600 cm /Fm Do Q')))
  const bytes = new Uint8Array(await doc.save({ useObjectStreams: false }))
  const task = getDocument({ ...OPTIONS, data: bytes.slice() })
  const pdf = await task.promise
  const pg = await pdf.getPage(1)
  const ops = await pg.getOperatorList()
  const ink = pageInk(
    O,
    ops as never,
    pg.commonObjs as never,
    { rotate: 0, indices: true, turned: true } as never,
  ) as unknown as {
    glyphs: { n?: number; k?: number }[]
    paths?: number[]
  }
  const facts = alignOf(O, ops as never)
  await task.destroy()
  const paths = ink.paths ?? []
  const plan = planOf(
    ink.glyphs as never,
    [],
    paths,
    paths.map(() => '0.1.t'),
    facts as never,
  )
  const made = (await wrapOf(bytes, new Map([[1, { facts, ...plan } as never]]), {
    PL: PL as never,
    deflate,
    inflate,
  })) as unknown as {
    pages: Map<number, { ok: boolean; why?: string }>
  }
  return { boxes: paths.length, page: made.pages.get(1) }
}

describe('a form whose paths a clip hides but one, that one owned', () => {
  it('the control: a form of one path, owned, is wrapped', async () => {
    const r = await wrapForm('10 10 20 20 re f')
    expect(r.boxes).toBe(1)
    expect(r.page).toMatchObject({ ok: true })
  })
  it('the reading gives a box to the path the clip shows alone', async () => {
    const r = await wrapForm('0 0 50 50 re W n 10 10 20 20 re f 200 200 20 20 re f 300 10 20 20 re f')
    expect(r.boxes).toBe(1)
  })
  it('the page is wrapped: the paths wholly outside the clip are no ink of anyone', async () => {
    const r = await wrapForm('0 0 50 50 re W n 10 10 20 20 re f 200 200 20 20 re f 300 10 20 20 re f')
    expect(r.page?.why).toBeUndefined()
    expect(r.page).toMatchObject({ ok: true })
  })
})
