// Adding a service, editing one, giving one a new key — in place (the redesign's design, §6.3). The address first,
// three suggestions filling it (an address, nothing else: no vendor template, T4); the key; the model from the endpoint's
// own list; a name, the model's by default; extended thinking folded under More; then Connect · Cancel. Nothing is stored here: a
// successful connection hands the service to the caller, which saves it (§11: no service without a connection). The
// endpoint's origin is asked for on a gesture — a suggestion's press, a press on the model field, Connect — and the list
// loads by itself only for an origin already granted. Checked when submitted: the fields at fault say why, the first
// takes the focus (§9). Open, the form is a draft the page does not reload under (ui/drafts.ts)
import { ChevronRight } from 'lucide'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { LangCode } from '@/config/languages'
import { NAME_MAX, type Service, defaultServiceName, isLoopback, newServiceId } from '@/config/services'
import { Button } from '@/ui/controls/Button'
import { Field, TextInput } from '@/ui/controls/Field'
import { Icon } from '@/ui/controls/Icon'
import { Reveal } from '@/ui/controls/Reveal'
import { Switch } from '@/ui/controls/Switch'
import { drafts } from '@/ui/drafts'
import { O } from '@/ui/strings'
import { type ServiceField, connectService } from '../connect'
import { type ModelOption, listModels } from '../models'
import { PermissionError, ensureHostPermission, hasHostPermission, releaseHostPermission } from '../permissions'
import { Combobox } from '../ui/Combobox'
import { Status } from '../ui/Row'

/** What the suggestions fill in: OpenRouter and DeepSeek are product names, written as they are; the local one is words */
const SUGGESTIONS = [
  { name: () => 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { name: () => 'DeepSeek', url: 'https://api.deepseek.com/v1' },
  { name: () => O.services.localOllama, url: 'http://localhost:11434/v1' },
]
/** The list waits until the address and the key have been still this long, as the popup's search does (§5.4) */
export const STILL_MS = 300

const isAddress = (s: string) => {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
const deniedWords = (e: unknown) => (e instanceof PermissionError && e.kind === 'denied' ? O.services.permission.denied(e.origin ?? '') : O.services.permission.badURL)

type ListState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; models: ModelOption[] } | { kind: 'failed' }

/** The endpoint's models: by itself once the address and the key are in and still, for an origin already granted */
function useModels(url: string, key: string, ready: boolean) {
  const [list, setList] = useState<ListState>({ kind: 'idle' })
  const current = useRef<AbortController | null>(null)
  const load = useCallback(() => {
    current.current?.abort()
    const abort = new AbortController()
    current.current = abort
    setList({ kind: 'loading' })
    listModels(url, key, abort.signal).then(
      models => { if (!abort.signal.aborted) setList({ kind: 'ready', models }) },
      () => { if (!abort.signal.aborted) setList({ kind: 'failed' }) },
    )
  }, [url, key])
  useEffect(() => {
    current.current?.abort()
    setList({ kind: 'idle' })
    if (!ready) return
    let gone = false
    const timer = setTimeout(() => void hasHostPermission(url).then(yes => { if (yes && !gone) load() }), STILL_MS)
    return () => { gone = true; clearTimeout(timer) }
  }, [url, ready, load])
  useEffect(() => () => current.current?.abort(), [])
  return { list, load }
}

export function ServiceForm({ service, target, stored, onConnected, onCancel }: {
  /** the service edited; absent, a new one */
  service?: Service
  target: LangCode
  /** the stored services' addresses: an origin one of them uses is not given back */
  stored: readonly string[]
  onConnected: (saved: Service, ms: number) => Promise<void>
  onCancel: () => void
}) {
  /** one id per form: a second Connect after a failure is the same service, never another (Codex on #157) */
  const [id] = useState(() => service?.id ?? newServiceId())
  const [url, setUrl] = useState(service?.baseURL ?? '')
  const [key, setKey] = useState('')
  /** editing: the saved key goes with the service while the field is empty; Clear lets it go */
  const [keepKey, setKeepKey] = useState(Boolean(service?.apiKey))
  const [model, setModel] = useState(service?.model ?? '')
  /** the endpoint's own name for the model chosen from its list: the service's name by default */
  const [modelName, setModelName] = useState<string | undefined>()
  const [name, setName] = useState(service?.name ?? '')
  const [thinking, setThinking] = useState(service?.thinking === 'enabled')
  const [more, setMore] = useState(service?.thinking === 'enabled')
  const [errors, setErrors] = useState<Partial<Record<ServiceField, string>>>({})
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const address = useRef<HTMLInputElement>(null)
  const keyField = useRef<HTMLInputElement>(null)
  const modelField = useRef<HTMLInputElement>(null)
  const fields: Record<ServiceField, RefObject<HTMLInputElement | null>> = { baseURL: address, apiKey: keyField, model: modelField }
  /** origins this form asked for: given back if it closes with nothing saved (permissions.ts: the granted list must not grow with every try) */
  const granted = useRef(new Set<string>())
  const handedOver = useRef(false)
  const storedNow = useRef(stored)
  storedNow.current = stored
  const keyInEffect = key.trim() || (keepKey ? service?.apiKey ?? '' : '')
  const local = isLoopback(url)
  const ready = isAddress(url) && (local || keyInEffect !== '')
  const { list, load } = useModels(url.trim(), keyInEffect, ready)

  useEffect(() => drafts.hold(), [])
  // an opened form puts the focus on its first field (§9)
  useEffect(() => { address.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => () => {
    if (!handedOver.current) for (const u of granted.current) void releaseHostPermission(u, storedNow.current).catch(() => undefined)
  }, [])

  const clearError = (field: ServiceField) => setErrors(x => ({ ...x, [field]: undefined }))
  /** the endpoint's origin, asked for from the gesture that called this */
  const ask = async (to: string): Promise<boolean> => {
    try {
      if (await ensureHostPermission(to)) granted.current.add(to)
      return true
    } catch (e) {
      setErrors(x => ({ ...x, baseURL: deniedWords(e) }))
      return false
    }
  }
  const suggest = (to: string) => {
    setUrl(to)
    clearError('baseURL')
    void ask(to)
    ;(isLoopback(to) ? modelField : keyField).current?.focus()
  }
  const openList = () => {
    if (!ready || list.kind === 'loading' || list.kind === 'ready') return
    void ask(url.trim()).then(ok => { if (ok) load() })
  }
  const connect = async () => {
    const found: Partial<Record<ServiceField, string>> = {}
    if (!isAddress(url)) found.baseURL = O.services.checks.baseURL
    else if (!local && !keyInEffect) found.apiKey = O.services.checks.apiKey
    if (!model.trim()) found.model = O.services.checks.model
    setErrors(found)
    setResult('')
    const first = (['baseURL', 'apiKey', 'model'] as const).find(f => found[f])
    if (first) {
      fields[first].current?.focus()
      return
    }
    const candidate: Service = {
      id, kind: 'openai-compat', baseURL: url.trim(), apiKey: keyInEffect, model: model.trim(), thinking: thinking ? 'enabled' : 'disabled',
      name: (name.trim() || modelName || defaultServiceName(model.trim())).slice(0, NAME_MAX),
    }
    setBusy(true)
    const res = await connectService(candidate, target)
    if (!res.ok) {
      setBusy(false)
      setResult(res.reason)
      if (res.field) fields[res.field].current?.focus()
      return
    }
    handedOver.current = true
    try {
      await onConnected(candidate, res.ms)
    } catch (e) {
      // the save itself refused (the schema's limit of services, storage): nothing stored, the form stays
      handedOver.current = false
      setResult(O.services.failed(e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  const keyLabel = local ? `${O.services.apiKey} · ${O.services.apiKeyLocalHint}` : O.services.apiKey
  const modelPlaceholder = list.kind === 'loading' ? O.services.modelLoading : list.kind === 'ready' ? O.services.modelSearch(list.models.length) : O.services.modelEmpty
  return (
    <form className="o-form" data-form="service" noValidate onSubmit={e => { e.preventDefault(); if (!busy) void connect() }}>
      <div className="o-stack">
        <Field label={O.services.baseURL} error={errors.baseURL}>
          <TextInput ref={address} value={url} inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://…/v1"
            onChange={e => { setUrl(e.target.value); clearError('baseURL') }} />
        </Field>
        <span className="o-chips">
          {SUGGESTIONS.map(s => <button key={s.url} type="button" className="o-chip" onClick={() => suggest(s.url)}>{s.name()}</button>)}
        </span>
      </div>
      <Field label={keyLabel} error={errors.apiKey}>
        <TextInput ref={keyField} type="password" value={key} autoComplete="off" spellCheck={false} placeholder={keepKey ? O.services.keySaved : 'sk-…'}
          onChange={e => { setKey(e.target.value); clearError('apiKey') }} />
      </Field>
      {keepKey && <Button type="button" kind="text" size="sm" className="o-clear-key" onClick={() => setKeepKey(false)}>{O.services.apiKeyClear}</Button>}
      <Field label={O.services.model} error={errors.model} hint={list.kind === 'failed' ? O.services.modelNoList : undefined}>
        <Combobox ref={modelField} value={model} options={list.kind === 'ready' ? list.models : null} busy={list.kind === 'loading'} noMatch={O.services.modelNoMatch}
          placeholder={modelPlaceholder} disabled={!ready && !model} onOpen={openList}
          onValue={(text, option) => { setModel(text); setModelName(option?.name); clearError('model') }} />
      </Field>
      <Field label={O.services.name}>
        <TextInput value={name} maxLength={NAME_MAX} autoComplete="off" placeholder={O.services.namePlaceholder} onChange={e => setName(e.target.value)} />
      </Field>
      <div>
        <button type="button" className="o-disclose" aria-expanded={more} onClick={() => setMore(m => !m)}><Icon node={ChevronRight} size={14} />{O.more}</button>
        <Reveal open={more}>
          <div className="o-more">
            <div className="o-line">
              <span className="o-line-words"><span>{O.services.thinking}</span><small>{O.services.thinkingHint}</small></span>
              <Switch label={O.services.thinking} checked={thinking} onChange={setThinking} />
            </div>
          </div>
        </Reveal>
      </div>
      <div className="o-formbar">
        {/* Part 3's busy: the loader in the icon's place, the words kept, a click refused; the submit guard above stays for
            Enter in a field */}
        <Button type="submit" kind="brand" size="md" busy={busy}>{busy ? O.services.connecting : O.services.connect}</Button>
        <Button type="button" kind="text" size="md" onClick={onCancel}>{O.services.cancel}</Button>
        <span className="o-note" role="status">{result ? <Status tone="alert">{result}</Status> : service ? O.services.savedOnConnect : O.services.addedOnConnect}</span>
      </div>
    </form>
  )
}

/**
 * A key the endpoint refused (§4's record), or a service an earlier version stored without one (without the first
 * sentence): a new key, Update and connect; saved only once it connects. Nothing here writes the record: once the caller has
 * stored the new key, the background clears the mark (ruling 17)
 */
export function KeyForm({ service, refused, target, focus = false, onConnected }: {
  service: Service
  refused: boolean
  target: LangCode
  /** opened by the pointer's choice of the service: the focus goes to the field (§9) */
  focus?: boolean
  onConnected: (saved: Service, ms: number) => Promise<void>
}) {
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const typed = key !== ''
  useEffect(() => (typed ? drafts.hold() : undefined), [typed])
  useEffect(() => { if (focus) field.current?.focus({ preventScroll: true }) }, [focus])
  const submit = async () => {
    setResult('')
    if (!key.trim()) {
      setError(O.services.checks.apiKey)
      field.current?.focus()
      return
    }
    setError(undefined)
    setBusy(true)
    const candidate = { ...service, apiKey: key.trim() }
    const res = await connectService(candidate, target)
    if (res.ok) {
      await onConnected(candidate, res.ms).finally(() => setBusy(false))
      return
    }
    setBusy(false)
    setResult(res.reason)
    field.current?.focus()
  }
  return (
    <form className="o-form" data-form="key" noValidate onSubmit={e => { e.preventDefault(); if (!busy) void submit() }}>
      {refused && <p className="o-muted">{O.services.keyForm.refused}</p>}
      <Field label={O.services.keyForm.label} error={error}>
        <TextInput ref={field} type="password" value={key} autoComplete="off" spellCheck={false} onChange={e => { setKey(e.target.value); setError(undefined) }} />
      </Field>
      <div className="o-formbar">
        <Button type="submit" kind="brand" size="md" busy={busy}>{busy ? O.services.connecting : O.services.keyForm.submit}</Button>
        <span className="o-note" role="status">{result ? <Status tone="alert">{result}</Status> : O.services.savedOnConnect}</span>
      </div>
    </form>
  )
}
