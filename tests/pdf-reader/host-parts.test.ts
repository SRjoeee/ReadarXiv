// The extension's page's parts of the reader's chrome (src/pdf-reader/host/parts.ts): the first read as the one preference
// model, a failure's words by the service chosen, the probes' hook
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { DEFAULT_PREFS, firstOf } from '@/pdf-reader/host/parts'
import { prefsOf } from '@/pdf-reader/host/prefs'

describe('the extension page\'s parts of the chrome', () => {
  it('the first read: none in its time, or one that fell back, is unreadable; a read is the one model', () => {
    expect(firstOf(null)).toEqual({ prefs: null, unreadable: true })
    expect(firstOf({ config: DEFAULT_CONFIG, fallbackReason: { kind: 'unknown' } } as never)).toEqual({ prefs: prefsOf(DEFAULT_CONFIG), unreadable: true })
    expect(firstOf({ config: { ...DEFAULT_CONFIG, theme: 'dark' }, fallbackReason: null } as never)).toMatchObject({ prefs: { theme: 'dark' }, unreadable: false })
    expect(DEFAULT_PREFS()).toEqual(prefsOf(DEFAULT_CONFIG))
  })
})
