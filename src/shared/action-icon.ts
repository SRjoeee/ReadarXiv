// The toolbar button's two states (UI.md §5.1): grey by default, lit on a page the extension works on. The pages say
// so themselves — each content script runs only where there is something to do — and the background lights the
// button for their tab alone. Nothing has to turn it off: Chrome drops a value set for one tab when the tab goes to
// another document. That covers a page brought back from the back/forward cache as well, whose script does not run
// again: it says so once more on `pageshow`.
import { sendMessage } from '@/shared/messages'

export function announceUsablePage(win: Window = window): void {
  const say = () => {
    // After an update or a reload of the extension, the old page's script has no extension to talk to; it throws at
    // once rather than rejecting. That page cannot be used either until it is reloaded, and grey is the truth
    try {
      void sendMessage({ type: 'axt:page-usable' }).catch(() => undefined)
    } catch {}
  }
  say()
  win.addEventListener('pageshow', event => { if (event.persisted) say() })
}
