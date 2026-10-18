// A small icon button of the reader's (the pill's arrows, the capsule's close, the contents' folds): named by its words
// to assistive technology, and in a tooltip to the eye, as every control of the bar is (the reader's design, §6.1; the
// tooltip is hidden from assistive technology, its words being the name already). `side`: where the tooltip stands, above
// for what is at the foot of the page, aside for the sidebar. `tip`: other words for the tooltip than the name, where the
// name is the thing acted on and the tooltip says what the press does (a section's fold: its title, and expand or collapse)
import type { ButtonHTMLAttributes, CSSProperties } from 'react'
import { useTip } from '@/ui/controls/tip'

export function TippedButton({ label, tip: words = label, side, style, ...rest }: { label: string; tip?: string; side?: 'bottom' | 'right' | 'top' } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'>) {
  const { props, tip } = useTip(words, undefined, { side })
  return (
    <>
      <button type="button" aria-label={label} {...rest} {...props} style={{ ...style, ...props.style } as CSSProperties} />
      {tip}
    </>
  )
}
