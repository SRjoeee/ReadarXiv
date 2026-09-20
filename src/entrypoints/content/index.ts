import { getConfig, setConfig, watchConfig } from '@/config/storage'
import { startsTranslation } from '@/core/abstract/link'
import { extract, paperContext } from '@/core/extractor'
import { IMG_CLASS, T_CLASS } from '@/core/marks'
import { paperIdFromUrl } from '@/core/pipeline'
import { FIGURE_SELECTORS } from '@/core/rules/latexml'
import { createPageSession } from '@/core/session'
import { installFigureViewer } from '@/core/viewer'
import { installFloatingButton, type InstalledFloatingButton } from '@/shared/floating'
import { onMessages, sendMessage } from '@/shared/messages'
import { createMessageTransport } from '@/shared/transport'
import { applyLocaleFrom } from '@/ui/apply-locale'
import { enableDebug } from './debug'

// Injected into arxiv.org/html/*. On page load it only extracts and keeps the Block[] in memory — the one DOM write
// is the floating button's host on <body> (DESIGN §4.0c, §7.1); translation starts when the reader asks (DESIGN §4.1). A URL with #axt-debug draws outlines, one with #readarxiv starts of itself — for debugging and automated checks.
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

    onMessages({
      'axt:translate-page': message => session.start(message.mode, message.restart === true, undefined, message.epoch),
      'axt:restore-page': async message => session.restore(message.epoch),
      // A refused save (the stored settings unreadable, config/storage.ts) rejects after the page has switched: the popup says why
      'axt:set-mode': message => session.setMode(message.mode).then(r => ({ mode: r.effective, preference: r.mode })),
      'axt:retry-failed': async () => ({ retried: session.retryFailed() }),
      'axt:helper-ready': async () => ({ resumed: session.resumeRaster() }),
      'axt:page-status': () => session.status(),
    })

    // The floating button: here its main button is the toggle the key and the menu are, decided in the background
    // on the saved settings (shared/page-action.ts), so the four doors cannot disagree. When nothing could be done —
    // no service can run — the control panel opens beside the button: it is where the reason is said, and a click is
    // never met with silence. After the extraction above, which therefore never sees the button
    void installFloatingButton(document, {
      main: {
        kind: 'toggle',
        run: () => void sendMessage({ type: 'axt:toggle' }).then(({ acted }) => { if (!acted) floating?.openPanel() }).catch(() => undefined),
      },
      label: (S, active) => (active ? S.primary.restore : S.primary.translate),
    }).then(async installed => {
      floating = installed
      installed.setActive((await session.status()).progress.state === 'on')
    })

    // The figure viewer (issue #276), a prototype: nothing of the paper is touched, so it is there whether or not the page is translated
    installFigureViewer(document, { figures: FIGURE_SELECTORS.viewable, overlay: `.${IMG_CLASS}`, around: FIGURE_SELECTORS.figure, ours: `.${T_CLASS}`, strings: { open: 'Open figure', zoomIn: 'Zoom in', zoomOut: 'Zoom out', close: 'Close' } })

    if (location.hash === '#axt-debug') enableDebug(blocks)
    if (startsTranslation(location.hash)) void session.start()
  },
})
