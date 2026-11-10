// S.relay (design-b §1.6 F9): a run-in head laid over its follower's first row (S.overFollower) is laid again in its row alone,
// as before the ruling of 2026-11-03, where the follower is left the original's, is not laid from the head's end (`ledBy`), or
// is laid from it only below its own floor (`below-floor`); and the follower, laid or refused while the head held part of its
// row, is then laid again from where the head now ends. Each relay settles in turn the unit before the one it lays, so a row
// three units share comes back whole: layFlow walks the decision back along its members. Ported from engine 065c1d973
// run.mjs settleLeadOf RUN:2550-2558 (the decision) and relay RUN:2565-2602 (the lay again, with `noOver`: layFlow's).
// Never taken on the corpus (the tap: no relay round): held by synthetic tests.

/** the head before the follower on their shared line, as its lay left it */
export type RelayLead = { id: number; over: boolean; refused: boolean }
/** the follower, as its lay left it */
export type RelayFollower = {
  refused: boolean
  ledBy: number | null | undefined
  knob: string | null | undefined
  kept: boolean
}

/**
 * S.relay: whether the head is laid again in its row alone (`lead`), and then the follower again from where it ends
 * (`follower`); `laid`: the follower's lay ended (else it was left the original's unlaid, as a page of it failed)
 */
export function relay(
  lead: RelayLead | null | undefined,
  f: RelayFollower,
  laid: boolean,
): { lead: boolean; follower: boolean } {
  if (!lead?.over || lead.refused) return { lead: false, follower: false }
  const led = !f.refused && f.ledBy === lead.id
  if (led && f.knob !== 'below-floor') return { lead: false, follower: false }
  // (the follower again only where its lay began with its rectangles kept: `kept`, today's rects0)
  return { lead: true, follower: laid && (f.refused || led) && f.kept }
}
