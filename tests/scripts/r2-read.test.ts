import { describe, expect, it } from 'vitest'
import { BUCKET, getObject, isKey, keyUrl, s3Credentials, sha256, signV4, withRetry } from '../../scripts/r2-read.mjs'

// The R2 read the rules gate's pack (lab/pdf/spikes/gate-pack.mjs) and the fixtures fetch (scripts/fetch-fixtures.mjs) share
// (scripts/r2-read.mjs): the signer proven against AWS's own example, the credentials derived from a token, the retry rule and
// the signed GET. The pack's restore and the fixtures' bucket step are tested where they use it.

const ACCOUNT = '612fe563f8ba720019ffa3b35269aaa4'
const TOKEN = 'cf-token-that-must-never-be-printed'
/** the token id Cloudflare's verify endpoint answers with (the S3 access key id) */
const KEY_ID = '0123456789abcdef0123456789abcdef'
const SECRET = sha256(TOKEN)
const VERIFY_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/tokens/verify`
const NOW = new Date('2026-10-13T08:30:15.123Z')
/** the message a promise rejects with */
const why = async (p: Promise<unknown>) => String(((await p.catch((e: Error) => e)) as Error).message)

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
    expect(message).toMatch(/^the token is not an active Account API token of this account \(HTTP \d{3}(?:, status [a-z_]+)?\)$/)
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

describe('the object url', () => {
  it('is the bucket\'s S3 path: the slashes of the key literal, every segment escaped once', () => {
    expect(BUCKET).toBe('readarxiv-ci')
    expect(keyUrl(ACCOUNT, `fixtures/${'a'.repeat(64)}`)).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/readarxiv-ci/fixtures/${'a'.repeat(64)}`)
    expect(keyUrl(ACCOUNT, 'a/b.c_d-e', 'other')).toBe(`https://${ACCOUNT}.r2.cloudflarestorage.com/other/a/b.c_d-e`)
  })
  it.each(['', '/x', 'x/', 'a//b', 'a/./b', 'a/../b', 'x y', 'a?b=1', 'a%2fb', 'a\\b'])('refuses the key %j', key => {
    expect(isKey(key)).toBe(false)
    expect(() => keyUrl(ACCOUNT, key)).toThrow(/not an object key/)
  })
  it('refuses an account that is no account id', () => {
    expect(() => keyUrl('nope', 'fixtures/x')).toThrow(/account id/)
  })
})

describe('the signed read', () => {
  const url = keyUrl(ACCOUNT, 'fixtures/x')
  const credentials = { accessKeyId: KEY_ID, secret: SECRET }
  const answer = (status: number, body = 'bytes', bodyFails = false) => ({ ok: status >= 200 && status < 300, status, json: async () => ({}), arrayBuffer: async () => { if (bodyFails) throw new TypeError('terminated'); return new TextEncoder().encode(body).buffer as ArrayBuffer } })

  it('signs the request over the derived key, reads the body whole and sends nothing else', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = []
    const fetchImpl = async (u: string, init: { headers: Record<string, string> }) => { seen.push({ url: u, headers: init.headers }); return answer(200, 'hello') }
    const { value } = await getObject({ url, credentials, fetchImpl, now: () => NOW })
    expect(value?.toString()).toBe('hello')
    expect(seen).toEqual([{ url, headers: signV4({ method: 'GET', url, accessKeyId: KEY_ID, secret: SECRET, region: 'auto', service: 's3', date: NOW }) }])
    expect(seen[0]!.headers['x-amz-date']).toBe('20261013T083015Z')
  })
  it('asks a limit of time only when one is given', async () => {
    const inits: { signal?: AbortSignal }[] = []
    const fetchImpl = async (_u: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => { inits.push(init); return answer(200) }
    await getObject({ url, credentials, fetchImpl })
    await getObject({ url, credentials, fetchImpl, timeoutMs: 5000 })
    expect(inits[0]!.signal).toBeUndefined()
    expect(inits[1]!.signal).toBeInstanceOf(AbortSignal)
  })
  it('tries a 5xx, a 429, a throw and a body that drops again twice, signing each try with its own clock; a 4xx not at all', async () => {
    let calls = 0, tick = 0
    const stamps: string[] = []
    const script = [() => answer(503), () => answer(429), () => answer(200, 'ok')]
    const flaky = async (_u: string, init: { headers: Record<string, string> }) => { stamps.push(init.headers['x-amz-date']!); return script[calls++]!() }
    const now = () => new Date(NOW.getTime() + 1000 * tick++)
    expect((await getObject({ url, credentials, fetchImpl: flaky, retryMs: 0, now })).value?.toString()).toBe('ok')
    expect(new Set(stamps).size).toBe(3)
    calls = 0
    const thrown = async () => { calls++; if (calls === 1) throw new TypeError('fetch failed'); return calls === 2 ? answer(200, '', true) : answer(200, 'late') }
    expect((await getObject({ url, credentials, fetchImpl: thrown, retryMs: 0 })).value?.toString()).toBe('late')
    expect(calls).toBe(3)
    calls = 0
    const gone = await getObject({ url, credentials, fetchImpl: async () => { calls++; return answer(404) }, retryMs: 0 })
    expect(gone.res?.status).toBe(404)
    expect(gone.value).toBeUndefined()
    expect(calls).toBe(1)
    calls = 0
    const down = await getObject({ url, credentials, fetchImpl: async () => { calls++; throw new TypeError('fetch failed') }, retryMs: 0 })
    expect(down.res).toBeNull()
    expect(calls).toBe(3)
  })
  it('waits retryMs, then twice that, between tries', async () => {
    const waits: number[] = []
    const real = globalThis.setTimeout
    globalThis.setTimeout = ((fn: () => void, ms?: number) => { waits.push(ms ?? 0); return real(fn, 0) }) as typeof setTimeout
    try {
      await withRetry(async () => answer(503), async () => '', 7)
    } finally { globalThis.setTimeout = real }
    expect(waits).toEqual([7, 14])
  })
})
