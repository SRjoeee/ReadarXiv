import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { INITIAL, type ReaderState } from '@/pdf-reader/controller'
import { capsuleOf, cardOf, lineOf } from '@/pdf-reader/ui/status'
import { setLocale } from '@/ui/strings'

const at = (over: Partial<ReaderState>): ReaderState => ({ ...INITIAL, settings: DEFAULT_CONFIG, display: 'bilingual', ...over })
const none = { closed: false, narrowShown: false }

// the interface's words as the maintainer reads them
beforeAll(() => setLocale('zh-CN'))

describe('the states (the reader\'s design, §8)', () => {
  it('reading shows nothing', () => {
    expect(capsuleOf(at({ phase: 'ready' }), none)).toBeNull()
    expect(cardOf(at({ phase: 'ready', failure: 'network', shown: 'copy' }))).toBeNull()
  })

  it('loading and translating say so in the capsule, their progress on the line under the toolbar (the maintainer, 2026-09-25)', () => {
    expect(capsuleOf(at({ phase: 'loading' }), none)).toEqual({ kind: 'progress', text: '正在加载' })
    expect(capsuleOf(at({ phase: 'translating', progress: 0.4 }), none)).toEqual({ kind: 'progress', text: '正在翻译' })
    expect(capsuleOf(at({ phase: 'retranslating', progress: 0.1 }), none)).toMatchObject({ text: '正在按当前设置重新翻译' })
  })

  it('the line: the PDF\'s download while it loads, the paragraphs translated while a translation runs, nothing while reading', () => {
    expect(lineOf(at({ phase: 'loading', loaded: 0.3, progress: 0.9 }))).toEqual({ on: true, stage: 'load', value: 0.3 })
    expect(lineOf(at({ phase: 'translating', loaded: 1, progress: 0.4 }))).toEqual({ on: true, stage: 'run', value: 0.4 })
    expect(lineOf(at({ phase: 'retranslating', progress: 0.1 }))).toEqual({ on: true, stage: 'run', value: 0.1 })
    expect(lineOf(at({ phase: 'ready', progress: 1 })).on).toBe(false)
    expect(lineOf(at({ phase: 'failed' })).on).toBe(false)
  })

  it('counts the paragraphs that failed, with 重试, until closed', () => {
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 3 }), none)).toEqual({ kind: 'notice', text: '3 处翻译失败', action: 'retry' })
    expect(capsuleOf(at({ phase: 'ready', failedUnits: 3 }), { ...none, closed: true })).toBeNull()
  })

  it('names a language the reader cannot typeset, and offers the menu', () => {
    const state = at({ phase: 'ready', languageSupported: false, settings: { ...DEFAULT_CONFIG, targetLanguage: 'arb' } })
    expect(capsuleOf(state, none)).toMatchObject({ kind: 'unsupported', action: 'language' })
    expect(capsuleOf(state, none)!.text).toMatch(/^PDF 对照暂不支持/)
  })

  it('says once that a narrow window shows the translation alone', () => {
    expect(capsuleOf(at({ phase: 'ready', narrow: true }), none)).toEqual({ kind: 'narrow', text: '窗口较窄，暂只显示译文' })
    expect(capsuleOf(at({ phase: 'ready', narrow: true }), { ...none, narrowShown: true })).toBeNull()
    expect(capsuleOf(at({ phase: 'ready', narrow: true, display: 'translation' }), none)).toBeNull()
  })

  it('nothing translated: the card, with the reason; 设置 for a key, 重试 otherwise; no capsule', () => {
    expect(cardOf(at({ phase: 'failed', failure: 'network' }))).toEqual({ reason: '网络连接失败', action: 'retry' })
    expect(cardOf(at({ phase: 'failed', failure: 'no-key' }))).toEqual({ reason: '尚未配置 API Key', action: 'settings' })
    expect(cardOf(at({ phase: 'failed', failure: 'auth' }))!.action).toBe('settings')
    expect(capsuleOf(at({ phase: 'failed', failure: 'network' }), none)).toBeNull()
  })
})
