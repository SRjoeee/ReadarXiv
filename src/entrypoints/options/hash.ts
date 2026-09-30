// Where the settings page is (the redesign's design, §6.1): `#<section>` keeps the place across a reload;
// `#<section>/<row>` opens a section at a row and lights it once — the popup's manage rows (#translate/services,
// #translate/prompts, #appearance/styles) and the reader's settings (#reading/pdf). The section hashes before the
// redesign lead to their new places, so that a link a reader kept still works
export const SECTIONS = ['translate', 'appearance', 'reading', 'data'] as const
export type Section = (typeof SECTIONS)[number]
export interface Place { section: Section; row?: string }

const ALIASES: Record<string, Place> = {
  services: { section: 'translate', row: 'services' },
  prompts: { section: 'translate', row: 'prompts' },
  'pdf-reader': { section: 'reading', row: 'pdf' },
}
const isSection = (v: string): v is Section => (SECTIONS as readonly string[]).includes(v)

export function parseHash(hash: string): Place {
  const [head = '', row] = hash.replace(/^#/, '').split('/')
  if (Object.hasOwn(ALIASES, head)) return ALIASES[head]!
  if (!isSection(head)) return { section: 'translate' }
  return row ? { section: head, row } : { section: head }
}

/**
 * A deep link's arrival: the row scrolled into view, lit once (§8: `ink` at 9 %, fading over 1.4 s) and given the
 * focus when it takes one. A row that is not drawn (the prompts, with no LLM service yet) leaves the section at its top
 */
export function reach(root: HTMLElement, place: Place): void {
  if (!place.row) return
  const el = root.querySelector<HTMLElement>(`[data-row="${place.section}/${place.row}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center' })
  el.setAttribute('data-flash', '')
  el.addEventListener('animationend', () => el.removeAttribute('data-flash'), { once: true })
  const target = el.matches('button, [tabindex]') ? el : el.querySelector<HTMLElement>('[role="radio"][tabindex="0"], button, [role="switch"]')
  target?.focus({ preventScroll: true })
}
