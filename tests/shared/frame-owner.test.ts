// Who a framed page of the extension acts for (shared/frame-owner.ts, DESIGN §4.0c): the content script that made its
// frame vouches for it with a ticket posted to that frame alone, which the page claims from its tab's top frame. The two
// windows are event targets here, the content script's listener is the one it registers, and `tabs.sendMessage` hands
// a claim to it as Chrome does; the real frames are tests/e2e/framing.mjs's
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

type Listener = (message: unknown, sender: object, sendResponse: (reply: unknown) => void) => true | undefined
const TAB = 7

/** a window: an event target with `postMessage` recorded, delivering to `deliver` when given one */
function windowOf(extra: Record<string, unknown> = {}) {
  const posted: { data: unknown; targetOrigin: string }[] = []
  const w = Object.assign(new EventTarget(), extra, {
    posted,
    deliver: null as ((data: unknown) => void) | null,
    postMessage(data: unknown, targetOrigin: string) {
      posted.push({ data, targetOrigin })
      w.deliver?.(data)
    },
  })
  return w
}
const messageEvent = (data: unknown, origin: string, source: unknown) => Object.assign(new Event('message'), { data, origin, source })

let claims: Listener[] = []
async function load() {
  vi.resetModules()
  claims = []
  vi.spyOn(fakeBrowser.runtime.onMessage, 'addListener').mockImplementation(listener => { claims.push(listener as unknown as Listener) })
  vi.spyOn(fakeBrowser.tabs, 'getCurrent').mockResolvedValue({ id: TAB } as never)
  // a claim reaches the content scripts of the tab's top frame; one that no listener answers is a rejection, as in Chrome
  ;(fakeBrowser.tabs as unknown as { sendMessage: unknown }).sendMessage = vi.fn((tab: number, message: unknown, options?: { frameId?: number }) => new Promise((resolve, reject) => {
    if (tab !== TAB || options?.frameId !== 0) { reject(new Error('Could not establish connection. Receiving end does not exist.')); return }
    const answered = claims.some(listener => listener(message, {}, resolve) === true)
    if (!answered) reject(new Error('The message port closed before a response was received.'))
  }))
  return import('@/shared/frame-owner')
}

/** our content script's page with its frame, and the extension's page in that frame, wired as a browser wires them */
async function framed(o: { frameUrl?: string; pageAddress?: { pathname: string; search: string } } = {}) {
  const m = await load()
  const origin = m.extensionOrigin()
  const parent = windowOf()
  const page = windowOf({ parent, location: o.pageAddress ?? { pathname: '/pdf-reader.html', search: '?live=1&paper=2600.00001' } })
  const frame = { contentWindow: page } as unknown as HTMLIFrameElement
  // what the page posts reaches the parent's listeners from the page, at the extension's origin; what is posted to the
  // frame reaches the page from the parent
  parent.deliver = data => parent.dispatchEvent(messageEvent(data, origin, page))
  page.deliver = data => page.dispatchEvent(messageEvent(data, 'https://arxiv.org', parent))
  const stop = m.vouchFor(frame, o.frameUrl ?? 'chrome-extension://d04aca1c-69fc-4855-bd82-8307ca6e11d8/pdf-reader.html?live=1&paper=2600.00001', parent as unknown as Window)
  return { m, origin, parent, page, frame, stop }
}

beforeEach(() => { fakeBrowser.reset() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('a framed page acts only for the content script that made its frame (DESIGN §4.0c)', () => {
  it('a page that is no frame acts for itself, and asks nobody', async () => {
    const m = await load()
    const top = windowOf()
    Object.assign(top, { parent: top })
    expect(await m.frameOwner(top as unknown as Window)).toEqual({ framed: false })
    expect(top.posted).toEqual([])
  })

  it('framed by our content script: it asks, is posted a ticket to its frame alone at the extension\'s origin, claims it from its tab\'s top frame, and acts for that tab', async () => {
    const { m, origin, page, parent } = await framed()
    const owner = await m.frameOwner(page as unknown as Window)
    expect(owner).toEqual({ framed: true, tab: TAB })
    // (`posted`: what was posted to that window) the ask went to the parent, the ticket to the frame
    expect(parent.posted).toEqual([{ data: { type: 'axt:frame-ask' }, targetOrigin: '*' }])
    const [ticket] = page.posted
    expect(ticket).toMatchObject({ data: { type: 'axt:frame-ticket', ticket: expect.stringMatching(/^[0-9a-f-]{36}$/) }, targetOrigin: origin })
    // the claim named the page's own address, and the ticket is spent: claimed again, nobody answers
    const send = (fakeBrowser.tabs as unknown as { sendMessage: (tab: number, message: unknown, options: { frameId: number }) => Promise<unknown> }).sendMessage
    expect(send).toHaveBeenCalledWith(TAB, { type: 'axt:frame-claim', ticket: (ticket!.data as { ticket: string }).ticket, address: '/pdf-reader.html?live=1&paper=2600.00001' }, { frameId: 0 })
    await expect(send(TAB, { type: 'axt:frame-claim', ticket: (ticket!.data as { ticket: string }).ticket, address: '/pdf-reader.html?live=1&paper=2600.00001' }, { frameId: 0 })).rejects.toThrow()
  })

  it('framed by a page that is not ours, in a tab where our content script runs: the ticket that page makes up is answered by nobody, and after OWNER_MS the page acts for no one', async () => {
    vi.useFakeTimers()
    const { m, origin, parent, page } = await framed()
    // the framing page's own frame of the reader; its ask reaches our content script too, from a window it did not make
    const theirs = windowOf({ parent, location: { pathname: '/pdf-reader.html', search: '?paper=2600.00001&ask=translate' } })
    const ask = () => parent.dispatchEvent(messageEvent({ type: 'axt:frame-ask' }, origin, theirs))
    const owner = m.frameOwner(Object.assign(theirs, { parent: { postMessage: () => {
      ask()
      // and the framing page answers it itself, with a ticket of its own making
      theirs.dispatchEvent(messageEvent({ type: 'axt:frame-ticket', ticket: '00000000-0000-4000-8000-000000000000' }, 'https://arxiv.org', theirs.parent))
    } } }) as unknown as Window)
    await vi.advanceTimersByTimeAsync(m.OWNER_MS + 1)
    expect(await owner).toBeNull()
    // our content script posted no ticket, to that frame or its own
    expect([theirs.posted, page.posted]).toEqual([[], []])
  })

  it('our content script answers its own frame alone, and only one of the extension\'s pages in it: an ask from another window, or from a page a script sent the frame to, gets no ticket', async () => {
    const { origin, parent, page } = await framed()
    const elsewhere = windowOf()
    parent.dispatchEvent(messageEvent({ type: 'axt:frame-ask' }, origin, elsewhere))
    parent.dispatchEvent(messageEvent({ type: 'axt:frame-ask' }, 'https://arxiv.org', page))
    parent.dispatchEvent(messageEvent({ type: 'something-else' }, origin, page))
    expect([elsewhere.posted, page.posted]).toEqual([[], []])
    // the control: its own frame's page asking is answered
    parent.dispatchEvent(messageEvent({ type: 'axt:frame-ask' }, origin, page))
    expect(page.posted).toHaveLength(1)
  })

  it('a ticket claimed for another address than the one the content script gave its frame is not vouched for: the frame was sent elsewhere', async () => {
    vi.useFakeTimers()
    const { m, page } = await framed({ pageAddress: { pathname: '/pdf-reader.html', search: '?live=1&paper=2401.00001&ask=translate' } })
    const owner = m.frameOwner(page as unknown as Window)
    await vi.advanceTimersByTimeAsync(m.OWNER_MS + 1)
    expect(await owner).toBeNull()
  })

  it('once its frame is gone, our content script answers no more asks', async () => {
    const { origin, parent, page, stop } = await framed()
    stop()
    parent.dispatchEvent(messageEvent({ type: 'axt:frame-ask' }, origin, page))
    expect(page.posted).toEqual([])
  })

  it('every load asks again and is vouched for again: a reload of the page needs nothing kept from before', async () => {
    const { m, page } = await framed()
    expect(await m.frameOwner(page as unknown as Window)).toEqual({ framed: true, tab: TAB })
    expect(await m.frameOwner(page as unknown as Window)).toEqual({ framed: true, tab: TAB })
  })
})
