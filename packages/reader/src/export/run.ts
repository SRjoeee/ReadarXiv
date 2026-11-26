// The PDF download from what the open reader holds (reader.ts `export`): the original and the add-on read whole, once each
// (one ask of each object, never the store's ranges: the file holds every byte of them, PDF-READER §11.12), each held to its
// digest; every page laid (the composer's layAll: pages not yet laid are laid now, nothing drawn); the slices the pages' runs are
// drawn in fetched (the browser's cache holds those the page drew) and decoded by the reader's PDF.js; the object layer loaded
// (@cantoo/pdf-lib, the host's, as PDF.js is); then the file (chain.ts). Its share told as it goes: the bytes to 45 %, the
// pages to 75 %, the fonts to 85 %, the file the rest.
import { SMCP } from '@readarxiv/text'
import type { Page } from '../compose/page.ts'
import type { Composer } from '../compose/composer.ts'
import type { Served } from '../compose/served.ts'
import { type ExportForm, exportPdf, ExportRefusal, type Glyphs } from './chain.ts'
import type { SfntFont } from './fonts.ts'
import { fontsByPdfJs, type PdfJsLike } from './index.ts'
import { canvasMeasure, type Measure, offsetsOf } from './measure.ts'

export interface ReaderHandles {
  fetch: (url: string, init?: RequestInit) => Promise<Response>
  /** the original's and the add-on's addresses (the host's), their sizes and digests (the head's) */
  original: { url: string; bytes: number; sha256: string }
  addOn: { url: string; bytes: number; sha256: string }
  composer: Composer
  /** the composer's generation at the press: the file is of it, and stops where another comes (composer.ts layAll) */
  gen: number
  /** its target's tag, the lang the reader draws its translation in: a face's small capitals are shaped in its language system */
  lang: string
  served: Served
  pdfjs: PdfJsLike
  /** the export's own PDF.js worker (the reader's kit, its 'export' role over a port of the reader's): `open` gives
   *  getDocument's options with it, `close` ends it (#686: PDF.js's global worker is never set, and none is asked of the host) */
  worker: ExportWorker
  /** the object layer, loaded on the press (the host's @cantoo/pdf-lib) */
  pdfLib: () => Promise<unknown>
}

export interface ExportWorker {
  open(): Record<string, unknown>
  close(): void
}

/** the slices made fonts on the export's own PDF.js worker: opened for them and closed after, however their decoding ends (a
 *  failure, a cancel: the decoding document destroyed at the abort, its worker ended), so that no file leaves one behind */
export async function fontsOnWorker(
  pdfjs: PdfJsLike,
  worker: ExportWorker,
  files: readonly { key: string; woff2: Uint8Array }[],
  signal: AbortSignal,
): Promise<Map<string, SfntFont | null>> {
  const options = worker.open()
  try {
    return await fontsByPdfJs(files, pdfjs, { options, signal })
  } finally {
    worker.close()
  }
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const aborted = () => new ExportRefusal('aborted', 'the export was cancelled')

/** an object read whole into `out` at `at` (its share told as it comes), held to its size and its digest */
async function readWhole(
  h: Pick<ReaderHandles, 'fetch'>,
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
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (at + value.length > out.length) throw new Error(`${o.url}: more than its ${o.bytes} bytes`)
      out.set(value, at)
      at += value.length
      told(value.length)
    }
  } catch (e) {
    reader.cancel().catch(() => {})
    throw e
  }
  if (at !== out.length) throw new Error(`${o.url}: ${at} of its ${o.bytes} bytes`)
  if (hex(await crypto.subtle.digest('SHA-256', out)) !== o.sha256)
    throw new Error(`${o.url}: not the bytes its digest names`)
}

/** the original and the add-on read whole into one composed document, the add-on after arXiv's bytes (no copy of either is
 *  made), as one operation: a read that fails lets the other go (the operation's own controller, which the export's signal
 *  also stops), and its failure is told only once both reads have stopped, so that nothing is left reading after it (#685) */
export async function readComposed(
  h: Pick<ReaderHandles, 'fetch' | 'original' | 'addOn'>,
  signal: AbortSignal,
  told: (got: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const op = new AbortController()
  const stop = () => op.abort(signal.reason)
  if (signal.aborted) stop()
  else signal.addEventListener('abort', stop, { once: true })
  const composed = new Uint8Array(h.original.bytes + h.addOn.bytes)
  let failure: { e: unknown } | null = null
  const read = (o: ReaderHandles['original'], at: number) =>
    readWhole(h, o, { out: composed, at }, op.signal, told).catch((e: unknown) => {
      failure ??= { e }
      op.abort(e)
    })
  try {
    await Promise.allSettled([read(h.original, 0), read(h.addOn, h.original.bytes)])
  } finally {
    signal.removeEventListener('abort', stop)
  }
  if (failure) throw (failure as { e: unknown }).e
  return composed
}

/** the faces whose small capitals are their own, by their file's smcp feature (@readarxiv/text SMCP) */
const OWN_CAPS: ReadonlySet<string> = new Set(SMCP)
const CAPS = /^(italic )?small-caps /
/** each target's OpenType language system tag (OpenType's registry of language system tags, as HarfBuzz maps a BCP 47 tag to
 *  one): the system a browser shapes a run of the target's `lang` in (the reader draws a page's translation in its target's
 *  lang, compose/paint.ts svgOf) */
const OT_LANG: Readonly<Record<string, string>> = {
  bg: 'BGR ',
  cs: 'CSY ',
  de: 'DEU ',
  es: 'ESP ',
  fr: 'FRA ',
  id: 'IND ',
  it: 'ITA ',
  ja: 'JAN ',
  ko: 'KOR ',
  ms: 'MLY ',
  nl: 'NLD ',
  pl: 'PLK ',
  pt: 'PTG ',
  ru: 'RUS ',
  sv: 'SVE ',
  tr: 'TRK ',
  uk: 'UKR ',
  zh: 'ZHS ',
  'zh-TW': 'ZHT ',
}
/** a character's script as a browser itemizes a small capitals run (OpenType's tag): Greek and Cyrillic their own, any other
 *  (Latin, and the digits and marks a Latin run holds) Latin's */
const scriptOf = (cp: number) =>
  /\p{Script=Greek}/u.test(String.fromCodePoint(cp))
    ? 'grek'
    : /\p{Script=Cyrillic}/u.test(String.fromCodePoint(cp))
      ? 'cyrl'
      : 'latn'

/**
 * How a run's characters are drawn: each one's slice and its glyph there — the face's own small capital where the run asks
 * small capitals and the slice's face has its own (the reader's class draws a run so: font-variant-caps over the face's smcp,
 * font-synthesis none) — and where each stands, as the browser sets the run: a run that asks small capitals cut where the
 * face that holds a character turns from one with its own small capitals to one with none, each piece measured alone, in
 * small capitals or in lower case as its face draws it (the reader's measure, compose/served.ts partsOf); any other run
 * measured whole (measure.ts offsetsOf).
 */
export function glyphsFor(
  served: { sliceOf(font: string, cp: number): { path: string; face: string } | null },
  fonts: ReadonlyMap<string, SfntFont | null>,
  measure: Measure,
  lang = '',
): Glyphs {
  // (the target's language system, as the reader's drawing in its lang is shaped: #686, 4705749063)
  const ot = OT_LANG[lang] ?? OT_LANG[lang.split('-')[0] ?? ''] ?? null
  const ownAt = (face: string, cp: number) => OWN_CAPS.has(served.sliceOf(face, cp)?.face ?? '')
  return {
    glyph(face, cp) {
      const s = served.sliceOf(face, cp)
      const font = s ? fonts.get(s.path) : null
      const gid = font?.cmap.get(cp)
      if (!font || !gid) return null
      return {
        font,
        gid: CAPS.test(face) && OWN_CAPS.has(s?.face ?? '') ? (font.smcp(scriptOf(cp), ot).get(gid) ?? gid) : gid,
      }
    },
    offsets(face, text) {
      if (!CAPS.test(face)) return offsetsOf(measure, face, text)
      const plain = face.replace(CAPS, '$1')
      const out: number[] = []
      let start = 0
      for (let i = 0; i < text.length; ) {
        const own = ownAt(face, text.codePointAt(i) as number)
        let j = i
        while (j < text.length && ownAt(face, text.codePointAt(j) as number) === own)
          j += (text.codePointAt(j) as number) > 0xffff ? 2 : 1
        const piece = text.slice(i, j)
        const font = own ? face : plain
        for (const x of offsetsOf(measure, font, piece)) out.push(start + x)
        start += measure(font, piece)
        i = j
      }
      return out
    },
  }
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
  const composed = await readComposed(h, signal, told).catch((e: unknown) => {
    if (signal.aborted) throw aborted()
    throw e
  })
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
  const fonts = await fontsOnWorker(h.pdfjs, h.worker, files, signal).catch((e: unknown) => {
    if (signal.aborted) throw aborted()
    throw e
  })
  if (signal.aborted) throw aborted()
  share(0.75, 0.85)(1)
  const glyphs = glyphsFor(h.served, fonts, canvasMeasure(h.lang), h.lang)
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
