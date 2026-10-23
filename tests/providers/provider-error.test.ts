import { describe, expect, it } from 'vitest'
import { attachRequestErrorMeta, defaultRequestRetryPolicy, getRequestErrorMeta } from '@/providers/request/retry-policy'
import { malformedReply, PROVIDER_ERROR_KINDS, ProviderError, isPermanentErrorKind, type ProviderErrorKind } from '@/providers/types'

const decide = (error: unknown, retryCount = 0) =>
  defaultRequestRetryPolicy.decide(error, { retryCount, maxRetries: 2, baseRetryDelayMs: 1000, now: 0, rateLimitRetryCount: 0, consecutiveRateLimits: 0 })

// The ported retry-policy knows only its own kinds; ProviderError attaches metadata by kind at construction so the policy decides right
describe('ProviderError\'s retry metadata', () => {
  it('the kinds a session stops on are exactly the kinds the queue drains on: one notion of “only a changed setting can help”, written in two tables', () => {
    // PERMANENT_ERROR_KINDS (the chain, the service, both runs, the session) and META_BY_KIND's `access-denied` (the
    // request queue's failQueue) are kept apart by a module boundary; a kind added to one and not the other would
    // stop the session and keep firing the queue, or drain the queue and leave the session running
    for (const kind of PROVIDER_ERROR_KINDS) {
      const drains = decide(new ProviderError(kind, kind)).action === 'fail' && (decide(new ProviderError(kind, kind)) as { failQueue?: boolean }).failQueue === true
      expect([kind, drains]).toEqual([kind, isPermanentErrorKind(kind)])
    }
  })

  it('no-key / auth: no retry, and the whole queue drains (as with 401 / 403)', () => {
    for (const kind of ['no-key', 'auth'] as const) {
      const decision = decide(new ProviderError(kind, kind))
      expect(decision).toEqual({ action: 'fail', failQueue: true })
    }
  })

  it('aborted / invalid-response: no retry, but the queue is not drained', () => {
    for (const kind of ['aborted', 'invalid-response'] as const) {
      expect(getRequestErrorMeta(new ProviderError(kind, kind)).isRetryable).toBe(false)
      expect(decide(new ProviderError(kind, kind))).toEqual({ action: 'fail' })
    }
  })

  it('invalid-response names its kind: a raw model output quoted in the message that says 429 or timeout is no rate limit and no network failure', () => {
    const quoted = new ProviderError('invalid-response', 'does not match the schema; raw model output: HTTP 429 Too Many Requests, a rate limit after the timeout')
    expect(getRequestErrorMeta(quoted).kind).toBe('unknown')
    expect(decide(quoted)).toEqual({ action: 'fail' })
  })

  it('a malformed reply: retried once, under the queue\'s own cap, then failed, never pausing the queue whatever its message quotes (DESIGN §8.2)', () => {
    const reply = malformedReply('No object generated; raw model output: rate limit exceeded (429)')
    expect(reply).toMatchObject({ kind: 'invalid-response', isolatable: false })
    expect(decide(reply, 0).action).toBe('retry')
    expect(decide(reply, 1)).toEqual({ action: 'fail' })
    // the queue's cap still binds where it is lower (a test's or a caller's maxRetries: 0)
    expect(defaultRequestRetryPolicy.decide(reply, { retryCount: 0, maxRetries: 0, baseRetryDelayMs: 0, now: 0, rateLimitRetryCount: 0, consecutiveRateLimits: 0 })).toEqual({ action: 'fail' })
  })

  it('timeout / network: retry with backoff; rate-limit: pause', () => {
    expect(decide(new ProviderError('timeout', 't')).action).toBe('retry')
    expect(decide(new ProviderError('network', 'n')).action).toBe('retry')
    expect(decide(new ProviderError('rate-limit', '429')).action).toBe('pause-and-retry')
  })

  it('the metadata the provider adds afterwards by status code layers over the defaults: a 429\'s Retry-After applies, and when the SDK says not retryable there is no retry', () => {
    const limited = attachRequestErrorMeta(new ProviderError('rate-limit', '429'), { statusCode: 429, responseHeaders: { 'retry-after': '30' }, isRetryable: true })
    const decision = decide(limited)
    expect(decision.action).toBe('pause-and-retry')
    if (decision.action === 'pause-and-retry') expect(decision.pauseMs).toBeGreaterThanOrEqual(30_000)
    const flaky = attachRequestErrorMeta(new ProviderError('network', '500'), { statusCode: 500, isRetryable: false })
    expect(decide(flaky)).toEqual({ action: 'fail' })
  })

  it('every kind has its metadata, none slips through', () => {
    const kinds: ProviderErrorKind[] = ['no-key', 'network', 'rate-limit', 'auth', 'invalid-response', 'timeout', 'aborted', 'unknown']
    for (const kind of kinds) expect(() => new ProviderError(kind, kind)).not.toThrow()
    // unknown is left to the policy to judge by status code / message: with no clue the default is retryable (as in Read Frog)
    expect(decide(new ProviderError('unknown', 'boom')).action).toBe('retry')
  })
})
