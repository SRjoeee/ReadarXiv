// Segmented controls (the redesign's design, §2.3, §5.1, §6.4, §8; Part 3's interfaces): a single choice drawn as the
// reader's `.seg` — a radio group whose arrows move the choice past a segment that cannot be had, the focus going with
// it (radioKeys). Equal segments slide their thumb by `translate` (the reader's --i and --n); `fit` segments take their
// words' widths, and the thumb follows the chosen one by anchor positioning: the chosen segment carries the anchor name
// each `.seg.fit` scopes to itself (controls.css). A segment's title is its tooltip, and its description to a screen
// reader (why a disabled one cannot be had); a segment of icons alone is named by its words, which its tooltip says
import { type CSSProperties, type ReactNode, useId, useRef } from 'react'
import { radioKeys } from './radio'
import { useTip } from './tip'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  /** drawn before the words as it is given: Lucide's at 14 px, or the popup's display glyphs */
  icon?: ReactNode
  /** its tooltip and its description: why a disabled segment cannot be had */
  title?: string
  disabled?: boolean
}

/** the chosen segment's anchor name, scoped by each `.seg.fit` to itself */
const CHOSEN = '--seg-on'

export function Segmented<T extends string>({ label, value, options, onChange, fit = false, size = 'md', iconsOnly = false }: {
  label: string
  value: T
  options: readonly SegmentOption<T>[]
  onChange: (value: T) => void
  fit?: boolean
  size?: 'md' | 'sm'
  iconsOnly?: boolean
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const values = options.map(o => o.value)
  const can = (v: T) => !options.find(o => o.value === v)?.disabled
  const choose = (v: T) => { if (v !== value && can(v)) onChange(v) }
  const chosen = values.indexOf(value)
  // a value none of the options holds leaves no thumb, and the first that can be had is the tab stop, the arrows going
  // on from it: the group stays reachable
  const stop = chosen >= 0 ? chosen : options.findIndex(o => !o.disabled)
  const className = ['seg', fit && 'fit', size === 'sm' && 'small', iconsOnly && 'icons'].filter(Boolean).join(' ')
  return (
    <div role="radiogroup" aria-label={label} className={className} style={fit ? undefined : ({ '--i': chosen, '--n': options.length } as CSSProperties)}
      onKeyDown={radioKeys(values, values[stop] as T, can, choose, i => buttons.current[i]?.focus())}>
      {chosen >= 0 && <span className="thumb" aria-hidden="true" />}
      {options.map((option, i) => (
        <Segment key={option.value} option={option} checked={i === chosen} stop={i === stop} anchor={fit && i === chosen} iconsOnly={iconsOnly}
          onPick={() => choose(option.value)} buttonRef={el => { buttons.current[i] = el }} />
      ))}
    </div>
  )
}

function Segment<T extends string>({ option, checked, stop, anchor, iconsOnly, onPick, buttonRef }: {
  option: SegmentOption<T>
  checked: boolean
  stop: boolean
  anchor: boolean
  iconsOnly: boolean
  onPick: () => void
  buttonRef: (el: HTMLButtonElement | null) => void
}) {
  const id = useId()
  const tipped = iconsOnly || option.title !== undefined
  const { props, tip } = useTip(iconsOnly ? option.label : (option.title ?? ''), iconsOnly ? option.title : undefined)
  // anchor-name takes a list: the tooltip's, and the thumb's on the chosen segment of a fit control
  const names = [tipped ? (props.style as { anchorName: string }).anchorName : '', anchor ? CHOSEN : ''].filter(Boolean).join(', ')
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a segment, as the reader's are; its keys are the group's */}
      <button ref={buttonRef} type="button" role="radio" aria-checked={checked} aria-disabled={option.disabled || undefined} aria-label={iconsOnly ? option.label : undefined}
        aria-describedby={option.title ? `${id}-why` : undefined} tabIndex={stop ? 0 : -1} onClick={onPick} {...(tipped ? props : {})} style={names ? ({ anchorName: names } as CSSProperties) : undefined}>
        {option.icon}
        {!iconsOnly && <span>{option.label}</span>}
        {option.title && <span id={`${id}-why`} hidden>{option.title}</span>}
      </button>
      {tipped && tip}
    </>
  )
}
