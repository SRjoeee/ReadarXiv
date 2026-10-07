// Segmented controls (Part 3's interfaces; the redesign's design, §2.3, §5.1, §6.4, §8, §9)
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type SegmentOption, Segmented } from '@/ui/controls/Segmented'
import { stubPopovers } from '../../pdf-reader/ui/popover-stub'
import { mountElement } from '../render-hook'

let restore = () => {}
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

type Mode = 'side' | 'stack' | 'only'
const OPTIONS: SegmentOption<Mode>[] = [
  { value: 'side', label: 'Side' },
  { value: 'stack', label: 'Stacked', disabled: true, title: 'Not in the PDF reader' },
  { value: 'only', label: 'Only' },
]
const key = (target: Element, k: string) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
async function mount(props: Partial<Parameters<typeof Segmented<Mode>>[0]> = {}) {
  const onChange = vi.fn()
  const mounted = await mountElement(createElement(Segmented<Mode>, { label: 'Display', value: 'side', options: OPTIONS, onChange, ...props }))
  const group = mounted.container.querySelector<HTMLElement>('[role="radiogroup"]')!
  return { ...mounted, onChange, group, radios: [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')] }
}

describe('Segmented', () => {
  it('is a radio group named by its label, the chosen segment checked and alone in the tab order', async () => {
    const { group, radios } = await mount()
    expect(group.getAttribute('aria-label')).toBe('Display')
    expect(radios.map(r => [r.getAttribute('aria-checked'), r.getAttribute('tabindex')])).toEqual([['true', '0'], ['false', '-1'], ['false', '-1']])
  })

  it('equal: the thumb placed by the chosen index over the count, the reader\'s way, and no anchor name', async () => {
    const { group, radios } = await mount({ value: 'only' })
    expect([group.className, group.style.getPropertyValue('--i'), group.style.getPropertyValue('--n'), !!group.querySelector('.thumb')]).toEqual(['seg', '2', '3', true])
    expect(radios.some(r => r.style.getPropertyValue('anchor-name').includes('--seg-on'))).toBe(false)
  })

  it('fit: the chosen segment carries the anchor name the control scopes, and no index is written', async () => {
    const { group, radios } = await mount({ value: 'only', fit: true })
    expect([group.className, group.style.getPropertyValue('--i')]).toEqual(['seg fit', ''])
    expect(radios.map(r => r.style.getPropertyValue('anchor-name').includes('--seg-on'))).toEqual([false, false, true])
  })

  it('moves the choice with the arrows past a disabled segment, the focus going with it', async () => {
    const { group, radios, onChange } = await mount()
    await key(group, 'ArrowRight')
    expect([onChange.mock.calls, document.activeElement === radios[2]]).toEqual([[['only']], true])
  })

  it('a disabled segment is greyed and never chosen; its title is its tooltip and its description', async () => {
    const { radios, onChange } = await mount()
    radios[1]!.click()
    radios[0]!.click()
    expect(onChange).not.toHaveBeenCalled()
    const why = document.getElementById(radios[1]!.getAttribute('aria-describedby')!)
    expect([radios[1]!.getAttribute('aria-disabled'), why?.textContent, why?.hidden, radios[1]!.nextElementSibling?.textContent]).toEqual(['true', 'Not in the PDF reader', true, 'Not in the PDF reader'])
  })

  it('icons alone: each segment named by its words, which its tooltip says; small', async () => {
    const icons = OPTIONS.map(o => ({ ...o, icon: createElement('svg') }))
    const { group, radios } = await mount({ options: icons, iconsOnly: true, size: 'sm' })
    expect(group.className).toBe('seg small icons')
    expect([radios[0]!.getAttribute('aria-label'), radios[0]!.querySelector('span'), radios[0]!.nextElementSibling?.textContent]).toEqual(['Side', null, 'Side'])
  })

  it('a value none of the options holds: no thumb, the first that can be had is the tab stop, the arrows go on from it (Review Focus)', async () => {
    const { group, radios, onChange } = await mount({ value: 'gone' as Mode })
    expect([group.querySelector('.thumb'), radios.map(r => r.getAttribute('tabindex'))]).toEqual([null, ['0', '-1', '-1']])
    await key(group, 'ArrowRight')
    expect(onChange).toHaveBeenCalledWith('only')
  })

  // fix round 1: a settings row hands its description's id to the group it describes; the popup and the reader,
  // which never pass one, are unchanged
  it('names no description unless the caller gives it one (the popup\'s and the reader\'s groups, unchanged)', async () => {
    const { group } = await mount()
    expect(group.hasAttribute('aria-describedby')).toBe(false)
  })

  it('is described by the id a caller hands it', async () => {
    const { group } = await mount({ describedBy: 'row-desc-1' })
    expect(group.getAttribute('aria-describedby')).toBe('row-desc-1')
  })
})
