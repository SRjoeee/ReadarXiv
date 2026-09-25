import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProgressLine } from '@/pdf-reader/ui/ProgressLine'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'

afterEach(() => { document.body.innerHTML = '' })

describe('the progress line under the toolbar (the reader\'s design, §6.6)', () => {
  it('shows a translation\'s progress as its length, and leaves at its last length once reading', async () => {
    const fake = fakeController({ phase: 'translating', progress: 0.4 })
    const { container } = await mountElement(createElement(ProgressLine, { controller: fake.controller }))
    const line = container.querySelector<HTMLElement>('.progress-line')!
    expect([line.hasAttribute('data-on'), line.style.getPropertyValue('--p'), line.getAttribute('aria-hidden')]).toEqual([true, '0.4', 'true'])
    await act(async () => fake.set({ progress: 1 }))
    await act(async () => fake.set({ phase: 'ready' }))
    const after = container.querySelector<HTMLElement>('.progress-line')!
    expect([after.hasAttribute('data-on'), after.style.getPropertyValue('--p')]).toEqual([false, '1'])
  })

  it('starts a new line for the translation after the download, rather than shrink the loading one', async () => {
    const fake = fakeController({ phase: 'loading', loaded: 1 })
    const { container } = await mountElement(createElement(ProgressLine, { controller: fake.controller }))
    const loading = container.querySelector('.progress-line')
    await act(async () => fake.set({ phase: 'translating', progress: 0 }))
    const running = container.querySelector<HTMLElement>('.progress-line')!
    expect(running).not.toBe(loading)
    // a sliver at the start, so that a translation begun is seen
    expect(Number(running.style.getPropertyValue('--p'))).toBeGreaterThan(0)
  })
})
