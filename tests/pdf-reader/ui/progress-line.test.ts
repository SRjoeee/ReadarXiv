import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProgressLine } from '@/pdf-reader/ui/ProgressLine'
import { lineOf } from '@/pdf-reader/ui/status'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'

afterEach(() => { document.body.innerHTML = '' })

describe('the progress line under the toolbar (the reader\'s design, §6.6)', () => {
  it('shows the process done as its length, and leaves at its last length once reading', async () => {
    const fake = fakeController({ phase: 'translating', progress: 0.4 })
    const { container } = await mountElement(createElement(ProgressLine, { controller: fake.controller }))
    const line = container.querySelector<HTMLElement>('.progress-line')!
    expect([line.hasAttribute('data-on'), Number(line.style.getPropertyValue('--p')), line.getAttribute('aria-hidden')]).toEqual([true, lineOf({ ...fake.controller.getState() }).value, 'true'])
    await act(async () => fake.set({ progress: 1, shown: 'final' }))
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
