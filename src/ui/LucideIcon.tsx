// A Lucide glyph in the extension's own pages (ISC; docs/THIRD_PARTY.md). The floating button draws the same nodes
// as a string into its shadow root (core/floating/button.ts); here they are React elements. One source for a glyph
// both surfaces show — the settings gear — so the two cannot drift apart again: the popup once carried a gear of its
// own, drawn by hand, beside the floating button's (the maintainer, 2026-09-20).
import { createElement } from 'react'
import type { IconNode } from 'lucide'

/** Lucide's own drawing: a 24 px grid, 2 px round strokes. The nodes used here carry plain attributes (`d`, `cx`, `cy`, `r`), which React takes as they are */
export function LucideIcon({ node, size = 18 }: { node: IconNode; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {node.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  )
}
