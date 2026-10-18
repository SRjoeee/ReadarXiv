// A menu's item as the surfaces' data layers build it — the service list (service-items.ts) and the reader's language
// list — before a menu draws it: the popup's view model and the reader's menus map it onto the shared MenuList's rows
// (@/ui/controls/MenuList). Moved from the old src/ui/Menu.tsx, retired with the redesign (its design, §2.3)
import type { CSSProperties } from 'react'

export interface MenuItem {
  id: string
  name: string
  hint?: string
  /** Inline style for the hint line: the appearance menu shows each style on a sample sentence */
  preview?: CSSProperties
  /** Extra words the search also matches (a language's other names, its code) */
  keywords?: string
  selected: boolean
  disabled?: boolean
  /** A button beside the item (the offline pack's download); `busy` shows a spinner instead */
  action?: { label: string; busy?: boolean }
}
