// A PDF.js document over a ByteSource (from the website's `openRanged`, W ranges.ts:826): the first chunk read here and given
// as the transport's initial data, the document's last chunks asked as soon as its length is known (PDF.js reads a file's
// startxref and cross-reference right after its first chunk), and every range PDF.js asks for read chunk by chunk through the
// source and given to it a chunk at a time, so that a page waits only for its own chunks. The source is not the document's:
// the original's is the reader's, shared by both documents; letting the document go stops its reads, not the source.
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import type { ByteSource } from './source.ts'
import { CHUNK } from './store.ts'

/** the chunks at a document's end asked beside its first: its trailer and cross-reference (2602.23285v2: its last 2 chunks
 *  were 3.11 to 3.65 s of a cold visit, one after the other, once its worker had started; W ranges.ts:35-37) */
export const TAIL_CHUNKS = 2

/** what of PDF.js a ranged open needs */
export interface RangedLib {
  getDocument(src: Record<string, unknown>): PDFDocumentLoadingTask
  PDFDataRangeTransport: new (length: number, initialData: Uint8Array | null) => RangeTransport
}
interface RangeTransport {
  requestDataRange(begin: number, end: number): void
  onDataRange(begin: number, chunk: Uint8Array): void
  abort(): void
}

export interface RangedTask {
  /** the document; rejected where the source is refused before it opens, or PDF.js cannot read it */
  readonly promise: Promise<PDFDocumentProxy>
  /** whether the document has opened */
  readonly opened: boolean
  /** told the bytes PDF.js has of the document, as it gets them */
  onProgress: ((p: { loaded: number; total: number }) => void) | null
  /** the document let go: its reads stopped (the source lives on), its loading task destroyed */
  destroy(): Promise<void>
}

export interface RangedOptions {
  /** getDocument's other options: the kit's (cMapUrl, standardFontDataUrl, wasmUrl, enableHWA, …) and the document's worker */
  options: Record<string, unknown>
}

/** PDF.js's document over `source`, ranges of CHUNK */
export function openRanged(lib: RangedLib, source: ByteSource, o: RangedOptions): RangedTask {
  let destroyed = false
  let task: PDFDocumentLoadingTask | null = null
  /** the chunks asked before PDF.js asks them (the document's end), by index */
  const early = new Map<number, Promise<Uint8Array>>()
  let reject: (e: unknown) => void = () => {}
  const self: RangedTask = {
    promise: null as unknown as Promise<PDFDocumentProxy>,
    opened: false,
    onProgress: null,
    async destroy() {
      destroyed = true
      reject(new Error('the document was let go'))
      early.clear()
      await task?.destroy()
    },
  }
  const chunkOf = (i: number, total: number): Promise<Uint8Array> => {
    const e = early.get(i)
    if (e) {
      early.delete(i)
      return e
    }
    return source.read(i * CHUNK, Math.min((i + 1) * CHUNK, total))
  }
  const opening = (async () => {
    const first = await source.read(0, source.bound ? Math.min(CHUNK, source.bound.total) : CHUNK)
    const bound = source.bound
    if (!bound) throw new Error('the source told no length')
    const total = bound.total
    if (destroyed) throw new Error('the document was let go')
    // (the document's end, asked beside its first chunk: read once PDF.js asks it, or let go with the document)
    const last = Math.ceil(total / CHUNK)
    for (let i = Math.max(1, last - TAIL_CHUNKS); i < last; i++) {
      const p = source.read(i * CHUNK, Math.min((i + 1) * CHUNK, total))
      p.catch(() => {})
      early.set(i, p)
    }
    const transport = new lib.PDFDataRangeTransport(total, first.byteLength >= Math.min(CHUNK, total) ? first : null)
    let cancelled = false
    transport.requestDataRange = (begin: number, end: number) => {
      for (let i = Math.floor(begin / CHUNK); i < Math.ceil(end / CHUNK); i++) {
        chunkOf(i, total).then(
          (chunk) => {
            if (destroyed || cancelled) return
            try {
              transport.onDataRange(i * CHUNK, chunk)
            } catch {
              // (its reader let go meanwhile, PDF.js's own cancel: the bytes are no one's)
            }
          },
          () => {},
        )
      }
    }
    transport.abort = () => {
      cancelled = true
    }
    // disableStream: ranges alone, never a stream of the file from its first byte; disableAutoFetch: a document reads what its
    // pages need and never the rest of the file behind them (W pdfjs.ts:213-224, the measured options)
    task = lib.getDocument({
      ...o.options,
      range: transport,
      rangeChunkSize: CHUNK,
      disableStream: true,
      disableAutoFetch: true,
    })
    task.onProgress = (p: { loaded: number; total: number }) => self.onProgress?.(p)
    return task.promise
  })()
  ;(self as { promise: Promise<PDFDocumentProxy> }).promise = new Promise((resolve, rej) => {
    reject = rej
    opening.then((doc) => {
      ;(self as { opened: boolean }).opened = true
      resolve(doc)
    }, rej)
  })
  return self
}
