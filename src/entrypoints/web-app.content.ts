// The website's mark (DESIGN §4.0d). **This one thing only**: it reads nothing from the page, writes one attribute on
// <html> and sends no message, so it loads none of the extension's modules but the mark itself. `document_start`: the
// attribute is there before the page's first script runs, so the website can read it without waiting for anything.
//
// WXT's wrapper announces every content script it starts with a `window.postMessage` to the page, which any script of
// the page hears, its `type` carrying the extension's id (measured in Chromium 153). That is a message, and an id the
// mark does not give: `noScriptStartedPostMessage` turns it off. What remains of the announcement is one event on
// `document`, dispatched before any page script can listen and named by the id, so only a page that already knows the id could hear it
import { markWebAppPage, WEB_APP_MATCHES } from '@/shared/web-app'

export default defineContentScript({
  matches: WEB_APP_MATCHES,
  runAt: 'document_start',
  noScriptStartedPostMessage: true,
  main() {
    markWebAppPage(document, browser.runtime.getManifest().version)
  },
})
