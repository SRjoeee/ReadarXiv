// A bundle's unit as a translator is given it: packages/format's Unit, as a prepare writes it and format's `read` gives it,
// projected onto the contract's UnitIn. The one projection: the Worker, the extension's reader and the lab call it, so that
// what a translator is sent is what the engine's wires build, whoever sends it. Format's types alone are read here (`import
// type`): nothing of format's runs in this package.
import type { Piece as BundlePiece, Unit as BundleUnit } from '@readarxiv/format'
import type { Piece, UnitIn } from './contract.ts'

/** the element a nested unit (a footnote set inside a paragraph) travels as in its parent: its mark, read as a note's mark
 *  (wire/text.ts standInOf: an annotation of the sentence before it, never part of a word), as today's wire reads a nested
 *  unit (src/pdf-reader/engine/translate/mt.mjs splitContextOf: a `nested` piece is an annotation) and the engine's
 *  locate types its mark (locate.ts). Its text is a unit of its own, with its own row */
export const NESTED_KIND = 'note-mark'

/**
 * A bundle's unit as a translator is given it: every field format states that the contract declares, which is what the wires
 * read (a wire reads a piece through the contract's type), and none that only names the unit or a piece: an element's TeX
 * source `src` and its `keys`, a group's `open` and `close`, a heading's `depth`; and `kept`, which no translator is given (the
 * caller leaves a kept unit out: it is never translated). A field format adds that the contract declares reaches the wire
 * with no change here; one it does not declare is a field of identity, to be left here too (tests/bundle.test.ts holds both:
 * the fixture states every field of format's schema, and no wire reads a field left)
 */
export function unitInOf(unit: BundleUnit): UnitIn {
  const { depth: _depth, kept: _kept, content, ...rest } = unit
  return { ...rest, content: content.map(pieceOf) }
}

function pieceOf(p: BundlePiece): Piece {
  if (p.t === 'el') {
    const { src: _src, keys: _keys, ...el } = p
    return el
  }
  if (p.t === 'span') {
    const { open: _open, close: _close, content, ...span } = p
    return { ...span, content: content.map(pieceOf) }
  }
  if (p.t === 'unit') return { t: 'el', id: p.id, kind: NESTED_KIND }
  return p
}
