import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VIEWER_CLASS } from '@/core/viewer'

// The image overlay's styles (DESIGN §15.2): happy-dom has no layout, so the rule itself is guarded here

const CSS = readFileSync(join(import.meta.dirname, '../../src/styles/image.css'), 'utf8')
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

describe('image.css', () => {
  it('anchor positioning: the image declares an anchor name, the parent scopes it and is the positioned ancestor, the overlay attaches with anchor() / anchor-size()', () => {
    // One rule for both kinds of image: an <object> (external SVG, §15.5) is an overlay anchor too. An inline <svg> (TikZ) is none: its labels are blocks (§15.6)
    // The image and its parent are known by the marks renderImage writes (DESIGN §7.2), not by `:has()`: an insertion anywhere would recalculate the whole document
    expect(RULES).toMatch(/:is\(img, object\)\[data-axt-anchor\] \{\s*anchor-name: --axt-img;/)
    expect(RULES).toMatch(/\[data-axt-anchors\] \{\s*position: relative;\s*anchor-scope: --axt-img;/)
    expect(RULES).not.toContain(':has(')
    expect(RULES).toMatch(/\.axt-img \{[^}]*position-anchor: --axt-img;[^}]*inset: anchor\(top\) anchor\(right\) anchor\(bottom\) anchor\(left\);/)
    // A vertical label rotates about its own centre; with the origin changed by the site's styles it would fly out of the image (§15.5)
    expect(RULES).toMatch(/\.axt-img > span \{[^}]*transform-origin: 50% 50%;/)
    // A browser without anchor positioning skips the whole block and the overlay stays hidden
    expect(RULES).toMatch(/@supports \(top: anchor\(top\)\)/)
  })

  it('the overlay takes the drawing\'s rectangle inside the box: the larger box of the drawing\'s proportions that fits, centred; with no proportions told, the whole box', () => {
    // An SVG figure is fitted whole and centred into its <object> (§15.5); where the box has other proportions the
    // labels lie on the drawing, not on the air beside it. Without a ratio — a bitmap — each min() picks the box's own side
    expect(RULES).toMatch(/\.axt-img \{[^}]*margin: auto;/)
    expect(RULES).toMatch(/\.axt-img \{[^}]*width: min\(anchor-size\(width\), anchor-size\(height\) \* var\(--axt-img-ratio, 1e5\)\);/)
    expect(RULES).toMatch(/\.axt-img \{[^}]*height: min\(anchor-size\(height\), anchor-size\(width\) \/ var\(--axt-img-ratio, 1e-5\)\);/)
  })

  it('one blur for the figure, masked to its labels — never one a label: a filtered backdrop is paid for by the element', () => {
    // Measured on the Transformer paper (242 labels showing, M4 Pro at 120 Hz): a blur a label gave 69–75 frames a
    // second with 13–18 frames over 25 ms a pass; one a figure, masked, 118 and none — as with no overlay at all
    expect(RULES).toMatch(/\.axt-img::before \{[^}]*backdrop-filter: blur\(15px\);[^}]*mask-image: var\(--axt-img-mask, linear-gradient\(transparent, transparent\)\);/)
    expect(RULES).not.toMatch(/\n  \.axt-img > span \{[^}]*backdrop-filter/)
  })

  it('in the figure viewer a label blurs for itself and the one layer is gone: a masked backdrop filter holds a texture as large as the overlay, and there the overlay grows eighteen times', () => {
    // Measured on the maintainer's report (Figure 15 of 2607.24653v2, 41 labels, M4 Pro at 2×): the mask is one texture
    // of the overlay's size in device pixels — 108 million of them at a zoom of 13 — and past some 155 million it is not
    // made at all: the layer then blurs the whole figure, by 15 px × the zoom, and nothing of it can be read. On the
    // page the overlay is no wider than the window. The viewer shows one figure, and a blur a label zooms at 119
    // frames a second there, as the one layer did
    expect(RULES.match(/backdrop-filter/g)).toHaveLength(2)
    expect(RULES).toMatch(new RegExp(`\\.${VIEWER_CLASS} \\.axt-img::before \\{\\s*content: none;`))
    expect(RULES).toMatch(new RegExp(`\\.${VIEWER_CLASS} \\.axt-img > span \\{\\s*backdrop-filter: blur\\(15px\\);`))
    // After the rules they override, which they outrank by the host's class alone
    expect(RULES.indexOf(`.${VIEWER_CLASS} .axt-img::before`)).toBeGreaterThan(RULES.indexOf('.axt-img > span {'))
  })

  it('out of the pairing grid, font size in container units, no interception of clicks on the image', () => {
    expect(RULES).toMatch(/\.axt-img \{[^}]*grid-column: auto;[^}]*grid-row: auto;/)
    expect(RULES).toMatch(/\.axt-img \{[^}]*container-type: size;/)
    expect(RULES).toMatch(/\.axt-img \{[^}]*pointer-events: none;/)
    expect(RULES).toMatch(/\.axt-img > span \{[^}]*pointer-events: auto;/)
  })

  it('visibility looks only at the attributes on <html>, not the overlay\'s own: the split-figure clone strips every data-axt-*', () => {
    expect(RULES).not.toMatch(/\[data-axt-img=/)
    for (const mode of ['side', 'stack', 'only']) {
      expect(RULES).toContain(`html[data-axt-mode="${mode}"][data-axt-img-modes~="${mode}"] .axt-img`)
    }
  })

  it('under side only the overlay inside the copy shows, and that rule comes after the display rule (equal specificity, order wins)', () => {
    const show = RULES.indexOf('html[data-axt-mode="side"][data-axt-img-modes~="side"] .axt-img')
    const hide = RULES.indexOf('html[data-axt-mode="side"][data-axt-img-modes~="side"] :is(figure, [data-axt-split-root]) .axt-img:not(:where(.axt-split) *)')
    expect(show).toBeGreaterThan(-1)
    expect(hide).toBeGreaterThan(show)
    // side only: stack shows the original, only shows the copy, and the overlay follows whichever shows
    expect(RULES).not.toMatch(/html\[data-axt-mode="(stack|only)"\][^{]*\.axt-img[^{]*\{\s*display: none/)
  })

  it('the hiding condition does not look at [data-axt-split]: that attribute exists only after the split, and the in-between state would flash (issue #109)', () => {
    // The overlay is inserted into the original first; the split waits for prep's debounced coalescer (delay 150 ms). Measured in that in-between state:
    // the white box was drawn at full-column width over the figure in the left column (960 / 797px), and only after the split became half a column (468px) and moved to the right
    expect(RULES).not.toContain('[data-axt-split] .axt-img')
    // An image beside running text is never split (its pairing is the grid's), so the hiding condition needs the premise
    // “inside something that is split” — a figure, or the block of a graphic loose in the text, marked when its overlay is
    // drawn — or such an overlay would vanish for good under side
    expect(RULES).toMatch(/html\[data-axt-mode="side"\]\[data-axt-img-modes~="side"\] :is\(figure, \[data-axt-split-root\]\) \.axt-img/)
    // “Not inside any .axt-split descendant” rather than “the nearest figure is not .axt-split”:
    // nested subfigures are copied together with the outermost one, and inside the copy that nested figure has no .axt-split of its own
    expect(RULES).toContain(':not(:where(.axt-split) *)')
  })

  it('the hidden baseline is written outside @supports: on a browser without anchor positioning the overlay does not drop to a paragraph under the image', () => {
    const supports = RULES.indexOf('@supports')
    const baseline = RULES.search(/\.axt-img \{\s*display: none;\s*\}/)
    expect(baseline).toBeGreaterThan(-1)
    expect(baseline).toBeLessThan(supports)
    // No second display: none baseline inside @supports (the display rule relies on the attribute gate)
    expect(RULES.slice(supports)).not.toMatch(/\n {2}\.axt-img \{[^}]*display: none/)
  })

  it('what lies under a label is blurred and veiled translucently — Safari\'s material: under a plain veil the original\'s letters showed through (DESIGN §15.2)', () => {
    const label = RULES.slice(RULES.indexOf('.axt-img > span {'))
    const block = label.slice(0, label.indexOf('}'))
    // The blur is the figure's one layer, cut to the labels (the case above); the veil is the label's own
    expect(RULES).toMatch(/\.axt-img::before \{[^}]*backdrop-filter:\s*blur\(15px\)/)
    expect(block).toMatch(/background:\s*rgb\(252 250 248 \/ 0\.81\)/)
    // The lightest grey that keeps 4.5 : 1 over the veil on black, where it composites to (204, 202, 201) (Codex on #278)
    expect(block).toMatch(/color:\s*#555555/)
  })

  it('the style sheet has no ltx_ selector: the image overlay knows nothing of the site\'s structure', () => {
    expect(RULES).not.toContain('ltx_')
  })
})
