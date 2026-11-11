import { beforeAll, describe, expect, it } from 'vitest'
import { LOCALE_CODES, LOCALES, O, R, S, setLocale } from '@readarxiv/ui'
import { INITIAL, type ReaderState } from '../../src/chrome/model.ts'
import { plain, textOf, withCount } from '../../src/chrome/capsule-words.ts'
import { capsuleOf, causeOf, cardOf, heldOf, lineOf, spokenOf, stageOf } from '../../src/chrome/status.ts'
import { PREFS } from './fake-controller.ts'
import type { StateWords } from '../../src/chrome/parts.tsx'
import { LANGUAGES, NAMES, TEST_PARTS } from './parts.ts'

const at = (over: Partial<ReaderState>): ReaderState => ({ ...INITIAL, prefs: PREFS, display: 'bilingual', ...over })
const none = { noticeClosed: 0, narrowShown: false, refusalsSeen: 0 }
/** the target the preferences hold */
const target = (tag: string) => ({ prefs: { ...PREFS, target: tag } })
/** a failure's sentence as the host words it (parts.tsx reason; the extension's knows whether its translator has a key) */
const reason = TEST_PARTS.reason

// the interface's words as the maintainer reads them
beforeAll(() => setLocale('zh-CN'))

describe("the states (the reader's design, §8)", () => {
  it('reading shows nothing', () => {
    expect(capsuleOf(at({ phase: 'ready' }), none, LANGUAGES)).toBeNull()
    expect(cardOf(at({ phase: 'ready', failure: 'network', layer: { laid: 2, total: 4 } }), reason)).toBeNull()
  })

  it('loading, preparing and translating show no capsule: the line under the toolbar is enough, and the words are said to screen readers (the maintainer, 2026-09-25)', () => {
    for (const phase of ['loading', 'preparing', 'translating'] as const)
      expect(capsuleOf(at({ phase }), none, LANGUAGES)).toBeNull()
    expect([
      spokenOf(at({ phase: 'loading' })),
      spokenOf(at({ phase: 'preparing' })),
      spokenOf(at({ phase: 'translating' })),
      spokenOf(at({ phase: 'ready' })),
    ]).toEqual(['正在加载', R.status.preparing, '正在翻译', ''])
  })

  it("keeps a notice of paragraphs that failed for the run's end, and says a narrow window while a translation runs", () => {
    expect(capsuleOf(at({ phase: 'translating', failedUnits: 3 }), none, LANGUAGES)).toBeNull()
    expect(capsuleOf(at({ phase: 'translating', narrow: true }), none, LANGUAGES)).toMatchObject({ kind: 'narrow' })
  })

  it("the line: one over the whole process — the PDF's download, the paper's prepare where there is one, the paragraphs translated (the maintainer asked why it ran twice, 2026-10-02)", () => {
    const v = (over: Partial<ReaderState>) => lineOf(at(over)).value
    // the download is the first stretch when a translation follows it, all of it when the original alone is shown
    expect(lineOf(at({ phase: 'loading', loaded: 0.3, progress: 0.9 })).on).toBe(true)
    expect(v({ phase: 'loading', loaded: 1 })).toBeCloseTo(v({ phase: 'translating', progress: 0 }))
    expect(v({ phase: 'loading', loaded: 1, display: 'original' })).toBe(1)
    // the prepare after it, as it comes along, half of the rest at most; the paragraphs translated to the end
    const steps = [
      v({ phase: 'loading', loaded: 0.5 }),
      v({ phase: 'preparing', preparing: { progress: null } }),
      v({ phase: 'preparing', preparing: { progress: 0.5 } }),
      v({ phase: 'preparing', preparing: { progress: 1 } }),
      v({ phase: 'translating', progress: 0.9 }),
    ]
    for (let k = 2; k < steps.length; k++) expect(steps[k]).toBeGreaterThan(steps[k - 1] as number)
    expect(steps[1]).toBeCloseTo(v({ phase: 'loading', loaded: 1 }))
    expect(v({ phase: 'translating', progress: 1 })).toBe(1)
    expect(lineOf(at({ phase: 'preparing' })).on).toBe(true)
    expect(lineOf(at({ phase: 'ready', progress: 1 })).on).toBe(false)
    expect(lineOf(at({ phase: 'failed' })).on).toBe(false)
  })
  it("the line by the prepare's stage, its places in turn on the prepare's stretch; the translation after a prepare from where the prepare left it, without one from the download (the coordinator's decision 4, 2026-11-11)", () => {
    const v = (over: Partial<ReaderState>, prepared = false) => lineOf(at(over), false, prepared).value
    const PREPARED = 0.15 + 0.85 * 0.5
    const places = [0, 0.02, 0.12, 0.52, 0.68, 0.97].map((progress) =>
      v({ phase: 'preparing', made: true, preparing: { progress } }),
    )
    expect(places[0]).toBeCloseTo(0.15)
    for (let k = 1; k < places.length; k++) expect(places[k]).toBeGreaterThan(places[k - 1] as number)
    expect(places.at(-1)).toBeLessThan(PREPARED)
    // (the early units' run ended while the layer is made: the prepare's place, never the whole line)
    expect(
      v({ phase: 'translating', laying: true, made: true, progress: 1, preparing: { progress: 0.12 } }),
    ).toBeCloseTo(places[2] as number)
    // (the layer landed, its count not known: the prepare's end)
    expect(v({ phase: 'translating', made: true, progress: 1, translated: { got: 0, total: 0 } })).toBeCloseTo(PREPARED)
    // the translation takes what remains after a prepare; a visit with no prepare keeps today's line
    expect(
      [0, 0.5, 1].map((progress) => v({ phase: 'translating', progress, translated: { got: 1, total: 2 } }, true)),
    ).toEqual([PREPARED, PREPARED + (1 - PREPARED) * 0.5, 1])
    expect([0, 0.5, 1].map((progress) => v({ phase: 'translating', progress }))).toEqual([0.15, 0.15 + 0.85 * 0.5, 1])
  })
  it("the line while the original is held on screen as the paper is made (a host's rule): the original's load, whole once read, as the website's page draws it (L11 third round, gap 3)", () => {
    const held = (over: Partial<ReaderState>) => lineOf(at({ display: 'original', loaded: 1, ...over }), true)
    expect(held({ phase: 'preparing', preparing: { progress: 0.2 } })).toEqual({ on: true, value: 1 })
    expect(held({ phase: 'translating', progress: 0.3, made: true })).toEqual({ on: true, value: 1 })
    expect(held({ phase: 'preparing', loaded: 0.6 })).toEqual({ on: true, value: 0.6 })
    // (nothing under way: no line, held or not; and not held, the prepare's share as before)
    expect(held({ phase: 'ready' }).on).toBe(false)
    expect(lineOf(at({ display: 'original', loaded: 1, phase: 'preparing' })).value).toBeCloseTo(0.15)
  })

  it('counts the paragraphs that failed, with 重试, until closed — the retry where the run stopped for the service', () => {
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 3, failure: 'network' }), none, LANGUAGES)).toEqual({
      kind: 'notice',
      words: withCount('3 处翻译失败', 3),
      action: 'retry',
    })
    // the count a part of its own, so that it changes in place
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 3, failure: 'network' }), none, LANGUAGES)).toMatchObject({
      words: { prefix: '', count: 3, suffix: ' 处翻译失败' },
    })
    expect(
      capsuleOf(at({ phase: 'ready', failedUnits: 3, failure: 'network' }), { ...none, noticeClosed: 3 }, LANGUAGES),
    ).toBeNull()
    // (closed, it stays closed for the visit as the count falls (passages a retry brings) or stays; told again once more fail)
    expect(
      capsuleOf(at({ phase: 'ready', failedUnits: 2, failure: 'network' }), { ...none, noticeClosed: 3 }, LANGUAGES),
    ).toBeNull()
    expect(
      capsuleOf(at({ phase: 'ready', failedUnits: 4, failure: 'network' }), { ...none, noticeClosed: 3 }, LANGUAGES),
    ).toMatchObject({ kind: 'notice', words: { count: 4 } })
  })

  it('passages the typesetting left in the original, and no stop to resume: counted, with no retry — the same translation fails the same way (the review of 2026-10-04, I-5)', () => {
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 2, failure: null }), none, LANGUAGES)).toEqual({
      kind: 'notice',
      words: withCount(S.failed.text(2), 2),
      action: null,
    })
    expect(
      capsuleOf(at({ phase: 'ready', failedUnits: 2, failure: null }), { ...none, noticeClosed: 2 }, LANGUAGES),
    ).toBeNull()
  })

  it('names a language the reader cannot typeset, and offers the menu', () => {
    const state = at({ phase: 'ready', languageSupported: false, ...target('ru') })
    expect(capsuleOf(state, none, LANGUAGES)).toMatchObject({ kind: 'unsupported', action: 'language' })
    expect(textOf(capsuleOf(state, none, LANGUAGES)!.words)).toMatch(/^PDF 对照暂不支持/)
  })

  it("every kind's words say what its text said, and S-R-13's own name is a part with the target's tag as the host gives it as its lang (Devin on #313)", () => {
    const said = (over: Partial<ReaderState>, seen = none) =>
      textOf(capsuleOf(at({ phase: 'ready', ...over }), seen, LANGUAGES)!.words)
    expect(said({ available: false, htmlVersion: null })).toBe(R.status.noPdf)
    expect(said({ unavailable: { why: 'unreachable', retryAt: null } })).toBe(R.status.notNow)
    expect(said({ failedUnits: 12, failure: 'network' })).toBe(S.failed.text(12))
    expect(said({ narrow: true })).toBe(R.status.narrow)
    const unsupported = capsuleOf(at({ phase: 'ready', languageSupported: false, ...target('ja') }), none, LANGUAGES)!
    expect([textOf(unsupported.words), unsupported.words.part]).toEqual([
      R.status.unsupported(NAMES.ja!),
      { text: NAMES.ja, lang: LANGUAGES.tag('ja') },
    ])
    // the host's words are the ones said: a host that names and tags the language otherwise is followed
    const other = { ...LANGUAGES, name: () => 'Nihongo', tag: () => 'ja-Latn' }
    expect(
      capsuleOf(at({ phase: 'ready', languageSupported: false, ...target('ja') }), none, other)!.words.part,
    ).toEqual({ text: 'Nihongo', lang: 'ja-Latn' })
    // no preferences landed yet: no language to name
    expect(capsuleOf(at({ phase: 'ready', languageSupported: false, prefs: null }), none, LANGUAGES)).toBeNull()
  })

  it('names that language by its own name, as the language button does, in either interface language (the maintainer, 2026-10-04)', () => {
    try {
      for (const locale of LOCALE_CODES) {
        setLocale(locale)
        for (const tag of ['ru', 'de', 'ja'] as const) {
          const said = capsuleOf(
            at({ phase: 'ready', languageSupported: false, ...target(tag) }),
            none,
            LANGUAGES,
          )!.words
          expect([locale, textOf(said)]).toEqual([locale, R.status.unsupported(NAMES[tag]!)])
          // the name inside is the one the language button shows (the host's, by its own name), not the interface's name for
          // the language, and it is drawn in its own language: a part whose lang is the target's tag (Devin on #313)
          expect([locale, said.part]).toEqual([locale, { text: NAMES[tag], lang: tag }])
        }
      }
      setLocale('en')
      expect(R.status.unsupported('X')).toBe("A bilingual PDF isn't available in X yet")
    } finally {
      setLocale('zh-CN')
    }
  })

  it('says once that a narrow window shows the translation alone', () => {
    expect(capsuleOf(at({ phase: 'ready', narrow: true }), none, LANGUAGES)).toEqual({
      kind: 'narrow',
      words: plain('窗口较窄，暂只显示译文'),
    })
    expect(capsuleOf(at({ phase: 'ready', narrow: true }), { ...none, narrowShown: true }, LANGUAGES)).toBeNull()
    expect(capsuleOf(at({ phase: 'ready', narrow: true, display: 'translation' }), none, LANGUAGES)).toBeNull()
  })

  it('a paper that cannot be had as a bilingual PDF: said, with the HTML version offered where there is one; not closable, before any other capsule (the maintainer, 2026-09-26)', () => {
    expect(
      capsuleOf(
        at({ phase: 'ready', available: false, htmlVersion: 'https://arxiv.org/html/1706.03762#readarxiv' }),
        none,
        LANGUAGES,
      ),
    ).toEqual({
      kind: 'unavailable',
      words: plain(R.status.noPdf),
      href: 'https://arxiv.org/html/1706.03762#readarxiv',
    })
    expect(capsuleOf(at({ phase: 'ready', available: false, htmlVersion: null }), none, LANGUAGES)).toEqual({
      kind: 'unavailable',
      words: plain(R.status.noPdf),
    })
    expect(
      capsuleOf(
        at({ phase: 'ready', available: false, htmlVersion: null, failedUnits: 3, narrow: true }),
        { ...none, noticeClosed: 3 },
        LANGUAGES,
      ),
    ).toMatchObject({ kind: 'unavailable' })
    expect(
      capsuleOf(at({ phase: 'ready', available: false, languageSupported: false, htmlVersion: null }), none, LANGUAGES),
    ).toMatchObject({ kind: 'unavailable' })
  })

  it('the bilingual version not to be had now (our server out of reach, S-R-24, or at its limit, S-R-26, each in its own words): said, with its retry and the HTML version where there is one; not closable, before the notice of passages (the layer-only plan\'s "Offline, drafted")', () => {
    for (const [why, words] of [
      ['unreachable', R.status.notNow],
      ['refused', R.status.limited],
    ] as const) {
      expect(
        capsuleOf(
          at({
            phase: 'ready',
            unavailable: { why, retryAt: null },
            htmlVersion: 'https://arxiv.org/html/x#readarxiv',
          }),
          none,
          LANGUAGES,
        ),
        why,
      ).toEqual({ kind: 'notNow', words: plain(words), href: 'https://arxiv.org/html/x#readarxiv' })
      expect(
        capsuleOf(
          at({ phase: 'ready', unavailable: { why, retryAt: 9 }, htmlVersion: null, failedUnits: 2 }),
          none,
          LANGUAGES,
        ),
        why,
      ).toEqual({ kind: 'notNow', words: plain(words) })
    }
    // a limit is not "can't be loaded": its words are its own, and say to come back later (#88 E5)
    expect(R.status.limited).not.toBe(R.status.notNow)
    expect(R.status.limited).toContain('稍后再试')
    // while a prepare or a translation is under way, the line says it
    expect(
      capsuleOf(at({ phase: 'translating', unavailable: { why: 'unreachable', retryAt: null } }), none, LANGUAGES),
    ).toBeNull()
    // the words name no technical path: nothing of a server, a layer or how the PDF is made
    for (const words of [R.status.notNow, R.status.limited, R.status.preparing])
      expect(words).not.toMatch(
        /server|layer|engine|TeX|compil|typeset|\u670d\u52a1\u5668|\u5f15\u64ce|\u6392\u7248|\u7f16\u8bd1/i,
      )
  })

  it("settings that could not be read: a note that stays while it is so, over a load that waits for them too; a failure's card has none beside it (S-R-21)", () => {
    const note = { kind: 'unreadable', words: plain(R.status.unreadable) }
    for (const phase of ['loading', 'translating', 'ready'] as const)
      expect(capsuleOf(at({ phase, settingsUnreadable: true }), none, LANGUAGES), phase).toEqual(note)
    // before the paper's own notes: the controls these would speak of are out of reach until they are read
    expect(capsuleOf(at({ phase: 'ready', settingsUnreadable: true, available: false }), none, LANGUAGES)).toEqual(note)
    expect(capsuleOf(at({ phase: 'failed', failure: 'network', settingsUnreadable: true }), none, LANGUAGES)).toBeNull()
    // beside the card of an address with no paper, which names no note of its own: the settings are as unreadable there
    expect(
      capsuleOf(at({ phase: 'ready', settingsUnreadable: true, noPaper: true, available: false }), none, LANGUAGES),
    ).toEqual(note)
    expect(capsuleOf(at({ phase: 'ready', settingsUnreadable: true, noPaper: true }), none, LANGUAGES)).toEqual(note)
    expect(capsuleOf(at({ phase: 'ready', settingsUnreadable: false }), none, LANGUAGES)).toBeNull()
  })

  it('a write storage refused: told until it is closed or a later write lands, as the settings page says it, and told again for the next (S-R-22)', () => {
    const refused = at({ phase: 'ready', refusals: 1 })
    expect(capsuleOf(refused, none, LANGUAGES)).toEqual({ kind: 'saveFailed', words: plain(O.saveFailed) })
    expect(capsuleOf(refused, { ...none, refusalsSeen: 1 }, LANGUAGES)).toBeNull()
    expect(capsuleOf({ ...refused, refusals: 2 }, { ...none, refusalsSeen: 1 }, LANGUAGES)).toMatchObject({
      kind: 'saveFailed',
    })
    // mended: a write landed after it
    expect(capsuleOf({ ...refused, mended: 1 }, none, LANGUAGES)).toBeNull()
    expect(capsuleOf({ ...refused, refusals: 2, mended: 1 }, none, LANGUAGES)).toMatchObject({ kind: 'saveFailed' })
    // over a load too, since the controls are in reach then; and before the notes that stand
    expect(capsuleOf(at({ phase: 'loading', refusals: 1 }), none, LANGUAGES)).toMatchObject({ kind: 'saveFailed' })
    expect(capsuleOf(at({ phase: 'ready', refusals: 1, available: false }), none, LANGUAGES)).toMatchObject({
      kind: 'saveFailed',
    })
    expect(
      capsuleOf(at({ phase: 'ready', refusals: 1, available: false }), { ...none, refusalsSeen: 1 }, LANGUAGES),
    ).toMatchObject({ kind: 'unavailable' })
    expect(capsuleOf(at({ phase: 'failed', failure: 'network', refusals: 1 }), none, LANGUAGES)).toBeNull()
  })

  it('nothing translated: the card, with the reason; 设置 for a key, 重试 otherwise; no capsule', () => {
    expect(cardOf(at({ phase: 'failed', failure: 'network' }), reason)).toEqual({
      reason: '网络连接失败',
      action: 'retry',
    })
    // the reason is the host's sentence for the kind: it knows whether its translator carries a key (#88 E5; the extension's
    // reasonText, tests/ui/strings.test.ts); the action is the reader's, the settings for what a key settles
    const host = (kind: string) => `host:${kind}`
    expect(cardOf(at({ phase: 'failed', failure: 'no-key' }), host)).toEqual({
      reason: 'host:no-key',
      action: 'settings',
    })
    expect(cardOf(at({ phase: 'failed', failure: 'auth' }), host)).toEqual({ reason: 'host:auth', action: 'settings' })
    expect(cardOf(at({ phase: 'failed', failure: 'network' }), host)).toEqual({
      reason: 'host:network',
      action: 'retry',
    })
    // the defaults' sentence is the catalogue's (parts.tsx PARTS)
    expect(cardOf(at({ phase: 'failed', failure: 'auth' }), reason)).toEqual({
      reason: LOCALES['zh-CN'].REASON.auth,
      action: 'settings',
    })
    // a run stopped by the reader: no card
    expect(cardOf(at({ phase: 'failed', failure: 'aborted' }), host)).toBeNull()
    expect(capsuleOf(at({ phase: 'failed', failure: 'network' }), none, LANGUAGES)).toBeNull()
  })

  it('an address with no paper: the card says it cannot be found and offers arXiv; no capsule, whatever else the state holds (D1)', () => {
    const missing = at({ phase: 'ready', noPaper: true, available: false })
    expect(cardOf(missing, reason)).toEqual({ reason: R.status.noPaper, action: 'arxiv' })
    // nothing paper-specific is said of it: not a paper that cannot be had, a partial translation, failed passages, a narrow window, a language
    expect(
      capsuleOf(
        {
          ...missing,
          unavailable: { why: 'unreachable', retryAt: null },
          failedUnits: 2,
          narrow: true,
          languageSupported: false,
        },
        none,
        LANGUAGES,
      ),
    ).toBeNull()
    expect(capsuleOf(missing, none, LANGUAGES)).toBeNull()
    // …but what is true of the settings is: the note and a refused write stand beside the card (Devin on #329)
    expect(capsuleOf({ ...missing, settingsUnreadable: true }, none, LANGUAGES)).toMatchObject({ kind: 'unreadable' })
    expect(capsuleOf({ ...missing, refusals: 1 }, none, LANGUAGES)).toMatchObject({ kind: 'saveFailed' })
    // a paper named has no such card, and a failure's card is the failure's
    expect(cardOf(at({ phase: 'ready' }), reason)).toBeNull()
    expect(cardOf(at({ phase: 'failed', failure: 'network' }), reason)).toMatchObject({ action: 'retry' })
    expect(R.status.noPaper).not.toBe('')
  })

  it("too many requests: the card promises no retry of its own — a stopped run waits for the reader's (Part 6's interface review)", () => {
    expect(cardOf(at({ phase: 'failed', failure: 'rate-limit' }), reason)).toEqual({
      reason: R.status.rateLimited,
      action: 'retry',
    })
    // whatever the host's sentence for it
    expect(cardOf(at({ phase: 'failed', failure: 'rate-limit' }), () => 'host')).toEqual({
      reason: R.status.rateLimited,
      action: 'retry',
    })
    expect(R.status.rateLimited).not.toMatch(/自动|shortly/)
  })
})

describe("a host's words for the states (parts.tsx StateWords: the website's own sentences), the catalogue's where it gives none", () => {
  /** words that name their state and what it holds, as a host's table would say them */
  const WORDS: StateWords = {
    queued: 'queued',
    translating: (got, total, _chip, first) =>
      first ? 'translating, the first time takes 1-2 minutes' : `translating ${got} / ${total}`,
    reconnecting: 'reconnecting',
    noPdf: 'no pdf',
    tooLarge: 'too large',
    notNow: (t) => `unavailable until ${t}`,
    limited: (t) => `quota until ${t}`,
    rate: 'too many requests',
    network: 'no connection',
    unsupported: (name) => `no ${name}`,
    failedPassages: (n) => `${n} failed`,
    narrow: 'narrow',
    unreadable: 'unreadable',
    saveFailed: 'not saved',
    failed: (kind) => `failed: ${kind}`,
    originalLost: 'no original',
    noPaper: 'no paper',
  }
  const said = (s: ReaderState, words: StateWords = WORDS) => {
    const c = capsuleOf(s, none, LANGUAGES, words)
    return c && { kind: c.kind, text: textOf(c.words) }
  }
  it("a run under way in the host's words, with its place, its count (a part of its own) and its reconnecting; the progress line alone where it gives none", () => {
    const queued = at({ phase: 'ready', unavailable: { why: 'busy', retryAt: 5 } })
    const preparing = at({ phase: 'preparing', preparing: { progress: 0.4 } })
    const translating = at({ phase: 'translating', progress: 0.25, translated: { got: 12, total: 48 } })
    expect([queued, preparing, translating].map((s) => said(s))).toEqual([
      { kind: 'progress', text: 'queued' },
      { kind: 'progress', text: 'translating, the first time takes 1-2 minutes' },
      { kind: 'progress', text: 'translating 12 / 48' },
    ])
    expect(capsuleOf(translating, none, LANGUAGES, WORDS)?.words).toMatchObject({ prefix: 'translating ', count: 12 })
    for (const s of [preparing, translating])
      expect(said({ ...s, reconnecting: true })).toEqual({ kind: 'progress', text: 'reconnecting' })
    // (none given: no capsule, as the extension's; a stage worded and another not: that one alone)
    for (const s of [preparing, translating, { ...translating, reconnecting: true }])
      expect(capsuleOf(s, none, LANGUAGES)).toBeNull()
    expect(said(translating, { reconnecting: 'reconnecting' })).toBeNull()
    // (rows its units start while the prepare lasts: the first making still, its count not the view's)
    expect(said({ ...translating, preparing: { progress: 0.4 } })).toEqual({
      kind: 'progress',
      text: 'translating, the first time takes 1-2 minutes',
    })
    // (a run over: nothing of it)
    expect(said(at({ phase: 'ready', reconnecting: true }))).toBeNull()
  })
  it("a new paper: one stage, the translation, from its layer being made until its count shows; the making never said (the coordinator's decision 1, 2026-11-11)", () => {
    const made = { made: true, phase: 'translating' as const }
    const stages = [
      at({ phase: 'preparing', made: true, preparing: { progress: 0.4 } }),
      // (the layer landed, its units not read yet: the count not known, the first making's words still)
      at({ ...made, translated: { got: 0, total: 0 } }),
      at({ ...made, progress: 222 / 227, translated: { got: 222, total: 227 } }),
    ]
    expect(stages.map((s) => said(s))).toEqual([
      { kind: 'progress', text: 'translating, the first time takes 1-2 minutes' },
      { kind: 'progress', text: 'translating, the first time takes 1-2 minutes' },
      { kind: 'progress', text: 'translating 222 / 227' },
    ])
    expect(stages.map((s) => stageOf(s))).toEqual(['translating', 'translating', 'translating'])
    // (the first making's figures are the time it takes, never a count drawn in a cell of its own)
    const one = at({
      phase: 'preparing',
      made: true,
      preparing: { progress: 0 },
      translated: { got: 1, total: 0 },
    })
    expect(capsuleOf(one, none, LANGUAGES, WORDS)?.words).toEqual(
      plain('translating, the first time takes 1-2 minutes'),
    )
    // (the first making's end held is its wait still: the early units' rows ended while the layer is made, or the layer landed and
    // its count is not known; once counted, an end held is a load, nothing said)
    const held = { phase: 'translating' as const, laying: true, made: true, progress: 1 }
    expect(said(at({ ...held, preparing: { progress: 0.5 } }))?.text).toBe(
      'translating, the first time takes 1-2 minutes',
    )
    expect(said(at({ ...held, translated: { got: 0, total: 0 } }))?.text).toBe(
      'translating, the first time takes 1-2 minutes',
    )
    expect(said(at({ ...held, translated: { got: 227, total: 227 } }))).toBeNull()
    // (a run on a layer shown before this visit, its count not known: the bare stage, as before)
    expect(
      said(at({ phase: 'translating', translated: { got: 0, total: 0 } }), {
        translating: (_g, _t, _c, first) => (first ? 'first' : 'bare'),
      }),
    ).toEqual({ kind: 'progress', text: 'bare' })
  })
  it("our server at capacity (the open's busy refusal, causeOf): the paper waits in line, a run's capsule with no retry, in the host's words; the extension's the refusal's words and retry as before; the visitor's rate never queued (the coordinator's decision 5, 2026-11-11)", () => {
    const busy = at({ phase: 'ready', unavailable: { why: 'busy', retryAt: Date.now() + 30_000 } })
    expect(stageOf(busy)).toBe('queued')
    expect(capsuleOf(busy, none, LANGUAGES, WORDS)).toEqual({
      kind: 'progress',
      stage: 'queued',
      words: plain('queued'),
    })
    // (no words for it, the extension's: the refusal's sentence and its retry, as before)
    expect(said(busy, {})).toEqual({ kind: 'notNow', text: R.status.limited })
    expect(said(busy, { limited: () => 'limit' })).toEqual({ kind: 'notNow', text: 'limit' })
    // (the visitor's rate, our server's limit, out of reach: refusals still, never the queue)
    for (const why of ['rate', 'refused', 'unreachable'] as const)
      expect([
        stageOf(at({ phase: 'ready', unavailable: { why, retryAt: 5 } })),
        said(at({ phase: 'ready', unavailable: { why, retryAt: 5 } }))?.kind,
      ]).toEqual([null, 'notNow'])
  })
  it("the end held for the layer's first page (laying): nothing is translated then, so no capsule in any host's words — a stored translation's first page is a load, the line's (the coordinator's decision 2, 2026-11-11)", () => {
    const laying = at({ phase: 'translating', laying: true, progress: 1, translated: { got: 476, total: 476 } })
    expect(said(laying)).toBeNull()
    expect(lineOf(laying)).toEqual({ on: true, value: 1 })
    // (our server's document not heard meanwhile is still said)
    expect(said({ ...laying, reconnecting: true })).toEqual({ kind: 'progress', text: 'reconnecting' })
    // (the extension's: no words for it, the line alone)
    expect(capsuleOf(laying, none, LANGUAGES)).toBeNull()
  })
  it("why the translation is not there, in the host's words: no PDF, too large, unavailable, busy or the limit with the time a retry is due", () => {
    const lasting = (why: 'no-source' | 'too-large') =>
      at({ phase: 'ready', available: false, unavailable: { why, retryAt: null } })
    expect([said(lasting('no-source')), said(lasting('too-large'))]).toEqual([
      { kind: 'unavailable', text: 'no pdf' },
      { kind: 'unavailable', text: 'too large' },
    ])
    const passing = (why: 'unreachable' | 'busy' | 'refused') =>
      at({ phase: 'ready', unavailable: { why, retryAt: 5 } })
    expect(['unreachable', 'busy', 'refused'].map((w) => said(passing(w as 'busy'))?.text)).toEqual([
      'unavailable until 5',
      // (busy is the queue where the host words it: decision 5; else its own words with the time, as before)
      'queued',
      'quota until 5',
    ])
    const { queued: _, ...noQueue } = WORDS
    expect(said(passing('busy'), noQueue)?.text).toBe('quota until 5')
    // (the visitor's rate of asks and the network itself, each its own cause and words, with no time: the reader asks again by
    // itself, at the rate's time, or once the connection is back)
    const cause = (why: 'rate' | 'network') =>
      at({ phase: 'ready', unavailable: { why, retryAt: why === 'rate' ? 5 : null } })
    expect([said(cause('rate'))?.text, said(cause('network'))?.text]).toEqual(['too many requests', 'no connection'])
    expect(
      (['refused', 'busy', 'rate', 'network', 'unreachable', 'no-source'] as const).map((why) =>
        causeOf(at({ phase: 'ready', unavailable: { why, retryAt: null } })),
      ),
    ).toEqual(['quota', 'busy', 'rate', 'network', 'server', null])
    // (the catalogue's otherwise: the rate as its limit's sentence, which says to try again later; the network as out of reach)
    expect([said(cause('rate'), {})?.text, said(cause('network'), {})?.text]).toEqual([
      R.status.limited,
      R.status.notNow,
    ])
    // (the catalogue's otherwise: a paper too large said as one that cannot be had, busy as the limit)
    expect(said(lasting('too-large'), {})?.text).toBe(R.status.noPdf)
    expect(said(passing('busy'), {})?.text).toBe(R.status.limited)
    expect(said(passing('busy'), { limited: () => 'quota' })?.text).toBe('quota')
  })
  it("the rest of the capsule's states, each in the host's words or the catalogue's", () => {
    const states: [ReaderState, string, string][] = [
      [
        at({ phase: 'ready', languageSupported: false, ...target('de') }),
        'no Deutsch',
        R.status.unsupported(NAMES.de as string),
      ],
      [at({ phase: 'ready', failedUnits: 2 }), '2 failed', S.failed.text(2)],
      [at({ phase: 'ready', narrow: true }), 'narrow', R.status.narrow],
      [at({ phase: 'ready', settingsUnreadable: true }), 'unreadable', R.status.unreadable],
      [at({ phase: 'ready', refusals: 1 }), 'not saved', O.saveFailed],
    ]
    for (const [s, host, catalogue] of states) {
      expect(said(s)?.text).toBe(host)
      expect(said(s, {})?.text).toBe(catalogue)
    }
  })
  it("the cards in the host's words: a run that translated nothing by its kind, the original not read, no paper", () => {
    const failed = at({ phase: 'failed', failure: 'rate-limit', failures: { pdf: null, service: 'rate-limit' } })
    const lost = at({ phase: 'failed', failure: 'network', failures: { pdf: 'network', service: null } })
    const noPaper = at({ noPaper: true })
    expect([cardOf(failed, reason, WORDS), cardOf(lost, reason, WORDS), cardOf(noPaper, reason, WORDS)]).toEqual([
      { reason: 'failed: rate-limit', action: 'retry' },
      { reason: 'no original', action: 'retry' },
      { reason: 'no paper', action: 'arxiv' },
    ])
    expect([cardOf(failed, reason), cardOf(lost, reason), cardOf(noPaper, reason)].map((c) => c?.reason)).toEqual([
      R.status.rateLimited,
      reason('network'),
      R.status.noPaper,
    ])
  })
})

describe("the capsule beside the lost original's own card (StateWords openOriginal: the website's; L11 third round, gap 5)", () => {
  const WORDS: StateWords = {
    queued: 'queued',
    translating: (got, total, _chip, first) => (first ? 'translating, first' : `translating ${got} / ${total}`),
    notNow: () => 'unavailable for now',
    noPdf: 'no pdf',
    originalLost: 'no original',
    openOriginal: 'Open the PDF on arXiv',
  }
  /** the original could not be read: its failure the phase */
  const lost = (over: Partial<ReaderState>) =>
    at({ phase: 'failed', failures: { pdf: 'network', service: null }, failure: 'network', ...over })
  const said = (s: ReaderState, words: StateWords = WORDS) => {
    const c = capsuleOf(s, none, LANGUAGES, words)
    return c && { kind: c.kind, text: textOf(c.words), ...('href' in c && c.href ? { href: c.href } : {}) }
  }
  it("tells the translation's state beside it, as the website's page does: a refusal for now with its retry, a run's stage, the paper's own refusal", () => {
    expect(said(lost({ unavailable: { why: 'unreachable', retryAt: null } }))).toEqual({
      kind: 'notNow',
      text: 'unavailable for now',
    })
    expect(said(lost({ preparing: { progress: 0.3 } }))).toEqual({
      kind: 'progress',
      text: 'translating, first',
    })
    expect(said(lost({ unavailable: { why: 'busy', retryAt: 5 } }))).toEqual({ kind: 'progress', text: 'queued' })
    expect(said(lost({ rowsComing: true, translated: { got: 3, total: 10 } }))).toEqual({
      kind: 'progress',
      text: 'translating 3 / 10',
    })
    expect(said(lost({ available: false, unavailable: { why: 'no-source', retryAt: null } }))).toEqual({
      kind: 'unavailable',
      text: 'no pdf',
    })
    // (nothing under way, nothing refused: nothing to tell)
    expect(said(lost({}))).toBeNull()
  })
  it("tells nothing where the card is the pane's whole answer: the extension's (no card of the original's own), a service's failure too, a load", () => {
    const states = [
      lost({ unavailable: { why: 'unreachable', retryAt: null } }),
      lost({ preparing: { progress: 0.3 } }),
      lost({ rowsComing: true, translated: { got: 3, total: 10 } }),
    ]
    const { openOriginal: _, ...extension } = WORDS
    for (const s of states) {
      expect(said(s, extension)).toBeNull()
      expect(said({ ...s, failures: { pdf: 'network', service: 'no-key' } })).toBeNull()
    }
    expect(said(at({ phase: 'loading', preparing: { progress: 0.3 } }))).toBeNull()
  })
})

describe("the original held by the host's rules (status.ts heldOf; L11's second round, gaps 7 and 8)", () => {
  const busy = { unavailable: { why: 'busy' as const, retryAt: null } }
  it("neither rule given (the extension's): never", () => {
    for (const over of [busy, { narrow: true, phase: 'preparing' as const, preparing: { progress: null } }])
      expect(heldOf(at({ phase: 'ready', ...over }), {})).toBe(false)
  })
  it("`refusal: 'original'`: a refusal for now with nothing laid, at any width; not one with pages laid, nor the paper's own", () => {
    const rules = { refusal: 'original' as const }
    expect(heldOf(at({ phase: 'ready', ...busy }), rules)).toBe(true)
    expect(heldOf(at({ phase: 'ready', unavailable: { why: 'unreachable', retryAt: null } }), rules)).toBe(true)
    expect(heldOf(at({ phase: 'ready', ...busy, layer: { laid: 2, total: 4 } }), rules)).toBe(false)
    expect(
      heldOf(at({ phase: 'ready', available: false, unavailable: { why: 'no-source', retryAt: null } }), rules),
    ).toBe(false)
    expect(heldOf(at({ phase: 'ready' }), rules)).toBe(false)
  })
  it("`narrow: 'shown'`: in a narrow window while the paper is made or refused for now, until the reader chooses; a paper served, never", () => {
    const rules = { narrow: 'shown' as const }
    const narrow = { narrow: true }
    expect(heldOf(at({ ...narrow, phase: 'preparing', preparing: { progress: null } }), rules)).toBe(true)
    // (the original still loading: a prepare told meanwhile)
    expect(heldOf(at({ ...narrow, phase: 'loading', preparing: { progress: 0.2 } }), rules)).toBe(true)
    expect(heldOf(at({ ...narrow, phase: 'translating', made: true }), rules)).toBe(true)
    expect(heldOf(at({ ...narrow, phase: 'ready', ...busy }), rules)).toBe(true)
    // (a paper served, its rows read: not made this visit; the run ended; a wide window; the reader's own choice)
    expect(heldOf(at({ ...narrow, phase: 'translating' }), rules)).toBe(false)
    expect(heldOf(at({ ...narrow, phase: 'ready', made: true }), rules)).toBe(false)
    expect(heldOf(at({ phase: 'preparing', preparing: { progress: null } }), rules)).toBe(false)
    expect(heldOf(at({ ...narrow, phase: 'translating', made: true, chose: true }), rules)).toBe(false)
  })
})
