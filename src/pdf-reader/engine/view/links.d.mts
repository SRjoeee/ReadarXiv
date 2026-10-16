// links.mjs's types: the links of a laid page as the reading view draws them over its place (3b)
import type { LinkRecord } from '../layer-proto/reader.mjs'
import type { ViewWords } from './reader-view.mjs'

/** the words a link with no glyph under it is named by until a host gives its own: a placeholder, the owner's copy pending */
export declare const LINK_NAME_PLACEHOLDER: Readonly<{ internal: string; external: string }>
export declare const BOXES_MAX: number
export declare const NAME_MAX: number
export declare const DEST_MAX: number
/** a record as the view draws it: checked, copied, its boxes split, in reading order */
export interface ShownLink {
  boxes: [number, number, number, number][]
  name: string
  order: number
  at: number
  dest?: string | unknown[]
  url?: string
  border: { width: number; rgb: number[]; style: 'solid' | 'dashed' | 'underline' } | null
}
/** the records a page's layer carries that the view can draw, in reading order (`order`, then the list's), each copied */
export declare function linkRecords(records: readonly LinkRecord[] | null | undefined): ShownLink[]
/** a viewport as the links are placed by: PDF.js's PageViewport, or its shape */
export interface LinkViewport { width: number; height: number; convertToViewportPoint(x: number, y: number): number[] }
/** the page's links in one element (`div.axt-links > a.axt-link > span.axt-link-box`), or null where none can be carried */
export declare function linkLayer(records: readonly LinkRecord[] | null | undefined, o: {
  viewport: LinkViewport | null | undefined
  follow(dest: string | unknown[], how: { keyboard: boolean }): void
  open(url: string): void
  words?: Pick<ViewWords, 'linkName'> | null
}): HTMLDivElement | null
