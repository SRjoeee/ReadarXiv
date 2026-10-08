import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { originOf, point, publish } from '../../lab/pdf/spikes/rules-publish.mjs'
import { BUILTIN_RULES, readRules, writeRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The two writes of the web Worker's rules routes (lab/pdf/spikes/rules-publish.mjs, Task R6): the set published and the
// pointer moved, with a secret that never leaves the request's header and a route that is not there said aloud.

const SECRET = 'publish-secret-that-must-never-be-printed'
const ORIGIN = 'https://app-staging.readarxiv.org'
const file = (version = 3) => {
  const f = join(mkdtempSync(join(tmpdir(), 'rules-publish-')), 'layout-rules.json')
  writeFileSync(f, writeRules({ ...structuredClone(BUILTIN_RULES), version, note: 'a test set' }))
  return f
}
type Seen = { url: string; method: string; headers: Record<string, string>; body: string | Uint8Array; redirect: string }
function worker(answers: Record<string, { status: number; body?: unknown }>) {
  const seen: Seen[] = []
  const fetchImpl = async (url: string, init: Omit<Seen, 'url'>) => {
    seen.push({ url, ...init })
    const a = answers[url.slice(url.lastIndexOf('/') + 1)] ?? { status: 500 }
    return { status: a.status, text: async () => JSON.stringify(a.body ?? {}) }
  }
  return { seen, fetchImpl }
}
const fails = async (p: Promise<unknown>) => String(((await p.catch((e: Error) => e)) as Error).message)

describe('publishing a rule set', () => {
  it('posts the file\'s own bytes with the secret, then moves the pointer to its version', async () => {
    const w = worker({ publish: { status: 201 }, point: { status: 200 } })
    const f = file(3)
    const lines = await publish({ url: `${ORIGIN}/`, file: f, secret: SECRET, fetchImpl: w.fetchImpl, engine: { readRules } })
    expect(w.seen.map(r => `${r.method} ${r.url}`)).toEqual([`POST ${ORIGIN}/api/v1/rules/publish`, `POST ${ORIGIN}/api/v1/rules/point`])
    expect(w.seen[0]!.headers).toMatchObject({ authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' })
    expect(Buffer.from(w.seen[0]!.body as Uint8Array).toString('utf8')).toBe(writeRules({ ...structuredClone(BUILTIN_RULES), version: 3, note: 'a test set' }))
    expect(JSON.parse(w.seen[1]!.body as string)).toEqual({ schema: 1, version: 3 })
    expect(w.seen.every(r => r.redirect === 'error')).toBe(true)
    expect(lines[0]).toMatch(/published s1 version 3 \([0-9a-f]{12}\)/)
    expect(lines[1]).toMatch(/pointer of s1 is at version 3/)
  })

  it('takes the same bytes already there as done (the job may run again), and still moves the pointer', async () => {
    const w = worker({ publish: { status: 200 }, point: { status: 200 } })
    const lines = await publish({ url: ORIGIN, file: file(), secret: SECRET, fetchImpl: w.fetchImpl, engine: { readRules } })
    expect(lines[0]).toMatch(/already on/)
    expect(w.seen).toHaveLength(2)
  })

  it('fails loudly where the route is not there, where the version holds other bytes, and where the secret is refused', async () => {
    expect(await fails(publish({ url: ORIGIN, file: file(), secret: SECRET, fetchImpl: worker({ publish: { status: 404 } }).fetchImpl, engine: { readRules } }))).toMatch(/no rules routes.*is the Worker deployed/)
    expect(await fails(publish({ url: ORIGIN, file: file(), secret: SECRET, fetchImpl: worker({ publish: { status: 409, body: { why: 'version-taken' } } }).fetchImpl, engine: { readRules } }))).toMatch(/version 3 of s1 holds other bytes/)
    expect(await fails(publish({ url: ORIGIN, file: file(), secret: SECRET, fetchImpl: worker({ publish: { status: 401 } }).fetchImpl, engine: { readRules } }))).toMatch(/secret is refused \(HTTP 401\)/)
    expect(await fails(publish({ url: ORIGIN, file: file(), secret: SECRET, fetchImpl: worker({ publish: { status: 413, body: { why: 'too-large' } } }).fetchImpl, engine: { readRules } }))).toMatch(/not published \(HTTP 413, too-large\)/)
  })

  it('sends nothing for a file the engine refuses or without a secret, and prints the secret nowhere', async () => {
    const w = worker({ publish: { status: 201 }, point: { status: 200 } })
    const bad = join(mkdtempSync(join(tmpdir(), 'rules-publish-')), 'bad.json')
    writeFileSync(bad, '{"schema":1}')
    await expect(publish({ url: ORIGIN, file: bad, secret: SECRET, fetchImpl: w.fetchImpl, engine: { readRules } })).rejects.toThrow()
    await expect(publish({ url: ORIGIN, file: file(), secret: undefined, fetchImpl: w.fetchImpl, engine: { readRules } })).rejects.toThrow('RULES_PUBLISH_SECRET is not set')
    expect(w.seen).toHaveLength(0)
    const messages = await Promise.all([404, 409, 401, 500].map(status => fails(publish({ url: ORIGIN, file: file(), secret: SECRET, fetchImpl: worker({ publish: { status } }).fetchImpl, engine: { readRules } }))))
    expect(messages.join('\n')).not.toContain(SECRET)
  })
})

describe('moving the pointer', () => {
  it('posts the schema and the version, and says a version that is not there', async () => {
    const w = worker({ point: { status: 200 } })
    await expect(point({ url: ORIGIN, schema: 1, version: 2, secret: SECRET, fetchImpl: w.fetchImpl })).resolves.toMatch(/version 2/)
    expect(JSON.parse(w.seen[0]!.body as string)).toEqual({ schema: 1, version: 2 })
    expect(await fails(point({ url: ORIGIN, schema: 1, version: 9, secret: SECRET, fetchImpl: worker({ point: { status: 404, body: { why: 'unknown-version' } } }).fetchImpl }))).toMatch(/no version 9 of s1.*unknown-version/)
    await expect(point({ url: ORIGIN, schema: 1, version: 0, secret: SECRET, fetchImpl: w.fetchImpl })).rejects.toThrow(/positive integers/)
  })
})

describe('the Worker\'s address', () => {
  it('is an https origin with nothing after the host, and no credentials in it', () => {
    expect(originOf('https://app-staging.readarxiv.org/')).toBe(ORIGIN)
    expect(originOf('https://app-staging.readarxiv.org/api/v1')).toBe(ORIGIN)
    expect(originOf('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787')
    expect(() => originOf('http://app-staging.readarxiv.org')).toThrow(/not https/)
    expect(() => originOf('https://user:pw@app-staging.readarxiv.org')).toThrow(/credentials/)
    expect(() => originOf('not a url')).toThrow()
    expect(() => originOf('')).toThrow()
  })
})
