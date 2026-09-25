// The reader's icons (the reader's design, §4.2): Lucide's (ISC, docs/THIRD_PARTY.md) at 16 px with a 1.5 stroke on the
// 24 grid, one CSS pixel; and the display switch's own three on a 24 × 18 pane at 1.2, the letters filled (§6.2)
import type { IconNode } from 'lucide'
import { createElement } from 'react'
import type { Display } from '../controller'
import { GLYPH_A, GLYPH_WEN } from './display-glyphs'

export function Icon({ node, size = 16, className }: { node: IconNode; size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {node.map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  )
}

/** U+6587 is narrowed to 0.8 of its width: a stroke this wide round its outline gives back the weight its verticals lost */
export const WEN_GAIN = 0.16

export function DisplayIcon({ display }: { display: Display }) {
  return (
    <svg aria-hidden="true" width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" overflow="visible">
      <rect x="2.25" y="2.5" width="19.5" height="13" rx="3" />
      {display === 'bilingual' && <path d="M12 2.5v13" />}
      {display === 'original' && <path d={GLYPH_A} fill="currentColor" stroke="none" />}
      {display === 'translation' && <path d={GLYPH_WEN} fill="currentColor" strokeWidth={WEN_GAIN} />}
    </svg>
  )
}
