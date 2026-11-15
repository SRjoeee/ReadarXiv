// lab/pdf/prepare-back/silent-gate.mjs: the gate of `silent` (format's el: the element sets nothing where it stands), read off a
// paper's bundle as the prepare wrote it: every element a unit states `silent` whose placement in a part states ink or a text
// TeX set for it (El `ink` not [], or `text` neither absent nor ''). Such an element would go on no wire and come back at its
// group's front or end while TeX set something where it stands. run.mjs counts them and fails the paper (exit 5); the release
// check's `prepare` gate runs it. Over the three sets at round 3's head (r3-int f645*), the kernel's list alone: 12,680 silent
// elements, 12,450 of them placed, none with ink or text (lane wire-e's gate-list.mts).

/**
 * The silent elements a part contradicts. `units` the bundle's Units objects' units (format's Unit), `parts` its parts (format's
 * Part). Returns their count and each one as [unit id, piece id, what the part states: 'ink' | 'text']
 */
export function silentInkOf(units, parts) {
  const stated = new Map()
  for (const part of parts)
    for (const flow of part.flows ?? [])
      for (const m of flow) {
        if (typeof m.text !== 'string') continue
        for (const [k, el] of m.els ?? []) {
          const key = `${m.text}|${k}`
          const l = stated.get(key)
          if (l) l.push(el)
          else stated.set(key, [el])
        }
      }
  const rows = []
  const walk = (u, ps) => {
    for (const p of ps) {
      if (p.t === 'span') walk(u, p.content)
      else if (p.t === 'el' && p.silent) {
        const els = stated.get(`${u.id}|${p.id}`) ?? []
        if (els.some((el) => el.ink?.length)) rows.push([u.id, p.id, 'ink'])
        else if (els.some((el) => typeof el.text === 'string' && el.text !== '')) rows.push([u.id, p.id, 'text'])
      }
    }
  }
  for (const u of units) walk(u, u.content ?? [])
  return { count: rows.length, rows }
}
