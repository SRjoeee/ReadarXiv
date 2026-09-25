// Nothing translated (the reader's design, §6.6, §8): the capsule's anatomy as a card centred in the translation's pane,
// with a filled action — settings when a key is the reason (the settings page at its services), retry otherwise
import { CircleAlert } from 'lucide'
import { browser } from 'wxt/browser'
import { S } from '@/ui/strings'
import type { ReaderController } from '../controller'
import { Icon } from './icons'
import { cardOf } from './status'
import { useReader } from './use-reader'

export function FailureCard({ controller }: { controller: ReaderController }) {
  const card = useReader(controller, cardOf)
  if (!card) return null
  const act = card.action === 'settings'
    ? () => void browser.tabs.create({ url: (browser.runtime.getURL as (p: string) => string)('/options.html#services') })
    : controller.retry
  return (
    <div className="chrome card" data-card>
      <Icon node={CircleAlert} size={20} />
      <p>{card.reason}</p>
      <button type="button" onClick={act}>{card.action === 'settings' ? S.settings : S.failed.retry}</button>
    </div>
  )
}
