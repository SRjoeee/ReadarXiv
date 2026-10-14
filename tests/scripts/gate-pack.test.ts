import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LAYOUT, LAYOUT_SCHEMA } from '../../src/pdf-reader/engine/layout/file.mjs'
import { entriesOf, fontFiles, inputsOfRecord, layoutOfEngine, layoutVersionOf, listingDigest, makePack, objectsOf, objectUrl, outputsOf, PACK_SCHEMA, packJsonOf, pipelineOf, RECORD_INPUTS, restorePack, s3Credentials, sha256, signV4, summaryOf, verifyPack } from '../../lab/pdf/spikes/gate-pack.mjs'

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
  const o = { fixtures: join(root, 'fixtures'), records: join(root, 'records'), refs: join(root, 'refs'), geometry: join(root, 'geometry'), fontsDir: join(root, 'fonts'), texmf: join(root, 'texmf') }
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

describe('SigV4 signing (node:crypto)', () => {
  // AWS's own "GET Object" example, "Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk"
  // (https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html): the first 10 bytes of test.txt from examplebucket.
  it('reproduces the signature AWS publishes for its GET Object example', () => {
    const signed = signV4({
      method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { range: 'bytes=0-9' },
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 's3', date: new Date('2013-05-24T00:00:00Z'),
    })
    // (the page prints the three parts joined by a bare comma; the signer joins them with ", " as the AWS SDK v3 and aws4fetch do, which the signature does not cover)
    expect(signed.authorization).toBe('AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41')
    expect(signed).toMatchObject({ range: 'bytes=0-9', 'x-amz-date': '20130524T000000Z', 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
    // (fetch sets Host from the URL: it is signed, not returned)
    expect(Object.keys(signed).some(k => k.toLowerCase() === 'host')).toBe(false)
  })
  it('signs no query string', () => {
    expect(() => signV4({ method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt?versionId=1', accessKeyId: 'k', secret: 's', region: 'auto', service: 's3', date: NOW })).toThrow(/without a query string/)
  })
})

describe('the S3 credentials are derived from the token', () => {
  const verified = (over: Record<string, unknown> = {}, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => ({ success: true, result: { id: KEY_ID, status: 'active' }, ...over }), arrayBuffer: async () => new ArrayBuffer(0) })

  it('asks Cloudflare once who the token is, with the token as a Bearer, and takes sha256 of its value as the secret', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = []
    const fetchImpl = async (url: string, init: { headers: Record<string, string> }) => { seen.push({ url, headers: init.headers }); return verified()() }
    expect(await s3Credentials({ token: TOKEN, account: ACCOUNT, fetchImpl })).toEqual({ accessKeyId: KEY_ID, secret: SECRET })
    expect(seen).toEqual([{ url: VERIFY_URL, headers: { authorization: `Bearer ${TOKEN}` } }])
  })

  it.each([
    ['an inactive token', verified({ result: { id: KEY_ID, status: 'expired' } })],
    ['success: false', verified({ success: false })],
    ['an id that is no 32 hex', verified({ result: { id: 'not-a-token-id', status: 'active' } })],
    ['an upper-case id', verified({ result: { id: KEY_ID.toUpperCase(), status: 'active' } })],
    ['a 401', verified({ success: false }, 401)],
    ['a 403', verified({ success: false }, 403)],
  ])('refuses %s, naming neither the token nor its digest', async (_name, fetchImpl) => {
    const message = await why(s3Credentials({ token: TOKEN, account: ACCOUNT, fetchImpl, retryMs: 0 }))
    expect(message).toMatch(/^the token is not an active Account API token of this account \(HTTP \d{3}\)$/)
    expect(message).not.toContain(TOKEN)
    expect(message).not.toContain(SECRET)
  })

  it('tries a server error or a failed body again twice, and a 4xx not at all', async () => {
    let calls = 0
    const flaky = async () => { calls++; if (calls === 1) return { ok: false, status: 503, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }; if (calls === 2) return { ok: true, status: 200, json: async () => { throw new TypeError('terminated') }, arrayBuffer: async () => new ArrayBuffer(0) }; return verified()() }
    expect(await s3Credentials({ token: TOKEN, account: ACCOUNT, fetchImpl: flaky, retryMs: 0 })).toEqual({ accessKeyId: KEY_ID, secret: SECRET })
    expect(calls).toBe(3)
    calls = 0
    const never = async () => { calls++; return verified({}, 503)() }
    const message = await why(s3Credentials({ token: TOKEN, account: ACCOUNT, fetchImpl: never, retryMs: 0 }))
    expect(message).toMatch(/\(HTTP 503\)$/)
    expect(calls).toBe(3)
    calls = 0
    await why(s3Credentials({ token: TOKEN, account: ACCOUNT, fetchImpl: async () => { calls++; return verified({}, 401)() }, retryMs: 0 }))
    expect(calls).toBe(1)
  })

  it('refuses a token with white space in it before any request, naming neither the token nor its digest', async () => {
    let calls = 0
    const fetchImpl = async () => { calls++; return verified()() }
    for (const token of [`${TOKEN}\n`, ` ${TOKEN}`, `${TOKEN} x`]) {
      const message = await why(s3Credentials({ token, account: ACCOUNT, fetchImpl, retryMs: 0 }))
      expect(message).toBe('READARXIV_CI_TOKEN has white space in it: set the token alone')
      expect(message).not.toContain(TOKEN)
      expect(message).not.toContain(sha256(token))
    }
    expect(calls).toBe(0)
  })

  it('refuses a request that fails outright without the token in the message', async () => {
    const message = await why(s3Credentials({ token: TOKEN, account: ACCOUNT, fetchImpl: async () => { throw new TypeError(`fetch failed for ${TOKEN}`) }, retryMs: 0 }))
    expect(message).not.toContain(TOKEN)
    expect(await why(s3Credentials({ token: TOKEN, account: 'nope', fetchImpl: verified() }))).toMatch(/account id/)
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
