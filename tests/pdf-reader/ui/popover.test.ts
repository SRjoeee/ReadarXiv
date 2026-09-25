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
    createElement(Popover, { ...pop.popover, role: 'menu', label: 'Zoom', onClosed: () => setClosed(n => n + 1) }, createElement('button', { type: 'button', 'data-inside': '', 'data-autofocus': '' }, 'item')),
    createElement('output', null, String(closedCount)))
}

/** the focus moving from inside the popover to `to`, as a Tab does: the browser's focusout, with where it goes */
const leave = (pop: HTMLElement, to: HTMLElement | null) => act(async () => {
  to?.focus()
  pop.querySelector('[data-inside]')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: to }))
})

describe('the reader\'s popover (the reader\'s design, §6.7)', () => {
  it('is a light-dismiss popover its button opens, the button saying whether it is open', async () => {
    const { container } = await mountElement(createElement(Harness))
    const trigger = container.querySelector<HTMLButtonElement>('[data-trigger]')!, pop = container.querySelector<HTMLElement>('[popover]')!
    expect([pop.getAttribute('popover'), trigger.getAttribute('popovertarget'), pop.id]).toEqual(['auto', pop.id, pop.id])
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await act(async () => { pop.showPopover() })
    expect([isOpen(pop), trigger.getAttribute('aria-expanded')]).toEqual([true, 'true'])
  })

  it('takes no role for a menu or a list, whose own element has it, and keeps a dialog\'s with its name (the final review)', async () => {
    const { container } = await mountElement(createElement(Harness))
    expect(container.querySelector('[popover]')!.getAttribute('role')).toBeNull()
    const dialog = await mountElement(createElement(Popover, { id: 'pop-d', anchor: '--pop-d', onOpenChange: () => {}, role: 'dialog', label: 'Options' }))
    const el = dialog.container.querySelector('[popover]')!
    expect([el.getAttribute('role'), el.getAttribute('aria-label')]).toEqual(['dialog', 'Options'])
  })

  it('draws its contents before it opens, so that it never shows empty, and puts the focus in them when it opens (Task 19)', async () => {
    const { container } = await mountElement(createElement(Harness))
    const pop = container.querySelector<HTMLElement>('[popover]')!
    expect(pop.querySelector('[data-inside]')).not.toBeNull()
    await act(async () => { pop.showPopover() })
    expect(document.activeElement).toBe(pop.querySelector('[data-inside]'))
  })

  it('closes when the focus leaves it for another control, as a Tab out of a menu does, and leaves the focus there (APG; the interface review)', async () => {
    const { container } = await mountElement(createElement('div', null, createElement(Harness), createElement('button', { type: 'button', 'data-next': '' }, 'next')))
    const pop = container.querySelector<HTMLElement>('[popover]')!, next = container.querySelector<HTMLElement>('[data-next]')!
    await act(async () => { pop.showPopover() })
    await leave(pop, next)
    expect([isOpen(pop), document.activeElement]).toEqual([false, next])
  })

  it('stays open when the focus goes nowhere, a press on its own words (the interface review)', async () => {
    const { container } = await mountElement(createElement(Harness))
    const pop = container.querySelector<HTMLElement>('[popover]')!
    await act(async () => { pop.showPopover() })
    await leave(pop, null)
    expect(isOpen(pop)).toBe(true)
  })

  it('puts the focus on a dialog\'s first control that shows when it opens, a dialog having no autofocus of its own (APG; the interface review)', async () => {
    const dialog = await mountElement(createElement(Popover, { id: 'pop-d', anchor: '--pop-d', onOpenChange: () => {}, role: 'dialog', label: 'Options' },
      createElement('div', { hidden: true }, createElement('button', { type: 'button' }, 'hidden')), createElement('button', { type: 'button', 'data-first': '' }, 'first')))
    const pop = dialog.container.querySelector<HTMLElement>('[popover]')!
    await act(async () => { pop.showPopover() })
    expect(document.activeElement).toBe(pop.querySelector('[data-first]'))
  })

  it('takes its own first control, not one inside a popover it holds (the reading options hold the language menu)', async () => {
    const dialog = await mountElement(createElement(Popover, { id: 'pop-d', anchor: '--pop-d', onOpenChange: () => {}, role: 'dialog', label: 'Options' },
      createElement('button', { type: 'button', 'data-first': '' }, 'language'),
      createElement('div', { popover: 'auto' }, createElement('input', { 'data-autofocus': '' }))))
    const pop = dialog.container.querySelector<HTMLElement>('[popover]')!
    await act(async () => { pop.showPopover() })
    expect(document.activeElement).toBe(pop.querySelector('[data-first]'))
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
