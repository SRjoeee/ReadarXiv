// The bilingual entry on the abstract page (issue #146): one more line under arXiv's own HTML link in “Access Paper”,
// leading straight to the HTML full text already translating.
//
// **The URL is the one arXiv gives**, plus `#readarxiv` — the content script starts translating of itself on seeing that hash.
// Building `arxiv.org/html/<id>` ourselves would point at the wrong version of a paper with several (its href carries the `v7`).

import { HTML_LINK } from '@/core/rules/abstract'

/** The line we insert; `restore` leaves the abstract page alone, but the mark is still needed, for recognition and idempotence */
export const ABS_LINK_CLASS = 'axt-abs-link'
/**
 * The hash our links carry: the content script starts translating as soon as it enters a page that has it (DESIGN
 * §4.1). It stays in the address bar and travels with a link a reader passes on, so it is the product's name, not
 * the code's prefix (the maintainer, 2026-09-19)
 */
export const AUTO_TRANSLATE_HASH = '#readarxiv'
/** What 0.4.0's links carried. A bookmark or a shared link made then still starts the translation */
const LEGACY_AUTO_TRANSLATE_HASH = '#axt-translate'

/** Does this `location.hash` ask for the translation to start. Any capitalisation: the name is written `ReadarXiv` too */
export function startsTranslation(hash: string): boolean {
  const asked = hash.toLowerCase()
  return asked === AUTO_TRANSLATE_HASH || asked === LEGACY_AUTO_TRANSLATE_HASH
}

/**
 * Insert the bilingual entry; returns whether it was inserted.
 *
 * Nothing happens in three cases: this is not an abstract page, the paper has no HTML version (`HTML_LINK` absent), or it was inserted already.
 * Idempotent because it is cheap: arXiv's abstract page does not re-render, but an assumption that only holds under one DOM shape is not worth relying on.
 */
/**
 * Where arXiv says this paper's HTML full text is, plus the hash that starts the translation; null when the paper
 * has no HTML version. The popup asks the page for this rather than building a URL: the href carries the version.
 */
export function htmlHrefOn(doc: Document): string | null {
  const html = doc.querySelector<HTMLAnchorElement>(HTML_LINK)
  return html ? `${html.href}${AUTO_TRANSLATE_HASH}` : null
}

export function injectBilingualLink(doc: Document, label: string, options: { newTab?: boolean } = {}): boolean {
  const html = doc.querySelector<HTMLAnchorElement>(HTML_LINK)
  if (!html) return false
  const item = html.closest('li')
  if (!item?.parentElement) return false
  if (item.parentElement.querySelector(`.${ABS_LINK_CLASS}`)) return false

  const link = doc.createElement('a')
  // arXiv's own button style: this line has to look like a member of “Access Paper”, not something bolted on
  link.className = `abs-button ${ABS_LINK_CLASS}`
  link.href = `${html.href}${AUTO_TRANSLATE_HASH}`
  link.textContent = label
  setTarget(link, options.newTab !== false)
  const li = doc.createElement('li')
  li.append(link)
  item.after(li)
  return true
}

/**
 * Where the translation opens (config `reading.openIn`, v16): a new tab by default, so the page the reader is on
 * stays where it is. `rel` goes with `target`, or the new tab could reach back through `window.opener`.
 */
export function setTarget(link: HTMLAnchorElement, newTab: boolean): void {
  if (newTab) {
    link.target = '_blank'
    link.rel = 'noopener'
  } else {
    link.removeAttribute('target')
    link.removeAttribute('rel')
  }
}

/** Follow a change of that setting while the page stays open, as the label does */
export function retargetBilingualLink(doc: Document, newTab: boolean): boolean {
  const link = doc.querySelector<HTMLAnchorElement>(`.${ABS_LINK_CLASS}`)
  if (!link) return false
  setTarget(link, newTab)
  return true
}

/**
 * Rewrite the label of a link already on the page. The interface's language can change while an
 * abstract page sits open, and this entry point reads the setting once (Codex on #161)
 */
export function relabelBilingualLink(doc: Document, label: string): boolean {
  const link = doc.querySelector<HTMLAnchorElement>(`.${ABS_LINK_CLASS}`)
  if (!link) return false
  link.textContent = label
  return true
}
