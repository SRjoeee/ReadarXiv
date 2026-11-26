// The capsule of the PDF download (UI.md S-R-09): the file being made, its share a count of its own, with the spinner and its
// cancel; a failure with the alert, its retry and its close; over what else would stand (the translation is final by then),
// never over a host's passing words. The words are the catalogue's, in the interface's language.
import { describe, expect, it } from 'vitest'
import { R } from '@readarxiv/ui'
import { textOf } from '../../src/chrome/capsule-words.ts'
import { INITIAL, type ReaderState } from '../../src/chrome/model.ts'
import { capsuleLook, capsuleOf } from '../../src/chrome/status.ts'
import { LANGUAGES } from './parts.ts'

const ready: ReaderState = { ...INITIAL, phase: 'ready', download: 'translation', failedUnits: 2 }
const seen = { noticeClosed: 0, narrowShown: true, refusalsSeen: 0 }
const of = (s: ReaderState) => capsuleOf(s, seen, LANGUAGES)

describe('the PDF download in the capsule', () => {
  it('says the file being made and its share, the share a count of its own, with the spinner', () => {
    const c = of({ ...ready, exporting: { form: 'side-by-side', percent: 45 } })
    expect(c?.kind).toBe('export')
    expect(c && textOf(c.words)).toBe(R.export.making('sideBySide', 45))
    expect(c?.words.count).toBe(45)
    expect(c && capsuleLook(c, ready, 'plain', 0).sign).toBe('spinner')
  })

  it('stands over the notice of failed passages, and a host’s passing words over it', () => {
    expect(of(ready)?.kind).toBe('notice')
    expect(of({ ...ready, exporting: { form: 'translation', percent: 3 } })?.kind).toBe('export')
    expect(
      of({ ...ready, exporting: { form: 'translation', percent: 3 }, toast: { words: 'copied', icon: 'check' } })?.kind,
    ).toBe('toast')
  })

  it('says a failure with the alert, in every host’s signs', () => {
    const s = { ...ready, exportFailed: 'translation' as const }
    const c = of(s)
    expect([c?.kind, c && textOf(c.words)]).toEqual(['exportFailed', R.export.failed('translation')])
    expect(c && capsuleLook(c, s, 'plain', 0)).toEqual({ sign: 'alert', tone: 'alert' })
    expect(c && capsuleLook(c, s, 'by-state', 0)).toEqual({ sign: 'alert', tone: 'alert' })
  })
})
