// The PDF download from what the open reader holds (reader.ts `export`): the original and the add-on read whole, once each
// (one ask of each object, never the store's ranges: the file holds every byte of them, PDF-READER §11.12), each held to its
// digest; every page laid (the composer's layAll: pages not yet laid are laid now, nothing drawn); the slices the pages' runs are
// drawn in fetched (the browser's cache holds those the page drew) and decoded by the reader's PDF.js; the object layer loaded
// (@cantoo/pdf-lib, the host's, as PDF.js is); then the file (chain.ts). Its share told as it goes: the bytes to 45 %, the
// pages to 75 %, the fonts to 85 %, the file the rest.
import type { Page } from '../compose/page.ts'
import type { Composer } from '../compose/composer.ts'
import type { Served } from '../compose/served.ts'
import { type ExportForm, exportPdf, ExportRefusal, type Glyphs } from './chain.ts'
import type { SfntFont } from './fonts.ts'
import { fontsByPdfJs, type PdfJsLike } from './index.ts'
import { canvasMeasure, offsetsOf } from './measure.ts'

export interface ReaderHandles {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  /** the original's and the add-on's addresses (the host's), their sizes and digests (the head's) */
  original: { url: string; bytes: number; sha256: string }
  addOn: { url: string; bytes: number; sha256: string }
  composer: Composer
  /** the composer's generation at the press: the file is of it, and stops where another comes (composer.ts layAll) */
  gen: number
  served: Served
  pdfjs: PdfJsLike
  /** the object layer, loaded on the press (the host's @cantoo/pdf-lib) */
  pdfLib: () => Promise<unknown>
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const aborted = () => new ExportRefusal('aborted', 'the export was cancelled')

/** an object read whole into `out` at `at` (its share told as it comes), held to its size and its digest */
async function readWhole(
  h: ReaderHandles,
  o: { url: string; bytes: number; sha256: string },
  into: { out: Uint8Array<ArrayBuffer>; at: number },
  signal: AbortSignal,
  told: (got: number) => void,
): Promise<void> {
  const r = await h.fetch(o.url, { signal })
  if (!r.ok || !r.body) throw new Error(`${o.url}: answered ${r.status}`)
  const out = into.out.subarray(into.at, into.at + o.bytes)
  let at = 0
  const reader = r.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (at + value.length > out.length) throw new Error(`${o.url}: more than its ${o.bytes} bytes`)
    out.set(value, at)
    at += value.length
    told(value.length)
  }
  if (at !== out.length) throw new Error(`${o.url}: ${at} of its ${o.bytes} bytes`)
  if (hex(await crypto.subtle.digest('SHA-256', out)) !== o.sha256)
    throw new Error(`${o.url}: not the bytes its digest names`)
}

/** the Latin ligatures a face may hold at their compatibility code points, which the chain draws for their letters */
const LIGATURES = [0xfb00, 0xfb01, 0xfb02, 0xfb03, 0xfb04]

export async function exportFromReader(
  h: ReaderHandles,
  form: ExportForm,
  o: { signal: AbortSignal; progress: (share: number) => void },
): Promise<Uint8Array[]> {
  const { signal } = o
  const share = (from: number, to: number) => (part: number) => o.progress(from + (to - from) * Math.min(1, part))
  // ---- the bytes
  const total = h.original.bytes + h.addOn.bytes
  let got = 0
  const bytesShare = share(0, 0.45)
  const told = (n: number) => {
    got += n
    bytesShare(got / total)
  }
  // (both read into the one composed document, the add-on after arXiv's bytes: no copy of either is made)
  const composed = new Uint8Array(total)
  await Promise.all([
    readWhole(h, h.original, { out: composed, at: 0 }, signal, told),
    readWhole(h, h.addOn, { out: composed, at: h.original.bytes }, signal, told),
  ])
  if (signal.aborted) throw aborted()
  // ---- the pages
  const pagesShare = share(0.45, 0.75)
  let pages: Map<number, Page> | null
  try {
    pages = await h.composer.layAll({ signal, gen: h.gen, progress: (d, n) => pagesShare(d / n) })
  } catch (e) {
    if (signal.aborted) throw aborted()
    throw e
  }
  if (!pages) throw new Error('no layer to lay')
  // ---- the slices the runs are drawn in, made fonts
  const paths = new Map<string, string>()
  for (const p of pages.values())
    for (const m of p.members)
      if (m.state === 'laid')
        for (const [, , , items] of m.lines)
          for (const it of items) {
            if ('src' in it) continue
            for (const ch of it.s) {
              const s = h.served.sliceOf(it.face, ch.codePointAt(0) as number)
              if (s) paths.set(s.path, s.key)
            }
            for (const cp of LIGATURES) {
              const s = h.served.sliceOf(it.face, cp)
              if (s) paths.set(s.path, s.key)
            }
          }
  const files = await Promise.all(
    [...paths.keys()].map(async (path) => ({ key: path, woff2: await h.served.sliceBytes(path, signal) })),
  ).catch((e) => {
    if (signal.aborted) throw aborted()
    throw e
  })
  if (signal.aborted) throw aborted()
  const fonts: Map<string, SfntFont | null> = await fontsByPdfJs(files, h.pdfjs)
  if (signal.aborted) throw aborted()
  share(0.75, 0.85)(1)
  // ---- how a run's characters are drawn: the slice of each, its glyph; where each stands, as the browser sets the run
  const measure = canvasMeasure()
  const glyphs: Glyphs = {
    glyph(face, cp) {
      const s = h.served.sliceOf(face, cp)
      const font = s ? fonts.get(s.path) : null
      const gid = font?.cmap.get(cp)
      return font && gid ? { font, gid } : null
    },
    offsets: (face, text) => offsetsOf(measure, face, text),
  }
  // ---- the file
  const PL = await h.pdfLib()
  const fileShare = share(0.85, 1)
  const r = await exportPdf({
    composed,
    seam: h.original.bytes,
    pages,
    glyphs,
    PL: PL as never,
    form,
    signal,
    progress: (d, n) => fileShare(d / n),
  })
  return r.parts
}
