// A crop kept on screen (link previews' §3.6; the approved prototype's `keep`): a click or Enter on a figure's, a table's, a
// display's, a section's or a note's preview keeps it where it stands, the same cut at the same size (the owner's (e), judged on
// staging). Keeping is felt, not explained: it starts lifted and settles in the capsules' tempo, then looks like any preview. It
// moves by a drag anywhere on it (grabbed, lifted in the hand) and by the arrows while it has the focus (KEEP_STEP), kept below
// the toolbar (KEEP_TOP) and KEEP_EDGE inside the window. Its one control is a round ×, shown on hover and on the keyboard's
// focus, never on the focus a drag leaves (the sheet's rule). Esc closes the topmost thing (the preview first: previews.ts),
// the focus back to the link it came from. One at a time: keeping another replaces it. To assistive technology a dialog named
// by its label, its × "关闭{label}" (S-R-32).
import type { Clock } from '../stack/clock.ts'
import type { KeepHost, PreviewContent, PreviewWords } from './previews.ts'

/** the arrows' step, the toolbar's floor (its 44 px and 8), the window's margin, px [approved, P5 app.js:803-814] */
export const KEEP_STEP = 16
export const KEEP_TOP = 52
export const KEEP_EDGE = 8
/** the capsules' tempo out, ms (the reader's §6.6: 160 ms; the element let go just after) */
const OUT_MS = 170

const SVG = 'http://www.w3.org/2000/svg'
/** lucide's X, 13 px in the ×'s 24 */
function xIcon(): SVGSVGElement {
  const s = document.createElementNS(SVG, 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('aria-hidden', 'true')
  for (const d of ['M18 6 6 18', 'm6 6 12 12']) {
    const p = document.createElementNS(SVG, 'path')
    p.setAttribute('d', d)
    s.append(p)
  }
  return s
}

export function createKeep(o: { clock: Clock; words(): PreviewWords }): KeepHost {
  let kept: { el: HTMLElement; link: HTMLElement; off: AbortController } | null = null
  const clamp = (el: HTMLElement, left: number, top: number) => {
    const W = window.innerWidth,
      H = window.innerHeight
    el.style.left = `${Math.round(Math.max(KEEP_EDGE, Math.min(W - el.offsetWidth - KEEP_EDGE, left)))}px`
    el.style.top = `${Math.round(Math.max(KEEP_TOP, Math.min(H - el.offsetHeight - KEEP_EDGE, top)))}px`
  }
  function drop(back: boolean) {
    if (!kept) return
    const { el, link, off } = kept
    kept = null
    off.abort()
    const hadFocus = el.contains(document.activeElement)
    el.setAttribute('data-axt-out', '')
    o.clock.later(() => el.remove(), OUT_MS)
    if (back && hadFocus && link.isConnected) link.focus({ preventScroll: true })
  }
  return {
    keep(pv, content: PreviewContent, link, byKey) {
      drop(false)
      const off = new AbortController()
      const signal = off.signal
      // (the crop out of its keep button: kept, it is the panel's own content)
      const button = pv.querySelector('.axt-pv-keep')
      if (button) button.replaceWith(...button.childNodes)
      pv.classList.add('axt-pv-kept')
      pv.removeAttribute('data-axt-quiet')
      pv.removeAttribute('data-axt-at')
      pv.setAttribute('role', 'dialog')
      pv.setAttribute('aria-label', content.label)
      pv.tabIndex = 0
      const x = document.createElement('button')
      x.type = 'button'
      x.className = 'axt-pv-x'
      x.setAttribute('aria-label', o.words().close(content.label))
      x.append(xIcon())
      x.addEventListener('click', () => drop(true), { signal })
      pv.append(x)
      kept = { el: pv, link, off }
      // (a drag anywhere on it but its ×: grabbed, lifted in the hand, kept inside the window)
      let from: { x: number; y: number; left: number; top: number; id: number } | null = null
      pv.addEventListener(
        'pointerdown',
        (e) => {
          if (e.button !== 0 || (e.target as Element).closest?.('.axt-pv-x')) return
          from = { x: e.clientX, y: e.clientY, left: pv.offsetLeft, top: pv.offsetTop, id: e.pointerId }
          try {
            pv.setPointerCapture(e.pointerId)
          } catch {
            /* a pointer the browser no longer tracks */
          }
          pv.setAttribute('data-axt-drag', '')
        },
        { signal },
      )
      pv.addEventListener(
        'pointermove',
        (e) => {
          if (from && e.pointerId === from.id) clamp(pv, from.left + e.clientX - from.x, from.top + e.clientY - from.y)
        },
        { signal },
      )
      const end = () => {
        from = null
        pv.removeAttribute('data-axt-drag')
      }
      pv.addEventListener('pointerup', end, { signal })
      pv.addEventListener('pointercancel', end, { signal })
      pv.addEventListener('lostpointercapture', end, { signal })
      pv.addEventListener(
        'keydown',
        (e) => {
          const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
          if (!d || e.target !== pv) return
          e.preventDefault()
          clamp(
            pv,
            (Number.parseFloat(pv.style.left) || pv.offsetLeft) + d[0]! * KEEP_STEP,
            (Number.parseFloat(pv.style.top) || pv.offsetTop) + d[1]! * KEEP_STEP,
          )
        },
        { signal },
      )
      if (byKey) pv.focus({ preventScroll: true })
    },
    esc() {
      if (!kept) return false
      drop(true)
      return true
    },
    dispose() {
      if (!kept) return
      kept.off.abort()
      kept.el.remove()
      kept = null
    },
  }
}
