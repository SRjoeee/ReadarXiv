// The capsule's words in parts (capsule-words.ts), the motion's arithmetic and its count (capsule-motion.ts), and the one
// capsule both the extension and the website draw (Capsule.tsx). How the words move with the box is measured in a real
// browser, frame by frame (tests/e2e/probes/capsule.mjs)
import { readFileSync } from 'node:fs'
import { Info } from 'lucide'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Capsule } from '@/pdf-reader/ui/Capsule'
import { CHOREOGRAPHY, capsuleMotion, SOFT, swapAt, timeAt } from '@/pdf-reader/ui/capsule-motion'
import { keyOf, plain, sameShape, textOf, withCount, withPart, words } from '@/pdf-reader/ui/capsule-words'
import { mountElement } from '../../ui/render-hook'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('the capsule\'s words in parts', () => {
  it('a sentence split around its count, or around a name in a language of its own; whole where it holds neither', () => {
    expect(withCount('Translating · 12 of 86 passages', 12)).toEqual({ prefix: 'Translating · ', count: 12, suffix: ' of 86 passages' })
    expect(withCount('3 处翻译失败', 3)).toEqual({ prefix: '', count: 3, suffix: ' 处翻译失败' })
    expect(withPart('PDF 对照暂不支持日本語', { text: '日本語', lang: 'ja' })).toEqual({ prefix: 'PDF 对照暂不支持', part: { text: '日本語', lang: 'ja' }, suffix: '' })
    // the count where it stands as a number of its own, not inside another
    expect(withCount('Translating · 6 of 86 passages', 6)).toEqual({ prefix: 'Translating · ', count: 6, suffix: ' of 86 passages' })
    for (const text of ['Preparing', '正在生成页面']) {
      expect(withCount(text, 4)).toBe(plain(text))
      expect(withPart(text, { text: '日本語', lang: 'ja' })).toBe(plain(text))
    }
    expect(withCount('Translating · 86 of 86 passages', 7)).toBe(plain('Translating · 86 of 86 passages'))
  })

  it('read whole, as a screen reader is told it', () => {
    for (const text of ['Translating · 12 of 86 passages', '3 处翻译失败', 'PDF 对照暂不支持日本語', 'Preparing']) {
      expect(textOf(withCount(text, 12))).toBe(text)
      expect(textOf(withCount(text, 3))).toBe(text)
      expect(textOf(withPart(text, { text: '日本語', lang: 'ja' }))).toBe(text)
    }
  })

  it('two sets of words with the same parts but their count are one shape', () => {
    const at = (n: number) => withCount(`正在翻译 · ${n} / 86 段`, n)
    expect(sameShape(at(9), at(10))).toBe(true)
    expect(sameShape(at(9), withCount('正在翻译 · 10 / 87 段', 10))).toBe(false)
    expect(sameShape(at(9), plain('正在生成页面'))).toBe(false)
    expect(sameShape(plain('正在准备'), plain('正在生成页面'))).toBe(false)
  })

  it('equal words are one object', () => {
    expect(plain('Preparing')).toBe(plain('Preparing'))
    expect(withCount('Translating · 12 of 86 passages', 12)).toBe(words({ prefix: 'Translating · ', count: 12, suffix: ' of 86 passages' }))
    expect(withPart('PDF 对照暂不支持日本語', { text: '日本語', lang: 'ja' })).toBe(words({ prefix: 'PDF 对照暂不支持', part: { text: '日本語', lang: 'ja' }, suffix: '' }))
    // words that draw the same are the same: a plain sentence is its one string, however it was split
    expect(words({ prefix: 'Prep', suffix: 'aring' })).toBe(plain('Preparing'))
    expect(keyOf(plain('9'))).not.toBe(keyOf(words({ prefix: '', count: 9, suffix: '' })))
    // the same object kept even after many other words have come and gone between (64 are kept)
    const kept = plain('kept')
    for (let i = 0; i < 40; i++) plain(`other ${i}`)
    expect(plain('kept')).toBe(kept)
  })
})

describe('the motion\'s arithmetic', () => {
  it('the growing box\'s curve reaches 60 % of its way at 161 ms of its 300', () => {
    expect(Math.round(300 * timeAt(0.6))).toBe(161)
    expect(Math.round(CHOREOGRAPHY.grow * timeAt(CHOREOGRAPHY.appearAt, SOFT))).toBe(161)
  })

  it('growing words cross-fade at 60 % of the way, or later where they fit only later; at once otherwise', () => {
    expect(Math.round(swapAt(105.6, 225.7, [140]))).toBe(161)
    // round 4's 「Preparing」 → 「Translating · 0 of 86 passages」, whose words fit only near the end of the way
    const late = swapAt(105.6, 225.7, [212])
    expect([late > 161, late < 300]).toEqual([true, true])
    expect(swapAt(150, 100, [90])).toBe(0)
    expect(swapAt(100, 100.2, [101])).toBe(0)
  })

  it('the sheet\'s curves are the engine\'s: what reader.css moves and what the engine starts move alike', () => {
    const sheet = readFileSync('src/entrypoints/pdf-reader/reader.css', 'utf8')
    const token = (name: string) => sheet.match(new RegExp(`${name}:\\s*cubic-bezier\\(([^)]*)\\)`))?.[1]?.split(',').map(Number)
    expect(token('--ease-soft')).toEqual([...SOFT])
    expect(token('--ease-out')).toEqual([0.23, 1, 0.32, 1])
    expect(token('--ease-in-out')).toEqual([0.77, 0, 0.175, 1])
  })
})

describe('the capsule', () => {
  const drawn = (container: HTMLElement) => container.querySelector('.capsule .words')!

  it('its words in a cell of their own, hidden from assistive technology, which is told them whole once in a line of its own', async () => {
    const said = withPart('PDF 对照暂不支持日本語', { text: '日本語', lang: 'ja' })
    const { container } = await mountElement(createElement(Capsule, { kind: 'unsupported', icon: Info, words: said, wordsId: 'said' }))
    const cell = drawn(container)
    expect([cell.getAttribute('aria-hidden'), cell.textContent, document.getElementById('said')?.textContent]).toEqual(['true', 'PDF 对照暂不支持日本語', 'PDF 对照暂不支持日本語'])
    // #313 (Devin): the language's own name drawn in its own language
    expect(cell.querySelector('.part[lang="ja"]')?.textContent).toBe('日本語')
    expect(container.querySelectorAll('.sr-only')).toHaveLength(1)
  })

  it('the line a screen reader is told keeps the part\'s language: the own name in its lang there too (Codex and Devin on #317)', async () => {
    const said = withPart('PDF 对照暂不支持日本語', { text: '日本語', lang: 'ja' })
    const { container } = await mountElement(createElement(Capsule, { kind: 'unsupported', icon: Info, words: said, wordsId: 'told' }))
    const told = document.getElementById('told')!
    expect([told.textContent, told.querySelector('[lang="ja"]')?.textContent, told.closest('[aria-hidden="true"]')]).toEqual(['PDF 对照暂不支持日本語', '日本語', null])
    // the words drawn are as they were: the motion's cell, its part in its lang
    expect(container.querySelector('.words .part[lang="ja"]')?.textContent).toBe('日本語')
  })

  it('a count in cells of its own, one a digit, each over a hidden 0 that holds its width', async () => {
    const { container } = await mountElement(createElement(Capsule, { kind: 'progress', icon: 'spinner', words: withCount('Translating · 12 of 86 passages', 12) }))
    const cells = [...drawn(container).querySelectorAll('.num > .dg')].map(dg => [dg.querySelector('.gh')?.textContent, dg.querySelector('.d')?.textContent])
    expect(cells).toEqual([['0', '1'], ['0', '2']])
  })

  it('the spinner, for a run under way', async () => {
    const { container } = await mountElement(createElement(Capsule, { kind: 'progress', icon: 'spinner', words: plain('Preparing') }))
    expect(container.querySelector('.capsule > svg.spin')).not.toBeNull()
    const { container: still } = await mountElement(createElement(Capsule, { kind: 'notice', icon: Info, words: plain('Preparing') }))
    expect([still.querySelector('.capsule > svg'), still.querySelector('.capsule > svg.spin')].map(e => e !== null)).toEqual([true, false])
  })

  it('what a screen reader is told may be other words than those drawn', async () => {
    const { container } = await mountElement(createElement(Capsule, { kind: 'progress', icon: 'spinner', words: withCount('正在翻译 · 12 / 86 段', 12), spoken: '正在翻译，0 / 86 段' }))
    expect([container.querySelector('.sr-only')?.textContent, drawn(container).textContent?.includes('段')]).toEqual(['正在翻译，0 / 86 段', true])
  })

  it('other words: the new ones in the cell, read once in the line a screen reader is told', async () => {
    const at = (w: ReturnType<typeof plain>) => createElement(Capsule, { kind: 'progress', icon: 'spinner', words: w })
    const mounted = await mountElement(at(plain('Waiting in line')))
    await mounted.rerender(at(plain('Preparing')))
    const live = [...drawn(mounted.container).querySelectorAll('.line')].filter(l => l.getAttribute('data-state') !== 'out')
    expect([live.map(l => l.textContent), mounted.container.querySelector('.sr-only')?.textContent]).toEqual([['Preparing'], 'Preparing'])
  })

  it('what follows the words comes and goes with them: the new one held for the motion, the old one a picture that leaves, no action of its own', async () => {
    const at = (chip: boolean) => createElement(Capsule, {
      kind: 'progress', icon: 'spinner', words: plain('Translating'), afterKey: chip ? 'show' : '', alone: !chip,
      after: chip && createElement('button', { type: 'button', className: 'chip', 'data-action': '' }, 'Show translation'),
    })
    const mounted = await mountElement(at(false))
    expect(mounted.container.querySelector('.after')).toBeNull()
    await mounted.rerender(at(true))
    const chip = mounted.container.querySelector<HTMLElement>('.after:not([data-state="out"]) button[data-action]')
    expect(chip?.textContent).toBe('Show translation')
    await mounted.rerender(at(false))
    // the chip React removed is drawn leaving: inert, hidden, and no longer an action anything can find or press
    const ghost = mounted.container.querySelector<HTMLElement>('.after')
    expect(ghost === null || (ghost.dataset.state === 'out' && ghost.inert && ghost.querySelector('[data-action]') === null)).toBe(true)
  })
})

describe('the count', () => {
  /** a box and its cell, laid out nowhere (happy-dom): the count's timing alone */
  function capsule() {
    const box = document.createElement('div'), cell = document.createElement('span')
    box.className = 'capsule'
    cell.className = 'words'
    box.append(cell)
    document.body.append(box)
    const added: string[] = []
    const shown = () => [...cell.querySelectorAll('.line:not([data-state]) .d:not([data-out])')].map(d => d.textContent).join('')
    const motion = capsuleMotion(box, cell, { reduced: () => false })
    // every digit ever put in the cell, as it is put there
    const record = () => { for (const d of cell.querySelectorAll('.d')) if (!d.hasAttribute('data-seen')) { d.setAttribute('data-seen', ''); added.push(d.textContent ?? '') } }
    return { motion, shown, added, record }
  }
  const at = (n: number) => withCount(`正在翻译 · ${n} / 86 段`, n)

  it('a burst of counts lands on its latest, shown once 300 ms have passed since the last change', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const { motion, shown, added, record } = capsule()
    motion.change(at(1))
    record()
    vi.advanceTimersByTime(1000)
    motion.change(at(2))
    record()
    expect(shown()).toBe('2')
    motion.change(at(3))
    record()
    motion.change(at(4))
    record()
    expect(shown()).toBe('2')
    vi.advanceTimersByTime(299)
    record()
    expect(shown()).toBe('2')
    vi.advanceTimersByTime(1)
    record()
    expect(shown()).toBe('4')
    expect(added).not.toContain('3')
    motion.stop()
  })

  it('a digit gained opens a cell of its own: never a lone 0, the whole number changing as one', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const { motion, shown } = capsule()
    motion.change(at(9))
    vi.advanceTimersByTime(1000)
    motion.change(at(10))
    expect(shown()).toBe('10')
    expect(document.querySelectorAll('.line:not([data-state]) .num > .dg')).toHaveLength(2)
    motion.stop()
    expect(document.querySelector('.words')!.childElementCount).toBe(0)
  })
})
