// A run's style from its characters, as S.names sets a name in it (shared/names.ts). It is all of U.lead this module holds:
// the lay leads a unit by the name its part binds to it (lay/lead.ts ledBy), never by a run's lead read off the page.

/** a character of the page as the lead reads it */
export type LeadChar = {
  ch: string
  x0: number
  x1: number
  page?: number
  st?: { fam?: string; bold?: boolean; italic?: boolean; caps?: boolean; design?: string; fill?: number } | null
}

const hexOf = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`
const colourOfStyle = (st: LeadChar['st']) =>
  Number.isInteger(st?.fill) && st!.fill! >= 0 ? { color: st!.fill! > 0 ? hexOf(st!.fill!) : undefined } : {}
/** a run's style from its characters, the first not a formula's */
export function styleOfChars(cs: readonly LeadChar[], serif: string): Record<string, unknown> {
  const s0 = cs.find((c) => c.st?.fam !== 'math')?.st ?? cs[0]?.st ?? {}
  return {
    fam: s0.fam === 'math' || !s0.fam ? 'serif' : s0.fam,
    bold: !!s0.bold,
    italic: !!s0.italic,
    caps: !!s0.caps,
    design: s0.design ?? serif,
    ...colourOfStyle(s0),
  }
}
