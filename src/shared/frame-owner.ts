// Who a page of the extension framed in arXiv's pages acts for (DESIGN §4.0c, PDF-READER §11.1). The popup (the floating
// button's control panel) and the PDF reader are web-accessible to arXiv, so a page there may frame them. Their address
// is the browser session's dynamic one (`use_dynamic_url`, wxt.config.ts), which only the extension knows; beside it,
// a framed page acts only once the content script that made its frame vouches for it:
//
//   the page           → its parent window    `axt:frame-ask` by postMessage; nothing in it is secret
//   the content script → that frame alone     a ticket minted for that ask, posted to the extension's origin only
//   the page           → its tab's top frame  `axt:frame-claim`, the ticket and its own address (tabs.sendMessage)
//   the content script → the page             `owned`: a ticket it posted to that frame, at that address; spent once
//
// A page that frames ours cannot take part: the ticket is posted to our own frame and to the extension's origin, and a
// claim is answered by the content script, never by a page. The address binds the ticket to what the content script
// asked the frame to show, so a frame a page script navigated elsewhere is not vouched for either. Every load asks
// again, so the page's own reload and the tab's back and forward keep working, and nothing of it is in an address or
// a history entry. Chrome-only, as the extension is: the pages' origin is `chrome-extension://<id>`.
import { browser } from 'wxt/browser'
import { type AxtMessage, type AxtResponse, onMessages, sendToTab } from './messages'
import { getRandomUUID } from './uuid'

const ASK = 'axt:frame-ask'
const TICKET = 'axt:frame-ticket'
/** How long a framed page waits for its owner before it does nothing: the answer takes milliseconds */
export const OWNER_MS = 5_000
/** How long a ticket waits for its claim */
const TICKET_MS = 30_000

/** The origin the extension's pages run at, whatever dynamic address loaded them: the static id's (measured 2026-10-24) */
export const extensionOrigin = (): string => `chrome-extension://${browser.runtime.id}`
const addressOf = (url: string): string => {
  const u = new URL(url)
  return u.pathname + u.search
}

// ---------------------------------------------------------------------------------------------- the content script's side

/** The tickets this script posted and not yet seen claimed: ticket → the address of the frame it went to */
const tickets = new Map<string, string>()
let answering = false

/**
 * Vouch for a frame this content script made, at the address it gave it: its page's asks are answered for as long as
 * the frame stands. Returns the stop
 */
export function vouchFor(frame: HTMLIFrameElement, url: string, view: Window = window): () => void {
  if (!answering) {
    answering = true
    onMessages({
      'axt:frame-claim': ({ ticket, address }) => {
        const own = tickets.get(ticket)
        // a ticket this script never posted is not answered at all: another script of ours in this frame may hold it
        if (own === undefined) return undefined
        tickets.delete(ticket)
        return Promise.resolve({ owned: own === address })
      },
    })
  }
  const origin = extensionOrigin()
  const address = addressOf(url)
  const onMessage = (e: MessageEvent) => {
    // the frame we made, with one of the extension's pages in it, asking
    if (e.source !== frame.contentWindow || e.origin !== origin || (e.data as { type?: unknown } | null)?.type !== ASK) return
    const ticket = getRandomUUID()
    tickets.set(ticket, address)
    setTimeout(() => tickets.delete(ticket), TICKET_MS)
    frame.contentWindow?.postMessage({ type: TICKET, ticket }, origin)
  }
  view.addEventListener('message', onMessage)
  return () => view.removeEventListener('message', onMessage)
}

// ---------------------------------------------------------------------------------------------------- the framed page's side

/** Whom a page acts for: itself, a page of its own; or the tab whose content script framed it */
export type FrameOwner = { framed: false } | { framed: true; tab: number }

/**
 * Whom this page acts for: `{ framed: false }` when it is no frame (the toolbar's popup, a reader tab of its own); framed,
 * the tab whose content script made its frame and vouched for it; `null` when none of ours vouches within OWNER_MS — a
 * page framed by one that is not ours, which must then do nothing
 */
export function frameOwner(view: Window = window): Promise<FrameOwner | null> {
  if (view.parent === view) return Promise.resolve({ framed: false })
  const address = view.location.pathname + view.location.search
  return new Promise(resolve => {
    let settled = false
    const end = (owner: FrameOwner | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      view.removeEventListener('message', onMessage)
      resolve(owner)
    }
    const timer = setTimeout(() => end(null), OWNER_MS)
    const claim = async (ticket: string) => {
      const tab = (await browser.tabs.getCurrent())?.id
      if (tab === undefined) return
      const message: AxtMessage<'axt:frame-claim'> = { type: 'axt:frame-claim', ticket, address }
      const { owned } = await sendToTab<AxtResponse<'axt:frame-claim'>>(tab, message, 0)
      if (owned) end({ framed: true, tab })
    }
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown; ticket?: unknown } | null
      if (e.source !== view.parent || data?.type !== TICKET || typeof data.ticket !== 'string') return
      // a claim nobody answers (a ticket our content script never posted) leaves the wait as it was: the real one may
      // still come, or the time runs out
      void claim(data.ticket).catch(() => undefined)
    }
    view.addEventListener('message', onMessage)
    view.parent.postMessage({ type: ASK }, '*')
  })
}
