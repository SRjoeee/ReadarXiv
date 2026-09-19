// The popup's React binding: `createPopupState` (state.ts) holds what the popup knows and what it can do; this gives
// it the extension's own browser as its host and hands React one state and the actions, so the view stays a pure
// function of `PopupInput` (docs/UI.md §4). PopupView.tsx reads `input` through derivePopupView() and calls `actions`.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { browser } from 'wxt/browser'
import { COMMAND_ID } from '@/entrypoints/background/context-menu'
import { sendMessage, sendToActiveTab } from '@/shared/messages'
import { downloadPack } from '@/shared/pack'
import { localeStale } from '@/ui/use-surface-config'
import { closePopup, EMBEDDED } from './embedded'
import { type PopupActions, type PopupHost, createPopupState } from './state'
import type { PopupInput } from './view-model'

export type { OptionsSection, PopupActions } from './state'

/** The extension's own browser as the popup's host */
const browserHost = (): PopupHost => ({
  toTab: sendToActiveTab,
  toBackground: sendMessage,
  onBroadcast(listener) {
    browser.runtime.onMessage.addListener(listener)
    return () => browser.runtime.onMessage.removeListener(listener)
  },
  openTab: url => browser.tabs.create({ url }),
  openOptionsPage: () => void browser.runtime.openOptionsPage(),
  url: path => browser.runtime.getURL(path as Parameters<typeof browser.runtime.getURL>[0]),
  shortcut: async () => (await browser.commands.getAll()).find(c => c.name === COMMAND_ID)?.shortcut || null,
  platform: async () => ((await browser.runtime.getPlatformInfo()).os === 'mac' ? 'mac' : 'other'),
  extensionId: browser.runtime.id,
  embedded: EMBEDDED,
  close: closePopup,
  downloadPack,
  config: { localeStale, reload: () => location.reload() },
})

export function usePopupData(): { input: PopupInput; error: string | null; actions: PopupActions } {
  const [popup] = useState(() => createPopupState(browserHost()))
  // Started in an effect and stopped by its clean-up, so a strict-mode remount asks and polls once
  useEffect(() => popup.start(), [popup])
  const { input, error } = useSyncExternalStore(popup.subscribe, popup.state)
  return { input, error, actions: popup.actions }
}
