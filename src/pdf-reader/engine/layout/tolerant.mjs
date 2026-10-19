// A unit's own mark that the line carry leaves, placed by the unit's own words beside it (PR-D2, the maker's tolerant
// match). The carry moves a position with its line's words (carry.mjs), and a line our marked compile sets in other words
// than arXiv's carries nothing: a reference our compile's cleveref names otherwise ("tasks (see section B)." for arXiv's
// "tasks (see appendix B).", 2609.26457's unit 28), or a paragraph TeX broke otherwise from such a name on (unit 71: 13
// lines in ours, 14 on arXiv's page), leaves the unit's end mark nowhere, and the unit the original's. Its words still
// stand on arXiv's page in their order, the line breaks aside: the run of them that ends at the mark (or begins at it) is
// found among arXiv's words in the unit's span, and the mark set at its end (its start).
// The words are compared one for one, each its text exactly; one of them at most may differ, and only where ours is a
// reference word (rules/reference-words.mjs) inside a reference's or a citation's own rendering and arXiv's is a
// reference word too: the name a cleveref or an \autoref prints. The mark's own word never differs. Pure, over tokens
// (anchors.mjs DocTokens). Imports the reference words alone.
import { isReferenceWord } from '../rules/reference-words.mjs'

/** the unit's words a mark is placed by: the last TOLERANT_WORDS before an end mark (the first after a start mark), at
 *  least TOLERANT_MIN of them */
export const TOLERANT_WORDS = 8, TOLERANT_MIN = 4

/**
 * The places of arXiv's words where `ours` stands, the mark's side last (an end mark's: `ours` the unit's words in order,
 * the mark's own word last; a start mark's: the mark's own word first): each an index into `theirs` (arXiv's words in the
 * unit's span, in order, none of no text) where the last (first) of `ours` stands. A word of ours matches arXiv's of the
 * same text; one at most of `ours` (never the mark's own) may stand for another where it is a reference's name (`ref`
 * true, a reference word) and arXiv's is a reference word as well. `atLineEnd`, where the mark's own word ends its line in
 * ours (begins it, a start mark's): arXiv's must end (begin) its line too (`theirs[j].last`, `.first`). Every place found
 * is returned: the caller takes one only where it is alone.
 * `ours`: [{ t, ref }]; `theirs`: [{ t, first, last }]. Returns [{ at, sub }]: `sub` the index in `ours` of the word that
 * stood for another, or -1
 */
export function wordsAt(ours, theirs, { end, atLineEnd = false }) {
  const n = ours.length, out = []
  if (n < TOLERANT_MIN || n > TOLERANT_WORDS) return out
  const own = end ? n - 1 : 0
  for (let j = 0; j + n <= theirs.length; j++) {
    let sub = -1, ok = true
    for (let q = 0; q < n && ok; q++) {
      const a = ours[q], b = theirs[j + q]
      if (a.t === b.t) continue
      ok = sub < 0 && q !== own && a.ref === true && isReferenceWord(a.t) && isReferenceWord(b.t)
      if (ok) sub = q
    }
    if (!ok) continue
    const at = end ? j + n - 1 : j
    if (atLineEnd && !(end ? theirs[at].last : theirs[at].first)) continue
    out.push({ at, sub })
  }
  return out
}
