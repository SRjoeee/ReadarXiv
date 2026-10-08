// The lead of the toolbar (the reader's design, §6.1): the title, one line, truncating first, whole in its tooltip; the
// arXiv id in ink-2 tabular figures, a link to the abstract page in a new tab, an arrow sliding in on hover or focus.
// The title is the page's heading (`h1`) at every width: it leaves the eye when the lead is too narrow for it (reader.css,
// a container query) and stays in the page for assistive technology, which a hidden title did not (P3-M12, P6); until it
// is known the heading is the product's name, said and not drawn, as the tab says it. The id's link is named by what is
// on it and what it does (WCAG 2.5.3), the tooltip being hidden from assistive technology. The id leaves when the lead cannot
// hold it beside the contents' button: its own width, measured as it is drawn, against the lead's, which the grid gives
// and a long language's menus or a long service name narrow (the interface review: the id was drawn under the switch).
// The first answer is given before the first paint, in a layout effect: measured in an effect, which runs after the
// paint, a lead too narrow for the id drew it for two frames before it went (the pin's wave-1 review)
import { ArrowUpRight } from 'lucide'
import { useId, useLayoutEffect, useRef, useState } from 'react'
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
    // what the lead needs beside the paper: its contents' button and the gaps, all but this box
    const need = arxiv.getBoundingClientRect().width + (own.getBoundingClientRect().left - lead.getBoundingClientRect().left) + Number.parseFloat(getComputedStyle(own).paddingInlineStart)
    // the state for the frame about to be painted: a state set in a layout effect is rendered before the paint, where the
    // observer's first answer comes in a task after it (the lead has no padding, so its box is its content's)
    setCramped(lead.getBoundingClientRect().width < need)
    const observer = new ResizeObserver(([entry]) => { if (entry) setCramped(entry.contentRect.width < need) })
    observer.observe(lead)
    return () => observer.disconnect()
  }, [id])
  return (
    <div ref={box} className="paper-title flex min-w-0 items-baseline gap-2 ps-1.5" data-cramped={cramped || undefined}>
      {title ? (
        <>
          <h1 data-title className="m-0 min-w-0 truncate text-[13px] font-semibold" {...whole.props}>
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
