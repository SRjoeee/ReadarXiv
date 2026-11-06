// D.groups (design-b §1.6 E1; design-a §1.2 Laid.off, §1.4 "Hiding and text by the same groups"): a laid member's groups turned
// off on a page, and what of its own ink the page keeps, which the right pane lights with it (the owner's ruling of 2026-10-30:
// a block lights whole, its kept pieces and its label with it; a display a block of its own). Ported from engine 065c1d973
// hide.mjs unitHiding L46-109, its groups alone: its text (bit 1) goes off on every page it is drawn on; its elements (bit 2)
// where one of them with ink on the page is not kept where it stands (drawn as a crop, or as text in the translation); its
// label (bit 4) where it is drawn in the target's form. Planes B and C, the pastes and the erase rectangles have no
// counterpart: kept ink is in no group (design-a). A group the add-on could not part (Placed.fixed) is never turned off; a
// piece in such a group stays shown however it is drawn (today's `has`). A babel name that leads the member is a member of its
// own (its group is its own Laid's). Its facts: each element's ink (El.ink, one box a TeX line: [page, x0, y0, x1, y1, base]),
// whether it is a display, whether the reading keeps it where it stands (U.elements' `kept`), the label's ink (Label.ink) and
// whether it is drawn anew (U.label), the characters the reading keeps where they stand.

/** an element of the member as the groups read it: its piece, whether a display, its ink, whether it is kept where it stands */
export type GroupEl = {
  k: number
  display: boolean
  /** its own ink, one box a TeX line: [page, x0, y0, x1, y1, base]; [] where it prints nothing (EMPTY) */
  ink: readonly (readonly number[])[]
  kept: boolean
}
export type GroupsInput = {
  page: number
  /** the member's ord: its displays' hover ids are made from it (units.mjs displayIdsOf) */
  ord: number
  els: readonly GroupEl[]
  /** its label's ink ([page, x0, y0, x1, y1, base] a box) and whether it is drawn in the target's form; null where none */
  label: { ink: readonly (readonly number[])[]; drawn: boolean } | null
  /** its groups the add-on could not part (Placed.fixed): 2 elements, 4 label */
  fixed?: number
  /** the characters the reading leaves where they stand on the page (kept or accounted for nowhere): each box and baseline */
  chars?: readonly { box: readonly [number, number, number, number]; base: number }[]
}
/** the member's own ink the page keeps: [x0, y0, x1, y1] and its baseline; a display's hover id */
export type Shown =
  | { kind: 'display'; k: number; id: number | null; box: [number, number, number, number]; base: number }
  | { kind: 'piece'; k: number; box: [number, number, number, number]; base: number }
  | { kind: 'label' | 'char'; box: [number, number, number, number]; base: number }

/** the first hover id of the displays and how many a unit may have (units.mjs DISPLAY_ID_FROM, DISPLAYS_UNIT, NAME_ID_FROM) */
const DISPLAY_ID_FROM = 2 ** 29,
  DISPLAYS_UNIT = 2 ** 7,
  NAME_ID_FROM = 2 ** 22
/** a display's hover id: the unit's j-th display (units.mjs displayBlockId) */
const displayBlockId = (unit: number, j: number) =>
  Number.isInteger(unit) && unit >= 0 && unit < NAME_ID_FROM && Number.isInteger(j) && j >= 0 && j < DISPLAYS_UNIT
    ? DISPLAY_ID_FROM + unit * DISPLAYS_UNIT + j
    : null
/** each display's hover id, by piece, in the piece order (units.mjs displayIdsOf) */
export function displayIdsOf(unit: number, ks: readonly number[]): Map<number, number> {
  const out = new Map<number, number>()
  ;[...new Set(ks)]
    .sort((a, b) => a - b)
    .forEach((k, j) => {
      const id = displayBlockId(unit, j)
      if (id !== null) out.set(k, id)
    })
  return out
}

const boxOf = (s: readonly number[]): [number, number, number, number] => [s[1]!, s[2]!, s[3]!, s[4]!]

/** D.groups: the member's groups off on the page (bits: 1 text, 2 elements, 4 label) and its own ink the page keeps */
export function groupsOff(i: GroupsInput): { off: number; shown: Shown[] } {
  const fixed = i.fixed ?? 0
  let off = 1
  const on = (e: GroupEl) => e.ink.filter((s) => s[0] === i.page)
  const rowsOn = i.els.filter((e) => e.ink.length && on(e).length)
  const moved = rowsOn.some((e) => !e.display && !e.kept)
  if (moved) off |= 2
  const shown: Shown[] = []
  const displayIds = displayIdsOf(
    i.ord,
    i.els.filter((e) => e.display && e.ink.length).map((e) => e.k),
  )
  for (const e of rowsOn) {
    if (e.display)
      for (const s of on(e))
        shown.push({ kind: 'display', k: e.k, id: displayIds.get(e.k) ?? null, box: boxOf(s), base: s[5]! })
    else if (!moved || e.kept || fixed & 2)
      for (const s of on(e)) shown.push({ kind: 'piece', k: e.k, box: boxOf(s), base: s[5]! })
  }
  for (const s of i.label?.ink ?? []) {
    if (s[0] !== i.page) continue
    if (i.label!.drawn) off |= 4
    else shown.push({ kind: 'label', box: boxOf(s), base: s[5]! })
  }
  for (const c of i.chars ?? []) shown.push({ kind: 'char', box: [...c.box], base: c.base })
  return { off: off & ~fixed, shown }
}
