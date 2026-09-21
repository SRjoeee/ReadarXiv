import { describe, expect, it } from 'vitest'
import { extract, type TableBlock, type TextBlock } from '@/core/extractor'
import { T_CLASS } from '@/core/marks'
import { FOR_ATTR, INLINE_ATTR, PENDING_CLASS } from '@/core/renderer/attrs'
import { restore } from '@/core/renderer/page'
import { clearAllPending, renderPending } from '@/core/renderer/pending'
import { renderFailed } from '@/core/renderer/failed'
import { SKELETON_CLASS, activeSkeletonAnimations } from '@/core/renderer/skeleton'
import { clearTranslation, renderText } from '@/core/renderer/translation'
import { docOfChecked, frag } from './helpers'

// Every document a case renders into is held to the tail mark's invariant afterwards (helpers.ts)
const docOf = docOfChecked()

/** The translations the tests fill in */
const ZH = { text: '文本。', heading: '引言', row: '其中平均曲率为', old: '旧。', fresh: '新。' }

const page = '<h2 class="ltx_title ltx_title_section" id="s1">Intro</h2><p class="ltx_p" id="p1">Text.</p>'
  + '<table class="ltx_tabular" id="T1"><tbody><tr><td class="ltx_td">Model</td><td class="ltx_td">1</td></tr></tbody></table>'

// The waiting node (§7.6): inserted after the original block before the request, a skeleton inside; replaced by the real translation when it arrives
describe('renderPending', () => {
  it('same tag as the original block, its class plus axt-t axt-pending, data-axt-for, a skeleton inside; inserted after the original', () => {
    const doc = docOf(page)
    const p = extract(doc).find(b => b.id === 'p1') as TextBlock
    const node = renderPending(p)
    expect(node.tagName).toBe('P')
    expect(node.className).toBe(`ltx_p ${T_CLASS} ${PENDING_CLASS}`)
    expect(node.getAttribute(FOR_ATTR)).toBe('p1')
    expect(node.previousElementSibling).toBe(p.el)
    expect(node.children).toHaveLength(1)
    expect(node.firstElementChild?.classList.contains(SKELETON_CLASS)).toBe(true)
    expect(node.textContent).toBe('')
  })

  it('idempotent: calling again returns the same node', () => {
    const doc = docOf(page)
    const p = extract(doc).find(b => b.id === 'p1') as TextBlock
    expect(renderPending(p)).toBe(renderPending(p))
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(1)
  })

  it('a table block gets a div placeholder (it is a table only once the whole clone arrives)', () => {
    const doc = docOf(page)
    const t = extract(doc).find(b => b.kind === 'table') as TableBlock
    const node = renderPending(t)
    expect(node.tagName).toBe('DIV')
    expect(node.classList.contains(T_CLASS)).toBe(true)
    expect(node.previousElementSibling).toBe(t.el)
  })

  it('a short heading: the pending node shares the heading\'s line (§7.3), so the layout does not jump when the translation arrives', () => {
    const doc = docOf(page)
    const title = extract(doc).find(b => b.id === 's1') as TextBlock
    const node = renderPending(title)
    expect(title.el.hasAttribute(INLINE_ATTR)).toBe(true)
    expect(node.hasAttribute(INLINE_ATTR)).toBe(true)
  })

  it('the translation arrives: nothing pending remains, only the real translation', () => {
    const doc = docOf(page)
    const p = extract(doc).find(b => b.id === 'p1') as TextBlock
    renderPending(p)
    const node = renderText(p, frag(doc, ZH.text))
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(0)
    expect(doc.querySelectorAll(`.${SKELETON_CLASS}`)).toHaveLength(0)
    expect(p.el.nextElementSibling).toBe(node)
    expect(node.classList.contains(PENDING_CLASS)).toBe(false)
  })

  it('clearTranslation / clearAllPending / restore all clear pending together with the skeleton', () => {
    const doc = docOf(page)
    const blocks = extract(doc)
    const [s1, p1] = blocks as [TextBlock, TextBlock]
    renderPending(s1)
    renderPending(p1)
    clearTranslation(p1)
    clearTranslation(s1)
    expect(doc.querySelectorAll(`.${PENDING_CLASS}`)).toHaveLength(0)
    for (const b of blocks) renderPending(b)
    expect(clearAllPending(doc)).toBe(3)
    for (const b of blocks) renderPending(b)
    restore(doc)
    expect(doc.querySelectorAll(`.${T_CLASS}, .${SKELETON_CLASS}`)).toHaveLength(0)
  })
})

// A child coming or going under a parent costs the parent's whole subtree a style recalculation in arXiv's own style
// sheet (its positional rules; DESIGN §10) — the whole paper for the document title, whose parent is <article>. So a
// text block's translation takes the skeleton's node over instead of replacing it
describe('a text block\'s translation takes over its pending node', () => {
  const ROW = `<div class="ltx_para"><table class="ltx_equationgroup ltx_eqn_table" id="E1"><tbody>
    <tr class="ltx_equation ltx_eqn_row ltx_align_baseline"><td class="ltx_eqn_cell ltx_align_right"><math class="ltx_Math"><mi>x</mi></math></td></tr>
    <tr class="ltx_eqn_row ltx_align_baseline" id="r1"><td class="ltx_eqn_cell ltx_align_left" style="white-space:normal;" colspan="5">where the mean curvature is</td></tr>
  </tbody></table></div>`

  it('the node stays the one that was waiting, and the parent sees no child come or go', async () => {
    const doc = docOf(page)
    const p = extract(doc).find(b => b.id === 'p1') as TextBlock
    const pending = renderPending(p)
    const seen: MutationRecord[] = []
    const observer = new MutationObserver(records => { seen.push(...records) })
    observer.observe(p.el.parentElement!, { childList: true })
    const node = renderText(p, frag(doc, ZH.text))
    await Promise.resolve()
    observer.disconnect()
    expect(node).toBe(pending)
    expect(seen).toHaveLength(0)
    expect(node.textContent).toBe(ZH.text)
  })

  it.each([
    ['a paragraph', page, 'p1', ZH.text],
    ['a short heading on its own line mark', page, 's1', ZH.heading],
    ['a paragraph returned as it was (the identity mark)', page, 'p1', 'Text.'],
    ['a description row, whose content sits in a cell', ROW, 'r1', ZH.row],
  ])('%s: the page ends up the same as without a skeleton, attribute for attribute', (_, html, id, text) => {
    const waited = docOf(html)
    const direct = docOf(html)
    for (const doc of [waited, direct]) {
      doc.documentElement.setAttribute('data-axt-lang', 'zh-CN')
      const block = (extract(doc) as TextBlock[]).find(b => b.id === id || b.el.id === id)!
      if (doc === waited) renderPending(block)
      renderText(block, frag(doc, text))
    }
    // The order attributes were written in is not part of the page: the skeleton's round writes the state before the
    // same-line mark, the direct one after, as they did before the node was taken over
    const canonical = (doc: Document) => {
      for (const el of Array.from(doc.body.querySelectorAll('*'))) {
        const attrs = el.getAttributeNames().sort().map(name => [name, el.getAttribute(name) ?? ''] as const)
        for (const [name] of attrs) el.removeAttribute(name)
        for (const [name, value] of attrs) el.setAttribute(name, value)
      }
      return doc.body.innerHTML
    }
    expect(canonical(waited)).toBe(canonical(direct))
  })

  it('the skeleton\'s ring is cancelled with the node kept', () => {
    const doc = docOf(page)
    const p = extract(doc).find(b => b.id === 'p1') as TextBlock
    const before = activeSkeletonAnimations()
    renderPending(p)
    renderText(p, frag(doc, ZH.text))
    expect(activeSkeletonAnimations()).toBe(before)
  })

  it('a retry goes the same way: translated, pending again, translated — one node of ours throughout', () => {
    const doc = docOf(page)
    const p = extract(doc).find(b => b.id === 'p1') as TextBlock
    renderText(p, frag(doc, ZH.old))
    const pending = renderPending(p)
    const node = renderText(p, frag(doc, ZH.fresh))
    expect(node).toBe(pending)
    expect(doc.querySelectorAll(`[${FOR_ATTR}="p1"]`)).toHaveLength(1)
    expect(node.textContent).toBe(ZH.fresh)
  })

  it('a second node of ours beside the block sends it down the clearing path: both go, one translation remains', () => {
    const doc = docOf(page)
    const p = extract(doc).find(b => b.id === 'p1') as TextBlock
    const pending = renderPending(p)
    // What no path of ours produces today — a widget left behind the skeleton — must still end as one translation
    const stray = doc.createElement('p')
    stray.className = `ltx_p ${T_CLASS}`
    stray.setAttribute(FOR_ATTR, 'p1')
    pending.after(stray)
    const node = renderText(p, frag(doc, ZH.text))
    expect(node).not.toBe(pending)
    expect(doc.querySelectorAll(`[${FOR_ATTR}="p1"]`)).toHaveLength(1)
    expect(p.el.nextElementSibling).toBe(node)
  })

  it('a failure widget still replaces the skeleton: only a translation takes the node over', () => {
    const doc = docOf(page)
    const p = extract(doc).find(b => b.id === 'p1') as TextBlock
    const pending = renderPending(p)
    const widget = renderFailed(p, 'network: down', () => {})
    expect(widget).not.toBe(pending)
    expect(pending.isConnected).toBe(false)
  })
})

