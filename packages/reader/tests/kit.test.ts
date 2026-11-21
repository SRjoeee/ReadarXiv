import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildFor, legacyRuns, modernRuns } from '../src/pdfjs/builds.ts'
import { forgetCancelledText, loadKit, type PdfModules } from '../src/pdfjs/kit.ts'
import { LEGACY } from '../src/pdfjs/legacy.ts'

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
  it("runs the build the host hands it: its modules, and its worker under the data files' base or at its own URL", async () => {
    const f = fakeModules(),
      w = fakeWorker()
    let loaded = 0
    const kit = await loadKit({
      load: async () => {
        loaded++
        return f.modules
      },
      worker: LEGACY.worker,
      makeWorker: w.make,
    })
    kit.options('original')
    const own = await loadKit({
      load: async () => f.modules,
      worker: '/assets/pdf.worker-1a2b.mjs',
      makeWorker: w.make,
    })
    own.options('composed')
    expect(loaded).toBe(1)
    expect(w.ports.map((p) => p.url)).toEqual([
      '/pdfjs/6.3.289/legacy/pdf.worker.min.mjs',
      '/assets/pdf.worker-1a2b.mjs',
    ])
    // (the data files are the build's base whatever the worker: the legacy build's are the modern's bytes)
    expect(kit.options('original').cMapUrl).toBe('/pdfjs/6.3.289/cmaps/')
    expect(typeof LEGACY.load).toBe('function')
  })
})

/** a browser's globals with or without the built-ins each build calls unguarded */
function browser(o: { modern: boolean; floor: boolean }): typeof globalThis {
  const fn = () => {}
  const u8 = Object.assign(function U8() {}, { prototype: o.modern ? { toBase64: fn, toHex: fn } : {} })
  return {
    Map: { prototype: o.modern ? { getOrInsertComputed: fn } : {} },
    Math: o.modern ? { sumPrecise: fn } : {},
    Uint8Array: o.modern ? Object.assign(u8, { fromBase64: fn }) : u8,
    RegExp: o.modern ? { escape: fn } : {},
    ...(o.modern ? { Float16Array: fn } : {}),
    Promise: o.floor ? { withResolvers: fn } : {},
    AbortSignal: o.floor ? { any: fn } : {},
    Intl: o.floor ? { Segmenter: fn } : {},
  } as unknown as typeof globalThis
}

describe("PDF.js's builds, by the browser", () => {
  it('the modern where its built-ins are there, else the legacy down to its floor, else none', () => {
    expect(buildFor(browser({ modern: true, floor: true }))).toBe('modern')
    expect(buildFor(browser({ modern: false, floor: true }))).toBe('legacy')
    expect(buildFor(browser({ modern: false, floor: false }))).toBe(null)
    // (the floor first: a browser with the modern list and without the floor's runs neither)
    expect(buildFor(browser({ modern: true, floor: false }))).toBe(null)
    expect(modernRuns(browser({ modern: true, floor: false }))).toBe(true)
    expect(legacyRuns(browser({ modern: true, floor: false }))).toBe(false)
  })
  it("the package's entry and the rest of its sources name no module of the legacy build: a host that never runs it bundles none of it", () => {
    const src = join(__dirname, '../src')
    const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.(ts|tsx|mjs)$/.test(f))
    const naming = files.filter((f) => /pdfjs-dist\/legacy|pdfjs\/legacy/.test(readFileSync(join(src, f), 'utf8')))
    expect(naming).toEqual([join('pdfjs', 'legacy.ts')])
    const manifest = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
      exports: Record<string, string>
    }
    expect(manifest.exports['./pdfjs-legacy']).toBe('./src/pdfjs/legacy.ts')
  })
})
