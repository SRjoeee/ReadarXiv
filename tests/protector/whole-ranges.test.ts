import { afterEach, describe, expect, it } from 'vitest'
import { wholeRanges } from '@/core/protector'

// An element's own content as ranges, cut at every node we injected (§7.7): what the hover highlight paints for a
// block the engine gave no sentence boundaries for. On the window's own document: on a DOMParser document happy-dom
// collapses a range to its end, and `toString()` comes back empty (the highlight tests note the same)
const docOf = (html: string) => { document.body.innerHTML = `<article class="ltx_document">${html}</article>`; return document }
afterEach(() => { document.body.innerHTML = '' })

describe('wholeRanges', () => {
  it('one range over plain content, formulas included', () => {
    const doc = docOf('<p class="ltx_p" id="p">Let <math><mi>x</mi></math> be real.</p>')
    const ranges = wholeRanges(doc.getElementById('p')!)
    expect(ranges.map(r => r.toString())).toEqual(['Let x be real.'])
  })

  it('cuts at an injected node and keeps the original content around it, the nested original included', () => {
    const doc = docOf('<p class="ltx_p" id="p">Alpha <span class="ltx_note_content" data-axt-id="n1">note</span><span class="ltx_note_content axt-t" data-axt-for="n1">注</span> omega.</p>')
    const ranges = wholeRanges(doc.getElementById('p')!)
    expect(ranges.map(r => r.toString())).toEqual(['Alpha note', ' omega.'])
  })

  it('cuts around a footnote\'s margin box and keeps the mark inline, as the sentence ranges do (Devin on #226)', () => {
    const doc = docOf('<p class="ltx_p" id="p">Result<span class="ltx_note ltx_role_footnote"><sup class="ltx_note_mark">1</sup><span class="ltx_note_outer"><span class="ltx_note_content" data-axt-id="n1">A note.</span></span></span> stands.</p>')
    const ranges = wholeRanges(doc.getElementById('p')!)
    expect(ranges.map(r => r.toString())).toEqual(['Result1', ' stands.'])
  })

  it('an element with no text of its own gives no range; a skeleton or an overlay inside is skipped', () => {
    const doc = docOf('<figure id="f"><img src="a.png"><div class="axt-img" data-axt-for="g"><span>label</span></div></figure><p id="q"><span class="axt-t axt-pending" data-axt-for="q">…</span></p>')
    expect(wholeRanges(doc.getElementById('f')!)).toEqual([])
    expect(wholeRanges(doc.getElementById('q')!)).toEqual([])
  })
})
