// @vitest-environment node
import * as PL from '@cantoo/pdf-lib'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { constants as zlibConstants, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { afterAll, describe, expect, it } from 'vitest'
import { bundleUnitsOf, readBundle, writeBundle } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { batchesOf, layerRows, runRows, sourceUnitsOf, toTranslate, unitOf } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { loadProject, patch } from '@/pdf-reader/engine/source/latex-front.mjs'
import { paperAddon } from '@/pdf-reader/engine/layout/addon.mjs'
import { parseAddonManifest } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { encodeLayout, indexLayout, type LayoutFile, type LayoutIndex, parseLayout } from '@/pdf-reader/engine/layout/file.mjs'
import { inkSamples, LAYOUT_CLASSES, probeSamples, readInkProbe, readMarkProbe } from '@/pdf-reader/engine/layout/marks.mjs'
import { keptFor, openPaper, originalFiles, probeFiles, translationFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { rehydrate, serialize, serializeTags, translateUnits } from '@/pdf-reader/engine/translate/mt.mjs'
import { strategiesFor } from '@/pdf-reader/engine/pipeline/scripts.mjs'
import { typesetting } from '@/pdf-reader/engine/pipeline/typeset/tex.mjs'
import { DESIGN } from '@/pdf-reader/engine/pipeline/typeset/type.mjs'
import { column, layoutOf } from './helpers/layer-layout'

// The reader's engine, locked by what it makes before its files move (Stage 5, Task 4): every output below is SHA-256
// of a canonical JSON of what the engine gives for an input this repository holds and wrote itself (the sources that
// line-environments, latex-front and live-sequence's tests use, copied here as they stood; the layer tests' helpers; the CC0
// sample paper of tests/fixtures/pdf/sample-1/ and its bundle). Nothing of lab/pdf/data or lab/pdf/out is read. The
// golden/*.json files hold the hashes and nothing else: no paper's text is in them. After the move the same test, with
// the imports changed and nothing else, must pass on the same hashes.
//
//   WRITE_GOLDEN=1 pnpm vitest run tests/pdf-reader/engine-golden.test.ts   records every hash again
//   pnpm vitest run tests/pdf-reader/engine-golden.test.ts                  compares with the recorded ones
//
// A hash that changed is a change of the engine's output: record it again only when the change is the one meant.

const WRITE = process.env.WRITE_GOLDEN === '1'
const GOLDEN = new URL('./golden/', import.meta.url)

// ---- the canonical form: JSON with sorted keys, typed arrays as arrays, maps and sets in their order, bytes by their digest
const sha256 = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex')
function canon(v: unknown, seen: object[] = []): unknown {
  if (v === undefined) return null
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : String(v)
  if (typeof v === 'bigint' || typeof v === 'function' || typeof v === 'symbol') throw new TypeError(`cannot lock a ${typeof v}`)
  if (v instanceof Uint8Array) return { bytes: v.length, sha256: sha256(v) }
  if (seen.includes(v as object)) throw new TypeError('cannot lock a cycle')
  const next = [...seen, v as object]
  if (ArrayBuffer.isView(v)) return Array.from(v as unknown as ArrayLike<number>)
  if (v instanceof Map) return { map: [...v].map(([k, x]) => [canon(k, next), canon(x, next)]) }
  if (v instanceof Set) return { set: [...v].map(x => canon(x, next)) }
  if (Array.isArray(v)) return v.map(x => canon(x, next))
  const o = v as Record<string, unknown>
  return Object.fromEntries(Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => [k, canon(o[k], next)]))
}
const hashOf = (v: unknown) => sha256(JSON.stringify(canon(v)))

// ---- the recorded hashes, one file a group of cases
const cached = new Map<string, Record<string, string>>()
const recorded: Record<string, Record<string, string>> = {}
const defined: Record<string, string[]> = {}
function goldenOf(file: string): Record<string, string> {
  if (!cached.has(file)) cached.set(file, JSON.parse(readFileSync(new URL(`${file}.json`, GOLDEN), 'utf8')))
  return cached.get(file) as Record<string, string>
}
/** one case: its output's hash is recorded under WRITE_GOLDEN=1 and is compared with the recorded one otherwise */
function lock(file: string, key: string, compute: () => unknown | Promise<unknown>) {
  if (!defined[file]) defined[file] = []
  defined[file].push(key)
  it(`${file}: ${key}`, async () => {
    const got = hashOf(await compute())
    if (WRITE) {
      if (!recorded[file]) recorded[file] = {}
      recorded[file][key] = got
      return
    }
    const want = goldenOf(file)[key]
    expect(want, `no hash recorded for ${file}: ${key} (WRITE_GOLDEN=1 records)`).toBeDefined()
    expect(got).toBe(want)
  })
}
afterAll(() => {
  if (!WRITE) return
  mkdirSync(GOLDEN, { recursive: true })
  for (const [file, hashes] of Object.entries(recorded)) writeFileSync(new URL(`${file}.json`, GOLDEN), `${JSON.stringify(hashes, null, 2)}\n`)
})

// ---- the inputs: sources the tests above this one use (copied as they stood), and the CC0 sample paper
const enc = (s: string) => new TextEncoder().encode(s)
const SAMPLE = new URL('../fixtures/pdf/sample-1/', import.meta.url)
const sampleBytes = (name: string) => new Uint8Array(readFileSync(new URL(name, SAMPLE)))
const sampleFiles = () => new Map(['main.tex', 'main.bbl', 'refs.bib'].map(name => [name, sampleBytes(name)]))

/** line-environments.test.ts: the environments TeX reads by lines, and the paragraphs after each */
const LINE_ENVS_SOURCE = `${[
  '\\documentclass{article}',
  '\\usepackage{comment}\\usepackage{fancyvrb}\\usepackage{listings}',
  '\\excludecomment{hidden}',
  '\\specialcomment{boxed}{\\begingroup\\itshape}{\\endgroup}',
  '\\lstnewenvironment{code}{}{}',
  '\\DefineVerbatimEnvironment{MyVerbatim}{Verbatim}{}',
].join('\n')}\n\\begin{document}\n${[
  'A paragraph before the comment.', '\\begin{comment}', 'Hidden words.', '\\end{comment}', 'The paragraph after the comment.', '',
  '\\begin{verbatim}', 'x = 1', '\\end{verbatim}', '   The paragraph after verbatim, indented.', '',
  '\\begin{verbatim*}', 'y = 2', '\\end{verbatim*}', 'The paragraph after a starred verbatim.', '',
  '\\begin{lstlisting}', 'z = 3', '\\end{lstlisting}', '\\textbf{Label.} The paragraph after a listing, begun bold.', '',
  '\\begin{Verbatim}', 'w = 4', '\\end{Verbatim}', 'The paragraph after fancyvrb.', '',
  '\\begin{hidden}', 'Excluded words.', '\\end{hidden}', 'The paragraph after an excluded comment of the paper\'s own.', '',
  '\\begin{boxed}', 'The paragraph inside a special comment.', '\\end{boxed}', '',
  '\\begin{code}', 'v = 5', '\\end{code}', 'The paragraph after a listing environment of the paper\'s own.', '',
  '\\begin{MyVerbatim}', 'u = 6', '\\end{MyVerbatim}', 'The paragraph after a verbatim environment of the paper\'s own.', '',
  '\\begin{figure}\\caption{A caption.}\\end{figure}', 'The paragraph after a figure.',
].join('\n')}\n\\end{document}\n`

/** latex-front.test.ts: a project of several files, named by \input, \import and \subfile under other spellings */
const FRONT_FILES: [string, string][] = [
  ['main.tex', '\\documentclass{article}\n\\usepackage{import}\\usepackage{subfiles}\n\\begin{document}\n\\input{./sections/a.tex}\n\\input{sections/b}\n\\input{sections/../sections/a}\n\\import{chapters/}{one}\n\\inputfrom{./chapters}{two.tex}\n\\subfile{./chapters/ch1}\n\\end{document}\n'],
  ['sections/a.tex', 'First paragraph of a.\n'],
  ['sections/b.tex', 'Second paragraph of b.\n'],
  ['chapters/one.tex', 'Prose of one.\n\n\\input{fig}\n\n\\subimport{deep/}{three}\n\n\\input{root}\n'],
  ['chapters/fig.tex', 'Prose of the chapter\'s figure.\n'],
  ['fig.tex', 'Prose of the root\'s figure, which TeX does not read here.\n'],
  ['chapters/deep/three.tex', 'Prose of three.\n'],
  ['root.tex', 'Prose found at the root, the directory having none.\n'],
  ['chapters/two.tex', 'Prose of two.\n'],
  ['chapters/ch1.tex', '\\documentclass[../main.tex]{subfiles}\n\\begin{document}\nProse of the chapter.\n\n\\input{table}\n\\end{document}\n'],
  ['chapters/table.tex', 'Prose of the chapter\'s table.\n'],
]

/** live-sequence.test.ts: twelve paragraphs of a paper, two batches of the service's */
const LIVE_SOURCE = `\\documentclass{article}\\begin{document}\n${Array.from({ length: 12 }, (_, k) => `Paragraph ${k} of the paper, ${'with words that run on for a line or two of prose '.repeat(4)}and an end.\n`).join('\n')}\\end{document}\n`

/** a paper's units as mt.mjs types the ones it works on */
type MtUnit = Parameters<typeof serialize>[0]
const mtUnits = (paper: ReturnType<typeof openPaper>) => paper.units as unknown as (MtUnit & { kind: string })[]

const SOURCES: Record<string, () => Map<string, Uint8Array>> = {
  'sample-1': sampleFiles,
  'line-environments': () => new Map([['main.tex', enc(LINE_ENVS_SOURCE)]]),
  'latex-front': () => new Map(FRONT_FILES.map(([name, text]) => [name, enc(text)])),
  'live-sequence': () => new Map([['main.tex', enc(LIVE_SOURCE)]]),
}

// ---- a fixed pseudo-translation: every English word of two letters or more becomes Han characters, one for each of its
// letters up to four; markers (`@a#`) and tags are left as they are. `lossy` drops what a machine drops: the `#` of a
// marker, the closing tag
type Sent = { text: string; by: string } | null
const WORDS = /(<[^>]*>)|(@[a-z]+#)|[A-Za-z]{2,}/g
const pseudo = (text: string) => text.replace(WORDS, (m, tag, marker) => tag ?? marker ?? '\u8bd1\u6587\u8bba\u8fff'.slice(0, Math.min(m.length, 4)))
const faithful = (texts: string[]): Sent[] => texts.map(text => ({ text: pseudo(text), by: 'B' }))
const lossy = (texts: string[]): Sent[] => texts.map(text => ({ text: pseudo(text).replace(/(@[a-z]+)#/g, '$1').replace(/<\/t>/g, ''), by: 'B' }))
/** a sender that records what it was asked */
const recorder = (answer: (texts: string[]) => Sent[]) => {
  const asked: { texts: string[]; cuts?: unknown }[] = []
  return { asked, send: async (texts: string[], cuts?: number[][]) => { asked.push({ texts, ...(cuts ? { cuts } : {}) }); return answer(texts) } }
}

// ---- 1. the units, and the wires
describe('the units and the wires', () => {
  for (const [name, files] of Object.entries(SOURCES)) {
    const paper = () => openPaper(files())
    lock('units', name, () => { const p = paper(); return { meta: p.meta, main: p.project.main, units: p.units, kept: [...p.kept].map(u => p.units.indexOf(u)) } })
    lock('units', `${name}: bundle units`, () => bundleUnitsOf(paper()))
    lock('units', `${name}: kept in zh, in de`, () => { const p = paper(); return ['zh', 'de'].map(lang => [...keptFor(p, lang)].map(u => p.units.indexOf(u))) })
    lock('wires', `${name}: markers`, () => mtUnits(paper()).map(u => serialize(u)))
    lock('wires', `${name}: tags`, () => mtUnits(paper()).map(u => serializeTags(u)))
    lock('wires', `${name}: markers read back, strictly and tolerantly`, () => mtUnits(paper()).map(u => {
      const ser = serialize(u), reply = pseudo(ser.wire)
      return [rehydrate(reply, ser), rehydrate(reply.replace(/(@[a-z]+)#/g, '$1'), ser), rehydrate(reply.replace(/(@[a-z]+)#/g, '$1'), ser, true)]
    }))
    for (const format of ['markers', 'tags', 'runs'] as const) {
      for (const [how, answer] of [['faithful', faithful], ['lossy', lossy]] as const) {
        lock('wires', `${name}: translateUnits over ${format}, ${how}`, async () => {
          const units = mtUnits(paper()), r = recorder(answer), { results, how: counts } = await translateUnits(units, r.send, format)
          return { asked: r.asked, counts, results: units.map(u => results.get(u) ?? null) }
        })
      }
    }
  }
})

// ---- 2. the files a compile is given
const SWITCHES = { '\\cite': '22220000', '\\ref': '00000000', '\\footnote': '00220000' }
const INKLESS = ['\\bert{}']
/** a TeX log with the rows the mark probe writes (layout-paper.test.ts) */
const PROBE_LOG = ['This is pdfTeX', 'LAYOUT-PROBE 1 punct 0 22220000', 'LAYOUT-PROBE 1 punct 1 00000000', 'LAYOUT-PROBE 1 punct 2 00220000', 'LAYOUT-PROBE 1 ink-at 0', '> \\box54=', '\\hbox(0.0+0.0)x0.0', '', '! OK.', 'LAYOUT-PROBE 1 ink-end 0', ''].join('\n')
const texts = (files: Map<string, Uint8Array>) => [...files].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, bytes]) => [name, new TextDecoder().decode(bytes)])

describe('the files of a compile', () => {
  for (const [name, files] of Object.entries(SOURCES)) {
    const paper = () => openPaper(files())
    lock('compile-files', `${name}: the original with the layout compile's marks, lines, switches and inkless`, () => texts(originalFiles(paper(), { lines: true, layout: LAYOUT_CLASSES, switches: SWITCHES, inkless: INKLESS })))
    lock('compile-files', `${name}: the original with lines`, () => texts(originalFiles(paper(), { lines: true })))
    lock('compile-files', `${name}: the original as at 3cb5a733`, () => texts(originalFiles(paper())))
    lock('compile-files', `${name}: the probes`, () => { const p = paper(); return [texts(probeFiles(p)), texts(probeFiles(p, { width: true })), texts(probeFiles(p, { marks: true }))] })
    lock('compile-files', `${name}: what the probes read from a log`, () => {
      const p = paper()
      return { samples: probeSamples(p.units), ink: inkSamples(p.units), switches: readMarkProbe(PROBE_LOG, probeSamples(p.units)), inkless: readInkProbe(PROBE_LOG, inkSamples(p.units)) }
    })
    lock('compile-files', `${name}: patch of every unit translated by the pseudo-translation`, () => {
      const p = paper(), project = loadProject(p.fsys, p.project.main)
      const done = new Map(project.units.map((u, i) => [u, u.pieces.map(x => ((x as { t: string }).t === 'text' ? { ...(x as object), tr: true, s: `<T${i}>` } : x))]))
      return texts(patch(project, done as never))
    })
    lock('compile-files', `${name}: the translation, zh: draft, final, today and by runs`, () => {
      const p = paper(), [xe] = strategiesFor({ compiler: 'pdflatex' }, 'zh')
      if (!xe) throw new Error('no strategy')
      const all = new Map(p.units.map((_, i) => [i, 1.1]))
      const typeset = typesetting(p.units, { design: DESIGN.Hans, strategy: xe.name, type: { lead: 1.35, track: 0, scale: 1 }, leads: all, sizes: new Map(all), floatsAt: new Map(), tableMin: 0.85 })
      type Piece = { t: string; s?: string; tr?: boolean }
      const translate = (runs: boolean) => new Map(p.units.map((u, i) => [u, (u.pieces as Piece[]).flatMap((x, k): Piece[] => {
        if (x.t !== 'text' || !/\S/.test(x.s ?? '')) return [x]
        const lead = k === 0 ? (x.s ?? '').match(/^\s*/)?.[0] ?? '' : '', trail = k === u.pieces.length - 1 ? (x.s ?? '').match(/\s*$/)?.[0] ?? '' : ''
        return runs ? [{ ...x, tr: true, s: `${lead}<T${i}>${trail}` }] : [...(lead ? [{ t: 'text', s: lead }] : []), { ...x, tr: true, s: `<T${i}>` }, ...(trail ? [{ t: 'text', s: trail }] : [])]
      })])) as Map<(typeof p.units)[number], unknown[]>
      const given = { strategy: xe, fonts: null, aux: null, bbl: null }
      return [
        texts(translationFiles(p, translate(false), { ...given, draft: true, typeset })),
        texts(translationFiles(p, translate(false), { ...given, draft: false, typeset: typeset.final })),
        texts(translationFiles(p, translate(false), { ...given, draft: false })),
        texts(translationFiles(p, translate(true), { ...given, draft: false })),
      ]
    })
  }
})

// ---- 3. the sample's bundle, its layout and its add-on
const bundleBytes = () => sampleBytes('bundle.json')
type Json = { versions: { image: string }; paper: { id: string; version: number; pages: number }; base: { bytes: number; sha256: string; url: string }; left: unknown; layout: LayoutFile; addon: { manifest: object; tail: string } }
const bundleJson = () => JSON.parse(new TextDecoder().decode(bundleBytes())) as Json
/** a layout index as every reader reads it: each unit it locates, each page's units and view, each font */
function indexed(index: LayoutIndex) {
  const ids = index.file.units.map(u => u[0])
  return { file: index.file, units: ids.map(id => index.unit(id)), pages: Array.from({ length: index.file.paper.pages }, (_, i) => ({ onPage: index.onPage(i + 1), view: index.view(i + 1) })), fonts: index.file.fonts.map((_, i) => index.font(i)) }
}

describe('the bundle, the layout file and the add-on', () => {
  lock('bundle', 'readBundle of the sample\'s bundle', () => readBundle(bundleBytes()))
  lock('bundle', 'writeBundle of the sample\'s parts', () => {
    const b = readBundle(bundleBytes()), raw = bundleJson()
    return writeBundle({ paper: b.paper, base: b.base, image: raw.versions.image, units: b.units as never, left: b.left, layout: b.layout, addon: b.addon })
  })
  lock('bundle', 'the bundle\'s units over the sample paper\'s', () => ({ made: bundleUnitsOf(openPaper(sampleFiles())), read: readBundle(bundleBytes()).units }))

  lock('layout', 'the sample\'s layout: encode, parse and index', () => {
    const file = parseLayout(enc(encodeLayout(bundleJson().layout)))
    return { encoded: encodeLayout(file), indexed: indexed(indexLayout(file)) }
  })
  lock('layout', 'the layer test helper\'s layouts: written, parsed and indexed', () => [
    layoutOf([{ id: 1, kind: 'heading', lines: column(1, { top: 700 }) }, { id: 2, lines: [...column(4, { top: 660 }), ...column(2, { page: 2, top: 720 })], frames: [{ page: 1, lines: 4 }, { page: 2, lines: 2, share: 500, below: 100 }], ph: [{ k: 0, kind: 'math', segs: [[1, 100, 700, 130, 710, 698]] }, { k: 1, kind: 'cite', segs: [[1, 140, 688, 160, 698, 686]], text: '[1]' }, { k: 2, kind: 'macro', flags: 64, segs: [], text: '\u00b0' }], labels: [{ x0: 40, baseline: 660, x1: 60 }], erase: [[0, 70, 650, 400, 668]], held: [3] }]),
    layoutOf([{ id: 7, kind: 'caption', lines: [...column(2, { page: 1, top: 300 }), ...column(1, { page: 2, top: 720 })], frames: [{ page: 1, lines: 2 }, { page: 2, lines: 1, share: 400 }] }, { id: 9, kind: 'cell', lines: column(1, { page: 2, top: 500, w: 60 }) }], 3),
  ].map(indexed))
  lock('layout', 'the sample\'s add-on manifest, read in its shipped form and in the check\'s', () => {
    const raw = bundleJson(), manifest = enc(JSON.stringify(raw.addon.manifest)), pages = raw.layout.paper.pages, views = raw.layout.views
    const read = (shipped: boolean) => { try { return parseAddonManifest(manifest, { pages, views, shipped }) } catch (e) { return { refused: (e as Error).message } } }
    return { shipped: read(true), full: read(false), withoutViews: parseAddonManifest(manifest, { pages, shipped: true }) }
  })
  lock('layout', 'the add-on paperAddon makes of the sample\'s PDF and layout', async () => {
    const bytes = sampleBytes('sample-1.pdf'), index = indexLayout(parseLayout(enc(encodeLayout(bundleJson().layout))))
    const deflate = (b: Uint8Array) => new Uint8Array(deflateSync(b))
    const inflate = (b: Uint8Array, limit: number) => {
      const o = { finishFlush: zlibConstants.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }
      try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if ((e as { code?: string })?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) }
    }
    const task = getDocument({ data: bytes.slice(), verbosity: 0 })
    const doc = await task.promise
    try {
      const made = await paperAddon({ bytes, index, doc: doc as never, OPS: OPS as never, PL, deflate, inflate })
      // (the tail's bytes, and so `appended`, are zlib's, which Node versions do not promise to keep; the rest of the manifest is
      // the engine's, and it is what the layer reads)
      return made.ok ? { ok: true, manifest: { ...made.manifest, appended: undefined }, tail: made.tail.length > 0 } : made
    } finally { await task.destroy() }
  })
})

// ---- 4. the rows
describe('the rows a language\'s translation travels as', () => {
  const sample = () => readBundle(bundleBytes())
  lock('rows', 'the ids and batches each language translates', () => ['zh', 'de', 'ja'].map(lang => ({ lang, ids: toTranslate(sample(), lang), batches: batchesOf(sample(), lang) })))
  for (const [lang, format] of [['zh', 'markers'], ['de', 'markers'], ['zh', 'tags'], ['zh', 'runs']] as const) {
    for (const [how, answer] of [['faithful', faithful], ['lossy', lossy]] as const) {
      lock('rows', `runRows into ${lang} over ${format}, ${how}`, async () => {
        const b = sample(), r = recorder(answer), given: unknown[] = []
        const out = await runRows(b, { lang, send: r.send, format, onRows: (rows, held) => given.push({ rows, held }) })
        return { asked: r.asked, given, rows: [...out.rows], lost: out.lost, stopped: out.stopped, units: [...out.rows.values()].map(row => unitOf(b, row)) }
      })
    }
  }
  lock('rows', 'layerRows over every result at once, and as the batches fill', async () => {
    // (the bundle's units as the unit objects translateUnits works on, which rows.mjs builds once a bundle)
    const b = sample(), units = sourceUnitsOf(b).filter(u => u !== null), r = recorder(faithful)
    const { results } = await translateUnits(units, r.send, 'markers')
    const all = new Map([...results].map(([u, res]) => [sourceUnitsOf(b).indexOf(u), res as never]))
    const growing = batchesOf(b, 'zh').map((_, i) => {
      const upTo = new Set(batchesOf(b, 'zh').slice(0, i + 1).flat())
      return layerRows(b, new Map([...all].filter(([id]) => upTo.has(id))), 'zh')
    })
    return { whole: layerRows(b, all, 'zh'), growing }
  })
})
describe('the recorded hashes are the cases', () => {
  it.skipIf(WRITE)('every recorded hash has a case here, and no case is without one', () => {
    for (const [file, keys] of Object.entries(defined)) expect(Object.keys(goldenOf(file)).sort(), file).toEqual([...keys].sort())
  })
})
