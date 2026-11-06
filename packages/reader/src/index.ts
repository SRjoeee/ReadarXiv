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
export type { Display, Side, Zoom } from './panes/panes.ts'
