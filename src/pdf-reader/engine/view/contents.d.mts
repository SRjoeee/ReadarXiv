// contents.mjs's types: the contents and the heading read, on the layer
import type { LayerIndex, ReadPart } from '../layer-proto/format.mjs'
import type { Row } from '../layer-proto/rows.mjs'
import type { OutlineEntry } from './outline'
import type { PageBox } from './shapes.mjs'

export interface Contents {
  addParts(parts: readonly Pick<ReadPart, 'left'>[]): boolean
  take(rows: readonly Row[]): boolean
  outline(doc: { getOutline(): Promise<unknown[] | null>; getDestination(id: string): Promise<unknown[] | null>; getPageIndex(ref: unknown): Promise<number> }): Promise<boolean>
  entries(): OutlineEntry[]
  firstRect(id: number): PageBox | null
  pageOf(id: number): number | null
  headingAt(page: number, y: number | null): number | null
}
export declare function createContents(index: LayerIndex): Contents
