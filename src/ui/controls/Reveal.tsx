// What appears only when it applies (the redesign's design, §8, §9; Part 3's interfaces): a sub-row, a form, an editor
// or a list, opened in place — its rows grow from 0fr to 1fr as it fades in (controls.css .reveal), and while closed its
// contents are inert: out of the tab order, hidden from assistive technology. Where the focus goes as it opens or closes
// is the caller's: a form's first field; back to the row that opened it
import type { ComponentProps } from 'react'

export function Reveal({ open, className, children, ...rest }: { open: boolean } & ComponentProps<'div'>) {
  return (
    <div {...rest} data-open={open || undefined} className={className ? `reveal ${className}` : 'reveal'}>
      <div inert={!open}>{children}</div>
    </div>
  )
}
