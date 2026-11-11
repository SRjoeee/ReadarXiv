import { describe, expect, it, vi } from 'vitest'
import {
  createController,
  INITIAL,
  reduce,
  type Session,
  type SessionEvent,
  type SessionHost,
} from '../../src/chrome/model.ts'
import { PARTS } from '../../src/chrome/parts.tsx'
import { capsuleOf, cardOf, lineOf, spokenOf } from '../../src/chrome/status.ts'
import { DEFAULTS, type Prefs } from '../../src/prefs.ts'

const fold = (events: SessionEvent[], from = INITIAL) => events.reduce(reduce, from)
const opened: SessionEvent = { type: 'opened' }
const laid = (n: number): SessionEvent => ({ type: 'layer', state: 'open', laid: n, total: 4 })

describe('reduce: the session events folded into the reader state', () => {
  it("follows the display, the scale and each side's page", () => {
    const state = fold([
      { type: 'display', mode: 'bilingual' },
      { type: 'scale', scale: 1.3 },
      { type: 'page', side: 'right', page: 4, pages: 26 },
    ])
    expect(state.display).toBe('bilingual')
    expect(state.scale).toBe(1.3)
    expect(state.sides).toEqual({ left: { page: 1, pages: 0 }, right: { page: 4, pages: 26 } })
  })

  it("follows the PDF's download as a share, in hundredths, nothing for a download of unknown size (the maintainer, 2026-09-25)", () => {
    const state = fold([{ type: 'loading', loaded: 250, total: 1000 }])
    expect(state.loaded).toBe(0.25)
    expect(reduce(state, { type: 'loading', loaded: 251, total: 1000 })).toBe(state)
    expect(fold([{ type: 'loading', loaded: 250, total: 0 }]).loaded).toBe(0)
    expect(fold([{ type: 'loading', loaded: 1200, total: 1000 }]).loaded).toBe(1)
  })

  it('is ready once the original is open, in every display: the original is readable while the layer comes; its download is the original', () => {
    for (const mode of ['original', 'bilingual', 'translation'] as const)
      expect(fold([{ type: 'display', mode }, opened]).phase, mode).toBe('ready')
    expect(fold([opened]).download).toBe('original')
    expect(INITIAL.download).toBe('none')
  })
})

// The layer as the reader's only translated view (Stage 5 Task 12): every row of its fallback table, on the events alone
describe("reduce: the layer's states (Task 12)", () => {
  const phases = (events: SessionEvent[]) => {
    const seen: string[] = []
    events.reduce((state, event) => {
      const next = reduce(state, event)
      if (seen.at(-1) !== next.phase) seen.push(next.phase)
      return next
    }, INITIAL)
    return seen
  }
  it('a layer and a working service: loading, then translating as rows come, then reading; the pages laid counted', () => {
    const events: SessionEvent[] = [
      opened,
      { type: 'coming' },
      { type: 'translating', got: 0, total: 40, lost: 0 },
      laid(1),
      { type: 'translating', got: 10, total: 40, lost: 2 },
    ]
    expect(fold(events)).toMatchObject({
      phase: 'translating',
      progress: 0.25,
      failedUnits: 2,
      layer: { laid: 1, total: 4 },
    })
    const done = fold([...events, { type: 'translated', got: 38, total: 40, lost: 2, stopped: null }])
    expect(done).toMatchObject({ phase: 'ready', progress: 0.95, failedUnits: 2, failure: null })
    expect(phases([...events, { type: 'translated', got: 40, total: 40, lost: 0, stopped: null }])).toEqual([
      'ready',
      'translating',
      'ready',
    ])
  })

  it('laying: a translation done before a page of the layer is laid where the translation shows holds its end, the line on and the translation said, until one is; the original display waits on nothing', () => {
    const bilingual: SessionEvent = { type: 'display', mode: 'bilingual' }
    const start: SessionEvent = { type: 'translating', got: 0, total: 9, lost: 0 },
      end: SessionEvent = { type: 'translated', got: 9, total: 9, lost: 0, stopped: null }
    const done = fold([bilingual, opened, { type: 'coming' }, start, end])
    expect(done).toMatchObject({ phase: 'translating', progress: 1 })
    expect(lineOf(done).on).toBe(true)
    expect(spokenOf(done)).toBe(spokenOf(fold([bilingual, opened, start])))
    expect(fold([laid(1)], done)).toMatchObject({ phase: 'ready', progress: 1 })
    // a page laid before the end: ready at once
    expect(fold([bilingual, opened, laid(1), start, end]).phase).toBe('ready')
    // the original shown: nothing waits on a page; the translation chosen afterwards waits on nothing either
    const original = fold([opened, start, end])
    expect(original.phase).toBe('ready')
    expect(fold([bilingual], original).phase).toBe('ready')
    // the layer refused meanwhile: reading, the original stays
    expect(fold([{ type: 'layer', state: 'refused', laid: 0, total: 4 }], done).phase).toBe('ready')
  })

  it("laying ends on a page shown as arXiv's by the rule (the side's `original`: no part lays a line on it), with nothing laid: told after the end or before it; such a page draws no translation, so a run stopped short over it keeps its card", () => {
    // 2610.30854v1 on staging 9236d8f8: our compile set pages 1 to 9 a line apart from arXiv's, the page check drew none of them,
    // and the end was held while the reader looked at page 1, the line on until a page past 9 was laid
    const bilingual: SessionEvent = { type: 'display', mode: 'bilingual' }
    const start: SessionEvent = { type: 'translating', got: 0, total: 9, lost: 0 },
      end: SessionEvent = { type: 'translated', got: 9, total: 9, lost: 0, stopped: null }
    const ruled: SessionEvent = { type: 'layer', state: 'open', laid: 0, total: 13, original: 2 }
    const done = fold([bilingual, opened, { type: 'coming' }, start, end])
    expect(done).toMatchObject({ phase: 'translating', laying: true })
    const after = fold([ruled], done)
    expect(after).toMatchObject({ phase: 'ready', laying: false, layer: { laid: 0, total: 13, original: 2 } })
    expect(lineOf(after).on).toBe(false)
    // told before the end: the end is not held
    expect(fold([bilingual, opened, ruled, start, end])).toMatchObject({ phase: 'ready', laying: false })
    // stopped short over it, nothing laid: the card with the service's reason, as with no page at all
    expect(
      fold([bilingual, opened, ruled, { type: 'translated', got: 0, total: 9, lost: 9, stopped: 'network' }]),
    ).toMatchObject({ phase: 'failed', failure: 'network' })
    // (the view's event that tells it: the extension's session, tests/pdf-reader/session-events.test.ts)
  })

  it('a layer and a failing service: the card with its reason while nothing is laid; laid pages stay readable, the notice with its retry', () => {
    expect(fold([opened, { type: 'fail', event: 'service', text: '', kind: 'no-key' }])).toMatchObject({
      phase: 'failed',
      failure: 'no-key',
    })
    const stopped = fold([opened, laid(2), { type: 'translated', got: 10, total: 40, lost: 30, stopped: 'network' }])
    expect(stopped).toMatchObject({ phase: 'ready', failure: 'network', failedUnits: 30 })
    expect(fold([opened, { type: 'translated', got: 0, total: 40, lost: 40, stopped: 'network' }])).toMatchObject({
      phase: 'failed',
      failure: 'network',
    })
    // a retry that translates mends it
    expect(fold([{ type: 'translating', got: 10, total: 40, lost: 0 }], stopped)).toMatchObject({
      phase: 'translating',
      failure: null,
    })
  })

  it("preparing: the original, the prepare's place and progress, then the layer as it comes", () => {
    const p = fold([
      opened,
      { type: 'preparing', position: 3, progress: null },
      { type: 'preparing', position: null, progress: 0.4 },
    ])
    expect(p).toMatchObject({ phase: 'preparing', preparing: { position: null, progress: 0.4 }, available: true })
    expect(fold([{ type: 'coming' }, { type: 'translating', got: 0, total: 9, lost: 0 }], p)).toMatchObject({
      phase: 'translating',
      preparing: { position: null, progress: 0.4 },
    })
    expect(fold([{ type: 'coming' }, { type: 'prepared' }], p)).toMatchObject({ phase: 'ready', preparing: null })
  })
  it('a prepare told while the original loads is the phase once the original is on screen, the translation not begun', () => {
    // (our server's first answer can come before the original is read: loading stays loading, then the prepare's phase)
    const loading = fold([{ type: 'preparing', position: null, progress: 0.2 }])
    expect(loading.phase).toBe('loading')
    expect(fold([opened], loading)).toMatchObject({ phase: 'preparing', preparing: { progress: 0.2 } })
    // (begun: the translation's phase is its run's, a prepare beside it)
    const begun = fold([{ type: 'translating', got: 1, total: 9, lost: 0 }], loading)
    expect(fold([opened], begun).phase).toBe('translating')
  })

  it("the prepare is a state of its own, ended by the catalog: a poll once the translation has begun moves no phase, and nothing flips (the review's probe)", () => {
    const prep = (position: number | null, progress: number): SessionEvent => ({
      type: 'preparing',
      position,
      progress,
    })
    const seq: SessionEvent[] = [
      opened,
      prep(2, 0.1),
      { type: 'coming' },
      { type: 'translating', got: 0, total: 40, lost: 0 },
      prep(null, 0.3),
      { type: 'translating', got: 20, total: 40, lost: 3 },
      { type: 'translated', got: 40, total: 40, lost: 3, stopped: null },
      prep(null, 0.6),
      { type: 'coming' },
      laid(3),
      { type: 'prepared' },
    ]
    const phases: string[] = [],
      spoken: string[] = []
    let s = INITIAL
    for (const e of seq) {
      s = reduce(s, e)
      phases.push(s.phase)
      spoken.push(spokenOf(s))
    }
    expect(phases).toEqual([
      'ready',
      'preparing',
      'preparing',
      'translating',
      'translating',
      'translating',
      'ready',
      'ready',
      'ready',
      'ready',
      'ready',
    ])
    // said once each, never back: the status region does not flip between the two
    expect(spoken.filter((w, i) => w && w !== spoken[i - 1])).toHaveLength(2)
    // held beside the translation while it lasts, gone with the catalog
    expect(fold(seq.slice(0, 5)).preparing).toEqual({ position: null, progress: 0.3 })
    expect(s.preparing).toBeNull()
    // the translation ended, a poll after it leaves the line off and the passages that failed told
    const after = fold(seq.slice(0, 8))
    expect(lineOf(after).on).toBe(false)
    expect(capsuleOf(after, { noticeClosed: false, narrowShown: false, refusalsSeen: 0 }, PARTS.languages)?.kind).toBe(
      'notice',
    )
  })

  it('no source, no PDF, a prepare that cannot succeed: the translated displays greyed, the HTML version offered', () => {
    for (const why of ['no-source', 'no-pdf', 'cannot-prepare', 'unknown-versions'] as const) {
      expect(
        fold([opened, { type: 'preparing', position: 1, progress: 0 }, { type: 'unavailable', why, retryAt: null }]),
        why,
      ).toMatchObject({
        available: false,
        phase: 'ready',
        preparing: null,
        languageSupported: true,
        unavailable: { why },
      })
    }
    expect(fold([{ type: 'html', url: 'https://arxiv.org/html/1706.03762#readarxiv' }])).toMatchObject({
      htmlVersion: 'https://arxiv.org/html/1706.03762#readarxiv',
    })
  })

  it('no bilingual version, told while the original still loads: the load stays the state (its line by the share downloaded, said as loading) until the original is on screen, the word kept for then', () => {
    // the run starts beside the original's download (session/host.ts), and our server's answer can come first
    const early: SessionEvent[] = [
      { type: 'unavailable', why: 'no-source', retryAt: null },
      { type: 'unavailable', why: 'unreachable', retryAt: null },
      { type: 'layer', state: 'refused', laid: 0, total: 4 },
    ]
    for (const event of early) {
      const loading = fold([
        { type: 'display', mode: 'bilingual' },
        { type: 'loading', loaded: 300, total: 1000 },
        event,
      ])
      expect(loading.phase, JSON.stringify(event)).toBe('loading')
      expect(lineOf(loading).on).toBe(true)
      expect(lineOf(loading).value).toBeCloseTo(0.3 * 0.15)
      expect(spokenOf(loading)).toBe(spokenOf(INITIAL))
      const shown = fold([opened], loading)
      expect(shown.phase).toBe('ready')
      expect(shown.unavailable).toEqual(loading.unavailable)
    }
  })

  it('refused, unreachable: the original, passing (the displays not greyed); the layer coming after a retry clears it', () => {
    for (const why of ['refused', 'unreachable'] as const) {
      const s = fold([opened, { type: 'unavailable', why, retryAt: why === 'refused' ? 1234 : null }])
      expect(s, why).toMatchObject({
        available: true,
        phase: 'ready',
        unavailable: { why, retryAt: why === 'refused' ? 1234 : null },
      })
      expect(fold([{ type: 'coming' }], s).unavailable).toBeNull()
    }
    // the view's side refused (a part, the base, the composed document): no layer for the visit, the original stays
    expect(fold([opened, { type: 'layer', state: 'refused', laid: 0, total: 4 }])).toMatchObject({
      phase: 'ready',
      unavailable: { why: 'unreachable' },
    })
  })

  it("a layer that draws nothing is the paper's (a head over arXiv's PDF: the run says `cannot-prepare` at the head), and the side's own refusal at the base, before or after, does not make it a moment's: the lasting word stands, the displays greyed", () => {
    const refused: SessionEvent = { type: 'layer', state: 'refused', laid: 0, total: 4 },
      lasting: SessionEvent = { type: 'unavailable', why: 'cannot-prepare', retryAt: null }
    for (const order of [
      [lasting, refused],
      [refused, lasting],
    ]) {
      expect(fold([opened, ...order]), JSON.stringify(order.map((e) => e.type))).toMatchObject({
        phase: 'ready',
        available: false,
        unavailable: { why: 'cannot-prepare', retryAt: null },
      })
    }
    // a limit's wait (passing) is the side's refusal's to replace, as before
    expect(fold([opened, { type: 'unavailable', why: 'refused', retryAt: 99 }, refused]).unavailable).toEqual({
      why: 'unreachable',
      retryAt: null,
    })
  })

  it("the original not opened (its fetch failed): the run's translation meanwhile leaves its card; the original's open mends it", () => {
    const failed = fold([
      { type: 'fail', event: 'fetch failed', text: '', kind: 'network' },
      { type: 'translating', got: 3, total: 9, lost: 0 },
      { type: 'translated', got: 9, total: 9, lost: 0, stopped: null },
    ])
    expect(failed).toMatchObject({ phase: 'failed', failure: 'network', progress: 1 })
    expect(fold([{ type: 'page', side: 'left', page: 1, pages: 4 }, opened], failed)).toMatchObject({
      phase: 'ready',
      failure: null,
    })
  })

  it("a run's rows coming, told whatever the phase: the original's failure holds the phase meanwhile (the capsule beside its own card tells the run, L11 third round, gap 5)", () => {
    const failed = fold([
      { type: 'fail', event: 'fetch failed', text: '', kind: 'network' },
      { type: 'translating', got: 3, total: 9, lost: 0 },
    ])
    expect(failed).toMatchObject({ phase: 'failed', rowsComing: true, translated: { got: 3, total: 9 } })
    expect(fold([{ type: 'translated', got: 9, total: 9, lost: 0, stopped: null }], failed).rowsComing).toBe(false)
    expect(fold([{ type: 'unavailable', why: 'unreachable', retryAt: null }], failed).rowsComing).toBe(false)
    // (and with the original read: from the first batch to the end)
    const read = fold([opened, { type: 'translating', got: 1, total: 9, lost: 0 }])
    expect([read.rowsComing, INITIAL.rowsComing]).toEqual([true, false])
    expect(
      fold([{ type: 'translated', got: 0, total: 9, lost: 0, stopped: 'network', retryAt: null }], read).rowsComing,
    ).toBe(false)
  })

  it('a target the layer does not set: the language not supported (the menu offered), the paper not greyed', () => {
    expect(fold([opened, { type: 'unavailable', why: 'target', retryAt: null }])).toMatchObject({
      languageSupported: false,
      available: true,
      phase: 'ready',
    })
  })

  it("the engine fails fast (network), the PDF opens later: the failure card stays, with its retry; the reverse, the PDF's own fetch failure mended by its open, is cleared (Devin, Codex on #391)", () => {
    const service = fold([{ type: 'fail', event: 'service', text: '', kind: 'network' }, opened])
    expect(service).toMatchObject({ phase: 'failed', failure: 'network' })
    expect(cardOf(service, PARTS.reason)).toEqual({ reason: expect.any(String), action: 'retry' })
    const pdf = fold([{ type: 'fail', event: 'fetch failed', text: '', kind: 'network' }, opened])
    expect(pdf).toMatchObject({ phase: 'ready', failure: null })
    expect(cardOf(pdf, PARTS.reason)).toBeNull()
    // the run's events over a service's failure leave it the service's: no original's fetch failure is made of it
    expect(
      fold([
        { type: 'fail', event: 'service', text: '', kind: 'no-key' },
        { type: 'translated', got: 0, total: 9, lost: 0, stopped: null },
        opened,
      ]).failure,
    ).not.toBe('network')
  })

  describe("a failure per origin: the PDF's and the service's, each set and cleared by its own events alone (Codex on #391)", () => {
    const pdfFails: SessionEvent = { type: 'fail', event: 'fetch failed', text: '', kind: 'network' }
    const serviceFails = (kind: 'network' | 'no-key' = 'no-key'): SessionEvent => ({
      type: 'fail',
      event: 'service',
      text: '',
      kind,
    })
    const recovers: SessionEvent = { type: 'translating', got: 0, total: 9, lost: 0 }
    it("the PDF fails, then the service: the PDF's card first (nothing reads without the original), its retry; the service's held", () => {
      const s = fold([pdfFails, serviceFails()])
      expect(s.failures).toEqual({ pdf: 'network', service: 'no-key' })
      expect(s.phase).toBe('failed')
      expect(cardOf(s, PARTS.reason)?.action).toBe('retry')
    })
    it("the service fails, then the PDF: the PDF's card first all the same", () => {
      const s = fold([serviceFails(), pdfFails])
      expect(s.failures).toEqual({ pdf: 'network', service: 'no-key' })
      expect(cardOf(s, PARTS.reason)?.action).toBe('retry')
      // the run's events under no original move nothing
      expect(fold([{ type: 'translated', got: 0, total: 9, lost: 0, stopped: null }], s)).toMatchObject({
        phase: 'failed',
        failures: { pdf: 'network' },
      })
    })
    it("the PDF opens: the service's card stays, actionable (no key: the settings); the service recovers: the PDF's card stays", () => {
      const opened1 = fold([pdfFails, serviceFails(), opened])
      expect(opened1).toMatchObject({ phase: 'failed', failures: { pdf: null, service: 'no-key' }, failure: 'no-key' })
      expect(cardOf(opened1, PARTS.reason)?.action).toBe('settings')
      const recovered = fold([pdfFails, serviceFails('network'), recovers])
      expect(recovered).toMatchObject({
        phase: 'failed',
        failures: { pdf: 'network', service: null },
        failure: 'network',
      })
      expect(cardOf(recovered, PARTS.reason)?.action).toBe('retry')
    })
    it('both fail, then each recovers, in either order: reading at the end, no failure left', () => {
      for (const order of [
        [opened, recovers],
        [recovers, opened],
      ]) {
        const s = fold([pdfFails, serviceFails('network'), ...order])
        expect(s.failures, JSON.stringify(order.map((e) => e.type))).toEqual({ pdf: null, service: null })
        expect(s.failure).toBeNull()
        expect(s.phase).not.toBe('failed')
      }
    })
  })

  it("the original opening after a service failed keeps the service's reason: the card stays the one that says what to do (no key: the settings) (Codex on #390)", () => {
    const noKey = fold([{ type: 'fail', event: 'service', text: '', kind: 'no-key' }, opened])
    expect(noKey).toMatchObject({ phase: 'failed', failure: 'no-key' })
    // the original's own fetch failure, mended by its open: cleared, reading
    const fetchFailed = fold([{ type: 'fail', event: 'fetch failed', text: '', kind: 'network' }, opened])
    expect(fetchFailed).toMatchObject({ phase: 'ready', failure: null })
  })

  it("a stop told `unknown` (the service's own abort, the run's toldKind) is the card and its retry over nothing laid, the notice and its retry over pages laid; `aborted`, the reader's own cancel, shows neither (UI.md §3.4)", () => {
    const seen = { noticeClosed: false, narrowShown: false, refusalsSeen: 0 }
    const none = fold([opened, { type: 'translated', got: 0, total: 7, lost: 7, stopped: 'unknown' }])
    expect(cardOf(none, PARTS.reason)).toEqual({ reason: PARTS.reason('unknown'), action: 'retry' })
    const part = fold([opened, laid(2), { type: 'translated', got: 3, total: 7, lost: 4, stopped: 'unknown' }])
    expect(cardOf(part, PARTS.reason)).toBeNull()
    expect(capsuleOf(part, seen, PARTS.languages)).toMatchObject({ kind: 'notice', action: 'retry' })
    const own = fold([opened, { type: 'translated', got: 0, total: 7, lost: 7, stopped: 'aborted' }])
    expect(cardOf(own, PARTS.reason)).toBeNull()
  })

  it("names a failure by the chain's error kinds alone, the popup's reasons (final review)", () => {
    expect(fold([{ type: 'fail', event: 'service', text: '', kind: 'auth' }]).failure).toBe('auth')
    expect(fold([{ type: 'fail', event: 'service', text: '', kind: 'unavailable' as never }]).failure).toBe('unknown')
    expect(fold([{ type: 'fail', event: 'crashed', text: '' }])).toMatchObject({ phase: 'failed', failure: 'unknown' })
  })
})

describe('reduce: the settings and what the reader holds', () => {
  it("knows when the extension's settings could not be read", () => {
    expect(fold([{ type: 'notice', why: { kind: 'tooNew' } }]).settingsUnreadable).toBe(true)
    expect(
      fold([
        { type: 'notice', why: { kind: 'tooNew' } },
        { type: 'notice', why: null },
      ]).settingsUnreadable,
    ).toBe(false)
  })

  it('counts the writes of the settings that were refused, except while the settings cannot be read, which the notice says; only a write of this page that went through mends them (D2, Devin on #329)', () => {
    expect(INITIAL).toMatchObject({ refusals: 0, mended: 0 })
    expect(fold([{ type: 'refused' }, { type: 'refused' }])).toMatchObject({ refusals: 2, mended: 0 })
    // the session tells of the unreadable settings before the refusal that follows from them
    expect(fold([{ type: 'notice', why: { kind: 'tooNew' } }, { type: 'refused' }]).refusals).toBe(0)
    // the preferences shown again — told anew for a language pack that came, a read, another tab's change — mend nothing: no
    // write went through
    const refused = fold([{ type: 'refused' }])
    for (const event of [
      { type: 'prefs', prefs: DEFAULTS },
      { type: 'prefs', prefs: { ...DEFAULTS } },
      { type: 'prefs', prefs: { ...DEFAULTS, target: 'ja' } },
    ] as SessionEvent[]) {
      expect(fold([event], refused), JSON.stringify(event)).toMatchObject({ refusals: 1, mended: 0 })
    }
    // a write that went through proves storage takes one, and a refusal after is a new one
    const mended = fold([{ type: 'saved' }], refused)
    expect(mended).toMatchObject({ refusals: 1, mended: 1 })
    expect(fold([{ type: 'refused' }], mended)).toMatchObject({ refusals: 2, mended: 1 })
    // nothing refused: a write that went through changes nothing
    expect(reduce(INITIAL, { type: 'saved' })).toBe(INITIAL)
    expect(reduce(mended, { type: 'saved' })).toBe(mended)
  })

  it('knows the paper and its title', () => {
    expect(fold([{ type: 'paper', id: '2608.02163', title: 'A Title' }]).paper).toEqual({
      id: '2608.02163',
      title: 'A Title',
    })
  })

  it("holds the sync the reader applies, whatever the settings say (Part 2's final review)", () => {
    expect(INITIAL.sync).toBe(true)
    expect(fold([{ type: 'sync', on: false }]).sync).toBe(false)
  })

  it('holds the heading being read, as the session places it (Task 21)', () => {
    expect(INITIAL.currentHeading).toBeNull()
    expect(fold([{ type: 'heading', id: 29 }]).currentHeading).toBe(29)
  })

  it('holds the contents', () => {
    const entries = [{ id: 2, title: '引言', original: 'Introduction', level: 1 as const, page: 1 }]
    expect(fold([{ type: 'outline', entries }]).outline).toEqual(entries)
  })

  it('holds the preferences the session read, as they last landed; the same ones told again change nothing', () => {
    expect(INITIAL.prefs).toBeNull()
    const held = fold([{ type: 'prefs', prefs: DEFAULTS }])
    expect(held.prefs).toBe(DEFAULTS)
    expect(reduce(held, { type: 'prefs', prefs: DEFAULTS })).toBe(held)
    const other: Prefs = { ...DEFAULTS, target: 'ja' }
    expect(fold([{ type: 'prefs', prefs: other }], held).prefs).toBe(other)
  })

  it('keeps the same state object for an event that changes nothing', () => {
    expect(reduce(INITIAL, { type: 'sync', on: true })).toBe(INITIAL)
    expect(reduce(INITIAL, { type: 'layer', state: 'open', laid: 0, total: 0 })).toBe(INITIAL)
  })
})

const fakeSession = (): Session => ({
  setDisplay: vi.fn(),
  setSyncMode: vi.fn(),
  zoomBy: vi.fn(),
  zoomTo: vi.fn(),
  goToPage: vi.fn(),
  setPrefs: vi.fn(),
  pdfBytes: vi.fn(async () => null),
  openOriginal: vi.fn(),
  goToUnit: vi.fn(),
  lead: vi.fn(),
  retry: vi.fn(),
  setNarrow: vi.fn(),
  pinch: vi.fn(),
})
const panes = () => ({ left: document.createElement('div'), right: document.createElement('div') })

describe('createController', () => {
  it("the reader's own choice of a display is the chrome's to know (a host's hold for the narrow window ends with it); a hold told to a session that has one, none to one that has none (L11's second round, gap 7)", async () => {
    const session = { ...fakeSession(), hold: vi.fn() }
    const controller = createController({ open: async () => session, paper: '2600.00001v1', defaults: DEFAULTS })
    await controller.attach(panes())
    expect(controller.getState().chose).toBe(false)
    controller.hold(true)
    controller.setDisplay('translation')
    await Promise.resolve()
    expect([controller.getState().chose, session.hold.mock.calls]).toEqual([true, [[true]]])
    // (a session with no hold: the extension's)
    const bare = createController({ open: async () => fakeSession(), paper: '2600.00001v1', defaults: DEFAULTS })
    await bare.attach(panes())
    expect(() => bare.hold(true)).not.toThrow()
    await Promise.resolve()
  })
  it("a prepare told this visit marks the paper made (its run the making's)", () => {
    expect(INITIAL.made).toBe(false)
    expect(reduce(INITIAL, { type: 'preparing', position: null, progress: null }).made).toBe(true)
  })
  it("the original's download is arXiv's own PDF opened by the browser: no byte of it read through the reader", async () => {
    const session = fakeSession()
    const controller = createController({ open: async () => session, paper: '2600.00001v1', defaults: DEFAULTS })
    await controller.attach(panes())
    await controller.download('original')
    expect(session.openOriginal).toHaveBeenCalledOnce()
    expect(session.pdfBytes).not.toHaveBeenCalled()
  })

  it("saves the translation under the paper's id and the target the preferences hold, its tag as they name it (the reader's design, §6.1)", async () => {
    const session = { ...fakeSession(), pdfBytes: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }
    const saved: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download)
    })
    try {
      const controller = createController({
        open: async () => session,
        paper: 'hep-th/9711200',
        first: { prefs: { ...DEFAULTS, target: 'zh-Hant' }, unreadable: false },
        defaults: DEFAULTS,
      })
      await controller.attach(panes())
      await controller.download('translation')
      expect([session.pdfBytes.mock.calls, saved]).toEqual([[['translation']], ['hep-th_9711200.zh-Hant.pdf']])
    } finally {
      click.mockRestore()
    }
  })

  it("both failures told in the start's order: the controller shows the PDF's, then, once it opens, the service's (Codex on #391)", async () => {
    let host: SessionHost | null = null
    const controller = createController({
      open: async (h: SessionHost) => {
        host = h
        return fakeSession()
      },
      paper: '2600.00001v1',
      defaults: DEFAULTS,
    })
    await controller.attach(panes())
    const tell = (e: SessionEvent) => (host as unknown as SessionHost).emit(e)
    tell({ type: 'fail', event: 'fetch failed', text: '', kind: 'network' })
    tell({ type: 'fail', event: 'service', text: '', kind: 'no-key' })
    expect(cardOf(controller.getState(), PARTS.reason)?.action).toBe('retry')
    tell({ type: 'opened' })
    expect(cardOf(controller.getState(), PARTS.reason)?.action).toBe('settings')
  })

  it('a session that could not open: the failure card, and its retry loads the page again rather than doing nothing (Codex on #301)', async () => {
    const reload = vi.spyOn(location, 'reload').mockImplementation(() => undefined)
    const controller = createController({
      open: async () => {
        throw new Error('the session module did not load')
      },
      paper: '',
      defaults: DEFAULTS,
    })
    await controller.attach(panes()).catch(() => undefined)
    expect(controller.getState().phase).toBe('failed')
    controller.retry()
    await Promise.resolve()
    await Promise.resolve()
    expect(reload).toHaveBeenCalledOnce()
    reload.mockRestore()
  })

  it('opens the session once, whatever the number of attaches, and tells its listeners of each change', async () => {
    const session = fakeSession()
    const open = vi.fn(async (host: SessionHost) => {
      host.emit({ type: 'display', mode: 'translation' })
      return session
    })
    const controller = createController({ open, paper: '2608.02163', defaults: DEFAULTS })
    const heard = vi.fn()
    controller.subscribe(heard)
    const p = panes()
    await Promise.all([controller.attach(p), controller.attach(p)])
    expect(open).toHaveBeenCalledOnce()
    // the panes, and where to tell its events: the address and the first read are the host's open's (the extension's
    // host/today.ts hands them its session, tests/pdf-reader/host-today.test.ts)
    expect(open.mock.calls[0]![0]).toMatchObject({ left: p.left, right: p.right })
    expect(Object.keys(open.mock.calls[0]![0]).sort()).toEqual(['emit', 'left', 'right'])
    expect(controller.getState().display).toBe('translation')
    expect(heard).toHaveBeenCalledOnce()
  })

  it('tells its listeners of nothing that did not change: a page reported again, a pinch or a step while no zoom is chosen (the final review)', async () => {
    let host!: SessionHost
    const controller = createController({
      open: async (h) => {
        host = h
        return fakeSession()
      },
      paper: '',
      defaults: DEFAULTS,
    })
    await controller.attach(panes())
    host.emit({ type: 'page', side: 'left', page: 3, pages: 20 })
    controller.pinch('left', 1.1, [0, 0])
    const heard = vi.fn()
    controller.subscribe(heard)
    host.emit({ type: 'page', side: 'left', page: 3, pages: 20 })
    controller.pinch('left', 1.1, [0, 0])
    controller.zoomBy(1.1)
    expect(heard).not.toHaveBeenCalled()
  })

  it('carries out a command given while the session is still opening, once it is open', async () => {
    const session = fakeSession()
    let resolve!: (s: Session) => void
    const controller = createController({
      open: () =>
        new Promise<Session>((r) => {
          resolve = r
        }),
      paper: '',
      defaults: DEFAULTS,
    })
    const attached = controller.attach(panes())
    controller.setDisplay('bilingual')
    controller.setSync(true)
    controller.setSync(false)
    expect(session.setDisplay).not.toHaveBeenCalled()
    resolve(session)
    await attached
    await Promise.resolve()
    expect(session.setDisplay).toHaveBeenCalledWith('bilingual')
    expect(vi.mocked(session.setSyncMode).mock.calls).toEqual([['same'], ['off']])
  })

  it('reports a session that could not be opened as a failure, and drops the commands queued for it (final review)', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const controller = createController({
      open: () => Promise.reject(new Error('no module')),
      paper: '',
      defaults: DEFAULTS,
    })
    controller.setDisplay('bilingual')
    await expect(controller.attach(panes())).rejects.toThrow('no module')
    controller.setDisplay('translation')
    await new Promise((r) => setTimeout(r, 0))
    process.off('unhandledRejection', unhandled)
    expect(controller.getState()).toMatchObject({ phase: 'failed', failure: 'unknown' })
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('passes a patch of the preferences to the session, once it is open; one given before it has no session to wait for', async () => {
    const session = fakeSession()
    const controller = createController({ open: async () => session, paper: '', defaults: DEFAULTS })
    controller.setPrefs({ display: 'translation' })
    await controller.attach(panes())
    controller.setPrefs({ display: 'translation', classes: { references: true } })
    await Promise.resolve()
    expect(vi.mocked(session.setPrefs).mock.calls).toEqual([
      [{ display: 'translation', classes: { references: true } }],
    ])
  })

  it("knows the paper's id from the address before the session says anything", () => {
    const controller = createController({
      open: async () => fakeSession(),
      paper: 'hep-th/9711200',
      defaults: DEFAULTS,
    })
    expect(controller.getState().paper).toEqual({ id: 'hep-th/9711200', title: '' })
  })

  it('an address with no paper is known from the address alone: nothing is loading, and the translated displays are out of reach (D1)', () => {
    const none = createController({ open: async () => fakeSession(), paper: '', defaults: DEFAULTS }).getState()
    expect(none).toMatchObject({ noPaper: true, phase: 'ready', available: false, paper: { id: '', title: '' } })
    // (which addresses name no paper, a value that is no arXiv id among them, is the host's to say: the extension's
    // paperOf, tests/pdf-reader/addresses.test.ts)
    // a paper named: the reader loads it as before
    expect(
      createController({ open: async () => fakeSession(), paper: '2608.02163', defaults: DEFAULTS }).getState(),
    ).toMatchObject({ noPaper: false, phase: 'loading', available: true })
    expect(INITIAL.noPaper).toBe(false)
  })

  describe("the page's first read of the preferences is drawn from the first frame, whatever it found (D2)", () => {
    /** the host's defaults: what the chrome shows, said to be unreadable, while there is nothing it could read */
    const HOST_DEFAULTS: Prefs = { ...DEFAULTS, target: 'de' }
    const JA: Prefs = { ...DEFAULTS, target: 'ja' }
    let host!: SessionHost
    const made = (first: Parameters<typeof createController>[0]['first'], paper = '2608.02163') =>
      createController({
        open: async (h) => {
          host = h
          return fakeSession()
        },
        paper,
        first,
        defaults: HOST_DEFAULTS,
      })

    it('a read that answered: its preferences are the state before any session says anything, readable', () => {
      expect(made({ prefs: JA, unreadable: false }).getState()).toMatchObject({ prefs: JA, settingsUnreadable: false })
    })

    it("a value that cannot be read (the host's defaults in its place), or a read that did not answer in time (none): said to be unreadable; the session's preferences replace them when they come", async () => {
      const unreadable = made({ prefs: HOST_DEFAULTS, unreadable: true })
      expect(unreadable.getState()).toMatchObject({ prefs: HOST_DEFAULTS, settingsUnreadable: true })
      // none read: the host's defaults, unreadable whatever the read says of itself
      for (const said of [true, false]) {
        const silent = made({ prefs: null, unreadable: said })
        expect(silent.getState().prefs, String(said)).toBe(HOST_DEFAULTS)
        expect(silent.getState().settingsUnreadable, String(said)).toBe(true)
      }
      const silent = made({ prefs: null, unreadable: true })
      // storage answers at last: the session shows them, and the reader is itself again
      await silent.attach(panes())
      host.emit({ type: 'prefs', prefs: JA })
      host.emit({ type: 'notice', why: null })
      expect(silent.getState()).toMatchObject({ prefs: JA, settingsUnreadable: false })
    })

    it('no first read: nothing is known until the session says, and an address with no paper says it too', () => {
      expect(made(undefined).getState()).toMatchObject({ prefs: null, settingsUnreadable: false })
      expect(made({ prefs: null, unreadable: true }, '').getState()).toMatchObject({
        prefs: HOST_DEFAULTS,
        settingsUnreadable: true,
        noPaper: true,
      })
    })
  })

  it('an address with no paper keeps the original selected whatever display the session or the settings ask for: no translated display is there to be had (Devin on #329)', async () => {
    let host!: SessionHost
    const controller = createController({
      open: async (h) => {
        host = h
        return fakeSession()
      },
      paper: '',
      defaults: DEFAULTS,
    })
    await controller.attach(panes())
    // the session\'s first display comes from the saved settings, and another tab\'s change can bring another
    for (const mode of ['translation', 'bilingual', 'translation'] as const) {
      host.emit({ type: 'display', mode })
      expect(controller.getState(), mode).toMatchObject({ display: 'original', noPaper: true })
    }
    // a paper named follows the session as ever
    const named = createController({
      open: async (h) => {
        host = h
        return fakeSession()
      },
      paper: '2608.02163',
      defaults: DEFAULTS,
    })
    await named.attach(panes())
    host.emit({ type: 'display', mode: 'translation' })
    expect(named.getState().display).toBe('translation')
  })

  it('remembers the zoom chosen from the menu, and forgets it on a step', async () => {
    const session = fakeSession()
    const controller = createController({ open: async () => session, paper: '', defaults: DEFAULTS })
    await controller.attach(panes())
    controller.zoomTo('page-fit')
    expect(controller.getState().zoom).toBe('page-fit')
    controller.zoomBy(1.1)
    expect(controller.getState().zoom).toBeNull()
  })

  it('knows the window is narrow once told, and tells the session once', async () => {
    const session = { ...fakeSession(), setNarrow: vi.fn() }
    const controller = createController({ open: async () => session, paper: '', defaults: DEFAULTS })
    await controller.attach(panes())
    controller.setNarrow(true)
    controller.setNarrow(true)
    await Promise.resolve()
    expect(controller.getState().narrow).toBe(true)
    expect(session.setNarrow).toHaveBeenCalledOnce()
  })

  it('stops telling a listener that unsubscribed', async () => {
    const controller = createController({
      open: async (host) => {
        host.emit({ type: 'scale', scale: 2 })
        return fakeSession()
      },
      paper: '',
      defaults: DEFAULTS,
    })
    const heard = vi.fn()
    controller.subscribe(heard)()
    await controller.attach(panes())
    expect(heard).not.toHaveBeenCalled()
  })
})

// (the reading view's events told as these, the extension's session's fromView: tests/pdf-reader/session-events.test.ts)
describe('reduce: the scale and the zoom chosen', () => {
  it("keeps the zoom the controller chose where the engine does not say (the session's scale), and takes it where it does", () => {
    const chose = { ...INITIAL, zoom: 'page-fit' as const }
    expect(reduce(chose, { type: 'scale', scale: 2 }).zoom).toBe('page-fit')
    expect(reduce(chose, { type: 'scale', scale: 2, zoom: null }).zoom).toBeNull()
  })
})

describe("a host's toast (ReaderController.toast: the website's share menu's word, its word for a crash with something on screen)", () => {
  const SEEN = { noticeClosed: false, narrowShown: false, refusalsSeen: 0 }
  const fakeSession = () => ({}) as Session
  it('stands for its time (TOAST_MS by default, or its own), in its words and sign; the same words said again start their time again', () => {
    vi.useFakeTimers()
    try {
      const controller = createController({
        open: async () => fakeSession(),
        paper: '2600.00001v1',
        defaults: DEFAULTS,
      })
      controller.toast({ words: 'Link copied', icon: 'check' })
      expect(controller.getState().toast).toEqual({ words: 'Link copied', icon: 'check' })
      vi.advanceTimersByTime(2000)
      controller.toast({ words: 'Link copied', icon: 'check' })
      vi.advanceTimersByTime(2500)
      expect(controller.getState().toast?.words).toBe('Link copied')
      vi.advanceTimersByTime(600)
      expect(controller.getState().toast).toBeNull()
      controller.toast({ words: 'Something went wrong', ms: 8000 })
      expect(controller.getState().toast).toEqual({ words: 'Something went wrong', icon: 'info' })
      vi.advanceTimersByTime(7999)
      expect(controller.getState().toast).not.toBeNull()
      vi.advanceTimersByTime(1)
      expect(controller.getState().toast).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
  it('one replaced before its time comes back after the one that replaced it, for the time it has left (the website\'s word for a crash, under a "copied")', () => {
    vi.useFakeTimers()
    try {
      const controller = createController({
        open: async () => fakeSession(),
        paper: '2600.00001v1',
        defaults: DEFAULTS,
      })
      controller.toast({ words: 'The translation could not load', ms: 8000 })
      vi.advanceTimersByTime(1000)
      controller.toast({ words: 'Link copied', icon: 'check' })
      expect(controller.getState().toast?.words).toBe('Link copied')
      vi.advanceTimersByTime(3000)
      expect(controller.getState().toast?.words).toBe('The translation could not load')
      vi.advanceTimersByTime(4000)
      expect(controller.getState().toast).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
  it("is the capsule's first word, over whatever else stands: a notice of passages, settings that cannot be read, a failure's card", () => {
    const toast = { words: 'Link copied', icon: 'check' as const }
    const states = [
      fold([opened, { type: 'translated', got: 8, total: 10, lost: 2, stopped: null }, laid(1)]),
      { ...INITIAL, phase: 'ready' as const, settingsUnreadable: true },
      { ...INITIAL, phase: 'failed' as const, failure: 'network' as const },
    ]
    for (const s of states) {
      expect(capsuleOf({ ...s, toast }, SEEN, PARTS.languages)).toMatchObject({ kind: 'toast', icon: 'check' })
      expect(capsuleOf(s, SEEN, PARTS.languages)?.kind).not.toBe('toast')
    }
    expect(capsuleOf({ ...INITIAL, phase: 'ready', toast }, SEEN, PARTS.languages)?.words.prefix).toBe('Link copied')
  })
})

describe("the run's count and our server's document not heard, as a host's words say them", () => {
  it('keeps the count the run last told, the same object while it is the same; reconnecting as the reader tells it', () => {
    const a = fold([opened, { type: 'translating', got: 3, total: 10, lost: 0 }])
    expect(a.translated).toEqual({ got: 3, total: 10 })
    expect(reduce(a, { type: 'translating', got: 3, total: 10, lost: 0 }).translated).toBe(a.translated)
    expect(reduce(a, { type: 'translated', got: 10, total: 10, lost: 0, stopped: null }).translated).toEqual({
      got: 10,
      total: 10,
    })
    const lost = reduce(a, { type: 'link', reconnecting: true })
    expect([lost.reconnecting, reduce(lost, { type: 'link', reconnecting: true })]).toEqual([true, lost])
    expect(reduce(lost, { type: 'link', reconnecting: false }).reconnecting).toBe(false)
  })
  it('a paper too large is lasting, our server busy passing: each its own for a host to word', () => {
    const tooLarge = fold([opened, { type: 'unavailable', why: 'too-large', retryAt: null }])
    const busy = fold([opened, { type: 'unavailable', why: 'busy', retryAt: 9 }])
    expect([tooLarge.available, tooLarge.unavailable?.why]).toEqual([false, 'too-large'])
    expect([busy.available, busy.unavailable]).toEqual([true, { why: 'busy', retryAt: 9 }])
  })
})
