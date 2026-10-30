// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { BUNDLE, readBundle, VTAG } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { LAYOUT } from '@/pdf-reader/engine/layout/file.mjs'
import { PDFJS, PIPELINE_VERSION, REMOVAL } from '@/pdf-reader/engine/pipeline/versions.mjs'
import { type Answer, layerApi, loadSample, mode, serves, WHY } from './layer-api.mjs'

// The stand-in of the layer API (tests/e2e/lib/layer-api.mjs) holds to the contract the web's API gives the reader, and
// serves the sample paper's bundle, which the engine of this tree reads: the reader's browser checks stand on both

const sample = loadSample()
const decode = (a: Answer) => ('body' in a ? new TextDecoder().decode(a.body) : '')
const jsonOf = (a: Answer) => JSON.parse(decode(a))
const BUNDLE_PATH = `/api/v1/layer/${sample.segment}/${VTAG}`
const get = (api: ReturnType<typeof layerApi>, path: string, headers: Record<string, string> = {}) => api.handle({ method: 'GET', path, headers })
const prepare = (api: ReturnType<typeof layerApi>, headers: Record<string, string> = { 'content-type': 'application/json' }, body: string = '{}', path = `${BUNDLE_PATH}/prepare`) =>
  api.handle({ method: 'POST', path, headers, body: new TextEncoder().encode(body) })
/** a clock the test moves */
const clock = () => { let t = 1_000; return { now: () => t, advance: (ms: number) => { t += ms } } }

describe('the sample the stand-in serves', () => {
  it('has a bundle the engine of this tree reads whole, made under its versions (else: pnpm exec tsx scripts/make-sample-bundle.mjs)', () => {
    const read = readBundle(sample.bundle)
    expect(read.dropped).toEqual([])
    expect(read.layout).not.toBeNull()
    expect(read.rules).not.toBeNull()
    expect(read.versions).toEqual({ bundle: BUNDLE, pipeline: PIPELINE_VERSION, layout: LAYOUT, removal: REMOVAL, pdfjs: PDFJS, image: read.versions.image })
    expect(VTAG).toBe(`b${BUNDLE}-j${PDFJS}-p${PIPELINE_VERSION}-l${LAYOUT}-r${REMOVAL}`)
  })

  it('has a bundle over the stand-in PDF it serves: its bytes and fingerprint, its address, its pages', () => {
    const read = readBundle(sample.bundle)
    expect(read.base).toEqual({ bytes: sample.pdf.length, sha256: createHash('sha256').update(sample.pdf).digest('hex'), url: `/api/v1/original/${sample.segment}` })
    expect(read.paper).toEqual({ id: sample.id, version: sample.version, pages: 4 })
    // a PDF's header, and an identifier no arXiv paper has (there is no month 00)
    expect(new TextDecoder().decode(sample.pdf.subarray(0, 5))).toBe('%PDF-')
    expect(sample.id).toMatch(/^\d\d00\.\d{5}$/)
  })
})

describe('the layer routes, the bundle ready', () => {
  it('answers a GET with the bundle, cached for good', () => {
    const a = get(layerApi({ sample }), BUNDLE_PATH)
    expect(a).toMatchObject({ status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=31536000, immutable' } })
    expect('body' in a && a.body).toEqual(sample.bundle)
  })

  it('answers a prepare with { ready: true }', () => {
    const a = prepare(layerApi({ sample }))
    expect(a).toMatchObject({ status: 200, headers: { 'cache-control': 'no-store' } })
    expect(jsonOf(a)).toEqual({ ready: true })
  })

  it('answers another version tag 404 unknown-versions, for five minutes, on a GET and on a prepare alike', () => {
    const api = layerApi({ sample })
    for (const a of [get(api, `/api/v1/layer/${sample.segment}/b0-j0-p0-l0-r0`), prepare(api, undefined, undefined, `/api/v1/layer/${sample.segment}/b0-j0-p0-l0-r0/prepare`)]) {
      expect(a).toMatchObject({ status: 404, headers: { 'cache-control': 'public, max-age=300' } })
      expect(jsonOf(a)).toEqual({ why: 'unknown-versions' })
    }
  })

  it('answers a paper it does not hold 404, as one it has no source for', () => {
    const a = get(layerApi({ sample }), `/api/v1/layer/1706.03762v7/${VTAG}`)
    expect(a).toMatchObject({ status: 404 })
    expect(jsonOf(a)).toEqual({ why: 'no-source' })
  })

  it('takes a prepare only as Content-Type: application/json (else 415) with the body {} (JSON that is not {} is 400)', () => {
    const api = layerApi({ sample })
    for (const a of [prepare(api, { 'content-type': 'text/plain' }), prepare(api, {}), prepare(api, { 'content-type': 'application/jsonp' }), prepare(api, { 'content-type': 'text/plain; charset=utf-8' })]) {
      expect(a).toMatchObject({ status: 415, headers: { 'cache-control': 'no-store' } })
      expect(jsonOf(a)).toEqual({ why: 'unsupported-media-type' })
    }
    for (const body of ['{"a":1}', 'nope', '[]', '', 'null', '{"a":1', '[{}]']) {
      const a = prepare(api, { 'content-type': 'application/json' }, body)
      expect(a, body).toMatchObject({ status: 400, headers: { 'cache-control': 'no-store' } })
      expect(jsonOf(a)).toEqual({ why: 'bad-request' })
    }
    // (the media type as a browser spells it: in any case, and with parameters)
    for (const type of ['Application/JSON', 'application/json; charset=utf-8', ' application/json ;charset=UTF-8']) expect(prepare(api, { 'content-type': type }), type).toMatchObject({ status: 200 })
    // (and the vtag and the paper are judged first: another vtag is unknown-versions whatever the body is)
    expect(prepare(api, { 'content-type': 'text/plain' }, 'x', `/api/v1/layer/${sample.segment}/b0/prepare`)).toMatchObject({ status: 404 })
  })

  it('serves three routes and no other path', () => {
    expect(serves(BUNDLE_PATH)).toBe(true)
    expect(serves(`${BUNDLE_PATH}/prepare`)).toBe(true)
    expect(serves(`/api/v1/original/${sample.segment}`)).toBe(true)
    for (const path of ['/api/v1/', '/api/v1/nothing', '/api/v1/layer/x', `${BUNDLE_PATH}/prepare/more`, `${BUNDLE_PATH}/extra/more`, '/api/v1/original/a/b', '/api/v2/layer/x/y', '/']) expect(serves(path), path).toBe(false)
  })

  it('answers every miss in JSON, and a wrong method with the method that is right', () => {
    const api = layerApi({ sample })
    const miss = get(api, '/api/v1/nothing')
    expect(miss).toMatchObject({ status: 404, headers: { 'content-type': 'application/json' } })
    expect(jsonOf(miss)).toEqual({ why: 'not-found' })
    expect(api.handle({ method: 'POST', path: BUNDLE_PATH, headers: { 'content-type': 'application/json' }, body: new TextEncoder().encode('{}') })).toMatchObject({ status: 405, headers: { allow: 'GET' } })
    expect(get(api, `${BUNDLE_PATH}/prepare`)).toMatchObject({ status: 405, headers: { allow: 'POST' } })
    expect(api.handle({ method: 'DELETE', path: `/api/v1/original/${sample.segment}`, headers: {} })).toMatchObject({ status: 405 })
  })

  it('marks every answer nosniff and cross-origin, a JSON one sandboxed, and none with credentials', () => {
    const api = layerApi({ sample })
    const answers = [
      get(api, BUNDLE_PATH), prepare(api), get(api, '/api/v1/nothing'), get(api, `/api/v1/layer/${sample.segment}/b0`),
      get(api, `/api/v1/original/${sample.segment}`), get(api, '/api/v1/original/1706.03762v7'), prepare(api, {}),
      layerApi({ sample }).set({ layer: mode.refused() }).handle({ method: 'GET', path: BUNDLE_PATH }),
    ]
    for (const a of answers) {
      expect('headers' in a).toBe(true)
      if (!('headers' in a)) continue
      expect(a.headers['x-content-type-options']).toBe('nosniff')
      expect(a.headers['access-control-allow-origin']).toBe('*')
      expect(a.headers['access-control-allow-credentials']).toBeUndefined()
      if (a.headers['content-type'] === 'application/json') expect(a.headers['content-security-policy']).toBe('sandbox')
    }
  })
})

describe('the original route', () => {
  const path = `/api/v1/original/${sample.segment}`

  it('serves the PDF, ranges included', () => {
    const api = layerApi({ sample })
    const whole = get(api, path)
    expect(whole).toMatchObject({ status: 200, headers: { 'content-type': 'application/pdf', 'accept-ranges': 'bytes' } })
    expect('body' in whole && whole.body).toEqual(sample.pdf)
    const part = get(api, path, { range: 'bytes=0-9' })
    expect(part).toMatchObject({ status: 206, headers: { 'content-range': `bytes 0-9/${sample.pdf.length}` } })
    expect('body' in part && part.body).toEqual(sample.pdf.subarray(0, 10))
    const tail = get(api, path, { range: 'bytes=-5' })
    expect('body' in tail && tail.body).toEqual(sample.pdf.subarray(sample.pdf.length - 5))
    const open = get(api, path, { range: `bytes=${sample.pdf.length - 3}-` })
    expect('body' in open && open.body).toEqual(sample.pdf.subarray(sample.pdf.length - 3))
    const over = get(api, path, { range: `bytes=${sample.pdf.length - 2}-${sample.pdf.length + 50}` })
    expect(over).toMatchObject({ status: 206, headers: { 'content-range': `bytes ${sample.pdf.length - 2}-${sample.pdf.length - 1}/${sample.pdf.length}` } })
    expect(get(api, path, { range: `bytes=${sample.pdf.length}-` })).toMatchObject({ status: 416, headers: { 'content-range': `bytes */${sample.pdf.length}` } })
  })

  it('answers a paper it does not hold 404 no-pdf', () => {
    const a = get(layerApi({ sample }), '/api/v1/original/1706.03762v7')
    expect(a).toMatchObject({ status: 404 })
    expect(jsonOf(a)).toEqual({ why: 'no-pdf' })
  })

  it('is set apart from the layer routes: a layer refused leaves the PDF served, and the PDF missing leaves the layer', () => {
    const api = layerApi({ sample }).set({ layer: mode.error(503) })
    expect(get(api, path)).toMatchObject({ status: 200 })
    expect(get(api, BUNDLE_PATH)).toMatchObject({ status: 503 })
    api.set({ layer: mode.ready(), original: mode.none('no-pdf') })
    expect(get(api, BUNDLE_PATH)).toMatchObject({ status: 200 })
    const a = get(api, path)
    expect(a).toMatchObject({ status: 404 })
    expect(jsonOf(a)).toEqual({ why: 'no-pdf' })
  })
})

describe('a preparation under way', () => {
  it('answers 202 with the position, the stage, the progress and when to ask again, then the bundle when its time is up', () => {
    const c = clock()
    const api = layerApi({ sample, now: c.now, pollMs: 400 }).set({ layer: mode.preparing(3000) })
    const first = get(api, BUNDLE_PATH)
    expect(first).toMatchObject({ status: 202, headers: { 'cache-control': 'no-store' } })
    expect(jsonOf(first)).toEqual({ position: null, stage: 'marks', progress: 0, retryAfterMs: 400 })
    c.advance(1500)
    expect(jsonOf(get(api, BUNDLE_PATH))).toEqual({ position: null, stage: 'layout', progress: 0.5, retryAfterMs: 400 })
    c.advance(1400)
    // (the last 100 ms: it asks to be asked again then)
    expect(jsonOf(get(api, BUNDLE_PATH))).toEqual({ position: null, stage: 'add-on', progress: 0.96, retryAfterMs: 100 })
    c.advance(100)
    expect(get(api, BUNDLE_PATH)).toMatchObject({ status: 200 })
    expect(jsonOf(prepare(api))).toEqual({ ready: true })
  })

  it('joins a prepare to it: 202, the preparation neither begun again nor cut short', () => {
    const c = clock()
    const api = layerApi({ sample, now: c.now }).set({ layer: mode.preparing(2000) })
    c.advance(1000)
    const joined = prepare(api)
    expect(joined).toMatchObject({ status: 202 })
    expect(jsonOf(joined).progress).toBe(0.5)
    c.advance(1000)
    expect(get(api, BUNDLE_PATH)).toMatchObject({ status: 200 })
  })

  it('with nothing begun, says not-prepared (not cached) until a prepare begins it, and then runs for its time', () => {
    const c = clock()
    const api = layerApi({ sample, now: c.now }).set({ layer: mode.preparing(2000, { begun: false }) })
    const cold = get(api, BUNDLE_PATH)
    expect(cold).toMatchObject({ status: 404, headers: { 'cache-control': 'no-store' } })
    expect(jsonOf(cold)).toEqual({ why: 'not-prepared' })
    c.advance(5000)
    expect(get(api, BUNDLE_PATH)).toMatchObject({ status: 404 })
    expect(prepare(api)).toMatchObject({ status: 202 })
    c.advance(1000)
    expect(jsonOf(get(api, BUNDLE_PATH)).progress).toBe(0.5)
    c.advance(1000)
    expect(get(api, BUNDLE_PATH)).toMatchObject({ status: 200 })
  })

  it('is begun again by a new mode', () => {
    const c = clock()
    const api = layerApi({ sample, now: c.now }).set({ layer: mode.preparing(1000) })
    c.advance(1000)
    expect(get(api, BUNDLE_PATH)).toMatchObject({ status: 200 })
    api.set({ layer: mode.preparing(1000) })
    expect(get(api, BUNDLE_PATH)).toMatchObject({ status: 202 })
  })
})

describe('the answers a test asks for', () => {
  it('refused: 429 { retryAfterMs }, not cached, on a GET and a prepare', () => {
    const api = layerApi({ sample }).set({ layer: mode.refused(7000) })
    for (const a of [get(api, BUNDLE_PATH), prepare(api)]) {
      expect(a).toMatchObject({ status: 429, headers: { 'cache-control': 'no-store' } })
      expect(jsonOf(a)).toEqual({ retryAfterMs: 7000 })
    }
  })

  it('none: 404 with each why, a missing preparation not cached and the others for five minutes', () => {
    const api = layerApi({ sample })
    for (const why of WHY) {
      api.set({ layer: mode.none(why) })
      for (const a of [get(api, BUNDLE_PATH), prepare(api)]) {
        expect(a).toMatchObject({ status: 404, headers: { 'cache-control': why === 'not-prepared' ? 'no-store' : 'public, max-age=300' } })
        expect(jsonOf(a)).toEqual({ why })
      }
    }
  })

  it('error: a 5xx, not cached, JSON', () => {
    const a = get(layerApi({ sample }).set({ layer: mode.error(503) }), BUNDLE_PATH)
    expect(a).toMatchObject({ status: 503, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    expect(layerApi({ sample }).set({ layer: mode.error() }).handle({ method: 'GET', path: BUNDLE_PATH })).toMatchObject({ status: 500 })
  })

  it('reset and hang: no answer, for every request on the route (a bad one too)', () => {
    for (const kind of ['reset', 'hang'] as const) {
      const api = layerApi({ sample }).set({ layer: mode[kind]() })
      expect(get(api, BUNDLE_PATH)).toEqual({ fault: kind })
      expect(prepare(api, {})).toEqual({ fault: kind })
      expect(get(api, `/api/v1/layer/${sample.segment}/b0`)).toEqual({ fault: kind })
      expect(get(api, `/api/v1/original/${sample.segment}`)).toMatchObject({ status: 200 })
    }
  })

  it('refuses what is no mode, and what has no meaning', () => {
    const api = layerApi({ sample })
    expect(() => api.set({ layer: 'nonsense' as never })).toThrow(/not a mode/)
    expect(() => api.set({ layer: mode.none('whatever' as never) })).toThrow(/needs a why/)
    expect(() => api.set({ layer: mode.error(404) })).toThrow(/500 to 599/)
    expect(() => api.set({ layer: mode.preparing(-1) })).toThrow(/time in ms/)
    // (a name alone is a mode: the ones that need nothing else)
    expect(api.set({ layer: 'ready' }).mode.layer).toEqual({ kind: 'ready' })
  })

  it('keeps what it answered, in order, each request whole', () => {
    const api = layerApi({ sample })
    get(api, BUNDLE_PATH)
    prepare(api)
    get(api, '/api/v1/nothing')
    api.set({ layer: mode.reset() })
    get(api, BUNDLE_PATH)
    expect(api.requests).toEqual([
      { method: 'GET', path: BUNDLE_PATH, search: '', headers: {}, body: null, answered: 200 },
      { method: 'POST', path: `${BUNDLE_PATH}/prepare`, search: '', headers: { 'content-type': 'application/json' }, body: { bytes: 2, text: '{}' }, answered: 200 },
      { method: 'GET', path: '/api/v1/nothing', search: '', headers: {}, body: null, answered: 404 },
      { method: 'GET', path: BUNDLE_PATH, search: '', headers: {}, body: null, answered: 'reset' },
    ])
  })

  it('shows in its record a query string, a cookie, an extra header and a body that was not asked for, and answers none of them differently', () => {
    const api = layerApi({ sample })
    const plain = get(api, BUNDLE_PATH)
    const sent = api.handle({ method: 'GET', path: BUNDLE_PATH, search: '?title=Secret&email=a@b', headers: { cookie: 'session=abc', 'x-extra': 'leaked', authorization: 'Bearer t' }, body: new TextEncoder().encode('a body no GET carries') })
    // (the answer does not depend on any of it: a query is not refused)
    expect(sent).toEqual(plain)
    const [, kept] = api.requests
    expect(kept).toMatchObject({ method: 'GET', path: BUNDLE_PATH, search: '?title=Secret&email=a@b', answered: 200 })
    expect(kept?.headers).toEqual({ cookie: 'session=abc', 'x-extra': 'leaked', authorization: 'Bearer t' })
    expect(kept?.body).toEqual({ bytes: 21, text: 'a body no GET carries' })
    // (the record is a copy: a header changed afterwards does not change it)
    const headers = { 'x-extra': 'one' }
    api.handle({ method: 'GET', path: BUNDLE_PATH, headers })
    headers['x-extra'] = 'two'
    expect(api.requests[2]?.headers).toEqual({ 'x-extra': 'one' })
    // (a body is kept to a small cap of its text, its length whole)
    api.handle({ method: 'POST', path: `${BUNDLE_PATH}/prepare`, headers: { 'content-type': 'application/json' }, body: new TextEncoder().encode(`{"pad":"${'x'.repeat(5000)}"}`) })
    const long = api.requests[3]
    expect(long?.body?.bytes).toBe(5010)
    expect(long?.body?.text).toHaveLength(200)
    expect(long?.answered).toBe(400)
  })
})

describe('on the wire (a local HTTP server over the same answers)', () => {
  it('serves the bundle to a fetch, with the headers a browser reads, and the PDF by range', async () => {
    const api = layerApi({ sample })
    const server = await api.listen()
    try {
      const res = await fetch(`${server.origin}${BUNDLE_PATH}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(sample.bundle)
      const part = await fetch(`${server.origin}/api/v1/original/${sample.segment}`, { headers: { range: 'bytes=0-4' } })
      expect(part.status).toBe(206)
      expect(new TextDecoder().decode(await part.arrayBuffer())).toBe('%PDF-')
      const bad = await fetch(`${server.origin}${BUNDLE_PATH}/prepare`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
      expect(bad.status).toBe(415)
      const notEmpty = await fetch(`${server.origin}${BUNDLE_PATH}/prepare`, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"a":1}' })
      expect(notEmpty.status).toBe(400)
      const good = await fetch(`${server.origin}${BUNDLE_PATH}/prepare`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      expect(await good.json()).toEqual({ ready: true })
    } finally { await server.close() }
  })

  it('records, from a real request, its query string, its headers and its body whole', async () => {
    const api = layerApi({ sample })
    const server = await api.listen()
    try {
      const res = await fetch(`${server.origin}${BUNDLE_PATH}?title=Secret&email=a@b`, { headers: { cookie: 'session=abc', 'x-extra': 'leaked' } })
      expect(res.status).toBe(200)
      await fetch(`${server.origin}${BUNDLE_PATH}/prepare?x=1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      const [first, second] = api.requests
      expect(first).toMatchObject({ method: 'GET', path: BUNDLE_PATH, search: '?title=Secret&email=a@b', body: null, answered: 200 })
      expect(first?.headers).toMatchObject({ cookie: 'session=abc', 'x-extra': 'leaked' })
      expect(second).toMatchObject({ method: 'POST', path: `${BUNDLE_PATH}/prepare`, search: '?x=1', body: { bytes: 2, text: '{}' }, answered: 200 })
      expect(second?.headers['content-type']).toBe('application/json')
    } finally { await server.close() }
  })

  it('resets the connection, or leaves it unanswered, as it is told', async () => {
    const api = layerApi({ sample })
    const server = await api.listen()
    try {
      api.set({ layer: mode.reset() })
      await expect(fetch(`${server.origin}${BUNDLE_PATH}`)).rejects.toThrow()
      api.set({ layer: mode.hang() })
      await expect(fetch(`${server.origin}${BUNDLE_PATH}`, { signal: AbortSignal.timeout(300) })).rejects.toMatchObject({ name: 'TimeoutError' })
    } finally { await server.close() }
  })
})

describe('BUNDLE 4: the catalog, the 202s with the objects made so far, the objects by digest', async () => {
  const { cutSample, sampleFiles } = await import('./layer-cut.mjs')
  const { CTAG5, readCatalog } = await import('@/pdf-reader/engine/layer-proto/format.mjs')
  const layer4 = await cutSample(sampleFiles())
  const PATH = `/api/v1/layer/${sample.segment}/${CTAG5}`

  it('answers the CTAG\'s GET with the catalog, which names the head, the chunks and the parts the job tells', async () => {
    const a = get(layerApi({ sample, layer4 }), PATH)
    expect(a).toMatchObject({ status: 200, headers: { 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' } })
    const c = await readCatalog((a as { body: Uint8Array }).body)
    expect(c.head).toEqual(layer4.refs.head)
    expect(c.units).toEqual(layer4.refs.units)
    expect(c.parts.map(p => p.sha256)).toEqual(layer4.refs.parts.map(p => p.sha256))
    expect(c.end).toEqual(layer4.refs.end)
    expect(layer4.refs.parts.length).toBeGreaterThan(1)
  })

  it('answers 202s while it prepares, each with the objects made so far: the chunks and the head at once, the parts as they come, each part its prev', () => {
    const t = clock(), api = layerApi({ sample, layer4, now: t.now }).set({ layer: mode.preparing(4000) })
    const seen: number[] = []
    for (let i = 0; i < 4; i++) {
      const a = jsonOf(get(api, PATH))
      expect(a.layer.head).toEqual(layer4.refs.head)
      expect(a.layer.units).toEqual(layer4.refs.units)
      seen.push(a.layer.parts.length)
      for (const [k, p] of a.layer.parts.entries()) expect(p.prev).toBe(k ? a.layer.parts[k - 1].sha256 : null)
      t.advance(1000)
    }
    expect(seen).toEqual([...seen].sort((x, y) => x - y))
    expect(seen[0]).toBe(0)
    expect(seen.at(-1)).toBeGreaterThan(0)
    expect(get(api, PATH).status).toBe(200)
    // (BUNDLE 3's tag answers as before, its bundle)
    expect('body' in get(api, BUNDLE_PATH) && (get(api, BUNDLE_PATH) as { body: Uint8Array }).body).toEqual(sample.bundle)
  })

  it('is a layer over our own compile (BUNDLE 8): its head, chunks and parts read by their readers, the catalog naming the base by its key', async () => {
    const F = await import('@/pdf-reader/engine/layer-proto/format.mjs')
    const sha = createHash('sha256').update(sample.pdf).digest('hex')
    const files = sampleFiles(), ours = createHash('sha256').update(files.wrapped).digest('hex')
    const headRef = layer4.refs.head as { sha256: string; bytes: number }
    const head = await F.readHead(layer4.objects.get(headRef.sha256) as Uint8Array, { ref: { kind: 'head', ...headRef } as never })
    expect(head.bundle).toBe(F.BUNDLE5)
    expect(F.layerDraws(head.base)).toBe(true)
    // (the base of ours is the wrapped pass, its wrap's fields in the head; arXiv's PDF beside it the stand-in)
    expect(head.base).toMatchObject({ source: 'ours', bytes: files.wrapped.length, sha256: ours, pages: layer4.paper.pages, tree: '2025', check: { pages: [layer4.paper.pages, layer4.paper.pages], boxes: 'equal', carried: 1 }, unhidden: files.wrap.unhidden, labelKept: files.wrap.labelKept })
    expect(head.orig).toEqual({ bytes: sample.pdf.length, sha256: sha })
    expect(layer4.base).toEqual({ bytes: files.wrapped.length, sha256: ours, data: files.wrapped })
    const chunks: import('@/pdf-reader/engine/layer-proto/format.mjs').ReadUnitsChunk[] = []
    for (const r of layer4.refs.units) chunks.push(await F.readUnitsChunk(layer4.objects.get(r.sha256) as Uint8Array, { ref: r as never, before: chunks.at(-1) ?? null }))
    const catalog = await F.readCatalog(layer4.catalog, { paper: layer4.paper })
    expect(catalog.base).toEqual({ source: 'ours', key: F.baseKey(layer4.paper.id, layer4.paper.version, ours), sha256: ours, bytes: files.wrapped.length })
    const index = F.indexOf(head, chunks, { catalog })
    let chain = null, laid = 0, figures = 0
    for (const r of layer4.refs.parts) {
      const part = await F.readPart(layer4.objects.get(r.sha256) as Uint8Array, { ref: r as never, index, chain })
      chain = part.chain
      if (part.layout) laid++
      // (the TikZ figure's text the wrap drew, each an ink unit of kind inkfigures: the content class `figures`)
      for (const f of part.figures) { figures++; expect(index.units[f.id]?.[0]).toBe('inkfigures') }
    }
    expect(laid).toBe(layer4.refs.parts.length)
    expect(figures).toBe(files.wrap.figures.units.length)
    expect(figures).toBeGreaterThan(0)
    // (each left part carries its page's draw, as the page pass ships it under a head of ours, and the head says so)
    expect(JSON.parse(new TextDecoder().decode(layer4.objects.get(headRef.sha256))).draw).toBe(1)
    for (const sha of Object.values(layer4.leftRefs)) expect(JSON.parse(new TextDecoder().decode(layer4.objects.get(sha))).draw).not.toBeNull()
  })

  it('serves our base page at /api/v1/base/<id>v<n>/<sha256> by ranges: 200, 206, 416, a strong tag, any origin; no other digest, no .pdf', () => {
    const api = layerApi({ sample, layer4 })
    const at = `/api/v1/base/${sample.segment}/${layer4.base!.sha256}`
    const pdf = layer4.base!.data, whole = get(api, at)
    expect(whole).toMatchObject({ status: 200, headers: { 'content-type': 'application/pdf', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=31536000, immutable' } })
    expect((whole as { body: Uint8Array }).body).toEqual(pdf)
    const tag = (whole as { headers: Record<string, string> }).headers.etag
    expect(tag).toMatch(/^"[\x21\x23-\x7e]+"$/)
    expect(get(api, at, { range: 'bytes=0-9' })).toMatchObject({ status: 206, headers: { etag: tag, 'content-range': `bytes 0-9/${pdf.length}` } })
    expect((get(api, at, { range: 'bytes=0-9' }) as { body: Uint8Array }).body).toEqual(pdf.subarray(0, 10))
    expect(get(api, at, { range: `bytes=${pdf.length}-` })).toMatchObject({ status: 416, headers: { 'content-range': `bytes */${pdf.length}` } })
    expect(serves(at)).toBe(true)
    for (const path of [`${at}.pdf`, `/api/v1/base/${sample.segment}/${'0'.repeat(64)}`, `/api/v1/base/2600.99999v1/${layer4.base!.sha256}`, `/api/v1/base/${sample.segment}/ABC`]) expect(get(api, path).status, path).toBe(404)
    expect(api.handle({ method: 'POST', path: at }).status).toBe(405)
    // (without the cut, no base page of ours; its faults set apart from the layer's and the original's)
    expect(get(layerApi({ sample }), at).status).toBe(404)
    expect(api.set({ base: mode.error(503) }).handle({ method: 'GET', path: at, headers: {} }).status).toBe(503)
    expect(get(api, `/api/v1/original/${sample.segment}`).status).toBe(200)
  })

  it('names no original beside a layer of ours (the Worker binds it by the base\'s digest); the original answers with its tag as before', () => {
    const api = layerApi({ sample, layer4 })
    const tag = `"${createHash('md5').update(sample.pdf).digest('hex')}"`
    expect(api.etag).toBe(tag)
    expect('x-axt-base-etag' in (get(api, PATH) as { headers: Record<string, string> }).headers).toBe(false)
    for (const sha of layer4.objects.keys()) expect('x-axt-base-etag' in (get(api, `${PATH}/o/${sha}`) as { headers: Record<string, string> }).headers).toBe(false)
    const original = `/api/v1/original/${sample.segment}`
    expect(get(api, original)).toMatchObject({ status: 200, headers: { etag: tag } })
    expect(get(api, original, { range: 'bytes=0-9' })).toMatchObject({ status: 206, headers: { etag: tag } })
  })

  it('serves each object by its whole digest, immutable; a digest it does not hold, another paper or another tag 404 not-prepared', () => {
    const api = layerApi({ sample, layer4 })
    for (const [sha, bytes] of layer4.objects) {
      const a = get(api, `${PATH}/o/${sha}`)
      expect(a).toMatchObject({ status: 200, headers: { 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' } })
      expect(createHash('sha256').update((a as { body: Uint8Array }).body).digest('hex')).toBe(sha)
      expect((a as { body: Uint8Array }).body).toEqual(bytes)
    }
    for (const path of [`${PATH}/o/${'0'.repeat(64)}`, `/api/v1/layer/2600.99999v1/${CTAG5}/o/${[...layer4.objects.keys()][0]}`, `/api/v1/layer/${sample.segment}/${VTAG}/o/${[...layer4.objects.keys()][0]}`]) {
      const a = get(api, path)
      expect(a.status, path).toBe(404)
      expect(jsonOf(a)).toEqual({ why: 'not-prepared' })
    }
    expect(serves(`${PATH}/o/${'a'.repeat(64)}`)).toBe(true)
    expect(serves(`${PATH}/o/abc`)).toBe(false)
    expect(api.handle({ method: 'POST', path: `${PATH}/o/${'a'.repeat(64)}` }).status).toBe(405)
    // (without the objects, the CTAG is a version the stand-in does not hold)
    expect(jsonOf(get(layerApi({ sample }), PATH))).toEqual({ why: 'unknown-versions' })
  })

  it('serves the faces\' table it is given: every face in one group of one slice, its file, and no hyphenation; without faces, none of it', async () => {
    const { FACE_FILE, FACE_GROUP } = await import('./layer-api.mjs')
    const font = new Uint8Array([0, 1, 0, 0, 9])
    const api = layerApi({ sample, faces: { ids: ['lm-roman-regular', 'nimbus-sans-bold'], ranges: [32, 126], bytes: font } })
    const index = jsonOf(get(api, '/static-fonts/index.json')) as { schema: number; faces: Record<string, { group: string }> }
    expect(index.schema).toBe(1)
    expect(Object.keys(index.faces)).toEqual(['lm-roman-regular', 'nimbus-sans-bold'])
    const group = jsonOf(get(api, `/static-fonts/${FACE_GROUP}.json`)) as { group: string; slices: number[][]; faces: Record<string, { path: string }[]> }
    expect(group.slices).toEqual([[32, 126]])
    expect(group.faces['lm-roman-regular']?.[0]?.path).toBe(`static-fonts/${FACE_FILE}.woff2`)
    expect((get(api, `/static-fonts/${FACE_FILE}.woff2`) as { body: Uint8Array }).body).toEqual(font)
    expect(get(api, '/hyph/en.json').status).toBe(404)
    expect(serves('/static-fonts/index.json') && serves('/hyph/de.json') && serves(`/static-fonts/${FACE_FILE}.woff2`)).toBe(true)
    expect(get(layerApi({ sample }), '/static-fonts/index.json').status).toBe(404)
  })
})

describe('BUNDLE 8 held as a delta: the stand-in PDF the original, our page a delta over it (cutSample `base: \'delta\'`)', async () => {
  const { cutSample, sampleFiles } = await import('./layer-cut.mjs')
  const F = await import('@/pdf-reader/engine/layer-proto/format.mjs')
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { startxrefOf } = await import('@/pdf-reader/engine/layout/tail.mjs')
  const cut = await cutSample(sampleFiles(), { base: 'delta' })
  const PATH = `/api/v1/layer/${sample.segment}/${F.CTAG5}`
  const sha = createHash('sha256').update(sample.pdf).digest('hex')
  const delta = cut.delta!

  it('names the delta in its head (kind delta, every page replaced by the wrapped pass\'s, orig the stand-in PDF with its startxref), held to checkDelta', async () => {
    const headRef = cut.refs.head as { sha256: string; bytes: number }
    const head = await F.readHead(cut.objects.get(headRef.sha256) as Uint8Array, { ref: { kind: 'head', ...headRef } as never })
    const N = cut.paper.pages
    expect(N).toBe(4)
    expect(head.base).toMatchObject({ source: 'ours', kind: 'delta', bytes: delta.bytes, sha256: delta.sha256, xref: delta.xref, pages: N, check: { pages: [N, N], boxes: 'equal' }, replaced: [[1, N]], unhidden: sampleFiles().wrap.unhidden })
    expect(head.orig).toEqual({ bytes: sample.pdf.length, sha256: sha, xref: startxrefOf(sample.pdf) })
    expect(F.layerDraws(head.base)).toBe(true)
    expect(await F.checkDelta(head, delta.data)).toBeNull()
    expect(cut.base).toBeNull()
    // (the catalog names it as a bundle object, and the index takes the catalog; every part reads in its chain)
    const catalog = await F.readCatalog(cut.catalog, { paper: cut.paper })
    expect(catalog.base).toEqual({ source: 'ours', kind: 'delta', object: { key: F.deltaKey(cut.paper.id, cut.paper.version, delta.sha256), sha256: delta.sha256, bytes: delta.bytes } })
    expect(delta.key).toMatch(/\.delta$/)
    const chunks: import('@/pdf-reader/engine/layer-proto/format.mjs').ReadUnitsChunk[] = []
    for (const r of cut.refs.units) chunks.push(await F.readUnitsChunk(cut.objects.get(r.sha256) as Uint8Array, { ref: r as never, before: chunks.at(-1) ?? null }))
    const index = F.indexOf(head, chunks, { catalog })
    let chain: import('@/pdf-reader/engine/layer-proto/format.mjs').PartChain | null = null
    for (const r of cut.refs.parts) chain = (await F.readPart(cut.objects.get(r.sha256) as Uint8Array, { ref: r as never, index, chain })).chain
    expect(chain).toMatchObject({ through: N })
  })

  it('serves the delta at the layer\'s object route by its digest and `.delta` (the web\'s deltaPath), immutable, as bytes; the bare digest a 404, as the web answers it; no base PDF of ours; the original as before', () => {
    const api = layerApi({ sample, layer4: cut })
    const a = get(api, `${PATH}/o/${delta.sha256}.delta`)
    expect(a).toMatchObject({ status: 200, headers: { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' } })
    expect((a as { body: Uint8Array }).body).toEqual(delta.data)
    const bare = get(api, `${PATH}/o/${delta.sha256}`)
    expect([bare.status, jsonOf(bare)]).toEqual([404, { why: 'not-prepared' }])
    expect(get(api, `${PATH}/o/${'0'.repeat(64)}.delta`).status).toBe(404)
    expect(get(api, `/api/v1/base/${sample.segment}/${delta.sha256}`).status).toBe(404)
    expect(get(api, `/api/v1/original/${sample.segment}`)).toMatchObject({ status: 200 })
    expect((get(api, `/api/v1/original/${sample.segment}`) as { body: Uint8Array }).body).toEqual(sample.pdf)
  })

  it('composes: the original\'s bytes then the delta open in PDF.js, every page ours (the wrapped pass\'s)', async () => {
    const opsOf = async (bytes: Uint8Array) => {
      const task = getDocument({ data: bytes.slice(), verbosity: 0 }), doc = await task.promise
      const out: number[][] = []
      for (let p = 1; p <= doc.numPages; p++) out.push(Array.from((await (await doc.getPage(p)).getOperatorList()).fnArray))
      await task.destroy()
      return out
    }
    const composed = new Uint8Array(sample.pdf.length + delta.bytes)
    composed.set(sample.pdf)
    composed.set(delta.data, sample.pdf.length)
    const [c, ours, orig] = [await opsOf(composed), await opsOf(cut.ours!), await opsOf(sample.pdf)]
    expect(c).toHaveLength(4)
    for (let p = 0; p < 4; p++) {
      expect(c[p], `page ${p + 1}`).toEqual(ours[p])
      expect(c[p], `page ${p + 1}`).not.toEqual(orig[p])
      // (the wrap's optional content around the units' runs)
      expect(c[p]!.filter(f => f === OPS.beginMarkedContentProps).length).toBeGreaterThan(orig[p]!.filter(f => f === OPS.beginMarkedContentProps).length)
    }
  })
})
