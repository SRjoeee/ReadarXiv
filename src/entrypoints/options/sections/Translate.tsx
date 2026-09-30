// The translation section (the redesign's design, §6.3): the translation services — one card, one radio group: the
// free services, Chrome's, the reader's own, the add row last —; under it the fallback switch while an LLM service is
// chosen, then the target language, then the LLM group (Task 63). A service is added, edited or given a new key only once it connects (§11): the forms test first, and this
// section saves on their success. No page translating is moved by any of it — each keeps the chain it started on, the
// configuration's watcher rebuilding the chain for the sessions after — but a deletion, once its undo is past, moves
// every session off the service: it has to stop serving everywhere (Codex on #157)
import { Ellipsis, Plus } from 'lucide'
import { type CSSProperties, Fragment, useEffect, useRef, useState } from 'react'
import { LANG_CODES, LANG_CODE_TO_EN_NAME, LANG_CODE_TO_LOCALE_NAME, LANG_CODE_TO_ZH_NAME, type LangCode } from '@/config/languages'
import { type Config, SERVICES_MAX } from '@/config/schema'
import { type Service, isLlmChosen, serviceRuns } from '@/config/services'
import { readConfig } from '@/config/storage'
import { supportsTarget } from '@/providers/microsoft'
import { sendMessage } from '@/shared/messages'
import type { PackState } from '@/shared/pack'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'
import { MenuList } from '@/ui/controls/MenuList'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { radioKeys } from '@/ui/controls/radio'
import { Reveal } from '@/ui/controls/Reveal'
import { Switch } from '@/ui/controls/Switch'
import { O, S, languageLabel, languageName } from '@/ui/strings'
import { useRejected } from '@/ui/use-rejected'
import type { OptionsData } from '../data'
import { releaseHostPermission } from '../permissions'
import { Card, GroupHeading } from '../ui/Card'
import { type ListWrites, focusLost, insertAt, shut, undoHasFocus, useFocusWhenDrawn, useLinger, useListWrites, withUndo } from '../ui/lists'
import { IconButton, Row, Status, Value } from '../ui/Row'
import { UndoRow } from '../ui/UndoRow'
import { Llm } from './Llm'
import { KeyForm, ServiceForm } from './ServiceForm'

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Chrome's row by its pack (UI.md S-P-40…43): not choosable until the pack is there */
function chromeRow(pack: PackState | null): { hint: string; disabled: boolean; action: 'download' | 'busy' | null } {
  switch (pack) {
    case 'available': return { hint: S.service.chrome_ready, disabled: false, action: null }
    case 'downloadable': return { hint: `${S.service.chrome_ready}${O.services.packNeeded}`, disabled: true, action: 'download' }
    case 'downloading': return { hint: S.service.chrome_ready, disabled: true, action: 'busy' }
    case null: return { hint: S.service.chrome_ready, disabled: true, action: null }
    default: return { hint: S.service.chrome_unavailable, disabled: true, action: null }
  }
}

export function Translate({ data }: { data: OptionsData }) {
  const { config, patch } = data
  if (!config) return null
  const k = O.search.keywords
  return (
    <>
      <GroupHeading title={O.services.title} />
      <Services data={data} />
      <Reveal open={isLlmChosen(config)}>
        <Card gap row="translate/fallback">
          <Row toggles words={k['translate/fallback']} label={O.services.autoFallback} description={O.services.autoFallbackHint}
            trailing={<Switch label={O.services.autoFallback} checked={config.fallback.enabled} onChange={on => void patch(latest => ({ ...latest, fallback: { enabled: on } }))} />} />
        </Card>
      </Reveal>
      <TargetLanguage data={data} />
      <Llm data={data} />
    </>
  )
}

/** `stored`: whether storage came to hold the deletion, its write's answer (Task 65) */
interface Gone { service: Service; index: number; chosen: boolean; focus: boolean; stored: Promise<boolean> }
type Form = { kind: 'add' } | { kind: 'edit'; id: string }

function Services({ data }: { data: OptionsData }) {
  const { pack, fetchPack } = data
  const config = data.config!
  /** the list's writes: one that lands takes a refused deletion's line away (Task 65) */
  const writes = useListWrites(data.patch)
  const patch = writes.write
  const rejected = useRejected()
  const [form, setForm] = useState<Form | null>(null)
  const drawnForm = useLinger(form)
  /** the connected status (O.services.connected) for as long as the page stays open (§6.3) */
  const [connected, setConnected] = useState<Record<string, number>>({})
  /** the service the pointer chose: its key form takes the focus (the arrows' choice leaves it on the radios) */
  const [pointed, setPointed] = useState<string | null>(null)
  /** the service just added: its row comes in with §8's row motion */
  const [fresh, setFresh] = useState<string | null>(null)
  const radios = useRef(new Map<string, HTMLElement>())
  const addRow = useRef<HTMLButtonElement>(null)
  /** a service's row focused once it is drawn: after its write lands (added, saved, undone), or its form closes (ui/lists.ts) */
  const focusDrawn = useFocusWhenDrawn(id => radios.current.get(id))
  const deletions = useDeletions(config, writes, { now: id => radios.current.get(id)?.focus(), drawn: focusDrawn })
  const words = O.search.keywords['translate/services']
  const chrome = chromeRow(pack)
  const microsoftOk = supportsTarget(config.targetLanguage)
  const builtIns = [
    { id: 'microsoft', name: S.service.microsoft, hint: microsoftOk ? S.service.free : S.service.microsoft_unsupported, disabled: !microsoftOk, action: null },
    { id: 'google-web', name: S.service.google, hint: S.service.free, disabled: false, action: null },
    { id: 'chrome-builtin', name: S.service.chrome, ...chrome },
  ]
  const ids = [...builtIns.map(b => b.id), ...config.services.map(s => s.id)]
  const can = (id: string) => !builtIns.some(b => b.id === id && b.disabled)
  const choose = (id: string, how: 'pointer' | 'key') => {
    void patch(latest => ({ ...latest, provider: id }))
    setPointed(how === 'pointer' ? id : null)
  }
  const keys = radioKeys(ids, config.provider, can, id => choose(id, 'key'), i => radios.current.get(ids[i]!)?.focus())
  const radioRef = (id: string) => (el: HTMLElement | null) => { if (el) radios.current.set(id, el); else radios.current.delete(id) }
  const stored = config.services.map(s => s.baseURL)
  /** at the schema's cap the add row is greyed and says why: a service connected there could not be stored (Codex 4) */
  const full = config.services.length >= SERVICES_MAX

  /**
   * A new service, stored now that it answered, and chosen (§6.3). Connected only once its write has landed: one
   * refused — the stored value unreadable answers with the defaults, not with this change — rejects, and the form
   * stays open saying so, the service not handed over (Task 107)
   */
  const added = async (s: Service, ms: number) => {
    await writes.save(latest => ({ ...latest, services: latest.services.some(x => x.id === s.id) ? latest.services : [...latest.services, s], provider: s.id }))
    setConnected(c => ({ ...c, [s.id]: ms }))
    setFresh(s.id)
    setForm(null)
    focusDrawn(s.id)
  }
  /**
   * An edit or a new key, saved now that it answered — in place, the choice left as it is — and connected, as a new
   * service is, only once its write has landed. Nothing more: a key or an address that changed clears the service's
   * mark in the background, which alone writes the record (ruling 17)
   */
  const saved = async (s: Service, ms: number) => {
    await writes.save(latest => ({ ...latest, services: latest.services.map(x => (x.id === s.id ? s : x)) }))
    setConnected(c => ({ ...c, [s.id]: ms }))
    setForm(null)
    focusDrawn(s.id)
  }

  const chosenOwn = config.services.find(s => s.id === config.provider)
  const editingId = form?.kind === 'edit' ? form.id : null
  /** the chosen service's key form: a refused key, or none stored (§6.3), unless its edit form is open */
  const keyFor = chosenOwn && (rejected.includes(chosenOwn.id) || !serviceRuns(chosenOwn)) && editingId !== chosenOwn.id ? chosenOwn.id : null
  const drawnKey = useLinger(keyFor)

  const own = (s: Service) => {
    const refused = rejected.includes(s.id)
    const status = refused ? <Status tone="alert">{O.services.rejected}</Status>
      : !serviceRuns(s) ? <Status tone="alert">{S.service.llm_noKey}</Status>
        : connected[s.id] !== undefined ? <Status tone="ok" arriving>{O.services.connected(connected[s.id]!)}</Status> : null
    return (
      <Fragment key={s.id}>
        <Row kind="radio" checked={config.provider === s.id} onChoose={how => choose(s.id, how)} radioRef={radioRef(s.id)}
          label={s.name} description={`${s.model} · ${hostOf(s.baseURL)}`} words={words} arriving={fresh === s.id}
          trailing={<>{status}<ServiceMenu service={s} onEdit={() => setForm({ kind: 'edit', id: s.id })} onDelete={focus => { setForm(null); deletions.remove(s, focus) }} /></>} />
        <Reveal open={keyFor === s.id}>
          {drawnKey === s.id && <KeyForm service={s} refused={refused} target={config.targetLanguage} focus={pointed === s.id} onConnected={saved} />}
        </Reveal>
        <Reveal open={editingId === s.id}>
          {drawnForm?.kind === 'edit' && drawnForm.id === s.id && (
            <ServiceForm service={s} target={config.targetLanguage} stored={stored} onConnected={saved} onCancel={() => { setForm(null); focusDrawn(s.id) }} />
          )}
        </Reveal>
      </Fragment>
    )
  }

  return (
    <Card role="radiogroup" label={O.services.title} row="translate/services"
      // the arrows are the radios' own: a key from a service's form field, its model combobox, the refused-key
      // form's field or the "…" menu's list must not also move the choice off the row it opened under (fix round 1, item 1)
      onKeyDown={e => { if ([...radios.current.values()].includes(e.target as HTMLElement)) keys(e) }}>
      {builtIns.map(b => (
        <Row key={b.id} kind="radio" checked={config.provider === b.id} disabled={b.disabled} muted={b.disabled} onChoose={how => choose(b.id, how)} radioRef={radioRef(b.id)}
          label={b.name} description={b.hint} words={words}
          trailing={b.action === 'download'
            ? <Button type="button" kind="neutral" size="sm" onClick={() => void fetchPack()}>{S.service.chrome_download}</Button>
            : b.action === 'busy' ? <Status tone="busy">{S.service.chrome_downloading}</Status> : undefined} />
      ))}
      {withUndo(config.services, deletions.gone).map(entry => {
        if (!('gone' in entry)) return own(entry.item)
        const g = entry.gone
        return (
          <UndoRow key={`gone-${g.service.id}`} item={g.service.id} name={g.service.name} focus={g.focus}
            onUndo={() => deletions.undo(g)}
            onExpire={hadFocus => {
              deletions.expire(g)
              // the undo row it stood in is gone: land the focus on the row still there, but only when it was this
              // row's own — a second pending deletion's undo row must keep the focus it has (fix round 1, item 2)
              if (hadFocus) requestAnimationFrame(() => addRow.current?.focus())
            }} />
        )
      })}
      <Row kind="button" quiet lead={<Icon node={Plus} size={14} />} label={O.services.add} description={full ? O.services.limit(SERVICES_MAX) : undefined} disabled={full}
        expanded={form?.kind === 'add'} buttonProps={{ ref: addRow }}
        onPress={() => setForm(f => (f?.kind === 'add' ? null : { kind: 'add' }))} />
      <Reveal open={form?.kind === 'add'}>
        {drawnForm?.kind === 'add' && <ServiceForm target={config.targetLanguage} stored={stored} onConnected={added} onCancel={() => { setForm(null); addRow.current?.focus() }} />}
      </Reveal>
      {writes.failed && <p className="o-list-note" role="status"><Status tone="alert">{O.saveFailed}</Status></p>}
    </Card>
  )
}

/** A service of one's own carries its actions behind its more button (§6.2): Edit… · Delete */
function ServiceMenu({ service, onEdit, onDelete }: { service: Service; onEdit: () => void; onDelete: (keyboard: boolean) => void }) {
  const pop = usePopover('menu')
  const label = O.services.moreFor(service.name)
  return (
    <>
      <IconButton icon={Ellipsis} label={label} hover {...pop.trigger} style={{ anchorName: pop.anchor } as CSSProperties} />
      <Popover {...pop.popover} role="menu" label={label} className="o-end">
        <MenuList key={pop.generation} kind="items" label={label} items={[{ id: 'edit', name: O.services.edit }, { id: 'delete', name: O.services.delete }]}
          onClose={() => shut(pop.popover.id)}
          onPick={id => {
            shut(pop.popover.id)
            if (id === 'edit') onEdit()
            // the keyboard's deletion puts the focus on the undo row's button (trackModality marks the pointer's turn)
            else onDelete(!document.documentElement.hasAttribute('data-axt-pointer'))
          }} />
      </Popover>
    </>
  )
}

/**
 * Deleting is undone, not confirmed (§6.2): the service leaves the list — and the choice, which falls back to the Microsoft
 * service (S-O-21) — at once, and what cannot be taken back waits for the undo to pass: every session moved off the
 * service, and only then its origin given back (a request still in flight would break) — the old drawer's order. Its
 * mark in the refused-key record is the background's to clear, on the deletion being stored (ruling 17). Undone, it
 * comes back at its place, chosen again if it was and nothing else was chosen since. Leaving the page ends every undo
 * (best effort: the tab may close before the clean-up lands, as it could before). The clean-up waits for the
 * deletion's own write, as the old drawer's did: a rebind sent before storage holds the deletion has the background
 * rebuild from the old configuration and bind every session back to the service, and the configuration's later change
 * moves no one (Task 65). A deletion storage refused commits nothing: its row stays, as stored, and takes back the
 * focus its undo row held (round 2, item 2). An origin is given back only when no service may still use it: none
 * stored, none whose deletion may still be undone, none undone and not yet stored again (round 2, item 4). An undo
 * storage refused leaves the service deleted: its undo row comes back at its place with a fresh 5 s, and the
 * clean-up waits on it again (round 3, item 3) — unless the section is gone by then: the page draws its data section
 * alone once the stored value cannot be read (App.tsx), so the refusal's own answer finds the section's flush already
 * run, and the deletion is committed at once (round 4, item 1). While the stored value cannot be read, a commit moves
 * every session off but gives no origin back: the read answers with the defaults, so the addresses stored are unknown,
 * and a permission kept a while is the safer failure than one taken from a service still stored (round 4, addendum) —
 * by the verdict of the commit's own read, which comes back with its value (round 5)
 */
function useDeletions(config: Config, writes: ListWrites<Config>, focusOn: { now: (id: string) => void; drawn: (id: string) => void }) {
  const [gone, setGone] = useState<Gone[]>([])
  const pending = useRef(new Set<Gone>())
  /** undone, their write not yet landed */
  const undoing = useRef(new Set<Gone>())
  /** mounted, its flush still to come: set by the flush effect's setup (StrictMode's second run sets it again), cleared by its clean-up */
  const live = useRef(false)
  const commit = useRef(async (g: Gone) => {
    if (!pending.current.delete(g)) return
    if (!(await g.stored)) return
    await sendMessage({ type: 'axt:engine-ready', id: g.service.id, rebindAll: true }).catch(() => undefined)
    // taken before the stored list is read: an undo that lands in between is then in one or the other
    const waiting = [...pending.current, ...undoing.current].map(x => x.service.baseURL)
    // the verdict of this read, returned with its value, not guessed from the defaults it answers with (round 4,
    // addendum) and never another read's: another read of this page — another list's write, the watcher's re-read, a
    // second commit — can finish between this read and the line after it, and hand this commit its own verdict
    // (round 5). The value unreadable, the addresses it holds are unknown, and an origin kept a while is the safer
    // failure
    const { config: latest, fallbackReason } = await readConfig()
    if (fallbackReason !== null) return
    const inUse = [...latest.services.map(s => s.baseURL), ...waiting]
    await releaseHostPermission(g.service.baseURL, inUse).catch(() => undefined)
  }).current
  useEffect(() => {
    live.current = true
    const flush = () => { for (const g of [...pending.current]) void commit(g) }
    addEventListener('pagehide', flush)
    return () => {
      live.current = false
      removeEventListener('pagehide', flush)
      flush()
    }
  }, [commit])
  const remove = (service: Service, focus: boolean) => {
    const stored = writes.attempt(latest => ({ ...latest, services: latest.services.filter(s => s.id !== service.id), provider: latest.provider === service.id ? 'microsoft' : latest.provider }))
    const g: Gone = { service, index: config.services.findIndex(s => s.id === service.id), chosen: config.provider === service.id, focus, stored }
    pending.current.add(g)
    setGone(x => [...x, g])
    void stored.then(done => {
      if (done) return
      pending.current.delete(g)
      // the row is drawn beside its undo row while the write is on its way: the focus goes there before the undo row does
      if (undoHasFocus(service.id)) focusOn.now(service.id)
      setGone(x => x.filter(y => y !== g))
    })
  }
  const undo = (g: Gone) => {
    pending.current.delete(g)
    undoing.current.add(g)
    setGone(x => x.filter(y => y !== g))
    void writes.attempt(latest => (latest.services.some(s => s.id === g.service.id) ? latest
      : { ...latest, services: insertAt(latest.services, g.index, g.service), provider: g.chosen && latest.provider === 'microsoft' ? g.service.id : latest.provider }))
      .then(done => {
        undoing.current.delete(g)
        // the focus goes to the service's radio once its row is drawn again, as the styles and the prompts lists do: a
        // frame after the press, or after the write, may find no row yet, and the focus falls to the page (Part 7's
        // final review)
        if (done) {
          focusOn.drawn(g.service.id)
          return
        }
        const back: Gone = { ...g, focus: focusLost() }
        pending.current.add(back)
        // the section went before this answer came, and its flush with it: no undo row, no flush to wait for
        if (!live.current) {
          void commit(back)
          return
        }
        setGone(x => [...x, back])
      })
  }
  const expire = (g: Gone) => {
    setGone(x => x.filter(y => y !== g))
    void commit(g)
  }
  return { gone, remove, undo, expire }
}

/** The target language (S-O-23): a row and the popup's searchable menu; a choice re-checks Chrome's pack for the new language */
function TargetLanguage({ data }: { data: OptionsData }) {
  const { patch, checkPack } = data
  const config = data.config!
  const pop = usePopover('listbox')
  const items = LANG_CODES.map(code => ({
    id: code,
    name: languageLabel(code),
    keywords: `${LANG_CODE_TO_EN_NAME[code]} ${LANG_CODE_TO_LOCALE_NAME[code]} ${LANG_CODE_TO_ZH_NAME[code]} ${code}`,
    checked: code === config.targetLanguage,
  }))
  return (
    <Card gap>
      <Row kind="button" row="translate/language" words={O.search.keywords['translate/language']} label={S.rows.language}
        trailing={<Value>{languageName(config.targetLanguage)}</Value>} buttonProps={{ ...pop.trigger, style: { anchorName: pop.anchor } as CSSProperties }} />
      <Popover {...pop.popover} role="listbox" label={S.rows.language} className="o-end">
        <MenuList key={pop.generation} kind="listbox" label={S.rows.language} search={S.menu.searchLanguages} noMatch={S.menu.noMatch} items={items}
          onClose={() => shut(pop.popover.id)}
          onPick={code => { shut(pop.popover.id); void patch(latest => ({ ...latest, targetLanguage: code as LangCode })).then(() => checkPack(code)) }} />
      </Popover>
    </Card>
  )
}
