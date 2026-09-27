// The prompts (the redesign's design, §6.3): the row's value is the prompt in use, its description the prompt's.
// Opened, a radio list in place: each prompt with its description, one's own carrying its tag (O.prompts.mine) and the
// start of its instructions. The chosen prompt shows its text under it, read as words, in two parts named for what
// they do — the instructions and the message —; nothing names the protocol the extension appends. A built-in cannot be
// changed: Copy to edit makes one's own copy and opens it. One's own is written in place — its name, its two parts, the
// variables inserted from a row of labels — each change stored at once when it holds a name and a message; Done closes
// the list; Delete is undone. The list ends with the new-prompt row and, at the same row's end, Import… and Export…
// (the maintainer: in the list, not in a menu)
import { Plus } from 'lucide'
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { PromptFileFormatError, downloadPromptFile, readPromptFile } from '@/providers/prompt-file'
import {
  BUILT_IN_PROMPTS, DEFAULT_PROMPT_ID, PROMPT_TOKENS, type PromptToken, type PromptTemplate, type PromptsConfig,
  getTokenCellText, promptExists, selectPrompt,
} from '@/providers/prompt-library'
import { getRandomUUID as uuid } from '@/shared/uuid'
import { Button } from '@/ui/controls/Button'
import { Field, TextInput } from '@/ui/controls/Field'
import { Icon } from '@/ui/controls/Icon'
import { radioKeys } from '@/ui/controls/radio'
import { Reveal } from '@/ui/controls/Reveal'
import { drafts } from '@/ui/drafts'
import { O } from '@/ui/strings'
import type { OptionsData } from '../data'
import { insertAt, withItem, withUndo } from '../ui/lists'
import { Row, Status, Value } from '../ui/Row'
import { UndoRow } from '../ui/UndoRow'
import { PromptText, insertToken, plainWords, readPrompt } from './PromptText'

/** A new prompt's start: it names the target language and carries the source text, so a name alone makes it work (Codex on #39) */
const NEW_SYSTEM_PROMPT = `You are a professional ${getTokenCellText('targetLanguage')} translator of academic papers.`
const NEW_USER_PROMPT = `Translate the following into ${getTokenCellText('targetLanguage')}:\n\n${getTokenCellText('input')}`

const isBuiltIn = (p: PromptTemplate) => Object.hasOwn(BUILT_IN_PROMPTS, p.id)
const describe = (p: PromptTemplate) => (isBuiltIn(p) ? (O.prompts.builtIn as Record<string, string>)[p.id] ?? '' : plainWords(p.systemPrompt).slice(0, 120))

export function PromptsRow({ data }: { data: OptionsData }) {
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLButtonElement>(null)
  const chosen = selectPrompt(data.config!.prompts)
  return (
    <>
      <Row kind="button" row="translate/prompts" words={O.search.keywords['translate/prompts']} label={O.prompts.title}
        // the row's own description steps aside while the list under it says the same (settings-2)
        description={open ? undefined : describe(chosen)} trailing={<Value>{chosen.name}</Value>} expanded={open} buttonProps={{ ref: row }}
        onPress={() => setOpen(o => !o)} />
      <Reveal open={open}>
        <PromptList data={data} onDone={() => { setOpen(false); row.current?.focus() }} />
      </Reveal>
    </>
  )
}

interface GonePrompt { prompt: PromptTemplate; index: number; chosen: boolean; focus: boolean }

function PromptList({ data, onDone }: { data: OptionsData; onDone: () => void }) {
  const { patch } = data
  const prompts = data.config!.prompts
  const [gone, setGone] = useState<GonePrompt[]>([])
  /** a prompt just made or copied: its name field takes the focus (§9) */
  const [fresh, setFresh] = useState<string | null>(null)
  const [note, setNote] = useState<{ alert: boolean; words: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const radios = useRef(new Map<string, HTMLElement>())
  const setPrompts = (fn: (c: PromptsConfig) => PromptsConfig) => patch(latest => ({ ...latest, prompts: fn(latest.prompts) }))
  // a choice from a list another tab has since changed must not store an id that names nothing (promptExists)
  const choose = (id: string) => void setPrompts(c => (promptExists(c, id) ? { ...c, promptId: id } : c))
  const add = (p: PromptTemplate) => {
    setFresh(p.id)
    void setPrompts(c => ({ patterns: [...c.patterns, p], promptId: p.id }))
  }
  const remove = (p: PromptTemplate) => {
    setGone(g => [...g, { prompt: p, index: prompts.patterns.findIndex(x => x.id === p.id), chosen: prompts.promptId === p.id, focus: !document.documentElement.hasAttribute('data-axt-pointer') }])
    void setPrompts(c => ({ patterns: c.patterns.filter(x => x.id !== p.id), promptId: c.promptId === p.id ? DEFAULT_PROMPT_ID : c.promptId }))
  }
  const undo = (g: GonePrompt) => {
    setGone(x => x.filter(y => y !== g))
    void setPrompts(c => (c.patterns.some(x => x.id === g.prompt.id) ? c : { patterns: insertAt(c.patterns, g.index, g.prompt), promptId: g.chosen && c.promptId === DEFAULT_PROMPT_ID ? g.prompt.id : c.promptId }))
  }
  const importFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const entries = await readPromptFile(f)
      if (entries.length === 0) {
        setNote({ alert: true, words: O.prompts.importFailed.noPrompts })
        return
      }
      const added = entries.map(entry => ({ ...entry, id: uuid() }))
      void setPrompts(c => ({ ...c, patterns: [...c.patterns, ...added] }))
      setNote({ alert: false, words: O.prompts.imported(entries.length) })
    } catch (e) {
      // the parser says which kind; the sentence is the pack's (Codex on #161)
      setNote({ alert: true, words: e instanceof PromptFileFormatError && e.kind === 'badShape' ? O.prompts.importFailed.noPrompts : O.prompts.importFailed.cantRead })
    } finally {
      if (file.current) file.current.value = ''
    }
  }
  const builtIns = Object.values(BUILT_IN_PROMPTS)
  const chosenId = selectPrompt(prompts).id
  const ids = [...builtIns, ...prompts.patterns].map(p => p.id)
  const keys = radioKeys(ids, chosenId, () => true, choose, i => radios.current.get(ids[i]!)?.focus())
  const rowOf = (p: PromptTemplate, mine: boolean) => (
    <Fragment key={p.id}>
      <Row kind="radio" level={1} checked={p.id === chosenId} onChoose={() => choose(p.id)} label={p.name} tag={mine ? O.prompts.mine : undefined} description={describe(p)} arriving={fresh === p.id}
        radioRef={el => { if (el) radios.current.set(p.id, el); else radios.current.delete(p.id) }} />
      {p.id === chosenId && (mine
        ? <OwnPrompt key={p.id} prompt={p} focus={fresh === p.id} onChange={next => setPrompts(c => ({ ...c, patterns: withItem(c.patterns, next) }))} onDone={onDone} onDelete={() => remove(p)} />
        : <BuiltInPrompt prompt={p} onCopy={() => add({ ...p, id: uuid(), name: O.prompts.copyOf(p.name) })} />)}
    </Fragment>
  )
  return (
    // a radio group's arrows (§9), only from a prompt's own radio: the editor of the chosen prompt sits inside the
    // group, and its fields keep their arrows (the styles and services cards' lesson, Tasks 56 and 60)
    <div role="radiogroup" aria-label={O.prompts.title} onKeyDown={e => { if ([...radios.current.values()].includes(e.target as HTMLElement)) keys(e) }}>
      {builtIns.map(p => rowOf(p, false))}
      {withUndo(prompts.patterns, gone).map(entry => ('gone' in entry
        ? <UndoRow key={`gone-${entry.gone.prompt.id}`} level={1} name={entry.gone.prompt.name} focus={entry.gone.focus} onUndo={() => undo(entry.gone)} onExpire={() => setGone(x => x.filter(y => y !== entry.gone))} />
        : rowOf(entry.item, true)))}
      <div className="o-row" data-srow="" data-level="1" data-lead="" data-search={O.prompts.create.toLowerCase()}>
        <button type="button" className="o-add" onClick={() => add({ id: uuid(), name: O.prompts.newName, systemPrompt: NEW_SYSTEM_PROMPT, prompt: NEW_USER_PROMPT })}>
          <span data-part="lead" className="o-lead"><Icon node={Plus} size={14} /></span>
          <span data-part="words" className="o-words"><span className="o-label">{O.prompts.create}</span></span>
        </button>
        <span data-part="trail" className="o-trail">
          <Button type="button" kind="text" size="md" onClick={() => file.current?.click()}>{O.prompts.import}</Button>
          {prompts.patterns.length > 0 && <Button type="button" kind="text" size="md" onClick={() => downloadPromptFile(prompts.patterns)}>{O.prompts.export}</Button>}
        </span>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => void importFile(e.target.files?.[0])} />
      </div>
      {note && <p className="o-prompt-note" role="status">{note.alert ? <Status tone="alert">{note.words}</Status> : note.words}</p>}
    </div>
  )
}

/** A part of a prompt, named for what it does */
function Part({ name, error, children }: { name: readonly [string, string]; error?: string; children: ReactNode }) {
  return (
    <div className="o-part">
      <div className="o-part-title"><b>{name[0]}</b><span>{name[1]}</span></div>
      {children}
      {error && <Status tone="alert">{error}</Status>}
    </div>
  )
}

function BuiltInPrompt({ prompt, onCopy }: { prompt: PromptTemplate; onCopy: () => void }) {
  return (
    <div className="o-prompt">
      <Part name={O.prompts.parts.system}><PromptText text={prompt.systemPrompt} label={O.prompts.parts.system[0]} /></Part>
      <Part name={O.prompts.parts.user}><PromptText text={prompt.prompt} label={O.prompts.parts.user[0]} /></Part>
      <div className="o-formbar">
        <Button type="button" kind="neutral" size="sm" onClick={onCopy}>{O.prompts.copy}</Button>
        <span className="o-note">{O.prompts.locked}</span>
      </div>
    </div>
  )
}

/** One's own, written in place: stored at each change while it holds a name and a message; a draft while it does not */
function OwnPrompt({ prompt, focus, onChange, onDone, onDelete }: { prompt: PromptTemplate; focus: boolean; onChange: (next: PromptTemplate) => unknown; onDone: () => void; onDelete: () => void }) {
  const [name, setName] = useState(prompt.name)
  const [system, setSystem] = useState(prompt.systemPrompt)
  const [message, setMessage] = useState(prompt.prompt)
  const [errors, setErrors] = useState<{ name?: string; message?: string }>({})
  const nameField = useRef<HTMLInputElement>(null)
  const systemText = useRef<HTMLDivElement>(null)
  const messageText = useRef<HTMLDivElement>(null)
  /** the part the caret was last in: a variable goes there */
  const last = useRef<'system' | 'message'>('message')
  const whole = name.trim() !== '' && message.trim() !== ''
  useEffect(() => (whole ? undefined : drafts.hold()), [whole])
  useEffect(() => { if (focus) nameField.current?.focus({ preventScroll: true }) }, [focus])
  const write = (next: { name: string; systemPrompt: string; prompt: string }) => {
    if (next.name.trim() && next.prompt.trim()) onChange({ id: prompt.id, ...next, name: next.name.trim() })
  }
  const insert = (token: PromptToken) => {
    const el = (last.current === 'system' ? systemText : messageText).current
    if (!el) return
    insertToken(el, token)
    const text = readPrompt(el)
    if (last.current === 'system') {
      setSystem(text)
      write({ name, systemPrompt: text, prompt: message })
    } else {
      setMessage(text)
      write({ name, systemPrompt: system, prompt: text })
    }
  }
  const done = () => {
    const found = { name: name.trim() ? undefined : O.prompts.nameEmpty, message: message.trim() ? undefined : O.prompts.messageEmpty }
    setErrors(found)
    if (found.name) nameField.current?.focus()
    else if (found.message) messageText.current?.focus()
    else onDone()
  }
  return (
    <div className="o-prompt">
      <Field label={O.prompts.name} error={errors.name}>
        <TextInput ref={nameField} value={name} autoComplete="off" onChange={e => { setName(e.target.value); write({ name: e.target.value, systemPrompt: system, prompt: message }) }} />
      </Field>
      <Part name={O.prompts.parts.system}>
        <PromptText ref={systemText} editable text={prompt.systemPrompt} label={O.prompts.parts.system[0]} onFocus={() => { last.current = 'system' }}
          onText={t => { setSystem(t); write({ name, systemPrompt: t, prompt: message }) }} />
      </Part>
      <Part name={O.prompts.parts.user} error={errors.message}>
        <PromptText ref={messageText} editable text={prompt.prompt} label={O.prompts.parts.user[0]} onFocus={() => { last.current = 'message' }}
          onText={t => { setMessage(t); write({ name, systemPrompt: system, prompt: t }) }} />
      </Part>
      <div className="o-vars">
        {/* a press keeps the caret where it was: the variable goes there */}
        {PROMPT_TOKENS.map(t => <button key={t} type="button" className="o-var o-var-button" onPointerDown={e => e.preventDefault()} onClick={() => insert(t)}>{O.prompts.tokens[t]}</button>)}
      </div>
      <div className="o-formbar">
        <Button type="button" kind="brand" size="md" onClick={done}>{O.prompts.done}</Button>
        <Button type="button" kind="text" size="md" onClick={onDelete}>{O.prompts.delete}</Button>
      </div>
    </div>
  )
}
