// lab/pdf/prepare-back/pieces.mjs: a unit's content (the instrument's and the bundle's nested pieces) as the prepare dump's flat
// pieces (readarxiv-lab-data baseline FORMAT.md §2-3: text, ph, open, close, nested, each its `k` by its place), and where each
// of its elements stands among them. The dump states an element's `k` as its piece's k (FORMAT.md §3), which the lab's readers of
// a dump join an element to its piece by (stated.mjs, the differential's sameEl). A content's element ids are not those places:
// the instrument numbers a piece by the front end's own piece index (pipeline/instrument.mjs piecesOf), and drops a group that
// carries nothing, a face switch first in a bare group, and joins the texts on either side: after any such piece the two differ
// (round B15's r22: 7,807 of 73,121 elements named no placeholder of their unit, lane lost-11). run.mjs and restate.mjs read both
// from here.

/**
 * `content` (the instrument's Piece[]) as the dump's flat pieces, in their order, and `kOf`: each element's and nested unit's
 * content id to its piece's k
 */
export function flatOf(content) {
  const pieces = []
  const kOf = new Map()
  const walk = (ps) => {
    for (const p of ps) {
      if (p.t === 'text') pieces.push({ k: pieces.length, kind: 'text', s: p.s })
      else if (p.t === 'el') {
        kOf.set(String(p.id), pieces.length)
        pieces.push({ k: pieces.length, kind: 'ph', src: p.src })
      } else if (p.t === 'unit') {
        // (a nested unit's note mark is an element of its outer unit, keyed by the nested piece)
        kOf.set(String(p.id), pieces.length)
        pieces.push({ k: pieces.length, kind: 'nested', pre: p.pre, unit: p.unit, post: p.post })
      } else {
        if (p.open !== undefined) pieces.push({ k: pieces.length, kind: 'open', src: p.open })
        walk(p.content)
        if (p.close !== undefined) pieces.push({ k: pieces.length, kind: 'close', src: p.close })
      }
    }
  }
  walk(content)
  return { pieces, kOf }
}

/** the dump's `k` of the element a member keys by `id` (its content id): its piece's k; null for one of no piece (the name
 *  before's trail, locate's El keyed `~`), as the dump has always written it */
export const pieceKOf = (kOf, id) => (id === null || id === undefined ? null : (kOf.get(String(id)) ?? null))

/**
 * A dump's own units (not its statements) whose elements a run.mjs before lane lost-11 keyed by their content ids, each keyed by
 * its piece's k: `contentOf(id)` a unit's content by its id (the run's bundle's units), undefined where the bundle holds none (that
 * unit's elements left as they are, and counted). Returns the units, each new where it moved, and the counts { units, elements,
 * moved, unbundled }
 */
export function keyedByPiece(units, contentOf) {
  const counts = { units: 0, elements: 0, moved: 0, unbundled: 0 }
  const out = units.map((u) => {
    if (u.replaced || !u.elements?.length) return u
    counts.units++
    const content = contentOf(u.id)
    if (!content) {
      counts.unbundled++
      return u
    }
    const { kOf } = flatOf(content)
    const elements = u.elements.map((e) => {
      counts.elements++
      const k = pieceKOf(kOf, e.k)
      if (k === e.k) return e
      counts.moved++
      return { ...e, k }
    })
    return { ...u, elements }
  })
  return { units: out, counts }
}
