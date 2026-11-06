// The identities the bundle's objects carry: a unit's id by its content, a group's name by its placement, the original's
// chunk digests.
import { sha256, sha256Hex, toBase64Url, utf8 } from './bytes.ts'
import { ORIGINAL_CHUNK, type Piece } from './schema.ts'

/** a piece as the id's hash reads it (the baseline's FORMAT.md §2): ["t", s] a text, ["p", src] an element, ["o", open] and
 *  ["c", close] around a span's content (either absent where the unit's edge cuts the group), ["n", pre, unit, post] a nested unit */
function tagged(content: readonly Piece[], out: unknown[]): unknown[] {
  for (const p of content) {
    switch (p.t) {
      case 'text':
        out.push(['t', p.s])
        break
      case 'el':
        out.push(['p', p.src])
        break
      case 'span':
        if (p.open !== undefined) out.push(['o', p.open])
        tagged(p.content, out)
        if (p.close !== undefined) out.push(['c', p.close])
        break
      case 'unit':
        out.push(['n', p.pre, p.unit, p.post])
        break
    }
  }
  return out
}

/**
 * A unit's id: the lowercase hexadecimal SHA-256 of the UTF-8 bytes of `JSON.stringify([kind, P])`, P its pieces tagged in
 * the source's order (the baseline's FORMAT.md §2). Nothing else enters: no ordinal, occurrence, position or flag, so two
 * units of one kind and content share an id, and a row
 */
export const unitId = (kind: string, content: readonly Piece[]): string =>
  sha256Hex(utf8(JSON.stringify([kind, tagged(content, [])])))

/** a group's letter: 1 its text, 2 its elements, 4 its label */
const GROUP_LETTER = { 1: 't', 2: 'e', 4: 'l' } as const
export type GroupBit = keyof typeof GROUP_LETTER
/** the optional-content group (and marked-content) name of one placement's group on one page: `axt:<ord>.<page>.<t|e|l>` */
export const groupName = (ord: number, page: number, group: GroupBit): string =>
  `axt:${ord}.${page}.${GROUP_LETTER[group]}`
/** a group name's parts, or null for a name that is not one of ours */
export function groupOf(name: string): { ord: number; page: number; group: GroupBit } | null {
  const m = /^axt:(\d+)\.(\d+)\.([tel])$/.exec(name)
  if (!m) return null
  return { ord: Number(m[1]), page: Number(m[2]), group: m[3] === 't' ? 1 : m[3] === 'e' ? 2 : 4 }
}

/** the original's chunk digests as the head carries them: each ORIGINAL_CHUNK bytes' SHA-256, its first 16 bytes in
 *  base64url (22 characters a chunk), joined */
export function chunkDigests(bytes: Uint8Array): string {
  let s = ''
  for (let o = 0; o < bytes.length; o += ORIGINAL_CHUNK)
    s += toBase64Url(sha256(bytes.subarray(o, o + ORIGINAL_CHUNK)).subarray(0, 16))
  return s
}
/** whether `chunk` (the i-th ORIGINAL_CHUNK bytes of the original, the last one shorter) is the one the head names */
export const chunkMatches = (chunks: string, i: number, chunk: Uint8Array): boolean =>
  chunks.slice(22 * i, 22 * i + 22) === toBase64Url(sha256(chunk).subarray(0, 16))
