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
import { originOf as patternOf } from '@/config/origins'
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
import { type Hold, PermissionError, ensureHostPermission, giveBackUnneeded, hasHostPermission, holdOrigin } from '../permissions'
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
/** Null for an unparsable address, so a saved key's origin never matches one by accident (Opus review round 1, item 2) */
const originOf = (s: string): string | null => {
  try {
    return new URL(s).origin
  } catch {
    return null
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

export function ServiceForm({ service, target, onConnected, onCancel }: {
  /** the service edited; absent, a new one */
  service?: Service
  target: LangCode
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
  /**
   * The name follows the model while it still reads as that model's own default — the way it was left after adding
   * the service, or after the last time it followed. A name the reader types is theirs from then on (Opus review
   * round 1, item 8)
   */
  const [autoName, setAutoName] = useState(Boolean(service) && service?.name === defaultServiceName(service?.model ?? ''))
  const [thinking, setThinking] = useState(service?.thinking === 'enabled')
  const [more, setMore] = useState(service?.thinking === 'enabled')
  const [errors, setErrors] = useState<Partial<Record<ServiceField, string>>>({})
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  const address = useRef<HTMLInputElement>(null)
  const keyField = useRef<HTMLInputElement>(null)
  const modelField = useRef<HTMLInputElement>(null)
  const fields: Record<ServiceField, RefObject<HTMLInputElement | null>> = { baseURL: address, apiKey: keyField, model: modelField }
  /** A suggestion's field may still be disabled at the click that asks for it (e.g. the model field, before `ready`
   * catches up); the focus goes there once a later render lifts that (Opus review round 1, item 4) */
  const [focusAfter, setFocusAfter] = useState<'apiKey' | 'model' | null>(null)
  /**
   * The origins this form holds, by pattern: the ones it asked for, and the one it connects with. Held, no give-back
   * anywhere takes them — a deletion's commit on this page or another among them (#299 F2c); let go once the form
   * closes with nothing saved, or once the service it saved is stored, and the background then gives back what
   * nothing needs (permissions.ts: the granted list must not grow with every try)
   */
  const holds = useRef(new Map<string, Hold>())
  const handedOver = useRef(false)
  /** Cancel means "stop, save nothing": a connection already in flight must not hand itself over once pressed, nor
   * once the form is gone for any other reason (Opus review round 1, item 1) */
  const cancelled = useRef(false)
  /** Hold the origin of `url` unless this form holds it already; whether this call is what took the hold */
  const hold = (url: string): boolean => {
    const key = patternOf(url)
    if (!key || holds.current.has(key)) return false
    holds.current.set(key, holdOrigin(url))
    return true
  }
  /** Let go of these origins — every one, by default — and ask for whatever nothing needs any more to be given back.
   * One function for the form's life: the clean-up below calls it, and it reads nothing but the ref */
  const letGo = useRef(async (urls?: readonly string[]) => {
    const keys = urls ? urls.flatMap(u => patternOf(u) ?? []) : [...holds.current.keys()]
    const released = keys.map(key => {
      const held = holds.current.get(key)
      holds.current.delete(key)
      return held?.release()
    })
    await Promise.all(released)
    await giveBackUnneeded()
  }).current
  /** The saved key rides along only while the address still points at the service it was saved for; changed to
   * another origin, it counts as absent — a secret must never reach an address the reader never gave it to (Opus
   * review round 1, item 2) */
  const savedOrigin = service ? originOf(service.baseURL) : null
  const savedKeyApplies = keepKey && savedOrigin !== null && originOf(url) === savedOrigin
  const keyInEffect = key.trim() || (savedKeyApplies ? service?.apiKey ?? '' : '')
  const local = isLoopback(url)
  const ready = isAddress(url) && (local || keyInEffect !== '')
  const { list, load } = useModels(url.trim(), keyInEffect, ready)

  useEffect(() => drafts.hold(), [])
  // an opened form puts the focus on its first field (§9)
  useEffect(() => { address.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    if (!focusAfter) return
    const el = (focusAfter === 'model' ? modelField : keyField).current
    if (!el || el.disabled) return
    el.focus({ preventScroll: true })
    setFocusAfter(null)
  }, [focusAfter])
  // Live from here, gone at the clean-up. The setup says so again: StrictMode's dev double run cleans up once and sets
  // up again, and a mark left by that clean-up counted a live form as cancelled — no Connect handed over, every grant
  // given back at once (round 3, item 1). What the clean-up let go leaves `holds`, so a second clean-up has nothing of
  // it to let go again; `handedOver` is the connection's, set by nothing here. A page that closes runs no clean-up:
  // the browser lets its holds go, and nothing is sent. What the form asked for goes back only because its granted
  // ask told the background (`ask` below), which then looks every second, for a minute, while a page's hold alone keeps
  // an origin (origin-keeper.ts); a tab closed later than that, or while the worker sleeps, leaves the origin to the
  // next sweep — a worker's start or any page's ask
  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
      if (handedOver.current || holds.current.size === 0) return
      void letGo()
    }
  }, [letGo])

  const clearError = (field: ServiceField) => setErrors(x => ({ ...x, [field]: undefined }))
  /**
   * The endpoint's origin, held, then asked for from the gesture that called this. Granted only after the form was
   * cancelled or gone (the browser's prompt open meanwhile), it is asked to go back at once: the clean-up that let go
   * of the holds ran before the grant landed, and nothing here will use the origin (Task 65). An origin already
   * granted answers at once, and a form gone by then has nothing to load (round 2, item 3). Granted to a form still
   * open, the background is told once the hold is in place: it sees an origin kept by a page's hold alone and watches
   * it, so a tab closed with the form open still gives it back (ruling 26)
   */
  const ask = async (to: string): Promise<boolean> => {
    hold(to)
    try {
      await ensureHostPermission(to)
    } catch (e) {
      setErrors(x => ({ ...x, baseURL: deniedWords(e) }))
      return false
    }
    if (!cancelled.current) {
      const key = patternOf(to)
      void (key ? holds.current.get(key)?.ready : undefined)?.then(giveBackUnneeded)
      return true
    }
    void letGo()
    return false
  }
  const suggest = (to: string) => {
    setUrl(to)
    clearError('baseURL')
    void ask(to)
    setFocusAfter(isLoopback(to) ? 'model' : 'apiKey')
  }
  const openList = () => {
    if (!ready || list.kind === 'loading' || list.kind === 'ready') return
    void ask(url.trim()).then(ok => { if (ok) load() })
  }
  const cancel = () => {
    cancelled.current = true
    onCancel()
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
    // The origin it connects with is held from here until the service is stored or the attempt is given up: a
    // give-back meanwhile — a deletion committed inside its undo window, on this page or another — must not take it
    // (#299 F2c). `fresh`: held for this attempt alone, not already for a suggestion or the model list
    const fresh = hold(candidate.baseURL)
    setBusy(true)
    const res = await connectService(candidate, target)
    if (cancelled.current) {
      // Cancel was pressed while this attempt was in flight: nothing is handed over, and what the form held goes —
      // the clean-up may have let go before connectService's grant landed (fix round 2, item 1). A caller that keeps
      // the form mounted past Cancel must find Connect pressable again, not stuck busy (fix round 2, item 3)
      setBusy(false)
      void letGo()
      return
    }
    if (!res.ok) {
      setBusy(false)
      setResult(res.reason)
      if (res.field) fields[res.field].current?.focus()
      // the origin taken for this attempt goes back; one a suggestion or the model list asked for stays with the form
      if (fresh) void letGo([candidate.baseURL])
      return
    }
    handedOver.current = true
    try {
      await onConnected(candidate, res.ms)
      // stored now, the origin it uses is the stored service's; the ones a suggestion or the model field asked for and
      // the reader moved past go back, as an unused one does on cancel (Opus review round 1, item 9)
      void letGo()
    } catch {
      // the save itself refused (the schema's limit of services, storage, a write that did not land): nothing stored,
      // the form stays, and the origin this attempt tested goes back — it was never put to use (Opus review round 1,
      // item 3). The form gone meanwhile, its clean-up ran while the service was handed over and let nothing go: every
      // hold goes here — the page takes its sections away once the stored value cannot be read, before the refused
      // write's answer comes (App.tsx; Task 107). While the stored value cannot be read the background gives back
      // none, by its own read's verdict: which stored services share an origin is unknown (config/origins.ts)
      handedOver.current = false
      setResult(O.saveFailed)
      if (cancelled.current) void letGo()
      else if (fresh) void letGo([candidate.baseURL])
    } finally {
      setBusy(false)
    }
  }

  const keyLabel = local ? `${O.services.apiKey} · ${O.services.apiKeyLocalHint}` : O.services.apiKey
  const modelPlaceholder =
    list.kind === 'loading' ? O.services.modelLoading
    : list.kind === 'ready' ? O.services.modelSearch(list.models.length)
    : list.kind === 'failed' ? O.services.modelNoList
    : O.services.modelEmpty
  return (
    <form className="o-form" data-form="service" noValidate onSubmit={e => { e.preventDefault(); if (!busy) void connect() }}>
      <div className="o-stack">
        <Field label={O.services.baseURL} error={errors.baseURL}>
          <TextInput ref={address} value={url} inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://…/v1"
            onChange={e => { setUrl(e.target.value); clearError('baseURL') }} />
        </Field>
        {/* named for a screen reader, since nothing else here says what these buttons fill (Opus review round 1, item 7);
            its own name, distinct from the address field's, so the two controls do not read as one (Task 64b, item 5) */}
        <fieldset className="o-chips" aria-label={O.services.baseURLSuggestions}>
          {SUGGESTIONS.map(s => <button key={s.url} type="button" className="o-chip" onClick={() => suggest(s.url)}>{s.name()}</button>)}
        </fieldset>
      </div>
      <Field label={keyLabel} error={errors.apiKey}>
        <TextInput ref={keyField} type="password" value={key} autoComplete="off" spellCheck={false} placeholder={savedKeyApplies ? O.services.keySaved : 'sk-…'}
          onChange={e => { setKey(e.target.value); clearError('apiKey') }} />
      </Field>
      {savedKeyApplies && (
        <Button type="button" kind="text" size="sm" className="o-clear-key" aria-label={`${O.services.apiKeyClear} ${O.services.apiKey}`}
          onClick={() => { setKeepKey(false); keyField.current?.focus() }}>{O.services.apiKeyClear}</Button>
      )}
      <Field label={O.services.model} error={errors.model}>
        <Combobox ref={modelField} value={model} options={list.kind === 'ready' ? list.models : null} busy={list.kind === 'loading'} noMatch={O.services.modelNoMatch}
          placeholder={modelPlaceholder} disabled={!ready && !model} onOpen={openList}
          onValue={(text, option) => {
            setModel(text)
            setModelName(option?.name)
            clearError('model')
            // while the name still reads as the previous model's own default, it keeps reading as the new one's
            // (Opus review round 1, item 8)
            if (autoName) setName((option?.name || defaultServiceName(text)).slice(0, NAME_MAX))
          }} />
      </Field>
      <Field label={O.services.name}>
        <TextInput value={name} maxLength={NAME_MAX} autoComplete="off" placeholder={O.services.namePlaceholder}
          onChange={e => { setName(e.target.value); setAutoName(false) }} />
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
        {/* stays pressable while busy: pressing it means stop, save nothing, whatever a pending connection later resolves to
            (Opus review round 1, item 1) */}
        <Button type="button" kind="text" size="md" onClick={cancel}>{O.services.cancel}</Button>
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
  /** No Cancel here, but the host may still take this off the tree mid-connection (closing a popover, choosing another
   * service); the hand-over must not happen once it has (Opus review round 1, item 1) */
  const cancelled = useRef(false)
  const typed = key !== ''
  useEffect(() => (typed ? drafts.hold() : undefined), [typed])
  useEffect(() => { if (focus) field.current?.focus({ preventScroll: true }) }, [focus])
  // live from here, gone at the clean-up, and live again after StrictMode's double run (round 3, item 1)
  useEffect(() => {
    cancelled.current = false
    return () => { cancelled.current = true }
  }, [])
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
    if (cancelled.current) return
    if (res.ok) {
      try {
        await onConnected(candidate, res.ms)
      } catch {
        // the connection worked; the save afterwards did not (Opus review round 1, item 3 — today an unhandled
        // rejection, since nothing here caught it)
        setResult(O.saveFailed)
      } finally {
        setBusy(false)
      }
      return
    }
    setBusy(false)
    setResult(res.reason)
    field.current?.focus()
  }
  return (
    <form className="o-form" data-form="key" noValidate onSubmit={e => { e.preventDefault(); if (!busy) void submit() }}>
      {/* the hint, not a bare paragraph, so the field's aria-describedby carries it (Opus review round 1, item 7) */}
      <Field label={O.services.keyForm.label} hint={refused ? O.services.keyForm.refused : undefined} error={error}>
        <TextInput ref={field} type="password" value={key} autoComplete="off" spellCheck={false} placeholder="sk-…" onChange={e => { setKey(e.target.value); setError(undefined) }} />
      </Field>
      <div className="o-formbar">
        <Button type="submit" kind="brand" size="md" busy={busy}>{busy ? O.services.connecting : O.services.keyForm.submit}</Button>
        <span className="o-note" role="status">{result ? <Status tone="alert">{result}</Status> : O.services.savedOnConnect}</span>
      </div>
    </form>
  )
}
