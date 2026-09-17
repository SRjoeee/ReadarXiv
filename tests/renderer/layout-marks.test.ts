// The marks side mode's style sheet reads where it once asked `:has()` (DESIGN §7.2): who writes each, when it appears
// and when it goes. The style's effect is measured in a real browser (tests/e2e/layout.mjs); what is guarded here
// is that every insertion and removal keeps the marks telling the truth about the structure around it.
import { describe, expect, it } from 'vitest'
import { extract, markBlocks, PAIRS_ATTR, type TextBlock } from '@/core/extractor'
import { IMG_CLASS, T_CLASS } from '@/core/marks'
import { MIRRORED_ATTR, MIRROR_CLASS, NOTE_TRANSLATED_ATTR, PANELS_ATTR, SPLIT_ATTR, SPLIT_CLASS, TAGGED_ATTR, TAIL_ATTR, TRANSLATED_ATTR } from '@/core/renderer/attrs'
import { renderFailed } from '@/core/renderer/failed'
import { renderImage } from '@/core/renderer/image'
import { createMirrors } from '@/core/renderer/mirror'
import { localizeNotes } from '@/core/renderer/notes'
import { clearAllPending, renderPending } from '@/core/renderer/pending'
import { markStructure } from '@/core/renderer/side-layout'
import { splitFigures } from '@/core/renderer/split-figures'
import { clearTranslation, renderText } from '@/core/renderer/translation'
import { docOf, frag } from './helpers'

const blockOf = (doc: Document, id: string) => extract(doc).find(b => b.el.id === id) as TextBlock

describe('data-axt-pairs: the container mark, written with the block marks', () => {
  it('every element between a block and the translation root is marked; the root and the blocks are not', () => {
    const doc = docOf('<section class="ltx_section" id="s"><div class="ltx_para" id="d"><p class="ltx_p" id="p1">One.</p></div>'
      + '<figure class="ltx_figure" id="f"><figcaption class="ltx_caption" id="c">Cap</figcaption></figure></section>')
    markBlocks(extract(doc))
    expect(['s', 'd', 'f'].map(id => doc.getElementById(id)!.hasAttribute(PAIRS_ATTR))).toEqual([true, true, true])
    expect(['p1', 'c'].map(id => doc.getElementById(id)!.hasAttribute(PAIRS_ATTR))).toEqual([false, false])
    expect(doc.querySelector('.ltx_document')!.hasAttribute(PAIRS_ATTR)).toBe(false)
  })

  it('idempotent: marking twice changes nothing', () => {
    const doc = docOf('<section class="ltx_section"><div class="ltx_para"><p class="ltx_p" id="p1">One.</p></div></section>')
    markBlocks(extract(doc))
    const once = doc.documentElement.outerHTML
    markBlocks(extract(doc))
    expect(doc.documentElement.outerHTML).toBe(once)
  })
})

describe('markStructure: the page\'s own structure, marked once per session', () => {
  const doc = () => docOf('<figure class="ltx_figure ltx_flex_figure" id="multi"><div class="ltx_flex_cell ltx_flex_size_2"></div><div class="ltx_flex_cell ltx_flex_size_2"></div></figure>'
    + '<figure class="ltx_figure ltx_flex_figure" id="single"><div class="ltx_flex_cell ltx_flex_size_1"></div></figure>'
    + '<ul class="ltx_itemize"><li class="ltx_item" id="tagged"><span class="ltx_tag">•</span><div class="ltx_para"><p class="ltx_p">a</p></div></li>'
    + '<li class="ltx_item" id="bare"><div class="ltx_para"><p class="ltx_p">b</p></div></li></ul>')

  it('a multi-panel flex figure and a list item with a marker child are marked; a single-column figure and a bare item are not', () => {
    const d = doc()
    expect(markStructure(d)).toBe(2)
    expect(d.getElementById('multi')!.hasAttribute(PANELS_ATTR)).toBe(true)
    expect(d.getElementById('single')!.hasAttribute(PANELS_ATTR)).toBe(false)
    expect(d.getElementById('tagged')!.hasAttribute(TAGGED_ATTR)).toBe(true)
    expect(d.getElementById('bare')!.hasAttribute(TAGGED_ATTR)).toBe(false)
  })

  it('idempotent: a second pass marks nothing', () => {
    const d = doc()
    markStructure(d)
    expect(markStructure(d)).toBe(0)
  })
})

describe('data-axt-tail: the original whose translation-side node closes its container', () => {
  const PARA = '<div class="ltx_para"><p class="ltx_p" id="p1">One.</p><p class="ltx_p" id="p2">Two.</p></div>'
  const tail = (doc: Document, id: string) => doc.getElementById(id)!.hasAttribute(TAIL_ATTR)

  it('the translation as the last child marks its original; one followed by another block does not', () => {
    const doc = docOf(PARA)
    markBlocks(extract(doc))
    renderText(blockOf(doc, 'p1'), frag(doc, '一。'))
    expect(tail(doc, 'p1')).toBe(false)
    renderText(blockOf(doc, 'p2'), frag(doc, '二。'))
    expect(tail(doc, 'p2')).toBe(true)
    expect(tail(doc, 'p1')).toBe(false)
  })

  it('the skeleton and the failure widget count too, and every removal takes the mark away', () => {
    const doc = docOf(PARA)
    markBlocks(extract(doc))
    const p2 = blockOf(doc, 'p2')
    renderPending(p2)
    expect(tail(doc, 'p2')).toBe(true)
    clearAllPending(doc)
    expect(tail(doc, 'p2')).toBe(false)
    renderFailed(p2, 'network: offline', () => {})
    expect(tail(doc, 'p2')).toBe(true)
    clearTranslation(p2)
    expect(tail(doc, 'p2')).toBe(false)
    renderText(p2, frag(doc, '二。'))
    expect(tail(doc, 'p2')).toBe(true)
    clearTranslation(p2)
    expect(tail(doc, 'p2')).toBe(false)
  })

  it('a retranslation keeps the mark: the old node goes and the new one lands in the same place', () => {
    const doc = docOf(PARA)
    markBlocks(extract(doc))
    const p2 = blockOf(doc, 'p2')
    renderText(p2, frag(doc, '二。'))
    renderText(p2, frag(doc, '贰。'))
    expect(doc.querySelectorAll(`.${T_CLASS}`)).toHaveLength(1)
    expect(tail(doc, 'p2')).toBe(true)
  })
})

describe('data-axt-mirrored: the original a mirror follows', () => {
  const FIG = '<div class="ltx_para" id="d"><p class="ltx_p" id="p1">One.</p><svg id="g" class="ltx_picture"></svg></div>'

  it('createMirrors marks the mirrored child; as the last pair it is the tail as well', () => {
    const doc = docOf(FIG)
    markBlocks(extract(doc))
    renderText(blockOf(doc, 'p1'), frag(doc, '一。'))
    expect(createMirrors(doc)).toBe(1)
    const g = doc.getElementById('g')!
    expect(g.hasAttribute(MIRRORED_ATTR)).toBe(true)
    expect(g.nextElementSibling!.classList.contains(MIRROR_CLASS)).toBe(true)
    expect(g.hasAttribute(TAIL_ATTR)).toBe(true)
  })

  it('an image overlay taking the mirror\'s place removes the mirrored mark; the overlay carries no axt-t, so the tail goes too', () => {
    const doc = docOf(FIG)
    markBlocks(extract(doc))
    renderText(blockOf(doc, 'p1'), frag(doc, '一。'))
    createMirrors(doc)
    const g = doc.getElementById('g')!
    renderImage({ id: 'g', el: g, kind: 'svg' }, [{ x: 0, y: 0, w: 0.3, h: 0.05, lines: 1, source: 'Static charge', text: '静态电荷' }])
    expect(doc.querySelector(`.${MIRROR_CLASS}`)).toBeNull()
    expect(g.nextElementSibling!.classList.contains(IMG_CLASS)).toBe(true)
    expect(g.hasAttribute(MIRRORED_ATTR)).toBe(false)
    expect(g.hasAttribute(TAIL_ATTR)).toBe(false)
  })

  it('a figure being split drops the mirrors inside it together with their marks', () => {
    const doc = docOf('<figure class="ltx_figure" id="f"><img class="ltx_graphics" src="a.png" id="i"><figcaption class="ltx_caption" id="c">Cap</figcaption></figure>')
    markBlocks(extract(doc))
    createMirrors(doc)
    const img = doc.getElementById('i')!
    expect(img.hasAttribute(MIRRORED_ATTR)).toBe(true)
    renderText(blockOf(doc, 'c'), frag(doc, '图'))
    expect(splitFigures(doc)).toBe(1)
    expect(img.hasAttribute(MIRRORED_ATTR)).toBe(false)
    const fig = doc.getElementById('f')!
    expect(fig.hasAttribute(SPLIT_ATTR)).toBe(true)
    // The copy is the last child of the translation root: the figure closes it
    expect(fig.hasAttribute(TAIL_ATTR)).toBe(true)
  })
})

describe('data-axt-translated: a frontmatter note holding a real translation', () => {
  const NOTE = '<div class="ltx_authors"><span class="ltx_creator ltx_role_author"><span class="ltx_personname">A. Author</span>'
    + '<span id="n" class="ltx_note ltx_note_frontmatter ltx_thanks_note ltx_role_thanks"><sup class="ltx_note_mark">†</sup>'
    + '<span class="ltx_note_outer" id="o"><span class="ltx_note_content"><sup class="ltx_note_mark">†</sup><span class="ltx_note_type">thanks: </span>Supported by the fund.</span></span></span></span></div>'
  const marks = (doc: Document) => [doc.getElementById('n')!.hasAttribute(TRANSLATED_ATTR), doc.getElementById('o')!.hasAttribute(TRANSLATED_ATTR)]

  it('the skeleton does not count, the translation does, the failure widget does not, and a removed translation unmarks (Codex on #73)', () => {
    const doc = docOf(NOTE)
    const blocks = extract(doc)
    markBlocks(blocks)
    const note = blocks.find(b => b.el.classList.contains('ltx_note_content')) as TextBlock
    expect(note).toBeDefined()
    renderPending(note)
    expect(marks(doc)).toEqual([false, false])
    renderText(note, frag(doc, '致谢：基金资助。'))
    expect(marks(doc)).toEqual([true, true])
    renderFailed(note, 'network: offline', () => {})
    expect(marks(doc)).toEqual([false, false])
    renderText(note, frag(doc, '致谢：基金资助。'))
    expect(marks(doc)).toEqual([true, true])
    clearTranslation(note)
    expect(marks(doc)).toEqual([false, false])
  })

  it('a block outside any frontmatter note leaves no such mark', () => {
    const doc = docOf('<div class="ltx_para"><p class="ltx_p" id="p1">One.</p></div>')
    markBlocks(extract(doc))
    renderText(blockOf(doc, 'p1'), frag(doc, '一。'))
    expect(doc.querySelector(`[${TRANSLATED_ATTR}]`)).toBeNull()
  })
})

describe('data-axt-note-translated: a footnote copy that carries its translation', () => {
  /** A figure whose caption has a footnote: the source caption with the note and the note's translation, the caption's translation with the rebuilt copy, and loose media so the figure splits */
  const FIGURE = '<figure class="ltx_figure" id="F1"><img class="ltx_graphics" src="a.png" id="F1.g1">'
    + '<figcaption class="ltx_caption" id="cap" data-axt-id="cap">Caption<span class="ltx_note ltx_role_footnote"><sup class="ltx_note_mark">1</sup>'
    + '<span class="ltx_note_outer"><span class="ltx_note_content" data-axt-id="n1"><sup class="ltx_note_mark">1</sup>English note</span>'
    + `<span class="ltx_note_content ${T_CLASS}" data-axt-for="n1"><sup class="ltx_note_mark">1</sup>中文脚注</span></span></span></figcaption>`
    + `<figcaption class="ltx_caption ${T_CLASS}" data-axt-for="cap">题注<span class="ltx_note ltx_role_footnote"><sup class="ltx_note_mark">1</sup>`
    + '<span class="ltx_note_outer"><span class="ltx_note_content"><sup class="ltx_note_mark">1</sup>English note</span></span></span></figcaption></figure>'

  it('a split figure\'s clone keeps the mark the strip took off, and a later localisation pass keeps it too (Devin on #221)', () => {
    const doc = docOf(FIGURE)
    expect(localizeNotes(doc)).toBe(1)
    const original = doc.querySelector(`.${T_CLASS} .ltx_note_content`)!
    expect(original.hasAttribute(NOTE_TRANSLATED_ATTR)).toBe(true)
    expect(splitFigures(doc)).toBe(1)
    const copy = doc.querySelector(`.${SPLIT_CLASS} .ltx_note_content`)!
    expect(copy.querySelector(':scope > .axt-note-t')).not.toBeNull()
    expect(copy.getAttributeNames().filter(n => n.startsWith('data-axt-'))).toEqual([NOTE_TRANSLATED_ATTR])
    // The copy is placed already and its content unchanged: the pass returns early, and the mark stands
    expect(localizeNotes(doc)).toBe(0)
    expect(copy.hasAttribute(NOTE_TRANSLATED_ATTR)).toBe(true)
    expect(original.hasAttribute(NOTE_TRANSLATED_ATTR)).toBe(true)
  })
})
