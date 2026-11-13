// Phase 1 of locate (locate.ts): the instrument's units placed on A (place.ts), a babel name's every occurrence a member
// of its own, an author block's unit TeX set inside a paragraph that sets a unit again left unplaced.
// Reads: the index; the record's `members` (an ord is their count) and the ownership (in place.ts: a glyph another unit holds).
// Writes: `members` (each placement pushed); the ownership (in place.ts: each placement's ink taken, the glyphs a unit that
// stays the original's holds; here the units left unplaced, released: their glyphs' partners no source unit's, phase 4 reads).
import { isInk } from './lines.ts'
import type { Claims } from './ownership.ts'
import { empty, place } from './place.ts'
import { AUTHOR_KINDS, type Work } from './work.ts'

/** the cause of an author block's unit left unplaced because TeX set it in a paragraph that sets a unit again: it has no place
 *  of its own on A (ink.ts reads the block's own text where its units stand nowhere else) */
export const SET_AGAIN = 'set in a paragraph that sets a unit again'
/** a babel name's end point on B (marks.mjs NAMES_TEX: `n<occurrence>.<key>.e`) */
const NAME_END = /^n\d+\.[a-z]{1,16}\.e$/
/** the same, its unit's key and whether it starts or ends a setting */
const MARK_KEY = /^([ht]?\d+)([se])$/

export function placeUnits(w: Work, claims: Claims): void {
  const { ins, B, m, glyphsOf, boxesOf, turnedOf, pageB, gB } = w.ix
  const { members } = w
  // ---- an author block's unit TeX set inside a paragraph that sets another unit again: a template's paragraph, made of the
  // paper's own front matter (ACM's reference format: the authors, the year, the title a second time), whose text is the page's,
  // read and translated as one unit (ink.ts), never cut by the unit. 2610.22065v1 p1: its block under the title written out by
  // the paper, its \author units set in the reference format alone, each name a member: the paragraph laid on the original's
  // rows, never reflowing (its first line ended at x 190, TeX's at 294). A paragraph sets a unit again where a start point of
  // the unit's stands in it after an end point of the unit's in B's stream (its setting begun again: the copy, own.mjs MR 3's
  // first occurrence the unit's own); the paragraph from the last end TeX states before the unit's first glyph to the first
  // after its last (Instrument.tex.paragraphEnds). Where TeX states no paragraph ends, nothing is read. Not a name's own setting:
  // a block whose units TeX set twice has them its first setting's, the block's (2402.10294v1's ACM names)
  const released = new Set<number>()
  {
    const paraEnds: number[] = []
    ;(ins.tex.paragraphEnds ?? []).forEach((l, p) => {
      for (const g of l) paraEnds.push((m.offB[p] as number) + g)
    })
    paraEnds.sort((x, y) => x - y)
    const ended = new Set<string>()
    const again: number[] = []
    B.pages.forEach((pg, p) => {
      for (const x of pg.points ?? []) {
        const k = MARK_KEY.exec(x.name)
        if (!k) continue
        if (k[2] === 'e') ended.add(k[1]!)
        else if (ended.has(k[1]!)) again.push((m.offB[p] as number) + x.glyph)
      }
    })
    if (again.length && paraEnds.length)
      for (let u = 0; u < ins.units.length; u++) {
        const list = glyphsOf.get(u)
        if (!AUTHOR_KINDS.has(ins.units[u]!.kind) || ins.units[u]!.name !== undefined || !list?.length) continue
        let from = Number.NEGATIVE_INFINITY
        for (const e of paraEnds) if (e <= (list[0] as number)) from = e
        const to = paraEnds.find((e) => e > (list.at(-1) as number)) ?? Number.POSITIVE_INFINITY
        if (again.some((g) => g >= from && g < to)) {
          released.add(u)
          claims.release(u)
        }
      }
  }

  // ---- the instrument's units, a name's every occurrence its own member
  for (let u = 0; u < ins.units.length; u++) {
    const unit = ins.units[u]!
    const list = glyphsOf.get(u) ?? []
    const boxes = boxesOf.get(u) ?? []
    if (released.has(u)) {
      const mem = empty(w, u, unit.kind, unit.id)
      mem.cause = SET_AGAIN
      members.push(mem)
      continue
    }
    if (unit.name === undefined) {
      members.push(place(w, claims, u, list, boxes, undefined, turnedOf.get(u) ?? []))
      continue
    }
    // (a name's occurrences: each maximal run of its glyphs in B's stream on one page)
    const runs: number[][] = []
    for (const b of list) {
      const last = runs.at(-1)
      if (last && last.at(-1) === b - 1 && pageB[b] === pageB[b - 1]) last.push(b)
      else runs.push([b])
    }
    if (!runs.length) members.push(place(w, claims, u, [], []))
    for (const r of runs) {
      const mem = place(w, claims, u, r, [], unit.name)
      // (its counter: its glyphs after its end point, which stands inside the run)
      const p = (pageB[r[0] as number] as number) - 1
      const o = m.offB[p] as number
      const end = (B.pages[p]?.points ?? []).find(
        (x) => NAME_END.test(x.name) && o + x.glyph > (r[0] as number) && o + x.glyph <= (r.at(-1) as number),
      )
      if (end) {
        const after = r.filter((b) => b >= o + end.glyph && isInk(gB(b))).map((b) => m.bToA[b] as number)
        if (after.length && after.every((a) => a >= 0)) mem.counterA = after
      }
      members.push(mem)
    }
  }
}
