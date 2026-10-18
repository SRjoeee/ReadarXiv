// The controls that write the settings are out of reach until the settings have landed, and for as long as they cannot
// be read (S-R-21): a write then waits behind the read or is refused (config/storage.ts), and a control that looks
// pressed and does nothing says nothing of why. They stay in their places, greyed (aria-disabled, so that they keep
// the focus and the tooltip), so that the bar does not reflow when the settings arrive (P3-M16); the tooltip tells the
// reason once it is known, not for the short time before the first answer
import { R } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { useReader } from './use-reader'

export function useSettingsLock(controller: ReaderController): { locked: boolean; why: string | undefined } {
  const { landed, unreadable } = useReader(controller, s => ({ landed: s.settings !== null, unreadable: s.settingsUnreadable }))
  return { locked: !landed || unreadable, why: unreadable ? R.status.unreadableHint : undefined }
}
