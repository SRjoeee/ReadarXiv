// The extension's today session tells the chrome its events as they are (host/today.ts, no cast: the types hold today's
// vocabulary to the chrome's). This holds what the chrome makes of each word of it: every event kind, every reason a
// bilingual version is not to be had (today's Unavailable), every chain error kind a run or a failure says. The records below
// are typed by today's own unions, so a word today's session gains is a word this test must be given (tsc), and a word the
// chrome stops handling fails here (4354b0e01 took `no-pdf` from the chrome: such a paper's displays were no longer greyed and
// nothing said why; c5e662ba9 took the rate limit's own card, which promises no retry of its own).
import { describe, expect, it } from 'vitest'
import { R } from '@readarxiv/ui'
import { INITIAL, reduce, type SessionEvent as ChromeEvent } from '@readarxiv/reader'
import { PROVIDER_ERROR_KINDS, type ProviderErrorKind } from '@/providers/types'
import { LASTING, type SessionEvent, type Unavailable } from '@/pdf-reader/session/events'
import { plain } from '../../packages/reader/src/chrome/capsule-words'
import type { ReaderState } from '../../packages/reader/src/chrome/model'
import { capsuleOf, cardOf, lineOf, spokenOf } from '../../packages/reader/src/chrome/status'

/** today's events but its settings, which host/today.ts turns into the chrome's `prefs` */
type Told = Exclude<SessionEvent, { type: 'settings' }>
// (the types' own check: every event today's session tells is one of the chrome's)
const told = (e: Told): ChromeEvent => e
const fold = (es: Told[]): ReaderState => es.map(told).reduce(reduce, { ...INITIAL, display: 'bilingual' })
const seen = { noticeClosed: 0, narrowShown: false, refusalsSeen: 0 }
const languages = { name: (t: string) => t, tag: (t: string) => t }
const reason = (k: ProviderErrorKind) => `reason ${k}`
const opened: Told = { type: 'opened' }
const page: Told = { type: 'page', side: 'left', page: 1, pages: 4 }
const laid = (n: number): Told => ({ type: 'layer', state: 'open', laid: n, total: 4 })

/** every reason today's session says, its kind: the paper's (lasting), the language's, or a moment's with its words */
const WHYS: Record<Unavailable, 'paper' | 'language' | string> = {
  'no-source': 'paper',
  'no-pdf': 'paper',
  'cannot-prepare': 'paper',
  'unknown-versions': 'paper',
  target: 'language',
  refused: R.status.limited,
  unreachable: R.status.notNow,
}
/** one of each event today's session tells, in a visit where it can be told */
const EVENTS: Record<Told['type'], Told[]> = {
  saved: [opened, page, { type: 'refused' }, { type: 'saved' }],
  notice: [opened, page, { type: 'notice', why: 'unreadable' }],
  refused: [opened, page, { type: 'refused' }],
  outline: [opened, page, { type: 'outline', entries: [] }],
  heading: [opened, page, { type: 'heading', id: null }],
  paper: [opened, page, { type: 'paper', id: '2600.00001', title: 'T' }],
  sync: [opened, page, { type: 'sync', on: true }],
  display: [opened, page, { type: 'display', mode: 'translation' }],
  scale: [opened, page, { type: 'scale', scale: 1.2, zoom: null }],
  loading: [{ type: 'loading', loaded: 300, total: 1000 }],
  page: [opened, page],
  opened: [opened],
  html: [opened, page, { type: 'html', url: 'https://arxiv.org/html/2600.00001v1#readarxiv' }],
  fail: [{ type: 'fail', event: 'service', text: 'x', kind: 'network' }],
  preparing: [opened, page, { type: 'preparing', position: 2, progress: 0.3 }],
  coming: [opened, page, { type: 'preparing', position: null, progress: 0.3 }, { type: 'coming' }],
  prepared: [opened, page, { type: 'coming' }, { type: 'prepared' }],
  layer: [opened, page, laid(2)],
  translating: [opened, page, laid(1), { type: 'translating', got: 3, total: 9, lost: 0 }],
  translated: [opened, page, laid(2), { type: 'translated', got: 9, total: 9, lost: 0, stopped: null }],
  unavailable: [opened, page, { type: 'unavailable', why: 'no-source', retryAt: null }],
}

describe("the extension's today session told through the chrome (host/today.ts)", () => {
  it('every event kind it tells folds into a state', () => {
    for (const [type, es] of Object.entries(EVENTS)) expect(() => fold(es), type).not.toThrow()
  })

  it("every reason it gives: the paper's greys the translated displays and says so; the language's is the language's; a moment's says its words, the displays kept", () => {
    for (const [why, kind] of Object.entries(WHYS) as [Unavailable, string][])
      for (const retryAt of [null, 4_102_444_800_000]) {
        const s = fold([opened, page, { type: 'unavailable', why, retryAt }])
        const capsule = capsuleOf(s, seen, languages)
        if (kind === 'paper') {
          expect(LASTING.has(why), why).toBe(true)
          expect([s.available, capsule], why).toEqual([false, { kind: 'unavailable', words: plain(R.status.noPdf) }])
        } else if (kind === 'language') expect([s.available, s.languageSupported], why).toEqual([true, false])
        else {
          expect(LASTING.has(why), why).toBe(false)
          expect([s.available, capsule?.kind, capsule?.words], why).toEqual([true, 'notNow', plain(kind)])
        }
      }
  })

  it("the paper's layer being made: said to a screen reader as being prepared, the progress line on; the translation as translating", () => {
    const preparing = fold(EVENTS.preparing)
    expect([preparing.phase, spokenOf(preparing), lineOf(preparing).on]).toEqual(['preparing', R.status.preparing, true])
    const translating = fold(EVENTS.translating)
    expect([translating.phase, spokenOf(translating), lineOf(translating).on]).toEqual([
      'translating',
      R.status.translating,
      true,
    ])
    expect(spokenOf(fold(EVENTS.loading))).toBe(R.status.loading)
  })

  it("every chain error kind a run stops at or a failure says: a card in the host's words, a rate limit in the chrome's own (no retry of its own is promised), a key's at the settings, the reader's own abort none", () => {
    for (const kind of PROVIDER_ERROR_KINDS) {
      const runs = fold([opened, page, laid(0), { type: 'translated', got: 0, total: 9, lost: 0, stopped: kind }])
      for (const event of ['fetch failed', 'service', 'crashed'] as const) {
        const failed = fold([{ type: 'fail', event, text: 'x', kind }])
        for (const s of [runs, failed])
          expect(cardOf(s, reason), `${kind} ${event}`).toEqual(
            kind === 'aborted'
              ? null
              : {
                  reason: kind === 'rate-limit' ? R.status.rateLimited : reason(kind),
                  action: kind === 'no-key' || kind === 'auth' ? 'settings' : 'retry',
                },
          )
      }
    }
  })
})
