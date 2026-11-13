// A PDF.js document over a ByteSource (from the website's `openRanged`, W ranges.ts:826): the first chunk read here and given
// as the transport's initial data, the document's last chunks asked as soon as its length is known (PDF.js reads a file's
// startxref and cross-reference right after its first chunk), and every range PDF.js asks for read chunk by chunk through the
// source (the store shares and joins them) and given whole once its chunks are in. The source is not the document's:
// the original's is the reader's, shared by both documents; letting the document go stops its reads, not the source.
//
// PDF.js waits for a range it asked for ever: a range the source refuses (its answers not the object, a chunk not the head's,
// the network) is told to the owner (`refused`), who fails the page with it by letting the document go (W session/prefetch.ts
// prefetchDocument; reader-hosts-data §16). A source let go (`gone`) is never told.
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { RangeRefusal, type ByteSource } from './source.ts'
import { CHUNK } from './store.ts'

/** the chunks at a document's end asked beside its first: its trailer and cross-reference (2602.23285v2: its last 2 chunks
 *  were 3.11 to 3.65 s of a cold visit, one after the other, once its worker had started; W ranges.ts:35-37) */
const TAIL_CHUNKS = 2

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
  /** told once, where a range PDF.js asked for is refused (its first chunk's refusal rejects the promise instead): the page or
   *  the open waiting on it would wait for ever, so the owner lets the document go */
  refused?: (e: RangeRefusal) => void
}

/** PDF.js's document over `source`, ranges of CHUNK */
export function openRanged(lib: RangedLib, source: ByteSource, o: RangedOptions): RangedTask {
  let destroyed = false,
    told = false
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
      // (each chunk read through the source, so that the store shares and joins them; the range given whole, at its own begin:
      // PDF.js's transport stream finds the reader of a range by its begin and takes one answer for it)
      const parts: Promise<Uint8Array>[] = []
      for (let i = Math.floor(begin / CHUNK); i < Math.ceil(end / CHUNK); i++) parts.push(chunkOf(i, total))
      Promise.all(parts).then(
        (chunks) => {
          if (destroyed || cancelled) return
          const out =
            chunks.length === 1
              ? (chunks[0] as Uint8Array)
              : new Uint8Array(chunks.reduce((a, c) => a + c.byteLength, 0))
          if (chunks.length > 1) {
            let at = 0
            for (const c of chunks) {
              out.set(c, at)
              at += c.byteLength
            }
          }
          try {
            transport.onDataRange(begin, out)
          } catch {
            // (its reader let go meanwhile, PDF.js's own cancel: the bytes are no one's)
          }
        },
        (e) => {
          if (destroyed || cancelled || told || !(e instanceof RangeRefusal) || e.kind === 'gone') return
          told = true
          try {
            o.refused?.(e)
          } catch {
            /* the owner's own */
          }
        },
      )
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
