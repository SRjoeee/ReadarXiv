// The settings page's own controls (the redesign's design, §6.2, §6.3, §6.6): the undo row that stands for 5 s where a
// deleted row was, the confirm in place that turns back after 3 s untouched, the model field's combobox, and the list
// helpers the sections share
import { act, createElement as h, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Combobox, type ComboOption } from '@/entrypoints/options/ui/Combobox'
import { ConfirmButton, DISARM_MS } from '@/entrypoints/options/ui/ConfirmButton'
import { insertAt, useFocusWhenDrawn, withUndo } from '@/entrypoints/options/ui/lists'
import { UNDO_MS, UndoRow } from '@/entrypoints/options/ui/UndoRow'
import { O, setLocale } from '@/ui/strings'
import { mountElement } from '../ui/render-hook'

const buttons = (c: HTMLElement) => [...c.querySelectorAll('button')]
const byText = (c: HTMLElement, text: string) => buttons(c).find(b => b.textContent?.trim() === text)

describe('UndoRow (§6.2)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  it('says what went, undoes it on a press, and expires after 5 s untouched', async () => {
    const seen: string[] = []
    const m = await mountElement(h(UndoRow, { item: 'mine', name: 'Mine', onUndo: () => seen.push('undo'), onExpire: () => seen.push('expire') }))
    const row = m.container.querySelector<HTMLElement>('[data-undo]')!
    expect(row.getAttribute('role')).toBe('status')
    expect(row.textContent).toContain(O.undo.deleted('Mine'))
    byText(m.container, O.undo.undo)!.click()
    // a flush moves the fake clock on by itself (shouldAdvanceTime: 20 ms a tick), so the boundary is read with a margin
    vi.advanceTimersByTime(UNDO_MS - 1000)
    expect(seen).toEqual(['undo'])
    vi.advanceTimersByTime(1000)
    expect(seen).toEqual(['undo', 'expire'])
    await m.unmount()
  })

  it('takes the focus when the deletion was the keyboard\'s, and expires nothing once gone', async () => {
    const seen: string[] = []
    const m = await mountElement(h(UndoRow, { item: 'mine', name: 'Mine', focus: true, onUndo: () => {}, onExpire: () => seen.push('expire') }))
    expect(document.activeElement).toBe(byText(m.container, O.undo.undo))
    await m.unmount()
    vi.advanceTimersByTime(UNDO_MS)
    expect(seen).toEqual([])
  })
})

describe('ConfirmButton (§6.6)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }); document.documentElement.setAttribute('data-axt-pointer', '') })
  afterEach(() => { vi.useRealTimers(); document.documentElement.removeAttribute('data-axt-pointer') })

  it('a press arms it, a second confirms; untouched for 3 s it turns back', async () => {
    let confirmed = 0
    const m = await mountElement(h(ConfirmButton, { label: 'Clear…', confirmLabel: 'Clear now', onConfirm: () => { confirmed++ } }))
    byText(m.container, 'Clear…')!.click()
    await m.flush()
    const armed = byText(m.container, 'Clear now')!
    expect(armed.hasAttribute('data-armed')).toBe(true)
    expect(armed.querySelector('svg')).not.toBeNull()
    vi.advanceTimersByTime(DISARM_MS)
    await m.flush()
    expect(byText(m.container, 'Clear…')).toBeDefined()
    expect(confirmed).toBe(0)
    byText(m.container, 'Clear…')!.click()
    await m.flush()
    byText(m.container, 'Clear now')!.click()
    await m.flush()
    expect(confirmed).toBe(1)
    await m.unmount()
  })

  it('Escape turns an armed one back at once, wherever the focus is, and does nothing to one at rest (R82)', async () => {
    let confirmed = 0
    const m = await mountElement(h(ConfirmButton, { label: 'Clear…', confirmLabel: 'Clear now', onConfirm: () => { confirmed++ } }))
    const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    pressEscape()
    await m.flush()
    expect(byText(m.container, 'Clear…')).toBeDefined()
    byText(m.container, 'Clear…')!.click()
    await m.flush()
    expect(byText(m.container, 'Clear now')).toBeDefined()
    // the pointer resting on it holds the 3 s timer; Escape does not wait for it
    byText(m.container, 'Clear now')!.dispatchEvent(new Event('pointerover', { bubbles: true }))
    pressEscape()
    await m.flush()
    expect(byText(m.container, 'Clear now')).toBeUndefined()
    expect(byText(m.container, 'Clear…')).toBeDefined()
    // disarmed means a press arms again, and confirms nothing
    byText(m.container, 'Clear…')!.click()
    await m.flush()
    expect(confirmed).toBe(0)
    await m.unmount()
  })

  it('does not turn back while the pointer rests on it', async () => {
    const m = await mountElement(h(ConfirmButton, { label: 'Clear…', confirmLabel: 'Clear now', onConfirm: () => {} }))
    const button = byText(m.container, 'Clear…')!
    button.dispatchEvent(new Event('pointerover', { bubbles: true }))
    button.click()
    await m.flush()
    vi.advanceTimersByTime(DISARM_MS * 2)
    await m.flush()
    expect(byText(m.container, 'Clear now')).toBeDefined()
    byText(m.container, 'Clear now')!.dispatchEvent(new Event('pointerout', { bubbles: true }))
    vi.advanceTimersByTime(DISARM_MS)
    await m.flush()
    expect(byText(m.container, 'Clear…')).toBeDefined()
    await m.unmount()
  })

  it('done, the owner\'s words and the success icon stand in its place', async () => {
    const m = await mountElement(h(ConfirmButton, { label: 'Clear…', confirmLabel: 'Clear now', doneLabel: 'Cleared', done: true, onConfirm: () => {} }))
    expect(m.container.querySelector('.o-status[data-tone="ok"]')!.textContent).toBe('Cleared')
    expect(buttons(m.container)).toHaveLength(0)
    await m.unmount()
  })
})

describe('Combobox (§6.3)', () => {
  const OPTIONS: ComboOption[] = [{ id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' }, { id: 'qwen/qwen3-235b', name: 'Qwen3 235B' }, { id: 'x/plain' }]
  function Harness({ options, onOpen, picks }: { options: readonly ComboOption[] | null; onOpen?: () => void; picks: string[] }) {
    const [value, setValue] = useState('')
    return h(Combobox, { value, options, noMatch: 'No model matches', onOpen, 'aria-label': 'Model', onValue: (text, option) => { setValue(text); if (option) picks.push(option.id) } })
  }
  const type = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const key = (input: HTMLInputElement, k: string) => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

  it('lists the options on focus, filters as typed, and takes one with the arrows and Enter', async () => {
    const picks: string[] = []
    const m = await mountElement(h(Harness, { options: OPTIONS, picks }))
    const input = m.container.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.focus()
    await m.flush()
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(m.container.querySelectorAll('[role="option"]')).toHaveLength(3)
    type(input, 'qw')
    await m.flush()
    expect([...m.container.querySelectorAll('[role="option"]')].map(o => o.textContent)).toEqual(['Qwen3 235Bqwen/qwen3-235b'])
    key(input, 'Enter')
    await m.flush()
    expect(picks).toEqual(['qwen/qwen3-235b'])
    expect(input.value).toBe('qwen/qwen3-235b')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    await m.unmount()
  })

  it('says so when nothing matches, and keeps what was typed as the name', async () => {
    const picks: string[] = []
    const m = await mountElement(h(Harness, { options: OPTIONS, picks }))
    const input = m.container.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.focus()
    type(input, 'mistral-large')
    await m.flush()
    const only = m.container.querySelector('[role="option"]')!
    expect(only.textContent).toBe('No model matches')
    expect(only.getAttribute('aria-disabled')).toBe('true')
    key(input, 'Enter')
    await m.flush()
    expect(picks).toEqual([])
    expect(input.value).toBe('mistral-large')
    await m.unmount()
  })

  it('with no list yet opens none; a press on the field asks for one (a gesture), and busy says so', async () => {
    const opened: number[] = []
    const m = await mountElement(h(Harness, { options: null, picks: [], onOpen: () => opened.push(1) }))
    const input = m.container.querySelector<HTMLInputElement>('input[role="combobox"]')!
    input.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    input.focus()
    await m.flush()
    expect(opened).toEqual([1])
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(m.container.querySelector('[role="listbox"]')).toBeNull()
    await m.rerender(h(Combobox, { value: '', options: null, busy: true, noMatch: '', onValue: () => {} }))
    expect(m.container.querySelector('input')!.getAttribute('aria-busy')).toBe('true')
    await m.unmount()
  })
})

describe('the list helpers', () => {
  it('puts each undo row back where its row was', () => {
    expect(withUndo(['a', 'b', 'c'], [{ index: 1, name: 'x' }])).toEqual([{ item: 'a' }, { gone: { index: 1, name: 'x' } }, { item: 'b' }, { item: 'c' }])
    expect(withUndo(['a'], [{ index: 5, name: 'x' }])).toEqual([{ item: 'a' }, { gone: { index: 5, name: 'x' } }])
    expect(insertAt(['a', 'c'], 1, 'b')).toEqual(['a', 'b', 'c'])
  })

  /** A list of buttons whose rows the test draws (`draw`), and the focus it asks for through the list's own hook */
  interface Asks { draw?: (rows: string[]) => void; focus?: (id: string) => void }
  function Rows({ asks }: { asks: Asks }) {
    const [rows, draw] = useState(['a'])
    const found = useRef(new Map<string, HTMLElement>())
    asks.draw = draw
    asks.focus = useFocusWhenDrawn(id => found.current.get(id))
    return h('div', null, rows.map(id => h('button', { key: id, type: 'button', ref: (el: HTMLElement | null) => { if (el) found.current.set(id, el); else found.current.delete(id) } }, id)))
  }
  const drawn = (c: HTMLElement, id: string) => byText(c, id)!

  it('focuses a row asked for in the commit that draws it, as a write that lands draws its row (Part 7\'s final review, item 23)', async () => {
    const asks: Asks = {}
    const m = await mountElement(h(Rows, { asks }))
    await act(async () => { asks.draw!(['a', 'b']); asks.focus!('b') })
    expect(document.activeElement).toBe(drawn(m.container, 'b'))
    // and a row already drawn at once
    await act(async () => { asks.focus!('a') })
    expect(document.activeElement).toBe(drawn(m.container, 'a'))
    await m.unmount()
  })

  it('a focus asked for a row its commit does not draw lives for that draw only: the row drawn later does not take the focus (item 23b)', async () => {
    const asks: Asks = {}
    const m = await mountElement(h(Rows, { asks }))
    drawn(m.container, 'a').focus()
    await act(async () => { asks.focus!('b') })
    expect(document.activeElement).toBe(drawn(m.container, 'a'))
    // later, the row appears (another tab put it back): the focus stays where the reader has it
    await act(async () => { asks.draw!(['a', 'b']) })
    expect(document.activeElement).toBe(drawn(m.container, 'a'))
    await m.unmount()
  })
})
