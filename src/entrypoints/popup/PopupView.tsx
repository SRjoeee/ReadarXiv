// Renders the view model's output and nothing else; every action goes through props, so the gallery can feed the same
// component the fixtures. The redesign's popup (its design, §5; round 6 of its prototypes), from the top: the brand row;
// the group of the service, the target language and, for an LLM, the prompt; a note; the primary — both of its faces when the page is paused
// or behind its settings — or an entry page's two entries; the display; the foot. P0 is the brand row over the field that
// finds a paper. Every measure is popup.css's
import './popup.css'
import { CircleAlert, Info, Settings } from 'lucide'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'
import { Segmented } from '@/ui/controls/Segmented'
import { Switch } from '@/ui/controls/Switch'
import { useTip } from '@/ui/controls/tip'
import { MODE_ORDER, R, S } from '@/ui/strings'
import type { PopupActions } from './data'
import { Entries } from './ui/Entries'
import { Find } from './ui/Find'
import { MenuRow, StyleButton } from './ui/menu'
import { ModeIcon } from './ui/ModeIcon'
import { Note } from './ui/Note'
import type { PopupView as View } from './view-model'

export function PopupView({ view, error, actions }: { view: View; error: string | null; actions: PopupActions }) {
  const failure = error === null ? null : S.actionFailed(error)
  return (
    <main className="ui popup" data-kind={view.kind}>
      <BrandRow onSettings={() => actions.openOptions()} />
      {view.kind === 'loading' && <p className="line solo">{S.loading}</p>}
      {view.kind === 'find' && view.find && <Find find={view.find} failure={failure} actions={actions} />}
      {(view.kind === 'paper' || view.kind === 'entry' || view.kind === 'reader') && <Controls view={view} failure={failure} actions={actions} />}
      {/* a failed action said to screen readers, politely (§9: nothing is assertive); its line is drawn in place */}
      <div role="status" className="sr-only">{failure}</div>
    </main>
  )
}

/** The brand row (§5.1): the mark and the name leading, the settings' gear trailing */
function BrandRow({ onSettings }: { onSettings: () => void }) {
  const tip = useTip(S.settings)
  return (
    <header className="brand-row">
      <span className="wordmark">
        <img src="/icon/mark.svg" alt="" width={20} height={17} />
        {S.brand}
      </span>
      <button type="button" className="tbtn" aria-label={S.settings} onClick={onSettings} {...tip.props}>
        <Icon node={Settings} />
      </button>
      {tip.tip}
    </header>
  )
}

function Controls({ view, failure, actions }: { view: View; failure: string | null; actions: PopupActions }) {
  return (
    <>
      <div className="group">
        <MenuRow kind="service" label={S.rows.service} row={view.service} menu={view.menus?.service ?? null} open={view.menu === 'service'} actions={actions} onPick={actions.chooseService} onAction={() => actions.downloadPack()} />
        <hr className="rule" />
        <MenuRow kind="language" label={S.rows.language} row={view.language} menu={view.menus?.language ?? null} open={view.menu === 'language'} actions={actions} onPick={id => actions.chooseLanguage(id as Parameters<PopupActions['chooseLanguage']>[0])} />
        {view.prompt && (
          <>
            <hr className="rule" />
            <MenuRow kind="prompt" label={S.rows.prompt} row={view.prompt} menu={view.menus?.prompt ?? null} open={view.menu === 'prompt'} actions={actions} onPick={actions.choosePrompt} />
          </>
        )}
      </div>
      <div className="stack">
        {view.note && <Note tone={view.note.tone} text={view.note.text} action={view.note.settings ? { label: S.settings, run: () => actions.openOptions() } : undefined} />}
        {view.failed && <Note tone="alert" text={view.failed} action={{ label: S.failed.retry, run: actions.retryFailed }} />}
        {view.entries
          ? <Entries html={{ ...view.entries.html, run: actions.openHtml }} pdf={{ ...view.entries.pdf, run: actions.openPdf }} />
          : <Primary view={view} actions={actions} />}
        {failure && <p className="line mark alert"><Icon node={CircleAlert} size={14} />{failure}</p>}
        {view.kind !== 'entry' && (
          <div className="reading">
            <Segmented
              label={R.display.name}
              value={view.mode.value}
              fit
              // The bar follows MODE_ORDER, the one place the order is decided (UI.md S-P-70). A mode the page cannot show
              // (the PDF reader cannot stack: its design, §9.2) stays in place, greyed, its title the reason (S-P-75)
              options={MODE_ORDER.map(value => ({
                value,
                label: S.mode[value],
                icon: <ModeIcon mode={value} />,
                title: view.mode.disabled?.includes(value) ? S.mode.stackPdf : S.mode[`${value}Title` as const],
                disabled: view.mode.disabled?.includes(value),
              }))}
              onChange={actions.chooseMode}
            />
            {view.mode.note && <p className="line mark"><Icon node={Info} size={14} />{view.mode.note}</p>}
          </div>
        )}
      </div>
      {view.kind !== 'entry' && <Foot view={view} actions={actions} />}
    </>
  )
}

/**
 * The primary (§5.1, §5.2): the brand's for translating, the neutral's for showing the original, neutral grey and without
 * its key when it cannot act (Part 3's `Button`). The key rides on the face it acts on (S-P-50 / 51), brand or neutral:
 * the view model says which. Paused or behind its settings — or offered its way back, the retranslate cue — both faces
 * side by side, the brand's first
 */
function Primary({ view, actions }: { view: View; actions: PopupActions }) {
  const { primary, secondary } = view
  const brand = !primary.disabled && primary.action !== 'restore' && primary.action !== 'readerOriginal'
  // aria-label keeps the accessible name at the words alone, key or not (the e2e suites find the buttons by name)
  const main = (
    <Button kind={brand ? 'brand' : 'neutral'} size="lg" disabled={primary.disabled} aria-label={primary.label} shortcut={primary.shortcut} onClick={actions[primary.action]}>
      {primary.label}
    </Button>
  )
  if (!secondary) return main
  return (
    <div className="pair">
      {main}
      <Button kind="neutral" size="lg" aria-label={secondary.label} onClick={actions[secondary.action]}>{secondary.label}</Button>
    </div>
  )
}

/** The foot (§5.1): the two switches with their words, their whole row their label (§9); the styles trailing */
function Foot({ view, actions }: { view: View; actions: PopupActions }) {
  return (
    <div className={view.style ? 'foot' : 'foot short'}>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the switch button inside it, which the rule cannot see through */}
      <label className="toggle" title={S.rows.highlightTitle}>
        <Switch label={S.rows.highlight} checked={view.highlight} onChange={actions.setHighlight} />
        {S.rows.highlight}
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the control is the switch button inside it, which the rule cannot see through */}
      <label className="toggle">
        <Switch label={S.rows.images} checked={view.images} onChange={actions.setImages} />
        {S.rows.images}
      </label>
      {view.style && view.menus?.style && <StyleButton value={view.style.value} menu={view.menus.style} open={view.menu === 'style'} actions={actions} onPick={actions.chooseStyle} />}
    </div>
  )
}
