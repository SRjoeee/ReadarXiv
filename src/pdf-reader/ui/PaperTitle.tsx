// The lead of the toolbar (the reader's design, §6.1): the title, one line, truncating first, whole in its tooltip; the
// arXiv id in ink-2 tabular figures, a link to the abstract page in a new tab, an arrow sliding in on hover or focus.
// The title is the page's heading (`h1`) at every width: it leaves the eye when the lead is too narrow for it (reader.css,
// a container query) and stays in the page for assistive technology, which a hidden title did not (P3-M12, P6); until it
// is known the heading is the product's name, said and not drawn, as the tab says it. The title is the paper's own, in its
// language (`lang="en"`, as a contents heading not yet translated is, UI.md S-R-02a), so that a screen reader reads it in
// that voice and not the interface's (WCAG 3.1.2; PDF-READER §6.1). The id's link is named by what is
// on it and what it does (WCAG 2.5.3), the tooltip being hidden from assistive technology. The id leaves when the lead cannot
// hold it beside the contents' button: its own width, measured as it is drawn, against the lead's, which the grid gives
// and a long language's menus or a long service name narrow (the interface review: the id was drawn under the switch).
// The first answer is given before the first paint, in the lead's observer's first callback, which the browser calls once the
// page is laid out and before it paints, rendered there at once: measured in an effect, which runs after the paint, a lead too
// narrow for the id drew it for two frames before it went (the pin's wave-1 review); measured in a layout effect, inside React's
// commit, the reads laid the document out for them before the browser would (a new reader's first layout, 22 ms of the main
// thread at 1x, 93 ms at 4x: the rules audit of 2026-11-04)
import { ArrowUpRight } from 'lucide'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { R, S } from '@/ui/strings'
import { Icon } from '@/ui/controls/Icon'
import { useTip } from '@/ui/controls/tip'

export function PaperTitle({ id, title }: { id: string; title: string }) {
  const whole = useTip(title)
  const link = useTip(title || R.abstract, title ? R.abstract : undefined)
  const linkId = useId()
  const box = useRef<HTMLDivElement>(null)
  const [cramped, setCramped] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again for another id, whose text is its width (one paper a visit)
  useLayoutEffect(() => {
    const own = box.current, lead = own?.parentElement, arxiv = own?.querySelector('[data-arxiv]')
    if (!own || !lead || !arxiv) return
    // what the lead needs beside the paper: its contents' button and the gaps, all but this box; read in the observer's callback,
    // where the layout is the browser's own, made for the frame about to be painted, once the id is laid out (a host's sheet may
    // leave the whole title out at first, as the web's does where its own mark says the lead is short: the id has no width then,
    // and is read when it has)
    let need = -1
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      if (need < 0) {
        const id = arxiv.getBoundingClientRect().width
        if (!(id > 0)) return
        need = id + (own.getBoundingClientRect().left - lead.getBoundingClientRect().left) + Number.parseFloat(getComputedStyle(own).paddingInlineStart)
      }
      // (rendered at once, in the callback: the frame it runs in paints the answer; a state set here alone would be rendered in a
      // task after that paint. The lead has no padding, so its box is its content's)
      const next = entry.contentRect.width < need
      flushSync(() => setCramped(next))
    })
    observer.observe(lead)
    return () => observer.disconnect()
  }, [id])
  return (
    <div ref={box} className="paper-title flex min-w-0 items-baseline gap-2 ps-1.5" data-cramped={cramped || undefined}>
      {title ? (
        <>
          <h1 data-title lang="en" className="m-0 min-w-0 truncate text-[13px] font-semibold" {...whole.props}>
            {title}
          </h1>
          {whole.tip}
        </>
      ) : (
        <h1 className="sr-only">{S.brand}</h1>
      )}
      {id && (
        <>
          {/* labelled by itself, what is seen, and by what it does, which stands outside it so that the link's own text stays what is seen */}
          <a id={`${linkId}-id`} data-arxiv href={`https://arxiv.org/abs/${id}`} target="_blank" rel="noopener noreferrer" className="arxiv-id" aria-labelledby={`${linkId}-id ${linkId}-does`} {...link.props}>
            arXiv:{id}
            <Icon node={ArrowUpRight} size={12} />
          </a>
          <span id={`${linkId}-does`} hidden>{R.abstract}</span>
          {link.tip}
        </>
      )}
    </div>
  )
}
