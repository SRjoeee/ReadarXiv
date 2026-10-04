// The website's mark (DESIGN §4.0d). The website (readarxiv.org) offers the extension to a visitor who has none and
// skips the offer to one who has; the one fact it needs is that the extension is there, and which version. A content
// script on the website's own pages writes it into the page, before the page's first script runs: one attribute on
// <html>. This is the whole of what the extension does there. Nothing is read from the page, nothing else is written to
// it, and no message is sent — in either direction.

/** The website's hosts, each matched over https and nothing else. Staging now; production joins when the website is live there */
export const WEB_APP_HOSTS: readonly ['app-staging.readarxiv.org'] = ['app-staging.readarxiv.org']

/** The match patterns of the content script: `https://<host>/*` for each of the website's hosts */
export const WEB_APP_MATCHES: string[] = WEB_APP_HOSTS.map(host => `https://${host}/*`)

/**
 * The attribute the website reads, its value the extension's version. A contract with the website, so it is not
 * `data-axt-*`: that prefix marks the extension's own work on the pages it translates (CLAUDE.md hard rule 2), and this
 * is a word between two products, which neither side may rename alone
 */
export const EXTENSION_MARK = 'data-readarxiv-extension'

/**
 * <html> marked with the extension's version. Nothing of the page is read first, the mark included, so that the
 * script reads nothing from the page, as PRIVACY.md and the store's justification say: it runs once, at
 * document_start, and writes the one attribute
 */
export function markWebAppPage(doc: Document, version: string): void {
  doc.documentElement.setAttribute(EXTENSION_MARK, version)
}
