import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extract, markBlocks, type TextBlock } from '@/core/extractor'
import { MIRROR_CLASS, SPLIT_ATTR, SPLIT_CLASS } from '@/core/renderer/attrs'
import { renderImage } from '@/core/renderer/image'
import { createPrep, rootsOf } from '@/core/renderer/prep'
import { splitFigures } from '@/core/renderer/split-figures'
import { resetFitCache } from '@/core/renderer/table-fit'
import { renderText } from '@/core/renderer/translation'
import { docOf, frag } from './helpers'

// Incremental tidying (issue #46): each pass touches only the containers of the blocks whose DOM just changed, the mirror runs once per session,
// and the column width is read before anything is written, and only when stale. The cases here use effects observable in happy-dom:
// the split (an .axt-split sibling), the mirror (.axt-mirror), the number of column-width reads

/**
 * Two captioned figures, each in its own section (the shape of a real paper). The caption is a block;
 * its root is the figure's parent — each its own section — so touching one does not spill onto the other
 */
const TWO_FIGURES = '<section class="ltx_section" id="s1"><figure id="f1" class="ltx_figure"><img class="ltx_graphics" src="a.png" alt="">'
  + '<figcaption class="ltx_caption" id="c1">Figure 1.</figcaption></figure></section>'
  + '<section class="ltx_section" id="s2"><figure id="f2" class="ltx_figure"><img class="ltx_graphics" src="b.png" alt="">'
  + '<figcaption class="ltx_caption" id="c2">Figure 2.</figcaption></figure></section>'

/** A body paragraph with a margin note: its outer box is what the stacking pushes down (§7.2) */
const NOTED = '<div class="ltx_para"><p class="ltx_p" id="p9">Noted<span class="ltx_note ltx_role_footnote" id="n1"><sup class="ltx_note_mark">1</sup>'
  + '<span class="ltx_note_outer" id="o1"><span class="ltx_note_content">Note.</span></span></span>.</p></div>'

const EQUATION = '<div class="ltx_para"><p class="ltx_p" id="p1">Text.</p>'
  + '<table class="ltx_equation ltx_eqn_table" id="E1"><tbody><tr><td class="ltx_eqn_cell">x=1</td></tr></tbody></table></div>'

/** A watch that never reports: for the cases that build a prep by hand and are not about the width */
const noWatch = () => () => undefined

function setup(html: string, opts: { side?: boolean; columnWidth?: (root: Element) => number } = {}) {
  const doc = docOf(html)
  const blocks = extract(doc)
  markBlocks(blocks)
  const columnWidth = opts.columnWidth ?? (() => 484)
  // The root's width as the tidy layer watches it: `resize(width)` is the browser reporting one
  let report: (width: number) => void = () => undefined
  const stopWatching = vi.fn()
  const watchWidth = vi.fn((_root: Element, onWidth: (width: number) => void) => { report = onWidth; return stopWatching })
  const trace = vi.fn()
  const prep = createPrep(doc, { isSide: () => opts.side ?? true, columnWidth, watchWidth, trace })
  return {
    doc, blocks, prep, watchWidth, stopWatching,
    byId: (id: string) => blocks.find(b => b.el.id === id) as TextBlock,
    resize: (width: number) => report(width),
    /** How many passes have run: each reports one line, the ones that changed nothing included */
    passes: () => trace.mock.calls.filter(c => String(c[0]).startsWith('side prep')).length,
  }
}

const flush = () => vi.advanceTimersByTime(150)

describe('createPrep', () => {
  beforeEach(() => { vi.useFakeTimers(); resetFitCache() })
  afterEach(() => vi.useRealTimers())

  it('touch(B) tidies only B\'s container: the untouched figure stays as it was', () => {
    const { doc, prep, byId } = setup(TWO_FIGURES)
    renderText(byId('c1'), frag(doc, '图 1。'))
    renderText(byId('c2'), frag(doc, '图 2。'))
    prep.touch([byId('c1')])
    flush()
    expect(doc.getElementById('f1')!.nextElementSibling?.classList.contains(SPLIT_CLASS)).toBe(true)
    // The untouched one **stays stale** — that is what “touch only the changed area” means; widen the scope to document and this case fails
    expect(doc.getElementById('f2')!.nextElementSibling?.classList.contains(SPLIT_CLASS) ?? false).toBe(false)
  })

  it('the touch root is one level above the figure: the caption block\'s parent is the figure, and splitFigures scans descendants only', () => {
    const { doc, prep, byId } = setup(TWO_FIGURES)
    renderText(byId('c1'), frag(doc, '图 1。'))
    const roots = rootsOf([byId('c1').el])
    // The root is not the figure itself but its parent (the section here)
    expect(roots).toEqual([doc.getElementById('s1')])
    prep.touch([byId('c1')])
    flush()
    expect(doc.getElementById('f1')!.nextElementSibling?.classList.contains(SPLIT_CLASS)).toBe(true)
  })

  it('entering side runs a full pass: both figures split', () => {
    const { doc, prep, byId } = setup(TWO_FIGURES)
    renderText(byId('c1'), frag(doc, '图 1。'))
    renderText(byId('c2'), frag(doc, '图 2。'))
    prep.side(true)
    flush()
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(2)
  })

  it('a touch and an entry into side in one round run as a full pass', () => {
    const { doc, prep, byId } = setup(TWO_FIGURES)
    renderText(byId('c1'), frag(doc, '图 1。'))
    renderText(byId('c2'), frag(doc, '图 2。'))
    prep.touch([byId('c1')])
    prep.side(true)
    flush()
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(2)
  })

  it('the mirror runs once per session: the second full pass builds no mirror for a formula inserted later', () => {
    const { doc, prep } = setup(EQUATION)
    prep.side(true)
    flush()
    expect(doc.querySelectorAll(`.${MIRROR_CLASS}`)).toHaveLength(1)
    // Imitates “an unmirrored formula appearing later” — it does not happen on a real page, which is exactly why every pass need not rescan
    const late = doc.getElementById('E1')!.cloneNode(true) as Element
    late.id = 'E2'
    doc.getElementById('E1')!.parentElement!.append(late)
    prep.side(true)
    flush()
    expect(doc.querySelectorAll(`.${MIRROR_CLASS}`)).toHaveLength(1)
  })

  it('after reset() the mirror may run once more', () => {
    const { doc, prep } = setup(EQUATION)
    prep.side(true)
    flush()
    const late = doc.getElementById('E1')!.cloneNode(true) as Element
    late.id = 'E2'
    doc.getElementById('E1')!.parentElement!.append(late)
    prep.reset()
    prep.side(true)
    flush()
    expect(doc.querySelectorAll(`.${MIRROR_CLASS}`)).toHaveLength(2)
  })

  it('before the block marks are written the mirror does not count as run: that pass mirrors nothing, the next one after the marks does', () => {
    const doc = docOf(EQUATION)
    const blocks = extract(doc) // deliberately no markBlocks
    const prep = createPrep(doc, { isSide: () => true, columnWidth: () => 484, watchWidth: noWatch })
    prep.side(true)
    flush()
    expect(doc.querySelectorAll(`.${MIRROR_CLASS}`)).toHaveLength(0)
    markBlocks(blocks)
    prep.side(true)
    flush()
    expect(doc.querySelectorAll(`.${MIRROR_CLASS}`)).toHaveLength(1)
  })

  it('not in side mode: no split, no mirror — not even on the one full pass that still comes there, the fonts\'', () => {
    const doc = docOf(TWO_FIGURES + EQUATION)
    const fonts = new EventTarget()
    Object.defineProperty(doc, 'fonts', { value: fonts, configurable: true })
    const blocks = extract(doc)
    markBlocks(blocks)
    const trace = vi.fn()
    const prep = createPrep(doc, { isSide: () => false, columnWidth: () => 484, watchWidth: noWatch, trace })
    const c1 = blocks.find(b => b.el.id === 'c1') as TextBlock
    renderText(c1, frag(doc, '图 1。'))
    prep.touch([c1])
    flush()
    fonts.dispatchEvent(new Event('loadingdone'))
    flush()
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(0)
    expect(doc.querySelectorAll(`.${MIRROR_CLASS}`)).toHaveLength(0)
  })

  it('the column width is read only when stale: two passes in a row read once', () => {
    const columnWidth = vi.fn(() => 484)
    const { prep, byId, doc } = setup(EQUATION, { columnWidth })
    renderText(byId('p1'), frag(doc, '文。'))
    prep.touch([byId('p1')])
    flush()
    prep.touch([byId('p1')])
    flush()
    expect(columnWidth).toHaveBeenCalledTimes(1)
  })

  it('under side the root\'s width is watched: a width that changed re-reads the column in a full pass, the same width again does nothing', () => {
    // Scaling a table makes the watched root report a size change itself: without the gate the two would oscillate
    const columnWidth = vi.fn(() => 484)
    const { prep, resize, passes, watchWidth, doc } = setup(EQUATION, { columnWidth })
    prep.side(true)
    flush()
    expect(watchWidth).toHaveBeenCalledTimes(1)
    expect(watchWidth.mock.calls[0]![0]).toBe(doc.querySelector('article.ltx_document'))
    expect(columnWidth).toHaveBeenCalledTimes(1)
    const before = passes()
    // The first report is the observer's own, on being attached: a width, so a pass
    resize(1200)
    flush()
    expect(columnWidth).toHaveBeenCalledTimes(2)
    expect(passes()).toBe(before + 1)
    resize(1200)
    flush()
    expect(columnWidth).toHaveBeenCalledTimes(2)
    expect(passes()).toBe(before + 1)
    resize(900)
    flush()
    expect(columnWidth).toHaveBeenCalledTimes(3)
    expect(passes()).toBe(before + 2)
  })

  it('entering side twice watches once; leaving ends the watch, and entering again starts one', () => {
    const { prep, watchWidth, stopWatching } = setup(EQUATION)
    prep.side(true)
    prep.side(true)
    expect(watchWidth).toHaveBeenCalledTimes(1)
    prep.side(false)
    expect(stopWatching).toHaveBeenCalledTimes(1)
    prep.side(true)
    expect(watchWidth).toHaveBeenCalledTimes(2)
  })

  it('reset ends the watch too: a restored page is left with no observer of ours', () => {
    const { prep, stopWatching } = setup(EQUATION)
    prep.side(true)
    flush()
    prep.reset()
    expect(stopWatching).toHaveBeenCalledTimes(1)
    // Nothing left to stop
    prep.reset()
    prep.side(false)
    expect(stopWatching).toHaveBeenCalledTimes(1)
  })

  it('the column width is measured from the translation root, not from <html>: measureColumn finds the grid track by closest(article)', () => {
    // Caught by e2e: passed <html>, closest finds nothing, the fallback's parentElement is null → column width 0 → not one table shrinks
    const columnWidth = vi.fn((_root: Element) => 484)
    const { prep, byId, doc } = setup(EQUATION, { columnWidth })
    renderText(byId('p1'), frag(doc, '文。'))
    prep.touch([byId('p1')])
    flush()
    expect(columnWidth).toHaveBeenCalledTimes(1)
    expect(columnWidth.mock.calls[0]![0]).toBe(doc.querySelector('article.ltx_document'))
  })

  it('fonts loaded: the column width is re-read and a full tidy pass runs', () => {
    const columnWidth = vi.fn(() => 484)
    const doc = docOf(TWO_FIGURES)
    const fonts = new EventTarget()
    Object.defineProperty(doc, 'fonts', { value: fonts, configurable: true })
    const blocks = extract(doc)
    markBlocks(blocks)
    const prep = createPrep(doc, { isSide: () => true, columnWidth, watchWidth: noWatch })
    const c1 = blocks.find(b => b.el.id === 'c1') as TextBlock
    const c2 = blocks.find(b => b.el.id === 'c2') as TextBlock
    renderText(c1, frag(doc, '图 1。'))
    renderText(c2, frag(doc, '图 2。'))
    prep.touch([c1])
    flush()
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(1)
    fonts.dispatchEvent(new Event('loadingdone'))
    flush()
    // Full: the other one is split too; the column width was re-read once
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(2)
    expect(columnWidth).toHaveBeenCalledTimes(2)
  })

  it('the font subscription lasts from a session\'s first touch to the next reset: a restored page is left with no listener of ours', () => {
    const columnWidth = vi.fn(() => 484)
    const doc = docOf(TWO_FIGURES)
    const fonts = new EventTarget()
    const add = vi.spyOn(fonts, 'addEventListener')
    const remove = vi.spyOn(fonts, 'removeEventListener')
    Object.defineProperty(doc, 'fonts', { value: fonts, configurable: true })
    const blocks = extract(doc)
    markBlocks(blocks)
    const prep = createPrep(doc, { isSide: () => true, columnWidth, watchWidth: noWatch })
    // Created with the page, long before any translation: nothing subscribed yet
    expect(add).not.toHaveBeenCalled()
    prep.side(true)
    prep.touch([blocks[0] as TextBlock])
    expect(add).toHaveBeenCalledTimes(1)
    flush()
    const passes = columnWidth.mock.calls.length
    prep.reset()
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0]?.[1]).toBe(add.mock.calls[0]?.[1])
    fonts.dispatchEvent(new Event('loadingdone'))
    flush()
    expect(columnWidth).toHaveBeenCalledTimes(passes)
    // The next session subscribes again
    prep.side(true)
    expect(add).toHaveBeenCalledTimes(2)
  })

  it('leaving side withdraws the queued pass and takes back what the passes wrote inline: the alignment margins, the margin-note offsets', () => {
    const { doc, prep, byId } = setup(TWO_FIGURES + NOTED)
    prep.side(true)
    flush()
    const translation = renderText(byId('c1'), frag(doc, '图 1。')) as HTMLElement
    prep.touch([byId('c1')])
    // What a pass under side writes where there is layout to measure — happy-dom has none, so written by hand
    translation.style.marginTop = '8px'
    const outer = doc.getElementById('o1') as HTMLElement
    outer.style.transform = 'translateY(24px)'
    prep.side(false)
    flush()
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(0)
    expect(translation.style.marginTop).toBe('')
    expect(outer.style.transform).toBe('')
  })

  it('the split copies\' duplicated media are silent under side, where the original shows beside them, and speak outside it (§7.4b)', () => {
    const { doc, prep, byId } = setup(TWO_FIGURES)
    // What the caption says is nothing to this case: any translation makes the figure due for a split
    renderText(byId('c1'), frag(doc, 'Figure 1, translated.'))
    prep.side(true)
    flush()
    const media = doc.querySelector(`.${SPLIT_CLASS} img`)!
    expect(media.hasAttribute('inert')).toBe(true)
    prep.side(false)
    expect(media.hasAttribute('inert')).toBe(false)
    prep.side(true)
    expect(media.hasAttribute('inert')).toBe(true)
  })
})

describe('createPrep × the image overlay (DESIGN §15.2)', () => {
  beforeEach(() => { vi.useFakeTimers(); resetFitCache() })
  afterEach(() => vi.useRealTimers())

  const IMG_FIGURE = '<section class="ltx_section"><figure class="ltx_figure" id="F1"><img class="ltx_graphics" src="a.png" id="F1.g1"><figcaption class="ltx_caption" id="c1">Figure 1.</figcaption></figure></section>'
  const overlayOn = (doc: Document) => {
    const el = doc.querySelector('img') as HTMLImageElement
    const target = { id: el.id, el, kind: 'raster' as const }
    renderImage(target, [{ x: 0, y: 0, w: 0.3, h: 0.05, lines: 1, source: 'Static charge', text: '静态电荷' }])
    return target
  }

  it('touch([image target]) under side splits the figure it is in: the root goes through the outermost figure\'s parent', () => {
    const { doc, prep } = setup(IMG_FIGURE)
    const target = overlayOn(doc)
    prep.touch([target])
    flush()
    expect(doc.querySelector(`.${SPLIT_CLASS} img`)).not.toBeNull()
  })

  it('under side the figure\'s only translation (the overlay) is removed: the old copy has to go, not keep wearing the old labels (Codex on #89)', () => {
    const NO_CAPTION = '<section class="ltx_section"><figure class="ltx_figure" id="F1"><img class="ltx_graphics" src="a.png" id="F1.g1"></figure></section>'
    const { doc, prep } = setup(NO_CAPTION)
    const target = overlayOn(doc)
    prep.touch([target])
    flush()
    expect(doc.querySelector(`.${SPLIT_CLASS}`)).not.toBeNull()
    // The new round is all identity translations: the overlay is removed, and run goes through onRendered → prep.touch
    doc.querySelector('.axt-img')!.remove()
    prep.touch([target])
    flush()
    expect(doc.querySelector(`.${SPLIT_CLASS}`)).toBeNull()
    expect(doc.querySelector(`[${SPLIT_ATTR}]`)).toBeNull()
  })

  it('outside side a copy with a stale signature is dropped: the case of the overlay arriving only after side → only', () => {
    const doc = docOf(IMG_FIGURE)
    const blocks = extract(doc)
    markBlocks(blocks)
    renderText(blocks.find(b => b.el.id === 'c1') as TextBlock, frag(doc, '图 1。'))
    splitFigures(doc) // once split under side
    expect(doc.querySelector(`.${SPLIT_CLASS}`)).not.toBeNull()
    const prep = createPrep(doc, { isSide: () => false, columnWidth: () => 484 })
    const target = overlayOn(doc)
    prep.touch([target])
    flush()
    expect(doc.querySelector(`.${SPLIT_CLASS}`)).toBeNull()
    expect(doc.querySelector(`[${SPLIT_ATTR}]`)).toBeNull()
  })
})

describe('rootsOf', () => {
  it('the parent, the parents of the enclosing blocks, the outermost figure\'s parent; contained roots removed', () => {
    const doc = docOf('<div class="ltx_acknowledgements" id="outer">Thanks <h6 class="ltx_title" id="inner">Ack</h6></div>')
    const blocks = extract(doc)
    markBlocks(blocks)
    const inner = blocks.find(b => b.el.id === 'inner')!
    const roots = rootsOf([inner.el])
    // inner's parent is outer (a block), outer's parent is the translation root; the root contains outer, so only the root remains
    expect(roots).toHaveLength(1)
    expect(roots[0]!.classList.contains('ltx_document')).toBe(true)
  })

  it('two blocks in one container count as one root', () => {
    const doc = docOf('<div class="ltx_para"><p class="ltx_p" id="a">A.</p><p class="ltx_p" id="b">B.</p></div>')
    const blocks = extract(doc)
    expect(rootsOf(blocks.map(b => b.el))).toHaveLength(1)
  })
})
