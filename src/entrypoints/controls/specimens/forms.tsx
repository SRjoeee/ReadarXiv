// Fields, radios and a reveal (Part 3, Task 17): the settings page's form pieces — a field with a hint, one at fault, a
// disabled one; a radio group of services in a card, the arrows moving the choice past the one that cannot be had; and a
// field opened in place under a text button
import { useId, useRef, useState } from 'react'
import { Button } from '@/ui/controls/Button'
import { Field, TextInput } from '@/ui/controls/Field'
import { Radio, radioKeys } from '@/ui/controls/radio'
import { Reveal } from '@/ui/controls/Reveal'
import { O, S } from '@/ui/strings'

export function Forms() {
  const [service, setService] = useState('microsoft')
  const [open, setOpen] = useState(false)
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const revealId = useId()
  const services = [
    { id: 'microsoft', name: S.service.microsoft, hint: S.service.free, disabled: false },
    { id: 'google', name: S.service.google, hint: S.service.free, disabled: false },
    { id: 'chrome', name: S.service.chrome, hint: S.service.chrome_unavailable, disabled: true },
  ]
  const can = (id: string) => !services.find(s => s.id === id)?.disabled
  return (
    <>
      <div className="form-demo">
        <Field label={O.services.baseURL}>
          <TextInput placeholder="https://…/v1" />
        </Field>
        <Field label={O.services.apiKey} error={O.services.permission.badURL}>
          <TextInput defaultValue="sk-or-0000" />
        </Field>
        <Field label={O.services.model} hint={O.services.modelNoList}>
          <TextInput disabled placeholder={O.services.model} />
        </Field>
      </div>
      <div role="radiogroup" aria-label={S.rows.service} className="card-demo" onKeyDown={radioKeys(services.map(s => s.id), service, can, setService, i => rows.current[i]?.focus())}>
        {services.map((s, i) => (
          // biome-ignore lint/a11y/useSemanticElements: an ARIA radio drawn as a row of the settings page, as the reader's segments are; its keys are the group's
          <button key={s.id} ref={el => { rows.current[i] = el }} type="button" role="radio" aria-checked={s.id === service} aria-disabled={s.disabled || undefined} tabIndex={s.id === service ? 0 : -1}
            onClick={() => { if (can(s.id)) setService(s.id) }} data-row className="radio-row">
            <Radio />
            <span className="words">
              <span>{s.name}</span>
              <small>{s.hint}</small>
            </span>
          </button>
        ))}
      </div>
      <div>
        <Button kind="text" aria-expanded={open} aria-controls={revealId} onClick={() => setOpen(o => !o)}>{O.more}</Button>
        <Reveal id={revealId} open={open}>
          <div className="reveal-body">
            <Field label={O.services.apiKey} hint={O.services.apiKeyLocalHint}>
              <TextInput placeholder="sk-…" />
            </Field>
          </div>
        </Reveal>
      </div>
    </>
  )
}
