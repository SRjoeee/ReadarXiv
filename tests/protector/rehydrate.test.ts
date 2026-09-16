import { describe, expect, it } from 'vitest'
import { PlaceholderIntegrityError, rehydrate, serialize } from '@/core/protector'
import { el, htmlOf, stripIds } from './helpers'

describe('rehydrate', () => {
  it('an identity translation rehydrates equal to the original (ids stripped)', () => {
    const p = el(
      '<p class="ltx_p" id="p1">Let <math class="ltx_Math" id="m1" alttext="x"><semantics><mi>x</mi><annotation encoding="application/x-tex">x</annotation></semantics></math>'
      + ' be <em class="ltx_emph ltx_font_italic" id="e1">bold</em> per <a class="ltx_ref" href="#S2" id="r1"><span class="ltx_text ltx_ref_tag">2</span></a> &lt;&amp;&gt;.</p>',
    )
    const b = serialize(p)
    expect(htmlOf(rehydrate(b.text, b, document))).toBe(stripIds(p.innerHTML))
  })

  it('placeholders are placed in the translation\'s order', () => {
    const p = el('<p class="ltx_p"><math class="ltx_Math"><mi>a</mi></math> then <math class="ltx_Math"><mi>b</mi></math></p>')
    const b = serialize(p)
    const html = htmlOf(rehydrate('<x id="2"/> 先于 <x id="1"/>', b, document))
    expect(html).toBe('<math class="ltx_Math"><mi>b</mi></math> 先于 <math class="ltx_Math"><mi>a</mi></math>')
  })

  it('the clone is independent of the original node, href kept, id stripped', () => {
    const p = el('<p class="ltx_p"><a class="ltx_ref" href="#S2" id="r1">2</a> <em id="e1">x</em></p>')
    const b = serialize(p)
    const frag = rehydrate(b.text.replace('>x<', '>y<'), b, document)
    const a = frag.querySelector('a')!
    expect(a.getAttribute('href')).toBe('#S2')
    expect(a.hasAttribute('id')).toBe(false)
    expect(frag.querySelector('em')?.hasAttribute('id')).toBe(false)
    expect(frag.querySelector('em')?.textContent).toBe('y')
    expect(p.querySelector('em')?.textContent).toBe('x')
    expect(p.querySelector('a')?.getAttribute('id')).toBe('r1')
  })

  it('decodes entities in the model output', () => {
    const p = el('<p class="ltx_p">a</p>')
    const b = serialize(p)
    expect(htmlOf(rehydrate('&lt;b&gt; &amp; &quot;c&quot; &#39;d&#39; &#65;&#x42;&nbsp;e', b, document))).toBe('&lt;b&gt; &amp; "c" \'d\' AB&nbsp;e')
  })

  it('a node replaced after serialisation: rehydration refuses as `stale` rather than putting back the copy captured then (the audit\'s A03, INVENTORY T6)', () => {
    // The slots record **node references**; a page that swaps the formula while the request is in flight must not have
    // the translation show x where the page now shows y. arXiv's own JS does not touch the body (RESEARCH §3.3), so
    // nothing trips this today; the pipeline marks the block failed and a retry serialises it afresh
    const p = el('<p class="ltx_p">Let <math class="ltx_Math"><mi>x</mi></math> be positive, and <math class="ltx_Math"><mi>z</mi></math> too.</p>')
    const b = serialize(p)
    const before = p.querySelector('math')!
    // The page swapped x for y (same position, same tag)
    before.replaceWith(el('<math class="ltx_Math"><mi>y</mi></math>'))
    expect(p.querySelector('math')!.textContent).toBe('y')
    let caught: unknown
    try { rehydrate(b.text, b, document) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(PlaceholderIntegrityError)
    expect((caught as PlaceholderIntegrityError).reason).toBe('stale')
    expect((caught as PlaceholderIntegrityError).detail).toBe('slot 1 <math> is not the node it was')
    // A slot moved out of the block, still in the document, is stale as well; the block serialised afresh is not
    const again = serialize(p)
    p.parentElement!.append(p.querySelectorAll('math')[1]!)
    expect(() => rehydrate(again.text, again, document)).toThrow(/stale/)
    const fresh = serialize(p)
    expect(htmlOf(rehydrate(fresh.text, fresh, document))).toContain('<mi>y</mi>')
  })

  it('stale is “serialises differently, or a slot is another node”: a move alone or grouped and edited text are stale; a split text node, a comment, our own node beside a slot are not (Devin on #212, twice)', () => {
    const stale = (block: ReturnType<typeof serialize>) => { try { rehydrate(block.text, block, document) } catch (e) { return (e as PlaceholderIntegrityError).detail } return undefined }
    // What the page can do without changing what was sent: our ring beside a slot, a comment, a text node split in two
    const p = el('<p class="ltx_p">A <math class="ltx_Math"><mi>x</mi></math> B.</p>')
    const b = serialize(p)
    const x = p.querySelector('math')!
    const ours = el('<span class="axt-t axt-pending"></span>')
    x.before(ours)
    p.insertBefore(document.createComment('note'), x)
    ;(p.firstChild as Text).splitText(1)
    expect(stale(b)).toBeUndefined()
    ours.remove()
    // The formula moved after the text that followed it: the wire order no longer describes the page
    const one = serialize(p)
    p.append(x)
    expect(stale(one)).toBe("the block's text changed")
    // Two slots moved together with their text (`A x B y` → `B y A x`): each keeps its neighbour, the order still changed
    const grouped = el('<p class="ltx_p">A <math class="ltx_Math"><mi>x</mi></math> B <math class="ltx_Math"><mi>y</mi></math></p>')
    const g = serialize(grouped)
    grouped.append(grouped.firstChild!, grouped.querySelector('math')!)
    expect(stale(g)).toBe("the block's text changed")
    // The words changed under the translation
    const edited = el('<p class="ltx_p">A <math class="ltx_Math"><mi>x</mi></math> B.</p>')
    const e = serialize(edited)
    ;(edited.firstChild as Text).data = 'Not A '
    expect(stale(e)).toBe("the block's text changed")
  })

  it('a validation failure throws PlaceholderIntegrityError', () => {
    const p = el('<p class="ltx_p">a <math class="ltx_Math"><mi>x</mi></math></p>')
    const b = serialize(p)
    expect(() => rehydrate('a', b, document)).toThrow(PlaceholderIntegrityError)
    try {
      rehydrate('a', b, document)
    } catch (e) {
      expect((e as PlaceholderIntegrityError).reason).toBe('missing')
    }
  })
})
