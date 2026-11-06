// Small helpers today's rules share, ported as they are (their numbers decide layouts: the same order of operations).

/** the upper median: the middle of the sorted values, the upper of the two middles; 0 for none (layer1.mjs:16 median) */
export const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)]! : 0
}

/** a line's rectangle as today's reading makes it from a line: [page, x0, y0, x1, y1] (tex.mjs:269 texRects) */
export type Rect = [page: number, x0: number, y0: number, x1: number, y1: number]

/** a rectangle's key, as today keys a unit's lines by it (layer2.mjs:269, tex.mjs:28 rectKey): `page|x0,y0,x1,y1` */
export const rectKey = (r: readonly number[]): string => `${r[0]}|${r.slice(1).join()}`
/** the key of a rectangle without its x0: the second spelling today's lineInfo holds each line by (tex.mjs:508) */
export const rectKeyNoX0 = (r: readonly number[]): string => `${r[0]}|${r[2]}|${r[3]}|${r[4]}`
