// The names of the layer's links that have no text under them (an image, a symbol: the engine's '' name), by where they go
// (UI.md S-R-25, the owner's words of 2026-10-17): elsewhere in the paper, a web page by its site, an email by its address,
// else a link. Read from the interface's pack at each call, so that a language switched meanwhile names the next drawing;
// the view sets the name as text, never markup (engine/view/links.mjs)
import { R } from '@/ui/strings'

/** a link's name, for the view's ViewWords.linkName */
export function linkNameOf(to: { url: string } | { internal: true }): string {
  const words = R.linkName
  if ('internal' in to) return words.internal
  let u: URL
  try { u = new URL(to.url) } catch { return words.fallback }
  if (u.protocol === 'mailto:') {
    let address = u.pathname
    try { address = decodeURIComponent(address) } catch { /* the address as written */ }
    return address ? words.email(address) : words.fallback
  }
  return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname ? words.site(u.hostname) : words.fallback
}
