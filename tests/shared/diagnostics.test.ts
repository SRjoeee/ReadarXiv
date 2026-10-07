import { describe, expect, it } from 'vitest'
import { LINE_MAX, RECORD_SHAPES, batchLine, chainLine, failureLine, failureReason, normalizeEntries, redact, scopeTag, sessionLine, splitLine } from '@/shared/diagnostics'

// The diagnostics log's one hard rule (CLAUDE.md hard rule 5): no key in a line, whatever the line quotes

describe('redact', () => {
  it('blanks the key shapes an error may quote: OpenAI-style, Google, a bearer token, a key query parameter', () => {
    expect(redact('401 from https://api.example.com/v1?api_key=abcdef123456 with Bearer sk-live-ABCDEF0123456789 and key sk-0123456789abcdef'))
      .toBe('401 from https://api.example.com/v1?api_key=… with Bearer … and key sk-…')
    expect(redact('AIzaSyD-EXAMPLEKEY0123456789abcdefghijk quota')).toBe('AIza… quota')
    expect(redact('https://x.y/z?token=t0k3n&foo=1')).toBe('https://x.y/z?token=…&foo=1')
  })

  it('leaves ordinary lines alone and caps a quoted response body', () => {
    expect(redact('[axt] batch failed (before retry 0): Batch result count mismatch: expected 1, got 0.')).toBe('[axt] batch failed (before retry 0): Batch result count mismatch: expected 1, got 0.')
    const long = redact(`body: ${'x'.repeat(LINE_MAX * 2)}`)
    expect(long.length).toBe(LINE_MAX + 1)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('failureLine', () => {
  it('never carries the message, whatever the kind: the kind, the HTTP status when known, the length (Codex on #214)', () => {
    expect(failureLine('auth', 'Unauthorized: key=ZZZ-my-secret echoed, paper: the Fourier transform of f', 401)).toMatch(/^auth \(HTTP 401\) — message withheld \(\d+ chars\)$/)
    expect(failureLine('network', 'fetch failed')).toBe('network — message withheld (12 chars)')
    expect(failureLine('invalid-response', 'No object generated; raw model output: the Fourier transform of f is')).toBe('invalid-response — message withheld (68 chars)')
    for (const kind of ['unknown', 'bad-request', 'rate-limit', 'timeout', 'aborted', 'no-key']) expect(failureLine(kind, 'anything')).not.toContain('anything')
  })
})

describe('normalizeEntries', () => {
  it('drops what is not an entry and redacts what is: storage is not trusted either', () => {
    const out = normalizeEntries([
      { t: 1, src: 'content', line: 'key sk-0123456789abcdef in a stored line' },
      { t: 'x', src: 'content', line: 'bad t' },
      { t: 2, src: 'elsewhere', line: 'bad src' },
      { t: 3, src: 'popup' },
      'not an object',
    ])
    expect(out).toEqual([{ t: 1, src: 'content', line: 'key sk-… in a stored line' }])
    expect(normalizeEntries('nope')).toEqual([])
  })
})

// ── The ring's records (issue #237): their shapes, and what none of them may carry

describe('failureReason', () => {
  it('is the page\'s copy of the log\'s rule: the kind, the HTTP status when there was one, the length of the message — in the `kind: detail` shape parseFatal reads', () => {
    expect(failureReason('auth', 'Unauthorized: key=ZZZ-my-secret echoed, paper: the Fourier transform of f', 401)).toBe('auth: HTTP 401, message withheld (73 chars)')
    expect(failureReason('network', 'fetch failed')).toBe('network: message withheld (12 chars)')
    expect(failureReason('invalid-response', 'No object generated; raw model output: the Fourier transform of f is')).not.toContain('Fourier')
  })
})

describe('the records', () => {
  it('tag a session by the first eight characters of its id, and a call without one by a dash', () => {
    expect(scopeTag('0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d')).toBe('0b1c2d3e')
    expect(scopeTag(undefined)).toBe('-')
  })

  it('write a batch as what it cost: its segments, the cache\'s share, the requests that carried it, the outcome', () => {
    expect(batchLine({ scope: 'abcdef12-0000', segments: 8, cached: 2, calls: 1, done: 8 })).toBe('batch abcdef12 segments=8 cached=2 calls=1 done=8 outcome=ok')
    expect(batchLine({ scope: 'abcdef12-0000', segments: 8, cached: 0, calls: 15, done: 3, failed: 'timeout' })).toBe('batch abcdef12 segments=8 cached=0 calls=15 done=3 outcome=failed:timeout')
    expect(batchLine({ segments: 1, cached: 0, calls: 1, done: 1 })).toBe('batch - segments=1 cached=0 calls=1 done=1 outcome=ok')
  })

  it('write a split, a hand-over\'s outcome and the router\'s decisions', () => {
    expect(splitLine('abcdef12-0000', 8, [4, 4])).toBe('split abcdef12 segments=8 into=4+4')
    expect(chainLine({ scope: 'abcdef12-0000', tried: 2, servedBy: 'google-web' })).toBe('chain abcdef12 tried=2 served-by=google-web outcome=ok')
    expect(chainLine({ scope: 'abcdef12-0000', tried: 3, failed: 'rate-limit' })).toBe('chain abcdef12 tried=3 served-by=- outcome=failed:rate-limit')
    expect(sessionLine('abcdef12-0000', 7, 'grace armed')).toBe('session abcdef12 tab=7 grace armed')
    expect(sessionLine('abcdef12-0000', undefined, 'rebound (pack)')).toBe('session abcdef12 tab=- rebound (pack)')
  })

  it('every shape the ring holds is one of RECORD_SHAPES, and no record can be told from a sentence of the paper', () => {
    const lines = [
      batchLine({ scope: 'abcdef12-0000', segments: 8, cached: 0, calls: 3, done: 8 }),
      batchLine({ scope: 'abcdef12-0000', segments: 8, cached: 0, calls: 15, done: 0, failed: 'timeout' }),
      splitLine('abcdef12-0000', 5, [3, 2]),
      chainLine({ scope: 'abcdef12-0000', tried: 2, servedBy: 'microsoft' }),
      chainLine({ scope: 'abcdef12-0000', tried: 2, failed: 'auth' }),
      ...['grace armed', 'grace re-armed round=2', 'probe same', 'probe other', 'probe unknown', 'kept', 'dropped (tab closed) cancelled=3', 'dropped (left) cancelled=0', 'rebound (pack)']
        .map(event => sessionLine('abcdef12-0000', 9, event)),
      'sessions rebound all (service deleted) cancelled=4 moved=2',
    ]
    for (const line of lines) expect(RECORD_SHAPES.some(shape => shape.test(line)), line).toBe(true)
    for (const sentence of ['batch of the paper segments=8 cached=0', 'the Fourier transform of f', 'session abcdef12 tab=7 https://arxiv.org/abs/2410.00260', 'batch abcdef12 segments=8 cached=0 calls=1 done=8 outcome=failed:Unauthorized: the key']) {
      expect(RECORD_SHAPES.some(shape => shape.test(sentence)), sentence).toBe(false)
    }
  })
})
