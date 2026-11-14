// instrument-before.mjs's types: the front half's adapter as it was at 18f6103ac, the reference the code change of the typing lane T6
// is held to (tests/pdf-reader/instrument-bounds.test.ts), each function as the test calls it, on any input
type Piece = { t: string; s?: string; src?: string }
type Point = { name: string; glyph: number; box: number }
export declare function glyphPiecesOf(
  pg: { points: readonly Point[]; glyphs: readonly { u?: string }[] },
  row: readonly (string | null | undefined)[],
  o?: { units?: readonly { pieces: readonly Piece[] }[]; texts?: ReadonlyMap<string, string> | null; names?: ReadonlySet<string>; open?: Map<number, number[]> },
): Int32Array
