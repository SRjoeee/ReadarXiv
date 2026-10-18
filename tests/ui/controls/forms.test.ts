// The settings page's form pieces (Part 3's interfaces; the redesign's design, §6.2, §8, §9): a labelled field and its
// text field, a radio's mark, a reveal
import { createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, TextInput, useField } from '@/ui/controls/Field'
import { Radio } from '@/ui/controls/radio'
import { Reveal } from '@/ui/controls/Reveal'
import { mountElement } from '../render-hook'

afterEach(() => { document.body.innerHTML = '' })

describe('Field and TextInput', () => {
  it('labels its control, and describes it by its hint', async () => {
    const { container } = await mountElement(createElement(Field, { label: 'Address', hint: 'An OpenAI-compatible endpoint' }, createElement(TextInput, { placeholder: 'https://' })))
    const input = container.querySelector('input')!, label = container.querySelector('label')!
    expect([input.className, input.type, input.id !== '', label.htmlFor === input.id]).toEqual(['input', 'text', true, true])
    expect(document.getElementById(input.getAttribute('aria-describedby')!)!.textContent).toBe('An OpenAI-compatible endpoint')
    expect(input.hasAttribute('aria-invalid')).toBe(false)
  })

  it('at fault: invalid, described by its reason first and then its hint, the reason after a decorative icon', async () => {
    const { container } = await mountElement(createElement(Field, { label: 'Key', hint: 'Local addresses need none', error: 'Enter the API key' }, createElement(TextInput)))
    const input = container.querySelector('input')!
    const described = input.getAttribute('aria-describedby')!.split(' ').map(id => document.getElementById(id)!.textContent)
    expect([input.getAttribute('aria-invalid'), described]).toEqual(['true', ['Enter the API key', 'Local addresses need none']])
    const icon = container.querySelector('.field-error')!.firstElementChild!
    expect([icon.tagName.toLowerCase(), icon.getAttribute('aria-hidden')]).toEqual(['svg', 'true'])
  })

  it('a text field outside a field takes nothing from one, and keeps what it is given', async () => {
    const { container } = await mountElement(createElement(TextInput, { id: 'own', className: 'wide', 'aria-label': 'Search' }))
    const input = container.querySelector('input')!
    expect([input.id, input.className, input.hasAttribute('aria-describedby'), input.hasAttribute('aria-invalid')]).toEqual(['own', 'input wide', false, false])
  })

  it('a text field inside a field keeps its own id, aria-describedby and aria-invalid, given: its own props win (Task 17, parked)', async () => {
    const { container } = await mountElement(createElement(Field, { label: 'Key', hint: 'Local addresses need none', error: 'Enter the API key' }, createElement(TextInput, { id: 'own', 'aria-describedby': 'own-hint', 'aria-invalid': 'false' })))
    const input = container.querySelector('input')!
    expect([input.id, input.getAttribute('aria-describedby'), input.getAttribute('aria-invalid')]).toEqual(['own', 'own-hint', 'false'])
  })

  it('hands its wiring to a control of another kind through useField (Part 5\'s combobox)', async () => {
    function Combobox() {
      const field = useField()
      return createElement('input', { role: 'combobox', id: field?.id, 'aria-describedby': field?.describedBy, 'aria-invalid': field?.invalid || undefined })
    }
    const { container } = await mountElement(createElement(Field, { label: 'Model', error: 'Choose a model' }, createElement(Combobox)))
    const input = container.querySelector('input')!
    expect([container.querySelector('label')!.htmlFor === input.id, input.getAttribute('aria-invalid')]).toEqual([true, 'true'])
  })
})

describe('Radio', () => {
  it('is a radio\'s mark alone: decorative, the direct child the sheet reads the radio\'s state through', async () => {
    const { container } = await mountElement(createElement('div', { role: 'radio', 'aria-checked': 'true' }, createElement(Radio)))
    const mark = container.querySelector('[role="radio"] > .radio')!
    expect([mark.tagName, mark.getAttribute('aria-hidden'), mark.childNodes.length]).toEqual(['SPAN', 'true', 0])
  })
})

describe('Reveal', () => {
  it('holds its contents inert while closed, and lets them be while open (§9)', async () => {
    const reveal = (open: boolean) => createElement(Reveal, { open, id: 'more' }, createElement('input'))
    const { container, rerender } = await mountElement(reveal(false))
    const outer = container.querySelector<HTMLElement>('.reveal')!
    expect([outer.id, outer.hasAttribute('data-open'), outer.firstElementChild!.hasAttribute('inert')]).toEqual(['more', false, true])
    await rerender(reveal(true))
    expect([outer.hasAttribute('data-open'), outer.firstElementChild!.hasAttribute('inert')]).toEqual([true, false])
  })
})
