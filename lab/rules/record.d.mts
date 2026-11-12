// record.mjs's types
import type { Recording } from './merge.mjs'
import type { SiteMap } from './sites.mjs'

export interface CensusItems { trees: { AFTER: { debt: { thresholds: { list: object[] }; lists: { list: object[] } } } } }
export interface AreaCounts { thresholds: number; lists: number; noSite: number; readsOnly: number; ran: number; ranThresholds: number; ranLists: number }
export interface Agreement {
  census: { thresholds: number; lists: number }
  map: { thresholds: number; lists: number }
  onlyCensus: string[]
  onlyMap: string[]
  noSite: { key: string; line: number; why: string }[]
  readsOnly: number
  byArea: Record<string, AreaCounts>
  ran: number | null
  rules: number
}
export declare function siteMapOfCheckout(root: string, options?: { webProfile?: object | null }): SiteMap
export declare function countsOf(map: SiteMap): { rules: number; thresholdsTuned: number; lists: number; byArea: Record<string, number>; sites: number; sitesByKind: Record<string, number>; noSite: string[]; onlyReads: number; files: number }
export declare function agreementOf(census: CensusItems, map: SiteMap, recording?: Recording | null): Agreement
