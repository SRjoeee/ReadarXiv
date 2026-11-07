// S.fill.target (design-b §1.5): a page's fill target, its own leading held within the band of the anchor (§3.3). Ported from
// engine 065c1d973 run.mjs: pageTarget RUN:329-345, BODY_KINDS RUN:235-236. Its voters are stated by the part (the units
// begun on the page and those running on to it, PassFacts / design-a §1.3), each with its fill leading at its fit (S.fill.leads).
import { median } from '../util.ts'

/** a voter: a unit laid on the page, its kind, whether it was refused, its fill leading and its fitted lines */
export type Voter = { kind: string; refused?: boolean; fillLead: number | null | undefined; fitLines: number }
/** the page's target, its own leading before it is held, the anchor, whether its body units told it */
export type FillTarget = { target: number | null; own: number | null; anchor: number | null; body: boolean }

/** the page's body units: those its fill's target reads first and its one size grows (RUN:236) */
export const BODY_KINDS: readonly string[] = Object.freeze(['para', 'abstract', 'list', 'item'])

/**
 * S.fill.target: the median fill leading of the units begun on the page that tell one with two lines or more, body units
 * first, held within `band` of the anchor, the median of every body unit drawn on the page (those running on to it too);
 * null where nothing tells (RUN:329 pageTarget)
 */
export function fillTarget(
  units: readonly Voter[],
  continuing: readonly Voter[],
  band: number,
  kinds: readonly string[] = BODY_KINDS,
): FillTarget | null {
  const r3 = (x: number) => Math.round(x * 1000) / 1000
  const isBody = (k: string) => kinds.includes(k)
  const tells = (p: Voter): p is Voter & { fillLead: number } => typeof p.fillLead === 'number'
  const withLead = units.filter((p) => !p.refused && tells(p)) as (Voter & { fillLead: number })[]
  const telling = withLead.filter((p) => p.fitLines >= 2)
  const body = telling.filter((p) => isBody(p.kind))
  const anchorLeads = [...units, ...continuing]
    .filter((p) => isBody(p.kind) && !p.refused && tells(p) && p.fitLines >= 2)
    .map((p) => p.fillLead as number)
  const anchor = anchorLeads.length ? r3(median(anchorLeads)) : null
  const leads = (body.length ? body : telling.length ? telling : withLead).map((p) => p.fillLead)
  if (!leads.length) return anchor === null ? null : { target: null, own: null, anchor, body: false }
  const own = median(leads)
  const target = r3(anchor === null ? own : Math.min(anchor + band, Math.max(anchor - band, own)))
  return { target, own: r3(own), anchor, body: body.length > 0 }
}
