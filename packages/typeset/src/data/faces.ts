// The face catalogue B.faces reads: each face's CSS family (ours, `axt-`), weight, style and size correction; the alphabets
// whose every letter its file holds; the faces whose file sets small capitals of its own. Held once in @readarxiv/text, which
// the engine's role table reads too (font-faces.ts FACES, made from its FACE_TABLE; font-letters.ts HOLDS and SMCP, made from
// the coverage table and held to the face files by the release check's `face-files` gate): the catalogue here is its four
// fields the typesetter reads, in the table's order.
import { FACES as TABLE } from '@readarxiv/text'

export { HOLDS, SMCP } from '@readarxiv/text'

/** a face of the catalogue as the typesetter reads it */
export type CatalogueFace = { family: string; weight: number; style: 'normal' | 'italic'; size: number }

export const FACES: Readonly<Record<string, CatalogueFace>> = Object.fromEntries(
  Object.entries(TABLE).map(([id, f]): [string, CatalogueFace] => [
    id,
    { family: f.family, weight: f.weight, style: f.style, size: f.size },
  ]),
)
