import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useReader } from '@/pdf-reader/ui/use-reader'
import type { ReaderController } from '@/pdf-reader/controller'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'

afterEach(() => { document.body.innerHTML = '' })

describe('useReader: a component renders again for the part of the state it shows (the final review)', () => {
  it('renders a pane\'s page again when it changes, not when the heading being read does', async () => {
    const fake = fakeController()
    let renders = 0
    function Page({ controller }: { controller: ReaderController }) {
      renders++
      const side = useReader(controller, s => s.sides.left)
      return createElement('output', null, String(side.page))
    }
    const { container } = await mountElement(createElement(Page, { controller: fake.controller }))
    const first = renders
    await act(async () => fake.set({ currentHeading: 7 }))
    expect(renders).toBe(first)
    await act(async () => fake.set({ sides: { left: { page: 4, pages: 20 }, right: { page: 1, pages: 20 } } }))
    expect([renders, container.textContent]).toEqual([first + 1, '4'])
    // the same values in a new object: nothing to show again
    await act(async () => fake.set({ sides: { left: { page: 4, pages: 20 }, right: { page: 1, pages: 20 } } }))
    expect(renders).toBe(first + 1)
  })
})
