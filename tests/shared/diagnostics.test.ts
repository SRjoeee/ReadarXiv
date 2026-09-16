import { describe, expect, it } from 'vitest'
import { LINE_MAX, failureLine, normalizeEntries, redact } from '@/shared/diagnostics'

// The diagnostics log's one hard rule (CLAUDE.md rule 7): no key in a line, whatever the line quotes

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
  it('keeps the message for the kinds an endpoint or the transport words, withholds it for the kinds that may quote the paper', () => {
    expect(failureLine('auth', 'Unauthorized: invalid key')).toBe('auth: Unauthorized: invalid key')
    expect(failureLine('network', 'fetch failed')).toBe('network: fetch failed')
    expect(failureLine('invalid-response', 'No object generated; raw model output: the Fourier transform of f is')).toBe('invalid-response (message of 68 chars withheld: may quote the response)')
    expect(failureLine('unknown', '{"error":"…the request body echoed…"}')).toMatch(/^unknown \(message of \d+ chars withheld/)
    expect(failureLine('bad-request', 'x')).toMatch(/^bad-request \(message of 1 chars withheld/)
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
