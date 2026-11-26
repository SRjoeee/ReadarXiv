// @vitest-environment node
// Brotli streams decoded by the reader's own PDF.js (export/brotli.ts): each one an embedded file of a document of ours with the
// /BrotliDecode filter, read back by PDF.js's public API. Data of our own, compressed by Node's zlib.
import { brotliCompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { brotliByPdfJs } from '../../src/export/brotli.ts'

describe("brotli by the reader's PDF.js", () => {
  it('gives every stream back decoded, in order, in one document', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const texts = ['the first stream '.repeat(50), 'a second, shorter one', 'x'.repeat(70_000)]
    const streams = texts.map((t) => new Uint8Array(brotliCompressSync(Buffer.from(t))))
    const decode = brotliByPdfJs(pdfjs)
    const out = await decode(streams)
    expect(out.map((b) => Buffer.from(b).toString())).toEqual(texts)
  })

  it('refuses a stream that is no brotli, rather than give it back short or empty', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const decode = brotliByPdfJs(pdfjs)
    await expect(decode([new Uint8Array([1, 2, 3, 4, 5])])).rejects.toThrow()
  })
})

/** a PDF.js of our own: every document it is asked for recorded with its options; its loading never ends until destroyed */
function hangingPdfJs() {
  const asked: { options: Record<string, unknown>; destroyed: boolean }[] = []
  return {
    asked,
    getDocument(src: Record<string, unknown>) {
      const rec = { options: src, destroyed: false }
      asked.push(rec)
      let fail: (e: Error) => void = () => {}
      return {
        promise: new Promise<never>((_, reject) => {
          fail = reject
        }),
        destroy: async () => {
          rec.destroyed = true
          fail(new Error('Worker was destroyed'))
        },
      }
    },
  }
}

describe("brotli on the worker it is given, never PDF.js's global one (#686)", () => {
  it("asks PDF.js for its document on the worker and with the options given (the reader's export worker)", async () => {
    const pdfjs = hangingPdfJs()
    const worker = { name: 'axt-export' }
    const c = new AbortController()
    const going = brotliByPdfJs(pdfjs, { options: { worker, wasmUrl: '/w/' }, signal: c.signal })([new Uint8Array([1])])
    c.abort()
    await expect(going).rejects.toThrow()
    expect(pdfjs.asked[0]?.options).toMatchObject({ worker, wasmUrl: '/w/' })
    expect(pdfjs.asked[0]?.options.data).toBeInstanceOf(Uint8Array)
  })
  it('a cancel destroys the decoding document at once, its work on the worker ended', async () => {
    const pdfjs = hangingPdfJs()
    const c = new AbortController()
    const going = brotliByPdfJs(pdfjs, { signal: c.signal })([new Uint8Array([1])])
    await new Promise((r) => setTimeout(r, 10))
    expect(pdfjs.asked[0]?.destroyed).toBe(false)
    c.abort()
    await expect(going).rejects.toThrow()
    expect(pdfjs.asked[0]?.destroyed).toBe(true)
  })
})
