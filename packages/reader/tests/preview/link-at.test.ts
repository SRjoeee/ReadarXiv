// A laid link's place in Page.links (compose/links.ts `data-axt-at`): the previews read a laid link's owner and piece there
// (preview/wire.ts, the numbers of one citation one bracket), so it is the link's index in Page.links, whatever the page's text
// content holds before the words under it. The reading order (the links' order in the layer) is the text's, apart. On staging a
// citation's card stood under the link by about 32 px for each text item before it: the attribute held the index of the first
// text item under the link, and the previews took another link's box for its bracket.
import { describe, expect, it } from 'vitest'
import { linkLayer } from '../../src/compose/links.ts'
import type { Page } from '../../src/compose/page.ts'

const viewport = { width: 612, height: 792, convertToViewportPoint: (x: number, y: number) => [x, 792 - y] } as never
const hooks = { open: () => {}, follow: () => {}, unnamed: () => 'link' }
/** a text item of the page's content: its string at (x, y), 9 pt, its width */
const item = (str: string, x: number, y: number, width: number) => ({
  str,
  dir: 'ltr',
  transform: [9, 0, 0, 9, x, y],
  width,
  height: 9,
  fontName: 'f',
  hasEOL: false,
})

describe('a laid link’s data-axt-at is its index in Page.links', () => {
  it('whatever text items stand before the words under it, and in reading order apart', () => {
    // (three lines of text, each line's words six items, then a bracket's numbers: [1, 2] on the first line, [3] on the third;
    // Page.links states the third line's link first)
    const items = []
    for (let l = 0; l < 3; l++)
      for (let w = 0; w < 6; w++) items.push(item(`word${l}${w}`, 72 + w * 40, 700 - l * 12, 30))
    items.splice(6, 0, item('1', 320, 700, 4.5), item('2', 327, 700, 4.5))
    items.push(item('3', 320, 676, 4.5))
    const page: Page = {
      page: 2,
      wait: { rows: [], faces: [] },
      members: [],
      links: [
        [[320, 676, 324.5, 685], { dest: '"cite.c"' }, 4, undefined, '9'],
        [[320, 700, 324.5, 709], { dest: '"cite.a"' }, 3, undefined, '5'],
        [[327, 700, 331.5, 709], { dest: '"cite.b"' }, 3, undefined, '5'],
      ],
    }
    const layer = linkLayer(page, viewport, hooks, { items, styles: {} } as never) as HTMLElement
    const links = [...layer.querySelectorAll<HTMLElement>('a.axt-link')]
    // (reading order: the first line's two numbers, then the third line's)
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      `#${encodeURIComponent('"cite.a"')}`,
      `#${encodeURIComponent('"cite.b"')}`,
      `#${encodeURIComponent('"cite.c"')}`,
    ])
    // (each one's place in Page.links)
    expect(links.map((a) => a.dataset.axtAt)).toEqual(['1', '2', '0'])
    for (const a of links) {
      const own = page.links[Number(a.dataset.axtAt)]!
      expect(a.getAttribute('href')).toBe(`#${encodeURIComponent((own[1] as { dest: string }).dest)}`)
    }
  })
})
