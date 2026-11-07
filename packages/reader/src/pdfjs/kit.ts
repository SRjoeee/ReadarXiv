// PDF.js inside the reader (design §4.5 "PDF.js's set-up lives in the reader, so both hosts run the same"; interfaces/host
// design-a §1.2, §1.5; design-b §1.7): the library and its viewer components loaded once a page, the options the website
// measured for every document, the one fix of PDF.js's page views the reader still needs, and a worker per document role per
// reader, made over its own port (never GlobalWorkerOptions), so that two readers on one page share none.
//
// The options (W pdfjs.ts:209-225, each measured): `enableHWA` (GPU-backed canvases: without it a pinch in WebKit took 40 to
// 75 ms a frame); `disableStream` and `disableAutoFetch` (a paper read by ranges, a document reading what its pages need and
// never the rest behind them), 64 KiB chunks (ranged.ts). The data files (cMaps, standard fonts, wasm) and the worker are
// served from `<base>` = `/pdfjs/<version>/` by default, which the reader's build plugin (`@readarxiv/reader/vite`) fills.
//
// What of today's fixes stays: `forgetCancelledText` (a TextLayerBuilder cancelled keeps no hold on its spans: 6,729 detached
// spans on the thesis, W pdfjs.ts:78-104), a per-document class patch, idempotent. `quietRoot`, `eagerPages` and `aheadHeld`
// were PDFViewer's and go with it: the page stack sizes its own slots and has one scheduler. `globalThis.pdfjsLib` is set, since
// PDF.js's viewer module reads it as it is evaluated.
import type * as Lib from 'pdfjs-dist'
import type * as Viewer from 'pdfjs-dist/web/pdf_viewer.mjs'

/** the documents a reader opens, each on a worker of its own: the left pane's original, the composed document */
export type Role = 'original' | 'composed'

export interface PdfModules {
  lib: typeof Lib
  viewer: typeof Viewer
}

export interface KitOptions {
  /** where the data files and the worker are served (a path or a URL ending in `/`); default `/pdfjs/<version>/` */
  base?: string
  /** the modules (the host's build may give its own: the website's legacy build, `@readarxiv/reader/pdfjs-legacy`); default
   *  the modern build */
  load?: () => Promise<PdfModules>
  /** the build's worker script: a URL, or a path under `base`; default `pdf.worker.min.mjs`, the modern build's (the reader's
   *  build plugin serves the legacy one at `legacy/pdf.worker.min.mjs`, with `legacy: true`) */
  worker?: string
  /** a module worker of the build's worker script (a test's stand-in); default the browser's `Worker` */
  makeWorker?: (url: string, name: string) => Worker
}

/** the PDF.js build a host hands its reader (openReader's `pdfjs`): its modules and its worker; none, the modern build */
export type PdfBuild = Pick<KitOptions, 'load' | 'worker' | 'base'>

export interface Kit {
  readonly lib: typeof Lib
  readonly viewer: typeof Viewer
  readonly version: string
  readonly base: string
  /** PDF.js's viewer sheet, which the reader links into its root */
  readonly sheet: string
  /** getDocument's options for a document of `role`: the measured ones and this reader's worker for it */
  options(role: Role): Record<string, unknown>
  /** the worker of `role` let go, once the documents on it are destroyed (a worker destroyed before its handshake reports
   *  "Worker was destroyed", W run.mjs:428-438): the next ask of that role makes a new one */
  release(role: Role): void
  /** every worker let go */
  destroy(): void
  /** the workers alive (the probe's) */
  readonly workers: number
}

let modules: Promise<PdfModules> | null = null
/** the modern build and its viewer, once a page; a load that fails is forgotten, so that the next asks again */
function loadModern(): Promise<PdfModules> {
  modules ??= (async () => {
    const lib = await import('pdfjs-dist')
    ;(globalThis as { pdfjsLib?: unknown }).pdfjsLib = lib
    const viewer = await import('pdfjs-dist/web/pdf_viewer.mjs')
    return { lib, viewer }
  })().catch((e: unknown) => {
    modules = null
    throw e
  })
  return modules
}

/** a TextLayerBuilder's prototype as forgetCancelledText reads it */
interface TextLayerBuilderClass {
  prototype: {
    cancel(): void
    highlighter?: { setTextMapping(divs: unknown, texts: unknown): void } | null
    accessibilityManager?: { setTextMapping(divs: unknown): void } | null
  }
}
const forgetting = new WeakSet<object>()
/**
 * A text layer let go keeps no hold on its spans. PDF.js's TextLayerBuilder.render maps the page's highlighter and its
 * accessibility manager to the layer's spans as it begins; its cancel empties the layer and disables both, and neither drops
 * the mapping, so every page view let go held its last text layer's DOM (W pdfjs.ts:78-104). Here the cancel drops both
 * mappings; the next render maps them again before it enables them. Once a class
 */
export function forgetCancelledText(builder: TextLayerBuilderClass): void {
  if (forgetting.has(builder)) return
  forgetting.add(builder)
  const cancel = builder.prototype.cancel
  builder.prototype.cancel = function (this: TextLayerBuilderClass['prototype']) {
    cancel.call(this)
    this.highlighter?.setTextMapping(null, null)
    this.accessibilityManager?.setTextMapping(null)
  }
}

/** the reader's PDF.js: its modules loaded (once a page), its workers its own */
export async function loadKit(o: KitOptions = {}): Promise<Kit> {
  const { lib, viewer } = await (o.load ?? loadModern)()
  forgetCancelledText(viewer.TextLayerBuilder as unknown as TextLayerBuilderClass)
  const version = lib.version
  const base = o.base ?? `/pdfjs/${version}/`
  const make = o.makeWorker ?? ((url: string, name: string) => new Worker(url, { type: 'module', name }))
  const script = o.worker ?? 'pdf.worker.min.mjs'
  const workerUrl = /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(script) ? script : `${base}${script}`
  const workers = new Map<Role, { port: Worker; pdf: Lib.PDFWorker }>()
  const workerOf = (role: Role) => {
    let w = workers.get(role)
    if (!w || w.pdf.destroyed) {
      const port = make(workerUrl, `axt-${role}`)
      w = {
        port,
        pdf: new lib.PDFWorker({ name: `axt-${role}`, port } as unknown as ConstructorParameters<
          typeof lib.PDFWorker
        >[0]),
      }
      workers.set(role, w)
    }
    return w.pdf
  }
  const release = (role: Role) => {
    const w = workers.get(role)
    workers.delete(role)
    if (!w) return
    try {
      w.pdf.destroy()
    } catch {
      /* gone already */
    }
    // (a port given to PDF.js is the giver's to end: PDFWorker.destroy terminates only a worker it made)
    w.port.terminate()
  }
  const assets = {
    cMapUrl: `${base}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`,
    enableHWA: true,
    disableStream: true,
    disableAutoFetch: true,
  }
  return {
    lib,
    viewer,
    version,
    base,
    sheet: `${base}pdf_viewer.css`,
    options: (role) => ({ ...assets, worker: workerOf(role) }),
    release,
    destroy() {
      for (const role of [...workers.keys()]) release(role)
    },
    get workers() {
      return workers.size
    },
  }
}
