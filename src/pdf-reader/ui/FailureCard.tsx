// Nothing translated (the reader's design, §6.6, §8): the capsule's anatomy as a card centred in the translation's pane,
// with a filled action — settings when a key is the reason (the settings page at its services), retry otherwise. An
// address that names no paper has a card too (S-R-20), centred in the document area, since the display may hide the
// pane: its action is a link to arXiv, opened where the settings say (S-O-49b) as S-R-18's is
import { CircleAlert } from 'lucide'
import { browser } from 'wxt/browser'
import { R, S } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from '@/ui/controls/Icon'
import { cardOf } from './status'
import { useReader } from './use-reader'

/** `of`: where this one is drawn, the pane's or the page's; a card is drawn in one of them only */
export function FailureCard({ controller, of = 'pane' }: { controller: ReaderController; of?: 'pane' | 'page' }) {
  const card = useReader(controller, cardOf)
  const sameTab = useReader(controller, s => s.settings?.reading.openIn === 'same-tab')
  if (!card || (card.action === 'arxiv') !== (of === 'page')) return null
  if (card.action === 'arxiv') {
    return (
      <div className="chrome card" data-card>
        <Icon node={CircleAlert} size={20} />
        <p>{card.reason}</p>
        <a href="https://arxiv.org/" target={sameTab ? '_top' : '_blank'} rel="noopener">{R.status.goToArxiv}</a>
      </div>
    )
  }
  const act = card.action === 'settings'
    ? () => void browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)('/options.html#translate/services') })
    : controller.retry
  return (
    <div className="chrome card" data-card>
      <Icon node={CircleAlert} size={20} />
      <p>{card.reason}</p>
      <button type="button" onClick={act}>{card.action === 'settings' ? S.settings : S.failed.retry}</button>
    </div>
  )
}
