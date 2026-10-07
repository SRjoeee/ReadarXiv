// The prompts (the redesign's design, §6.3): the row's value is the prompt in use, its description the prompt's; a
// built-in's name is the pack's, in the interface's language (promptName, Task 103b).
// Opened, a radio list in place: each prompt with its description, one's own carrying its tag (O.prompts.mine) and the
// start of its instructions. The chosen prompt shows its text under it, read as words, in two parts named for what
// they do — the instructions and the message —; nothing names the protocol the extension appends. A built-in cannot be
// changed: Copy to edit makes one's own copy and opens it. One's own is written in place — its name, its two parts, the
// variables inserted from a row of labels — each change stored at once when it holds a name and a message; Done closes
// the list; Delete is undone. The list ends with the new-prompt row and, at the same row's end, Import… and Export…
// (the maintainer: in the list, not in a menu). The list stays drawn while closed, so that a deletion's undo row keeps
// its 5 s (§6.2; fix round 2); one's own editor is drawn only while it is open (fix round 1, item 4): an editor that
// outlived the list would hold the prompt as it was when first drawn
import { Plus } from 'lucide'
import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from 'react'
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
import { promptName } from '@/ui/prompt-name'
import { O } from '@/ui/strings'
import type { OptionsData } from '../data'
import { focusLost, insertAt, undoHasFocus, useFocusWhenDrawn, useLinger, useListWrites, withUndo } from '../ui/lists'
import { Row, Status, Value } from '../ui/Row'
import { UndoRow } from '../ui/UndoRow'
import { PromptText, insertToken, plainWords, readPrompt } from './PromptText'

/** A new prompt's start: it names the target language and carries the source text, so a name alone makes it work (Codex on #39) */
const NEW_SYSTEM_PROMPT = `You are a professional ${getTokenCellText('targetLanguage')} translator of academic papers.`
const NEW_USER_PROMPT = `Translate the following into ${getTokenCellText('targetLanguage')}:\n\n${getTokenCellText('input')}`

/** what one's own editor writes: the fields changed there, never the whole record (fix round 1, item 4) */
type PromptWords = Partial<Pick<PromptTemplate, 'name' | 'systemPrompt' | 'prompt'>>

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
        description={open ? undefined : describe(chosen)} trailing={<Value>{promptName(chosen)}</Value>} expanded={open} buttonProps={{ ref: row }}
        onPress={() => setOpen(o => !o)} />
      <Reveal open={open}>
        <PromptList data={data} open={open} onDone={() => { setOpen(false); row.current?.focus() }} />
      </Reveal>
    </>
  )
}

interface GonePrompt { prompt: PromptTemplate; index: number; chosen: boolean; focus: boolean }

function PromptList({ data, open, onDone }: { data: OptionsData; open: boolean; onDone: () => void }) {
  const writes = useListWrites(data.patch)
  const prompts = data.config!.prompts
  /**
   * the editor, drawn while the list is open and kept for its fold as it closes (§8): it reads the store each time it
   * opens, and its draft is held only while it is drawn (fix rounds 1 and 2)
   */
  const editing = useLinger(open || null)
  const [gone, setGone] = useState<GonePrompt[]>([])
  /** a prompt just made or copied: its row comes in with §8's row motion */
  const [fresh, setFresh] = useState<string | null>(null)
  /**
   * ...and its name field takes the focus (§9), once: cleared as the editor takes it, so that the prompt chosen again
   * later leaves the focus on its radio (fix round 1, item 3)
   */
  const [naming, setNaming] = useState<string | null>(null)
  const [note, setNote] = useState<{ alert: boolean; words: string } | null>(null)
  // the import's note is the moment's: it goes once the list has folded away (fix round 2)
  useEffect(() => { if (!editing) setNote(null) }, [editing])
  const file = useRef<HTMLInputElement>(null)
  const radios = useRef(new Map<string, HTMLElement>())
  /** a row brought back is focused once it is drawn (ui/lists.ts) */
  const focusDrawn = useFocusWhenDrawn(id => radios.current.get(id))
  const addButton = useRef<HTMLButtonElement>(null)
  const setPrompts = (fn: (c: PromptsConfig) => PromptsConfig) => writes.attempt(latest => ({ ...latest, prompts: fn(latest.prompts) }))
  // a choice from a list another tab has since changed must not store an id that names nothing (promptExists)
  const choose = (id: string) => void setPrompts(c => (promptExists(c, id) ? { ...c, promptId: id } : c))
  /**
   * A new prompt or a copy, chosen and so opened by the store. Marked as come at the press: the store draws its row as it
   * publishes, before the write's answer, and the mark must be there at that first draw; refused, no row with its id is
   * ever drawn, so the mark is inert. Its name is focused once the write has landed, as a style's editor opens (Codex 4,
   * 4c)
   */
  const add = (p: PromptTemplate) => {
    setFresh(p.id)
    void setPrompts(c => ({ patterns: [...c.patterns, p], promptId: p.id })).then(done => { if (done) setNaming(p.id) })
  }
  const remove = (p: PromptTemplate) => {
    const g: GonePrompt = { prompt: p, index: prompts.patterns.findIndex(x => x.id === p.id), chosen: prompts.promptId === p.id, focus: !document.documentElement.hasAttribute('data-axt-pointer') }
    setGone(x => [...x, g])
    // refused, the prompt is still stored: its row stays, and takes back the focus its undo row held as that row goes
    // (Task 65)
    void writes.attempt(latest => {
      const c = latest.prompts
      return { ...latest, prompts: { patterns: c.patterns.filter(x => x.id !== p.id), promptId: c.promptId === p.id ? DEFAULT_PROMPT_ID : c.promptId } }
    }).then(done => {
      if (done) return
      if (undoHasFocus(p.id)) radios.current.get(p.id)?.focus()
      setGone(x => x.filter(y => y !== g))
    })
  }
  /**
   * An edit: the fields the reader changed, merged onto the prompt as stored now, so that another tab's change to the
   * rest stands; a prompt deleted elsewhere is not written back (fix round 1, item 4)
   */
  const edit = (id: string, words: PromptWords) =>
    void setPrompts(c => (c.patterns.some(x => x.id === id) ? { ...c, patterns: c.patterns.map(x => (x.id === id ? { ...x, ...words } : x)) } : c))
  const undo = (g: GonePrompt) => {
    setGone(x => x.filter(y => y !== g))
    // the focus goes to the prompt's radio once the write has landed and the row is drawn (the styles list's fix
    // round 1, item 2; Part 7's final review). Refused, the prompt stays deleted: its undo row comes back with a fresh
    // 5 s (round 3, item 3)
    void writes.attempt(latest => {
      const c = latest.prompts
      return c.patterns.some(x => x.id === g.prompt.id) ? latest
        : { ...latest, prompts: { patterns: insertAt(c.patterns, g.index, g.prompt), promptId: g.chosen && c.promptId === DEFAULT_PROMPT_ID ? g.prompt.id : c.promptId } }
    }).then(done => {
      if (done) focusDrawn(g.prompt.id)
      else setGone(x => [...x, { ...g, focus: focusLost() }])
    })
  }
  const importFile = async (f: File | undefined) => {
    if (!f) return
    try {
      const entries = await readPromptFile(f)
      if (entries.length === 0) {
        setNote({ alert: true, words: O.prompts.importFailed.noPrompts })
        return
      }
      // a name as the other prompts' are: trimmed, and never empty (fix round 1, item 8)
      const added = entries.map(entry => ({ ...entry, name: entry.name.trim() || O.prompts.newName, id: uuid() }))
      // said once the write has landed, and what landed: a write the store refuses — or answers, unreadable, with the
      // defaults — imported nothing (Part 7's final review; the services' forms' rule, Task 107)
      setNote(null)
      void writes.save(latest => ({ ...latest, prompts: { ...latest.prompts, patterns: [...latest.prompts.patterns, ...added] } })).then(
        () => setNote({ alert: false, words: O.prompts.imported(entries.length) }),
        () => setNote({ alert: true, words: O.saveFailed }),
      )
    } catch (e) {
      // the parser says which kind; the sentence is the pack's (Codex on #161)
      setNote({ alert: true, words: e instanceof PromptFileFormatError && e.kind === 'badShape' ? O.prompts.importFailed.noPrompts : O.prompts.importFailed.cantRead })
    } finally {
      if (file.current) file.current.value = ''
    }
  }
  /** the list's note: a refused write's until one lands (Task 65; Codex 4), otherwise the import's */
  const line = writes.failed ? { alert: true, words: O.saveFailed } : note
  const builtIns = Object.values(BUILT_IN_PROMPTS)
  const chosenId = selectPrompt(prompts).id
  const ids = [...builtIns, ...prompts.patterns].map(p => p.id)
  const keys = radioKeys(ids, chosenId, () => true, choose, i => radios.current.get(ids[i]!)?.focus())
  const rowOf = (p: PromptTemplate, mine: boolean) => (
    <Fragment key={p.id}>
      <Row kind="radio" level={1} checked={p.id === chosenId} onChoose={() => choose(p.id)} label={promptName(p)} tag={mine ? O.prompts.mine : undefined} description={describe(p)} arriving={fresh === p.id}
        radioRef={el => { if (el) radios.current.set(p.id, el); else radios.current.delete(p.id) }} />
      {p.id === chosenId && (mine
        ? editing && <OwnPrompt key={p.id} prompt={p} focus={naming === p.id} onFocused={() => setNaming(null)} onChange={words => edit(p.id, words)} onDone={onDone} onDelete={() => remove(p)} />
        : <BuiltInPrompt prompt={p} onCopy={() => add({ ...p, id: uuid(), name: O.prompts.copyOf(promptName(p)) })} />)}
    </Fragment>
  )
  return (
    // a radio group's arrows (§9), only from a prompt's own radio: the editor of the chosen prompt sits inside the
    // group, and its fields keep their arrows (the styles and services cards' lesson, Tasks 56 and 60)
    <div role="radiogroup" aria-label={O.prompts.title} onKeyDown={e => { if ([...radios.current.values()].includes(e.target as HTMLElement)) keys(e) }}>
      {builtIns.map(p => rowOf(p, false))}
      {withUndo(prompts.patterns, gone).map(entry => ('gone' in entry
        ? <UndoRow key={`gone-${entry.gone.prompt.id}`} item={entry.gone.prompt.id} level={1} name={promptName(entry.gone.prompt)} focus={entry.gone.focus} onUndo={() => undo(entry.gone)}
            onExpire={hadFocus => {
              setGone(x => x.filter(y => y !== entry.gone))
              // the undo row it stood in is gone: land the focus on the row still there (the services and styles lists'
              // fix round 1, item 2)
              if (hadFocus) requestAnimationFrame(() => addButton.current?.focus())
            }} />
        : rowOf(entry.item, true)))}
      <div className="o-row" data-srow="" data-level="1" data-lead="" data-search={O.prompts.create.toLowerCase()}>
        <button ref={addButton} type="button" className="o-add" onClick={() => add({ id: uuid(), name: O.prompts.newName, systemPrompt: NEW_SYSTEM_PROMPT, prompt: NEW_USER_PROMPT })}>
          <span data-part="lead" className="o-lead"><Icon node={Plus} size={14} /></span>
          <span data-part="words" className="o-words"><span className="o-label">{O.prompts.create}</span></span>
        </button>
        <span data-part="trail" className="o-trail">
          <Button type="button" kind="text" size="md" onClick={() => file.current?.click()}>{O.prompts.import}</Button>
          {prompts.patterns.length > 0 && <Button type="button" kind="text" size="md" onClick={() => downloadPromptFile(prompts.patterns)}>{O.prompts.export}</Button>}
        </span>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={e => void importFile(e.target.files?.[0])} />
      </div>
      {line && <p className="o-list-note" data-level="1" role="status">{line.alert ? <Status tone="alert">{line.words}</Status> : line.words}</p>}
    </div>
  )
}

/** A part of a prompt, named for what it does; its error carries the id its field is described by */
function Part({ name, error, errorId, children }: { name: readonly [string, string]; error?: string; errorId?: string; children: ReactNode }) {
  return (
    <div className="o-part">
      <div className="o-part-title"><b>{name[0]}</b><span>{name[1]}</span></div>
      {children}
      {error && <div id={errorId}><Status tone="alert">{error}</Status></div>}
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

/**
 * One's own, written in place: each change stored at once while it holds a name and a message; a draft while it does
 * not. A write carries only the fields changed here — the one just changed, and any changed while the prompt was not
 * whole — never the whole record (fix round 1, item 4). A required field emptied is no value: once this editor has
 * written it, the store goes back to the value it opened with, so that however the editor is left it never keeps the
 * letter a clearing stopped at (Codex on #306, as the style editor's name)
 */
function OwnPrompt({ prompt, focus, onFocused, onChange, onDone, onDelete }: {
  prompt: PromptTemplate
  focus: boolean
  /** the name field has taken the focus it was given */
  onFocused: () => void
  onChange: (words: PromptWords) => void
  onDone: () => void
  onDelete: () => void
}) {
  const [name, setName] = useState(prompt.name)
  const [message, setMessage] = useState(prompt.prompt)
  const [errors, setErrors] = useState<{ name?: string; message?: string }>({})
  const messageError = useId()
  const nameField = useRef<HTMLInputElement>(null)
  const systemText = useRef<HTMLDivElement>(null)
  const messageText = useRef<HTMLDivElement>(null)
  /** the part the caret was last in: a variable goes there */
  const last = useRef<'system' | 'message'>('message')
  /** the fields changed here and not written yet */
  const unwritten = useRef<PromptWords>({})
  /** the two required fields as stored when the editor opened, and whether this editor has written each since: one it
   *  has written goes back to its opening value as it is emptied */
  const [opened] = useState(() => ({ name: prompt.name, prompt: prompt.prompt }))
  const wrote = useRef({ name: false, prompt: false })
  const whole = name.trim() !== '' && message.trim() !== ''
  useEffect(() => (whole ? undefined : drafts.hold()), [whole])
  useEffect(() => {
    if (!focus) return
    nameField.current?.focus({ preventScroll: true })
    onFocused()
  }, [focus, onFocused])
  /** `words` changed; `now` the name and the message as they read after it */
  const write = (words: PromptWords, now: { name: string; message: string }) => {
    unwritten.current = { ...unwritten.current, ...words }
    if (!now.name.trim() || !now.message.trim()) {
      const back: PromptWords = {}
      if (words.name !== undefined && !now.name.trim() && wrote.current.name) back.name = opened.name
      if (words.prompt !== undefined && !now.message.trim() && wrote.current.prompt) back.prompt = opened.prompt
      if (back.name === undefined && back.prompt === undefined) return
      if (back.name !== undefined) wrote.current.name = false
      if (back.prompt !== undefined) wrote.current.prompt = false
      onChange(back)
      return
    }
    const next = unwritten.current
    unwritten.current = {}
    if (next.name !== undefined) wrote.current.name = true
    if (next.prompt !== undefined) wrote.current.prompt = true
    onChange(next.name === undefined ? next : { ...next, name: next.name.trim() })
  }
  // an error goes as its field is whole again, not only at the next Done (fix round 1, item 6)
  const changeName = (value: string) => {
    setName(value)
    if (value.trim()) setErrors(e => (e.name ? { ...e, name: undefined } : e))
    write({ name: value }, { name: value, message })
  }
  const changeSystem = (value: string) => write({ systemPrompt: value }, { name, message })
  const changeMessage = (value: string) => {
    setMessage(value)
    if (value.trim()) setErrors(e => (e.message ? { ...e, message: undefined } : e))
    write({ prompt: value }, { name, message: value })
  }
  const insert = (token: PromptToken) => {
    const el = (last.current === 'system' ? systemText : messageText).current
    if (!el) return
    insertToken(el, token)
    if (last.current === 'system') changeSystem(readPrompt(el))
    else changeMessage(readPrompt(el))
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
        <TextInput ref={nameField} value={name} autoComplete="off" onChange={e => changeName(e.target.value)} />
      </Field>
      <Part name={O.prompts.parts.system}>
        <PromptText ref={systemText} editable text={prompt.systemPrompt} label={O.prompts.parts.system[0]} onFocus={() => { last.current = 'system' }} onText={changeSystem} />
      </Part>
      <Part name={O.prompts.parts.user} error={errors.message} errorId={messageError}>
        <PromptText ref={messageText} editable text={prompt.prompt} label={O.prompts.parts.user[0]} onFocus={() => { last.current = 'message' }} onText={changeMessage}
          invalid={!!errors.message} describedBy={errors.message ? messageError : undefined} />
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
