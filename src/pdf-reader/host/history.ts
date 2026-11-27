// The page's history as the reader's (PDF-READER §11.9 "The way back"): the reader package's windowHistory over this page's
// window, one for the page, given as the reader's `Host.history` wherever the reader runs — its own tab and its frame over
// arXiv's PDF page alike (the lead's ruling on tests/e2e/probes/framed-history.mjs, 2026-11-27: within a live page the browser's
// Back and Forward reach the frame). The reader's ordinary way out of the frame steps back over its entries first (links.ts
// leaveReader), so that none lingers in arXiv's page's history; after a reload of arXiv's page, or leaving it and coming back,
// each jump not undone costs one Back that does nothing visible (the known limit §11.9 states)
import { type WindowHistory, windowHistory } from '@readarxiv/reader'

let given: WindowHistory | null = null
/** the page's history as the reader's, made once */
export const readerHistory = (): WindowHistory => (given ??= windowHistory(window))
/** the reader's entries stepped back over (none told to the reader): before the frame is taken away */
export const unwindReader = (): Promise<void> => readerHistory().unwind()
