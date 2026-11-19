// A bundle's unit as a translator is given it: packages/format's Unit, as a prepare writes it and format's `read` gives it,
// projected onto the contract's UnitIn. The one projection: the Worker, the extension's reader and the lab call it, so that
// what a translator is sent is what the engine's wires build, whoever sends it. Format's types alone are read here (`import
// type`): nothing of format's runs in this package. Beside it, the digest of that statement (`askedOf`), which a row names.
import type { Piece as BundlePiece, Unit as BundleUnit } from '@readarxiv/format'
import type { Piece, UnitIn } from './contract.ts'
import { sha256Hex } from './sha256.ts'

/** the element a nested unit (a footnote set inside a paragraph) travels as in its parent: its mark, read as a note's mark
 *  (wire/text.ts standInOf: an annotation of the sentence before it, never part of a word), as the engine's locate types its
 *  mark (locate.ts). Its text is a unit of its own, with its own row */
export const NESTED_KIND = 'note-mark'

/**
 * A bundle's unit as a translator is given it: every field format states that the contract declares, which is what the wires
 * read (a wire reads a piece through the contract's type), and none that only names the unit or a piece: an element's TeX
 * source `src` and its `keys`, a group's `open` and `close`, a heading's `depth`, the block a unit's source ties it to, `of`
 * (what the reader's options read of it); and `kept`, which no translator is given (the caller leaves a kept unit out: it is
 * never translated). A field format adds that the contract declares reaches the wire
 * with no change here; one it does not declare is a field of identity, to be left here too (tests/bundle.test.ts holds both:
 * the fixture states every field of format's schema, and no wire reads a field left)
 */
export function unitInOf(unit: BundleUnit): UnitIn {
  const { depth: _depth, kept: _kept, of: _of, content, ...rest } = unit
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

/**
 * The digest of a unit's statement: the lowercase hexadecimal SHA-256 of what a translator is given of it, every field of the
 * contract's UnitIn but its id (a label, which a row's address holds already with the chain and the target): the UTF-8 bytes
 * of `JSON.stringify([kind or null, content, sentences, strict, entry])`, each flag read as set or not. Stable under key
 * order: each piece is written with its fields in the order the contract declares them (Piece: a text's `t`, `s`; an
 * element's `t`, `id`, `kind`, `stop`, `alone`, `reads`, `silent`, `newblock`, `after`, `name`, `nameLang`, `text`; a group's
 * `t`, `id`, `style`, `must`, `stop`, `content`), whatever order its object holds them in, and a field it does not state left
 * out; a value as it is stated (`1` and `true` apart). So two statements of one unit id that a translator may be sent apart (an
 * element's `name` or `text`, a group's `must`, `stop` or `style`, the unit's `entry`) have two digests, and one statement
 * however its objects were built has one. A row names the statement it answered by it (format's `Row.asked`), and a host keeps
 * a row only for the statement it would send now: the extension's row key (src/providers/transport.ts) and our server's rows.
 * Nothing of the chain, the target or the paper enters. A field the contract adds is a type error here until it is written
 * (`unread`, an empty rest). The order is the one the stores' keys were made in before it: format's reader gives a piece's
 * fields in its schema's order and `unitInOf` keeps it, the HTML page's protector builds them so (core/protector/units.ts)
 */
export function askedOf(unit: UnitIn): string {
  const { id: _id, kind, content, sentences, strict, entry, ...unread } = unit
  const none: Record<string, never> = unread
  void none
  return sha256Hex(
    JSON.stringify([kind ?? null, content.map(statedOf), sentences === true, strict === true, entry === true]),
  )
}

/** a piece with its fields in the contract's order (JSON leaves out a field whose value is undefined, as one not stated) */
function statedOf(p: Piece): unknown {
  if (p.t === 'text') {
    const { t, s, ...unread } = p
    const none: Record<string, never> = unread
    void none
    return { t, s }
  }
  if (p.t === 'el') {
    const { t, id, kind, stop, alone, reads, silent, newblock, after, name, nameLang, text, ...unread } = p
    const none: Record<string, never> = unread
    void none
    return { t, id, kind, stop, alone, reads, silent, newblock, after, name, nameLang, text }
  }
  const { t, id, style, must, stop, content, ...unread } = p
  const none: Record<string, never> = unread
  void none
  return { t, id, style, must, stop, content: content.map(statedOf) }
}
