// The translation services as a menu lists them (UI.md §2, S-P-40–48): the popup's service menu and the PDF reader's
// (the reader's design, §6.7) show the same list with the same words. Moved here from the popup's view model
import type { Config } from '@/config/schema'
import { serviceRuns } from '@/config/services'
import { supportsTarget } from '@/providers/microsoft'
import type { PackState } from '@/shared/pack'
import type { MenuItem } from './Menu'
import { S } from './strings'

/** The last row of the service menu: not a service, it opens the settings page */
export const MANAGE_SERVICES = '__manage'

/** UI.md §2: Microsoft, Google, LLM, Chrome. Only Chrome and an unsupported language disable an item; the LLM without a key stays selectable and gets the settings note */
export function serviceItems(config: Config, pack: PackState | null): MenuItem[] {
  const microsoftOk = supportsTarget(config.targetLanguage)
  const chrome = (): MenuItem => {
    const base = { id: 'chrome-builtin', name: S.service.chrome, selected: config.provider === 'chrome-builtin' }
    switch (pack) {
      case 'available':
        return { ...base, hint: S.service.chrome_ready }
      case 'downloadable':
        return { ...base, hint: S.service.chrome_ready, disabled: true, action: { label: S.service.chrome_download } }
      case 'downloading':
        return { ...base, hint: S.service.chrome_downloading, disabled: true, action: { label: S.service.chrome_download, busy: true } }
      case 'unsupported':
      case 'unavailable':
        return { ...base, hint: S.service.chrome_unavailable, disabled: true }
      default:
        return { ...base, hint: S.service.chrome_ready, disabled: true }
    }
  }
  return [
    { id: 'microsoft', name: S.service.microsoft, hint: microsoftOk ? S.service.free : S.service.microsoft_unsupported, selected: config.provider === 'microsoft', disabled: !microsoftOk },
    { id: 'google-web', name: S.service.google, hint: S.service.free, selected: config.provider === 'google-web' },
    // The reader's own sit where the contract puts the LLM: after the two free services and before
    // Chrome (UI.md S-P-46). Then the way to the page where they are managed
    ...config.services.map(s => ({ id: s.id, name: s.name, hint: serviceRuns(s) ? s.model : S.service.llm_noKey, selected: config.provider === s.id })),
    chrome(),
    { id: MANAGE_SERVICES, name: S.service.manage, selected: false },
  ]
}
