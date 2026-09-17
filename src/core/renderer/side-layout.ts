import { ID_ATTR } from '@/core/extractor'
import { T_CLASS } from '@/core/marks'
import { NOTE, SIDE_LAYOUT } from '@/core/rules/latexml'
import { MIRRORED_ATTR, PANELS_ATTR, REAL_TRANSLATION, SPLIT_ATTR, SPLIT_CLASS, TAGGED_ATTR, TAIL_ATTR, TRANSLATED_ATTR } from './attrs'
// The structural decisions of side mode (DESIGN §7.2). This is the single source of truth; the lists of the same
// names in modes.css are guarded by tests. Every `ltx_*` literal comes from the rules module's SIDE_LAYOUT
// (CLAUDE.md hard rule 2); this file only composes them.
//
// A pairing container = an element holding a translation inside, minus the handful below.
// flex can be excluded: a descendant has to be a grid item before it can subgrid, and a flex parent keeps it from
// the outer tracks. But once excluded, the pairs inside need a fallback rule (the stack regions of modes.css), or
// each grows its own implicit two columns.
//
// Only elements that are **not grids themselves** can be excluded: excluding a grid ancestor does not stop its
// descendants from subgridding that foreign grid, and they fall into somebody else's tracks (measured on 2609.00097:
// paragraphs inside an ordered list were pushed into the 12px track of ar5iv's numbering grid, the English across
// the divider, the Chinese squeezed into a 39px strip). ar5iv's own grids (.ltx_enumerate / .ltx_biblist and the
// like) must be taken over, not excluded.
/**
 * A multi-panel flex figure: a .ltx_flex_figure with any cell that is not full width (ltx_flex_size_1).
 * Only these are excluded, and as a **whole subtree** (the panels sit side by side by ar5iv's flex, the pairs inside
 * stack naturally, no mirrors are made); a single-column flex figure whose cells are all size_1 (common for a table
 * plus a footnote, measured on Table 1 of 2609.03768v1) has full-width cells and is taken over as an ordinary
 * container, table and footnote paired left and right. Excluding the whole class by name used to stack the
 * single-column ones by mistake. happy-dom misjudges `:not(:is(a complex selector with :has))`, so this one goes
 * through closest(), like the other subtree exclusions
 */
export const MULTI_PANEL_FLEX = SIDE_LAYOUT.multiPanelFlex

export const SIDE_DENY = [
  `.${T_CLASS}`,                                       // a translation is not a container itself
  'table', 'thead', 'tbody', 'tr', 'td', 'th',         // table internals: a grid here would ruin the table
  SIDE_LAYOUT.atomicContext,                           // inline and preformatted contexts
  SIDE_LAYOUT.pairMember,                              // a pair member itself; a translation inside it is the footnote kind of nesting
].join(', ')

/**
 * Elements excluded **with their whole subtree**. ar5iv keeps a footnote's collapsed state in `display: none` on
 * `.ltx_note_outer`; the moment a translation is inserted inside the footnote the container rule matches
 * `:has(.axt-t)` and turns it into `display: grid` — the collapsed footnote flips open, 165px tall and 781px wide
 * across the body text, interfering with the middle column's translation (measured on 2312.17141, the owner's
 * feedback).
 *
 * The style sheet writes it as `.ltx_note *` in the exclusion list; it is not merged into SIDE_CONTAINER here
 * because happy-dom's `:is(.ltx_note *)` is always false (the native `.ltx_note *` works), and merging it would make
 * the tests and the live behaviour disagree. At run time isSideContainer() decides instead.
 */
export const SIDE_DENY_SUBTREE = [
  SIDE_LAYOUT.note, // footnotes (above)
  // A figure split whole: neither copy takes part in the pairing grid, and ar5iv lays out the inside of both (DESIGN §7.2)
  `[${SPLIT_ATTR}]`, `.${SPLIT_CLASS}`,
  MULTI_PANEL_FLEX, // multi-panel figures (above)
].join(', ')

/**
 * The same subtree list as the style sheet reads it: a multi-panel figure is known there by the mark
 * `markStructure` writes from MULTI_PANEL_FLEX, not by `:has()` (DESIGN §7.2). The two lists are held together by
 * tests/renderer/side-layout.test.ts
 */
export const SIDE_DENY_SUBTREE_CSS = SIDE_DENY_SUBTREE.replace(MULTI_PANEL_FLEX, `[${PANELS_ATTR}]`)

/**
 * The originals that take the left column: a block, an original a mirror follows, a figure with a split copy — each
 * marked by the code that gave it its right-hand partner. The style sheet quotes this list (guarded by tests)
 */
export const SIDE_ORIGINAL = `[${ID_ATTR}], [${MIRRORED_ATTR}], [${SPLIT_ATTR}]`

/**
 * The elements CSS turns into two-column grids: those holding a translation **or a block mark** inside (minus the
 * exclusions). The style sheet reads the mark the extractor writes on every ancestor of a block (`data-axt-pairs`,
 * markBlocks, DESIGN §7.2); this query keeps asking the structure itself, so it needs no mark and stays right for a
 * document marked by hand — tests/renderer/side-layout.test.ts holds the two answers equal on every fixture. The block marks are set at the very start of a session (§10), so the whole page goes two-column at
 * once and never jumps sideways afterwards; keyed on translations alone, blocks beyond the preload distance under
 * lazy loading stayed full width and shrank into the left column only on entering the margin (the owner's
 * feedback, revised 2026-09-05)
 */
export const SIDE_CONTAINER = `:has(.${T_CLASS}, [${ID_ATTR}]):not(:is(${SIDE_DENY}))`

/** Is this a pairing container (subtree exclusions included). At run time always ask here; never matches(SIDE_CONTAINER) directly */
export function isSideContainer(el: Element): boolean {
  return el.matches(SIDE_CONTAINER) && el.closest(SIDE_DENY_SUBTREE) === null
}

/**
 * The container test the mirrors use: an element whose translation **has not arrived** but whose blocks are marked
 * (data-axt-id) counts too. Formulas and figures have no translation of their own; waiting for their paragraph's
 * translation before mirroring them was waiting for nothing — measured on 2312.17141, all 413 mirrors appeared
 * together the moment the translation finished, and until then the formulas sat centred across both columns. The
 * block marks are written the first moment a translation starts, so the first side prep can mirror them all. The
 * safety boundary is unchanged: a child carrying a block mark or holding blocks inside is still not mirrored
 * (gate 2 of mirror.ts), so the whole-block copy accident cannot recur.
 */
export const MIRROR_CONTAINER = SIDE_CONTAINER

export function isMirrorContainer(el: Element): boolean {
  return el.matches(MIRROR_CONTAINER) && el.closest(SIDE_DENY_SUBTREE) === null
}

// Stack regions: no left / right split inside these cells; the pairs fall back to stacking (modes.css holds the
// same list, guarded by tests). With no right column there, **no mirrors may be made inside** — a mirror exists so
// that “the right column is not empty”, and in a stack region it only becomes two copies in one column (measured on
// the three-panel figure of 2312.17141: every panel's formula repeated). A multi-panel flex figure is not here: its
// whole subtree is no container (SIDE_DENY_SUBTREE), the pairs inside stack as blocks anyway, and mirrors cannot get in
export const SIDE_STACK = [
  SIDE_LAYOUT.stack, // containers nested inside a paragraph
].join(', ')

/**
 * The structural marks side mode's style sheet reads instead of `:has()` (DESIGN §7.2), written once per session
 * right after the block marks: a multi-panel flex figure (`data-axt-panels`, its subtree is no container) and a
 * list item whose marker is its child (`data-axt-tagged`, the marker leaves the grid flow). Both are facts of the
 * page's own structure and never change; `restore()` sweeps them with every other `data-axt-*`. Idempotent.
 * Returns how many elements were marked
 */
export function markStructure(root: Document | Element): number {
  let marked = 0
  for (const [selector, attr] of [[MULTI_PANEL_FLEX, PANELS_ATTR], [SIDE_LAYOUT.taggedItem, TAGGED_ATTR]] as const) {
    for (const el of Array.from(root.querySelectorAll(selector))) {
      if (el.hasAttribute(attr)) continue
      el.setAttribute(attr, '')
      marked++
    }
  }
  return marked
}

/**
 * Whether this original closes its container: its translation-side node — translation, skeleton, widget, mirror
 * or split copy, whatever carries `axt-t` — is the container's last child. The last grid row's bottom margins
 * become blank a block layout would have collapsed, so the style sheet drops them (§7.2); it used to know the row
 * by `:nth-last-child(2):has(+ .axt-t)`. Called by everything that inserts or removes such a node, with the
 * original it belongs to; an original whose node is not last, or has none, loses the mark
 */
export function markTail(original: Element): void {
  const next = original.nextElementSibling
  original.toggleAttribute(TAIL_ATTR, !!next && next.classList.contains(T_CLASS) && next.nextElementSibling === null)
}

/**
 * Whether the frontmatter note this element sits in holds a real translation — the skeleton and the failure widget
 * do not count (Codex on #73): the note leaves arXiv's gutter and pairs only once a translation has actually
 * arrived, and returns there when it is taken away. Marked on the note and on the box whose direct child the
 * translation is (`.ltx_note_outer`, which becomes the pair's grid). Called after a translation is inserted or
 * removed; an element outside any frontmatter note costs one `closest()`
 */
export function markTranslatedNote(el: Element): void {
  const note = el.closest(NOTE.frontmatter)
  if (!note) return
  note.toggleAttribute(TRANSLATED_ATTR, note.querySelector(REAL_TRANSLATION) !== null)
  for (const outer of Array.from(note.querySelectorAll(NOTE.outer))) {
    outer.toggleAttribute(TRANSLATED_ATTR, outer.querySelector(`:scope > ${REAL_TRANSLATION}`) !== null)
  }
}
