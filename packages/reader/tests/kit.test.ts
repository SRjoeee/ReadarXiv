import { describe, expect, it } from 'vitest'
import { forgetCancelledText, loadKit, type PdfModules } from '../src/pdfjs/kit.ts'

/** PDF.js's modules as the kit reads them: a PDFWorker that records its port and its end */
function fakeModules() {
  const made: { name: string; port: unknown; destroyed: boolean }[] = []
  class PDFWorker {
    name: string
    port: unknown
    destroyed = false
    constructor(o: { name: string; port: unknown }) {
      this.name = o.name
      this.port = o.port
      made.push(this)
    }
    destroy() {
      this.destroyed = true
    }
  }
  class TextLayerBuilder {
    highlighter = {
      mapped: true as boolean,
      setTextMapping(a: unknown) {
        this.mapped = a !== null
      },
    }
    accessibilityManager = {
      mapped: true as boolean,
      setTextMapping(a: unknown) {
        this.mapped = a !== null
      },
    }
    cancelled = 0
    cancel() {
      this.cancelled++
    }
  }
  const modules = { lib: { version: '6.3.289', PDFWorker }, viewer: { TextLayerBuilder } } as unknown as PdfModules
  return { modules, made, TextLayerBuilder }
}
const fakeWorker = () => {
  const ports: { url: string; name: string; ended: boolean }[] = []
  const make = (url: string, name: string) => {
    const p = {
      url,
      name,
      ended: false,
      terminate() {
        p.ended = true
      },
    }
    ports.push(p)
    return p as unknown as Worker
  }
  return { ports, make }
}

describe("the reader's PDF.js", () => {
  it("gives every document the measured options and a worker of its own role, over a port of the reader's", async () => {
    const f = fakeModules(),
      w = fakeWorker()
    const kit = await loadKit({ load: async () => f.modules, makeWorker: w.make })
    const o = kit.options('original')
    expect(o).toMatchObject({
      cMapUrl: '/pdfjs/6.3.289/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/pdfjs/6.3.289/standard_fonts/',
      wasmUrl: '/pdfjs/6.3.289/wasm/',
      enableHWA: true,
      disableStream: true,
      disableAutoFetch: true,
    })
    expect(kit.options('original').worker).toBe(o.worker)
    expect(kit.options('composed').worker).not.toBe(o.worker)
    expect(w.ports.map((p) => [p.url, p.name])).toEqual([
      ['/pdfjs/6.3.289/pdf.worker.min.mjs', 'axt-original'],
      ['/pdfjs/6.3.289/pdf.worker.min.mjs', 'axt-composed'],
    ])
    expect(f.made.map((x) => x.port)).toEqual(w.ports)
    expect(kit.workers).toBe(2)
  })
  it("two readers share no worker, and one let go leaves the other's", async () => {
    const f = fakeModules(),
      w = fakeWorker()
    const a = await loadKit({ load: async () => f.modules, makeWorker: w.make })
    const b = await loadKit({ load: async () => f.modules, makeWorker: w.make, base: '/x/' })
    const wa = a.options('original').worker,
      wb = b.options('original').worker
    expect(wa).not.toBe(wb)
    a.destroy()
    expect(a.workers).toBe(0)
    expect((wa as { destroyed: boolean }).destroyed).toBe(true)
    expect(w.ports[0]?.ended).toBe(true)
    expect((wb as { destroyed: boolean }).destroyed).toBe(false)
    expect(w.ports[1]?.ended).toBe(false)
    expect(w.ports[1]?.url).toBe('/x/pdf.worker.min.mjs')
  })
  it('a role released makes a new worker at its next ask', async () => {
    const f = fakeModules(),
      w = fakeWorker()
    const kit = await loadKit({ load: async () => f.modules, makeWorker: w.make })
    const first = kit.options('composed').worker
    kit.release('composed')
    expect(kit.options('composed').worker).not.toBe(first)
    expect(w.ports.map((p) => p.ended)).toEqual([true, false])
  })
  it('a text layer cancelled drops its mappings, patched once a class', () => {
    const f = fakeModules()
    forgetCancelledText(f.TextLayerBuilder as never)
    forgetCancelledText(f.TextLayerBuilder as never)
    const t = new f.TextLayerBuilder()
    t.cancel()
    expect(t.cancelled).toBe(1)
    expect(t.highlighter.mapped).toBe(false)
    expect(t.accessibilityManager.mapped).toBe(false)
  })
})
