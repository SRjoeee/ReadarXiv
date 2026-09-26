import { createElement } from 'react'
import { Settings } from 'lucide'
import { afterEach, describe, expect, it } from 'vitest'
import { GLYPH_A, GLYPH_WEN } from '@/pdf-reader/ui/display-glyphs'
import { DisplayIcon, Icon, WEN_GAIN } from '@/pdf-reader/ui/icons'
import { mountElement } from '../../ui/render-hook'

afterEach(() => { document.body.innerHTML = '' })

describe("the reader's icons (the reader's design, §4.2, §6.2)", () => {
  it('draw Lucide at 16 px, stroke 1.5, hidden from assistive technology', async () => {
    const { container } = await mountElement(createElement(Icon, { node: Settings }))
    const svg = container.querySelector('svg')!
    expect([svg.getAttribute('width'), svg.getAttribute('stroke-width'), svg.getAttribute('aria-hidden')]).toEqual(['16', '1.5', 'true'])
  })

  it('draw the three displays on one pane: A in the original, the split, U+6587 in the translation', async () => {
    const paths = async (display: 'original' | 'bilingual' | 'translation') => {
      const { container, unmount } = await mountElement(createElement(DisplayIcon, { display }))
      const svg = container.querySelector('svg')!
      const out = { box: svg.getAttribute('viewBox'), rect: !!svg.querySelector('rect'), d: [...svg.querySelectorAll('path')].map(p => p.getAttribute('d')), gain: svg.querySelector('path')?.getAttribute('stroke-width') }
      await unmount()
      return out
    }
    expect(await paths('original')).toMatchObject({ box: '0 0 24 18', rect: true, d: [GLYPH_A] })
    expect(await paths('bilingual')).toMatchObject({ rect: true, d: ['M12 2.5v13'] })
    expect(await paths('translation')).toMatchObject({ rect: true, d: [GLYPH_WEN], gain: String(WEN_GAIN) })
  })

  it('draw the pane as the maintainer\'s round 11 set: a 1 px frame on the pixel grid, radius 3, the split crisp; U+6587 given back 0.18 px (2026-09-25)', async () => {
    const drawn = async (display: 'original' | 'bilingual' | 'translation') => {
      const { container, unmount } = await mountElement(createElement(DisplayIcon, { display }))
      const svg = container.querySelector('svg')!, rect = svg.querySelector('rect')!
      const out = { stroke: svg.getAttribute('stroke-width'), rect: ['x', 'y', 'width', 'height', 'rx'].map(k => rect.getAttribute(k)), split: svg.querySelector('path:not([fill])')?.getAttribute('shape-rendering') ?? null }
      await unmount()
      return out
    }
    expect(await drawn('original')).toEqual({ stroke: '1', rect: ['2.5', '2.5', '19', '13', '3'], split: null })
    expect((await drawn('bilingual')).split).toBe('crispEdges')
    expect(WEN_GAIN).toBe(0.18)
  })
})
