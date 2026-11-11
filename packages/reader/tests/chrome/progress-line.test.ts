import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { PARTS, type Parts, PartsProvider } from '../../src/chrome/parts.tsx'
import { ProgressLine } from '../../src/chrome/ProgressLine.tsx'
import { lineOf } from '../../src/chrome/status.ts'
import { mountElement } from '../render-hook.ts'
import { fakeController } from './fake-controller.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

describe("the progress line under the toolbar (the reader's design, §6.6)", () => {
  it('shows the process done as its length, and leaves at its last length once reading', async () => {
    const fake = fakeController({ phase: 'translating', progress: 0.4 })
    const { container } = await mountElement(createElement(ProgressLine, { controller: fake.controller }))
    const line = container.querySelector<HTMLElement>('.progress-line')!
    expect([
      line.hasAttribute('data-on'),
      Number(line.style.getPropertyValue('--p')),
      line.getAttribute('aria-hidden'),
    ]).toEqual([true, lineOf({ ...fake.controller.getState() }).value, 'true'])
    await act(async () => fake.set({ progress: 1 }))
    await act(async () => fake.set({ phase: 'ready' }))
    const after = container.querySelector<HTMLElement>('.progress-line')!
    expect([after.hasAttribute('data-on'), after.style.getPropertyValue('--p')]).toEqual([false, '1'])
  })

  it('goes on from the download into the translation, one line that never starts again (the maintainer, 2026-10-02)', async () => {
    const fake = fakeController({ phase: 'loading', loaded: 1 })
    const { container } = await mountElement(createElement(ProgressLine, { controller: fake.controller }))
    const loading = container.querySelector<HTMLElement>('.progress-line')!
    const at = Number(loading.style.getPropertyValue('--p'))
    await act(async () => fake.set({ phase: 'translating', progress: 0 }))
    const running = container.querySelector<HTMLElement>('.progress-line')!
    expect(running).toBe(loading)
    expect(Number(running.style.getPropertyValue('--p'))).toBeGreaterThanOrEqual(at)
    // and never shorter within it: a run again counts its paragraphs from what it has
    await act(async () => fake.set({ progress: 0.5 }))
    const half = Number(running.style.getPropertyValue('--p'))
    await act(async () => fake.set({ progress: 0.2 }))
    expect(Number(running.style.getPropertyValue('--p'))).toBe(half)
  })

  it("held at the original in a narrow window while the paper is made (the website's rule): the line the original's load, whole, through the prepare (L11 third round, gap 3)", async () => {
    const fake = fakeController({ phase: 'loading', loaded: 1, display: 'original', narrow: true })
    const line = (parts: Partial<Parts>) =>
      mountElement(
        createElement(
          PartsProvider,
          { value: { ...PARTS, ...parts } },
          createElement(ProgressLine, { controller: fake.controller }),
        ),
      )
    const site = await line({ narrow: 'shown' })
    const ext = await line({})
    await act(async () => fake.set({ phase: 'preparing', preparing: { position: null, progress: 0.1 } }))
    const p = (c: HTMLElement) => Number(c.querySelector<HTMLElement>('.progress-line')?.style.getPropertyValue('--p'))
    expect(p(site.container)).toBe(1)
    // (the extension's, no rule for the narrow window: its line as before, which held the longest it reached, the download's)
    expect(p(ext.container)).toBe(1)
    // a prepare told before the original came in: the line runs from the download's share there, the original's load here
    const late = fakeController({ phase: 'loading', loaded: 0.4, display: 'translation', narrow: true })
    const mount = (parts: Partial<Parts>) =>
      mountElement(
        createElement(
          PartsProvider,
          { value: { ...PARTS, ...parts } },
          createElement(ProgressLine, { controller: late.controller }),
        ),
      )
    const a = await mount({ narrow: 'shown' })
    const b = await mount({})
    await act(async () =>
      late.set({ phase: 'preparing', loaded: 1, display: 'original', preparing: { position: null, progress: 0 } }),
    )
    expect([p(a.container), p(b.container)]).toEqual([1, 0.15])
  })

  it("a new paper's process: the prepare by its stage, its early units' end held never filling the line, then the translation taking what the prepare left; a later run its own line from the download's base (the coordinator's decision 4, 2026-11-11)", async () => {
    const fake = fakeController({ phase: 'loading', loaded: 1 })
    const { container } = await mountElement(createElement(ProgressLine, { controller: fake.controller }))
    const seen: number[] = []
    const look = () =>
      seen.push(Number(container.querySelector<HTMLElement>('.progress-line')!.style.getPropertyValue('--p')))
    const steps: Parameters<typeof fake.set>[0][] = [
      { phase: 'preparing', made: true, preparing: { position: null, progress: 0 } },
      { preparing: { position: null, progress: 0.12 } },
      // (the early units' rows ended while the layer is made: the end held is the prepare's, never the whole line)
      { phase: 'translating', laying: true, progress: 1, preparing: { position: null, progress: 0.52 } },
      { preparing: { position: null, progress: 0.97 } },
      // (the layer landed, its count not known yet; then counted, then translated)
      { preparing: null, laying: false, translated: { got: 0, total: 0 } },
      { progress: 222 / 227, translated: { got: 222, total: 227 } },
      { progress: 1, translated: { got: 227, total: 227 } },
    ]
    for (const step of steps) {
      await act(async () => fake.set(step))
      look()
    }
    const PREPARED = 0.15 + 0.85 * 0.5
    expect(seen.map((v) => Math.round(v * 1000) / 1000)).toEqual([
      0.15,
      Math.round((0.15 + (PREPARED - 0.15) * 0.12) * 1000) / 1000,
      Math.round((0.15 + (PREPARED - 0.15) * 0.52) * 1000) / 1000,
      Math.round((0.15 + (PREPARED - 0.15) * 0.97) * 1000) / 1000,
      PREPARED,
      Math.round((PREPARED + (1 - PREPARED) * (222 / 227)) * 1000) / 1000,
      1,
    ])
    // (a language switched to later in the visit: a process of its own, from the download's base, not the prepare's end)
    await act(async () => fake.set({ phase: 'ready' }))
    await act(async () => fake.set({ phase: 'translating', progress: 0.5, translated: { got: 60, total: 120 } }))
    look()
    expect(seen.at(-1)).toBeCloseTo(0.15 + 0.85 * 0.5)
  })

  it('a process begun after the line had left is a line of its own, from its start: the original read, then a translation asked for', async () => {
    const fake = fakeController({ phase: 'loading', loaded: 1, display: 'original' })
    const { container } = await mountElement(createElement(ProgressLine, { controller: fake.controller }))
    const first = container.querySelector('.progress-line')
    await act(async () => fake.set({ phase: 'ready' }))
    await act(async () => fake.set({ phase: 'translating', progress: 0, display: 'bilingual' }))
    const next = container.querySelector<HTMLElement>('.progress-line')!
    expect(next).not.toBe(first)
    expect(Number(next.style.getPropertyValue('--p'))).toBeLessThan(1)
  })
})
