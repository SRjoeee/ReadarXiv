// A check-up of the build output: Chrome validates a content script strictly as UTF-8 before loading it, and a Unicode
// noncharacter (U+FFFF etc.) in the file makes it refuse the whole extension with "It isn't UTF-8 encoded".
// Met 2026-09-04: the content side imported @/cache/index by mistake and bundled Dexie, which uses "￿" as a key-range upper bound.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const OUT = '.output/chrome-mv3'
const CONTENT_DIR = join(OUT, 'content-scripts')

const isNoncharacter = code =>
  (code >= 0xd800 && code <= 0xdfff) || (code >= 0xfdd0 && code <= 0xfdef) || (code & 0xfffe) === 0xfffe || code === 0xfeff

function scan(path) {
  const bytes = readFileSync(path)
  const problems = []
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) problems.push('starts with a BOM')
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    problems.push('not valid UTF-8')
    return problems
  }
  const found = new Set()
  for (const ch of text) if (isNoncharacter(ch.codePointAt(0))) found.add(`U+${ch.codePointAt(0).toString(16).toUpperCase()}`)
  if (found.size > 0) problems.push(`contains the Unicode noncharacters ${[...found].join(', ')}, which Chrome refuses to load`)
  return problems
}

let failed = false

// The licences that go with every copy (scripts/third-party-notices.mjs): written through a WXT hook, and a hook that
// stopped being called would leave a package that builds, loads and breaks three licences. React is in every build
// of this extension, so its entry standing for "the list was written" cannot go stale
const NOTICES = join(OUT, 'licenses/third-party.txt')
const notices = existsSync(NOTICES) ? readFileSync(NOTICES, 'utf8') : ''
for (const [what, ok] of [
  [`${join(OUT, 'LICENSE')} is the project's licence`, existsSync(join(OUT, 'LICENSE')) && readFileSync(join(OUT, 'LICENSE'), 'utf8').includes('GNU GENERAL PUBLIC LICENSE')],
  [`${NOTICES} lists the bundled packages`, /^react \d[^\n]* — MIT$/m.test(notices)],
  [`${NOTICES} holds Apache-2.0's own text`, notices.includes('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION')],
  // The recogniser's worker is a build of its own (wxt.config.ts `worker.plugins`): without the plugin there its two
  // packages ship unlisted
  [`${NOTICES} lists what the recogniser's worker bundles`, /^onnxruntime-web \d[^\n]* — MIT$/m.test(notices) && /^esearch-ocr \d[^\n]* — Apache-2\.0$/m.test(notices)],
]) {
  if (ok) console.log(`✓ ${what}`)
  else {
    failed = true
    console.error(`✗ ${what}: it does not`)
  }
}
let unloadable = false
for (const name of readdirSync(CONTENT_DIR)) {
  const path = join(CONTENT_DIR, name)
  if (!statSync(path).isFile()) continue
  const problems = scan(path)
  if (problems.length > 0) {
    failed = true
    unloadable = true
    console.error(`✗ ${path}\n  ${problems.join('\n  ')}`)
  } else {
    console.log(`✓ ${path}`)
  }
}
// The figure recogniser (DESIGN §15.3): its page, one WebAssembly file — the runtime's, placed by the bundler; a second
// copy is 14 MB — and the models, byte for byte the ones OCR_VERSION names (core/ocr/version.ts): a changed model
// changes what a figure is read as, and results cached under the old version would be served for it
const MODELS = {
  'ocr/PP-OCRv6_tiny_det.onnx': '193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8',
  'ocr/PP-OCRv6_tiny_rec.onnx': '9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6',
  'ocr/PP-OCRv6_tiny_dict.txt': 'c5cbe34ef40c29c4df07ed012bf96569cb69a2d2a01a07027e9f13cb832bd9cd',
}
const filesUnder = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]))
// The PDF reader's data files (`pdf-reader/`, copied by wxt.config.ts: PDF.js's WebAssembly decoders among them) are the
// reader's, not the recogniser's, and are not counted by the recogniser's rules below
const built = filesUnder(OUT).filter(path => !path.startsWith(join(OUT, 'pdf-reader')))
const wasm = built.filter(path => path.endsWith('.wasm'))
const carriers = built.filter(path => path.endsWith('.js') && readFileSync(path, 'utf8').includes('ort-wasm-simd-threaded'))
for (const [what, ok, detail] of [
  ['the recogniser\'s page is built', existsSync(join(OUT, 'ocr.html')), 'ocr.html is missing'],
  ['one WebAssembly file, ONNX Runtime\'s', wasm.length === 1 && /ort-wasm-simd-threaded/.test(wasm[0]), wasm.join(', ') || 'none'],
  ['only the recogniser\'s worker carries the runtime', carriers.length === 1 && /assets[\\/]worker-/.test(carriers[0]), carriers.join(', ') || 'none'],
  ['the PDF reader\'s page is built', existsSync(join(OUT, 'pdf-reader.html')), 'pdf-reader.html is missing'],
  ['PDF.js\'s character maps, fonts and decoders are in the build', ['pdfjs/cmaps/78-EUC-H.bcmap', 'pdfjs/standard_fonts/FoxitSerif.pfb', 'pdfjs/standard_fonts/LICENSE_FOXIT', 'pdfjs/wasm/openjpeg.wasm'].every(file => existsSync(join(OUT, 'pdf-reader', file))), 'pdf-reader/pdfjs/ is incomplete'],
  ...Object.entries(MODELS).map(([file, sha256]) => {
    const path = join(OUT, file)
    const found = existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : 'missing'
    return [`${file} is the model OCR_VERSION names`, found === sha256, `${found} — a new model takes a new OCR_VERSION and its hash here`]
  }),
]) {
  if (ok) console.log(`✓ ${what}`)
  else {
    failed = true
    console.error(`✗ ${what}: ${detail}`)
  }
}
if (failed) {
  if (unloadable) console.error('\nThe content script cannot be loaded by Chrome. Usual cause: the content side imports a module meant for the background only (such as the Dexie cache implementation in @/cache).')
  process.exit(1)
}
