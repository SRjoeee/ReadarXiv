// highlight-pages.mjs's types, for tests/pdf-reader/shapes.test.ts
import type { UnitWire } from '../../../src/pdf-reader/engine/layer-proto/bundle.mjs'
import type { ReadLeftPart } from '../../../src/pdf-reader/engine/layer-proto/format.mjs'
import type { Anchor } from '../../../src/pdf-reader/engine/pipeline/anchors.mjs'
import type { Layout } from '../../../src/pdf-reader/engine/view/highlight.mjs'

/** a part as the shapes read it, and a page's left part as readLeftPart gives it (no digest: made here, not read) */
export interface CutPart { pages: [number, number]; views: number[]; left: UnitWire[] }
export type CutLeft = Pick<ReadLeftPart, 'kind' | 'sha256' | 'bytes' | 'page' | 'first' | 'table' | 'spans' | 'pairs'>
export declare function cutSide(layout: Layout, anchors: Map<number, Anchor | null>, views: number[][], o?: { pairsOf?: (id: number, anchor: Anchor) => Map<number, number> | null | undefined }): { parts: CutPart[]; lefts: CutLeft[] }
export declare function pagesAgree(
  layout: Layout, anchors: Map<number, Anchor | null>, views: number[][], kindOf: (id: number) => string | undefined,
  o?: { starts?: Map<number, Int32Array>; sentences?: (id: number) => { text: string; offsets: number[] } | null; seed?: number; pairsOf?: (id: number, anchor: Anchor) => Map<number, number> | null | undefined },
): { pages: number; runs: number; sentences: number; starts: number; extra: number; differ: string[] }
