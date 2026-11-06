/** What `@readarxiv/reader` is for: the page stack, composing, session, highlight and the Host a reader runs in */
export const READER_PURPOSE = 'the page stack, composing, session, highlight and the Host a reader runs in' as const

export type { Box, FaceId, Item, Laid, Lay, Page, Rows } from './compose/page.ts'
export type { FaceEntry, FaceTable } from './compose/faces.ts'
export {
  type Command,
  DEFAULTS,
  type Engine,
  type Host,
  openReader,
  type PrefStore,
  type Reader,
  type ReaderState,
  type Result,
} from './reader.ts'
export type { Side, Zoom } from './panes/panes.ts'
export {
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
} from './chrome/model.ts'
export { mountChrome } from './chrome/mount.tsx'
export { type LanguageItem, type Languages, PARTS, type Parts, type Slots } from './chrome/parts.tsx'
export { useSettingsLock } from './chrome/settings-lock.ts'
export { ToolbarButton } from './chrome/ToolbarButton.tsx'
export { useReader } from './chrome/use-reader.ts'
