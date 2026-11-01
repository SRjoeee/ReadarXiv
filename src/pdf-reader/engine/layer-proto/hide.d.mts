// hide.mjs's types: a drawn unit's page over our wrapped page
export declare const CLIP_PAD: number
export interface UnitHiding {
  off: string[]
  fromB: number[][]
  fromC: number[][]
  clips: Map<number, { rects: number[][]; own: number[][] }>
  hidden: number[][]
  /** its own ink left on the page, lit with it on the right: a display under its own hover id, a kept piece, its label, a kept character */
  shown: ShownInk[]
}
export interface ShownInk { kind: 'display' | 'piece' | 'label' | 'char'; box: number[]; base: number; k?: number; id?: number | null }
export declare function unitHiding(o: { page: number; id: number; lu: unknown; kOf: readonly number[]; lines: unknown; prep: unknown; nm?: { occurrence: number; x0: number; x1: number; top: number; bottom: number } | null; has?: (group: string) => boolean }): UnitHiding
