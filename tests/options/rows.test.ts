// The settings page's row grammar (the redesign's design, §6.2): the parts a row carries and the edges they sit on
// (measured in a real browser by tests/e2e/probes/settings-align.mjs), how each kind of row answers a press, the
// separators stepping aside for a hovered row, and the search's marks
import { Ellipsis } from 'lucide'
import { createElement as h } from 'react'
import { describe, expect, it } from 'vitest'
import { Card, GroupHeading } from '@/entrypoints/options/ui/Card'
import { IconButton, Row, Status, Value } from '@/entrypoints/options/ui/Row'
import { SearchQuery } from '@/entrypoints/options/ui/search'
import { Switch } from '@/ui/controls/Switch'
import { mountElement } from '../ui/render-hook'

const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-srow]')]

describe('the row grammar (the redesign\'s design, §6.2)', () => {
  it('a row carries its place, its search words and its parts; a lead and a level say which edge its words take', async () => {
    const m = await mountElement(h(Card, null,
      h(Row, { row: 'translate/language', label: 'Target language', description: 'Into', words: 'Language', trailing: h(Value, null, 'Japanese') }),
      h(Row, { label: 'Sub', level: 1, lead: h('span', null, '+') })))
    const [first, second] = rows(m.container)
    expect(first!.dataset.row).toBe('translate/language')
    expect(first!.dataset.search).toBe('target language into language')
    expect([...first!.querySelectorAll('[data-part]')].map(e => e.getAttribute('data-part'))).toEqual(['words', 'trail'])
    expect(first!.hasAttribute('data-press')).toBe(false)
    expect(second!.dataset.level).toBe('1')
    expect(second!.hasAttribute('data-lead')).toBe(true)
    expect(second!.querySelector('[data-part="lead"]')).not.toBeNull()
    await m.unmount()
  })

  it('a radio row is named by its label, described by its description, and chosen by a press anywhere but a button in it', async () => {
    const chosen: string[] = []
    const m = await mountElement(h(Card, { role: 'radiogroup', label: 'Services' }, h(Row, {
      kind: 'radio', label: 'Google', description: 'Free', checked: false, onChoose: how => chosen.push(how),
      trailing: h(IconButton, { icon: Ellipsis, label: 'More for Google', hover: true }),
    })))
    const radio = m.container.querySelector<HTMLElement>('[role="radio"]')!
    expect(radio.getAttribute('aria-checked')).toBe('false')
    expect(radio.tabIndex).toBe(-1)
    expect(document.getElementById(radio.getAttribute('aria-labelledby')!)!.textContent).toBe('Google')
    expect(document.getElementById(radio.getAttribute('aria-describedby')!)!.textContent).toBe('Free')
    rows(m.container)[0]!.click()
    m.container.querySelector<HTMLElement>('[data-icon-button]')!.click()
    radio.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(chosen).toEqual(['pointer', 'key'])
    expect(rows(m.container)[0]!.hasAttribute('data-press')).toBe(true)
    // the mark is the radio's direct child, so that it reads the radio's state (Part 3's Radio), and the row has a lead
    expect(radio.firstElementChild!.classList.contains('radio')).toBe(true)
    expect(rows(m.container)[0]!.hasAttribute('data-lead')).toBe(true)
    await m.unmount()
  })

  it('a disabled radio row is greyed and chosen by nothing', async () => {
    const chosen: string[] = []
    const m = await mountElement(h(Card, null, h(Row, { kind: 'radio', label: 'Chrome', checked: false, disabled: true, muted: true, onChoose: how => chosen.push(how) })))
    rows(m.container)[0]!.click()
    expect(chosen).toEqual([])
    expect(m.container.querySelector('[role="radio"]')!.getAttribute('aria-disabled')).toBe('true')
    expect(rows(m.container)[0]!.hasAttribute('data-muted')).toBe(true)
    await m.unmount()
  })

  it('a switch\'s whole row is its label (§9): a press on its words flips the switch, a press on the switch flips it once', async () => {
    const flips: boolean[] = []
    const m = await mountElement(h(Card, null, h(Row, { label: 'Images', toggles: true, trailing: h(Switch, { label: 'Images', checked: false, onChange: on => flips.push(on) }) })))
    m.container.querySelector<HTMLElement>('.o-label')!.click()
    m.container.querySelector<HTMLElement>('[role="switch"]')!.click()
    expect(flips).toEqual([true, true])
    await m.unmount()
  })

  it('a button row is one button, its value and chevron inside it', async () => {
    let pressed = 0
    const m = await mountElement(h(Card, null, h(Row, { kind: 'button', label: 'Prompt', expanded: false, onPress: () => { pressed++ }, trailing: h(Value, null, 'Default') })))
    const button = m.container.querySelector<HTMLButtonElement>('button[data-srow]')!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.querySelector('.o-value svg')).not.toBeNull()
    button.click()
    expect(pressed).toBe(1)
    await m.unmount()
  })

  it('a hovered row\'s separators step aside: its own, and the next row the reader can see, past a closed reveal', async () => {
    const press = () => {}
    const m = await mountElement(h(Card, null,
      h(Row, { kind: 'button', label: 'One', onPress: press }),
      h(Row, { kind: 'button', label: 'Two', onPress: press }),
      h('div', { inert: true }, h(Row, { label: 'Hidden' })),
      h(Row, { kind: 'button', label: 'Three', onPress: press }),
      h(Row, { label: 'Plain' })))
    const all = rows(m.container)
    all[1]!.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(all.map(r => r.hasAttribute('data-sep-off'))).toEqual([false, true, false, true, false])
    all[3]!.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(all.map(r => r.hasAttribute('data-sep-off'))).toEqual([false, false, false, true, true])
    // a row that does not light on hover moves no separator
    all[4]!.dispatchEvent(new Event('pointerover', { bubbles: true }))
    expect(all.some(r => r.hasAttribute('data-sep-off'))).toBe(false)
    m.container.querySelector<HTMLElement>('[data-card]')!.dispatchEvent(new Event('pointerleave'))
    expect(all.some(r => r.hasAttribute('data-sep-off'))).toBe(false)
    await m.unmount()
  })

  it('marks what a search found, in the label and the description, whatever the case', async () => {
    const m = await mountElement(h(SearchQuery.Provider, { value: 'high' }, h(Card, null, h(Row, { label: 'Highlight', description: 'Highlights on hover' }))))
    expect([...m.container.querySelectorAll('mark.o-hit')].map(e => e.textContent)).toEqual(['High', 'High'])
    await m.unmount()
  })

  it('a status carries its tone\'s icon; a heading its aside and its action', async () => {
    const m = await mountElement(h('div', null,
      h(GroupHeading, { title: 'LLM', aside: 'Only for LLM services', action: h('button', { type: 'button' }, 'Restore') }),
      h(Status, { tone: 'alert' }, 'API key no longer valid')))
    expect(m.container.querySelector('[data-heading] h2')!.textContent).toBe('LLM')
    expect(m.container.querySelector('.o-aside')!.textContent).toBe('Only for LLM services')
    expect(m.container.querySelector('.o-status[data-tone="alert"] svg')).not.toBeNull()
    await m.unmount()
  })
})
