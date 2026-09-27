// The settings page's row (the redesign's design, §6.2): at least 48 px, a label over a description, a value, a switch,
// a status or a button at its trailing edge. Three leading edges and one trailing, 14 px from the card's: controls at
// 14, words at 42 after a leading control, one step of 28 px per level. Every part carries `data-part`, so that the
// alignment probe (tests/e2e/probes/settings-align.mjs) measures what is drawn. A row carries its place (`row`, the deep
// link's `section/row`) and its words (`data-search`), which the search and the links read — attributes, no layout.
// Three kinds: a plain row (whose whole surface is its switch's label when it `toggles`), a button row (a disclosure, a
// menu, an add row), a radio row (the radio and the words are the control; buttons at its end stay their own)
import { ChevronDown, CircleAlert, CircleCheck, type IconNode, LoaderCircle } from 'lucide'
import { type ButtonHTMLAttributes, type CSSProperties, type MouseEvent, type ReactNode, type Ref, useId, useRef } from 'react'
import { Icon } from '@/ui/controls/Icon'
import { Radio } from '@/ui/controls/radio'
import { PREVIEW_LANG } from '@/ui/strings'
import { Marked } from './search'

interface RowBase {
  /** `section/row`: the deep link's target and the search's unit (§6.1) */
  row?: string
  /** words a search finds the row by besides its own (O.search.keywords) */
  words?: string
  label: string
  /** a small label after the name: a prompt of one's own carries O.prompts.mine */
  tag?: string
  description?: string
  /** the description is swapped as a choice changes (the way to translate): it comes in with the reader's words-in (§8; Part 3 moved it into controls.css) */
  swap?: boolean
  /** the description written in a translation style: the styles list's sample */
  sample?: CSSProperties
  /** a leading control on the controls' edge (a plus, an alert); the words move to the next edge. A radio row draws its
   *  own mark there */
  lead?: ReactNode
  /** one step of 28 px per level (§6.2) */
  level?: 0 | 1 | 2
  /** the row's own description, e.g. a segmented control's `describedBy` (fix round 1): a function reads the description's
   *  id — undefined where there is none to read, or where it is a sample rather than words (as the radio kind's own aria-describedby decides) */
  trailing?: ReactNode | ((descId: string | undefined) => ReactNode)
  /** greyed: a service that cannot be chosen yet */
  muted?: boolean
  /** its words in ink-2: an add row, a line with nothing to set */
  quiet?: boolean
  /** it has just come (a service added, a style or a prompt made): §8's row motion */
  arriving?: boolean
}

export type RowProps = RowBase & (
  | { kind?: 'plain'; toggles?: boolean }
  | { kind: 'button'; onPress?: () => void; expanded?: boolean; buttonProps?: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> } }
  | { kind: 'radio'; checked: boolean; disabled?: boolean; onChoose: (how: 'pointer' | 'key') => void; radioRef?: Ref<HTMLSpanElement> }
)

/** a press on one of these inside a row is theirs, not the row's */
const OWN_CONTROL = 'button, a, input, [role="switch"]'
const inControl = (e: MouseEvent, row: Element) => {
  const hit = (e.target as Element).closest(OWN_CONTROL)
  return hit !== null && hit !== row && row.contains(hit)
}

export function Row(props: RowProps) {
  const { row, words, label, tag, description, swap, sample, lead, level = 0, trailing, muted, quiet, arriving } = props
  const labelId = useId()
  const descId = useId()
  // a swapped description comes in with words-in from its first change on — not as the section is first drawn. Once it
  // has changed, the description's span is keyed by its words, so that each new one mounts, and animates, once
  const first = useRef(description)
  const changed = useRef(false)
  if (description !== first.current) changed.current = true
  const swapping = swap === true && changed.current
  // the prior two disjuncts already exclude 'button' and 'radio', narrowing props to the plain variant here
  const press = props.kind === 'button' || props.kind === 'radio' || props.toggles === true
  const attrs = {
    className: 'o-row',
    'data-srow': '',
    'data-row': row,
    // a sample is drawn, not read: a style's sample sentence is not the row's own words (fix round 1, item 7)
    'data-search': `${label} ${sample ? '' : description ?? ''} ${words ?? ''}`.trim().toLowerCase(),
    'data-level': level || undefined,
    'data-lead': lead || props.kind === 'radio' ? '' : undefined,
    'data-press': press ? '' : undefined,
    'data-muted': muted ? '' : undefined,
    'data-quiet': quiet ? '' : undefined,
    'data-arriving': arriving ? '' : undefined,
  }
  const leadPart = lead ? <span data-part="lead" className="o-lead">{lead}</span> : null
  const wordsPart = (
    <span data-part="words" className="o-words">
      <span id={labelId} className="o-label"><Marked text={label} />{tag && <span className="o-var o-tag">{tag}</span>}</span>
      {description && (
        // a sample sentence is a picture of the style, not a second sentence to read: hidden from the radio's own
        // description and out of it, in its own language, not the interface's (fix round 1, item 7)
        <span key={swapping ? description : 'description'} id={descId} className={swapping ? 'o-desc o-swap' : 'o-desc'} data-sample={sample ? '' : undefined} style={sample}
          aria-hidden={sample ? true : undefined} lang={sample ? PREVIEW_LANG : undefined}>
          <Marked text={description} />
        </span>
      )}
    </span>
  )
  const trailContent = typeof trailing === 'function' ? trailing(description && !sample ? descId : undefined) : trailing
  const trail = trailContent ? <span data-part="trail" className="o-trail">{trailContent}</span> : null

  if (props.kind === 'button') {
    return (
      // a popover's trigger (buttonProps) says itself whether it is expanded; a disclosure says it with `expanded`
      <button type="button" {...attrs} aria-expanded={props.expanded} {...props.buttonProps} onClick={props.onPress}>
        {leadPart}{wordsPart}{trail}
      </button>
    )
  }
  if (props.kind === 'radio') {
    const { checked, disabled, onChoose, radioRef } = props
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: the radio inside is the keyboard's; the row is its surface for the pointer
      // biome-ignore lint/a11y/noStaticElementInteractions: as above
      <div {...attrs} onClick={e => { if (!disabled && !inControl(e, e.currentTarget)) onChoose('pointer') }}>
        {/* biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a row (§6.2), its group's keys are its card's */}
        <span ref={radioRef} role="radio" aria-checked={checked} aria-disabled={disabled || undefined} tabIndex={checked ? 0 : -1}
          aria-labelledby={labelId} aria-describedby={description && !sample ? descId : undefined} className="o-choice"
          onKeyDown={e => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onChoose('key') } }}>
          {/* the mark reads its state from the radio it is the direct child of (Part 3's Radio): on the controls' edge */}
          <Radio />
          {wordsPart}
        </span>
        {trail}
      </div>
    )
  }
  const toggles = props.toggles === true
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the switch is the keyboard's control; the row is its label for the pointer (§9)
    // biome-ignore lint/a11y/noStaticElementInteractions: as above
    <div {...attrs} onClick={toggles ? e => { if (!inControl(e, e.currentTarget)) e.currentTarget.querySelector<HTMLElement>('[role="switch"]')?.click() } : undefined}>
      {leadPart}{wordsPart}{trail}
    </div>
  )
}

/** A value at a row's end, with the chevron that says the row opens something */
export function Value({ children }: { children: ReactNode }) {
  return (
    <span className="o-value">
      <span className="o-value-words">{children}</span>
      <Icon node={ChevronDown} size={14} />
    </span>
  )
}

const TONES: Record<'alert' | 'ok' | 'busy', IconNode> = { alert: CircleAlert, ok: CircleCheck, busy: LoaderCircle }

/** A state at a row's end: an alert in danger, a success in green, a wait turning; the words stay ink-2 (§5.2) */
export function Status({ tone, arriving = false, children }: { tone?: 'alert' | 'ok' | 'busy'; arriving?: boolean; children?: ReactNode }) {
  return (
    <span className="o-status" data-tone={tone}>
      {/* a wait turns with Part 3's `.spin`, under reduced motion too: a loader that stops reads as stuck */}
      {tone && <Icon node={TONES[tone]} size={14} className={tone === 'busy' ? 'spin' : arriving ? 'o-arrive' : undefined} />}
      {children}
    </span>
  )
}

/**
 * A trailing icon button: a 28 px square pulled 6 px outward, so that its 16 px glyph ends on the trailing edge the
 * switches keep (better-ui: optical alignment). `hover`: a row of one's own shows it on the row's hover or the
 * keyboard's focus, always on a touch screen (§6.2)
 */
export function IconButton({ icon, label, hover = false, ...button }: { icon: IconNode; label: string; hover?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} data-icon-button="" data-on-hover={hover ? '' : undefined} className="o-icon-button" {...button}>
      <Icon node={icon} />
    </button>
  )
}
