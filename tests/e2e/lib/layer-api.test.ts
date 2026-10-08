// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { BUNDLE, readBundle, VTAG } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { REMOVAL } from '@/pdf-reader/engine/layout/addon-manifest.mjs'
import { LAYOUT } from '@/pdf-reader/engine/layout/file.mjs'
import { PDFJS, PIPELINE_VERSION } from '@/pdf-reader/engine/versions.mjs'
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
    expect(read.addon).not.toBeNull()
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
    expect(jsonOf(first)).toEqual({ position: 0, stage: 'marks', progress: 0, retryAfterMs: 400 })
    c.advance(1500)
    expect(jsonOf(get(api, BUNDLE_PATH))).toEqual({ position: 0, stage: 'layout', progress: 0.5, retryAfterMs: 400 })
    c.advance(1400)
    // (the last 100 ms: it asks to be asked again then)
    expect(jsonOf(get(api, BUNDLE_PATH))).toEqual({ position: 0, stage: 'add-on', progress: 0.96, retryAfterMs: 100 })
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
