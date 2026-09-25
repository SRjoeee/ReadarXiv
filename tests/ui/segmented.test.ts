import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Segmented } from '@/ui/Segmented'
import { mountElement } from './render-hook'

afterEach(() => { document.body.innerHTML = '' })

describe('Segmented', () => {
  it('greys a disabled option, keeps its title as the reason, and does not choose it (the PDF reader\'s design, §9.2)', async () => {
    const onChange = vi.fn()
    const options = [{ value: 'stack', label: 'Stacked', title: 'Not for the bilingual PDF', disabled: true }, { value: 'side', label: 'Side by side', title: 'Side by side' }]
    const { container } = await mountElement(createElement(Segmented<string>, { value: 'side', options, onChange }))
    const [stack, side] = [...container.querySelectorAll('button')]
    expect([stack!.getAttribute('aria-disabled'), stack!.title]).toEqual(['true', 'Not for the bilingual PDF'])
    stack!.click()
    expect(onChange).not.toHaveBeenCalled()
    side!.click()
    expect(onChange).toHaveBeenCalledWith('side')
  })
})
