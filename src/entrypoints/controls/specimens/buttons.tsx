// Buttons and shortcut labels (Part 3, Task 16): the popup's primary with its shortcut, its neutral one with its own
// (S-P-51), P9's pair (the neutral twin without one), P17's two entries (one disabled), a form's bar with a button
// connecting, a row's small ones (one disabled), a note's raised ones on the group, and labels alone
import { FileText, Globe } from 'lucide'
import { Button } from '@/ui/controls/Button'
import { Kbd } from '@/ui/controls/Kbd'
import { O, S } from '@/ui/strings'

export function Buttons() {
  return (
    <>
      <div data-row className="popup-width">
        <Button kind="brand" size="lg" shortcut="⌥T">{S.primary.translate}</Button>
      </div>
      <div data-row className="popup-width">
        <Button size="lg" shortcut="⌥T">{S.primary.restore}</Button>
      </div>
      <div data-row className="popup-width">
        <Button kind="brand" size="lg" shortcut="⌥T">{S.primary.retranslate}</Button>
        <Button size="lg">{S.primary.restore}</Button>
      </div>
      <div data-row className="popup-width">
        <Button kind="brand" size="lg" icon={Globe}>{S.entry.html}</Button>
        <Button kind="brand" size="lg" icon={FileText} disabled>{S.entry.pdf}</Button>
      </div>
      <div data-row>
        <Button kind="brand">{O.services.connect}</Button>
        <Button kind="brand" busy>{O.services.connecting}</Button>
        <Button kind="text">{O.services.cancel}</Button>
      </div>
      <div data-row>
        <Button size="sm">{S.service.chrome_download}</Button>
        <Button kind="text" size="sm">{O.appearance.restore}</Button>
        <Button size="sm" disabled>{S.service.chrome_download}</Button>
      </div>
      <div data-row className="on-group">
        <Button kind="raised" size="sm">{S.settings}</Button>
        <Button kind="raised" size="sm">{S.failed.retry}</Button>
      </div>
      <div data-row>
        <Kbd>⌥T</Kbd>
        <Kbd>↵</Kbd>
      </div>
    </>
  )
}
