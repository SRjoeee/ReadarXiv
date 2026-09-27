// A translation style's editor (the redesign's design, §6.4), opened under its row for a built-in as for one of the
// reader's own: the name, the preview (the original over the translation, in the style), the colour, the strength, the
// underline with the line's thickness once a line is chosen, and folded under More the blur and the custom
// declarations; then Done, Duplicate (S-O-48, kept: §11 does not list it) and Delete style. Every control writes at once; the name only when it is not empty (the schema's), and the
// declarations only when they will survive the sanitiser, the rest staying in the field with its reason
import { ChevronRight } from 'lucide'
import { type ComponentProps, useEffect, useRef, useState } from 'react'
import { NAME_MAX, PALETTE, type StyleProfile, UNDERLINES } from '@/config/appearance'
import { sanitizeCustomCss } from '@/core/renderer'
import { styleSample } from '@/ui/style-sample'
import { Button } from '@/ui/controls/Button'
import { Field, TextInput, useField } from '@/ui/controls/Field'
import { Icon } from '@/ui/controls/Icon'
import { Reveal } from '@/ui/controls/Reveal'
import { Segmented } from '@/ui/controls/Segmented'
import { Switch } from '@/ui/controls/Switch'
import { O, PREVIEW_LANG, profileName } from '@/ui/strings'
import { ColourPick } from '../ui/ColourPick'
import { segmentWidth } from '../ui/lists'

/** The strength's steps (§6.4): as it is, a step lighter (the built-in muted style's 0.7), lighter still */
export const STRENGTHS = [1, 0.7, 0.5] as const

export function StyleEditor({ value, onChange, onDone, onDuplicate, onDelete }: {
  value: StyleProfile
  /**
   * A partial change, merged onto the *latest* stored profile by the owner (`Styles`'s `patch(latest => …)`), not
   * onto this render's `value`: two quick edits both read from `value` before either write lands would otherwise
   * merge a stale copy back and lose the first (fix round 1, item 4 — `src/shared/surface-config.ts`'s note).
   * Answers with the write: the declarations' field waits for its own (CustomCss)
   */
  onChange: (over: Partial<StyleProfile>) => Promise<unknown>
  onDone: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const e = O.appearance.editor
  const [name, setName] = useState(() => profileName(value, 'styles'))
  const [more, setMore] = useState(value.blur || value.css !== '')
  const nameField = useRef<HTMLInputElement>(null)
  // an opened editor puts the focus on its first field (§9)
  useEffect(() => { nameField.current?.focus({ preventScroll: true }) }, [])
  const set = (over: Partial<StyleProfile>) => void onChange(over)
  return (
    <div className="o-editor">
      <Field label={e.name}>
        <TextInput ref={nameField} value={name} maxLength={NAME_MAX} autoComplete="off"
          onChange={ev => { setName(ev.target.value); if (ev.target.value.trim()) set({ name: ev.target.value.trim() }) }} />
      </Field>
      <div className="o-preview">
        <div className="o-preview-source">{O.reading.previewSource}</div>
        <div className="o-preview-target" lang={PREVIEW_LANG} data-blur={value.blur || undefined} style={styleSample(value)}>{O.reading.previewTarget}</div>
      </div>
      <div className="o-line">
        <span>{e.colour}</span>
        <span className="o-swatches">
          <button type="button" className="swatch o-swatch o-follow" aria-label={e.follow} title={e.follow} aria-pressed={value.color === ''} onClick={() => set({ color: '' })} />
          {PALETTE.map(c => (
            <button key={c} type="button" className="swatch o-swatch" aria-label={c} aria-pressed={value.color === c} style={{ background: c }} onClick={() => set({ color: c })} />
          ))}
          <ColourPick label={e.pick} value={value.color} pressed={value.color !== '' && !PALETTE.includes(value.color)} onPick={color => set({ color })} />
        </span>
      </div>
      <div className="o-line">
        <span>{e.strength}</span>
        <div className="o-seg" style={segmentWidth(210)}>
          {/* a value between the steps matches none: no step is chosen until one is (§6.4; Part 3's Segmented) */}
          <Segmented size="sm" label={e.strength} value={String(value.opacity)} options={STRENGTHS.map((v, i) => ({ value: String(v), label: e.strengths[i]! }))}
            onChange={v => set({ opacity: Number(v) })} />
        </div>
      </div>
      <div className="o-line">
        <span>{O.reading.underline}</span>
        <div className="o-seg" style={segmentWidth(300)}>
          <Segmented size="sm" label={O.reading.underline} value={value.underline} options={UNDERLINES.map(u => ({ value: u, label: O.reading.underlines[u] }))}
            onChange={underline => set({ underline })} />
        </div>
      </div>
      <Reveal open={value.underline !== 'none'}>
        <div className="o-line" data-sub="">
          <span>{O.reading.thickness}</span>
          <div className="o-seg" style={segmentWidth(120)}>
            <Segmented size="sm" label={O.reading.thickness} value={String(value.thickness)} options={[{ value: '1', label: '1px' }, { value: '2', label: '2px' }]}
              onChange={t => set({ thickness: t === '2' ? 2 : 1 })} />
          </div>
        </div>
      </Reveal>
      <div>
        <button type="button" className="o-disclose" aria-expanded={more} onClick={() => setMore(m => !m)}>
          <Icon node={ChevronRight} size={14} />{O.more}
        </button>
      </div>
      <Reveal open={more}>
        <div className="o-more">
          <div className="o-line">
            <span className="o-line-words"><span>{O.reading.blur}</span><small>{O.reading.blurHint}</small></span>
            <Switch label={O.reading.blur} checked={value.blur} onChange={blur => set({ blur })} />
          </div>
          <CustomCss value={value.css} onChange={css => onChange({ css })} />
        </div>
      </Reveal>
      <div className="o-formbar">
        <Button type="button" kind="brand" size="md" onClick={onDone}>{e.done}</Button>
        <Button type="button" kind="text" size="md" onClick={onDuplicate}>{O.reading.duplicate}</Button>
        <Button type="button" kind="text" size="md" onClick={onDelete}>{e.delete}</Button>
      </div>
    </div>
  )
}

/**
 * The custom declarations (S-O-47), a draft of their own: a refused block never reaches the stored profile, so a value
 * fed straight back would snap the text away before its reason could be read (Codex on #157). The draft follows the
 * profile when it changes elsewhere, never while a write of its own is out; a refused write leaves it the reader's to
 * finish (the reasoning of the drawer's AdvancedCss, which this replaces)
 */
function CustomCss({ value, onChange }: { value: string; onChange: (css: string) => Promise<unknown> }) {
  const [draft, setDraft] = useState(value)
  const committed = useRef(value)
  const pending = useRef(0)
  const failed = useRef(false)
  if (committed.current !== value) {
    committed.current = value
    if (pending.current === 0 && !failed.current && draft !== value && sanitizeCustomCss(draft).ok) setDraft(value)
  }
  const check = sanitizeCustomCss(draft)
  return (
    <Field label={O.appearance.editor.css} error={check.ok ? undefined : O.reading.advancedRejected[check.reason]}>
      <CssTextarea value={draft} spellCheck={false} autoComplete="off" className="o-css" onChange={e => {
        const next = e.target.value
        setDraft(next)
        if (!sanitizeCustomCss(next).ok) return
        pending.current++
        onChange(next).then(() => { failed.current = false }, () => { failed.current = true }).finally(() => { pending.current-- })
      }} />
    </Field>
  )
}

/**
 * The declaration block's own field (fix round 1, item 5): a single-line `<input>` cannot hold what it is meant
 * to show — typing Enter adds no line break, and a stored multi-line block reads as one broken line — so this is
 * a plain three-row `<textarea>` on the same field wiring `TextInput` uses (`@/ui/controls/Field`'s `useField`),
 * carrying the same `.input` styling
 */
function CssTextarea({ className, ...rest }: ComponentProps<'textarea'>) {
  const field = useField()
  return <textarea id={field?.id} aria-describedby={field?.describedBy} aria-invalid={field?.invalid || undefined} {...rest} rows={3} className={className ? `input ${className}` : 'input'} />
}
