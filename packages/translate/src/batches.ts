// How large a call of a reader's translation is: both hosts cut a paper's units into calls by these two sizes (the
// extension's PDF reader in the reader's order, the website in its windows), so that what a paper is sent as is the same
// whoever sends it. A size is in characters of the units' plain source, and a unit is never split: one longer than a size is
// a call alone.

/** the characters the first call holds at most: small, so that the answer for the units nearest the reader comes back soon.
 *  A budget: no record states how the value was chosen */
export const FIRST_BATCH_MAX = 2_500
/** the characters every later call holds at most: larger, so that the rest of the paper goes in fewer calls. A budget: no
 *  record states how the value was chosen */
export const NEXT_BATCH_MAX = 12_000
