import { getConfig, setConfig, watchConfig } from '@/config/storage'
import { AUTO_TRANSLATE_HASH } from '@/core/abstract/link'
import { extract, paperContext } from '@/core/extractor'
import { paperIdFromUrl } from '@/core/pipeline'
import { createPageSession } from '@/core/session'
import { installFloatingButton, type InstalledFloatingButton } from '@/shared/floating'
import { isAxtMessage, replyWith, sendMessage } from '@/shared/messages'
import { createMessageTransport } from '@/shared/transport'
import { applyLocaleFrom } from '@/ui/apply-locale'
import { enableDebug } from './debug'

// Injected into arxiv.org/html/*. On page load it only extracts and keeps the Block[] in memory — the one DOM write
// is the floating button's host on <body> (DESIGN §4.0c, §7.1); translation starts when the reader asks (DESIGN §4.1). A URL with #axt-debug draws outlines, one with #axt-translate starts of itself — for debugging and automated checks.
//
// This file is an adapter (DESIGN §4.3): the session's state and decisions live in core/session; here
// the browser's messages, the configuration subscription and the URL hash are mapped onto it.
export default defineContentScript({
  matches: ['https://arxiv.org/html/*'],
  runAt: 'document_idle',
  main() {
    const t0 = performance.now()
    const blocks = extract(document)
    // The title + abstract are extracted once here: the DOM holds no translation yet, and extracting after a translation would count the previous round's translation into the abstract
    const context = paperContext(document)
    console.debug(`[axt] extracted ${blocks.length} blocks in ${Math.round(performance.now() - t0)} ms`)

    // The chain, the queues and the requests all live in the background (DESIGN §8.0): a content-script fetch carries the
    // page's origin and goes through a CORS preflight, and an https page cannot reach an http endpoint (a local Ollama); measured in DESIGN §8.0. Only a message proxy stays here
    /** The floating button (DESIGN §4.0c); null until it is installed, and the session may well start before that */
    let floating: InstalledFloatingButton | null = null
    const session = createPageSession({
      doc: document,
      blocks,
      paper: paperIdFromUrl(location.href),
      context,
      backend: createMessageTransport(),
      ocr: call => sendMessage({ type: 'axt:ocr', ...call }),
      helperStatus: () => sendMessage({ type: 'axt:helper-status' }),
      config: { get: getConfig, set: setConfig },
      applyLocale: applyLocaleFrom,
      // The floating button's tick follows the page, whoever started or restored it: the popup, the key, the menu,
      // the hash, the button itself. A stopped session (a fatal error) shows no translation in progress, so no tick
      onState: state => floating?.setActive(state === 'on'),
      // The same line goes to the diagnostics log (issue #156): a reader's export then shows what this page did
      trace: line => {
        console.debug(`[axt] ${line}`)
        void sendMessage({ type: 'axt:diag', src: 'content', line }).catch(() => undefined)
      },
    })
    // watchConfig rather than a message: the settings page is itself the active tab and cannot reach the content page; the subscription also updates every open paper at once
    watchConfig(config => session.onConfig(config))

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isAxtMessage(message)) return
      switch (message.type) {
        case 'axt:translate-page':
          replyWith(session.start(message.mode, message.restart === true, undefined, message.epoch), sendResponse)
          return true
        case 'axt:restore-page':
          sendResponse(session.restore(message.epoch))
          return true
        case 'axt:set-mode':
          // A refused save (the stored settings unreadable, config/storage.ts) rejects after the page has switched: the popup says why
          replyWith(session.setMode(message.mode).then(r => ({ mode: r.effective, preference: r.mode })), sendResponse)
          return true
        case 'axt:retry-failed':
          sendResponse({ retried: session.retryFailed() })
          return true
        case 'axt:helper-ready':
          sendResponse({ resumed: session.resumeRaster() })
          return true
        case 'axt:page-status':
          replyWith(session.status(), sendResponse)
          return true
      }
    })

    // The floating button: here its main button is the toggle the key and the menu are, decided in the background
    // on the saved settings (shared/page-action.ts), so the four doors cannot disagree. After the extraction above,
    // which therefore never sees it
    void installFloatingButton(document, {
      main: { kind: 'toggle', run: () => void sendMessage({ type: 'axt:toggle' }).catch(() => undefined) },
      label: (S, active) => (active ? S.primary.restore : S.primary.translate),
    }).then(async installed => {
      floating = installed
      installed.setActive((await session.status()).progress.state === 'on')
    })

    if (location.hash === '#axt-debug') enableDebug(blocks)
    if (location.hash === AUTO_TRANSLATE_HASH) void session.start()
  },
})
