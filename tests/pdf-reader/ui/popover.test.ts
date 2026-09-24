import { act, createElement, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Popover, usePopover } from '@/pdf-reader/ui/Popover'
import { mountElement } from '../../ui/render-hook'
import { isOpen, stubPopovers } from './popover-stub'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

function Harness() {
  const pop = usePopover('menu')
  const [closedCount, setClosed] = useState(0)
  return createElement('div', null,
    createElement('button', { type: 'button', ...pop.trigger, 'data-trigger': '' }, 'open'),
    createElement(Popover, { ...pop.popover, role: 'menu', label: 'Zoom', onClosed: () => setClosed(n => n + 1) }, createElement('button', { type: 'button', 'data-inside': '' }, 'item')),
    createElement('output', null, String(closedCount)))
}

describe('the reader\'s popover (the reader\'s design, §6.7)', () => {
  it('is a light-dismiss popover its button opens, the button saying whether it is open', async () => {
    const { container } = await mountElement(createElement(Harness))
    const trigger = container.querySelector<HTMLButtonElement>('[data-trigger]')!, pop = container.querySelector<HTMLElement>('[popover]')!
    expect([pop.getAttribute('popover'), trigger.getAttribute('popovertarget'), pop.id]).toEqual(['auto', pop.id, pop.id])
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { pop.showPopover() })
    expect([isOpen(pop), trigger.getAttribute('aria-expanded')]).toEqual([true, 'true'])
  })

  it('gives the focus back to its button when it closes with the focus inside', async () => {
    const { container } = await mountElement(createElement(Harness))
    const trigger = container.querySelector<HTMLButtonElement>('[data-trigger]')!, pop = container.querySelector<HTMLElement>('[popover]')!
    await act(async () => { pop.showPopover() })
    container.querySelector<HTMLButtonElement>('[data-inside]')!.focus()
    await act(async () => { pop.hidePopover() })
    expect(document.activeElement).toBe(trigger)
    expect(container.querySelector('output')!.textContent).toBe('1')
  })
})
