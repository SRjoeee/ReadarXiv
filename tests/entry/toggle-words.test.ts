import { describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { askAgainOnRestore, createToggleWords } from '@/entrypoints/content/toggle-words'
import { LOCALES } from '@/locales'
import type { PageAction } from '@/shared/page-action'

// The floating button's words on the full text (UI.md S-I-06): what its press does, as the toggle decides it
// (background/context-menu.ts `decideToggle`), in the words the popup's primary button says for that decision — every
// press, the retranslate cue (P6b), a page behind its settings (P13) and a paused page (P9) included

const { S } = LOCALES.en
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const decision = (action: PageAction, enabled = true) => ({ action, behind: action === 'retranslate', enabled })
type Decision = ReturnType<typeof decision>
/** A decide whose answers the test gives, one per ask, in any order */
function held() {
  const answers: ((d: Decision | null) => void)[] = []
  const decide = vi.fn(() => new Promise<Decision | null>(resolve => { answers.push(resolve) }))
  return { decide, answers }
}

describe('createToggleWords', () => {
  it('a running page says what its press does — the retranslate cue\'s and a page behind its settings\' retranslate, anywhere else the restore — and each change of it is drawn, once', async () => {
    let answer = decision('retranslate')
    const changed = vi.fn()
    const words = createToggleWords({ decide: async () => answer, changed })
    words.follow('on')
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
    expect(changed).toHaveBeenCalledTimes(1)
    // the settings put back, the key refused again: the decision restores, and so do the words
    answer = decision('restore')
    words.refresh()
    await settle()
    expect(words.label(S, true)).toBe(S.primary.restore)
    expect(changed).toHaveBeenCalledTimes(2)
    // an answer that moved nothing redraws nothing
    words.refresh()
    await settle()
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('a page behind settings that cannot run says what the popup\'s primary says there — retranslate, which that button offers disabled — while its press opens the panel (P13)', async () => {
    const words = createToggleWords({ decide: async () => decision('retranslate', false), changed: () => undefined })
    words.follow('on')
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
  })

  it('a paused page asks, and says its press retries as the popup\'s primary does (P9); an idle page asks nothing — its press always translates, the words it has without an answer', async () => {
    const decide = vi.fn(async () => decision('retranslate'))
    const words = createToggleWords({ decide, changed: () => undefined })
    words.follow('idle')
    await settle()
    expect([decide.mock.calls.length, words.label(S, false)]).toEqual([0, S.primary.translate])
    words.follow('stopped')
    await settle()
    expect([decide.mock.calls.length, words.label(S, false)]).toEqual([1, S.primary.retranslate])
  })

  it('a change of state drops the decision made on the state before at once; the settings and the record move a running page\'s alone', async () => {
    const { decide, answers } = held()
    const words = createToggleWords({ decide, changed: () => undefined })
    words.follow('on')
    await settle()
    answers[0]!(decision('retranslate'))
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
    // stopped with a fatal error: until the answer comes, the words of a page that is not on — never the running page's
    words.follow('stopped')
    expect(words.label(S, false)).toBe(S.primary.translate)
    await settle()
    answers[1]!(decision('retranslate'))
    await settle()
    // a settings change on a page that is not running asks nothing
    words.refresh()
    expect(decide).toHaveBeenCalledTimes(2)
    // restored while an ask is out: its answer is the running page's, and dropped
    words.follow('on')
    words.follow('idle')
    await settle()
    answers[2]!(decision('restore'))
    await settle()
    expect([decide.mock.calls.length, words.label(S, false)]).toEqual([3, S.primary.translate])
  })

  it('a burst of changes asks once at a time: one ask out, at most one waiting, and the last one\'s answer is the words', async () => {
    const { decide, answers } = held()
    const words = createToggleWords({ decide, changed: () => undefined })
    words.follow('on')
    // a colour dragged in the settings: a write per input, each a change of the settings
    for (let i = 0; i < 5; i++) words.refresh()
    await settle()
    expect(decide).toHaveBeenCalledTimes(1)
    // the first ask's answer was asked before the writes: superseded, dropped, and the waiting ask goes out
    answers[0]!(decision('retranslate'))
    await settle()
    expect([decide.mock.calls.length, words.label(S, true)]).toEqual([2, S.primary.restore])
    answers[1]!(decision('retranslate'))
    await settle()
    expect([decide.mock.calls.length, words.label(S, true)]).toEqual([2, S.primary.retranslate])
  })

  it('a decide that throws at once — the extension reloaded under the page — fails into the words without an answer, and throws nothing into the page', async () => {
    const words = createToggleWords({ decide: () => { throw new Error('Extension context invalidated.') }, changed: () => undefined })
    expect(() => words.follow('on')).not.toThrow()
    await settle()
    expect(words.label(S, true)).toBe(S.primary.restore)
  })

  it('no decision — a page that did not answer, a failed ask, a background of an earlier build — leaves the words by whether the page is on', async () => {
    for (const decide of [async () => null, async () => undefined, async (): Promise<Decision> => { throw new Error('no answer') }]) {
      const words = createToggleWords({ decide, changed: () => undefined })
      words.follow('on')
      await settle()
      expect([words.label(S, true), words.label(S, false)]).toEqual([S.primary.restore, S.primary.translate])
    }
  })

  it('a write of the settings asks again only when it moves a field the decision reads — a colour dragged, a display switched ask nothing; the service, the language, the fallback ask (Part 7\'s final review, C-M1)', async () => {
    const decide = vi.fn(async () => decision('restore'))
    const words = createToggleWords({ decide, changed: () => undefined })
    words.follow('on')
    await settle()
    const asks = () => decide.mock.calls.length
    expect(asks()).toBe(1)
    // a drag on the settings page's colour: a write a frame, two seconds of them, and a display switch among them
    let config: Config = DEFAULT_CONFIG
    for (let i = 0; i < 120; i++) {
      const next: Config = { ...config, appearance: { ...config.appearance, activeStyle: `style-${i}` }, mode: i % 2 ? 'side' : 'stack' }
      words.configChanged(next, config)
      config = next
      await settle()
    }
    expect(asks()).toBe(1)
    // the fields the chain is built from (config/revision.ts CHAIN_CONFIG_FIELDS), each one ask
    for (const next of [{ ...config, provider: 'google-web' }, { ...config, targetLanguage: 'jpn' as const }, { ...config, fallback: { enabled: false } }]) {
      const before = asks()
      words.configChanged(next, config)
      await settle()
      expect(asks(), JSON.stringify(Object.keys(next))).toBe(before + 1)
    }
    // a value before the write that did not parse (a migration's own write) is no evidence the chain stayed: asked
    words.configChanged(config, null)
    await settle()
    expect(asks()).toBe(5)
    // a page that is not running asks nothing, whatever moved (its press does not depend on the settings)
    words.follow('idle')
    words.configChanged({ ...config, provider: 'microsoft' }, config)
    await settle()
    expect(asks()).toBe(5)
  })

  it('a page brought back from the back/forward cache asks again while it runs: what the decision reads may have moved while it was frozen, and no watcher said so (Part 7\'s final review, C-U)', async () => {
    const pageshow = (persisted: boolean) => Object.defineProperty(new Event('pageshow'), 'persisted', { value: persisted })
    let answer = decision('restore')
    const decide = vi.fn(async () => answer)
    const words = createToggleWords({ decide, changed: () => undefined })
    const win = new EventTarget() as unknown as Window
    askAgainOnRestore(words, win)
    words.follow('on')
    await settle()
    expect([decide.mock.calls.length, words.label(S, true)]).toEqual([1, S.primary.restore])
    // left for another page, the service changed there, and back: the page as it was, its words the old decision's
    answer = decision('retranslate')
    win.dispatchEvent(pageshow(false))
    await settle()
    expect(decide.mock.calls.length).toBe(1)
    win.dispatchEvent(pageshow(true))
    await settle()
    expect([decide.mock.calls.length, words.label(S, true)]).toEqual([2, S.primary.retranslate])
    // an idle page's press translates whatever moved: nothing to ask
    words.follow('idle')
    win.dispatchEvent(pageshow(true))
    await settle()
    expect(decide.mock.calls.length).toBe(2)
  })
})
