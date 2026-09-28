import { describe, expect, it, vi } from 'vitest'
import { createToggleWords } from '@/entrypoints/content/toggle-words'
import { LOCALES } from '@/locales'
import type { PageAction } from '@/shared/page-action'

// The floating button's words on the full text (UI.md S-I-06): what its press does, as the toggle decides it
// (background/context-menu.ts `decideToggle`), in the words the popup's primary button says for that decision — every
// press, the retranslate cue (P6b), a page behind its settings (P13) and a paused page (P9) included

const { S } = LOCALES.en
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const decision = (action: PageAction, enabled = true) => ({ action, behind: action === 'retranslate', enabled })

describe('createToggleWords', () => {
  it('a running page says what its press does: the retranslate cue\'s and a page behind its settings\' retranslate, anywhere else the restore', async () => {
    let answer = decision('retranslate')
    const changed = vi.fn()
    const words = createToggleWords({ decide: async () => answer, changed })
    words.follow(true)
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
    // the settings put back, the key refused again: the decision restores, and so do the words
    answer = decision('restore')
    words.refresh()
    await settle()
    expect(words.label(S, true)).toBe(S.primary.restore)
    // an answer that moved nothing redraws nothing
    const drawn = changed.mock.calls.length
    words.refresh()
    await settle()
    expect(changed).toHaveBeenCalledTimes(drawn)
  })

  it('a page behind settings that cannot run says what the popup\'s primary says there — retranslate, which that button offers disabled — while its press opens the panel (P13)', async () => {
    const words = createToggleWords({ decide: async () => decision('retranslate', false), changed: () => undefined })
    words.follow(true)
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
  })

  it('a paused page says its press retries, as the popup\'s primary does (P9), and an idle one that it translates: every state asks', async () => {
    const decide = vi.fn(async () => decision('retranslate'))
    const words = createToggleWords({ decide, changed: () => undefined })
    words.follow(false)
    await settle()
    expect([decide.mock.calls.length, words.label(S, false)]).toEqual([1, S.primary.retranslate])
    decide.mockImplementation(async () => decision('translate'))
    words.follow(false)
    await settle()
    expect([decide.mock.calls.length, words.label(S, false)]).toEqual([2, S.primary.translate])
  })

  it('a change of state drops the decision made on the state before at once, and asks again; the settings and the record move a running page\'s alone', async () => {
    let answer!: (d: ReturnType<typeof decision>) => void
    const decide = vi.fn(() => new Promise<ReturnType<typeof decision>>(resolve => { answer = resolve }))
    const words = createToggleWords({ decide, changed: () => undefined })
    words.follow(true)
    answer(decision('retranslate'))
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
    // restored: until the answer comes, the words of a page that is not on — never the running page's retranslate
    words.follow(false)
    expect(words.label(S, false)).toBe(S.primary.translate)
    answer(decision('translate'))
    await settle()
    // a settings change on a page that is not running asks nothing
    words.refresh()
    expect(decide).toHaveBeenCalledTimes(2)
  })

  it('only the newest ask is believed: an earlier answer arriving last does not put its words back', async () => {
    const answers: ((d: ReturnType<typeof decision>) => void)[] = []
    const words = createToggleWords({ decide: () => new Promise(resolve => { answers.push(resolve) }), changed: () => undefined })
    words.follow(true)
    words.refresh()
    answers[1]!(decision('retranslate'))
    await settle()
    answers[0]!(decision('restore'))
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
  })

  it('no decision — a page that did not answer, a failed ask, a background of an earlier build — leaves the words by whether the page is on', async () => {
    for (const decide of [async () => null, async () => undefined, async (): Promise<ReturnType<typeof decision>> => { throw new Error('no answer') }]) {
      const words = createToggleWords({ decide, changed: () => undefined })
      words.follow(true)
      await settle()
      expect([words.label(S, true), words.label(S, false)]).toEqual([S.primary.restore, S.primary.translate])
    }
  })
})
