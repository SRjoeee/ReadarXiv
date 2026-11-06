// The reader's build plugin (interfaces/host design-a §1.1: "PDF.js's data files through the reader's build plugin"): PDF.js's
// cMaps, standard fonts and wasm, its worker, and its viewer's sheet with the images it names, served at `pdfjs/<version>/` of the build, where the reader's kit reads them
// (kit.ts `base`). In a build they are emitted as assets; on the dev server they are answered from pdfjs-dist itself.
// `legacy: true` adds the legacy build's worker at `pdfjs/<version>/legacy/` (the website's older browsers); the extension
// leaves it out. Node code, run by Vite: it reads pdfjs-dist through Node's own modules, imported where it runs.
import type { Plugin } from 'vite'

interface NodeFs {
  readFileSync(path: string): Uint8Array
  readdirSync(path: string, o: { recursive: true }): string[]
  statSync(path: string): { isFile(): boolean }
}

/** the files the reader serves of pdfjs-dist, by their place under `pdfjs/<version>/`, and where each is in pdfjs-dist */
export function assetFiles(fs: NodeFs, root: string, legacy: boolean): [string, string][] {
  const out: [string, string][] = []
  for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
    for (const f of fs.readdirSync(`${root}${dir}`, { recursive: true }).sort()) {
      const from = `${root}${dir}/${f}`
      if (fs.statSync(from).isFile()) out.push([`${dir}/${f}`, from])
    }
  }
  out.push(['pdf.worker.min.mjs', `${root}build/pdf.worker.min.mjs`])
  // (the viewer's own sheet, which the reader links into its root, and the images it names by relative URLs)
  out.push(['pdf_viewer.css', `${root}web/pdf_viewer.css`])
  for (const f of fs.readdirSync(`${root}web/images`, { recursive: true }).sort()) {
    const from = `${root}web/images/${f}`
    if (fs.statSync(from).isFile()) out.push([`images/${f}`, from])
  }
  if (legacy) out.push(['legacy/pdf.worker.min.mjs', `${root}legacy/build/pdf.worker.min.mjs`])
  return out
}

/** pdfjs-dist's directory (ending in `/`) and its version, where the build runs */
async function pdfjsDist(): Promise<{ root: string; version: string; fs: NodeFs }> {
  const fs = (await import('node:fs' as string)) as NodeFs
  const url = (import.meta as unknown as { resolve(s: string): string }).resolve('pdfjs-dist/package.json')
  const file = decodeURIComponent(new URL(url).pathname)
  const root = file.slice(0, file.length - 'package.json'.length)
  const version = (JSON.parse(new TextDecoder().decode(fs.readFileSync(file))) as { version: string }).version
  return { root, version, fs }
}

const TYPES: Record<string, string> = {
  mjs: 'text/javascript',
  wasm: 'application/wasm',
  bcmap: 'application/octet-stream',
  pfb: 'application/octet-stream',
  ttf: 'font/ttf',
  css: 'text/css',
  svg: 'image/svg+xml',
  gif: 'image/gif',
}

export function readerAssets(o: { legacy?: boolean } = {}): Plugin {
  const legacy = o.legacy ?? false
  let dist: (Awaited<ReturnType<typeof pdfjsDist>> & { files: [string, string][] }) | null = null
  const distOf = async () => {
    if (!dist) {
      const d = await pdfjsDist()
      dist = { ...d, files: assetFiles(d.fs, d.root, legacy) }
    }
    return dist
  }
  return {
    name: 'readarxiv-reader-assets',
    async generateBundle() {
      const { version, fs, files } = await distOf()
      for (const [at, from] of files)
        this.emitFile({ type: 'asset', fileName: `pdfjs/${version}/${at}`, source: fs.readFileSync(from) })
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const { version, fs, files } = await distOf()
        const prefix = `/pdfjs/${version}/`
        const path = (req.url ?? '').split('?')[0] ?? ''
        if (!path.startsWith(prefix)) return next()
        const at = path.slice(prefix.length)
        const file = files.find(([a]) => a === at)
        if (!file) return next()
        res.setHeader('content-type', TYPES[at.split('.').pop() ?? ''] ?? 'application/octet-stream')
        res.end(fs.readFileSync(file[1]))
      })
    },
  }
}
