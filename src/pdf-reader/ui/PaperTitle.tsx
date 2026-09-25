// The lead of the toolbar (the reader's design, §6.1): the title, one line, truncating first, whole in its tooltip; the
// arXiv id in ink-2 tabular figures, a link to the abstract page in a new tab, an arrow sliding in on hover or focus.
// Below 1100 px only the id is left, and its tooltip carries the title
import { ArrowUpRight } from 'lucide'
import { R } from '@/ui/strings'
import { Icon } from './icons'
import { useTip } from './tip'

export function PaperTitle({ id, title }: { id: string; title: string }) {
  const whole = useTip(title)
  const link = useTip(title || R.abstract, title ? R.abstract : undefined)
  return (
    <div className="paper-title flex min-w-0 items-baseline gap-2 ps-1.5">
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
