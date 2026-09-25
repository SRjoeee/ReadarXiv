// The lead of the toolbar (the reader's design, §6.1): the title, one line, truncating first, whole in its tooltip; the
// arXiv id in ink-2 tabular figures, a link to the abstract page in a new tab, an arrow sliding in on hover or focus.
// The title leaves when the lead is too narrow for it (reader.css, a container query), and the id when the lead cannot
// hold it beside the contents' button: its own width, measured as it is drawn, against the lead's, which the grid gives
// and a long language's menus or a long service name narrow (the interface review: the id was drawn under the switch)
import { ArrowUpRight } from 'lucide'
import { useEffect, useRef, useState } from 'react'
import { R } from '@/ui/strings'
import { Icon } from './icons'
import { useTip } from './tip'

export function PaperTitle({ id, title }: { id: string; title: string }) {
  const whole = useTip(title)
  const link = useTip(title || R.abstract, title ? R.abstract : undefined)
  const box = useRef<HTMLDivElement>(null)
  const [cramped, setCramped] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again for another id, whose text is its width (one paper a visit)
  useEffect(() => {
    const own = box.current, lead = own?.parentElement, arxiv = own?.querySelector('[data-arxiv]')
    if (!own || !lead || !arxiv) return
    // what the lead needs beside the paper: its contents' button and the gaps, all but this box
    const need = arxiv.getBoundingClientRect().width + (own.getBoundingClientRect().left - lead.getBoundingClientRect().left) + Number.parseFloat(getComputedStyle(own).paddingInlineStart)
    const observer = new ResizeObserver(([entry]) => { if (entry) setCramped(entry.contentRect.width < need) })
    observer.observe(lead)
    return () => observer.disconnect()
  }, [id])
  return (
    <div ref={box} className="paper-title flex min-w-0 items-baseline gap-2 ps-1.5" data-cramped={cramped || undefined}>
      {title && (
        <>
          <b data-title className="min-w-0 truncate text-[13px] font-semibold" {...whole.props}>
            {title}
          </b>
          {whole.tip}
        </>
      )}
      {id && (
        <>
          <a data-arxiv href={`https://arxiv.org/abs/${id}`} target="_blank" rel="noopener noreferrer" className="arxiv-id" {...link.props}>
            arXiv:{id}
            <Icon node={ArrowUpRight} size={12} />
          </a>
          {link.tip}
        </>
      )}
    </div>
  )
}
