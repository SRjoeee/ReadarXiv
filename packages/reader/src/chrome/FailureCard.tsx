// Nothing translated (the reader's design, §6.6, §8): the capsule's anatomy as a card centred in the translation's pane,
// with a filled action — settings when a key is the reason (the settings page at its services), retry otherwise. An
// address that names no paper has a card too (S-R-20), centred in the document area, since the display may hide the
// pane: its action is a link to arXiv, opened where the settings say (S-O-49b) as S-R-18's is. Its sign is the host's rule
// (parts.tsx `signs`): the alert, or by state (a clock in quiet ink for a wait, `data-tone`)
import { CircleAlert, Clock, FileText, type IconNode } from 'lucide'
import { R, S, Icon } from '@readarxiv/ui'
import type { ReaderController } from './model.ts'
import { useParts } from './parts.tsx'
import { cardLook, cardOf, type Sign } from './status.ts'
import { useReader } from './use-reader.ts'

const SIGNS: Readonly<Partial<Record<Sign, IconNode>>> = { alert: CircleAlert, clock: Clock, file: FileText }

/** `of`: where this one is drawn, the pane's or the page's; a card is drawn in one of them only */
export function FailureCard({ controller, of = 'pane' }: { controller: ReaderController; of?: 'pane' | 'page' }) {
  const parts = useParts()
  const card = useReader(controller, (s) => cardOf(s, parts.reason, parts.words))
  const look = useReader(controller, (s) => (card ? cardLook(card, s, parts.signs) : null))
  const sameTab = useReader(controller, (s) => s.prefs?.links === 'same-tab')
  if (!card || !look || (card.action === 'arxiv') !== (of === 'page')) return null
  const sign = <Icon node={SIGNS[look.sign] ?? CircleAlert} size={20} />
  if (card.action === 'arxiv') {
    return (
      <div className="chrome card" data-card>
        {sign}
        <p>{card.reason}</p>
        <a href="https://arxiv.org/" target={sameTab ? '_top' : '_blank'} rel="noopener">
          {R.status.goToArxiv}
        </a>
      </div>
    )
  }
  // a remedy in the host's settings is the host's control (its slot); a retry is the reader's
  return (
    <div className="chrome card" data-card data-tone={look.tone}>
      {sign}
      <p>{card.reason}</p>
      {card.action === 'settings' ? (
        parts.slots.card?.('settings')
      ) : (
        <button type="button" onClick={controller.retry}>
          {S.failed.retry}
        </button>
      )}
    </div>
  )
}
