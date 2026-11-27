/** What `@readarxiv/reader` is for: the page stack, composing, session, highlight and the Host a reader runs in */
export const READER_PURPOSE = 'the page stack, composing, session, highlight and the Host a reader runs in' as const

export type { Box, FaceId, Item, Laid, Lay, Page, Rows } from './compose/page.ts'
export type { FaceEntry, FaceTable } from './compose/faces.ts'
export {
  type Command,
  DEFAULTS,
  type Engine,
  type Host,
  type OutlineEntry,
  openReader,
  type PaperContext,
  type PrefStore,
  type Reader,
  type ReaderState,
  type Result,
} from './reader.ts'
export type { Side, Zoom } from './panes/panes.ts'
// the way back (PDF-READER §11.9): the jump stack's history contract, and a window's history as a host gives it
export type { Entry as HistoryEntry, HostHistory, Light, Place } from './session/jumps.ts'
export { type WindowHistory, windowHistory } from './session/window-history.ts'
// PDF.js's builds: which one a browser runs; the legacy one itself is `@readarxiv/reader/pdfjs-legacy`'s
export { buildFor, legacyRuns, modernRuns } from './pdfjs/builds.ts'
export type { PdfBuild, PdfModules } from './pdfjs/kit.ts'
export {
  type Band,
  bandPaint,
  CLASSES,
  type ClassName,
  type Display,
  type Prefs,
  type PrefsPatch,
  type UiLanguage,
  type WritablePrefs,
} from './prefs.ts'
// the chrome: the controller it folds a session's events into, the page it mounts, what a host's slots use
export { Capsule } from './chrome/Capsule.tsx'
export { plain, withCount } from './chrome/capsule-words.ts'
export {
  type OutlineEntry as ChromeOutlineEntry,
  type ReaderState as ChromeState,
  createController,
  fileName,
  INITIAL,
  LASTING,
  type ReaderController,
  reduce,
  type Session,
  type SessionEvent,
  type SessionHost,
  TOAST_MS,
  type Toast,
  type Unavailable,
} from './chrome/model.ts'
export { eventsOf, kindOf, LAYER_WHY } from './chrome/events.ts'
// a reader made into the chrome's session, for every host (what a host gives is only what differs)
export { type ChromeOpen, openSession } from './chrome/open.ts'
// a failed prepare's word, as our server's document names it, to the layer's refusal (the website's tests hold it to its server's words)
export { PREPARE_WHY } from './session/machine.ts'
export { type Cause, causeOf } from './chrome/status.ts'
export { mountChrome } from './chrome/mount.tsx'
export { CATALOGUE_WORDS, linkNameOf, type Words } from './compose/words.ts'
export { type LanguageItem, type Languages, PARTS, type Parts, type Slots, type StateWords } from './chrome/parts.tsx'
export { useSettingsLock } from './chrome/settings-lock.ts'
export { ToolbarButton } from './chrome/ToolbarButton.tsx'
export { useReader } from './chrome/use-reader.ts'
// the PDF download's module, loaded on the reader's press alone (its chunk, with the engine's object layer it reads with)
export const loadExport = () => import('./export/index.ts')
export type { ExportForm, ExportInput, ExportStats, Glyphs, SfntFont } from './export/index.ts'
