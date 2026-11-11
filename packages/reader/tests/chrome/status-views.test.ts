import { Check, CircleAlert, Clock, Info, Loader } from 'lucide'
import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { O, R, S, setLocale } from '@readarxiv/ui'
import { FailureCard } from '../../src/chrome/FailureCard.tsx'
import type { Parts } from '../../src/chrome/parts.tsx'
import { StatusCapsule } from '../../src/chrome/StatusCapsule.tsx'
import type { ReaderController } from '../../src/chrome/model.ts'
import { stubPopovers } from '../popover-stub.ts'
import { mountElement } from '../render-hook.ts'
import { fakeController, PREFS } from './fake-controller.ts'
import { NAMES, TEST_PARTS, withParts } from './parts.ts'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => {
  restore = stubPopovers()
})
afterEach(() => {
  restore()
  document.body.innerHTML = ''
})

/** where the host's settings are, which the capsule's note of unreadable ones links to (parts.tsx settingsHref) */
const SETTINGS = `${location.origin}/options.html#reading/pdf`
const capsuleOf = (controller: ReaderController, over: Partial<Parts> = {}) =>
  withParts(createElement(StatusCapsule, { controller, onChooseLanguage: () => {} }), {
    settingsHref: SETTINGS,
    ...over,
  })
const cardOf = (controller: ReaderController, of?: 'pane' | 'page', over: Partial<Parts> = {}) =>
  withParts(createElement(FailureCard, { controller, ...(of ? { of } : {}) }), over)

describe("the capsule and the card (the reader's design, §6.6)", () => {
  it('the capsule is a status region from the first paint, its words changing in it', async () => {
    const fake = fakeController({ phase: 'ready' })
    const { container } = await mountElement(capsuleOf(fake.controller))
    const region = container.querySelector('[role="status"]')!
    expect(region.textContent).toBe('')
    await act(async () => fake.set({ phase: 'translating', progress: 0.5 }))
    // said, not shown: the line under the toolbar shows a translation under way (the maintainer, 2026-09-25)
    expect([region.textContent, container.querySelector('.capsule')]).toEqual(['正在翻译', null])
  })

  it("the card's reason is said in the status region, as the card takes no focus (the final review)", async () => {
    const fake = fakeController({ phase: 'loading' })
    const { container } = await mountElement(capsuleOf(fake.controller))
    const region = container.querySelector('[role="status"]')!
    await act(async () => fake.set({ phase: 'failed', failure: 'network' }))
    expect(region.textContent).toContain('网络连接失败')
  })

  it("a notice's 重试 retries, and its close is remembered for the visit unless more passages fail", async () => {
    const fake = fakeController({ phase: 'ready', failedUnits: 2, failure: 'network' })
    const { container } = await mountElement(capsuleOf(fake.controller))
    container.querySelector<HTMLElement>('button[data-action]')!.click()
    expect(fake.controller.retry).toHaveBeenCalledOnce()
    await act(async () => container.querySelector<HTMLElement>('button[aria-label="关闭"]')!.click())
    // (the count falls as a retry brings passages: closed it stays)
    await act(async () => fake.set({ failedUnits: 1 }))
    // past the closed notice's 160 ms way out
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    expect(container.querySelector('[role="status"]')!.textContent).not.toContain('翻译失败')
    // (more fail than were closed: told again)
    await act(async () => fake.set({ failedUnits: 3 }))
    expect(container.querySelector('[role="status"]')!.textContent).toContain('3 处翻译失败')
  })

  it("a notice's close is named in a tooltip, above it: the capsule stands near the foot of the page (P3-M11)", async () => {
    const fake = fakeController({ phase: 'ready', failedUnits: 2, failure: 'network' })
    const { container } = await mountElement(capsuleOf(fake.controller))
    const close = container.querySelector<HTMLElement>(`.capsule button[aria-label="${R.status.close}"]`)!
    const tip = close.nextElementSibling!
    expect([tip.matches('.tip[popover]'), tip.textContent, tip.getAttribute('data-side')]).toEqual([
      true,
      R.status.close,
      'top',
    ])
  })

  it('a notice of passages no retry can mend has no retry, and closes (I-5 of 2026-10-04)', async () => {
    const fake = fakeController({ phase: 'ready', failedUnits: 1, failure: null })
    const { container } = await mountElement(capsuleOf(fake.controller))
    const capsule = container.querySelector('.capsule[data-kind="notice"]')!
    expect(capsule.textContent).toContain(S.failed.text(1))
    expect([capsule.querySelector('[data-action]'), capsule.textContent?.includes(S.failed.retry)]).toEqual([
      null,
      false,
    ])
    await act(async () => capsule.querySelector<HTMLElement>(`button[aria-label="${R.status.close}"]`)!.click())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    expect(container.querySelector('.capsule')).toBeNull()
  })

  it('the bilingual version not to be had now: its words, its retry and the link to the HTML version, and no close (the layer-only plan\'s "Offline, drafted")', async () => {
    const fake = fakeController({
      phase: 'ready',
      unavailable: { why: 'unreachable', retryAt: null },
      htmlVersion: 'https://arxiv.org/html/x#readarxiv',
    })
    const { container } = await mountElement(capsuleOf(fake.controller))
    const capsule = container.querySelector('.capsule[data-kind="notNow"]')!
    expect(capsule.textContent).toContain(R.status.notNow)
    expect(capsule.querySelector('a[data-action]')?.getAttribute('href')).toBe('https://arxiv.org/html/x#readarxiv')
    expect(capsule.querySelector('a[data-action]')?.textContent).toBe(R.status.useHtml)
    expect(capsule.querySelector(`button[aria-label="${R.status.close}"]`)).toBeNull()
    await act(async () => capsule.querySelector<HTMLElement>('button[data-action]')!.click())
    expect(fake.controller.retry).toHaveBeenCalledTimes(1)
  })

  describe("the narrow window's words: 5 s of being read, waiting while the pointer is over them or they hold the focus (the maintainer, 2026-10-01)", () => {
    afterEach(() => {
      vi.useRealTimers()
    })
    /** the capsule mounted reading, the clock faked, then the window made narrow */
    async function narrow() {
      const fake = fakeController({ phase: 'ready', display: 'bilingual' })
      const { container } = await mountElement(capsuleOf(fake.controller))
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      await act(async () => fake.set({ narrow: true }))
      const capsule = () => container.querySelector<HTMLElement>('.capsule[data-kind="narrow"]:not([data-out])')
      const wait = (ms: number) =>
        act(async () => {
          vi.advanceTimersByTime(ms)
        })
      // React reads enter and leave off over and out, and focus and blur off focusin and focusout
      const fire = (type: string) =>
        act(async () => {
          capsule()!.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: document.body }))
        })
      const focus = (type: 'focusin' | 'focusout') =>
        act(async () => {
          capsule()!.dispatchEvent(new FocusEvent(type, { bubbles: true, relatedTarget: null }))
        })
      return { capsule, wait, fire, focus }
    }

    it('leaves after 5 s', async () => {
      const { capsule, wait } = await narrow()
      // drawn in the words' cell, and told whole in the line the group is named by
      expect([
        capsule()?.querySelector('.words')?.textContent,
        capsule()?.querySelector('.sr-only')?.textContent,
      ]).toEqual([R.status.narrow, R.status.narrow])
      await wait(4999)
      expect(capsule()).not.toBeNull()
      await wait(1)
      expect(capsule()).toBeNull()
    })

    it('waits while the pointer is over it, and runs out the rest once the pointer leaves', async () => {
      const { capsule, wait, fire } = await narrow()
      await wait(3000)
      await fire('pointerover')
      await wait(10000)
      expect(capsule()).not.toBeNull()
      await fire('pointerout')
      await wait(1999)
      expect(capsule()).not.toBeNull()
      await wait(1)
      expect(capsule()).toBeNull()
    })

    it("is reached by Tab while it is shown, named by its words, and a keyboard's focus holds it as the pointer does (Codex and Devin on #307)", async () => {
      const { capsule, wait } = await narrow()
      const el = capsule()!
      // in the tab order, as a group its words name; no other capsule is a stop of its own (theirs are their actions)
      expect([
        el.tabIndex,
        el.getAttribute('role'),
        document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent,
      ]).toEqual([0, 'group', R.status.narrow])
      await wait(3000)
      await act(async () => {
        el.focus()
      })
      expect(document.activeElement).toBe(el)
      await wait(10000)
      expect(capsule()).not.toBeNull()
      await act(async () => {
        el.blur()
      })
      await wait(1999)
      expect(capsule()).not.toBeNull()
      await wait(1)
      expect(capsule()).toBeNull()
      // on its way out it is no stop
      const out = document.querySelector('.capsule[data-kind="narrow"][data-out]')
      expect([out !== null, out?.hasAttribute('tabindex')]).toEqual([true, false])
    })

    it('waits while it holds the focus, and runs out the rest once the focus goes', async () => {
      const { capsule, wait, focus } = await narrow()
      await wait(3000)
      await focus('focusin')
      await wait(10000)
      expect(capsule()).not.toBeNull()
      await focus('focusout')
      await wait(1999)
      expect(capsule()).not.toBeNull()
      await wait(1)
      expect(capsule()).toBeNull()
    })
  })

  it('settings that could not be read: the note stays while it is so, with the way to the settings page; no close (S-R-21)', async () => {
    const fake = fakeController({ phase: 'loading', settingsUnreadable: true })
    const { container } = await mountElement(capsuleOf(fake.controller))
    const capsule = () => container.querySelector<HTMLElement>('.capsule[data-kind="unreadable"]:not([data-out])')
    const link = () => capsule()?.querySelector<HTMLAnchorElement>('a[data-action]')
    expect([
      capsule()?.querySelector('.sr-only')?.textContent,
      link()?.textContent,
      link()?.getAttribute('href'),
      link()?.target,
      capsule()?.querySelector('.close'),
    ]).toEqual([R.status.unreadable, S.settings, SETTINGS, '_blank', null])
    // not a stop of its own: reached by its link, as the capsule that cannot be had is
    expect(capsule()!.hasAttribute('tabindex')).toBe(false)
    await act(async () => fake.set({ settingsUnreadable: false }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    expect(container.querySelector('.capsule')).toBeNull()
  })

  it('settings that could not be read, for a host that names no place for them: the note alone, with no link (parts.tsx settingsHref)', async () => {
    const fake = fakeController({ phase: 'ready', settingsUnreadable: true })
    const { container } = await mountElement(capsuleOf(fake.controller, { settingsHref: null }))
    const capsule = container.querySelector<HTMLElement>('.capsule[data-kind="unreadable"]')!
    expect([
      capsule.querySelector('.sr-only')?.textContent,
      capsule.querySelector('a[data-action]'),
      capsule.querySelector('.close'),
    ]).toEqual([R.status.unreadable, null, null])
  })

  describe("a write storage refused: the settings page's sentence, an error that stays until it is closed or a later write lands (S-R-22)", () => {
    async function refused() {
      const fake = fakeController({ phase: 'ready' })
      const { container } = await mountElement(capsuleOf(fake.controller))
      const refuse = () => act(async () => fake.set({ refusals: fake.controller.getState().refusals + 1 }))
      await refuse()
      const capsule = () => container.querySelector<HTMLElement>('.capsule[data-kind="saveFailed"]:not([data-out])')
      const gone = () =>
        act(async () => {
          await new Promise((r) => setTimeout(r, 220))
        })
      return { capsule, fake, refuse, gone, container }
    }

    it('says the one sentence, in a line of its own for a screen reader, with a close; it does not leave by itself', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true })
      try {
        const { capsule } = await refused()
        expect([
          capsule()?.querySelector('.words')?.textContent,
          capsule()?.querySelector('.sr-only')?.textContent,
          capsule()?.querySelector(`button[aria-label="${R.status.close}"]`) !== null,
          capsule()?.hasAttribute('tabindex'),
        ]).toEqual([O.saveFailed, O.saveFailed, true, false])
        await act(async () => {
          vi.advanceTimersByTime(60000)
        })
        expect(capsule()).not.toBeNull()
      } finally {
        vi.useRealTimers()
      }
    })

    it('closed, it is not told again for the refusal it told, and is told for the next', async () => {
      const { capsule, refuse, gone, container } = await refused()
      await act(async () => capsule()!.querySelector<HTMLElement>(`button[aria-label="${R.status.close}"]`)!.click())
      await gone()
      expect(container.querySelector('.capsule')).toBeNull()
      await refuse()
      expect(capsule()).not.toBeNull()
    })

    it('a later write that lands mends it: the capsule goes with no word of its own, and a refusal after is told again', async () => {
      const { capsule, fake, refuse, gone, container } = await refused()
      // the settings landing is the proof that storage takes a write (controller.ts reduce)
      await act(async () => fake.set({ mended: fake.controller.getState().refusals }))
      await gone()
      expect(container.querySelector('.capsule')).toBeNull()
      await refuse()
      expect(capsule()).not.toBeNull()
    })
  })

  it('an address with no paper and unreadable settings: the note and its link stand beside the card, and the controls it explains keep their reason (Devin on #329)', async () => {
    const fake = fakeController({ phase: 'ready', noPaper: true, available: false, settingsUnreadable: true })
    const { container } = await mountElement(
      createElement('div', null, cardOf(fake.controller, 'page'), capsuleOf(fake.controller)),
    )
    expect(container.querySelector('.card p')?.textContent).toBe(R.status.noPaper)
    const note = container.querySelector('.capsule[data-kind="unreadable"]:not([data-out])')
    expect([
      note?.querySelector('.sr-only')?.textContent,
      note?.querySelector('a[data-action]')?.textContent,
      note?.querySelector('.close'),
    ]).toEqual([R.status.unreadable, S.settings, null])
    // the settings read at last: the note goes, the card stays
    await act(async () => fake.set({ settingsUnreadable: false }))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 220))
    })
    expect([container.querySelector('.capsule'), container.querySelector('.card')?.nodeName]).toEqual([null, 'DIV'])
  })

  it('a paper that cannot be had: the sentence, and its HTML version a link opened where the settings say; no close (the maintainer, 2026-09-26)', async () => {
    const href = 'https://arxiv.org/html/2608.02163#readarxiv'
    const fake = fakeController({ phase: 'ready', available: false, htmlVersion: href })
    const { container } = await mountElement(capsuleOf(fake.controller))
    const link = () => container.querySelector<HTMLAnchorElement>('.capsule a[data-action]')
    expect([
      container.querySelector('.capsule .words')?.textContent,
      link()?.textContent,
      link()?.getAttribute('href'),
      link()?.target,
      link()?.rel,
    ]).toEqual(['这篇论文暂不支持 PDF 翻译', '改用 HTML 翻译', href, '_blank', 'noopener'])
    expect(container.querySelector('.capsule .close')).toBeNull()
    expect(container.querySelector('.capsule')!.hasAttribute('data-alone')).toBe(false)
    // reached by its link, not a stop of its own: only the capsule that leaves by itself is one
    expect(container.querySelector('.capsule')!.hasAttribute('tabindex')).toBe(false)
    // this tab: the reader's own, or the PDF page it lies over
    await act(async () => fake.set({ prefs: { ...PREFS, links: 'same-tab' } }))
    expect(link()?.target).toBe('_top')
    await act(async () => fake.set({ htmlVersion: null }))
    expect([container.querySelector('.capsule .words')?.textContent, link()]).toEqual([
      '这篇论文暂不支持 PDF 翻译',
      null,
    ])
    // words alone: the capsule's end padded as the start is, with no chip there to fill it (reader.css)
    expect(container.querySelector('.capsule')!.hasAttribute('data-alone')).toBe(true)
  })

  it('a language the reader cannot typeset: its own name told to a screen reader in its own language, as it is drawn (Codex and Devin on #317)', async () => {
    const fake = fakeController({ phase: 'ready', languageSupported: false, prefs: { ...PREFS, target: 'ja' } })
    const { container } = await mountElement(capsuleOf(fake.controller))
    const told = container.querySelector('.capsule[data-kind="unsupported"] .sr-only')!
    expect([told.textContent, told.querySelector('[lang="ja"]')?.textContent]).toEqual([
      R.status.unsupported(NAMES.ja!),
      NAMES.ja,
    ])
  })

  it('an address with no paper: the card says so and links to arXiv, in this tab or a new one as the settings say; the status region says it too (D1)', async () => {
    const fake = fakeController({ phase: 'ready', noPaper: true, available: false })
    const { container } = await mountElement(cardOf(fake.controller, 'page'))
    const link = () => container.querySelector<HTMLAnchorElement>('.card a')
    expect([
      container.querySelector('.card p')?.textContent,
      link()?.textContent,
      link()?.getAttribute('href'),
      link()?.target,
      link()?.rel,
      container.querySelector('.card button'),
    ]).toEqual([R.status.noPaper, R.status.goToArxiv, 'https://arxiv.org/', '_blank', 'noopener', null])
    await act(async () => fake.set({ prefs: { ...PREFS, links: 'same-tab' } }))
    expect(link()?.target).toBe('_top')
    // a card of the pane is not this one, and this one is not the pane's
    const pane = await mountElement(cardOf(fake.controller, 'pane'))
    expect(pane.container.querySelector('.card')).toBeNull()
    const region = await mountElement(capsuleOf(fake.controller))
    expect(region.container.querySelector('[role="status"]')!.textContent).toContain(R.status.noPaper)
  })

  it('the card says the reason and offers what can be done, never taking the focus', async () => {
    const fake = fakeController({ phase: 'failed', failure: 'network' })
    const before = document.activeElement
    const { container } = await mountElement(cardOf(fake.controller))
    expect(container.textContent).toContain('网络连接失败')
    container.querySelector<HTMLElement>('button')!.click()
    expect(fake.controller.retry).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(before)
  })

  it("a failure a key settles: the card's action is the host's, under its reason (the extension's settings: host-slots.test.ts); none where it gives none", async () => {
    const fake = fakeController({ phase: 'failed', failure: 'no-key' })
    const settings = (action: 'settings') =>
      createElement('button', { type: 'button', 'data-host': action }, S.settings)
    const { container } = await mountElement(
      cardOf(fake.controller, 'pane', { slots: { card: settings }, reason: (kind) => `host:${kind}` }),
    )
    expect([
      container.querySelector('.card p')?.textContent,
      container.querySelector('.card button')?.getAttribute('data-host'),
    ]).toEqual(['host:no-key', 'settings'])
    container.querySelector<HTMLElement>('.card button')!.click()
    expect(fake.controller.retry).not.toHaveBeenCalled()
    const bare = await mountElement(cardOf(fake.controller, 'pane', { slots: {} }))
    expect([bare.container.querySelector('.card') !== null, bare.container.querySelector('.card button')]).toEqual([
      true,
      null,
    ])
  })
})

describe("a host's toast in the capsule's place", () => {
  /** an icon as drawn, by its shapes' attributes */
  const signOf = (node: typeof Check) => JSON.stringify(node.map(([, a]) => a))
  const drawn = (el: Element) =>
    JSON.stringify(
      [...(el.querySelector('svg')?.children ?? [])].map((x) =>
        Object.fromEntries([...x.attributes].filter((a) => a.name !== 'key').map((a) => [a.name, a.value])),
      ),
    )
  it('its words alone, the check for something done, the information sign else; said in the status region; gone with it', async () => {
    const fake = fakeController({ phase: 'ready' })
    const { container } = await mountElement(capsuleOf(fake.controller))
    await act(async () => fake.set({ toast: { words: 'Link copied', icon: 'check' } }))
    const capsule = container.querySelector('.capsule')!
    expect([
      capsule.getAttribute('data-kind'),
      capsule.hasAttribute('data-alone'),
      capsule.querySelector('.after'),
      drawn(capsule),
      // (said in the status region, in the capsule's line for screen readers; its drawn words hidden from them)
      capsule.querySelector('.sr-only')?.textContent,
    ]).toEqual(['toast', true, null, signOf(Check), 'Link copied'])
    await act(async () => fake.set({ toast: { words: 'Something went wrong', icon: 'info' } }))
    expect(drawn(container.querySelector('.capsule')!)).toBe(signOf(Info))
    await act(async () => fake.set({ toast: null }))
    await act(async () => new Promise((r) => setTimeout(r, 200)))
    expect(container.querySelector('.capsule')).toBeNull()
  })
})

describe("a run under way in a host's words (the website's stage and count)", () => {
  it('the capsule with the spinner, alone; its stage said once with the count it starts at, the count that moves not said again; none without them', async () => {
    const translating = (got: number) => ({
      phase: 'translating' as const,
      progress: got / 10,
      translated: { got, total: 10 },
    })
    const fake = fakeController({ phase: 'ready' })
    const words = { translating: (got: number, total: number) => `${got} / ${total}`, reconnecting: 'reconnecting' }
    const { container } = await mountElement(capsuleOf(fake.controller, { words }))
    await act(async () => fake.set(translating(3)))
    const capsule = () => container.querySelector('.capsule:not([data-out])')
    const line = () => capsule()?.querySelector('.sr-only')?.textContent
    const sign = JSON.stringify(Loader.map(([, a]) => a))
    const drawnSign = () =>
      JSON.stringify(
        [...(capsule()?.querySelector('svg')?.children ?? [])].map((x) =>
          Object.fromEntries([...x.attributes].map((a) => [a.name, a.value])),
        ),
      )
    expect([capsule()?.getAttribute('data-kind'), capsule()?.hasAttribute('data-alone'), drawnSign(), line()]).toEqual([
      'progress',
      true,
      sign,
      '3 / 10',
    ])
    // (the status region says the run in the capsule's own line alone: no second line of it)
    expect([...container.querySelectorAll('[role="status"] > .sr-only')].length).toBe(0)
    await act(async () => fake.set(translating(4)))
    expect(line()).toBe('3 / 10')
    await act(async () => fake.set({ reconnecting: true }))
    expect(line()).toBe('reconnecting')
    // (none: the progress line alone, its words said in the region)
    const bare = fakeController({ phase: 'ready' })
    const none = await mountElement(capsuleOf(bare.controller))
    await act(async () => bare.set(translating(3)))
    expect([
      none.container.querySelector('.capsule'),
      none.container.querySelector('[role="status"]')!.textContent,
    ]).toEqual([null, R.status.translating])
  })
})

describe("the narrow window's words under the host's rule", () => {
  const pages = { left: { page: 1, pages: 4 }, right: { page: 1, pages: 4 } }
  const narrowCapsule = (c: HTMLElement) => c.querySelector('.capsule[data-kind="narrow"]:not([data-out])')
  it("the extension's (the default): said as the window is narrow, a page opened narrow too", async () => {
    const fake = fakeController({ phase: 'ready', display: 'bilingual', narrow: true, sides: pages })
    const { container } = await mountElement(capsuleOf(fake.controller))
    expect(narrowCapsule(container)).not.toBeNull()
  })
  it("the website's: nothing for a page opened narrow, nor widened; said once a window that showed both sides is narrowed while reading", async () => {
    const opened = fakeController({ phase: 'ready', display: 'bilingual', narrow: true, sides: pages })
    const a = await mountElement(capsuleOf(opened.controller, { narrow: 'shown' }))
    expect(narrowCapsule(a.container)).toBeNull()
    await act(async () => opened.set({ narrow: false }))
    expect(narrowCapsule(a.container)).toBeNull()
    await act(async () => opened.set({ narrow: true }))
    expect(narrowCapsule(a.container)).not.toBeNull()
    // (wide before any page was drawn: not read side by side, so nothing owed)
    const early = fakeController({ phase: 'loading', display: 'bilingual', narrow: false })
    const b = await mountElement(capsuleOf(early.controller, { narrow: 'shown' }))
    await act(async () => early.set({ phase: 'ready', narrow: true, sides: pages }))
    expect(narrowCapsule(b.container)).toBeNull()
  })
})

describe("the signs by the host's rule (parts.tsx `signs`; L11's second round, gap 1)", () => {
  const signOf = (node: typeof Check) => JSON.stringify(node.map(([, a]) => a))
  const drawn = (el: Element) =>
    JSON.stringify(
      [...(el.querySelector(':scope > svg')?.children ?? [])].map((x) =>
        Object.fromEntries([...x.attributes].filter((a) => a.name !== 'key').map((a) => [a.name, a.value])),
      ),
    )
  const later = () => Date.now() + 3_600_000
  it("the extension's (the default): the information sign for a refusal for now, with or without a time; the alert on every card, with no tone", async () => {
    const fake = fakeController({ phase: 'ready', unavailable: { why: 'refused', retryAt: later() } })
    const { container } = await mountElement(capsuleOf(fake.controller))
    const capsule = container.querySelector('.capsule')!
    expect([drawn(capsule), capsule.getAttribute('data-tone')]).toEqual([signOf(Info), null])
    document.body.innerHTML = ''
    const card = await mountElement(cardOf(fakeController({ phase: 'failed', failure: 'network' }).controller))
    const el = card.container.querySelector('.card')!
    expect([drawn(el), el.getAttribute('data-tone')]).toEqual([signOf(CircleAlert), null])
  })
  it("the website's: a clock while a refusal's time is to come, the information sign once it has come (drawn again at the time)", async () => {
    const fake = fakeController({ phase: 'ready' })
    const { container } = await mountElement(capsuleOf(fake.controller, { signs: 'by-state' }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      await act(async () => fake.set({ unavailable: { why: 'busy', retryAt: Date.now() + 60_000 } }))
      expect(drawn(container.querySelector('.capsule')!)).toBe(signOf(Clock))
      await act(async () => vi.advanceTimersByTime(59_999))
      expect(drawn(container.querySelector('.capsule')!)).toBe(signOf(Clock))
      await act(async () => vi.advanceTimersByTime(1))
      expect(drawn(container.querySelector('.capsule')!)).toBe(signOf(Info))
      // (none named: nothing to wait for)
      await act(async () => fake.set({ unavailable: { why: 'unreachable', retryAt: null } }))
      expect(drawn(container.querySelector('.capsule')!)).toBe(signOf(Info))
    } finally {
      vi.useRealTimers()
    }
  })
  it("the website's: a run stopped by a fault, the alert in the danger's tone; one stopped by a wait, the information sign", async () => {
    const fault = fakeController({ phase: 'ready', failedUnits: 2, failure: 'bad-request' })
    const a = await mountElement(capsuleOf(fault.controller, { signs: 'by-state' }))
    const capsule = a.container.querySelector('.capsule')!
    expect([drawn(capsule), capsule.getAttribute('data-tone')]).toEqual([signOf(CircleAlert), 'alert'])
    document.body.innerHTML = ''
    const wait = fakeController({ phase: 'ready', failedUnits: 2, failure: 'network' })
    const b = await mountElement(capsuleOf(wait.controller, { signs: 'by-state' }))
    expect(drawn(b.container.querySelector('.capsule')!)).toBe(signOf(Info))
  })
  it("the website's cards: a wait (out of reach) a clock in quiet ink; a fault the alert in the danger's", async () => {
    const tones = []
    for (const failure of ['network', 'unknown'] as const) {
      const { container } = await mountElement(
        cardOf(fakeController({ phase: 'failed', failure }).controller, 'pane', { signs: 'by-state' }),
      )
      const el = container.querySelector('.card')!
      tones.push([drawn(el), el.getAttribute('data-tone')])
      document.body.innerHTML = ''
    }
    expect(tones).toEqual([
      [signOf(Clock), 'wait'],
      [signOf(CircleAlert), 'alert'],
    ])
  })
})

describe("a retry offered at its time by the host's rule (parts.tsx `retry`; L11's second round, gap 2)", () => {
  const chip = (c: HTMLElement) => c.querySelector<HTMLElement>('.capsule button[data-action]')
  it("the extension's (the default): a refusal for now's retry at once, its time to come or not", async () => {
    const fake = fakeController({ phase: 'ready', unavailable: { why: 'refused', retryAt: Date.now() + 3_600_000 } })
    const { container } = await mountElement(capsuleOf(fake.controller))
    expect(chip(container)?.textContent).toBe(S.failed.retry)
  })
  it("the website's: no chip until the time has come, the words alone; then the chip, the host's words asked again without the time", async () => {
    const fake = fakeController({ phase: 'ready' })
    const words = { busy: (at: number | null) => (at !== null && Date.now() < at ? 'busy until later' : 'busy') }
    const { container } = await mountElement(capsuleOf(fake.controller, { retry: 'when-due', words }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      await act(async () => fake.set({ unavailable: { why: 'busy', retryAt: Date.now() + 90_000 } }))
      const capsule = container.querySelector('.capsule')!
      expect([
        chip(container),
        capsule.hasAttribute('data-alone'),
        capsule.querySelector('.sr-only')?.textContent,
      ]).toEqual([null, true, 'busy until later'])
      await act(async () => vi.advanceTimersByTime(90_000))
      expect(chip(container)?.textContent).toBe(S.failed.retry)
      expect(container.querySelector('.capsule .sr-only')?.textContent).toBe('busy')
    } finally {
      vi.useRealTimers()
    }
  })
  it("the website's card: its retry greyed until the time, still a stop, pressing it doing nothing; the host's lines under the reason; then offered", async () => {
    const fake = fakeController({ phase: 'loading' })
    const cardLines = (_kind: string, at: number | null) => ({
      sub: at !== null && Date.now() < at ? 'retry later' : null,
    })
    const { container } = await mountElement(
      cardOf(fake.controller, 'pane', { retry: 'when-due', words: { cardLines } }),
    )
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      await act(async () => fake.set({ phase: 'failed', failure: 'network', failureAt: Date.now() + 30_000 }))
      const button = () => container.querySelector<HTMLButtonElement>('.card button')!
      const lines = () => [...container.querySelectorAll('.card .lines p')].map((p) => [p.className, p.textContent])
      expect([button().getAttribute('aria-disabled'), button().disabled, lines()]).toEqual([
        'true',
        false,
        [
          ['', TEST_PARTS.reason('network')],
          ['sub', 'retry later'],
        ],
      ])
      button().click()
      expect(fake.controller.retry).not.toHaveBeenCalled()
      await act(async () => vi.advanceTimersByTime(30_000))
      // (its time come: the line gone, the reason alone)
      expect([button().getAttribute('aria-disabled'), lines().length]).toEqual([null, 0])
      button().click()
      expect(fake.controller.retry).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
  it("the extension's card: offered at once, one line, whatever the time", async () => {
    const fake = fakeController({ phase: 'failed', failure: 'network', failureAt: Date.now() + 30_000 })
    const { container } = await mountElement(cardOf(fake.controller))
    const button = container.querySelector<HTMLButtonElement>('.card button')!
    expect([button.getAttribute('aria-disabled'), container.querySelector('.card .lines')]).toEqual([null, null])
    button.click()
    expect(fake.controller.retry).toHaveBeenCalledOnce()
  })
})

describe("the run's chip that shows the translation, where the host words it (StateWords showTranslation; L11's second round, gap 4)", () => {
  const chip = (c: HTMLElement) => c.querySelector<HTMLElement>('.capsule[data-kind="progress"] button[data-action]')
  const asked: boolean[] = []
  const words = {
    translating: (got: number, total: number, beside?: boolean) => {
      asked.push(!!beside)
      return beside ? 'Translating' : `Translating ${got} / ${total}`
    },
    showTranslation: 'Show translation',
  }
  const run = { phase: 'translating' as const, translated: { got: 4, total: 15 }, layer: { laid: 0, total: 0 } }
  it('none while nothing of the translation is there, nor where it is on screen; offered on the original once some is', async () => {
    const fake = fakeController({ ...run, display: 'original' })
    const { container } = await mountElement(capsuleOf(fake.controller, { words }))
    expect(chip(container)).toBeNull()
    // (the layer's pages known and rows of them in, or a page laid)
    await act(async () => fake.set({ layer: { laid: 0, total: 6 } }))
    expect(chip(container)?.textContent).toBe('Show translation')
    // (the host asked for its words beside the chip; the stage was said once already, with the count it started at)
    expect(asked.at(-1)).toBe(true)
    chip(container)!.click()
    expect(fake.controller.setDisplay).toHaveBeenCalledWith('translation')
    await act(async () => fake.set({ display: 'bilingual', layer: { laid: 2, total: 6 } }))
    expect(chip(container)).toBeNull()
    expect(container.querySelector('.capsule')!.hasAttribute('data-alone')).toBe(true)
  })
  it('none where the host words no chip (the extension gives no words of a run at all)', async () => {
    const fake = fakeController({ ...run, display: 'original', layer: { laid: 2, total: 6 } })
    const { container } = await mountElement(capsuleOf(fake.controller, { words: { translating: words.translating } }))
    expect([!!container.querySelector('.capsule[data-kind="progress"]'), chip(container)]).toEqual([true, null])
  })
})

describe("arXiv's HTML version as the host offers it (StateWords htmlLink; L11's second round, gap 5)", () => {
  const html = 'https://arxiv.org/html/2608.02163v2#readarxiv'
  const link = (c: HTMLElement) => c.querySelector<HTMLAnchorElement>('.capsule a[data-action]')
  it("the host's address and words for the link; none where it offers none; the catalogue's where it gives no rule", async () => {
    const store = 'https://chromewebstore.google.com/detail/read-arxiv'
    const htmlLink = (href: string) => (href.includes('2608') ? { href: store, label: 'Install the extension' } : null)
    const lasting = fakeController({ phase: 'ready', available: false, htmlVersion: html })
    // (the store's origin named by the host, as every origin its links lead to besides arXiv's and its own)
    const a = await mountElement(
      capsuleOf(lasting.controller, { words: { htmlLink }, linkOrigins: ['https://chromewebstore.google.com'] }),
    )
    expect([link(a.container)?.getAttribute('href'), link(a.container)?.textContent]).toEqual([
      store,
      'Install the extension',
    ])
    document.body.innerHTML = ''
    const passing = fakeController({
      phase: 'ready',
      unavailable: { why: 'unreachable', retryAt: null },
      htmlVersion: 'https://arxiv.org/html/2601.00001v1#readarxiv',
    })
    const b = await mountElement(capsuleOf(passing.controller, { words: { htmlLink } }))
    expect([link(b.container), !!b.container.querySelector('.capsule button[data-action]')]).toEqual([null, true])
    document.body.innerHTML = ''
    const c = await mountElement(
      capsuleOf(fakeController({ phase: 'ready', available: false, htmlVersion: html }).controller),
    )
    expect([link(c.container)?.getAttribute('href'), link(c.container)?.textContent]).toEqual([html, R.status.useHtml])
  })
})

describe('the links the chrome draws from a host or a document, checked (chrome/links.ts; the review of #616)', () => {
  const link = (c: HTMLElement) => c.querySelector<HTMLAnchorElement>('.capsule a[data-action]')
  it("the host's HTML link drawn only to arXiv's, the page's own or an origin it names; a script's or a foreign one draws none", async () => {
    const html = 'https://arxiv.org/html/2608.02163v2#readarxiv'
    const hrefs = []
    for (const [to, origins] of [
      ['javascript:alert(1)', []],
      ['data:text/html,x', []],
      ['https://evil.example/x', []],
      ['https://store.example/detail/x', ['https://store.example']],
    ] as const) {
      const fake = fakeController({ phase: 'ready', available: false, htmlVersion: html })
      const { container } = await mountElement(
        capsuleOf(fake.controller, { words: { htmlLink: () => ({ href: to, label: 'Go' }) }, linkOrigins: origins }),
      )
      hrefs.push(link(container)?.getAttribute('href') ?? null)
      document.body.innerHTML = ''
    }
    expect(hrefs).toEqual([null, null, null, 'https://store.example/detail/x'])
  })
  it("a document's HTML version and a host's settings page the same: a script's draws no link", async () => {
    const a = await mountElement(
      capsuleOf(fakeController({ phase: 'ready', available: false, htmlVersion: 'javascript:alert(1)' }).controller),
    )
    expect(link(a.container)).toBeNull()
    document.body.innerHTML = ''
    const b = await mountElement(
      capsuleOf(fakeController({ phase: 'ready', settingsUnreadable: true }).controller, {
        settingsHref: 'javascript:alert(1)',
      }),
    )
    expect([!!b.container.querySelector('.capsule'), link(b.container)]).toEqual([true, null])
  })
})

describe("the card's retry due at the time of the failure it shows (the cloud review of #616)", () => {
  it("the original lost on its own pane and the service waiting: the translation's card, the service's, greyed until the service's time", async () => {
    const fake = fakeController({
      phase: 'failed',
      failure: 'network',
      failures: { pdf: 'network', service: 'network' },
      failureAt: Date.now() + 60_000,
    })
    const { container } = await mountElement(
      cardOf(fake.controller, 'pane', { retry: 'when-due', words: { openOriginal: 'Open the PDF on arXiv' } }),
    )
    const button = container.querySelector<HTMLButtonElement>('.card button')!
    expect(button.getAttribute('aria-disabled')).toBe('true')
    button.click()
    expect(fake.controller.retry).not.toHaveBeenCalled()
  })
  it("the card that shows the original's failure (no way to arXiv's PDF given): its retry at once, the original asked again", async () => {
    const fake = fakeController({
      phase: 'failed',
      failure: 'network',
      failures: { pdf: 'network', service: 'network' },
      failureAt: Date.now() + 60_000,
    })
    const { container } = await mountElement(cardOf(fake.controller, 'pane', { retry: 'when-due' }))
    expect(container.querySelector('.card button')!.getAttribute('aria-disabled')).toBeNull()
  })
})
