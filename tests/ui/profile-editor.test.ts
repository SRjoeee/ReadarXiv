import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_HIGHLIGHTS, BUILT_IN_STYLES, type HighlightProfile, type StyleProfile } from '@/config/appearance'
import { HighlightEditor, StyleEditor } from '@/ui/appearance/ProfileEditor'
import { ProfileGrid } from '@/ui/appearance/ProfileGrid'
import { O, setLocale } from '@/ui/strings'
import { mountElement } from './render-hook'

// The appearance editors (ui/appearance/ProfileEditor.tsx) and the grid (ProfileGrid.tsx): every control writes through
// `onChange` at once with the whole profile, the destructive one asks twice, and the grid's tiles choose and edit

const style: StyleProfile = { ...BUILT_IN_STYLES[0]!, id: 'style-mine', name: 'Mine', color: '', opacity: 0.9, underline: 'none', thickness: 1, blur: false, css: '' }
const highlight: HighlightProfile = { ...BUILT_IN_HIGHLIGHTS[0]!, id: 'hl-mine', name: 'Band', color: '#ffcc00', opacity: 0.3 }

const buttons = (container: HTMLElement) => Array.from(container.querySelectorAll('button'))
const byText = (container: HTMLElement, text: string) => buttons(container).find(b => b.textContent?.trim() === text)
const byAria = (container: HTMLElement, label: string) => buttons(container).find(b => b.getAttribute('aria-label') === label)
const setValue = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('StyleEditor', () => {
  beforeEach(() => { setLocale('en') })

  it('every field writes the whole profile through onChange: name, colour (a preset, custom, and back to the text colour), opacity, underline and thickness, blur', async () => {
    const onChange = vi.fn()
    const mounted = await mountElement(createElement(StyleEditor, { value: style, highlight, onChange, onDuplicate: () => {}, onDelete: () => {}, onClose: () => {} }))
    const c = mounted.container
    const name = c.querySelector<HTMLInputElement>('input:not([type])') ?? c.querySelector<HTMLInputElement>('input[type="text"]')
    setValue(name as HTMLInputElement, 'Night')
    expect(onChange).toHaveBeenLastCalledWith({ ...style, name: 'Night' })

    // The swatches: the first fieldset's pressed-state buttons after the "follow the text" one
    const swatches = Array.from(c.querySelector('fieldset')?.querySelectorAll('button[aria-pressed]') ?? []).filter(b => b.getAttribute('aria-label') !== O.reading.followText)
    expect(swatches.length).toBeGreaterThan(0)
    const preset = swatches[0] as HTMLButtonElement
    preset.click()
    expect(onChange).toHaveBeenLastCalledWith({ ...style, color: preset.getAttribute('aria-label') })
    const custom = c.querySelector<HTMLInputElement>('input[type="color"]')
    setValue(custom as HTMLInputElement, '#123456')
    expect(onChange).toHaveBeenLastCalledWith({ ...style, color: '#123456' })
    byAria(c, O.reading.followText)?.click()
    expect(onChange).toHaveBeenLastCalledWith({ ...style, color: '' })

    setValue(c.querySelector('input[type="range"]') as HTMLInputElement, '0.5')
    expect(onChange).toHaveBeenLastCalledWith({ ...style, opacity: 0.5 })

    byText(c, O.reading.underlines.dashed)?.click()
    expect(onChange).toHaveBeenLastCalledWith({ ...style, underline: 'dashed', thickness: 1 })

    const sw = c.querySelector<HTMLButtonElement>('[role="switch"]')
    sw?.click()
    expect(onChange).toHaveBeenLastCalledWith({ ...style, blur: true })
    await mounted.unmount()
  })

  it('the thickness choice appears only with a line, and writes underline and thickness together', async () => {
    const onChange = vi.fn()
    const dashed = { ...style, underline: 'dashed' as const }
    const mounted = await mountElement(createElement(StyleEditor, { value: dashed, highlight, onChange, onDuplicate: () => {}, onDelete: () => {}, onClose: () => {} }))
    const two = byText(mounted.container, '2px')
    expect(two).toBeDefined()
    two?.click()
    expect(onChange).toHaveBeenLastCalledWith({ ...dashed, thickness: 2 })
    await mounted.rerender(createElement(StyleEditor, { value: style, highlight, onChange, onDuplicate: () => {}, onDelete: () => {}, onClose: () => {} }))
    expect(byText(mounted.container, '2px')).toBeUndefined()
    await mounted.unmount()
  })

  it('the advanced CSS box is folded until asked, then writes the declarations', async () => {
    const onChange = vi.fn()
    const mounted = await mountElement(createElement(StyleEditor, { value: style, highlight, onChange, onDuplicate: () => {}, onDelete: () => {}, onClose: () => {} }))
    const c = mounted.container
    expect(c.querySelector('textarea')).toBeNull()
    buttons(c).find(b => b.getAttribute('aria-expanded') === 'false')?.click()
    await mounted.flush()
    const area = c.querySelector<HTMLTextAreaElement>('textarea')
    expect(area).not.toBeNull()
    setValue(area as HTMLTextAreaElement, 'letter-spacing: 0.02em')
    await mounted.flush()
    expect(onChange).toHaveBeenLastCalledWith({ ...style, css: 'letter-spacing: 0.02em' })
    await mounted.unmount()
  })

  it('duplicate fires at once; delete asks twice and cancel takes it back; done closes', async () => {
    const onDuplicate = vi.fn()
    const onDelete = vi.fn()
    const onClose = vi.fn()
    const mounted = await mountElement(createElement(StyleEditor, { value: style, highlight, onChange: () => {}, onDuplicate, onDelete, onClose }))
    const c = mounted.container
    byText(c, O.reading.duplicate)?.click()
    expect(onDuplicate).toHaveBeenCalledTimes(1)
    byText(c, O.reading.delete)?.click()
    await mounted.flush()
    expect(onDelete).not.toHaveBeenCalled()
    byText(c, O.services.cancel)?.click()
    await mounted.flush()
    expect(byText(c, O.services.deleteConfirm)).toBeUndefined()
    byText(c, O.reading.delete)?.click()
    await mounted.flush()
    byText(c, O.services.deleteConfirm)?.click()
    expect(onDelete).toHaveBeenCalledTimes(1)
    byText(c, O.reading.done)?.click()
    expect(onClose).toHaveBeenCalledTimes(1)
    await mounted.unmount()
  })
})

describe('HighlightEditor', () => {
  beforeEach(() => { setLocale('en') })

  it('writes the band colour and its strength through onChange', async () => {
    const onChange = vi.fn()
    const mounted = await mountElement(createElement(HighlightEditor, { value: highlight, style, onChange, onDuplicate: () => {}, onDelete: () => {}, onClose: () => {} }))
    const c = mounted.container
    setValue(c.querySelector('input[type="color"]') as HTMLInputElement, '#00ff00')
    expect(onChange).toHaveBeenLastCalledWith({ ...highlight, color: '#00ff00' })
    setValue(c.querySelector('input[type="range"]') as HTMLInputElement, '0.2')
    expect(onChange).toHaveBeenLastCalledWith({ ...highlight, opacity: 0.2 })
    await mounted.unmount()
  })
})

describe('ProfileGrid', () => {
  beforeEach(() => { setLocale('en') })

  it('a tile chooses; only the chosen tile carries the edit control; add and reset sit in the toolbar', async () => {
    const onChoose = vi.fn()
    const onEdit = vi.fn()
    const onAdd = vi.fn()
    const onReset = vi.fn()
    const items = [style, { ...style, id: 'style-other', name: 'Other' }]
    const mounted = await mountElement(createElement(ProfileGrid, { kind: 'styles', title: 'Styles', items, activeId: 'style-mine', onChoose, onEdit, onAdd, onReset, renderTile: (item: { id: string; name: string }) => createElement('span', null, item.name) }))
    const c = mounted.container
    expect(byAria(c, 'Mine')?.getAttribute('aria-pressed')).toBe('true')
    expect(byAria(c, 'Other')?.getAttribute('aria-pressed')).toBe('false')
    byAria(c, 'Other')?.click()
    expect(onChoose).toHaveBeenCalledWith('style-other')
    expect(byAria(c, O.reading.editAria('Mine'))).toBeDefined()
    expect(byAria(c, O.reading.editAria('Other'))).toBeUndefined()
    byAria(c, O.reading.editAria('Mine'))?.click()
    expect(onEdit).toHaveBeenCalledWith('style-mine')
    byText(c, O.reading.add)?.click()
    byText(c, O.reading.reset)?.click()
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenCalledTimes(1)
    await mounted.unmount()
  })
})
