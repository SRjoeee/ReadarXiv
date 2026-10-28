import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAYOUT, LAYOUT_SCHEMA } from '../../src/pdf-reader/engine/layout/file.mjs'
import { signV4 } from '../../scripts/r2-read.mjs'
import { BASE_RECORD_SCHEMA, baseRecordOf, baseRecordOfMade, checkCompileImage, keptLayoutOf, COMPILE_IMAGES_FILE, compileImageOf, compileImagesOf, localImageDigests, packPathsOf, entriesOf, fontFiles, inputsOfRecord, layoutOfEngine, layoutVersionOf, listingDigest, makePack, objectsOf, objectUrl, outputsOf, PACK_SCHEMA, packJsonOf, pipelineOf, RECORD_INPUTS, restorePack, sha256, summaryOf, verifyPack } from '../../lab/pdf/spikes/gate-pack.mjs'

// The rules gate's fixture pack (lab/pdf/spikes/gate-pack.mjs, Task R6): made the same on every make, restored by digest
// from a private bucket, and checked before the gate reads it. The inputs here are small synthetic files.

const ACCOUNT = '612fe563f8ba720019ffa3b35269aaa4'
const TOKEN = 'cf-token-that-must-never-be-printed'
/** the token id Cloudflare's verify endpoint answers with (the S3 access key id) */
const KEY_ID = '0123456789abcdef0123456789abcdef'
const SECRET = sha256(TOKEN)
const VERIFY_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/tokens/verify`
/** the layout files' version of the synthetic fixtures */
const LAYOUT_V = { schema: 2, version: '4' }
const layoutText = (name: string, schema: unknown = LAYOUT_V.schema, layout: unknown = LAYOUT_V.version) => JSON.stringify({ schema, layout, name })
const NOW = new Date('2026-10-13T08:30:15.123Z')
const tmp = () => mkdtempSync(join(tmpdir(), 'gate-pack-test-'))
const put = (file: string, content: string | Uint8Array) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content) }
/** the message a promise rejects with */
const why = async (p: Promise<unknown>) => String(((await p.catch((e: Error) => e)) as Error).message)
const walk = (dir: string, rel = ''): string[] => readdirSync(dir).sort().flatMap(n => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), `${rel}${n}/`) : [`${rel}${n}`]))

/** a tree the way the gate's folders are laid out: two outputs of one paper (one PDF between them) and one of another */
function inputs() {
  const root = tmp()
  const o = { fixtures: join(root, 'fixtures'), records: join(root, 'records'), refs: join(root, 'refs'), geometry: join(root, 'geometry'), fontsDir: join(root, 'fonts'), texmf: join(root, 'texmf'), sources: join(root, 'sources') }
  for (const [name, pdf] of [['0001.00001v1-zh', 'pdf-one'], ['0001.00001v1-de', 'pdf-one'], ['0002.00002v1-zh', 'pdf-two']] as const) {
    put(join(o.fixtures, name, 'arxiv.pdf'), pdf)
    put(join(o.fixtures, name, 'layout.json'), layoutText(name))
    put(join(o.records, name, 'units.json'), JSON.stringify({ pipeline: '10', units: [] }))
    put(join(o.records, name, 'record.json'), `record of ${name}`)
    put(join(o.refs, name, 'ref.json'), `ref of ${name}`)
    put(join(o.refs, name, 'layout.json'), `kept layout of ${name}`)
  }
  put(join(o.geometry, '0001.00001v1-zh-geometry.json'), 'geometry one')
  put(join(o.geometry, '0002.00002v1-zh-geometry.json'), 'geometry two')
  put(join(o.fontsDir, 'A.otf'), 'font a')
  put(join(o.fontsDir, 'B.otf'), 'font b')
  put(join(o.texmf, 'tex/generic/hyphen/hyphen.tex'), 'patterns en')
  return { root, ...o, fonts: ['A.otf', 'B.otf'], patterns: { en: 'tex/generic/hyphen/hyphen.tex' } }
}

describe('the pack is the same on every make', () => {
  it('lists the files sorted, copies them with their mtimes at the epoch, and digests the listing, not the clock', () => {
    const i = inputs()
    const entries = entriesOf(i)
    const paths = entries.map(e => e.path)
    expect(paths).toEqual([...paths].sort())
    expect(paths).toContain('geometry/0002.00002v1-zh-geometry.json')
    expect(paths).toContain('texmf/tex/generic/hyphen/hyphen.tex')
    expect(paths).toContain('data/fonts/A.otf')
    // the translations are the records' files, in the fixtures' folder where the gate reads them
    expect(readFileSync(join(i.fixtures, '0001.00001v1-zh', 'layout.json'), 'utf8')).toBe(layoutText('0001.00001v1-zh'))
    const a = makePack({ entries, out: join(i.root, 'out-a'), pipeline: '10', layout: LAYOUT_V, made: '2026-10-08T01:00:00.000Z' })
    const b = makePack({ entries: [...entries].reverse(), out: join(i.root, 'out-b'), pipeline: '10', layout: LAYOUT_V, made: '2026-10-09T09:00:00.000Z' })
    expect(a.digest).toBe(b.digest)
    expect(a.files).toEqual(b.files)
    expect(a.digest).toBe(listingDigest(a.files))
    expect(a.files.map(f => f.path)).toEqual(paths)
    expect(walk(join(i.root, 'out-a'))).toEqual([...paths, 'manifest.json'].sort())
    for (const f of a.files) expect(statSync(join(i.root, 'out-a', f.path)).mtimeMs).toBe(0)
    expect(a.files.find(f => f.path === 'fixtures/0002.00002v1-zh/layout.json')).toMatchObject({ bytes: layoutText('0002.00002v1-zh').length, sha256: sha256(layoutText('0002.00002v1-zh')) })
  })

  it('makes it again over an earlier pack, and another digest when one byte differs', () => {
    const i = inputs()
    const out = join(i.root, 'out')
    const first = makePack({ entries: entriesOf(i), out, pipeline: '10', layout: LAYOUT_V })
    expect(makePack({ entries: entriesOf(i), out, pipeline: '10', layout: LAYOUT_V }).digest).toBe(first.digest)
    put(join(i.refs, '0001.00001v1-zh', 'ref.json'), 'another reference')
    expect(makePack({ entries: entriesOf(i), out, pipeline: '10', layout: LAYOUT_V }).digest).not.toBe(first.digest)
  })

  it('refuses a pack with an input missing, naming it, and a directory that holds something else', () => {
    const i = inputs()
    put(join(i.root, 'elsewhere', 'precious.txt'), 'keep')
    expect(() => makePack({ entries: entriesOf(i), out: join(i.root, 'elsewhere'), pipeline: '10', layout: LAYOUT_V })).toThrow(/no pack's/)
    expect(readFileSync(join(i.root, 'elsewhere', 'precious.txt'), 'utf8')).toBe('keep')
    // (a browser extension's build has a manifest.json too, and is no pack to clear)
    put(join(i.root, 'extension', 'manifest.json'), '{"manifest_version":3}')
    expect(() => makePack({ entries: entriesOf(i), out: join(i.root, 'extension'), pipeline: '10', layout: LAYOUT_V })).toThrow(/no pack's/)
    expect(readFileSync(join(i.root, 'extension', 'manifest.json'), 'utf8')).toBe('{"manifest_version":3}')
    expect(() => entriesOf({ ...i, fonts: ['A.otf', 'Missing.otf'] })).toThrow(/Missing\.otf/)
    expect(() => outputsOf(i.records)).not.toThrow()
  })

  it('clears the pack of the schema before this one, which a schema bump must not leave in the way', () => {
    const i = inputs()
    const out = join(i.root, 'out')
    put(join(out, 'fixtures', 'stale', 'layout.json'), 'old')
    put(join(out, 'manifest.json'), JSON.stringify({ schema: 1, pipeline: '10', made: 'x', digest: listingDigest([{ path: 'fixtures/stale/layout.json', sha256: sha256('old'), bytes: 3 }]), files: [{ path: 'fixtures/stale/layout.json', sha256: sha256('old'), bytes: 3 }] }))
    makePack({ entries: entriesOf(i), out, pipeline: '10', layout: LAYOUT_V })
    expect(walk(out).some(p => p.includes('stale'))).toBe(false)
  })

  it('keeps one object for the files that are the same bytes, and reports the pack by kind in counts and sizes alone', () => {
    const i = inputs()
    const manifest = makePack({ entries: entriesOf(i), out: join(i.root, 'out'), pipeline: '10', layout: LAYOUT_V })
    const pack = packJsonOf(manifest)
    const objects = objectsOf(pack)
    expect(objects.length).toBe(new Set(manifest.files.map(f => f.sha256)).size)
    expect(objects.length).toBeLessThan(manifest.files.length)
    expect(pack.files[0]!.url).toBe(`r2://readarxiv-ci/gate-pack/${pack.files[0]!.sha256}`)
    const s = summaryOf(manifest.files)
    expect(s.files).toBe(manifest.files.length)
    expect(s.objects).toBe(objects.length)
    expect(s.kinds.map(k => k.kind)).toContain('fixtures/arxiv.pdf')
    expect(s.kinds.find(k => k.kind === 'fixtures/arxiv.pdf')).toMatchObject({ files: 3 })
  })
})

describe('the pack\'s outputs are the frozen references', () => {
  // the gate requires a reference of each output it runs: that is the set the pack holds, and an output that has a reference and
  // lacks any other file is a make that fails, not one that goes without it
  it('fails the make for an output whose layout file is missing, naming it', () => {
    const i = inputs()
    rmSync(join(i.fixtures, '0002.00002v1-zh', 'layout.json'))
    const message = (() => { try { entriesOf(i); return '' } catch (e) { return (e as Error).message } })()
    expect(message).toMatch(/missing 1 input:/)
    expect(message).toContain('fixtures/0002.00002v1-zh/layout.json')
    // the other outputs' files are not named, and nothing is made
    expect(message).not.toContain('0001.00001v1')
  })
  it('names every file that is missing, of every output, and not only the first', () => {
    const i = inputs()
    rmSync(join(i.fixtures, '0001.00001v1-de', 'layout.json'))
    rmSync(join(i.fixtures, '0002.00002v1-zh', 'arxiv.pdf'))
    rmSync(join(i.records, '0002.00002v1-zh', 'units.json'))
    rmSync(join(i.geometry, '0001.00001v1-zh-geometry.json'))
    const message = (() => { try { entriesOf(i); return '' } catch (e) { return (e as Error).message } })()
    // (the de output takes the zh output's geometry, so both name it)
    expect(message).toMatch(/missing 5 inputs:/)
    for (const named of ['fixtures/0001.00001v1-de/layout.json', 'fixtures/0002.00002v1-zh/arxiv.pdf', 'fixtures/0002.00002v1-zh/units.json', '0001.00001v1-zh: no geometry', '0001.00001v1-de: no geometry']) expect(message).toContain(named)
  })
  it('fails for an output whose fixture folder is gone altogether', () => {
    const i = inputs()
    rmSync(join(i.fixtures, '0002.00002v1-zh'), { recursive: true })
    expect(() => entriesOf(i)).toThrow(/fixtures\/0002\.00002v1-zh\/arxiv\.pdf.*\n.*fixtures\/0002\.00002v1-zh\/layout\.json/)
  })
  it('holds the outputs that have a reference, and none that was merely made', () => {
    const i = inputs()
    put(join(i.fixtures, '0003.00003v1-zh', 'arxiv.pdf'), 'pdf-three')
    put(join(i.fixtures, '0003.00003v1-zh', 'layout.json'), layoutText('0003.00003v1-zh'))
    expect(outputsOf(i.refs)).toEqual(['0001.00001v1-de', '0001.00001v1-zh', '0002.00002v1-zh'])
    expect(entriesOf(i).some(e => e.path.includes('0003.00003v1'))).toBe(false)
    expect(() => entriesOf({ ...i, refs: i.records })).toThrow(/no frozen reference/)
  })
})

// BUNDLE 8 (design note §3.1): a fixture's layout made over our base page, the final pass of the marked original, holds that page
// beside arXiv's PDF and its record, base.json, which names the page's digest and the layout file's: a make checks the three
// against each other, so that a layout file is never packed beside another page than the one it was made over
describe('our base pages the layout files were made over', () => {
  const n = '0001.00001v1-zh'
  /** a fixture's base page of ours and its record, over its layout file as it is */
  function withBase(i: ReturnType<typeof inputs>, page = 'our base page', more: Record<string, unknown> = {}) {
    const layout = readFileSync(join(i.fixtures, n, 'layout.json'))
    put(join(i.fixtures, n, 'base.pdf'), page)
    const record = { schema: BASE_RECORD_SCHEMA, source: 'ours', base: { bytes: page.length, sha256: sha256(page), xref: 3, pages: 1, tree: '2025', check: { pages: [1, 1], boxes: 'equal', carried: 1 } }, layout: { sha256: sha256(layout), bytes: layout.length }, ...more }
    put(join(i.fixtures, n, 'base.json'), JSON.stringify(record))
    return record
  }
  const message = (i: ReturnType<typeof inputs>) => { try { entriesOf(i); return '' } catch (e) { return (e as Error).message } }

  it('keeps the marking\'s texts in base.json, which the gate\'s wrap is given (a pack that drops them leaves a cell\'s lead macro the original\'s)', async () => {
    const made = { source: 'ours' as const, head: { source: 'ours', bytes: 3, sha256: sha256('our'), xref: 1, pages: 1, tree: '2025', check: {} } }
    expect(baseRecordOfMade({ made, layout: Buffer.from('l'), texts: ['\\bert', 'BERT'] })).toMatchObject({ texts: ['\\bert', 'BERT'] })
    expect('texts' in baseRecordOfMade({ made, layout: Buffer.from('l') })).toBe(false)
    const i = inputs()
    put(join(i.sources, '0001.00001v1', 'source.gz'), 'the source')
    withBase(i, 'our base page', { texts: ['\\bert', 'BERT'] })
    expect(baseRecordOf(join(i.fixtures, n))).toMatchObject({ texts: ['\\bert', 'BERT'] })
    const { textsOf } = await import('../../lab/pdf/spikes/layer-gate/wrap.mjs')
    expect(textsOf(join(i.fixtures, n, 'base.pdf'))).toEqual(['\\bert', 'BERT'])
    // (texts not pairs of strings: refused)
    withBase(i, 'our base page', { texts: ['\\bert'] })
    expect(() => baseRecordOf(join(i.fixtures, n))).toThrow(/texts/)
  })
  it('keeps the marking\'s inkless macros in base.json beside its texts, as the wrap is given them, and refuses a list the marks would not hold', async () => {
    const made = { source: 'ours' as const, head: { source: 'ours', bytes: 3, sha256: sha256('our'), xref: 1, pages: 1, tree: '2025', check: {} } }
    expect(baseRecordOfMade({ made, layout: Buffer.from('l'), inkless: ['\\boldmath'] })).toMatchObject({ inkless: ['\\boldmath'] })
    expect('inkless' in baseRecordOfMade({ made, layout: Buffer.from('l') })).toBe(false)
    const i = inputs()
    put(join(i.sources, '0001.00001v1', 'source.gz'), 'the source')
    withBase(i, 'our base page', { inkless: ['\\boldmath'] })
    expect(baseRecordOf(join(i.fixtures, n))).toMatchObject({ inkless: ['\\boldmath'] })
    const { inklessOf } = await import('../../lab/pdf/spikes/layer-gate/wrap.mjs')
    expect(inklessOf(join(i.fixtures, n, 'base.pdf'))).toEqual(['\\boldmath'])
    // (not distinct sources of 1 to 200 code units, at most 64: refused — Devin on #482)
    for (const bad of [['\\boldmath', '\\boldmath'], [''], [3], Array.from({ length: 65 }, (_, k) => `\\m${k}`)]) {
      withBase(i, 'our base page', { inkless: bad })
      expect(() => baseRecordOf(join(i.fixtures, n))).toThrow(/inkless/)
    }
  })
  it('packs base.pdf and base.json beside arxiv.pdf where the fixture has them, and none where it has not', () => {
    const i = inputs()
    const record = withBase(i)
    // (no source for a base of ours: the make names it missing)
    expect(() => entriesOf(i)).toThrow(/sources\/0001\.00001v1\/source\.gz/)
    put(join(i.sources, '0001.00001v1', 'source.gz'), 'the source')
    expect(baseRecordOf(join(i.fixtures, n))).toEqual(record)
    // (the image named: its tree's pin, each base page made on the year production compiles its paper on)
    for (const tree of ['2025', '2023']) {
      const j = inputs()
      const pinned = withBase(j, 'our base page', { image: compileImagesOf().images[tree]?.texlive })
      ;(pinned.base as { tree: string }).tree = tree
      put(join(j.fixtures, n, 'base.json'), JSON.stringify(pinned))
      expect(baseRecordOf(join(j.fixtures, n)), tree).toMatchObject({ image: compileImagesOf().images[tree]?.texlive })
    }
    expect(baseRecordOf(join(i.fixtures, '0001.00001v1-de'))).toBeNull()
    const paths = entriesOf(i).map(e => e.path)
    expect(paths).toContain(`fixtures/${n}/base.pdf`)
    expect(paths).toContain(`fixtures/${n}/base.json`)
    expect(paths.filter(p => /\/base\.(?:pdf|json)$/.test(p))).toHaveLength(2)
    // (a base of ours carries its paper's source, which the gate wraps it from; one a paper; none for a fixture of no base)
    expect(paths.filter(p => p.startsWith('sources/'))).toEqual(['sources/0001.00001v1/source.gz'])
    const manifest = makePack({ entries: entriesOf(i), out: join(i.root, 'out'), pipeline: '10', layout: LAYOUT_V })
    expect(manifest.files.find(f => f.path === `fixtures/${n}/base.pdf`)).toMatchObject({ sha256: sha256('our base page') })
  })

  it('refuses a base page that is not its record\'s, a layout file not made over it, a page with no record, a record of no page', () => {
    const cases: [string, (i: ReturnType<typeof inputs>) => void, RegExp][] = [
      ['other bytes', i => { withBase(i); put(join(i.fixtures, n, 'base.pdf'), 'another page') }, /base\.pdf is not the page base\.json names/],
      ['another layout', i => { withBase(i); put(join(i.fixtures, n, 'layout.json'), layoutText('other')) }, /layout\.json is not the layout base\.json names, made over base\.pdf/],
      ['no record', i => { put(join(i.fixtures, n, 'base.pdf'), 'our base page') }, /base\.pdf with no base\.json/],
      ['no page', i => { withBase(i); rmSync(join(i.fixtures, n, 'base.pdf')) }, /there is no base\.pdf/],
      ['no head', i => { withBase(i, 'our base page', { base: { bytes: 13, sha256: sha256('our base page') } }) }, /not a head's base of ours/],
      ['no source', i => { withBase(i, 'our base page', { source: 'theirs' }) }, /names no source/],
      ['another schema', i => { withBase(i, 'our base page', { schema: 2 }) }, /not of schema 1/],
      ['another year\'s image', i => { withBase(i, 'our base page', { image: compileImagesOf().images['2023']?.texlive }) }, /not the pinned image of TeX Live 2025/],
      ['no image', i => { withBase(i, 'our base page', { image: 'texlive/texlive:latest' }) }, /not the pinned image of TeX Live 2025/],
    ]
    for (const [what, make, why] of cases) {
      const i = inputs()
      make(i)
      expect(message(i), what).toMatch(why)
      expect(message(i), what).toContain(`${n}: `)
    }
  })

  it('keeps the layout file of a paper whose base page of ours was refused, made over arXiv\'s PDF before, outside the version check', () => {
    const i = inputs()
    put(join(i.fixtures, n, 'layout.json'), layoutText(n, LAYOUT_V.schema, '3'))
    const kept = readFileSync(join(i.fixtures, n, 'layout.json'))
    put(join(i.fixtures, n, 'base.json'), JSON.stringify({ schema: BASE_RECORD_SCHEMA, source: 'arxiv', why: 'carry', detail: '80 of our 100 lines found on arXiv\'s PDF, under 90 %', layout: { sha256: sha256(kept), bytes: kept.length } }))
    expect(baseRecordOf(join(i.fixtures, n))).toMatchObject({ source: 'arxiv', why: 'carry' })
    expect(entriesOf(i).map(e => e.path)).toContain(`fixtures/${n}/base.json`)
    expect(entriesOf(i).map(e => e.path)).not.toContain(`fixtures/${n}/base.pdf`)
    expect(layoutVersionOf(i.fixtures, ['0001.00001v1-zh', '0001.00001v1-de', '0002.00002v1-zh'], LAYOUT_V)).toEqual(LAYOUT_V)
    // (a refusal that keeps no layout, or keeps another, or comes with a page of ours, is no fixture)
    for (const [record, page, why] of [[{ layout: null }, null, /no layout file is kept/], [{ layout: { sha256: sha256('x'), bytes: 1 } }, null, /not the kept layout/], [{}, 'a page', /there is a base\.pdf/], [{ why: '' }, null, /no why/]] as const) {
      const j = inputs()
      put(join(j.fixtures, n, 'base.json'), JSON.stringify({ schema: BASE_RECORD_SCHEMA, source: 'arxiv', why: 'carry', layout: { sha256: sha256(readFileSync(join(j.fixtures, n, 'layout.json'))), bytes: readFileSync(join(j.fixtures, n, 'layout.json')).length }, ...record }))
      if (page) put(join(j.fixtures, n, 'base.pdf'), page)
      expect(message(j)).toMatch(why)
    }
  })
})

// layer-fixtures.mjs writes base.json from what it made (baseRecordOfMade); where our base page is refused, the fixture keeps the
// layout file it held, an older maker's over arXiv's PDF (keptLayoutOf), and the record names it, so that a make packs it
describe('the base record a make of the fixtures writes', () => {
  const n = '0001.00001v1-zh'
  const HEAD = { source: 'ours', bytes: 13, sha256: sha256('our base page'), xref: 3, pages: 1, tree: '2025', check: { pages: [1, 1], boxes: 'equal', carried: 1 } }
  it('names our base page and the layout made over it, or why there is none and the layout kept in its place', () => {
    const i = inputs(), layout = readFileSync(join(i.fixtures, n, 'layout.json'))
    put(join(i.fixtures, n, 'base.pdf'), 'our base page')
    const ours = baseRecordOfMade({ made: { source: 'ours', head: HEAD }, layout, image: compileImagesOf().images['2025']?.texlive ?? null })
    put(join(i.fixtures, n, 'base.json'), JSON.stringify(ours))
    expect(baseRecordOf(join(i.fixtures, n))).toMatchObject({ source: 'ours', base: { sha256: sha256('our base page') }, layout: { sha256: sha256(layout), bytes: layout.length } })
    // (refused: the layout file kept, named; none kept, null, which a make refuses)
    const j = inputs(), keptBytes = readFileSync(join(j.fixtures, n, 'layout.json'))
    const kept = baseRecordOfMade({ made: { source: 'arxiv', why: 'carry', detail: 'x' }, layout: keptBytes, image: null })
    put(join(j.fixtures, n, 'base.json'), JSON.stringify(kept))
    expect(kept).toEqual({ schema: BASE_RECORD_SCHEMA, source: 'arxiv', why: 'carry', detail: 'x', layout: { sha256: sha256(keptBytes), bytes: keptBytes.length } })
    expect(baseRecordOf(join(j.fixtures, n))).toMatchObject({ source: 'arxiv', why: 'carry' })
    const k = inputs()
    put(join(k.fixtures, n, 'base.json'), JSON.stringify(baseRecordOfMade({ made: { source: 'arxiv', why: 'carry', detail: 'x' }, layout: null, image: null })))
    expect(() => baseRecordOf(join(k.fixtures, n))).toThrow(/no layout file is kept/)
  })

  it('keeps a layout file of an older maker (made over arXiv\'s PDF, below LAYOUT 12), never one made over a base page of ours (LAYOUT 12 on)', () => {
    const file = (layout: string) => new TextEncoder().encode(JSON.stringify({ schema: 5, layout }))
    expect(keptLayoutOf(file('9'), '12')).toEqual(file('9'))
    expect(keptLayoutOf(file('12'), '12')).toBeNull()
    // from LAYOUT 12 on a file is written over a base page of ours: after the engine moves on (13) a 12 is still no older maker's
    // over arXiv's PDF, and drawn over arxiv.pdf its coordinates would be the wrong page's; 11 is the last made over arXiv's
    expect(keptLayoutOf(file('12'), '13')).toBeNull()
    expect(keptLayoutOf(file('13'), '13')).toBeNull()
    expect(keptLayoutOf(file('11'), '13')).toEqual(file('11'))
    expect(keptLayoutOf(file('9'), '13')).toEqual(file('9'))
    // a token with no number says nothing of its maker
    expect(keptLayoutOf(file('x'), '13')).toBeNull()
    expect(keptLayoutOf(null, '12')).toBeNull()
    expect(keptLayoutOf(new TextEncoder().encode('not json'), '12')).toBeNull()
  })
})

describe('the faces the pack holds', () => {
  const faces = Object.fromEntries(
    ['shs-sc-regular', 'shs-sc-medium', 'shs-sc-bold', 'shs-k-regular', 'shs-k-bold', 'fandolkai', 'bkai00mp', 'nimbus-roman-regular', 'cmun-serif-bold'].map(id => [id, { file: `${id}.otf` }]),
  )
  const known = [{ group: 'shs-sc' }, { group: 'shs-k' }, { group: 'shs-tc' }]
  it('takes every face that is no CJK face whole, and of a CJK group the two weights its roles are built from; no Kai', () => {
    const files = fontFiles(faces, known, [{ group: 'shs-sc' }])
    expect(files).toEqual(['cmun-serif-bold.otf', 'nimbus-roman-regular.otf', 'shs-sc-bold.otf', 'shs-sc-regular.otf'])
  })
  it('leaves out the group no target of the pack uses, and names a face the table lacks', () => {
    const files = fontFiles(faces, known, [{ group: 'shs-sc' }, { group: 'shs-k' }])
    expect(files.some(f => f.startsWith('shs-k'))).toBe(true)
    expect(files).not.toContain('bkai00mp.otf')
    expect(files).not.toContain('fandolkai.otf')
    expect(() => fontFiles(faces, known, [{ group: 'shs-tc' }])).toThrow(/shs-tc-regular/)
  })
})

describe('the pack is restored by digest from the bucket', () => {
  type Req = { url: string; headers: Record<string, string> }
  /** a pack made from the synthetic inputs and a fake bucket holding its objects (and Cloudflare's verify endpoint), with every request recorded */
  function bucket() {
    const i = inputs()
    const manifest = makePack({ entries: entriesOf(i), out: join(i.root, 'made'), pipeline: '10', layout: LAYOUT_V })
    const pack = packJsonOf(manifest)
    const store = new Map<string, Uint8Array>()
    for (const f of pack.files) store.set(`gate-pack/${f.sha256}`, new Uint8Array(readFileSync(join(i.root, 'made', f.path))))
    const requests: Req[] = []
    const verifies: Req[] = []
    let respond: (key: string, n: number) => { status: number; body?: Uint8Array; bodyFails?: boolean } = key => (store.has(key) ? { status: 200, body: store.get(key) } : { status: 404 })
    const seen = new Map<string, number>()
    const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => {
      if (url === VERIFY_URL) { verifies.push({ url, headers: init.headers }); return { ok: true, status: 200, json: async () => ({ success: true, result: { id: KEY_ID, status: 'active' } }), arrayBuffer: async () => new ArrayBuffer(0) } }
      requests.push({ url, headers: init.headers })
      const key = url.split('/readarxiv-ci/')[1]!
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      const r = respond(key, n)
      // (a body that fails is a connection that dropped after the headers: the status was 200)
      return { ok: r.status === 200, status: r.status, json: async () => ({}), arrayBuffer: async () => { if (r.bodyFails) throw new TypeError('terminated'); return (r.body ?? new Uint8Array()).slice().buffer } }
    }
    return { i, pack, requests, verifies, fetchImpl, setRespond: (f: typeof respond) => { respond = f } }
  }
  const args = (b: ReturnType<typeof bucket>, over: Record<string, unknown> = {}) => ({ pack: b.pack, dir: join(b.i.root, 'restored'), token: TOKEN, account: ACCOUNT, fetchImpl: b.fetchImpl, retryMs: 0, now: () => NOW, ...over })
  /** every secret-bearing value a request or a message could carry */
  const leaks = (text: string, requests: Req[]) => [TOKEN, SECRET, ...requests.map(q => q.headers.authorization).filter((a): a is string => !!a && !a.startsWith('Bearer')), ...requests.map(q => /Signature=([0-9a-f]+)/.exec(q.headers.authorization ?? '')?.[1]).filter((s): s is string => !!s)].filter(v => text.includes(v))

  it('asks Cloudflare once who the token is, then reads each distinct object once from the S3 endpoint, signed, checks it, and writes every path that shares it', async () => {
    const b = bucket()
    const r = await restorePack(args(b))
    expect(r).toMatchObject({ files: b.pack.files.length, fetched: new Set(b.pack.files.map(f => f.sha256)).size, kept: 0 })
    expect(b.verifies).toEqual([{ url: VERIFY_URL, headers: { authorization: `Bearer ${TOKEN}` } }])
    expect(b.requests.length).toBe(r.fetched)
    for (const q of b.requests) {
      expect(q.url).toMatch(new RegExp(`^https://${ACCOUNT}\\.r2\\.cloudflarestorage\\.com/readarxiv-ci/gate-pack/[0-9a-f]{64}$`))
      expect(q.headers.authorization).not.toContain('Bearer')
      expect(Object.keys(q.headers).sort()).toEqual(['authorization', 'x-amz-content-sha256', 'x-amz-date'])
      // the headers are the signer's, which the AWS vector proved, over the derived key and the injected clock
      expect(q.headers).toEqual(signV4({ method: 'GET', url: q.url, accessKeyId: KEY_ID, secret: SECRET, region: 'auto', service: 's3', date: NOW }))
      expect(q.headers['x-amz-date']).toBe('20261013T083015Z')
    }
    expect(verifyPack({ pack: b.pack, dir: join(b.i.root, 'restored') })).toEqual([])
    expect(readFileSync(join(b.i.root, 'restored', 'fixtures/0001.00001v1-de/arxiv.pdf'), 'utf8')).toBe('pdf-one')
    // a second restore reads nothing, and asks nothing: every file is there with its digest
    const again = await restorePack(args(b))
    expect(again).toMatchObject({ fetched: 0 })
    expect(b.requests.length).toBe(r.fetched)
    expect(b.verifies.length).toBe(1)
  })

  it('signs each read with the clock of that read', async () => {
    const b = bucket()
    let t = Date.parse('2026-10-13T08:30:00Z') / 1000
    await restorePack(args(b, { now: () => new Date(t++ * 1000 + 1000) }))
    const stamps = b.requests.map(q => q.headers['x-amz-date']!)
    expect(new Set(stamps).size).toBe(stamps.length)
  })

  it('refuses bytes that are not the manifest\'s, writing nothing of them', async () => {
    const b = bucket()
    b.setRespond((key, n) => ({ status: 200, body: new TextEncoder().encode(`tampered ${key.length} ${n}`.padEnd(12, 'x')) }))
    await expect(restorePack(args(b))).rejects.toThrow(/not the manifest's/)
    // (a worker that met bad bytes wrote none of them; the others may have finished the objects they held)
    const written = existsSync(join(b.i.root, 'restored')) ? walk(join(b.i.root, 'restored')) : []
    expect(verifyPack({ pack: b.pack, dir: join(b.i.root, 'restored') }).length).toBeGreaterThan(0)
    expect(written.length).toBeLessThan(b.pack.files.length)
  })

  it('says what a missing object or a refused key means, tries a server error again, and never prints the token, the secret or a signature', async () => {
    const b = bucket()
    const logged: string[] = []
    b.setRespond(() => ({ status: 404 }))
    const e404 = await why(restorePack(args(b, { log: (l: string) => logged.push(l) })))
    expect(e404).toMatch(/HTTP 404 \(is the pack uploaded\?\)/)
    b.setRespond(() => ({ status: 403 }))
    const e403 = await why(restorePack(args(b)))
    expect(e403).toMatch(/HTTP 403 \(does the token read this bucket\?\)/)
    // a 503 on the first read of each object, then the bytes
    const good = bucket()
    const before = good.requests.length
    good.setRespond((key, n) => (n === 1 ? { status: 503 } : { status: 200, body: new Uint8Array(readFileSync(join(good.i.root, 'made', good.pack.files.find(f => `gate-pack/${f.sha256}` === key)!.path))) }))
    // (each attempt is signed with the clock of that attempt: the clock advances a second at every call)
    let tick = 0
    await expect(restorePack(args(good, { now: () => new Date(NOW.getTime() + 1000 * tick++) }))).resolves.toMatchObject({ files: good.pack.files.length })
    expect(good.requests.length).toBeGreaterThan(before)
    const byKey = Map.groupBy(good.requests, q => q.url)
    for (const [, [first, second]] of byKey) {
      expect(first!.headers['x-amz-date']).not.toBe(second!.headers['x-amz-date'])
      expect(first!.headers.authorization).not.toBe(second!.headers.authorization)
    }
    expect(b.requests.length).toBeGreaterThan(0)
    expect(leaks([e404, e403, ...logged].join('\n'), [...b.requests, ...good.requests])).toEqual([])
    await expect(restorePack(args(b, { token: undefined }))).rejects.toThrow('READARXIV_CI_TOKEN is not set')
    await expect(restorePack(args(b, { token: `${TOKEN}\n` }))).rejects.toThrow('READARXIV_CI_TOKEN has white space in it')
  })

  it('tries a read again when the body fails after a 200, as it does for a server error', async () => {
    const b = bucket()
    const whole = (key: string) => new Uint8Array(readFileSync(join(b.i.root, 'made', b.pack.files.find(f => `gate-pack/${f.sha256}` === key)!.path)))
    // the first read of each object drops its connection while the body is read, the second is whole
    b.setRespond((key, n) => ({ status: 200, body: whole(key), bodyFails: n === 1 }))
    const r = await restorePack(args(b))
    expect(r).toMatchObject({ files: b.pack.files.length, fetched: new Set(b.pack.files.map(f => f.sha256)).size })
    expect(b.requests.length).toBe(2 * r.fetched)
    expect(verifyPack({ pack: b.pack, dir: join(b.i.root, 'restored') })).toEqual([])
  })

  it('gives up on a body that never reads, saying the request failed and never the token', async () => {
    const b = bucket()
    b.setRespond(() => ({ status: 200, bodyFails: true }))
    const message = await why(restorePack(args(b)))
    expect(message).toMatch(/r2:\/\/readarxiv-ci\/gate-pack\/[0-9a-f]{64}: the request failed$/)
    expect(leaks(message, b.requests)).toEqual([])
    // three reads of an object, the first and two more
    expect(b.requests.length).toBeGreaterThanOrEqual(3)
  })

  it('reads objects of the pack\'s bucket only, by a key that goes nowhere else', () => {
    expect(objectUrl(ACCOUNT, `r2://readarxiv-ci/gate-pack/${'a'.repeat(64)}`)).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/readarxiv-ci/gate-pack/${'a'.repeat(64)}`)
    // (every segment escaped once, the slashes between them literal)
    expect(objectUrl(ACCOUNT, 'r2://readarxiv-ci/gate-pack/a.b_c-d')).toMatch(/\/readarxiv-ci\/gate-pack\/a\.b_c-d$/)
    expect(() => objectUrl(ACCOUNT, 'r2://other-bucket/gate-pack/x')).toThrow(/not an object of readarxiv-ci/)
    expect(() => objectUrl(ACCOUNT, 'r2://readarxiv-ci/gate-pack/../secret')).toThrow()
    expect(() => objectUrl(ACCOUNT, 'r2://readarxiv-ci/gate-pack//x')).toThrow()
    expect(() => objectUrl(ACCOUNT, 'r2://readarxiv-ci/gate-pack/x y')).toThrow()
    expect(() => objectUrl(ACCOUNT, 'https://example.com/gate-pack/x')).toThrow()
    expect(() => objectUrl('not-an-account', 'r2://readarxiv-ci/gate-pack/x')).toThrow(/account id/)
  })

  it('finds a file changed, missing or added after the restore', async () => {
    const b = bucket()
    await restorePack(args(b))
    const dir = join(b.i.root, 'restored')
    expect(verifyPack({ pack: b.pack, dir })).toEqual([])
    writeFileSync(join(dir, 'data/fonts/A.otf'), 'font a, changed')
    put(join(dir, 'extra.json'), '{}')
    const problems = verifyPack({ pack: b.pack, dir })
    expect(problems.join('\n')).toMatch(/data\/fonts\/A\.otf: not the manifest's bytes/)
    expect(problems.join('\n')).toMatch(/extra\.json: not in the manifest/)
  })
})

describe('the PIPELINE the pack is made under', () => {
  it('is the one version every units.json names, and a units.json that names none stops the make', () => {
    const dir = tmp()
    const put = (name: string, units: unknown) => { mkdirSync(join(dir, name), { recursive: true }); writeFileSync(join(dir, name, 'units.json'), JSON.stringify(units)) }
    put('a-zh', { pipeline: '10', units: [] })
    put('b-ja', { pipeline: '10', units: [] })
    expect(pipelineOf(dir, ['a-zh', 'b-ja'])).toBe('10')
    put('c-ko', { units: [] })
    expect(() => pipelineOf(dir, ['a-zh', 'b-ja', 'c-ko'])).toThrow(/c-ko: units\.json names no PIPELINE version/)
    put('d-de', { pipeline: 'undefined', units: [] })
    expect(() => pipelineOf(dir, ['a-zh', 'd-de'])).toThrow(/d-de/)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('the pack names its layout files\' version, and the engine\'s own holds it', () => {
  const names = ['0001.00001v1-zh', '0001.00001v1-de', '0002.00002v1-zh']

  it('is the schema and version every layout file names, which are the engine\'s: the manifest carries them', () => {
    const i = inputs()
    expect(layoutVersionOf(i.fixtures, names, LAYOUT_V)).toEqual(LAYOUT_V)
    const manifest = makePack({ entries: entriesOf(i), out: join(i.root, 'out'), pipeline: '10', layout: LAYOUT_V })
    expect(manifest.schema).toBe(PACK_SCHEMA)
    expect(manifest.layout).toEqual(LAYOUT_V)
    expect(packJsonOf(manifest).layout).toEqual(LAYOUT_V)
    expect(JSON.parse(readFileSync(join(i.root, 'out', 'manifest.json'), 'utf8')).layout).toEqual(LAYOUT_V)
    expect(() => makePack({ entries: entriesOf(i), out: join(i.root, 'out2'), pipeline: '10' } as never)).toThrow(/schema and version/)
  })

  it('refuses a layout set that is mixed, naming each output that differs and what its file says', () => {
    const i = inputs()
    put(join(i.fixtures, '0001.00001v1-de', 'layout.json'), layoutText('x', 1, '2'))
    put(join(i.fixtures, '0002.00002v1-zh', 'layout.json'), layoutText('y', 2, '3'))
    const message = (() => { try { layoutVersionOf(i.fixtures, names, LAYOUT_V); return '' } catch (e) { return (e as Error).message } })()
    expect(message).toMatch(/^2 layout files not of the engine's version \(schema 2, layout "4"\)/)
    expect(message).toContain('0001.00001v1-de: schema 1, layout "2"')
    expect(message).toContain('0002.00002v1-zh: schema 2, layout "3"')
    expect(message).not.toContain('0001.00001v1-zh:')
  })

  it('refuses a set of the old schema throughout, and a file that is no layout file', () => {
    const i = inputs()
    for (const n of names) put(join(i.fixtures, n, 'layout.json'), layoutText(n, 1, '4'))
    expect(() => layoutVersionOf(i.fixtures, names, LAYOUT_V)).toThrow(/3 layout files.*\n.*schema 1, layout "4"/)
    put(join(i.fixtures, names[0]!, 'layout.json'), 'not json')
    rmSync(join(i.fixtures, names[1]!, 'layout.json'))
    expect(() => layoutVersionOf(i.fixtures, names, LAYOUT_V)).toThrow(/0001\.00001v1-zh: not a layout file[\s\S]*0001\.00001v1-de: not a layout file/)
  })

  it('refuses to restore a pack of the schema before this one, asking no one', async () => {
    const calls: string[] = []
    const old = { schema: 1, pipeline: '10', made: 'x', digest: 'x', bucket: 'readarxiv-ci', files: [] }
    const message = await why(restorePack({ pack: old as never, dir: tmp(), token: TOKEN, account: ACCOUNT, fetchImpl: (async (u: string) => { calls.push(u); throw new Error('no') }) as never, retryMs: 0 }))
    expect(message).toMatch(/schema 1, this script reads 2/)
    expect(calls).toEqual([])
  })

  it('reads the engine\'s version from its file.mjs, so that a make against another tree names that tree\'s', async () => {
    expect(await layoutOfEngine(join(import.meta.dirname, '../..'))).toEqual({ schema: LAYOUT_SCHEMA, version: LAYOUT })
  })

  // The pack the CI gate restores is held to the engine here: a pull request that moves the layout file (file.mjs LAYOUT or
  // LAYOUT_SCHEMA) and leaves the pack as it was fails this test, and the gate would fail on the same files, unread, in CI.
  it('holds the committed gate-pack.json to the engine\'s layout file', () => {
    const pack = JSON.parse(readFileSync(join(import.meta.dirname, '../../lab/pdf/gate-pack.json'), 'utf8'))
    const remake = 'the layout file moved and gate-pack.json did not: re-make the pack (node lab/pdf/spikes/gate-pack.mjs make, after the fixtures are made again with this engine), upload its new objects (gate-pack.mjs objects), and commit the new gate-pack.json (lab/pdf/README.md, "The pack")'
    expect(pack.schema, 'the pack\'s schema').toBe(PACK_SCHEMA)
    expect(pack.layout?.schema, remake).toBe(LAYOUT_SCHEMA)
    expect(pack.layout?.version, remake).toBe(LAYOUT)
  })
})

describe('the compile images are pinned by digest, a TeX Live year each, one value for the packs and the web container', () => {
  const pins = () => JSON.parse(readFileSync(COMPILE_IMAGES_FILE, 'utf8'))
  const withPins = (mutate: (j: { default: string; images: { 2025: Record<string, unknown>; 2023: Record<string, unknown>; [year: string]: Record<string, unknown> } }) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'compile-images-'))
    const j = pins()
    mutate(j)
    writeFileSync(join(dir, 'compile-images.json'), JSON.stringify(j))
    return join(dir, 'compile-images.json')
  }
  const PACKS = join(import.meta.dirname, '../../lab/pdf')

  it('holds each committed pack\'s compileImage to its year\'s pin (gate-pack.json the default year\'s, its year implicit)', () => {
    const files = readdirSync(PACKS).filter(n => /^gate-pack(?:\.\d{4})?\.json$/.test(n))
    expect(files).toContain('gate-pack.json')
    for (const n of files) {
      const pack = JSON.parse(readFileSync(join(PACKS, n), 'utf8'))
      const year = /^gate-pack\.(\d{4})\.json$/.exec(n)?.[1] ?? compileImagesOf().default
      const { year: named = compileImagesOf().default, ...pin } = pack.compileImage
      expect(named, `${n}: the pack names another TeX Live year than its file`).toBe(year)
      expect(pin, `${n}: the pack was made on another compile image than its year's pin: re-make the pack (gate-pack.mjs make --year=${year})`).toEqual(compileImageOf(year))
    }
  })

  it('is three images by digest, a snapshot that is null or dated, and the TeX format, for each year; the default by default', () => {
    const all = compileImagesOf()
    expect(all.default).toBe('2025')
    expect(Object.keys(all.images).sort()).toEqual(['2023', '2025'])
    expect(compileImageOf()).toEqual(all.images['2025'])
    expect(compileImageOf(2023)).toEqual(all.images['2023'])
    for (const c of [compileImageOf(), compileImageOf('2023')]) {
      for (const k of ['texlive', 'base', 'node'] as const) expect(c[k]).toMatch(/^[a-z0-9./_-]+(:[A-Za-z0-9._-]+)?@sha256:[0-9a-f]{64}$/)
      expect(c.aptSnapshot === null || /^\d{8}T\d{6}Z$/.test(c.aptSnapshot)).toBe(true)
    }
    expect(compileImageOf().texFormat).toMatchObject({ texlive: 2025, pdftex: '1.40.28' })
    expect(compileImageOf('2023')).toMatchObject({ texlive: 'texlive/texlive@sha256:2f2c860f230355ecd0c94ddf4398b315648c6c547b92086db2c02e26c3d98392', texFormat: { texlive: 2023, banner: 'TeX Live 2023', pdftex: '1.40.25' } })
    expect(() => compileImageOf('2019')).toThrow(/no image is pinned for TeX Live 2019/)
  })

  it('refuses a file that is not that: a tag with no digest, a short digest, another key, a bad snapshot, a year not its own, an OS of its own', () => {
    expect(() => compileImageOf(null, withPins(j => { j.images['2025'].node = 'node:22-trixie-slim' }))).toThrow(/2025: node must be name\[:tag\]@sha256/)
    expect(() => compileImageOf(null, withPins(j => { j.images['2023'].texlive = 'texlive/texlive@sha256:7792b1f7' }))).toThrow(/2023: texlive must be/)
    expect(() => compileImageOf(null, withPins(j => { j.images['2025'].extra = 1 }))).toThrow(/2025: the keys must be/)
    expect(() => compileImageOf(null, withPins(j => { j.images['2025'].aptSnapshot = 'yesterday' }))).toThrow(/aptSnapshot/)
    expect(() => compileImageOf(null, withPins(j => { j.images['2025'].texFormat = 3 }))).toThrow(/texFormat/)
    expect(() => compileImageOf(null, withPins(j => { (j.images['2023'].texFormat as { texlive: number }).texlive = 2025 }))).toThrow(/2023: texFormat\.texlive must be 2023/)
    expect(() => compileImageOf(null, withPins(j => { j.images.latest = j.images['2025'] }))).toThrow(/keyed by TeX Live year/)
    expect(() => compileImageOf(null, withPins(j => { j.default = '2024' }))).toThrow(/default must name one of the images/)
    expect(() => compileImageOf(null, withPins(j => { (j as Record<string, unknown>).extra = 1 }))).toThrow(/the keys must be default, images/)
    // (one OS refresh moves every image: the base, Node and the snapshot are the same in each)
    expect(() => compileImageOf(null, withPins(j => { j.images['2023'].aptSnapshot = '20261001T000000Z' }))).toThrow(/aptSnapshot must be the same in every image/)
    expect(() => compileImageOf(null, withPins(j => { j.images['2023'].base = `debian:trixie-slim@sha256:${'0'.repeat(64)}` }))).toThrow(/base must be the same in every image/)
  })

  it('checks the local image\'s repo digests against the year\'s pin, and says what it found', () => {
    const c = compileImageOf(), want = c.texlive.slice(c.texlive.indexOf('@') + 1)
    expect(() => checkCompileImage(c, ['sha256:' + '0'.repeat(64), want])).not.toThrow()
    expect(() => checkCompileImage(c, ['sha256:' + '0'.repeat(64)])).toThrow(/not the pinned sha256:7056390e.*TeX Live 2025/)
    expect(() => checkCompileImage(c, [])).toThrow(/not there/)
    const old = compileImageOf('2023'), oldWant = old.texlive.slice(old.texlive.indexOf('@') + 1)
    expect(() => checkCompileImage(old, [oldWant])).not.toThrow()
    expect(() => checkCompileImage(old, [want])).toThrow(/not the pinned sha256:2f2c860f.*TeX Live 2023/)
  })

  it('refuses a make when COMPILE_IMAGE names another image than the year\'s pin, or COMPILE_YEAR another year', () => {
    const c = compileImageOf(), want = c.texlive.slice(c.texlive.indexOf('@') + 1)
    expect(() => checkCompileImage(c, [want], { COMPILE_IMAGE: `texlive/texlive@sha256:${'e'.repeat(64)}` })).toThrow(/not the pin/)
    expect(() => checkCompileImage(c, [want], { COMPILE_IMAGE: c.texlive })).not.toThrow()
    expect(() => checkCompileImage(c, [want], { COMPILE_YEAR: '2023' })).toThrow(/COMPILE_YEAR 2023 is not the pack's year, 2025/)
    expect(() => checkCompileImage(c, [want], { COMPILE_YEAR: '2025' })).not.toThrow()
  })

  it('asks docker for the repo digests of the reference, and refuses where docker cannot answer', () => {
    const asked: string[][] = []
    const run = ((cmd: string, args: string[]) => { asked.push([cmd, ...args]); return JSON.stringify(['texlive/texlive@sha256:' + 'a'.repeat(64)]) }) as never
    expect(localImageDigests('texlive/texlive:latest', run)).toEqual(['sha256:' + 'a'.repeat(64)])
    expect(asked[0]).toEqual(['docker', 'image', 'inspect', '--format', '{{json .RepoDigests}}', 'texlive/texlive:latest'])
    expect(localImageDigests('x:y', (() => 'null') as never)).toEqual([])
    expect(() => localImageDigests('x:y', (() => { throw Object.assign(new Error('boom'), { stderr: 'Error: No such image: x:y\n' }) }) as never)).toThrow(/cannot ask docker for x:y \(Error: No such image: x:y\)/)
  })

  it('writes the pin with its year into the manifest and its committed copy, and leaves the listing digest as it was', () => {
    const i = inputs()
    const c = { year: '2023', ...compileImageOf('2023') }
    const plain = makePack({ entries: entriesOf(i), out: join(i.root, 'plain'), pipeline: '10', layout: LAYOUT_V, made: '2026-10-08T01:00:00.000Z' })
    const pinned = makePack({ entries: entriesOf(i), out: join(i.root, 'pinned'), pipeline: '10', layout: LAYOUT_V, compileImage: c, made: '2026-10-08T01:00:00.000Z' })
    expect(plain.compileImage).toBeUndefined()
    expect(pinned.compileImage).toEqual(c)
    expect(packJsonOf(pinned).compileImage).toEqual(c)
    expect(pinned.digest).toBe(plain.digest)
  })

  it('names a year\'s pack, its folder and its record: the default year\'s as before, another year\'s by its year', () => {
    expect(packPathsOf('2025', '2025')).toEqual({ json: 'lab/pdf/gate-pack.json', out: 'lab/pdf/out/gate-pack', record: 'lab/pdf/records/layer-gate.json' })
    expect(packPathsOf('2023', '2025')).toEqual({ json: 'lab/pdf/gate-pack.2023.json', out: 'lab/pdf/out/gate-pack.2023', record: 'lab/pdf/records/layer-gate.2023.json' })
  })
})

describe('a make takes its inputs from the committed record', () => {
  const root = '/r/lab/pdf', repo = '/r'
  const record = { inputs: { fixtures: 'out/layer-gate/fixtures/abc', records: 'out/layer-gate/cut/records', refs: 'out/layer-gate/cut/refs', geometry: 'out/layer-gate/cut/geometry' } }
  const there = (...paths: string[]) => (p: string) => paths.includes(p)

  it('resolves each relative path under lab/pdf, the base the gate shows its paths by', () => {
    const out = inputsOfRecord(record, { root, repo, exists: there('/r/lab/pdf/out/layer-gate/fixtures/abc', '/r/lab/pdf/out/layer-gate/cut/records', '/r/lab/pdf/out/layer-gate/cut/refs', '/r/lab/pdf/out/layer-gate/cut/geometry') })
    expect(out).toEqual({ fixtures: '/r/lab/pdf/out/layer-gate/fixtures/abc', records: '/r/lab/pdf/out/layer-gate/cut/records', refs: '/r/lab/pdf/out/layer-gate/cut/refs', geometry: '/r/lab/pdf/out/layer-gate/cut/geometry' })
  })

  it('has one base for a relative path: a folder of the same name under the repository is not a second candidate', () => {
    // both /r/lab/pdf/out/x and /r/out/x exist; the record's `out/x` is the first, and the second is never looked at
    const asked: string[] = []
    const exists = (p: string) => { asked.push(p); return true }
    const out = inputsOfRecord({ inputs: { fixtures: 'out/x', records: 'out/x', refs: 'out/x', geometry: 'out/x' } }, { root, repo, exists })
    expect(Object.values(out)).toEqual(['/r/lab/pdf/out/x', '/r/lab/pdf/out/x', '/r/lab/pdf/out/x', '/r/lab/pdf/out/x'])
    expect(asked.every(p => p.startsWith('/r/lab/pdf/'))).toBe(true)
    // and a path that is only under the repository is missing, not found there
    expect(() => inputsOfRecord(record, { root, repo, exists: there('/r/out/layer-gate/fixtures/abc') })).toThrow(/inputs\.fixtures.*\/r\/lab\/pdf\/out\/layer-gate\/fixtures\/abc/)
  })

  it('takes a home path and an absolute path as they are, and a flag (relative to the repository) in place of the record\'s', () => {
    const r = { inputs: { ...record.inputs, fixtures: '~/made/fx', records: '/abs/records' } }
    const out = inputsOfRecord(r, { root, repo, home: '/h', flags: { refs: 'elsewhere/refs', geometry: null }, exists: there('/h/made/fx', '/abs/records', '/r/lab/pdf/out/layer-gate/cut/geometry') })
    expect(out).toEqual({ fixtures: '/h/made/fx', records: '/abs/records', refs: '/r/elsewhere/refs', geometry: '/r/lab/pdf/out/layer-gate/cut/geometry' })
  })

  it('stops, naming the input, for a path that is nowhere, one the gate could not show, and one the record lacks', () => {
    expect(() => inputsOfRecord(record, { root, repo, exists: () => false })).toThrow(/inputs\.fixtures.*out\/layer-gate\/fixtures\/abc.*--fixtures=/)
    expect(() => inputsOfRecord({ inputs: { ...record.inputs, refs: '<scratch>/refs' } }, { root, repo, exists: () => true })).toThrow(/inputs\.refs.*no path/)
    expect(() => inputsOfRecord({ inputs: { fixtures: 'a' } }, { root, repo, exists: () => true })).toThrow(/names no inputs\.records/)
    expect(() => inputsOfRecord(null, { root, repo, exists: () => true })).toThrow(/names no inputs\.fixtures/)
  })

  it('reads the four inputs of the committed record, whose fixtures are the made ones of a key, not a digest this file holds', () => {
    const real = JSON.parse(readFileSync(join(import.meta.dirname, '../../lab/pdf/records/layer-gate.json'), 'utf8'))
    for (const n of RECORD_INPUTS) expect(typeof real.inputs[n], n).toBe('string')
    expect(() => inputsOfRecord(real, { root, repo, exists: () => true })).not.toThrow()
    const source = readFileSync(join(import.meta.dirname, '../../lab/pdf/spikes/gate-pack.mjs'), 'utf8')
    expect(source).not.toMatch(/fixtures\/[0-9a-f]{16}/)
  })
})
