// experiments/pdf-bilingual/spikes/addon-check.mjs
// The paper's shipped add-on (layout/addon.mjs paperAddon; A2's E3, its proof "the shipped add-on is the gate's, byte for
// byte, on the five papers"), made in Node from each paper's arXiv PDF and made layout file, against the add-on the layer
// gate made for it before the maker moved into the engine (out/layer-gate/removal/<key>/shipped.pdf and
// shipped-manifest.json: the gate's cache, keyed by arXiv's bytes, the layout file and the digest of the remover's files
// as they were at --base). Checked, for each paper:
//   - arXiv's bytes then the tail are the cached shipped.pdf, byte for byte;
//   - the manifest, as JSON.stringify writes it, is the cached shipped-manifest.json's text, byte for byte;
//   - the manifest is the shipped form (none of the check's keys), and parseAddonManifest reads it back to itself;
//   - the layout file is the same bytes for every target the fixtures hold (one add-on a paper whatever the target).
// Recorded: the add-on's size, the manifest's, and the maker's time by step (a reading). Exits 1 on any difference.
//   pnpm exec tsx experiments/pdf-bilingual/spikes/addon-check.mjs [--base=<commit>] [--fixtures=<digest>]
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { constants as zlibConstants, deflateSync, inflateRawSync, inflateSync } from 'node:zlib'
import * as PL from '@cantoo/pdf-lib'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

const ROOT = new URL('..', import.meta.url).pathname, REPO = new URL('../../..', import.meta.url).pathname
const ENGINE = join(REPO, 'src/pdf-reader/engine')
const arg = name => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3)
/** the commit whose remover made the cached add-ons (the gate digests the remover's files into the cache's key): the tree this
 *  branch was cut from. The default lives as long as those caches (out/layer-gate/removal/ keyed by that digest); once
 *  they are gone, name the commit whose caches are held */
const BASE = arg('base') ?? '2dadca7e'
const FIXTURES = join(ROOT, 'out/layer-gate/fixtures', arg('fixtures') ?? '41795914c3c84238'), REMOVALS = join(ROOT, 'out/layer-gate/removal')
const PAPERS = ['1512.03385v1', '1706.03762v7', '1810.04805v2', '2307.16209v1', '2608.04322v1']
const { paperAddon } = await import(join(ENGINE, 'layout/addon.mjs'))
const { parseAddonManifest } = await import(join(ENGINE, 'layout/addon-manifest.mjs'))
const { indexLayout, parseLayout } = await import(join(ENGINE, 'layout/file.mjs'))

const sha256 = b => createHash('sha256').update(b).digest('hex')
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
/** the gate's removerDigest at BASE: those four files as git holds them there, joined as the gate joins them */
const REMOVER_FILES = ['src/pdf-reader/engine/layout/remove.mjs', 'src/pdf-reader/engine/layout/ink.mjs', 'src/pdf-reader/engine/layout/file.mjs', 'src/pdf-reader/engine/layer-proto/removal.mjs']
const baseDigest = sha256(REMOVER_FILES.map(f => execFileSync('git', ['-C', REPO, 'show', `${BASE}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 })).join('\n')).slice(0, 16)
// (no more than limit + 1 bytes out, or a throw: the remover's contract, its page refused either way; the gate's)
const inflate = (b, limit) => {
  const o = { finishFlush: zlibConstants.Z_SYNC_FLUSH, maxOutputLength: limit + 1 }
  try { return new Uint8Array(inflateSync(b, o)) } catch (e) { if (e?.code === 'ERR_BUFFER_TOO_LARGE') throw e; return new Uint8Array(inflateRawSync(b.subarray(2), o)) }
}
const deflate = b => new Uint8Array(deflateSync(b))
const PDFJS = join(REPO, 'node_modules/pdfjs-dist')
const openNode = data => getDocument({ data: data.slice(), verbosity: 0, cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDFJS}/standard_fonts/`, useSystemFonts: false }).promise

console.log(`the cached add-ons: the gate's, at ${BASE} (remover digest ${baseDigest}); fixtures ${FIXTURES.slice(FIXTURES.lastIndexOf('/') + 1)}`)
let failed = 0
for (const name of PAPERS) {
  const problems = []
  const dir = join(FIXTURES, `${name}-zh`)
  const bytes = new Uint8Array(readFileSync(join(dir, 'arxiv.pdf')))
  const layoutBytes = new Uint8Array(readFileSync(join(dir, 'layout.json')))
  // one add-on a paper: every target's layout file is the same bytes
  const targets = readdirSync(FIXTURES).filter(n => n.startsWith(`${name}-`) && existsSync(join(FIXTURES, n, 'layout.json')))
  const layouts = new Set(targets.map(n => sha256(readFileSync(join(FIXTURES, n, 'layout.json')))))
  if (layouts.size !== 1) problems.push(`${targets.length} targets hold ${layouts.size} layout files`)
  const key = sha256([sha256(bytes), sha256(layoutBytes), baseDigest].join('|')).slice(0, 24)
  const cached = join(REMOVALS, key)
  if (!existsSync(join(cached, 'shipped.pdf')) || !existsSync(join(cached, 'shipped-manifest.json'))) { console.log(`FAIL ${name}: no cached add-on ${key}`); failed++; continue }
  const cachedPdf = new Uint8Array(readFileSync(join(cached, 'shipped.pdf'))), cachedManifest = readFileSync(join(cached, 'shipped-manifest.json'), 'utf8')

  const doc = await openNode(bytes)
  const index = indexLayout(parseLayout(layoutBytes))
  const t = performance.now()
  const r = await paperAddon({ bytes, index, doc, OPS, PL, deflate, inflate })
  const total = performance.now() - t
  try { await doc.loadingTask.destroy() } catch {}
  if (!r.ok) { console.log(`FAIL ${name}: refused: ${r.refused}`); failed++; continue }

  const whole = new Uint8Array(bytes.length + r.tail.length)
  whole.set(bytes)
  whole.set(r.tail, bytes.length)
  if (!same(whole, cachedPdf)) {
    let at = 0
    while (at < whole.length && at < cachedPdf.length && whole[at] === cachedPdf[at]) at++
    problems.push(`arXiv's bytes then the tail (${whole.length}) are not the cached add-on (${cachedPdf.length}): first difference at byte ${at}`)
  }
  const text = JSON.stringify(r.manifest)
  if (text !== cachedManifest) {
    let at = 0
    while (at < text.length && at < cachedManifest.length && text[at] === cachedManifest[at]) at++
    problems.push(`the manifest (${text.length}) is not the cached one (${cachedManifest.length}): first difference at character ${at}: ${JSON.stringify(text.slice(Math.max(0, at - 40), at + 60))} against ${JSON.stringify(cachedManifest.slice(Math.max(0, at - 40), at + 60))}`)
  }
  const checkKeys = ['outlines', 'colours'].filter(k => k in r.manifest)
  if (checkKeys.length || Object.keys(r.manifest.sets).length) problems.push(`the manifest holds the check's: ${checkKeys.join(', ')} ${Object.keys(r.manifest.sets).join(', ')}`)
  try { if (JSON.stringify(parseAddonManifest(new TextEncoder().encode(text), { pages: index.file.paper.pages, views: index.file.views, shipped: true })) !== text) problems.push('parseAddonManifest read another manifest') } catch (e) { problems.push(`parseAddonManifest refused it: ${e.message}`) }

  if (problems.length) failed++
  const pages = Object.values(r.manifest.page)
  const count = f => pages.filter(f).length
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}: ${r.manifest.pages} pages (${count(e => e.ok && e.at)} with R, ${count(e => e.ok && !e.at)} clean, ${count(e => !e.ok)} not removed), tail ${r.tail.length} bytes, manifest ${text.length} bytes, cache ${key}; ${Math.round(total)} ms (${Object.entries(r.ms).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')})${problems.length ? `\n  ${problems.join('\n  ')}` : ''}`)
}
console.log(failed ? `FAIL ${failed} of ${PAPERS.length} papers differ` : `every one of ${PAPERS.length} papers: the tail and the manifest are the gate's, byte for byte`)
process.exit(failed ? 1 : 0)
