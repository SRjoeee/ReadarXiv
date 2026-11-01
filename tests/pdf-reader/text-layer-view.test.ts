// The layer's text layer as the reading view builds it (engine/view/text-layer.mjs and its place in the layer side's commit;
// docs/PDF-READER.md §11.11): the engine's text layer data made into PDF.js's own text layer, one span an item in reading order,
// its translated spans in the target's language (TV1-TV3); over the fake door, built after the commit at idle, between the SVG and
// the links, the SVG then out of the accessibility tree, kept with a drawing kept off the view or laid ahead, and let go with the drawing it belongs to (TS1-TS10). The real PDF.js's
// placement, selection, copy and search are the browsers' (pnpm e2e:reader; the web's layer.mjs)
import { describe, expect, it } from 'vitest'
import type { TextLayerData } from '@/pdf-reader/engine/layer-proto/reader.mjs'
import { ITEMS_MAX, STR_MAX, textContentOf, textItems, textLayer } from '@/pdf-reader/engine/view/text-layer.mjs'
import { AHEAD_PAGES, TEXT_IDLE_MS } from '@/pdf-reader/engine/view/layer-side.mjs'
import { FakeIO, FakeTextLayerBuilder, flush } from './helpers/reader-fakes'
import { ALL, content, installSideFakes, layerOf, M, nearOn, places, rowOf, settle, setup } from './helpers/side-setup'

const it0 = (o: Record<string, unknown> = {}) => ({ str: 'a', x: 72, y: 698, w: 10, h: 10, base: 700, dir: 'ltr', fontSize: 10, from: 'kept', ...o })
const data = (items: unknown[]): TextLayerData => ({ items, page: { w: 612, h: 792 }, stats: { kept: 0, moved: 0, translated: 0, dropped: 0, work: 0, merged: 0 } }) as TextLayerData
const VP = { width: 612, height: 792, scale: 1, rotation: 0 }

describe('TV1: the items the view places', () => {
  it('takes the items with text, a known source and finite numbers, copied, at most ITEMS_MAX, each at most STR_MAX long', () => {
    const items = [it0({ str: 'k' }), it0({ str: '' }), it0({ from: 'other' }), it0({ x: Number.NaN }), it0({ fontSize: 0 }), it0({ w: -1 }), it0({ str: 7 }), it0({ str: 't', from: 'translated', unit: 3, eol: true, dir: 'rtl' }), null, it0({ str: 'x'.repeat(STR_MAX + 5), from: 'moved' })]
    const got = textItems(data(items))
    expect(got.map(i => [i.str.length, i.from, i.dir, i.eol])).toEqual([[1, 'kept', 'ltr', false], [1, 'translated', 'rtl', true], [STR_MAX, 'moved', 'ltr', false]])
    expect(got[0]).not.toBe(items[0])
    expect(textItems(data(Array.from({ length: ITEMS_MAX + 10 }, () => it0()))).length).toBe(ITEMS_MAX)
    expect(textItems(null)).toEqual([])
  })
})

describe('TV2: a PDF.js text content', () => {
  it('each item an upright run at its baseline, its width the item\'s, one face, a line\'s end where it breaks', () => {
    const c = textContentOf(textItems(data([it0({ str: 'Ab', x: 72, base: 700, w: 15, fontSize: 9 }), it0({ str: 'c', from: 'translated', eol: true }), it0({ str: ' ' })])), 'zh')
    // (a single character drawn twice as wide across as high: PDF.js scales a span of one character to its width only then)
    expect(c.items.map(i => [i.str, i.transform, i.width, i.height, i.hasEOL])).toEqual([['Ab', [9, 0, 0, 9, 72, 700], 15, 9, false], ['c', [20, 0, 0, 10, 72, 700], 10, 10, true], [' ', [10, 0, 0, 10, 72, 700], 10, 10, false]])
    expect(new Set(c.items.map(i => i.fontName)).size).toBe(1)
    expect(Object.values(c.styles)).toEqual([{ fontFamily: 'sans-serif', ascent: 0.8, descent: -0.2, vertical: false }])
    expect(c.lang).toBe('zh')
  })
})

describe('TV3: built by PDF.js\'s builder', () => {
  it('one span an item in order, as text, the translated ones in the target\'s language; laid in the copy\'s frame when upright', async () => {
    const hostile = '<img src=x onerror=alert(1)>'
    const t = await textLayer(data([it0({ str: '3' }), it0({ str: hostile, from: 'translated' }), it0({ str: 'f(x)', from: 'moved' })]), { viewport: VP, Builder: FakeTextLayerBuilder as never, lang: 'zh' })
    expect(t).not.toBeNull()
    const spans = [...(t?.div.querySelectorAll('span') ?? [])]
    expect(spans.map(s => s.textContent)).toEqual(['3', hostile, 'f(x)'])
    expect(t?.div.querySelector('img')).toBeNull()
    expect(spans.map(s => s.lang)).toEqual(['', 'zh', ''])
    expect(t?.div.classList.contains('axt-text')).toBe(true)
    expect(t?.div.hasAttribute('data-axt-frame')).toBe(true)
    // (no Tab stop of its own)
    expect(t?.div.hasAttribute('tabindex')).toBe(false)
    t?.cancel()
    expect(FakeTextLayerBuilder.cancelled.at(-1)?.div).toBe(t?.div)
    // (a page turned a quarter keeps PDF.js's box, which its rotation rule turns)
    const turned = await textLayer(data([it0()]), { viewport: { ...VP, rotation: 90 }, Builder: FakeTextLayerBuilder as never })
    expect(turned?.div.hasAttribute('data-axt-frame')).toBe(false)
  })
  it('none where nothing can be placed, there is no viewport, or the host\'s PDF.js has no builder', async () => {
    expect(await textLayer(data([]), { viewport: VP, Builder: FakeTextLayerBuilder as never })).toBeNull()
    expect(await textLayer(data([it0()]), { viewport: null, Builder: FakeTextLayerBuilder as never })).toBeNull()
    expect(await textLayer(data([it0()]), { viewport: VP, Builder: null })).toBeNull()
  })
})

describe('the layer side: the text layer with the laid page (the fake door)', () => {
  installSideFakes()
  const opened = async (o: { textBuilder?: unknown; keepPixels?: number; ahead?: number } = { textBuilder: FakeTextLayerBuilder }) => {
    const s = await setup({ ...o, links: () => [{ boxes: [100, 600, 300, 612], url: 'https://example.org/', name: 'example.org', moved: true, order: 0 }] })
    await nearOn(s, [1, 2])
    s.side.tell(await ALL())
    await settle(s)
    return s
  }
  const textOn = (s: Awaited<ReturnType<typeof setup>>, n: number) => layerOf(s, n)?.querySelector(':scope > .textLayer') ?? null

  it('TS1: built after the commit, between the SVG and the links; the SVG\'s text then drawn, not read', async () => {
    const s = await opened()
    for (const n of [1, 2]) {
      const l = layerOf(s, n) as HTMLElement
      expect([...l.children].map(c => `${c.tagName.toLowerCase()}${c.classList.contains('textLayer') ? '.textLayer' : ''}`)).toEqual(['canvas', 'svg', 'div.textLayer', 'div'])
      expect(l.querySelector(':scope > svg')?.getAttribute('aria-hidden')).toBe('true')
      // (the fake door's page: its number kept, one translated line in the target's language)
      expect([...(textOn(s, n)?.querySelectorAll('span') ?? [])].map(x => [x.textContent, x.lang])).toEqual([[`${n}`, ''], [`page ${n}`, 'zh']])
    }
    expect(s.side.probe().texts).toBe(2)
  })

  it('TS2: let go with its page far from the view where no drawing is kept (keepPixels 0), cancelled in PDF.js\'s registry; built again with the page laid again', async () => {
    const s = await opened({ textBuilder: FakeTextLayerBuilder, keepPixels: 0 })
    const was = textOn(s, 2)
    await nearOn(s, [2], false)
    await settle(s)
    expect(textOn(s, 2)).toBeNull()
    expect(FakeTextLayerBuilder.cancelled.map(b => b.div)).toContain(was)
    await nearOn(s, [2])
    await settle(s)
    expect(textOn(s, 2)).not.toBeNull()
    expect(textOn(s, 2)).not.toBe(was)
  })

  it('TS3: one that comes after its page was let go is not put anywhere, and is cancelled', async () => {
    const s = await setup({ textBuilder: FakeTextLayerBuilder })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    // (laid and committed, its text layer not built yet: the place let go first)
    for (let i = 0; i < 40 && !layerOf(s, 1)?.querySelector(':scope > svg'); i++) { await flush(); if (s.door.layer) await s.door.advance(); await s.clock.advance(0) }
    expect(layerOf(s, 1)?.querySelector(':scope > svg')).not.toBeNull()
    expect(textOn(s, 1)).toBeNull()
    await nearOn(s, [1], false)
    await settle(s)
    expect(s.panes.right.querySelectorAll('.textLayer').length).toBe(0)
    expect(FakeTextLayerBuilder.made.length).toBe(FakeTextLayerBuilder.cancelled.length)
  })

  it('TS6: one whose page is let go while it is built (no drawing kept) is not put anywhere, and is cancelled', async () => {
    let open = () => {}
    const gate = new Promise<void>(r => { open = r })
    class Slow extends FakeTextLayerBuilder { override async render(o: { viewport: unknown }) { await gate; return super.render(o) } }
    const s = await setup({ textBuilder: Slow, keepPixels: 0 })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    expect(FakeTextLayerBuilder.made.length).toBe(1)
    expect(textOn(s, 1)).toBeNull()
    await nearOn(s, [1], false)
    await settle(s)
    open()
    await settle(s)
    expect(s.panes.right.querySelectorAll('.textLayer').length).toBe(0)
    expect(FakeTextLayerBuilder.cancelled).toEqual(FakeTextLayerBuilder.made)
  })

  it('TS7: a drawing kept off the view keeps its text layer, and brings the same one back in place; let go past the budget, it is cancelled', async () => {
    const s = await opened({ textBuilder: FakeTextLayerBuilder, ahead: 0 })
    const was = textOn(s, 2) as HTMLElement
    expect(was).not.toBeNull()
    await nearOn(s, [2], false)
    expect(s.side.probe().drawings).toBe(1)
    expect(was.isConnected).toBe(false)
    expect(FakeTextLayerBuilder.cancelled.map(b => b.div)).not.toContain(was)
    FakeIO.tell([places(s)[1] as HTMLElement], true)
    expect(content(s, 2)).toBe('layer')
    expect(textOn(s, 2)).toBe(was)
    await settle(s)
    expect(textOn(s, 2)).toBe(was)
    expect(s.side.probe().texts).toBe(2)
    // (kept again, then let go with the side: its text layer cancelled with its copy)
    await nearOn(s, [2], false)
    s.side.dispose()
    expect(FakeTextLayerBuilder.cancelled.map(b => b.div)).toContain(was)
  })

  it('TS8: one built while its page is kept off the view goes into the kept drawing and comes back with it', async () => {
    let open = () => {}
    const gate = new Promise<void>(r => { open = r })
    class Slow extends FakeTextLayerBuilder { override async render(o: { viewport: unknown }) { await gate; return super.render(o) } }
    const s = await setup({ textBuilder: Slow, ahead: 0 })
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    expect(textOn(s, 1)).toBeNull()
    await nearOn(s, [1], false)
    expect(s.side.probe().drawings).toBe(1)
    open()
    await settle(s)
    expect(FakeTextLayerBuilder.cancelled).toEqual([])
    FakeIO.tell([places(s)[0] as HTMLElement], true)
    expect(textOn(s, 1)).not.toBeNull()
    expect(textOn(s, 1)).toBe(FakeTextLayerBuilder.made[0]?.div)
  })

  it('TS9: a page laid ahead has its text layer built off the view, in place the moment it comes near', async () => {
    const s = await setup({ door: { rows: 'gate' }, textBuilder: FakeTextLayerBuilder })
    const m = await M()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    s.side.end()
    await settle(s, 4)
    await settle(s, 60)
    expect(s.side.probe()).toMatchObject({ aheadKept: AHEAD_PAGES, texts: 1 + AHEAD_PAGES })
    FakeIO.tell([places(s)[1] as HTMLElement], true)
    expect(content(s, 2)).toBe('layer')
    expect([...(textOn(s, 2)?.querySelectorAll('span') ?? [])].map(x => x.textContent)).toContain('2')
  })

  it('TS10: another target\'s pages carry their text layer in that target\'s language', async () => {
    const s = await setup({ door: { rows: 'gate' }, textBuilder: FakeTextLayerBuilder, ahead: 0 })
    const m = await M()
    await nearOn(s, [1])
    s.side.tell(await ALL())
    s.side.take(m.index.units.map((_, id) => rowOf(id)))
    s.side.end()
    await settle(s)
    const langs = () => [...(textOn(s, 1)?.querySelectorAll('span') ?? [])].map(x => x.lang).filter(Boolean)
    expect(langs()).toEqual(['zh'])
    s.side.retarget('ja')
    await settle(s)
    s.side.take(m.index.units.map((_, id) => rowOf(id, `ja ${id}`)))
    s.side.end()
    await settle(s)
    expect(langs()).toEqual(['ja'])
  })

  it('TS11: none is built while a zoom\'s steps scale the pane (its stack marked scaling); built once they are drawn again', async () => {
    const s = await setup({ textBuilder: FakeTextLayerBuilder, ahead: 0 })
    const stack = s.panes.right.querySelector(':scope > .pdfViewer') as HTMLElement
    stack.setAttribute('data-axt-scaling', '')
    await nearOn(s, [1])
    s.side.tell(await ALL())
    await settle(s)
    expect(layerOf(s, 1)?.querySelector(':scope > svg')).not.toBeNull()
    expect(textOn(s, 1)).toBeNull()
    expect(FakeTextLayerBuilder.made).toEqual([])
    // (asked again a while on, not in a loop of its own)
    await s.clock.advance(3 * TEXT_IDLE_MS)
    await settle(s)
    expect(FakeTextLayerBuilder.made).toEqual([])
    stack.removeAttribute('data-axt-scaling')
    await s.clock.advance(TEXT_IDLE_MS + 10)
    await settle(s)
    expect(textOn(s, 1)).not.toBeNull()
    expect(FakeTextLayerBuilder.made.length).toBe(1)
  })

  it('TS4: dispose lets every text layer go', async () => {
    const s = await opened()
    expect(FakeTextLayerBuilder.made.length).toBe(2)
    s.side.dispose()
    expect(FakeTextLayerBuilder.cancelled.length).toBe(2)
  })

  it('TS5: a host whose PDF.js has no builder draws the page as before, with no text layer and nothing warned', async () => {
    const s = await opened({})
    expect([...(layerOf(s, 1) as HTMLElement).children].map(c => c.tagName.toLowerCase())).toEqual(['canvas', 'svg', 'div'])
    expect(s.warned().filter(w => /text/.test(w))).toEqual([])
  })
})
