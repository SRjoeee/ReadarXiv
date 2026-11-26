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
