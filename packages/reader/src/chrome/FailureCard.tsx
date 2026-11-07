// Nothing translated (the reader's design, §6.6, §8): the capsule's anatomy as a card centred in the translation's pane,
// with a filled action — settings when a key is the reason (the settings page at its services), retry otherwise. An
// address that names no paper has a card too (S-R-20), centred in the document area, since the display may hide the
// pane: its action is a link to arXiv, opened where the settings say (S-O-49b) as S-R-18's is. Its sign is the host's rule
// (parts.tsx `signs`): the alert, or by state (a clock in quiet ink for a wait, `data-tone`). Where the host's rule offers a
// retry at its time (`retry`: the website's), the retry is greyed until then and still a stop of the keyboard's, pressing it
// doing nothing, and the card drawn again at the time; the host's lines under the reason (its time, a limit's note)
import { ArrowUpRight, CircleAlert, Clock, FileText, type IconNode } from 'lucide'
import { R, S, Icon } from '@readarxiv/ui'
import { useClock } from './clock.ts'
import type { ReaderController } from './model.ts'
import { useParts } from './parts.tsx'
import { cardDueAt, cardLook, cardOf, originalCardOf, originalCardSide, type Sign } from './status.ts'
import { useReader } from './use-reader.ts'

const SIGNS: Readonly<Partial<Record<Sign, IconNode>>> = { alert: CircleAlert, clock: Clock, file: FileText }

/** the original's pane's card, where the original could not be read and the host draws its loss there (StateWords
 *  `openOriginal`: the website's): the file sign in quiet ink, its words, and a link to arXiv's PDF of the version, opened where
 *  the settings say */
export function OriginalCard({ controller, side }: { controller: ReaderController; side: 'left' | 'right' }) {
  const parts = useParts()
  // (on the pane shown: the original's, else the translation's)
  const card = useReader(controller, (s) =>
    originalCardSide(s) === side ? originalCardOf(s, parts.reason, parts.words) : null,
  )
  const sameTab = useReader(controller, (s) => s.prefs?.links === 'same-tab')
  if (!card) return null
  return (
    <div className="chrome card" data-card data-tone="wait">
      <Icon node={FileText} size={20} />
      <p>{card.reason}</p>
      <a className="act" href={card.href} target={sameTab ? '_top' : '_blank'} rel="noopener noreferrer">
        {card.label}
        <Icon node={ArrowUpRight} size={14} />
      </a>
    </div>
  )
}

/** `of`: where this one is drawn, the pane's or the page's; a card is drawn in one of them only */
export function FailureCard({ controller, of = 'pane' }: { controller: ReaderController; of?: 'pane' | 'page' }) {
  const parts = useParts()
  const card = useReader(controller, (s) => cardOf(s, parts.reason, parts.words))
  const look = useReader(controller, (s) => (card ? cardLook(card, s, parts.signs) : null))
  const sameTab = useReader(controller, (s) => s.prefs?.links === 'same-tab')
  // the retry's time where one is named and to come: drawn again at it
  const due = useReader(controller, (s) => cardDueAt(s, Date.now(), parts.words))
  const now = useClock(due)
  const waiting = parts.retry === 'when-due' && due !== null && now < due
  // the host's lines under the reason, asked at the time drawn
  const lines = useReader(controller, (s) =>
    card && card.action !== 'arxiv' ? (parts.words?.cardLines?.(s.failure ?? 'unknown', s.failureAt) ?? null) : null,
  )
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
      {lines?.sub || lines?.note ? (
        <div className="lines">
          <p>{card.reason}</p>
          {lines.sub && <p className="sub">{lines.sub}</p>}
          {lines.note && <p className="sub">{lines.note}</p>}
        </div>
      ) : (
        <p>{card.reason}</p>
      )}
      {card.action === 'settings' ? (
        parts.slots.card?.('settings')
      ) : (
        <button
          type="button"
          aria-disabled={waiting || undefined}
          onClick={() => {
            if (!waiting) controller.retry()
          }}
        >
          {S.failed.retry}
        </button>
      )}
    </div>
  )
}
