/** What `@readarxiv/format` is for: the schema of the bundle, read and write */
export const FORMAT_PURPOSE = 'the schema of the bundle, read and write' as const

export { fromUtf8, sha256, sha256Hex, toBase64Url, toHex, utf8 } from './bytes.ts'
export { chunkDigests, chunkMatches, type GroupBit, groupName, groupOf, unitId } from './ids.ts'
export { BOUNDS, canonical, FormatError, type Obj, type ObjKind, read, SCHEMAS, shapeOf, write } from './io.ts'
export {
  Box,
  Digest,
  El,
  ElKind,
  FORMAT,
  Faces,
  Head,
  Id,
  Ink,
  Kind,
  LINE_FLAG,
  Label,
  Line,
  Link,
  LinkBorder,
  LinkTo,
  ORIGINAL_CHUNK,
  Original,
  OutPiece,
  Part,
  Piece,
  Placed,
  PrepWhy,
  Room,
  Row,
  Rows,
  SpanAt,
  SpanKind,
  Style,
  Tie,
  Unit,
  Units,
  Why,
  Word,
} from './schema.ts'
