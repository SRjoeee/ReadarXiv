// The display switch's own three icons on a 24 × 18 pane, the maintainer's round 11 (2026-09-25): its frame 1 px too,
// as Lucide's beside it (@/ui/controls/Icon), its edges on the pixel grid, the split drawn crisp; the letters filled (§6.2)
import type { Display } from '../controller'
import { GLYPH_A, GLYPH_WEN } from './display-glyphs'

/** U+6587 is narrowed to 0.76 of its width: a stroke this wide round its outline gives back the weight its verticals lost */
export const WEN_GAIN = 0.18

export function DisplayIcon({ display }: { display: Display }) {
  return (
    <svg aria-hidden="true" width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" overflow="visible">
      <rect x="2.5" y="2.5" width="19" height="13" rx="3" />
      {display === 'bilingual' && <path d="M12 2.5v13" shapeRendering="crispEdges" />}
      {display === 'original' && <path d={GLYPH_A} fill="currentColor" stroke="none" />}
      {display === 'translation' && <path d={GLYPH_WEN} fill="currentColor" strokeWidth={WEN_GAIN} />}
    </svg>
  )
}
