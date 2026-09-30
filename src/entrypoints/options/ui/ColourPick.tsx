// A colour of one's own (the redesign's design, §6.4): the last swatch, the palette's hues round it, opening the
// browser's own picker, which always yields #rrggbb — a value the colour sanitiser accepts
import type { MouseEvent } from 'react'
import { PALETTE } from '@/config/appearance'

const WHEEL = `conic-gradient(${[...PALETTE, PALETTE[0]].join(', ')})`
/** the picker's starting value while nothing of the reader's is held — the one the old style drawer's colour field started from; a value, not a colour drawn */
const START = '#1565c0'
/** the picker is the press's default action — the keys' too, their activation being a click — so a refused press keeps it shut */
const refuse = (e: MouseEvent) => e.preventDefault()

/**
 * `disabled`: no room for a colour of one's own (the highlight's list at its cap). Greyed as every unavailable control
 * of the page is — `aria-disabled`, still in the tab order, its press refused (Button.tsx) — and described by
 * `describedBy`, the reason its row gives (Codex 4c)
 */
export function ColourPick({ label, value, pressed, disabled = false, describedBy, onPick }: {
  label: string
  value?: string
  pressed: boolean
  disabled?: boolean
  describedBy?: string
  onPick: (hex: string) => void
}) {
  return (
    <input type="color" className="swatch o-swatch o-pick" aria-label={label} title={label} data-pressed={pressed ? '' : undefined}
      aria-disabled={disabled || undefined} aria-describedby={describedBy} onClick={disabled ? refuse : undefined}
      value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : START} style={{ background: WHEEL }} onChange={e => { if (!disabled) onPick(e.target.value) }} />
  )
}
