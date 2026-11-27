// The refusal classifier (design §4 with the lead's ruling 4): each row of the table by who answered and its code, each
// named with how it is known. "observed 2026-11-27" rows are the staging gateway's answers restated as key names and
// codes; "documented" rows are the providers' and the gateway's documentation pages, never observed.
import { describe, expect, it } from 'vitest'
import { bodyShapeOf, DEFAULT_PAUSE_MS, refusalOf } from '../src/refusals.ts'

const NOW = Date.UTC(2026, 10, 27, 12)
const gateway = (code: number) => JSON.stringify({ success: false, error: [{ code, message: 'x' }], messages: [], result: [] })
const anthropic = (type: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'error', error: { type, message: 'x', ...extra }, request_id: 'r' })
const of = (status: number | null, body = '', retryAfter: string | null = null) =>
  refusalOf({ status, body, retryAfter, now: NOW })

describe('refusalOf: the gateway', () => {
  it("observed 2026-11-27: the gateway's 400/2040 (an alias not stored) is key", () => {
    expect(of(400, gateway(2040))).toEqual({
      class: 'key',
      who: 'gateway',
      code: '2040',
      retryAfterMs: null,
      known: 'observed',
    })
  })
  it("observed 2026-11-27: the gateway's 400/2044 (no credential chosen) is ours", () => {
    expect(of(400, gateway(2044))).toMatchObject({ class: 'ours', who: 'gateway', code: '2044', known: 'observed' })
  })
  it("documented: the gateway's 401/2009 is key", () => {
    expect(of(401, gateway(2009))).toMatchObject({ class: 'key', who: 'gateway', code: '2009', known: 'documented' })
  })
  it("documented: the gateway's 403/2049 is ours", () => {
    expect(of(403, gateway(2049))).toMatchObject({ class: 'ours', who: 'gateway', code: '2049', known: 'documented' })
  })
  it("documented: the gateway's 429 is slow, 15 minutes where it names no retry-after", () => {
    expect(of(429, gateway(2003))).toMatchObject({
      class: 'slow',
      who: 'gateway',
      retryAfterMs: 900_000,
      known: 'documented',
    })
    expect(DEFAULT_PAUSE_MS).toBe(900_000)
    expect(of(429, gateway(2003), '120')).toMatchObject({ class: 'slow', retryAfterMs: 120_000 })
  })
  it("a gateway's 400 of a code no row names is unclear, never a class guessed", () => {
    expect(of(400, gateway(9999))).toMatchObject({ class: 'unclear', who: 'gateway', code: '9999', known: 'neither' })
  })
})

describe('refusalOf: a provider', () => {
  it("observed 2026-11-27: the provider's 401 authentication_error is key", () => {
    expect(of(401, anthropic('authentication_error'))).toEqual({
      class: 'key',
      who: 'provider',
      code: 'authentication_error',
      retryAfterMs: null,
      known: 'observed',
    })
  })
  it("observed 2026-11-27: the provider's 404 not_found_error is request", () => {
    expect(of(404, anthropic('not_found_error'))).toMatchObject({
      class: 'request',
      who: 'provider',
      code: 'not_found_error',
      known: 'observed',
    })
  })
  it('documented: a provider 429 with retry-after 30 is slow for 30 s', () => {
    expect(of(429, anthropic('rate_limit_error'), '30')).toMatchObject({
      class: 'slow',
      who: 'provider',
      retryAfterMs: 30_000,
      known: 'documented',
    })
    // an HTTP date, read against the given now
    expect(of(429, anthropic('rate_limit_error'), new Date(NOW + 45_000).toUTCString())).toMatchObject({
      retryAfterMs: 45_000,
    })
  })
  it('documented: a provider 429 without retry-after is slow for the default pause', () => {
    expect(of(429, anthropic('rate_limit_error'))).toMatchObject({
      class: 'slow',
      retryAfterMs: 900_000,
      known: 'documented',
    })
  })
  it("documented: Anthropic's 429 naming its spend limit reached is spent", () => {
    const body = anthropic('rate_limit_error', { details: { error_code: 'enforced_spend_limit_reached' } })
    expect(of(429, body)).toMatchObject({ class: 'spent', who: 'provider', known: 'documented' })
  })
  it("documented: Anthropic's 402 billing_error is spent", () => {
    expect(of(402, anthropic('billing_error'))).toMatchObject({
      class: 'spent',
      who: 'provider',
      code: 'billing_error',
      known: 'documented',
    })
  })
  it("documented: OpenRouter's 402 is spent", () => {
    expect(of(402, JSON.stringify({ error: { code: 402, message: 'x' } }))).toMatchObject({
      class: 'spent',
      who: 'provider',
      code: '402',
      known: 'documented',
    })
  })
  it('documented: a provider 403 is key', () => {
    expect(of(403, anthropic('permission_error'))).toMatchObject({ class: 'key', who: 'provider', known: 'documented' })
  })
  it('documented: a provider 400 is request', () => {
    expect(of(400, anthropic('invalid_request_error'))).toMatchObject({
      class: 'request',
      who: 'provider',
      known: 'documented',
    })
  })
  it('documented: 413 is size', () => {
    expect(of(413, anthropic('request_too_large'))).toMatchObject({ class: 'size', known: 'documented' })
    expect(of(413, '<html>too large</html>')).toMatchObject({ class: 'size', who: 'none' })
  })
  it('documented: 408, 500, 502, 503, 504, 529 are down', () => {
    for (const s of [408, 500, 502, 503, 504, 529]) {
      expect(of(s, anthropic('api_error')), String(s)).toMatchObject({ class: 'down', known: 'documented' })
      expect(of(s, 'Bad gateway'), String(s)).toMatchObject({ class: 'down', who: 'none' })
    }
  })
})

describe('refusalOf: no reply, and what no row names', () => {
  it('no reply (status null) is down', () => {
    expect(of(null)).toEqual({ class: 'down', who: 'none', code: null, retryAfterMs: null, known: 'neither' })
  })
  it('a 418 is unclear', () => {
    expect(of(418, anthropic('teapot'))).toMatchObject({ class: 'unclear', who: 'provider', known: 'neither' })
  })
  it('a body that is not JSON is who none', () => {
    expect(of(401, '<html>nope</html>')).toMatchObject({ who: 'none', code: null })
  })
  it('a body that is JSON of neither shape is who none, and its 400 unclear', () => {
    expect(of(400, JSON.stringify({ message: 'x' }))).toMatchObject({ who: 'none', class: 'unclear' })
  })
  it('a code that is no short name is not carried', () => {
    expect(of(401, anthropic('a value with spaces and sk-ant-secret'))).toMatchObject({ class: 'key', code: null })
  })
})

describe('bodyShapeOf', () => {
  it("names a body's keys, never a value", () => {
    expect(bodyShapeOf(anthropic('authentication_error'))).toBe('error,error.message,error.type,request_id,type')
    const leaky = JSON.stringify({ error: { type: 'authentication_error', message: 'key sk-ant-api03-abcdef is bad' } })
    expect(bodyShapeOf(leaky)).not.toContain('sk-ant')
    expect(bodyShapeOf(gateway(2040))).toBe('error,error[].code,error[].message,messages,result,success')
  })
  it('a key that is no name is not written either; a body that is not JSON has no shape', () => {
    expect(bodyShapeOf(JSON.stringify({ 'sk-ant-api03-abc': 1 }))).toBe('?')
    expect(bodyShapeOf('sk-ant-api03-abc')).toBe('(not json)')
  })
})
