// The popup's React binding: `createPopupState` (state.ts) holds what the popup knows and what it can do; this gives
// it the extension's own browser as its host and hands React one state and the actions, so the view stays a pure
// function of `PopupInput` (docs/UI.md §4). PopupView.tsx reads `input` through derivePopupView() and calls `actions`.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { browser } from 'wxt/browser'
import { bilingualPdfOf, ENTRY_CHECK_MS, htmlVersionOf, pdfUrlOf, translatedHtmlUrlOf } from '@/core/pdf/entry'
import { COMMAND_ID } from '@/entrypoints/background/context-menu'
import { readerRuns } from '@/pdf-reader/support'
import { onMessages, sendMessage, sendToActiveTab } from '@/shared/messages'
import { downloadPack } from '@/shared/pack'
import { localeStale } from '@/ui/use-surface-config'
import { closePopup, EMBEDDED } from './embedded'
import { type PopupActions, type PopupHost, createPopupState } from './state'
import type { PopupInput } from './view-model'

export type { OptionsLink, PopupActions } from './state'

/**
 * P0's two checks of a paper (the redesign's design, §5.4): the PDF page's own HEADs (core/pdf/entry.ts), sent from the
 * extension's origin to arXiv by its host permission, each given ENTRY_CHECK_MS before its entry is offered anyway.
 * Exported for its own test (the ENTRY_CHECK_MS race, `within`): every other caller goes through `usePopupData`
 */
export function paperEntries(id: string): Promise<{ html: string | null; pdf: string | null }> {
  const send: typeof fetch = (url, init) => fetch(url, init)
  const within = <T>(check: Promise<T>, offered: T) => Promise.race([check, new Promise<T>(resolve => setTimeout(resolve, ENTRY_CHECK_MS, offered))])
  return Promise.all([
    within(htmlVersionOf(id, send), translatedHtmlUrlOf(id)),
    readerRuns() ? within(bilingualPdfOf(id, send), pdfUrlOf(id)) : Promise.resolve(null),
  ]).then(([html, pdf]) => ({ html, pdf }))
}

/** The extension's own browser as the popup's host */
const browserHost = (): PopupHost => ({
  toTab: sendToActiveTab,
  toBackground: sendMessage,
  onBroadcast: onMessages,
  openTab: url => browser.tabs.create({ url }),
  openOptionsPage: () => void browser.runtime.openOptionsPage(),
  url: path => browser.runtime.getURL(path as Parameters<typeof browser.runtime.getURL>[0]),
  shortcut: async () => (await browser.commands.getAll()).find(c => c.name === COMMAND_ID)?.shortcut || null,
  embedded: EMBEDDED,
  close: closePopup,
  downloadPack,
  config: { localeStale, reload: () => location.reload() },
  // arXiv's pages alone show their address to the extension: the host permissions also reach openrouter.ai,
  // translate-pa.googleapis.com, edge.microsoft.com and any origin the reader granted, but not a tab's address —
  // any other tab's is null here
  tabUrl: async () => (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.url ?? null,
  entriesOf: paperEntries,
})

export function usePopupData(seed: { rejected?: readonly string[] } = {}): { input: PopupInput; error: string | null; actions: PopupActions } {
  const [popup] = useState(() => createPopupState(browserHost(), seed))
  // Started in an effect and stopped by its clean-up, so a strict-mode remount asks and polls once
  useEffect(() => popup.start(), [popup])
  const { input, error } = useSyncExternalStore(popup.subscribe, popup.state)
  return { input, error, actions: popup.actions }
}
