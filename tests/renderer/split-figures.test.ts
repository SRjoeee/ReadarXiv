// A figure split in two whole (DESIGN §7.2). Graphics and formulas have no translation, so paired by block the right column would stay empty;
// a figure spanning both columns gives up the comparison, so the whole thing is copied once and the copy keeps only the translations.
import { describe, expect, it } from 'vitest'
import { T_CLASS } from '@/core/marks'
import { FOR_ATTR, MIRROR_CLASS, SPLIT_ATTR, SPLIT_CLASS, SPLIT_FOR_ATTR } from '@/core/renderer/attrs'
import { renderImage } from '@/core/renderer/image'
import { restore } from '@/core/renderer/page'
import { DUPLICATE_ATTR, dropStaleSplits, setSplitDuplicatesHidden, splitFigures } from '@/core/renderer/split-figures'
import { IMG_CLASS } from '@/core/marks'
import { ID_ATTR } from '@/core/extractor'
import { docOf } from './helpers'

/** A figure with a subfigure caption: graphic + caption + the caption's translation */
const figure = (extra = '') => `<figure class="ltx_figure">
  <img class="ltx_graphics" src="a.png" width="600" height="200">
  <figcaption class="ltx_caption">Figure 1. Original</figcaption>
  <figcaption class="ltx_caption ${T_CLASS}" data-axt-for="c1">图 1. 译文</figcaption>${extra}
</figure>`

describe('splitFigures', () => {
  it('a figure holding a pair is copied whole, the copy keeping only the translation', () => {
    const doc = docOf(figure())
    expect(splitFigures(doc)).toBe(1)
    const original = doc.querySelector(`figure[${SPLIT_ATTR}]`)!
    const clone = original.nextElementSibling!
    expect(clone.classList.contains(SPLIT_CLASS)).toBe(true)
    expect(clone.classList.contains(T_CLASS)).toBe(true) // the pairing rule puts it in the right column by this
    // The copy: the graphic is still there, the source caption is gone, only the translation remains
    expect(clone.querySelector('img')).not.toBeNull()
    expect(clone.querySelectorAll('.ltx_caption')).toHaveLength(1)
    expect(clone.textContent).toContain('图 1. 译文')
    expect(clone.textContent).not.toContain('Figure 1. Original')
    // Not one child of the original moved; only the mark was added
    expect(original.querySelectorAll('.ltx_caption')).toHaveLength(2)
  })

  it('the copy carries neither the original\'s id nor the block marks', () => {
    const doc = docOf(`<figure class="ltx_figure" id="S1.F1">
      <img class="ltx_graphics" src="a.png"><figcaption class="ltx_caption" id="S1.F1.cap" data-axt-id="b1">cap</figcaption>
      <figcaption class="ltx_caption ${T_CLASS}" data-axt-for="b1">说明</figcaption></figure>`)
    splitFigures(doc)
    const clone = doc.querySelector(`.${SPLIT_CLASS}`)!
    expect(clone.id).toBe('')
    expect(clone.querySelector('[id]')).toBeNull()
    expect(clone.querySelector('[data-axt-id]')).toBeNull()
  })

  it('a figure without a translation is not split: that is the mirror\'s job', () => {
    const doc = docOf('<figure class="ltx_figure"><img class="ltx_graphics" src="a.png"></figure>')
    expect(splitFigures(doc)).toBe(0)
  })

  it('a float without media is not split: a table float\'s table has a translation clone already', () => {
    const doc = docOf(`<figure class="ltx_table">
      <table class="ltx_tabular"><tbody><tr><td>a</td></tr></tbody></table>
      <table class="ltx_tabular ${T_CLASS}" data-axt-for="t1"><tbody><tr><td>甲</td></tr></tbody></table>
      <figcaption class="ltx_caption">Table 1</figcaption>
      <figcaption class="ltx_caption ${T_CLASS}" data-axt-for="c1">表 1</figcaption></figure>`)
    expect(splitFigures(doc)).toBe(0)
  })

  it('a table float whose caption has inline math is not split either: math in the caption is no “loose” media', () => {
    // Measured on 2312.17527: both table floats were split by mistake (Codex on #26)
    const doc = docOf(`<figure class="ltx_table">
      <table class="ltx_tabular"><tbody><tr><td>a</td></tr></tbody></table>
      <table class="ltx_tabular ${T_CLASS}" data-axt-for="t1"><tbody><tr><td>甲</td></tr></tbody></table>
      <figcaption class="ltx_caption" ${ID_ATTR}="c1">Table 1: <math>x</math></figcaption>
      <figcaption class="ltx_caption ${T_CLASS}" data-axt-for="c1">表 1：<math>x</math></figcaption></figure>`)
    expect(splitFigures(doc)).toBe(0)
  })

  it('a changed translation (retranslated into another target) rebuilds the copy; counting alone would keep the old one for good', () => {
    const doc = docOf(figure())
    splitFigures(doc)
    doc.querySelector(`figure[${SPLIT_ATTR}] .ltx_caption.${T_CLASS}`)!.textContent = '图 1. 另一种译法'
    expect(splitFigures(doc)).toBe(1)
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(1)
    expect(doc.querySelector(`.${SPLIT_CLASS}`)!.textContent).toContain('另一种译法')
  })

  it('nested subfigures are copied together with the outermost one, not each on its own', () => {
    const doc = docOf(`<figure class="ltx_figure"><div class="ltx_flex_figure"><div class="ltx_flex_cell">
      <figure class="ltx_figure ltx_figure_panel"><img class="ltx_graphics" src="a.png">
        <figcaption class="ltx_caption">(a) panel</figcaption>
        <figcaption class="ltx_caption ${T_CLASS}" data-axt-for="p1">(a) 面板</figcaption>
      </figure></div></div></figure>`)
    expect(splitFigures(doc)).toBe(1)
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(1)
  })

  it('idempotent: with the translation unchanged no rebuild', () => {
    const doc = docOf(figure())
    expect(splitFigures(doc)).toBe(1)
    expect(splitFigures(doc)).toBe(0)
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(1)
  })

  it('more translations arriving rebuilds the copy, or the right column stays half done for good', () => {
    const doc = docOf(figure())
    splitFigures(doc)
    const fig = doc.querySelector(`figure[${SPLIT_ATTR}]`)!
    const p = doc.createElement('p')
    p.className = 'ltx_p'
    p.textContent = 'note'
    fig.append(p)
    const t = doc.createElement('p')
    t.className = `ltx_p ${T_CLASS}`
    t.setAttribute('data-axt-for', 'c2')
    t.textContent = '注'
    p.after(t)
    expect(splitFigures(doc)).toBe(1)
    expect(doc.querySelectorAll(`.${SPLIT_CLASS}`)).toHaveLength(1)
    expect(doc.querySelector(`.${SPLIT_CLASS}`)!.textContent).toContain('注')
  })

  it('mirrors already inside the figure are cleared: the two schemes stacked would duplicate one copy', () => {
    const doc = docOf(figure(`<img class="ltx_graphics ${T_CLASS} ${MIRROR_CLASS}" src="a.png">`))
    splitFigures(doc)
    expect(doc.querySelectorAll(`.${MIRROR_CLASS}`)).toHaveLength(0)
  })

  it('after restoring the original the DOM equals the pre-translation one node for node (§7.1)', () => {
    const doc = docOf(figure())
    const before = doc.querySelector('article')!.innerHTML
    splitFigures(doc)
    // The copy and the marks are both cleared by restore
    for (const t of Array.from(doc.querySelectorAll(`.${T_CLASS}`))) t.remove()
    restore(doc)
    expect(doc.querySelector(`[${SPLIT_ATTR}]`)).toBeNull()
    expect(doc.querySelector('article')!.innerHTML.replace(/\s+/g, ' ').trim())
      .toBe(before.replace(new RegExp(`<figcaption class="ltx_caption ${T_CLASS}"[^>]*>[^<]*</figcaption>`), '').replace(/\s+/g, ' ').trim())
  })

  it('a pending pair splits the figure too, the ring kept in the copy where the translation will land; the translation arriving changes the key and rebuilds (issue #170, §7.6)', () => {
    // Before #170 a pending caption did not count and the figure spanned both columns until the translation landed — a
    // jump in the layout — and a caption that failed left it spanning for good
    const ring = `<figcaption class="ltx_caption ${T_CLASS} axt-pending" data-axt-for="c1"><span class="axt-skel" aria-hidden="true"><span class="axt-skel-line" style="width:80%"></span></span></figcaption>`
    const pendingOnly = docOf(`<figure class="ltx_figure"><img class="ltx_graphics" src="a.png"><figcaption class="ltx_caption">cap</figcaption>${ring}</figure>`)
    expect(splitFigures(pendingOnly)).toBe(1)
    const copy = pendingOnly.querySelector(`.${SPLIT_CLASS}`)!
    expect(copy.querySelector('.axt-pending .axt-skel')).not.toBeNull()
    expect(copy.textContent).not.toContain('cap')
    expect(splitFigures(pendingOnly)).toBe(0) // still pending: nothing to rebuild
    const done = pendingOnly.createElement('figcaption')
    done.className = `ltx_caption ${T_CLASS}`
    done.setAttribute('data-axt-for', 'c1')
    done.textContent = 'translated'
    pendingOnly.querySelector('.axt-pending')!.replaceWith(done)
    expect(splitFigures(pendingOnly)).toBe(1)
    expect(pendingOnly.querySelector(`.${SPLIT_CLASS}`)!.textContent).toContain('translated')
    expect(pendingOnly.querySelector(`.${SPLIT_CLASS} .axt-skel`)).toBeNull()

    // Mixed: one caption translated, one still waiting — the copy shows the translation and the ring, neither original
    const mixed = docOf(`<figure class="ltx_figure"><img class="ltx_graphics" src="a.png">
      <figcaption class="ltx_caption">cap A</figcaption><figcaption class="ltx_caption ${T_CLASS}" data-axt-for="c1">translated A</figcaption>
      <figcaption class="ltx_caption">cap B</figcaption>${ring.replace('c1', 'c2')}</figure>`)
    expect(splitFigures(mixed)).toBe(1)
    const both = mixed.querySelector(`.${SPLIT_CLASS}`)!
    expect(both.textContent).toContain('translated A')
    expect(both.textContent).not.toContain('cap B')
    expect(both.querySelector('.axt-pending')).not.toBeNull()
  })

  it('a pair changing state rebuilds the copy: failed → pending (a retry) → translated (issue #170)', () => {
    const widget = `<span class="${T_CLASS} axt-error" data-axt-for="c1" data-axt-reason="network: boom"></span>`
    const doc = docOf(`<figure class="ltx_figure"><img class="ltx_graphics" src="a.png"><figcaption class="ltx_caption">cap</figcaption>${widget}</figure>`)
    expect(splitFigures(doc)).toBe(1)
    expect(doc.querySelector(`.${SPLIT_CLASS}`)!.textContent).toContain('cap') // no retry given: the original stays
    expect(splitFigures(doc)).toBe(0)
    const pending = doc.createElement('span')
    pending.className = `${T_CLASS} axt-pending`
    pending.setAttribute('data-axt-for', 'c1')
    doc.querySelector('.axt-error')!.replaceWith(pending)
    expect(splitFigures(doc)).toBe(1) // the same count of pairs, another state: rebuilt
    expect(doc.querySelector(`.${SPLIT_CLASS}`)!.textContent).not.toContain('cap')
    const done = doc.createElement('figcaption')
    done.className = `ltx_caption ${T_CLASS}`
    done.setAttribute('data-axt-for', 'c1')
    done.textContent = 'translated'
    pending.replaceWith(done)
    expect(splitFigures(doc)).toBe(1)
    expect(doc.querySelector(`.${SPLIT_CLASS}`)!.textContent).toContain('translated')
  })

  it('the copy\'s duplicated media are silenced for assistive technology in side mode and speak again outside it (§7.4b, issue #170)', () => {
    // The image duplicates the original's, visible beside the copy in side; the formula inside the translated caption
    // does not — the original's translation is hidden by side's styles, the copy's is the one shown
    const doc = docOf(`<figure class="ltx_figure"><img class="ltx_graphics" src="a.png">
      <figcaption class="ltx_caption">cap <math><mi>x</mi></math></figcaption>
      <figcaption class="ltx_caption ${T_CLASS}" data-axt-for="c1">translated <math><mi>x</mi></math></figcaption></figure>`)
    expect(splitFigures(doc)).toBe(1)
    const copy = doc.querySelector(`.${SPLIT_CLASS}`)!
    const img = copy.querySelector('img')!
    expect(img.hasAttribute(DUPLICATE_ATTR)).toBe(true)
    expect(img.getAttribute('aria-hidden')).toBe('true')
    expect(img.hasAttribute('inert')).toBe(true)
    const formula = copy.querySelector('math')!
    expect(formula.hasAttribute(DUPLICATE_ATTR)).toBe(false)
    expect(formula.hasAttribute('aria-hidden')).toBe(false)
    // Leaving side (only: the original is display: none, the copy is the one reading left): the media speak again
    expect(setSplitDuplicatesHidden(doc, false)).toBe(1)
    expect(img.hasAttribute('aria-hidden')).toBe(false)
    expect(img.hasAttribute('inert')).toBe(false)
    expect(setSplitDuplicatesHidden(doc, false)).toBe(0)
    expect(setSplitDuplicatesHidden(doc, true)).toBe(1)
    expect(img.getAttribute('aria-hidden')).toBe('true')
    // The original's image is never touched
    expect(doc.querySelector(`figure:not(.${SPLIT_CLASS}) img`)!.hasAttribute('aria-hidden')).toBe(false)
  })
})

describe('a mirror is no translation (issue #46, measured on 2312.17141)', () => {
  it('when the only .axt-t inside the figure is a mirror there is no split: that is the normal state of the caption not yet translated and the media mirrored first', () => {
    // With the baseline running full every pass, the pass after a mirror entered the figure took it for “has a translation” and split by mistake — deleting the mirror and cloning a figure without a translation
    const doc = docOf('<figure class="ltx_figure" id="f"><img class="ltx_graphics" src="a.png" alt="">'
      + '<img class="ltx_graphics axt-t axt-mirror" data-axt-for="mirror:0" src="a.png" alt="">'
      + '<figcaption class="ltx_caption" data-axt-id="c" data-axt-state="pending">Figure.</figcaption></figure>')
    expect(splitFigures(doc)).toBe(0)
    expect(doc.querySelector('.axt-split')).toBeNull()
    expect(doc.querySelectorAll('.axt-mirror')).toHaveLength(1) // the mirror stays
  })

  describe('the image overlay (DESIGN §15.2)', () => {
    const IMG_FIGURE = '<figure class="ltx_figure" id="F1"><img class="ltx_graphics" src="a.png" id="F1.g1"><figcaption class="ltx_caption">Figure 1.</figcaption></figure>'
    const overlayOn = (doc: Document, text = '静态电荷') => {
      const el = doc.querySelector('img') as HTMLImageElement
      return renderImage({ id: el.id, el, kind: 'raster' as const }, [{ x: 0.1, y: 0.1, w: 0.3, h: 0.05, lines: 1, source: 'Static charge', text }])
    }

    it('a figure with an overlay only and no text translation is split too: graphic and overlay are both in the copy, the overlay without a pairing mark', () => {
      const doc = docOf(IMG_FIGURE)
      overlayOn(doc)
      expect(splitFigures(doc)).toBe(1)
      const clone = doc.querySelector(`.${SPLIT_CLASS}`)!
      const img = clone.querySelector('img')!
      expect(img).not.toBeNull()
      // The overlay follows the copy's image directly; anchor positioning relies on that adjacency
      expect(img.nextElementSibling?.classList.contains(IMG_CLASS)).toBe(true)
      // The pairing mark must be absent (with it the copy's overlay would count as a second translation), but `data-axt-split-for` has to stay:
      // on “no longer translating this image” `clearImageEverywhere` can find the copy's overlay by it alone (Codex on #134)
      const overlay = clone.querySelector(`.${IMG_CLASS}`)!
      expect(overlay.getAttribute(FOR_ATTR)).toBeNull()
      expect(overlay.getAttribute(SPLIT_FOR_ATTR)).toBe('F1.g1')
      expect(overlay.getAttributeNames().filter(n => n.startsWith('data-axt-'))).toEqual([SPLIT_FOR_ATTR])
      expect(clone.querySelector(`.${IMG_CLASS}`)!.textContent).toBe('静态电荷')
    })

    it('the overlay arriving later: the signature changed, the copy is rebuilt with the overlay', () => {
      const doc = docOf(figure())
      splitFigures(doc)
      const before = doc.querySelector(`.${SPLIT_CLASS}`)!
      expect(before.querySelector(`.${IMG_CLASS}`)).toBeNull()
      overlayOn(doc)
      expect(splitFigures(doc)).toBe(1)
      const after = doc.querySelector(`.${SPLIT_CLASS}`)!
      expect(after).not.toBe(before)
      expect(after.querySelector(`.${IMG_CLASS}`)).not.toBeNull()
      // The same signature: no rebuild
      expect(splitFigures(doc)).toBe(0)
    })

    it('a figure without a caption is mirrored whole as the session starts: the split deletes the figure-level mirror too, or the right column shows three', () => {
      const doc = docOf(IMG_FIGURE)
      const fig = doc.querySelector('figure')!
      const mirror = fig.cloneNode(true) as Element
      mirror.classList.add(T_CLASS, MIRROR_CLASS)
      fig.after(mirror)
      overlayOn(doc)
      expect(splitFigures(doc)).toBe(1)
      expect(doc.querySelectorAll(`.${MIRROR_CLASS}`)).toHaveLength(0)
      expect(doc.querySelectorAll('figure')).toHaveLength(2) // original + copy
    })

    it('dropStaleSplits: outside side a copy with a stale signature is dropped and the original\'s mark removed; an equal signature is left alone', () => {
      const doc = docOf(figure())
      splitFigures(doc)
      expect(dropStaleSplits(doc)).toBe(0)
      overlayOn(doc) // the overlay arrived only after side → only, and went into the original
      expect(dropStaleSplits(doc)).toBe(1)
      expect(doc.querySelector(`.${SPLIT_CLASS}`)).toBeNull()
      expect(doc.querySelector(`[${SPLIT_ATTR}]`)).toBeNull()
      // Back to side and split again: the copy holds the overlay
      expect(splitFigures(doc)).toBe(1)
      expect(doc.querySelector(`.${SPLIT_CLASS} .${IMG_CLASS}`)).not.toBeNull()
    })
  })
})
