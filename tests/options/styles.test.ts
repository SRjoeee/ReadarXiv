// The translation styles (the redesign's design, §6.4): a radio row a style, its sample written in it, a pencil that
// opens the editor under its row for a built-in as for one's own; every control of the editor writes at once; the
// strength's three steps and a value between them; new, duplicate, delete with its undo, and the built-ins restored.
// Fix round 1 (Opus's review of Task 56): the styles card's own arrows, the undo's focus and its choice, an edit
// merged onto the latest profile rather than a stale one, the declarations' own multi-line field, the pencil's
// toggle, and the sample sentence drawn rather than read
import { createElement as h, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_STYLES } from '@/config/appearance'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))

import { Appearance } from '@/entrypoints/options/sections/Appearance'
import { UNDO_MS } from '@/entrypoints/options/ui/UndoRow'
import { O, setLocale } from '@/ui/strings'

function Harness({ start, patches }: { start: Config; patches: Config[] }) {
  const [config, setConfig] = useState(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Appearance, { data })
}
const card = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-row="appearance/styles"]')!
const styleRadios = (c: HTMLElement) => [...card(c).querySelectorAll<HTMLElement>(':scope > [data-srow] [role="radio"]')]
const names = (c: HTMLElement) => styleRadios(c).map(r => document.getElementById(r.getAttribute('aria-labelledby')!)!.textContent)
const button = (c: HTMLElement, name: string) => [...c.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name || b.getAttribute('aria-label') === name)!
const segment = (c: HTMLElement, group: string, name: string) => [...c.querySelectorAll<HTMLElement>(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)].find(r => r.textContent === name)!
const editor = (c: HTMLElement) => c.querySelector<HTMLElement>('.o-editor')
const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const key = (el: Element, keyName: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true }))

/** A `patch` held open until the test releases it, so a focus scheduled too early finds no row yet (fix round 1, item
 *  2): a gate open by default (`Promise.resolve()`), swapped for a pending one right before the write to hold */
function GatedHarness({ start, patches, gate }: { start: Config; patches: Config[]; gate: { promise: Promise<unknown> } }) {
  const [config, setConfig] = useState(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { await gate.promise; const next = fn(config); patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Appearance, { data })
}

/** A `patch` that merges each write onto whatever the *last* write produced, as the real one does (fix round 1, item 4;
 *  `src/shared/surface-config.ts`'s note): the plain `Harness` above reads `config` from its own stale render and
 *  cannot tell two quick, unawaited writes apart, so it would pass even the bug this proves fixed */
function SerialHarness({ start, patches }: { start: Config; patches: Config[] }) {
  const [config, setConfig] = useState(start)
  const store = useRef(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(store.current); store.current = next; patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Appearance, { data })
}

describe('the translation styles (§6.4)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  it('a radio row a style, its sample written in it; a press chooses it; the heading restores the built-ins', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    expect(names(m.container)).toEqual(['Same as the original', 'Green', 'Blue', 'Amber', 'Muted', 'Blurred'])
    const sample = card(m.container).querySelectorAll<HTMLElement>('.o-desc[data-sample]')[1]!
    expect(sample.textContent).toBe(O.reading.previewTarget)
    // the muted style's sample, drawn at its strength (happy-dom keeps a number and drops an oklch() colour)
    expect(card(m.container).querySelectorAll<HTMLElement>('.o-desc[data-sample]')[4]!.style.opacity).toBe('0.7')
    styleRadios(m.container)[2]!.click()
    await m.flush()
    expect(patches.at(-1)?.appearance.activeStyle).toBe('blue')
    await m.unmount()
  })

  it('the pencil opens the editor under its row and chooses the style; each control writes at once', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    expect(patches.at(-1)?.appearance.activeStyle).toBe('green')
    const e = editor(m.container)!
    expect(document.activeElement).toBe(e.querySelector('input'))
    button(e, 'oklch(0.62 0.15 250)').click()
    await m.flush()
    segment(e, O.appearance.editor.strength, 'Lighter').click()
    await m.flush()
    segment(e, O.reading.underline, 'Dashed').click()
    await m.flush()
    const green = patches.at(-1)!.appearance.styles.find(s => s.id === 'green')!
    expect([green.color, green.opacity, green.underline]).toEqual(['oklch(0.62 0.15 250)', 0.7, 'dashed'])
    expect(segment(editor(m.container)!, O.reading.thickness, '2px').closest('[inert]')).toBeNull()
    button(editor(m.container)!, O.appearance.editor.done).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(200)
    // a lone fake timer's state update needs one more `act`-wrapped flush before it commits under
    // vitest's fake timers (the file's other `advanceTimersByTimeAsync` call has a second timer
    // already pending alongside it and does not need this; this one does not, so it is added here)
    await m.flush()
    expect(editor(m.container)).toBeNull()
    await m.unmount()
  })

  it('a strength between the steps (an earlier slider\'s 0.85) chooses no step, and opening the editor writes nothing of it (item 8, no design change)', async () => {
    const patches: Config[] = []
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, styles: DEFAULT_CONFIG.appearance.styles.map(s => (s.id === 'amber' ? { ...s, opacity: 0.85 } : s)) } }
    const m = await mountElement(h(Harness, { start, patches }))
    button(m.container, O.appearance.edit('Amber')).click()
    await m.flush()
    const steps = [...editor(m.container)!.querySelectorAll(`[role="radiogroup"][aria-label="${O.appearance.editor.strength}"] [role="radio"]`)]
    expect(steps.map(s => s.getAttribute('aria-checked'))).toEqual(['false', 'false', 'false'])
    expect(patches.every(p => p.appearance.styles.find(s => s.id === 'amber')!.opacity === 0.85)).toBe(true)
    segment(editor(m.container)!, O.appearance.editor.strength, 'Full').click()
    await m.flush()
    expect(patches.at(-1)!.appearance.styles.find(s => s.id === 'amber')!.opacity).toBe(1)
    await m.unmount()
  })

  it('More (O.more) holds the blur and the declarations, the declarations checked in place and written only when they hold', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    button(m.container, O.appearance.edit('Blue')).click()
    await m.flush()
    const more = button(editor(m.container)!, O.more)
    expect(more.getAttribute('aria-expanded')).toBe('false')
    more.click()
    await m.flush()
    const css = editor(m.container)!.querySelector<HTMLTextAreaElement>('textarea')!
    type(css, 'color: red }')
    await m.flush()
    expect(editor(m.container)!.textContent).toContain(O.reading.advancedRejected.closeBrace)
    expect(patches.at(-1)!.appearance.styles.find(s => s.id === 'blue')!.css).toBe('')
    type(css, 'letter-spacing: 0.02em')
    await m.flush()
    expect(patches.at(-1)!.appearance.styles.find(s => s.id === 'blue')!.css).toBe('letter-spacing: 0.02em')
    await m.unmount()
  })

  it('a new style is added at the end, chosen, its editor open; a duplicate the same, named as a copy', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    button(m.container, O.appearance.create).click()
    await m.flush()
    expect(names(m.container).at(-1)).toBe(O.appearance.newStyle)
    expect(patches.at(-1)!.appearance.activeStyle).toBe(patches.at(-1)!.appearance.styles.at(-1)!.id)
    expect(editor(m.container)).not.toBeNull()
    button(editor(m.container)!, O.reading.duplicate).click()
    await m.flush()
    expect(names(m.container).at(-1)).toBe(`${O.appearance.newStyle} ${O.reading.copySuffix}`)
    await m.unmount()
  })

  it('deleting is undone: the undo row stands in its place for 5 s, and undoing puts the style back, chosen', async () => {
    const patches: Config[] = []
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, activeStyle: 'green' } }
    const m = await mountElement(h(Harness, { start, patches }))
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    button(editor(m.container)!, O.appearance.editor.delete).click()
    await m.flush()
    expect(names(m.container)).not.toContain('Green')
    expect(patches.at(-1)!.appearance.activeStyle).toBe('follow')
    const undoRow = card(m.container).querySelector<HTMLElement>('[data-undo]')!
    expect(undoRow.textContent).toContain(O.undo.deleted('Green'))
    expect([...card(m.container).querySelectorAll(':scope > [data-srow]')].indexOf(undoRow)).toBe(1)
    button(undoRow, O.undo.undo).click()
    await m.flush()
    expect(names(m.container)[1]).toBe('Green')
    expect(patches.at(-1)!.appearance.activeStyle).toBe('green')
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    button(editor(m.container)!, O.appearance.editor.delete).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    await m.unmount()
  })

  it('restoring the built-ins puts them back as shipped and keeps one\'s own', async () => {
    const patches: Config[] = []
    const mine = { ...BUILT_IN_STYLES[0]!, id: 'style-mine0000', name: 'Mine' }
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, styles: [...DEFAULT_CONFIG.appearance.styles.map(s => (s.id === 'green' ? { ...s, color: '#000000' } : s)), mine] } }
    const m = await mountElement(h(Harness, { start, patches }))
    button(m.container, O.appearance.restore).click()
    await m.flush()
    const styles = patches.at(-1)!.appearance.styles
    expect(styles.find(s => s.id === 'green')!.color).toBe(BUILT_IN_STYLES[1]!.color)
    expect(styles.at(-1)).toEqual(mine)
    await m.unmount()
  })

  it('an arrow key in the open editor leaves the choice and the focus where they are; on a style radio it still moves the choice (item 1)', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    const nameField = editor(m.container)!.querySelector<HTMLInputElement>('input')!
    expect(document.activeElement).toBe(nameField)
    key(nameField, 'ArrowRight')
    await m.flush()
    expect(patches.at(-1)?.appearance.activeStyle).toBe('green')
    expect(document.activeElement).toBe(nameField)
    // a segmented control inside the editor is no different: the key is the editor's, not the card's radio group
    key(segment(editor(m.container)!, O.reading.underline, 'None'), 'ArrowRight')
    await m.flush()
    expect(patches.at(-1)?.appearance.activeStyle).toBe('green')
    // the radios keep their own arrows: a style row still answers to one
    key(styleRadios(m.container)[1]!, 'ArrowRight')
    await m.flush()
    expect(patches.at(-1)?.appearance.activeStyle).toBe('blue')
    await m.unmount()
  })

  it('focus after undo waits for the write to land, not a bare animation frame (item 2)', async () => {
    const patches: Config[] = []
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, activeStyle: 'green' } }
    const gate = { promise: Promise.resolve() as Promise<unknown> }
    // spied, not stubbed: replacing requestAnimationFrame outright starves React's own scheduler, which this
    // environment's rAF-under-fake-timers does not reproduce faithfully enough to race against here; recording when
    // it is *called* (real behaviour kept) is what item 2 asks: after the write, not at undo()'s own call
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame')
    const m = await mountElement(h(GatedHarness, { start, patches, gate }))
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    button(editor(m.container)!, O.appearance.editor.delete).click()
    await m.flush()
    const undoRow = card(m.container).querySelector<HTMLElement>('[data-undo]')!
    // the write undo() starts is held open: the focus must not be scheduled while it is still on its way
    let release!: () => void
    gate.promise = new Promise<void>(r => { release = r })
    const callsBefore = raf.mock.calls.length
    button(undoRow, O.undo.undo).click()
    await m.flush()
    expect(raf.mock.calls.length).toBe(callsBefore)
    release()
    await m.flush()
    // only once the write lands is the frame scheduled
    expect(raf.mock.calls.length).toBeGreaterThan(callsBefore)
    raf.mockRestore()
    await m.unmount()
  })

  it('the undo row taking the focus with it: expiring while it holds the focus moves it to the "new style" row (item 2)', async () => {
    const patches: Config[] = []
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, activeStyle: 'green' } }
    const m = await mountElement(h(Harness, { start, patches }))
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    button(editor(m.container)!, O.appearance.editor.delete).click()
    await m.flush()
    const undoButton = button(card(m.container).querySelector<HTMLElement>('[data-undo]')!, O.undo.undo)
    undoButton.focus()
    expect(document.activeElement).toBe(undoButton)
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    await m.flush()
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    expect(document.activeElement).toBe(button(m.container, O.appearance.create))
    await m.unmount()
  })

  it('undo restores the style but not the choice if another was picked while the window was open (item 3)', async () => {
    const patches: Config[] = []
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, activeStyle: 'green' } }
    const m = await mountElement(h(Harness, { start, patches }))
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    button(editor(m.container)!, O.appearance.editor.delete).click()
    await m.flush()
    // green's fallback ('follow') is in effect; the reader picks something else before undoing
    expect(patches.at(-1)!.appearance.activeStyle).toBe('follow')
    styleRadios(m.container)[1]!.click() // blue, now the second radio with green gone
    await m.flush()
    expect(patches.at(-1)!.appearance.activeStyle).toBe('blue')
    const undoRow = card(m.container).querySelector<HTMLElement>('[data-undo]')!
    button(undoRow, O.undo.undo).click()
    await m.flush()
    expect(names(m.container)).toContain('Green')
    // the style is back on the list; the choice stays with what was picked in the meantime
    expect(patches.at(-1)!.appearance.activeStyle).toBe('blue')
    await m.unmount()
  })

  it('two quick edits of different fields both survive: the write merges onto the latest profile, not a stale one (item 4)', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(SerialHarness, { start: DEFAULT_CONFIG, patches }))
    button(m.container, O.appearance.edit('Green')).click()
    await m.flush()
    const e = editor(m.container)!
    // two edits of different fields, fired back to back, before either write has landed
    button(e, 'oklch(0.62 0.15 250)').click()
    segment(e, O.appearance.editor.strength, 'Lighter').click()
    await m.flush()
    const green = patches.at(-1)!.appearance.styles.find(s => s.id === 'green')!
    expect([green.color, green.opacity]).toEqual(['oklch(0.62 0.15 250)', 0.7])
    await m.unmount()
  })

  it('a stored multi-line declaration block is shown in full and kept as it is (item 5)', async () => {
    const patches: Config[] = []
    const css = 'color: red;\nletter-spacing: 0.02em'
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, styles: DEFAULT_CONFIG.appearance.styles.map(s => (s.id === 'blue' ? { ...s, css } : s)) } }
    const m = await mountElement(h(Harness, { start, patches }))
    button(m.container, O.appearance.edit('Blue')).click()
    await m.flush()
    button(editor(m.container)!, O.more).click()
    await m.flush()
    const field = editor(m.container)!.querySelector<HTMLTextAreaElement>('textarea')!
    // happy-dom keeps `rows` as a string (the `.o-desc[data-sample]` opacity check above has the same note)
    expect(Number(field.rows)).toBe(3)
    expect(field.value).toBe(css)
    // untouched, it is written back exactly as it was read: the line breaks are not merged away
    type(field, css)
    await m.flush()
    expect(patches.at(-1)!.appearance.styles.find(s => s.id === 'blue')!.css).toBe(css)
    await m.unmount()
  })

  it('the pencil toggles: pressed again on its own open editor, it closes it and returns the focus to the row (item 6)', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    const pencil = button(m.container, O.appearance.edit('Green'))
    pencil.click()
    await m.flush()
    expect(editor(m.container)).not.toBeNull()
    expect(pencil.getAttribute('aria-expanded')).toBe('true')
    pencil.click()
    await m.flush()
    expect(pencil.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(styleRadios(m.container)[1])
    await vi.advanceTimersByTimeAsync(200)
    await m.flush()
    expect(editor(m.container)).toBeNull()
    await m.unmount()
  })

  it('the sample sentence is drawn, not read: it is out of the radio\'s description and the search words, and carries its own language (item 7)', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches: [] }))
    const greenRadio = styleRadios(m.container)[1]!
    // the name, not the sample, is what the radio is described by (or nothing, since a style row has no other description)
    expect(greenRadio.getAttribute('aria-describedby')).toBeNull()
    expect(document.getElementById(greenRadio.getAttribute('aria-labelledby')!)!.textContent).toBe('Green')
    const sample = card(m.container).querySelectorAll<HTMLElement>('.o-desc[data-sample]')[1]!
    expect(sample.getAttribute('aria-hidden')).toBe('true')
    expect(sample.getAttribute('lang')).toBe('zh')
    // a word from the sample must not turn every style row into a match
    const row = greenRadio.closest<HTMLElement>('[data-srow]')!
    expect(row.dataset.search).not.toContain('傅')
    await m.unmount()
  })
})
