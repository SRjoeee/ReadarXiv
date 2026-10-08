import { beforeAll, describe, expect, it } from 'vitest'
import { LANG_CODE_TO_LOCALE_NAME, toBcp47 } from '@/config/languages'
import { DEFAULT_CONFIG } from '@/config/schema'
import { INITIAL, type ReaderState } from '@/pdf-reader/controller'
import { plain, textOf, withCount } from '@/pdf-reader/ui/capsule-words'
import { capsuleOf, cardOf, lineOf, spokenOf } from '@/pdf-reader/ui/status'
import { O, R, S, setLocale } from '@/ui/strings'

const at = (over: Partial<ReaderState>): ReaderState => ({ ...INITIAL, settings: DEFAULT_CONFIG, display: 'bilingual', ...over })
const none = { partialClosed: false, noticeClosed: false, narrowShown: false, refusalsSeen: 0 }

// the interface's words as the maintainer reads them
beforeAll(() => setLocale('zh-CN'))

describe('the states (the reader\'s design, §8)', () => {
  it('reading shows nothing', () => {
    expect(capsuleOf(at({ phase: 'ready' }), none)).toBeNull()
    expect(cardOf(at({ phase: 'ready', failure: 'network', shown: 'copy' }))).toBeNull()
  })

  it('loading and translating show no capsule: the line under the toolbar is enough, and the words are said to screen readers (the maintainer, 2026-09-25)', () => {
    for (const phase of ['loading', 'translating', 'retranslating'] as const) expect(capsuleOf(at({ phase }), none)).toBeNull()
    expect([spokenOf(at({ phase: 'loading' })), spokenOf(at({ phase: 'translating' })), spokenOf(at({ phase: 'retranslating' })), spokenOf(at({ phase: 'ready' }))]).toEqual(['正在加载', '正在翻译', '正在按当前设置重新翻译', ''])
  })

  it('keeps a notice of paragraphs that failed for the run\'s end, and says a narrow window while a translation runs', () => {
    expect(capsuleOf(at({ phase: 'translating', failedUnits: 3 }), none)).toBeNull()
    expect(capsuleOf(at({ phase: 'translating', narrow: true }), none)).toMatchObject({ kind: 'narrow' })
  })

  it('the line: one over the whole process — the PDF\'s download, the paragraphs translated, the final — never starting again (the maintainer asked why it ran twice, 2026-10-02)', () => {
    const v = (over: Partial<ReaderState>) => lineOf(at(over)).value
    // the download is the first stretch when a translation follows it, all of it when the original alone is shown
    expect(lineOf(at({ phase: 'loading', loaded: 0.3, progress: 0.9 })).on).toBe(true)
    expect(v({ phase: 'loading', loaded: 1 })).toBeCloseTo(v({ phase: 'translating', progress: 0 }))
    expect(v({ phase: 'loading', loaded: 1, display: 'original' })).toBe(1)
    // the paragraphs translated after it, and the final last: all translated is not the end
    const steps = [v({ phase: 'loading', loaded: 0.5 }), v({ phase: 'translating', progress: 0 }), v({ phase: 'translating', progress: 0.5 }), v({ phase: 'translating', progress: 1 }), v({ phase: 'translating', progress: 1, shown: 'final' })]
    for (let k = 1; k < steps.length; k++) expect(steps[k]).toBeGreaterThan(steps[k - 1] as number)
    expect(steps.at(-2)).toBeLessThan(1)
    expect(steps.at(-1)).toBe(1)
    expect(lineOf(at({ phase: 'retranslating', progress: 0.1 })).on).toBe(true)
    expect(lineOf(at({ phase: 'ready', progress: 1 })).on).toBe(false)
    expect(lineOf(at({ phase: 'failed' })).on).toBe(false)
  })

  it('the line moves with the typesetting the final waits for: each compile ended after the translation, the end only with the final (the F2 review\'s M1)', () => {
    const v = (over: Partial<ReaderState>) => lineOf(at({ phase: 'translating', progress: 1, ...over })).value
    const steps = [v({ progress: 0.9 }), v({ finishing: 0 }), v({ finishing: 1 }), v({ finishing: 2 }), v({ finishing: 3 }), v({ finishing: 3, shown: 'final' })]
    for (let k = 1; k < steps.length; k++) expect(steps[k]).toBeGreaterThan(steps[k - 1] as number)
    expect(steps.at(-2)).toBeLessThan(1)
    // the translation's end is not near the line's: with a service that answers in seconds the compiles are most of it
    expect(v({ finishing: 0 })).toBeLessThan(0.7)
  })

  it('counts the paragraphs that failed, with 重试, until closed — the retry where the run stopped for the service', () => {
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 3, failure: 'network' }), none)).toEqual({ kind: 'notice', words: withCount('3 处翻译失败', 3), action: 'retry' })
    // the count a part of its own, so that it changes in place
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 3, failure: 'network' }), none)).toMatchObject({ words: { prefix: '', count: 3, suffix: ' 处翻译失败' } })
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 3, failure: 'network' }), { ...none, noticeClosed: true })).toBeNull()
  })

  it('passages the typesetting left in the original, and no stop to resume: counted, with no retry — the same translation fails the same way (the review of 2026-10-04, I-5)', () => {
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 2, failure: null }), none)).toEqual({ kind: 'notice', words: withCount(S.failed.text(2), 2), action: null })
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 2, failure: null }), { ...none, noticeClosed: true })).toBeNull()
  })

  it('names a language the reader cannot typeset, and offers the menu', () => {
    const state = at({ phase: 'ready', languageSupported: false, settings: { ...DEFAULT_CONFIG, targetLanguage: 'arb' } })
    expect(capsuleOf(state, none)).toMatchObject({ kind: 'unsupported', action: 'language' })
    expect(textOf(capsuleOf(state, none)!.words)).toMatch(/^PDF 对照暂不支持/)
  })

  it('every kind\'s words say what its text said, and S-R-13\'s own name is a part with the target\'s BCP 47 tag as its lang (Devin on #313)', () => {
    const said = (over: Partial<ReaderState>, seen = none) => textOf(capsuleOf(at({ phase: 'ready', ...over }), seen)!.words)
    expect(said({ available: false, htmlVersion: null })).toBe(R.status.noPdf)
    expect(said({ partial: true })).toBe(R.status.partial)
    expect(said({ failedUnits: 12, failure: 'network' })).toBe(S.failed.text(12))
    expect(said({ narrow: true })).toBe(R.status.narrow)
    const unsupported = capsuleOf(at({ phase: 'ready', languageSupported: false, settings: { ...DEFAULT_CONFIG, targetLanguage: 'jpn' } }), none)!
    expect([textOf(unsupported.words), unsupported.words.part]).toEqual([R.status.unsupported(LANG_CODE_TO_LOCALE_NAME.jpn), { text: LANG_CODE_TO_LOCALE_NAME.jpn, lang: toBcp47('jpn') }])
    expect(toBcp47('jpn')).toBe('ja')
  })

  it('names that language by its own name, as the language button does, in either interface language (the maintainer, 2026-10-04)', () => {
    try {
      for (const locale of ['zh-CN', 'en'] as const) {
        setLocale(locale)
        for (const target of ['arb', 'tur', 'jpn'] as const) {
          const said = capsuleOf(at({ phase: 'ready', languageSupported: false, settings: { ...DEFAULT_CONFIG, targetLanguage: target } }), none)!.words
          expect([locale, textOf(said)]).toEqual([locale, R.status.unsupported(LANG_CODE_TO_LOCALE_NAME[target])])
          // the name inside is the one the language button shows, not the interface's name for the language, and it is
          // drawn in its own language: a part whose lang is the target's BCP 47 tag (Devin on #313)
          expect([locale, said.part]).toEqual([locale, { text: LANG_CODE_TO_LOCALE_NAME[target], lang: toBcp47(target) }])
        }
      }
      setLocale('en')
      expect(R.status.unsupported('X')).toBe("A bilingual PDF isn't available in X yet")
    } finally { setLocale('zh-CN') }
  })

  it('says once that a narrow window shows the translation alone', () => {
    expect(capsuleOf(at({ phase: 'ready', narrow: true }), none)).toEqual({ kind: 'narrow', words: plain('窗口较窄，暂只显示译文') })
    expect(capsuleOf(at({ phase: 'ready', narrow: true }), { ...none, narrowShown: true })).toBeNull()
    expect(capsuleOf(at({ phase: 'ready', narrow: true, display: 'translation' }), none)).toBeNull()
  })

  it('a paper that cannot be had as a bilingual PDF: said, with the HTML version offered where there is one; not closable, before any other capsule (the maintainer, 2026-09-26)', () => {
    expect(capsuleOf(at({ phase: 'ready', available: false, htmlVersion: 'https://arxiv.org/html/1706.03762#readarxiv' }), none)).toEqual({ kind: 'unavailable', words: plain(R.status.noPdf), href: 'https://arxiv.org/html/1706.03762#readarxiv' })
    expect(capsuleOf(at({ phase: 'ready', available: false, htmlVersion: null }), none)).toEqual({ kind: 'unavailable', words: plain(R.status.noPdf) })
    expect(capsuleOf(at({ phase: 'ready', available: false, htmlVersion: null, failedUnits: 3, narrow: true }), { ...none, partialClosed: true, noticeClosed: true })).toMatchObject({ kind: 'unavailable' })
    expect(capsuleOf(at({ phase: 'ready', available: false, languageSupported: false, htmlVersion: null }), none)).toMatchObject({ kind: 'unavailable' })
  })

  it('a translation shown in part: said, the HTML version offered where there is one, closable, before the notice of passages that failed (S-R-19)', () => {
    expect(capsuleOf(at({ phase: 'ready', partial: true, htmlVersion: 'https://arxiv.org/html/x#readarxiv' }), none)).toEqual({ kind: 'partial', words: plain(R.status.partial), href: 'https://arxiv.org/html/x#readarxiv' })
    expect(capsuleOf(at({ phase: 'ready', partial: true, htmlVersion: null, failedUnits: 2 }), none)).toEqual({ kind: 'partial', words: plain(R.status.partial) })
    expect(capsuleOf(at({ phase: 'ready', partial: true }), { ...none, partialClosed: true })).toBeNull()
    expect(capsuleOf(at({ phase: 'translating', partial: true }), none)).toBeNull()
  })

  it('the partial notice and the notice of failed passages are closed apart: closing one tells the other, which it had covered (#314)', () => {
    const both = at({ phase: 'ready', partial: true, failedUnits: 2, failure: 'network' })
    expect(capsuleOf(both, none)).toMatchObject({ kind: 'partial' })
    // the partial notice closed: the count of passages that failed, which it stood before, is told now
    expect(capsuleOf(both, { ...none, partialClosed: true })).toMatchObject({ kind: 'notice', words: { count: 2 }, action: 'retry' })
    expect(capsuleOf(both, { ...none, partialClosed: true, noticeClosed: true })).toBeNull()
    // the notice's close is the notice's alone: it was never shown while the partial one stood
    expect(capsuleOf(both, { ...none, noticeClosed: true })).toMatchObject({ kind: 'partial' })
  })

  it('settings that could not be read: a note that stays while it is so, over a load that waits for them too; a failure\'s card has none beside it (S-R-21)', () => {
    const note = { kind: 'unreadable', words: plain(R.status.unreadable) }
    for (const phase of ['loading', 'translating', 'ready'] as const) expect(capsuleOf(at({ phase, settingsUnreadable: true }), none), phase).toEqual(note)
    // before the paper's own notes: the controls these would speak of are out of reach until they are read
    expect(capsuleOf(at({ phase: 'ready', settingsUnreadable: true, available: false }), none)).toEqual(note)
    expect(capsuleOf(at({ phase: 'failed', failure: 'network', settingsUnreadable: true }), none)).toBeNull()
    // beside the card of an address with no paper, which names no note of its own: the settings are as unreadable there
    expect(capsuleOf(at({ phase: 'ready', settingsUnreadable: true, noPaper: true, available: false }), none)).toEqual(note)
    expect(capsuleOf(at({ phase: 'ready', settingsUnreadable: true, noPaper: true }), none)).toEqual(note)
    expect(capsuleOf(at({ phase: 'ready', settingsUnreadable: false }), none)).toBeNull()
  })

  it('a write storage refused: told until it is closed or a later write lands, as the settings page says it, and told again for the next (S-R-22)', () => {
    const refused = at({ phase: 'ready', refusals: 1 })
    expect(capsuleOf(refused, none)).toEqual({ kind: 'saveFailed', words: plain(O.saveFailed) })
    expect(capsuleOf(refused, { ...none, refusalsSeen: 1 })).toBeNull()
    expect(capsuleOf({ ...refused, refusals: 2 }, { ...none, refusalsSeen: 1 })).toMatchObject({ kind: 'saveFailed' })
    // mended: a write landed after it
    expect(capsuleOf({ ...refused, mended: 1 }, none)).toBeNull()
    expect(capsuleOf({ ...refused, refusals: 2, mended: 1 }, none)).toMatchObject({ kind: 'saveFailed' })
    // over a load too, since the controls are in reach then; and before the notes that stand
    expect(capsuleOf(at({ phase: 'loading', refusals: 1 }), none)).toMatchObject({ kind: 'saveFailed' })
    expect(capsuleOf(at({ phase: 'ready', refusals: 1, available: false }), none)).toMatchObject({ kind: 'saveFailed' })
    expect(capsuleOf(at({ phase: 'ready', refusals: 1, available: false }), { ...none, refusalsSeen: 1 })).toMatchObject({ kind: 'unavailable' })
    expect(capsuleOf(at({ phase: 'failed', failure: 'network', refusals: 1 }), none)).toBeNull()
  })

  it('nothing translated: the card, with the reason; 设置 for a key, 重试 otherwise; no capsule', () => {
    expect(cardOf(at({ phase: 'failed', failure: 'network' }))).toEqual({ reason: '网络连接失败', action: 'retry' })
    expect(cardOf(at({ phase: 'failed', failure: 'no-key' }))).toEqual({ reason: '尚未配置 API Key', action: 'settings' })
    expect(cardOf(at({ phase: 'failed', failure: 'auth' }))!.action).toBe('settings')
    expect(capsuleOf(at({ phase: 'failed', failure: 'network' }), none)).toBeNull()
  })

  it('an address with no paper: the card says it cannot be found and offers arXiv; no capsule, whatever else the state holds (D1)', () => {
    const missing = at({ phase: 'ready', noPaper: true, available: false })
    expect(cardOf(missing)).toEqual({ reason: R.status.noPaper, action: 'arxiv' })
    // nothing paper-specific is said of it: not a paper that cannot be had, a partial translation, failed passages, a narrow window, a language
    expect(capsuleOf({ ...missing, partial: true, failedUnits: 2, narrow: true, languageSupported: false }, none)).toBeNull()
    expect(capsuleOf(missing, none)).toBeNull()
    // …but what is true of the settings is: the note and a refused write stand beside the card (Devin on #329)
    expect(capsuleOf({ ...missing, settingsUnreadable: true }, none)).toMatchObject({ kind: 'unreadable' })
    expect(capsuleOf({ ...missing, refusals: 1 }, none)).toMatchObject({ kind: 'saveFailed' })
    // a paper named has no such card, and a failure's card is the failure's
    expect(cardOf(at({ phase: 'ready' }))).toBeNull()
    expect(cardOf(at({ phase: 'failed', failure: 'network' }))).toMatchObject({ action: 'retry' })
    expect(R.status.noPaper).not.toBe('')
  })

  it('too many requests: the card promises no retry of its own — a stopped run waits for the reader\'s (Part 6\'s interface review)', () => {
    expect(cardOf(at({ phase: 'failed', failure: 'rate-limit' }))).toEqual({ reason: R.status.rateLimited, action: 'retry' })
    expect(R.status.rateLimited).not.toMatch(/自动|shortly/)
  })
})
