// The objects the source reader makes, shaped as packages/format states them (rebuild/prepare, L1's schema.ts: design A's
// Unit and Piece, with a span's `open`/`close` source and a nested unit's piece, which the unit id needs). packages/format
// holds no schema on this branch yet: at the merge, these types are deleted and imported from @readarxiv/format.

/** a piece of a unit, in the source's order; a piece's id is its place in its unit, so equal units are equal piece for
 *  piece. `el`: what travels with the text untranslated (a formula, a citation, …), `src` its TeX source, for identity
 *  only. `span`: a group of the source around text, styled; `must` its style must come back (a link, a run-in label);
 *  `open`/`close` its TeX source, either absent where the unit's edge cuts the group. `unit`: a unit nested in this one (a
 *  footnote set inside a paragraph), by its id, with the source around it */
export type Piece =
  | { t: 'text'; s: string }
  | { t: 'el'; id: string; kind: string; src: string; keys?: string[] }
  | { t: 'span'; id: string; style: string; must?: 1; open?: string; close?: string; content: Piece[] }
  | { t: 'unit'; id: string; unit: string; pre: string; post: string }

export interface Unit {
  id: string
  kind: string
  content: Piece[]
  depth?: number
}
