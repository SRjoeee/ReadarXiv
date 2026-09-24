import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolbarButton } from '@/pdf-reader/ui/ToolbarButton'
import { mountElement } from '../../ui/render-hook'
import { isOpen, stubPopovers } from './popover-stub'

let restore = () => {}
// the timers are faked after mounting only: mountElement settles React on a real timer
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); vi.useRealTimers(); document.body.innerHTML = '' })

/** a pointer event as a browser sends it: bubbling, so that React (which listens at its root) hears it; React makes its
 *  enter and leave out of over and out */
const pointer = (target: Element, type: 'pointerover' | 'pointerout' | 'pointerdown') => target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: type === 'pointerout' ? document.body : null }))
const mount = (props: Partial<Parameters<typeof ToolbarButton>[0]> = {}) =>
  mountElement(createElement(ToolbarButton, { label: '放大', hint: '⌘ +', onClick: () => {}, ...props }, 'x'))

describe('a toolbar button and its tooltip (the reader\'s design, §6.1, §13)', () => {
  it('is named by its words, and its tooltip shows them with the shortcut', async () => {
    const { container } = await mount()
    const button = container.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('放大')
    expect(container.querySelector('[popover]')!.textContent).toBe('放大⌘ +')
  })

  it('shows its tooltip after 500 ms of hover, and hides it on leaving', async () => {
    const { container } = await mount()
    const button = container.querySelector('button')!, tip = container.querySelector('[popover]')
    vi.useFakeTimers()
    await act(async () => { pointer(button, 'pointerover') })
    await act(async () => { vi.advanceTimersByTime(499) })
    expect(isOpen(tip)).toBe(false)
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(isOpen(tip)).toBe(true)
    await act(async () => { pointer(button, 'pointerout') })
    expect(isOpen(tip)).toBe(false)
  })

  it('shows it at once on keyboard focus, not on a press', async () => {
    const { container } = await mount()
    const button = container.querySelector('button')!, tip = container.querySelector('[popover]')
    await act(async () => { button.focus() })
    expect(isOpen(tip)).toBe(true)
    await act(async () => { button.blur() })
    await act(async () => { pointer(button, 'pointerdown'); button.focus() })
    expect(isOpen(tip)).toBe(false)
  })

  it('does nothing when disabled, and says so', async () => {
    const onClick = vi.fn()
    const { container } = await mount({ disabled: true, onClick })
    const button = container.querySelector('button')!
    button.click()
    expect(onClick).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-disabled')).toBe('true')
  })
})
