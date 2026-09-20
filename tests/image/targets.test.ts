import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extract, markBlocks } from '@/core/extractor'
import { collectImageTargets } from '@/core/image'
import { IMG_CLASS, T_CLASS } from '@/core/marks'
import { docOf } from '../renderer/helpers'

// The targets of image translation (DESIGN §15.2): bitmaps inside the translation root; those inside blocks and inside our own nodes do not count

describe('collectImageTargets', () => {
  it('2507.00150: 6 plot images, the id taken from the element id', () => {
    const doc = new DOMParser().parseFromString(readFileSync(join(import.meta.dirname, '../fixtures/arxiv/2507.00150.html'), 'utf8'), 'text/html')
    markBlocks(extract(doc))
    const targets = collectImageTargets(doc)
    expect(targets).toHaveLength(6)
    expect(targets.map(t => t.id)).toEqual(['S2.F1.g1', 'S2.F2.g1', 'S4.F3.g1', 'S4.F4.g1', 'S4.F5.g1', 'S4.F6.g1'])
    expect(targets.every(t => t.el.tagName === 'IMG')).toBe(true)
  })

  it('an image inside a block is not translated (it is cloned into the translation with the placeholder, and in only mode the whole original block is hidden); those inside translations and overlays do not count either', () => {
    const doc = docOf(`<figure class="ltx_figure"><img class="ltx_graphics" src="a.png"><figcaption class="ltx_caption" id="c">Cap</figcaption></figure>`
      + `<div class="ltx_para"><p class="ltx_p" id="p">Inline <img class="ltx_graphics" src="b.png"> here.</p></div>`
      + `<figure class="ltx_figure ${T_CLASS}"><img class="ltx_graphics" src="c.png"></figure>`
      + `<div class="${IMG_CLASS}"><img class="ltx_graphics" src="d.png"></div>`)
    markBlocks(extract(doc))
    const targets = collectImageTargets(doc)
    expect(targets).toHaveLength(1)
    expect(targets[0]!.el.getAttribute('src')).toBe('a.png')
    expect(targets[0]!.id).toBe('axt-img-1') // an image without an id is numbered
  })

  it('an inline TikZ picture is no image target: its labels are HTML in the page and blocks of the text run (§15.6)', () => {
    const node = (inner: string) =>
      `<foreignObject><span class="ltx_foreignobject_container"><span class="ltx_foreignobject_content">${inner}</span></span></foreignObject>`
    const doc = docOf(`<figure class="ltx_figure"><span class="ltx_inline-block"><svg id="words" class="ltx_picture">${node('Shared Expert')}</svg></span><img class="ltx_graphics" id="bitmap" src="a.png"></figure>`)
    const blocks = extract(doc)
    markBlocks(blocks)
    expect(collectImageTargets(doc).map(t => [t.id, t.kind])).toEqual([['bitmap', 'raster']])
    expect(blocks.map(block => block.unit)).toEqual(['picturelabel'])
  })

  it('without block marks images inside blocks are collected too: the caller must collect only after the marks are written', () => {
    const doc = docOf('<div class="ltx_para"><p class="ltx_p" id="p">Inline <img class="ltx_graphics" src="b.png"> here.</p></div>')
    expect(collectImageTargets(doc)).toHaveLength(1)
    markBlocks(extract(doc))
    expect(collectImageTargets(doc)).toHaveLength(0)
  })
})
