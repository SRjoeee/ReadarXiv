import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

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
    expect(RULES).toMatch(/\.axt-img \{[^}]*position-anchor: --axt-img;[^}]*top: anchor\(top\);[^}]*width: anchor-size\(width\);/)
    // A vertical label rotates about its own centre; with the origin changed by the site's styles it would fly out of the image (§15.5)
    expect(RULES).toMatch(/\.axt-img > span \{[^}]*transform-origin: 50% 50%;/)
    // A browser without anchor positioning skips the whole block and the overlay stays hidden
    expect(RULES).toMatch(/@supports \(top: anchor\(top\)\)/)
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
    const hide = RULES.indexOf('html[data-axt-mode="side"][data-axt-img-modes~="side"] figure .axt-img:not(:where(.axt-split) *)')
    expect(show).toBeGreaterThan(-1)
    expect(hide).toBeGreaterThan(show)
    // side only: stack shows the original, only shows the copy, and the overlay follows whichever shows
    expect(RULES).not.toMatch(/html\[data-axt-mode="(stack|only)"\][^{]*\.axt-img[^{]*\{\s*display: none/)
  })

  it('the hiding condition does not look at [data-axt-split]: that attribute exists only after the split, and the in-between state would flash (issue #109)', () => {
    // The overlay is inserted into the original first; the split waits for prep's debounced coalescer (delay 150 ms). Measured in that in-between state:
    // the white box was drawn at full-column width over the figure in the left column (960 / 797px), and only after the split became half a column (468px) and moved to the right
    expect(RULES).not.toContain('[data-axt-split] .axt-img')
    // Images outside a figure are never split (collectImageTargets scans the whole text), so the hiding condition needs the figure premise,
    // or their overlays would vanish for good under side
    expect(RULES).toMatch(/html\[data-axt-mode="side"\]\[data-axt-img-modes~="side"\] figure \.axt-img/)
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

  it('a label blurs what lies under it and veils it translucently — Safari\'s material: under a plain veil the original\'s letters showed through (DESIGN §15.2)', () => {
    const label = RULES.slice(RULES.indexOf('.axt-img > span {'))
    const block = label.slice(0, label.indexOf('}'))
    expect(block).toMatch(/backdrop-filter:\s*blur\(15px\)/)
    expect(block).toMatch(/background:\s*rgb\(252 250 248 \/ 0\.81\)/)
    // The lightest grey that keeps 4.5 : 1 over the veil on black, where it composites to (204, 202, 201) (Codex on #278)
    expect(block).toMatch(/color:\s*#555555/)
  })

  it('the style sheet has no ltx_ selector: the image overlay knows nothing of the site\'s structure', () => {
    expect(RULES).not.toContain('ltx_')
  })
})
