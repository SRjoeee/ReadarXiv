// Host permissions for a reader's own endpoint. A custom origin is not in the manifest, so it is requested from the
// click that needs it (a user gesture). This page never gives one back itself: it holds every origin it uses — a form
// asking or connecting, a deletion whose undo is open — and, once it lets one go, asks the background, which gives
// back what nothing needs (background/origin-keeper.ts, config/origins.ts; DESIGN §9). A hold is a Web Lock: every
// context of the extension shares one lock manager, so the background sees the holds of every open page, and a page
// that closes lets its holds go with it — nothing it held is kept for good
import { browser } from 'wxt/browser'
import { originHold, originOf } from '@/config/origins'
import { sendMessage } from '@/shared/messages'

/**
 * The two ways a host permission request fails: the address itself is invalid, or the reader declined in Chrome's prompt.
 * Reports **which one**; the sentence is in the locale pack — this layer knows no interface language (Codex on #161)
 */
export class PermissionError extends Error {
  constructor(readonly kind: 'badURL' | 'denied', readonly origin?: string) {
    super(kind)
    this.name = 'PermissionError'
  }
}

/** Resolves once the origin is granted — at once when it was already; rejects with which way it failed */
export async function ensureHostPermission(baseURL: string): Promise<void> {
  const origin = originOf(baseURL)
  if (!origin) throw new PermissionError('badURL')
  if (await browser.permissions.contains({ origins: [origin] })) return
  if (!(await browser.permissions.request({ origins: [origin] }))) throw new PermissionError('denied', origin)
}

/** Whether the origin is granted already: the model list loads by itself only then (the redesign's design, §6.3) */
export async function hasHostPermission(baseURL: string): Promise<boolean> {
  const origin = originOf(baseURL)
  return origin ? browser.permissions.contains({ origins: [origin] }) : false
}

/** One origin held by this page; `release` resolves once the lock is let go, so the ask that follows finds it gone */
export interface Hold {
  release(): Promise<void>
}

/**
 * Hold the origin of `url` for as long as this page uses it: no give-back anywhere takes it while it is held. Taken
 * **before** the browser is asked, or the write that makes a service leave, so that a give-back started meanwhile
 * already sees it. `service` names a deleted service whose undo is open: the background leaves its sessions where they
 * are until the hold goes (origin-keeper.ts). An address with no origin holds nothing
 */
export function holdOrigin(url: string, service?: string): Hold {
  const name = originHold(url, service)
  const locks = globalThis.navigator?.locks
  if (!name || !locks) return { release: async () => {} }
  let letGo = () => {}
  const held = new Promise<void>(resolve => { letGo = resolve })
  const done = locks.request(name, { mode: 'shared' }, () => held).then(() => undefined, () => undefined)
  return { release: () => { letGo(); return done } }
}

/**
 * Ask the background to give back every origin nothing needs — after this page let one go. Best effort: an ask that
 * does not arrive leaves an origin granted a while, never takes one a service needs, and the next one gives it back
 */
export async function giveBackUnneeded(): Promise<void> {
  await sendMessage({ type: 'axt:origins-reconcile' }).catch(() => undefined)
}
