import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { entriesOf, fontFiles, listingDigest, makePack, objectsOf, objectUrl, outputsOf, packJsonOf, pipelineOf, restorePack, sha256, summaryOf, verifyPack } from '../../lab/pdf/spikes/gate-pack.mjs'

// The rules gate's fixture pack (lab/pdf/spikes/gate-pack.mjs, Task R6): made the same on every make, restored by digest
// from a private bucket, and checked before the gate reads it. The inputs here are small synthetic files.

const ACCOUNT = '612fe563f8ba720019ffa3b35269aaa4'
const TOKEN = 'cf-token-that-must-never-be-printed'
const tmp = () => mkdtempSync(join(tmpdir(), 'gate-pack-test-'))
const put = (file: string, content: string | Uint8Array) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content) }
/** the message a promise rejects with */
const why = async (p: Promise<unknown>) => String(((await p.catch((e: Error) => e)) as Error).message)
const walk = (dir: string, rel = ''): string[] => readdirSync(dir).sort().flatMap(n => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n), `${rel}${n}/`) : [`${rel}${n}`]))

/** a tree the way the gate's folders are laid out: two outputs of one paper (one PDF between them) and one of another */
function inputs() {
  const root = tmp()
  const o = { fixtures: join(root, 'fixtures'), records: join(root, 'records'), refs: join(root, 'refs'), geometry: join(root, 'geometry'), fontsDir: join(root, 'fonts'), texmf: join(root, 'texmf') }
  for (const [name, pdf] of [['0001.00001v1-zh', 'pdf-one'], ['0001.00001v1-de', 'pdf-one'], ['0002.00002v1-zh', 'pdf-two']] as const) {
    put(join(o.fixtures, name, 'arxiv.pdf'), pdf)
    put(join(o.fixtures, name, 'layout.json'), `layout of ${name}`)
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
    expect(readFileSync(join(i.fixtures, '0001.00001v1-zh', 'layout.json'), 'utf8')).toBe('layout of 0001.00001v1-zh')
    const a = makePack({ entries, out: join(i.root, 'out-a'), pipeline: '10', made: '2026-10-08T01:00:00.000Z' })
    const b = makePack({ entries: [...entries].reverse(), out: join(i.root, 'out-b'), pipeline: '10', made: '2026-10-09T09:00:00.000Z' })
    expect(a.digest).toBe(b.digest)
    expect(a.files).toEqual(b.files)
    expect(a.digest).toBe(listingDigest(a.files))
    expect(a.files.map(f => f.path)).toEqual(paths)
    expect(walk(join(i.root, 'out-a'))).toEqual([...paths, 'manifest.json'].sort())
    for (const f of a.files) expect(statSync(join(i.root, 'out-a', f.path)).mtimeMs).toBe(0)
    expect(a.files.find(f => f.path === 'fixtures/0002.00002v1-zh/layout.json')).toMatchObject({ bytes: 'layout of 0002.00002v1-zh'.length, sha256: sha256('layout of 0002.00002v1-zh') })
  })

  it('makes it again over an earlier pack, and another digest when one byte differs', () => {
    const i = inputs()
    const out = join(i.root, 'out')
    const first = makePack({ entries: entriesOf(i), out, pipeline: '10' })
    expect(makePack({ entries: entriesOf(i), out, pipeline: '10' }).digest).toBe(first.digest)
    put(join(i.refs, '0001.00001v1-zh', 'ref.json'), 'another reference')
    expect(makePack({ entries: entriesOf(i), out, pipeline: '10' }).digest).not.toBe(first.digest)
  })

  it('refuses a pack with an input missing, naming it, and a directory that holds something else', () => {
    const i = inputs()
    put(join(i.root, 'elsewhere', 'precious.txt'), 'keep')
    expect(() => makePack({ entries: entriesOf(i), out: join(i.root, 'elsewhere'), pipeline: '10' })).toThrow(/no pack's/)
    expect(readFileSync(join(i.root, 'elsewhere', 'precious.txt'), 'utf8')).toBe('keep')
    // (a browser extension's build has a manifest.json too, and is no pack to clear)
    put(join(i.root, 'extension', 'manifest.json'), '{"manifest_version":3}')
    expect(() => makePack({ entries: entriesOf(i), out: join(i.root, 'extension'), pipeline: '10' })).toThrow(/no pack's/)
    expect(readFileSync(join(i.root, 'extension', 'manifest.json'), 'utf8')).toBe('{"manifest_version":3}')
    expect(() => entriesOf({ ...i, fonts: ['A.otf', 'Missing.otf'] })).toThrow(/Missing\.otf/)
    expect(() => outputsOf(i.records)).not.toThrow()
  })

  it('keeps one object for the files that are the same bytes, and reports the pack by kind in counts and sizes alone', () => {
    const i = inputs()
    const manifest = makePack({ entries: entriesOf(i), out: join(i.root, 'out'), pipeline: '10' })
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
    put(join(i.fixtures, '0003.00003v1-zh', 'layout.json'), 'layout of 0003.00003v1-zh')
    expect(outputsOf(i.refs)).toEqual(['0001.00001v1-de', '0001.00001v1-zh', '0002.00002v1-zh'])
    expect(entriesOf(i).some(e => e.path.includes('0003.00003v1'))).toBe(false)
    expect(() => entriesOf({ ...i, refs: i.records })).toThrow(/no frozen reference/)
  })
})

describe('the faces the pack holds', () => {
  const faces = Object.fromEntries(
    ['shs-sc-light', 'shs-sc-regular', 'shs-sc-medium', 'shs-sc-semibold', 'shs-sc-bold', 'shs-k-light', 'shs-k-regular', 'shs-k-semibold', 'shs-k-bold', 'fandolkai', 'bkai00mp', 'nimbus-roman-regular', 'cmun-serif-bold'].map(id => [id, { file: `${id}.otf` }]),
  )
  const known = [{ group: 'shs-sc', kai: 'fandolkai' }, { group: 'shs-k', kai: null }, { group: 'shs-tc', kai: 'bkai00mp' }]
  it('takes every face that is no CJK face whole, and of a CJK group the four weights its roles are built from and its Kai', () => {
    const files = fontFiles(faces, known, [{ group: 'shs-sc', kai: 'fandolkai' }])
    expect(files).toEqual(['cmun-serif-bold.otf', 'fandolkai.otf', 'nimbus-roman-regular.otf', 'shs-sc-bold.otf', 'shs-sc-light.otf', 'shs-sc-regular.otf', 'shs-sc-semibold.otf'])
  })
  it('leaves out the group no target of the pack uses, and names a face the table lacks', () => {
    const files = fontFiles(faces, known, [{ group: 'shs-sc', kai: 'fandolkai' }, { group: 'shs-k', kai: null }])
    expect(files.some(f => f.startsWith('shs-k'))).toBe(true)
    expect(files).not.toContain('bkai00mp.otf')
    expect(() => fontFiles(faces, known, [{ group: 'shs-tc', kai: 'bkai00mp' }])).toThrow(/shs-tc-light/)
  })
})

describe('the pack is restored by digest from the bucket', () => {
  /** a pack made from the synthetic inputs and a fake bucket holding its objects, with every request recorded */
  function bucket() {
    const i = inputs()
    const manifest = makePack({ entries: entriesOf(i), out: join(i.root, 'made'), pipeline: '10' })
    const pack = packJsonOf(manifest)
    const store = new Map<string, Uint8Array>()
    for (const f of pack.files) store.set(`gate-pack/${f.sha256}`, new Uint8Array(readFileSync(join(i.root, 'made', f.path))))
    const requests: { url: string; authorization: string | undefined }[] = []
    let respond: (key: string, n: number) => { status: number; body?: Uint8Array; bodyFails?: boolean } = key => (store.has(key) ? { status: 200, body: store.get(key) } : { status: 404 })
    const seen = new Map<string, number>()
    const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => {
      requests.push({ url, authorization: init.headers.authorization })
      const key = url.split('/objects/')[1]!
      const n = (seen.get(key) ?? 0) + 1
      seen.set(key, n)
      const r = respond(key, n)
      // (a body that fails is a connection that dropped after the headers: the status was 200)
      return { ok: r.status === 200, status: r.status, arrayBuffer: async () => { if (r.bodyFails) throw new TypeError('terminated'); return (r.body ?? new Uint8Array()).slice().buffer } }
    }
    return { i, pack, requests, fetchImpl, setRespond: (f: typeof respond) => { respond = f } }
  }
  const args = (b: ReturnType<typeof bucket>, over: Record<string, unknown> = {}) => ({ pack: b.pack, dir: join(b.i.root, 'restored'), token: TOKEN, account: ACCOUNT, fetchImpl: b.fetchImpl, retryMs: 0, ...over })

  it('reads each distinct object once with the token, slashes of the key as they are, checks it, and writes every path that shares it', async () => {
    const b = bucket()
    const r = await restorePack(args(b))
    expect(r).toMatchObject({ files: b.pack.files.length, fetched: new Set(b.pack.files.map(f => f.sha256)).size, kept: 0 })
    expect(b.requests.length).toBe(r.fetched)
    expect(b.requests.every(q => q.authorization === `Bearer ${TOKEN}`)).toBe(true)
    expect(b.requests[0]!.url).toMatch(new RegExp(`^https://api\\.cloudflare\\.com/client/v4/accounts/${ACCOUNT}/r2/buckets/readarxiv-ci/objects/gate-pack/[0-9a-f]{64}$`))
    expect(verifyPack({ pack: b.pack, dir: join(b.i.root, 'restored') })).toEqual([])
    expect(readFileSync(join(b.i.root, 'restored', 'fixtures/0001.00001v1-de/arxiv.pdf'), 'utf8')).toBe('pdf-one')
    // a second restore reads nothing: every file is there with its digest
    const again = await restorePack(args(b))
    expect(again).toMatchObject({ fetched: 0 })
    expect(b.requests.length).toBe(r.fetched)
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

  it('says what a missing object or a refused token means, tries a server error again, and never prints the token', async () => {
    const b = bucket()
    const logged: string[] = []
    b.setRespond(() => ({ status: 404 }))
    const e404 = await why(restorePack(args(b, { log: (l: string) => logged.push(l) })))
    expect(e404).toMatch(/HTTP 404 \(is the pack uploaded\?\)/)
    b.setRespond(() => ({ status: 403 }))
    expect(await why(restorePack(args(b)))).toMatch(/HTTP 403 \(does the token read this bucket\?\)/)
    // a 503 on the first read of each object, then the bytes
    const good = bucket()
    const before = good.requests.length
    good.setRespond((key, n) => (n === 1 ? { status: 503 } : { status: 200, body: new Uint8Array(readFileSync(join(good.i.root, 'made', good.pack.files.find(f => `gate-pack/${f.sha256}` === key)!.path))) }))
    await expect(restorePack(args(good))).resolves.toMatchObject({ files: good.pack.files.length })
    expect(good.requests.length).toBeGreaterThan(before)
    expect([e404, ...logged].join('\n')).not.toContain(TOKEN)
    await expect(restorePack(args(b, { token: undefined }))).rejects.toThrow('READARXIV_CI_TOKEN is not set')
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
    expect(message).not.toContain(TOKEN)
    // three reads of an object, the first and two more
    expect(b.requests.length).toBeGreaterThanOrEqual(3)
  })

  it('reads objects of the pack\'s bucket only, by a key that goes nowhere else', () => {
    expect(objectUrl(ACCOUNT, `r2://readarxiv-ci/gate-pack/${'a'.repeat(64)}`)).toMatch(/\/r2\/buckets\/readarxiv-ci\/objects\/gate-pack\/a{64}$/)
    expect(() => objectUrl(ACCOUNT, 'r2://other-bucket/gate-pack/x')).toThrow(/not an object of readarxiv-ci/)
    expect(() => objectUrl(ACCOUNT, 'r2://readarxiv-ci/gate-pack/../secret')).toThrow()
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
