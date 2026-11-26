// Brotli streams decoded by the reader's own PDF.js, for the served slices' WOFF2 (export/woff2.ts): no decoder of ours is
// shipped. A browser's DecompressionStream has no brotli (Chromium 153, probed), and PDF.js (6.3.289, both hosts' pin) carries
// one for PDF's /BrotliDecode filter: each stream is an embedded file of a small document of ours with that filter, read back
// through PDF.js's public API (getAttachments, getAttachmentContent), decoded in PDF.js's worker: the worker the caller gives
// in getDocument's options (the reader's export worker, made over its own port: PDF.js's global worker is never set, and a
// document asked of PDF.js without one fails in a browser, #686). One document for every stream of a file. A stream that does
// not decode refuses the whole call: its slice would otherwise come back short. A cancel destroys the document at once.

import { cat } from './cff.ts'

/** the part of PDF.js this reads: its getDocument over bytes (and the options given: the worker) */
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; [option: string]: unknown }): {
    promise: Promise<{
      getAttachments(): Promise<unknown>
      getAttachmentContent?(id: string): Promise<Uint8Array | null | undefined>
      destroy?(): Promise<void>
    }>
    destroy?(): Promise<void>
  }
}

const enc = (s: string) => {
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255
  return b
}
const nameOf = (k: number) => `s${String(k).padStart(6, '0')}`

/** a document holding each stream as the embedded file `s000000`, `s000001`, … (names in order: a name tree's are sorted) */
export function brotliDocument(streams: Uint8Array[]): Uint8Array {
  const parts: Uint8Array[] = [enc('%PDF-2.0\n%\xe2\xe3\xcf\xd3\n')]
  const offs: number[] = []
  let at = parts[0]!.length
  const obj = (n: number, body: Uint8Array[]) => {
    offs[n] = at
    const b = cat([enc(`${n} 0 obj\n`), ...body, enc('\nendobj\n')])
    parts.push(b)
    at += b.length
  }
  const first = 4
  const names = streams.map((_, k) => `(${nameOf(k)}) ${first + 2 * k} 0 R`).join(' ')
  obj(1, [enc('<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 3 0 R >> >>')])
  obj(2, [enc('<< /Type /Pages /Kids [] /Count 0 >>')])
  obj(3, [enc(`<< /Names [${names}] >>`)])
  streams.forEach((s, k) => {
    const n = first + 2 * k
    obj(n, [enc(`<< /Type /Filespec /F (${nameOf(k)}) /UF (${nameOf(k)}) /EF << /F ${n + 1} 0 R >> >>`)])
    obj(n + 1, [
      enc(`<< /Type /EmbeddedFile /Filter /BrotliDecode /Length ${s.length} >>\nstream\n`),
      s,
      enc('\nendstream'),
    ])
  })
  const size = first + 2 * streams.length
  const xref = at
  let x = `xref\n0 ${size}\n0000000000 65535 f\r\n`
  for (let n = 1; n < size; n++) x += `${String(offs[n]).padStart(10, '0')} 00000 n\r\n`
  parts.push(enc(`${x}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`))
  return cat(parts)
}

/** a decoder of brotli streams by `pdfjs`, its document asked with `options` (getDocument's: the worker it runs on) and let
 *  go at `signal`'s abort: each stream's bytes, in order; it throws where one does not decode, or where it is cancelled */
export function brotliByPdfJs(
  pdfjs: PdfJsLike,
  o: { options?: Record<string, unknown>; signal?: AbortSignal } = {},
): (streams: Uint8Array[]) => Promise<Uint8Array[]> {
  return async (streams) => {
    if (!streams.length) return []
    const { signal } = o
    signal?.throwIfAborted()
    const task = pdfjs.getDocument({ ...o.options, data: brotliDocument(streams) })
    // (a cancel settles this call itself: PDF.js 6.3.289 leaves its loading promise pending when its task is destroyed once its
    // transport is set up, so a call waiting on it would never end, nor its worker be closed, nor the next file begin: #686,
    // 4706206031. Every wait is raced against the cancel, and the task let go without waiting on it)
    let cancel = () => {}
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(signal?.reason ?? new DOMException('the decoding was cancelled', 'AbortError'))
    })
    cancelled.catch(() => {})
    task.promise.catch(() => {})
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
    const until = <T>(p: Promise<T>): Promise<T> => (signal ? Promise.race([p, cancelled]) : p)
    try {
      const doc = await until(task.promise)
      await until(doc.getAttachments())
      const out: Uint8Array[] = []
      for (let k = 0; k < streams.length; k++) {
        const got = await until(doc.getAttachmentContent?.(nameOf(k)) ?? Promise.resolve(undefined))
        // (PDF.js gives an empty stream for one its filter refuses, with a warning): a brotli stream of data decodes to bytes
        if (!got?.length) throw new Error(`brotli stream ${k} did not decode`)
        out.push(got)
      }
      return out
    } finally {
      signal?.removeEventListener('abort', cancel)
      void Promise.resolve(task.destroy?.()).catch(() => {})
    }
  }
}
