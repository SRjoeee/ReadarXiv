import { Settings } from 'lucide'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { LucideIcon } from '@/ui/LucideIcon'
import { mountElement } from './render-hook'

// One control, one icon: the popup's settings gear is the glyph the floating button draws for the same control
// (tests/entry/floating-button.test.ts holds the other side). The popup used to carry a gear of its own, drawn by hand

describe('LucideIcon', () => {
  it('draws the nodes Lucide exports, on its grid and with its strokes, hidden from assistive technology', async () => {
    const mounted = await mountElement(createElement(LucideIcon, { node: Settings }))
    const svg = mounted.container.querySelector('svg') as SVGElement
    expect([svg.getAttribute('viewBox'), svg.getAttribute('stroke-width'), svg.getAttribute('aria-hidden'), svg.getAttribute('width')]).toEqual(['0 0 24 24', '2', 'true', '18'])
    const drawn = [...svg.children].map(child => [child.tagName.toLowerCase(), Object.fromEntries([...child.attributes].map(a => [a.name, a.value]))])
    expect(drawn).toEqual(Settings.map(([tag, attrs]) => [tag, Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, String(value)]))]))
    await mounted.unmount()
  })
})
