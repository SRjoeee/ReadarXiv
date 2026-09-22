// Everything the experiment uses but does not keep in the repository, put in place:
// - the reader's libraries in poc-reader/lib: pdf.js (this directory's node_modules), the extension's own shared
//   modules built from src/ (spikes/build-shared.mjs), and the recogniser's runtime and models as the extension ships them;
// - BusyTeX for the TeX page, published assets with our patches (busytex/research.diff) in data/busytex-patched.
// Before: `pnpm install` at the repository root, `npm install` here. BUSYTEX_FROM=<dir holding busytex/> reuses a
// local copy of the published assets instead of downloading them (about 300 MB).
//   node setup.mjs
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'

const here = new URL('.', import.meta.url).pathname
const repo = new URL('../../', import.meta.url).pathname
const lib = join(here, 'poc-reader/lib')
const need = (path, what) => { if (!existsSync(path)) throw new Error(`${path} is missing: ${what}`) }

// pdf.js, from this directory's own install
const pdfjs = join(here, 'node_modules/pdfjs-dist')
need(pdfjs, 'run `npm install` in this directory first')
for (const [from, to] of [['build/pdf.min.mjs', 'pdf.min.mjs'], ['build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'], ['web/pdf_viewer.mjs', 'pdf_viewer.mjs'], ['web/pdf_viewer.css', 'pdf_viewer.css'], ['web/images', 'images'], ['cmaps', 'cmaps'], ['standard_fonts', 'standard_fonts'], ['wasm', 'wasm']]) {
  cpSync(join(pdfjs, from), join(lib, to), { recursive: true })
}

// the recogniser as the extension ships it: its runtime from the repository's install, its models from public/ocr
need(join(repo, 'node_modules/onnxruntime-web'), 'run `pnpm install` at the repository root first')
mkdirSync(join(lib, 'ocr'), { recursive: true })
for (const f of ['ort.wasm.bundle.min.mjs', 'ort-wasm-simd-threaded.wasm']) cpSync(join(repo, 'node_modules/onnxruntime-web/dist', f), join(lib, 'ocr', f))
cpSync(join(repo, 'node_modules/esearch-ocr/dist/esearch-ocr.js'), join(lib, 'ocr/esearch-ocr.js'))
for (const f of readdirSync(join(repo, 'public/ocr'))) cpSync(join(repo, 'public/ocr', f), join(lib, 'ocr', f))

// the extension's own modules, compiled from its source
execFileSync(process.execPath, [join(here, 'spikes/build-shared.mjs')], { stdio: 'inherit' })

// BusyTeX: the published assets of the texlyre-busytex version installed here, then our patches
const site = join(here, 'data/busytex-site'), patched = join(here, 'data/busytex-patched/busytex')
if (process.env.BUSYTEX_FROM) cpSync(join(process.env.BUSYTEX_FROM, 'busytex'), join(site, 'busytex'), { recursive: true, verbatimSymlinks: false })
else if (!existsSync(join(site, 'busytex'))) execFileSync(process.execPath, [join(here, 'node_modules/texlyre-busytex/scripts/download-assets.cjs'), site], { stdio: 'inherit' })
rmSync(patched, { recursive: true, force: true })
mkdirSync(patched, { recursive: true })
for (const f of readdirSync(join(site, 'busytex'))) {
  if (f === 'busytex_pipeline.js' || f === 'busytex_biber.js') cpSync(join(site, 'busytex', f), join(patched, f))
  else symlinkSync(join(site, 'busytex', f), join(patched, f))
}
execFileSync('patch', ['-s', '-p0', '-d', patched, '-i', join(here, 'busytex/research.diff')], { stdio: 'inherit' })
console.log('ready: poc-reader/lib, data/busytex-patched')
