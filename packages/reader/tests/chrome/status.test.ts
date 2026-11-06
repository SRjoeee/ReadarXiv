import { beforeAll, describe, expect, it } from 'vitest'
import { LOCALE_CODES, LOCALES, O, R, S, setLocale } from '@readarxiv/ui'
import { INITIAL, type ReaderState } from '../../src/chrome/model.ts'
import { plain, textOf, withCount } from '../../src/chrome/capsule-words.ts'
import { capsuleOf, cardOf, lineOf, spokenOf } from '../../src/chrome/status.ts'
import { PREFS } from './fake-controller.ts'
import { LANGUAGES, NAMES, TEST_PARTS } from './parts.ts'

const at = (over: Partial<ReaderState>): ReaderState => ({ ...INITIAL, prefs: PREFS, display: 'bilingual', ...over })
const none = { noticeClosed: false, narrowShown: false, refusalsSeen: 0 }
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
      v({ phase: 'preparing', preparing: { position: 2, progress: null } }),
      v({ phase: 'preparing', preparing: { position: null, progress: 0.5 } }),
      v({ phase: 'preparing', preparing: { position: null, progress: 1 } }),
      v({ phase: 'translating', progress: 0.9 }),
    ]
    for (let k = 2; k < steps.length; k++) expect(steps[k]).toBeGreaterThan(steps[k - 1] as number)
    expect(steps[1]).toBeCloseTo(v({ phase: 'loading', loaded: 1 }))
    expect(v({ phase: 'translating', progress: 1 })).toBe(1)
    expect(lineOf(at({ phase: 'preparing' })).on).toBe(true)
    expect(lineOf(at({ phase: 'ready', progress: 1 })).on).toBe(false)
    expect(lineOf(at({ phase: 'failed' })).on).toBe(false)
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
      capsuleOf(at({ phase: 'ready', failedUnits: 3, failure: 'network' }), { ...none, noticeClosed: true }, LANGUAGES),
    ).toBeNull()
  })

  it('passages the typesetting left in the original, and no stop to resume: counted, with no retry — the same translation fails the same way (the review of 2026-10-04, I-5)', () => {
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 2, failure: null }), none, LANGUAGES)).toEqual({
      kind: 'notice',
      words: withCount(S.failed.text(2), 2),
      action: null,
    })
    expect(
      capsuleOf(at({ phase: 'ready', failedUnits: 2, failure: null }), { ...none, noticeClosed: true }, LANGUAGES),
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
        { ...none, noticeClosed: true },
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
