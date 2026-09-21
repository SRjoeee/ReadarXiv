// The notices of the npm packages whose code is in the built extension (docs/THIRD_PARTY.md, "npm packages").
//
// MIT, ISC and Apache-2.0 all ask that the copyright notice and the licence text go with every copy, and Apache-2.0
// §4(d) that a NOTICE file be reproduced. The minifier drops the comments that would carry them, so they ship as one
// file, `licenses/third-party.txt`.
//
// **The list is the bundle's own.** It cannot be read off package.json: measured on 2026-09-20, `pnpm licenses list
// --prod` named three packages that never reach the bundle (undici, json-schema, @standard-schema/spec) and missed
// four that do — wxt, @wxt-dev/browser, @wxt-dev/storage and lucide are development dependencies whose run-time code
// is bundled. Nor off the import graph: @webext-core/match-patterns is in it, through a re-export of WXT's, and not
// one byte of it is in the output. So a plugin notes the package of every module that **rendered code into a chunk**,
// in every one of WXT's builds, and the file is written from that once they are all done. A dependency added
// tomorrow is in the next build's file without anyone remembering it.
//
// **A package without a text stops the build.** Four of the eighteen publish no licence file to npm; theirs were
// taken from their repositories into `licenses/` here, named after the package (licenses/README.md says from
// where). One that has neither is an error naming it, not a gap in the file.
//
// **Apache-2.0's own text goes in once, at the end.** §4(a) asks for a copy of the licence; the AI SDK's packages
// publish only its 552-byte notice and `@workflow/serde` a 73-byte pointer to a file it does not ship.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
/** The texts of the packages that publish none, as `<name>.txt` with `/` written `__` */
const KEPT_TEXTS = join(ROOT, 'licenses')
const LICENCE_FILE = /^(licen[cs]e|copying)(\.|-|$)/i
const NOTICE_FILE = /^notice(\.|$)/i
const MARKER = 'node_modules/'
const APACHE = 'Apache-2.0'

/** The package directory a module id lies in, or undefined for the project's own modules and virtual ones */
export function packageDirOf(id) {
  const path = id.replace(/^\0+/, '').split('?')[0].replaceAll('\\', '/')
  const at = path.lastIndexOf(MARKER)
  if (at < 0) return undefined
  const [first, second] = path.slice(at + MARKER.length).split('/')
  if (!first || first.startsWith('.')) return undefined
  const name = first.startsWith('@') ? `${first}/${second}` : first
  return path.slice(0, at + MARKER.length) + name
}

/** Every package directory that rendered code into the bundle, across all of WXT's builds in this process */
const bundled = new Set()

/** The Vite plugin that does the noting; one instance per build, one set for all of them */
export function noteBundledPackages() {
  return {
    name: 'axt:third-party-notices',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue
        for (const [id, module] of Object.entries(chunk.modules)) {
          // A module shaken down to nothing is not in the copy a reader gets
          if (module.renderedLength === 0) continue
          const dir = packageDirOf(id)
          if (dir) bundled.add(dir)
        }
      }
    },
  }
}

const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim()

/** One package's entry: its name, version, licence, where it comes from, and the texts */
function entryOf(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const files = readdirSync(dir)
  const kept = join(KEPT_TEXTS, `${manifest.name.replaceAll('/', '__')}.txt`)
  const licence = files.filter(name => LICENCE_FILE.test(name)).map(name => read(join(dir, name)))
  if (licence.length === 0 && existsSync(kept)) licence.push(read(kept))
  if (licence.length === 0) {
    throw new Error(`[third-party notices] ${manifest.name}@${manifest.version} is in the bundle and has no licence text: it publishes none, and ${kept} does not exist. Take the text from its repository into that file.`)
  }
  const notices = files.filter(name => NOTICE_FILE.test(name)).map(name => read(join(dir, name)))
  const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
  return { name: manifest.name, version: manifest.version, licence: String(manifest.license ?? ''), source: manifest.homepage ?? repository ?? '', texts: [...licence, ...notices] }
}

const RULE = '-'.repeat(80)

/**
 * What a build ships that no package manifest names: the figure recogniser's models (public/ocr, DESIGN §15.3). Apache-2.0
 * asks of a copy what it asks of code — the licence with it (§4(a)), and a word on any file that was changed (§4(b))
 */
export const BUNDLED_DATA = [{
  name: 'PP-OCRv6 tiny — text detection and recognition models (PaddleOCR)',
  licence: APACHE,
  source: 'https://github.com/PaddlePaddle/PaddleOCR',
  text: [
    'Copyright (c) PaddlePaddle Authors. Licensed under the Apache License, Version 2.0.',
    '',
    'ocr/PP-OCRv6_tiny_det.onnx and ocr/PP-OCRv6_tiny_rec.onnx are the `inference.onnx` of PaddleOCR\'s official ONNX',
    'packages of the two models, unchanged. ocr/PP-OCRv6_tiny_dict.txt is the recognition model\'s character list, written',
    'out one character a line from the `character_dict` of that package\'s `inference.yml`; nothing else of it is changed.',
  ].join('\n'),
}]

/** The file's text from the packages noted so far. Sorted, and with nothing of the machine it was built on, so two builds of one tree give one file */
export function noticesText(dirs = bundled, data = BUNDLED_DATA) {
  const entries = [...dirs].map(entryOf).sort((a, b) => a.name.localeCompare(b.name))
  // Two copies of one package at different versions are two entries; the same version installed twice is one
  const seen = new Set()
  const unique = entries.filter(entry => !seen.has(`${entry.name}@${entry.version}`) && seen.add(`${entry.name}@${entry.version}`))
  const head = [
    'Read arXiv is free software under the GNU General Public License, version 3 (the file LICENSE beside this',
    'directory). Its source, and the list of what it ported from other GPL projects, is at',
    'https://github.com/SRjoeee/ReadarXiv.',
    '',
    `The built extension also contains code from the ${unique.length} npm packages below${data.length > 0 ? ', and the data named after them' : ''}, each under its own licence.`,
  ].join('\n')
  const body = unique.map(entry => [RULE, `${entry.name} ${entry.version} — ${entry.licence}`, entry.source, RULE, '', entry.texts.join(`\n\n${'· '.repeat(20).trim()}\n\n`)].join('\n'))
  for (const item of data) body.push([RULE, `${item.name} — ${item.licence}`, item.source, RULE, '', item.text].join('\n'))
  if ([...unique, ...data].some(entry => entry.licence === APACHE)) {
    body.push([RULE, 'The Apache License, Version 2.0 — the licence of everything marked Apache-2.0 above', RULE, '', read(join(KEPT_TEXTS, `${APACHE}.txt`))].join('\n'))
  }
  return `${[head, ...body].join('\n\n')}\n`
}

/** The two files a build adds to what `public/` holds: the notices, and the project's own licence */
export function licenceFiles() {
  return [
    { relativeDest: 'licenses/third-party.txt', contents: noticesText() },
    { relativeDest: 'LICENSE', absoluteSrc: join(ROOT, 'LICENSE') },
  ]
}
