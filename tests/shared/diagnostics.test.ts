import { describe, expect, it } from 'vitest'
import { LINE_MAX, redact } from '@/shared/diagnostics'

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
