import { getConfig, setConfig, watchConfig } from '@/config/storage'
import { AUTO_TRANSLATE_HASH } from '@/core/abstract/link'
import { extract, paperContext } from '@/core/extractor'
import { paperIdFromUrl } from '@/core/pipeline'
import { createPageSession } from '@/core/session'
import { isAxtMessage, replyWith, sendMessage } from '@/shared/messages'
import { createMessageTransport } from '@/shared/transport'
import { applyLocaleFrom } from '@/ui/apply-locale'
import { enableDebug } from './debug'

// Injected into arxiv.org/html/*. On page load it only extracts (no DOM writes) and keeps the Block[] in memory;
// translation starts when the popup sends axt:translate-page (DESIGN §4.1). A URL with #axt-debug draws outlines, one with #axt-translate starts of itself — for debugging and automated checks.
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

    if (location.hash === '#axt-debug') enableDebug(blocks)
    if (location.hash === AUTO_TRANSLATE_HASH) void session.start()
  },
})
