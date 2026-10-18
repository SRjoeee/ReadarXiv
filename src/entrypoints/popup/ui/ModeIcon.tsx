// The display's three icons, the reader's family (its design, §6.2): the reader's pane of 24 × 18, split down the middle
// for side by side, across for stacked, its wen glyph for the translation alone
import type { Mode } from '@/core/renderer'
import { GLYPH_WEN } from '@/pdf-reader/ui/display-glyphs'
import { WEN_GAIN } from '@/pdf-reader/ui/icons'

export function ModeIcon({ mode }: { mode: Mode }) {
  return (
    <svg aria-hidden="true" width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" overflow="visible">
      <rect x="2.5" y="2.5" width="19" height="13" rx="3" />
      {mode === 'side' && <path d="M12 2.5v13" shapeRendering="crispEdges" />}
      {mode === 'stack' && <path d="M2.5 9h19" shapeRendering="crispEdges" />}
      {mode === 'only' && <path d={GLYPH_WEN} fill="currentColor" strokeWidth={WEN_GAIN} />}
    </svg>
  )
}
