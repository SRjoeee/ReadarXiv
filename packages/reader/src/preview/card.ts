// A citation's card, phase 1 (link previews' §3.3-3.5; the approved prototype's compact card with no metadata): the reference's own
// text, in English, in a scroller of the abstract's type (12.5 px / 1.5, the reading ink, no hyphenation, straight quotes set
// curly), seven lines in view and the rest scrolling inside the card, each end fading by the scroll's position (one fade,
// --axt-fade: the head fades in as the first line slides under, the foot out as the end nears, neither pops), the keyboard's
// ring drawn by the frame round the scroller (the mask would cut it); a Tab stop only where it scrolls; giving way to the room
// down to three lines. Where SEARCH_URL is set (the owner's (b), held until its reach from mainland China is recorded: Q4), one
// quiet link at its foot, the search (UI.md S-R-31) and the card's ↗, opened by the reader's opener. No title, no quiet line, no abstract in phase 1:
// the card's column keeps a head slot (empty) for phase 2's title and quiet line, which slot in without a redesign.
import type { PreviewWords } from './previews.ts'

/** where the card's search goes, by the query: null until the reach of Semantic Scholar's search from mainland China is recorded
 *  (open item 4, the lead's ruling: behind this one constant) */
export const SEARCH_URL: ((query: string) => string) | null = null
/** the fade's height, px [approved, P5 style.css:56]: 1.6 of the card's lines */
export const FADE_PX = 20
/** the least the card's text gives way to, lines */
const MIN_LINES = 3

/** straight quotes set curly, as the card sets its text [approved, P5 app.js:345] */
export const curly = (t: string): string => t.replace(/(\w)'(\w)/g, '$1’$2').replace(/"([^"]*)"/g, '“$1”')

const SVG = 'http://www.w3.org/2000/svg'
/** the card's one glyph, "this opens": drawn to the x-height on the baseline [approved, P5 app.js:47] */
function northEast(): SVGSVGElement {
  const s = document.createElementNS(SVG, 'svg')
  s.setAttribute('viewBox', '0 0 10 10')
  s.setAttribute('aria-hidden', 'true')
  s.setAttribute('class', 'axt-pv-ne')
  const p = document.createElementNS(SVG, 'path')
  p.setAttribute('d', 'M1.6 8.4 8.4 1.6M2.9 1.6h5.5v5.5')
  s.append(p)
  return s
}

/** text that scrolls inside a surface, its ends fading by position, its frame drawing the keyboard's ring: `fit` sets its room,
 *  its Tab stop and its ends once laid out */
export function scrollerOf(p: HTMLElement): { frame: HTMLElement; scroller: HTMLElement; fit(room?: number): void } {
  const frame = document.createElement('div')
  frame.className = 'axt-pv-textf'
  const scroller = document.createElement('div')
  scroller.className = 'axt-pv-text'
  scroller.dataset.axtScrolls = ''
  scroller.append(p)
  frame.append(scroller)
  const r3 = (v: number) => String(Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000)
  const ends = () => {
    const rest = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
    scroller.style.setProperty('--axt-ft', r3(scroller.scrollTop / FADE_PX))
    scroller.style.setProperty('--axt-fb', r3(rest / FADE_PX))
  }
  scroller.addEventListener('scroll', ends, { passive: true })
  scroller.addEventListener('focus', () => {
    let ring = true
    try {
      ring = scroller.matches(':focus-visible')
    } catch {
      /* a browser that cannot tell */
    }
    frame.toggleAttribute('data-axt-ring', ring)
  })
  scroller.addEventListener('blur', () => frame.removeAttribute('data-axt-ring'))
  return {
    frame,
    scroller,
    fit(over = 0) {
      if (over > 0) {
        const lh = Number.parseFloat(getComputedStyle(p).lineHeight) || 18.75
        scroller.style.maxHeight = `${Math.max(MIN_LINES * lh, scroller.clientHeight - over)}px`
      }
      scroller.tabIndex = scroller.scrollHeight > scroller.clientHeight + 1 ? 0 : -1
      ends()
    },
  }
}

/** the card of a reference with no metadata: its text, and the search link where one is given */
export function cardOf(o: { text: string; search: string | null; words: PreviewWords; open?(url: string): void }): {
  el: HTMLElement
  described: HTMLElement
  fit(room: number): void
} {
  const el = document.createElement('div')
  el.className = 'axt-pv-card'
  // (phase 2's head: the title and the quiet line; empty in phase 1)
  const head = document.createElement('div')
  head.className = 'axt-pv-head'
  head.hidden = true
  const p = document.createElement('p')
  p.className = 'axt-pv-ref'
  p.lang = 'en'
  p.textContent = curly(o.text)
  const s = scrollerOf(p)
  el.append(head, s.frame)
  if (o.search) {
    const a = document.createElement('a')
    a.className = 'axt-pv-search'
    a.href = o.search
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.append(document.createTextNode(o.words.search), northEast())
    const go = (e: Event) => {
      e.preventDefault()
      o.open?.(o.search as string)
    }
    a.addEventListener('click', go)
    a.addEventListener('auxclick', (e) => {
      if ((e as MouseEvent).button === 1) go(e)
    })
    el.append(a)
  }
  return {
    el,
    described: p,
    fit(room: number) {
      s.scroller.style.maxHeight = ''
      const over = el.offsetHeight - room
      s.fit(over)
    },
  }
}
