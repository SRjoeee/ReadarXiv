import { describe, expect, it, vi } from 'vitest'
import { createToggleWords } from '@/entrypoints/content/toggle-words'
import { LOCALES } from '@/locales'
import type { PageDecision } from '@/shared/page-action'

// The floating button's words on the full text (UI.md S-I-06): what its press does, as the toggle decides it
// (background/context-menu.ts `decideToggle`) — the popup's "Translate again" (S-P-52) where the retranslate cue holds
// (P6b), and otherwise the words they always were

const { S } = LOCALES.en
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const decision = (cued: boolean): PageDecision => ({ action: cued ? 'retranslate' : 'restore', behind: false, cued, enabled: true })

describe('createToggleWords', () => {
  it('in P6b the main button says what its press does — the popup\'s retranslate — and anywhere else what it said', async () => {
    let answer: PageDecision | null = decision(true)
    const changed = vi.fn()
    const words = createToggleWords({ decide: async () => answer, changed })
    expect(words.label(S, false)).toBe(S.primary.translate)
    words.follow(true)
    await settle()
    expect([words.label(S, true), changed.mock.calls.length]).toEqual([S.primary.retranslate, 1])
    // the key made good no longer (the record, the settings): back to the running page's words
    answer = decision(false)
    words.refresh()
    await settle()
    expect([words.label(S, true), changed.mock.calls.length]).toEqual([S.primary.restore, 2])
    // an answer that moved nothing redraws nothing
    words.refresh()
    await settle()
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('an idle page asks nothing, and a page that stops showing its translation drops the cue at once — an answer still on its way included', async () => {
    const decide = vi.fn(async () => decision(true))
    const words = createToggleWords({ decide, changed: () => undefined })
    words.refresh()
    words.follow(false)
    expect(decide).not.toHaveBeenCalled()
    words.follow(true)
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
    words.refresh()
    words.follow(false)
    await settle()
    // on again, and the first thing it shows is a running page's words until the decision says otherwise
    let answer!: (d: PageDecision) => void
    decide.mockImplementationOnce(() => new Promise(resolve => { answer = resolve }))
    words.follow(true)
    expect(words.label(S, true)).toBe(S.primary.restore)
    answer(decision(true))
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
  })

  it('only the newest ask is believed: an earlier answer arriving last does not put its words back', async () => {
    const answers: ((d: PageDecision) => void)[] = []
    const words = createToggleWords({ decide: () => new Promise(resolve => { answers.push(resolve) }), changed: () => undefined })
    words.follow(true)
    words.refresh()
    answers[1]!(decision(true))
    await settle()
    answers[0]!(decision(false))
    await settle()
    expect(words.label(S, true)).toBe(S.primary.retranslate)
  })

  it('no decision — a page that did not answer, a failed ask, a background of an earlier build — is no cue: a running page\'s words', async () => {
    for (const decide of [async () => null, async () => undefined, async (): Promise<PageDecision> => { throw new Error('no answer') }]) {
      const words = createToggleWords({ decide, changed: () => undefined })
      words.follow(true)
      await settle()
      expect(words.label(S, true)).toBe(S.primary.restore)
    }
  })
})
