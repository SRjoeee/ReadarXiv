// A colour of one's own (the redesign's design, §6.4): the last swatch, the palette's hues round it, opening the
// browser's own picker, which always yields #rrggbb — a value the colour sanitiser accepts
import { PALETTE } from '@/config/appearance'

const WHEEL = `conic-gradient(${[...PALETTE, PALETTE[0]].join(', ')})`
/** the picker's starting value while nothing of the reader's is held: today's ColorField's; a value, not a colour drawn */
const START = '#1565c0'

export function ColourPick({ label, value, pressed, onPick }: { label: string; value?: string; pressed: boolean; onPick: (hex: string) => void }) {
  return (
    <input type="color" className="swatch o-swatch o-pick" aria-label={label} title={label} data-pressed={pressed ? '' : undefined}
      value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : START} style={{ background: WHEEL }} onChange={e => onPick(e.target.value)} />
  )
}
