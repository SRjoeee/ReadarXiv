// A preview as a sheet (link previews' §3.9; the Modern Web Guidance audit's ruling, its guides `light-dismiss-a-dialog` and
// `dialog`): where the device has no hover, or the pane is narrower than the card with its margins (open item 8), a tap on a link
// with a target opens its preview from the bottom as a native modal dialog (showModal: the focus held in it, the page inert, the
// system's back gesture and Esc close it; closedby="any" for a tap outside where the browser has it, the guide's pointer-position
// fallback elsewhere), over an 8 % dim (30 % in the dark), at most 80 % of the window. The same content and type, selectable;
// the head never giving way to the scroller. Here, and only here, actions stand as buttons, one row, 46 px: the search (UI.md
// S-R-31: filled, only where the card's search is set) then the go-to button (S-R-30: quiet, always last) for a citation; the
// go-to button alone for a float, a display, a section or a note. Named by its target's label (never by the bibliography's word
// for a citation's: the design's §3.13).
import type { Target } from '@readarxiv/format'
import type { Side } from '../panes/panes.ts'
import type { PreviewContent, PreviewLink, PreviewWords, SheetHost } from './previews.ts'

/** the sheet's going out, ms (the capsules' tempo, 160, and the element let go just after) */
const OUT_MS = 170

export function createSheet(o: {
  root: HTMLElement
  words(): PreviewWords
  content(x: {
    link: PreviewLink
    target: Target
    sheet: boolean
    max: { width: number; height: number }
    signal: AbortSignal
  }): Promise<PreviewContent | null>
  jump(j: {
    side: Side
    dest: string
    keyboard: boolean
    origin: { side: Side; page: number; box: [number, number, number, number] } | null
  }): void
  open(url: string): void
  /** a citation's search address where SEARCH_URL is set, else null */
  search(target: Target, link: PreviewLink): string | null
}): SheetHost {
  let current: { dialog: HTMLDialogElement; ac: AbortController } | null = null
  function close() {
    const c = current
    if (!c) return
    current = null
    c.ac.abort()
    if (c.dialog.open) c.dialog.close()
    c.dialog.setAttribute('data-axt-out', '')
    setTimeout(() => c.dialog.remove(), OUT_MS)
  }
  return {
    open(link, target) {
      close()
      const ac = new AbortController()
      const dialog = document.createElement('dialog')
      dialog.className = 'axt-sheet'
      dialog.setAttribute('closedby', 'any')
      current = { dialog, ac }
      const mine = current
      const w = window.innerWidth || 390,
        h = window.innerHeight || 844
      void o
        .content({ link, target, sheet: true, max: { width: w - 32 - 24, height: h * 0.52 }, signal: ac.signal })
        .then((c) => {
          if (current !== mine || !c) {
            if (current === mine) current = null
            return
          }
          dialog.setAttribute('aria-label', c.label)
          const body = document.createElement('div')
          body.className = 'axt-sheet-body'
          body.append(c.el)
          const acts = document.createElement('div')
          acts.className = 'axt-sheet-acts'
          const button = (text: string, primary: boolean, f: () => void) => {
            const b = document.createElement('button')
            b.type = 'button'
            b.className = 'axt-sheet-go'
            if (primary) b.dataset.axtPrimary = ''
            b.textContent = text
            b.addEventListener('click', f, { signal: ac.signal })
            acts.append(b)
          }
          const words = o.words()
          const url = target[1] === 'reference' ? o.search(target, link) : null
          if (url)
            button(words.search, true, () => {
              close()
              o.open(url)
            })
          button(words.go, false, () => {
            close()
            o.jump({ side: link.side, dest: link.dest, keyboard: false, origin: null })
          })
          dialog.append(body, acts)
          o.root.append(dialog)
          dialog.addEventListener('close', () => {
            if (current === mine) close()
          })
          // (a tap outside where the browser has no closedby: the guide's fallback, by the pointer's place)
          if (!('closedBy' in HTMLDialogElement.prototype))
            dialog.addEventListener(
              'click',
              (e) => {
                if (e.target !== dialog) return
                const r = dialog.getBoundingClientRect()
                const inside =
                  r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right
                if (!inside) close()
              },
              { signal: ac.signal },
            )
          dialog.showModal()
          c.fit?.(Math.max(0, h * 0.8 - 16 - 16 - 46 - 16))
        })
    },
    dispose() {
      close()
    },
  }
}
