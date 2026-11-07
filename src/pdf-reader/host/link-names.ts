// The names of the layer's links that have no text under them (an image, a symbol: the engine's '' name), by where they go
// (UI.md S-R-25, the owner's words of 2026-10-17): elsewhere in the paper, a web page by its site, an email by its address,
// else a link. Read from the interface's pack at each call, so that a language switched meanwhile names the next drawing;
// the view sets the name as text, never markup (engine/view/links.mjs)
import { linkNameOf as nameOf } from '@readarxiv/reader'
import { R } from '@readarxiv/ui'

/** a link's name, for the view's ViewWords.linkName: the reader package's rule over the pack's words */
export function linkNameOf(to: { url: string } | { internal: true }): string {
  return nameOf(to, R.linkName)
}
