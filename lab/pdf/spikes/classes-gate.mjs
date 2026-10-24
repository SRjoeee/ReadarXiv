// lab/pdf/spikes/classes-gate.mjs
// The content classes' stage 4 gate (docs/route/orphan-text.md §5, "References" and "Names"): a bibliography's entries units of
// their own, marked in the bibliography's TeX, and the author block translated for every target. Per paper, against another
// engine's tree (`--base`, the merge base's src/: `git archive <base> src | tar -x -C <dir>`):
//   - the units (both engines' openPaper over the paper's source): those gained by kind, and whether every other unit is the
//     base's, in order (`same`: the base's units equal this one's with the entries taken out, by kind and plain source), and
//     whether the marked original's files (live.mjs originalFiles, the layout marks, no switch) are the base's outside each
//     bibliography (`marksSame`: a file's bytes with every thebibliography taken out);
//   - with `--compile`, this engine's layout marks and base page as production makes them (layout/paper.mjs layoutMarksOfPaper:
//     the mark probe, the marked original, its final pass; latexmk in the year's pinned image of lab/pdf/compile-images.json,
//     no network, the date arXiv's PDF's), and over the base page the layout file (layout/make.mjs makeLayout) and the wrap
//     (layout/wrap.mjs wrapFinal): each kind's units located by the file (`located`), the wrap's units left the original's by why
//     and kind (`unhidden`), the ledger's letters by class; G1 on every page the entries are on (the wrap, all groups ON,
//     against the unwrapped base page, PDF.js in Node at scale 2: pixels apart, which must be 0); and, where a base page of the
//     base engine's is given (`--pack`: <pack>/fixtures/<id>-zh/base.pdf, our final pass as the base engine made it), the
//     two base pages' pixels apart on every page (marks in the bibliography move nothing: 0) and the base engine's layout file's
//     units located against this one's, the entries taken out (`lost`: a unit the base's file locates and this one's does not);
//   - with `--dump=<dir>`, the layout file's units, fonts, lines and placeholders written there (<id>.json), and with
//     `--against=<dir>`, another run's dump (the base engine's, `--engine=<its tree>`, made over its own compiles) unit by unit
//     against this one's, the entries taken out and each line's font by its name (`vsRun`: lost, gained, moved, placeholders
//     moved; `--which` names them).
// One JSON line a paper; the compiles in <out>/compiles/<id>/ (kept by what they compile, never sent). A paper's text is never
// printed. Runs with tsx from the repository root:
//   pnpm exec tsx lab/pdf/spikes/classes-gate.mjs --base=<dir holding src/> [--engine=<dir holding src/>] [--compile]
//       [--dump=<dir>] [--against=<dir>] [--which] [--pack=<gate pack>] [--out=<dir>] <id>=<dir with source.gz and arxiv.pdf>[@<year>] …
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { deflateSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { latexmkEngine, PLATFORM } from './compile-image.mjs'

const run = promisify(execFile)
const LAB = resolve(dirname(new URL(import.meta.url).pathname), '..')
const argOf = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
const BASE = argOf('base'), PACK = argOf('pack'), OUT = resolve(argOf('out') ?? join(LAB, 'out/classes-gate'))
const COMPILE = process.argv.includes('--compile'), DUMP = argOf('dump'), AGAINST = argOf('against')
if (!BASE) { console.error('usage: classes-gate.mjs --base=<dir holding src/> [--engine=<dir holding src/>] [--compile] [--dump=<dir>] [--against=<dir>] [--pack=<pack>] <id>=<dir>[@<year>] …'); process.exit(2) }
// (the engine measured: this repository's, or another tree's (`--engine`): the base engine's own run, dumped, is what --against
// compares a run with, unit by unit)
const ENGINE = join(resolve(argOf('engine') ?? join(LAB, '../..')), 'src/pdf-reader/engine')
const E = f => import(pathToFileURL(join(ENGINE, f)).href)
const [{ openPaper, originalFiles }, { LAYOUT_CLASSES }, { layoutMarksOfPaper }, { makeLayout }, { wrapFinal }, { creationEpochOf }, { NO_IMAGE_PIXELS }, { PDFJS }, { plainSource }, { unpackSource }] = await Promise.all(['pipeline/live.mjs', 'layout/marks.mjs', 'layout/paper.mjs', 'layout/make.mjs', 'layout/wrap.mjs', 'layout/base.mjs', 'layout/pdf-lite.mjs', 'pipeline/versions.mjs', 'translate/mt.mjs', 'source/tar.mjs'].map(E))
const base = await import(pathToFileURL(join(BASE, 'src/pdf-reader/engine/pipeline/live.mjs')).href)
const IMAGES = JSON.parse(readFileSync(join(LAB, 'compile-images.json'), 'utf8'))
const NM = join(LAB, '../../node_modules/pdfjs-dist/')
const DOC = { verbosity: 0, cMapUrl: `${NM}cmaps/`, cMapPacked: true, standardFontDataUrl: `${NM}standard_fonts/`, useSystemFonts: false }
const open = async bytes => { const task = getDocument({ ...DOC, data: bytes.slice() }); try { return { doc: await task.promise, close: () => task.destroy() } } catch (e) { await task.destroy().catch(() => {}); throw e } }
const BIB = new Set(['reference', 'refnames'])
const sha = b => createHash('sha256').update(b).digest('hex').slice(0, 16)
const latin1 = b => Buffer.from(b).toString('latin1')
/** a file's text with every thebibliography taken out (the base engine marks none of it) */
const outsideBibliography = t => t.replace(/\\begin\s*\{thebibliography\}[\s\S]*?\\end\s*\{thebibliography\}/g, '')

/** one compile (latexmk in the year's pinned image, no network, 2 CPUs, 3 GB, 600 s), kept by what it compiles */
async function compileIn(image, paper, files, keep, req) {
  const all = new Map([...files, ...req.overrides])
  const hash = createHash('sha256').update(image).update(JSON.stringify([req.rerun, req.bibtex, req.sourceDate ?? null, !!req.files]))
  for (const [p, b] of [...all].sort((a, c) => (a[0] < c[0] ? -1 : 1))) hash.update(p).update(b)
  const key = hash.digest('hex').slice(0, 20), at = join(keep, key)
  if (existsSync(join(at, 'log')) && !req.files) return { ok: existsSync(join(at, 'pdf')), pdf: existsSync(join(at, 'pdf')) ? new Uint8Array(readFileSync(join(at, 'pdf'))) : null, log: readFileSync(join(at, 'log'), 'latin1') }
  const dir = mkdtempSync(join(tmpdir(), 'classes-gate-'))
  try {
    for (const [p, b] of all) { const f = join(dir, p); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, b) }
    const main = paper.project.main, stem = main.slice(main.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '')
    const date = Number.isSafeInteger(req.sourceDate) ? ['-e', 'FORCE_SOURCE_DATE=1', '-e', `SOURCE_DATE_EPOCH=${req.sourceDate}`] : []
    const t0 = Date.now()
    await run('docker', ['run', '--rm', '--init', '--pull', 'never', ...PLATFORM, '--network', 'none', '--cpus', '2', '--memory', '3g', ...date, '-v', `${dir}:/work`, '-w', '/work', image, 'timeout', '600', 'latexmk', ...latexmkEngine(req.engine), ...(req.rerun ? [] : ['-e', '$max_repeat=1']), ...(req.bibtex === false ? ['-bibtex-'] : []), '-interaction=nonstopmode', '-f', main], { maxBuffer: 1 << 26 }).catch(() => null)
    const pdf = join(dir, `${stem}.pdf`), log = join(dir, `${stem}.log`)
    if (!existsSync(log)) return { ok: false, error: 'no log' }
    const out = { ok: existsSync(pdf), pdf: existsSync(pdf) ? new Uint8Array(readFileSync(pdf)) : null, log: readFileSync(log, 'latin1'), ms: Date.now() - t0 }
    mkdirSync(at, { recursive: true })
    writeFileSync(join(at, 'log'), Buffer.from(out.log, 'latin1'))
    if (out.pdf) writeFileSync(join(at, 'pdf'), out.pdf)
    if (req.files) out.files = new Map(readdirSync(dir, { recursive: true }).map(String).filter(p => statSync(join(dir, p)).isFile()).map(p => [p, new Uint8Array(readFileSync(join(dir, p)))]))
    return out
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

/** pixels apart (any channel past 24) between two renders of one page */
async function apart(a, b, page, { off = null } = {}) {
  const { renderPage } = await import('../../../tests/pdf-reader/helpers/ocg-pdfs.ts')
  const x = await renderPage(a, page, { scale: 2 }), y = await renderPage(b, page, { scale: 2, off })
  if (x.width !== y.width || x.height !== y.height) return -1
  let n = 0
  for (let i = 0; i < x.data.length; i += 4) if (Math.abs(x.data[i] - y.data[i]) > 24 || Math.abs(x.data[i + 1] - y.data[i + 1]) > 24 || Math.abs(x.data[i + 2] - y.data[i + 2]) > 24) n++
  return n
}

for (const arg of process.argv.slice(2).filter(a => !a.startsWith('--'))) {
  const [id, rest] = arg.split('='), [dir, yearGiven] = rest.split('@')
  const { files } = await unpackSource(new Uint8Array(readFileSync(join(dir, 'source.gz'))))
  const paper = openPaper(files), theirs = base.openPaper(files)
  const kinds = {}
  for (const u of paper.units) if (BIB.has(u.kind)) kinds[u.kind] = (kinds[u.kind] ?? 0) + 1
  const key = u => `${u.kind}|${plainSource(u)}`
  const mine = paper.units.filter(u => !BIB.has(u.kind)).map(key), was = theirs.units.map(key)
  const same = mine.length === was.length && mine.every((k, i) => k === was[i])
  const firstOther = same ? null : mine.findIndex((k, i) => k !== was[i])
  const filesOf = (p, mod) => mod.originalFiles(p, { lines: true, layout: LAYOUT_CLASSES })
  const a = filesOf(paper, { originalFiles }), b = filesOf(theirs, base)
  // (a mark names its unit by its id, and the units after a bibliography move up past its entries: each of this engine's ids
  // written as the base's, the entries' left as they are, before the files are compared)
  const idOf = new Map(paper.units.flatMap((u, i) => (BIB.has(u.kind) ? [] : [i])).map((mineId, theirId) => [mineId, theirId]))
  const asBase = t => t.replace(/(\\axt(?:mark|end|lines|pma|pmm|pm|hmark|colour)\s*\{[thpn]?)(\d+)/g, (m, head, n) => (idOf.has(Number(n)) ? `${head}${idOf.get(Number(n))}` : m))
  const marksSame = [...new Set([...a.keys(), ...b.keys()])].filter(p => !/\.bbl$/.test(p)).every(p => outsideBibliography(asBase(latin1(a.get(p) ?? new Uint8Array()))) === outsideBibliography(latin1(b.get(p) ?? new Uint8Array())))
  const row = { id, units: paper.units.length, was: theirs.units.length, gained: kinds, same, ...(same ? {} : { firstOther }), marksSame }
  if (COMPILE) {
    const arxiv = new Uint8Array(readFileSync(join(dir, 'arxiv.pdf')))
    const ax = await open(arxiv)
    const pages = ax.doc.numPages, sourceDate = await creationEpochOf(ax.doc).catch(() => null)
    await ax.close()
    const year = yearGiven ?? IMAGES.default, image = IMAGES.images[year].texlive
    const keep = join(OUT, 'compiles', id)
    const t0 = Date.now()
    const made = await layoutMarksOfPaper(paper, { compile: req => compileIn(image, paper, files, keep, req), open, OPS, pages, sourceDate })
    row.compileS = Math.round((Date.now() - t0) / 1000)
    if (!('marks' in made)) { row.refused = made.refused; console.log(JSON.stringify(row)); continue }
    if (!made.base?.pdf) { row.base = made.base?.refused ?? 'none'; console.log(JSON.stringify(row)); continue }
    const ours = made.base.pdf
    const bd = await open(ours)
    try {
      const lm = await makeLayout({ units: paper.units, marks: made.marks, arxiv: bd.doc, OPS, paper: { id: id.replace(/v\d+$/, ''), version: Number(/v(\d+)$/.exec(id)?.[1] ?? 1) }, left: '', pdfjs: PDFJS })
      if ('file' in lm) {
        const lines = new Map(lm.file.lines.map(([u, rows]) => [u, rows]))
        const located = {}, entryPages = new Set()
        paper.units.forEach((u, i) => {
          const k = BIB.has(u.kind) ? u.kind : u.kind === 'author' ? 'author' : 'other', r = lines.get(i)
          located[k] ??= [0, 0]
          located[k][1]++
          if (r?.length) { located[k][0]++; if (BIB.has(u.kind)) for (let j = 0; j < r.length; j += 8) entryPages.add(r[j]) }
        })
        row.located = located
        if (DUMP) { mkdirSync(DUMP, { recursive: true }); writeFileSync(join(DUMP, `${id}.json`), JSON.stringify({ kinds: paper.units.map(u => u.kind), fonts: lm.file.fonts, lines: lm.file.lines, ph: lm.file.ph })) }
        // (another run's dump, the base engine's (--against): every unit but the entries, the base's id for each, its rows and its
        // placeholders' rows against this run's)
        const against = AGAINST && join(AGAINST, `${id}.json`)
        if (against && existsSync(against)) {
          // (a line's eighth number is its font's index in the file's `fonts`, which the entries' fonts, met first, move: the name)
          const named = (rows, fonts) => rows && Array.from(rows, (v, j) => (j % 8 === 7 ? fonts[v] : v))
          const o = JSON.parse(readFileSync(against, 'utf8')), theirLines = new Map(o.lines.map(([u, r]) => [u, named(r, o.fonts)])), mineLines = new Map([...lines].map(([u, r]) => [u, named(r, lm.file.fonts)]))
          const body = paper.units.flatMap((u, i) => (BIB.has(u.kind) ? [] : [i]))
          const phOf = (rows, at) => JSON.stringify(rows.filter(r => r[0] === at).map(r => r.slice(1)))
          let lost = 0, gainedBody = 0, moved = 0, phMoved = 0
          const which = []
          body.forEach((mineId, theirId) => {
            const m = mineLines.get(mineId), t = theirLines.get(theirId)
            if (t?.length && !m?.length) { lost++; which.push(`lost ${theirId}`) }
            else if (m?.length && !t?.length) { gainedBody++; which.push(`gained ${theirId}`) }
            else if (m && t && JSON.stringify(m) !== JSON.stringify(t)) { moved++; which.push(`moved ${theirId}`) }
            if (phOf(lm.file.ph, mineId) !== phOf(o.ph, theirId)) phMoved++
          })
          row.vsRun = { units: body.length, theirs: o.kinds.length, lost, gainedBody, moved, phMoved, ...(process.argv.includes('--which') ? { which } : {}) }
        }
        // (the base engine's file, the pack's: its units located against this one's, the entries taken out)
        const packLayout = PACK && join(PACK, 'fixtures', `${id}-zh`, 'layout.json')
        if (packLayout && existsSync(packLayout)) {
          const theirsFile = JSON.parse(readFileSync(packLayout, 'utf8')), theirLines = new Map(theirsFile.lines.map(([u, rows]) => [u, rows]))
          const body = paper.units.flatMap((u, i) => (BIB.has(u.kind) ? [] : [i]))
          let lost = 0, gainedBody = 0, moved = 0
          const which = { lost: [], gained: [], moved: [] }
          body.forEach((mineId, theirId) => {
            const m = lines.get(mineId), t = theirLines.get(theirId)
            if (t?.length && !m?.length) { lost++; which.lost.push(`${theirId}:${paper.units[mineId].kind}`) }
            else if (m?.length && !t?.length) { gainedBody++; which.gained.push(`${theirId}:${paper.units[mineId].kind}`) }
            else if (m && t && JSON.stringify(m) !== JSON.stringify(t)) { moved++; which.moved.push(`${theirId}:${paper.units[mineId].kind}:${m.length}/${t.length}${process.argv.includes('--rows') ? ` ${JSON.stringify([...m].slice(0, 16))} ${JSON.stringify(t.slice(0, 16))}` : ''}`) }
          })
          row.vsBase = { lost, gainedBody, moved, ...(process.argv.includes('--which') ? { which } : {}) }
        }
        const w = await wrapFinal(ours, { PL, getDocument, documentOptions: { ...DOC, maxImageSize: NO_IMAGE_PIXELS }, OPS, units: paper.units, texts: made.marks.marking?.texts ?? null, deflate: x => deflateSync(x, { level: 6 }), inflate: (x, l) => inflateSync(x, { maxOutputLength: l + 1 }) })
        if (w.refused) row.wrap = w.refused
        else {
          const by = {}
          for (const [u, why] of w.unhidden ?? []) { const k = `${paper.units[u]?.kind}:${String(why).split(':')[0]}`; by[k] = (by[k] ?? 0) + 1 }
          row.unhidden = by
          row.ledger = Object.fromEntries(Object.entries(w.ledger?.classes ?? {}).filter(([c]) => ['body', 'references', 'names', 'orphan'].includes(c)).map(([c, v]) => [c, v[1]]))
          row.orphanLetters = w.ledger?.orphanLetters ?? null
          const g1 = []
          for (const p of [...entryPages].sort((x, y) => x - y)) g1.push(await apart(ours, w.bytes, p))
          row.g1 = { pages: entryPages.size, apart: g1.reduce((x, y) => x + Math.max(0, y), 0), mismatched: g1.filter(x => x < 0).length }
        }
      } else row.layout = lm.refused
      const packBase = PACK && join(PACK, 'fixtures', `${id}-zh`, 'base.pdf')
      if (packBase && existsSync(packBase)) {
        const theirsBase = new Uint8Array(readFileSync(packBase)), n = bd.doc.numPages
        let px = 0, pagesApart = 0
        for (let p = 1; p <= n; p++) { const d = await apart(theirsBase, ours, p); if (d !== 0) { pagesApart++; px += Math.max(0, d) } }
        row.vsBaseBase = { pages: n, pagesApart, px, sha: [sha(theirsBase), sha(ours)] }
      }
    } finally { await bd.close() }
  }
  console.log(JSON.stringify(row))
}
