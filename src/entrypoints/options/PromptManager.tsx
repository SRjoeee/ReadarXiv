import { useEffect, useRef, useState } from 'react'
import { PromptFileFormatError, downloadPromptFile, readPromptFile } from '@/providers/prompt-file'
import {
  BUILT_IN_PROMPTS, DEFAULT_PROMPT_ID, PROMPT_TOKENS, getTokenCellText,
  type PromptTemplate, type PromptsConfig, promptExists,
} from '@/providers/prompt-library'
import { getRandomUUID as uuid } from '@/shared/uuid'
import { O } from '@/ui/strings'
import { Button } from '@/ui/Button'
import { Confirm } from '@/ui/Confirm'
import { drafts } from '@/ui/drafts'
import { Field, codeAreaClass, inputClass } from '@/ui/Field'

// The prompt library: the same features as Read Frog's components/prompt-configurator/* — the list,
// reading a built-in one, copying it into an editable one, new / edit / delete, import / export, and
// the variable buttons that insert at the caret. Read Frog builds it on base-ui + jotai + Tailwind;
// a whole UI stack for a dozen fields is not worth it, so this is the settings page's plain React, dressed
// like every other section — the shared Button / Field / Confirm and Tailwind classes.
// A change is handed to the parent, which writes it to storage straight away — the page has no save button.

export type EditorMode = 'view' | 'copy' | 'edit' | 'new'
type PromptField = 'systemPrompt' | 'prompt'

/** Read at render, not at import: this module is evaluated before the pack is chosen (ui/strings.ts) */
const tokenHint = (token: (typeof PROMPT_TOKENS)[number]): string => O.prompts.manager.tokens[token]
/** The shipped prompts' one-line descriptions, in the interface's language (Codex on #161) */
const builtInDescription = (id: string): string => (O.prompts.manager.builtIn as Record<string, string>)[id] ?? ''

/** The starting point of a new prompt: names the target language and carries the source text, so it works with only a name filled in (Codex on #39: a template of `{{input}}` alone does not know which language to translate into) */
const NEW_SYSTEM_PROMPT = `You are a professional ${getTokenCellText('targetLanguage')} translator of academic papers.`
const NEW_USER_PROMPT = `Translate the following into ${getTokenCellText('targetLanguage')}:\n\n${getTokenCellText('input')}`

/** One prompt of the list: the radio and the name, the actions at the end */
const rowClass = 'flex items-center gap-2 border-b border-line py-1.5'
const nameClass = 'flex flex-1 cursor-pointer items-center gap-1.5 text-[13px]'
const noteClass = 'block text-[11px] text-fg-2'

/**
 * The list with the draft saved into it. An edit replaces its template in place — or, when the template is no longer
 * in the list (deleted in another tab while this editor was open, and the list followed), appends it: the save is the
 * reader's later word on that prompt, and a save that persisted nothing while reporting success would have lost the
 * draft without a trace (local review). A new template and a copy always append
 */
export function withSaved(patterns: readonly PromptTemplate[], mode: EditorMode, draft: PromptTemplate): PromptTemplate[] {
  if (mode === 'edit' && patterns.some(p => p.id === draft.id)) return patterns.map(p => (p.id === draft.id ? draft : p))
  return [...patterns, draft]
}

/**
 * A change to the prompts, as an update of the configuration **as stored when the write runs** — not of `value`, which
 * is what this tab last saw: a prompt added or deleted in another tab while its refresh was still queued would
 * otherwise be dropped or brought back by a list built from the stale copy (Codex on #185)
 */
export type PromptsUpdate = (current: PromptsConfig) => PromptsConfig

export function PromptManager({ value, onChange }: { value: PromptsConfig; onChange: (update: PromptsUpdate) => unknown }) {
  const [editor, setEditor] = useState<{ mode: EditorMode; draft: PromptTemplate } | null>(null)
  // The editor's draft is local until “Save”: the page must not reload under it (ui/drafts.ts). Keyed on whether an
  // editor is open, not on the draft — every keystroke would otherwise end one hold and begin another
  const editing = editor !== null
  useEffect(() => (editing ? drafts.hold() : undefined), [editing])
  const [message, setMessage] = useState('')
  const areas = useRef<Record<PromptField, HTMLTextAreaElement | null>>({ systemPrompt: null, prompt: null })
  const lastFocused = useRef<PromptField>('prompt')
  const fileInput = useRef<HTMLInputElement>(null)

  const builtIns = Object.values(BUILT_IN_PROMPTS)
  // A choice made from a stale list must not store an id that names nothing: deleted in another tab before this
  // one's refresh ran, the prompt would resolve to the default silently, and neither it nor the previous choice would
  // translate (local review). Such a choice keeps what is stored
  const select = (promptId: string) => onChange(current => (
    promptExists(current, promptId) ? { ...current, promptId } : current
  ))

  function open(mode: EditorMode, template?: PromptTemplate) {
    setMessage('')
    setEditor({ mode, draft: template ?? { id: uuid(), name: '', systemPrompt: NEW_SYSTEM_PROMPT, prompt: NEW_USER_PROMPT } })
  }

  /** A built-in is read-only; “Duplicate and customise” gives a copy with a new id, selected as soon as it is saved (Read Frog's way) */
  function copyBuiltIn(template: PromptTemplate) {
    setEditor({ mode: 'copy', draft: { ...template, id: uuid(), name: O.prompts.manager.copyOf(template.name) } })
  }

  function save() {
    if (!editor) return
    const { mode, draft } = editor
    if (!draft.name.trim()) return setMessage(O.prompts.manager.nameEmpty)
    if (!draft.prompt.trim()) return setMessage(O.prompts.manager.promptEmpty)
    onChange(current => ({ patterns: withSaved(current.patterns, mode, draft), promptId: mode === 'copy' ? draft.id : current.promptId }))
    setEditor(null)
    setMessage(mode === 'edit' ? O.prompts.manager.saved : O.prompts.manager.added)
  }

  function remove(template: PromptTemplate) {
    onChange(current => ({
      patterns: current.patterns.filter(p => p.id !== template.id),
      promptId: current.promptId === template.id ? DEFAULT_PROMPT_ID : current.promptId,
    }))
    if (editor?.draft.id === template.id) setEditor(null)
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    try {
      const entries = await readPromptFile(file)
      const added = entries.map(entry => ({ ...entry, id: uuid() }))
      onChange(current => ({ ...current, patterns: [...current.patterns, ...added] }))
      setMessage(O.prompts.manager.imported(entries.length))
    } catch (e) {
      // The parser only says which kind; the sentence is in the locale pack (Codex on #161)
      setMessage(e instanceof PromptFileFormatError ? O.prompts.manager.importFailed[e.kind] : e instanceof Error ? e.message : String(e))
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  /** Insert a variable at the caret of the text box focused last (Read Frog's QuickInsertableTextarea) */
  function insertToken(token: (typeof PROMPT_TOKENS)[number]) {
    if (!editor) return
    const which = lastFocused.current
    const el = areas.current[which]
    const text = getTokenCellText(token)
    const current = editor.draft[which]
    const start = el?.selectionStart ?? current.length
    const end = el?.selectionEnd ?? current.length
    const next = current.slice(0, start) + text + current.slice(end)
    setEditor({ ...editor, draft: { ...editor.draft, [which]: next } })
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const readOnly = editor?.mode === 'view'
  const titles: Record<EditorMode, string> = { view: O.prompts.manager.viewTitle, copy: O.prompts.manager.copyTitle, edit: O.prompts.manager.editTitle, new: O.prompts.manager.createTitle }

  return (
    <div>
      {builtIns.map(template => (
        <div key={template.id} className={rowClass}>
          <label className={nameClass}>
            <input type="radio" name="axt-prompt" className="accent-accent" checked={value.promptId === template.id} onChange={() => select(template.id)} />
            <span>
              {template.name}
              <small className={noteClass}>{builtInDescription(template.id)}</small>
            </span>
          </label>
          <Button variant="text" onClick={() => open('view', template)}>{O.prompts.manager.view}</Button>
        </div>
      ))}
      {value.patterns.map(template => (
        <div key={template.id} className={rowClass}>
          <label className={nameClass}>
            <input type="radio" name="axt-prompt" className="accent-accent" checked={value.promptId === template.id} onChange={() => select(template.id)} />
            <span>{template.name}<small className={noteClass}>{O.prompts.manager.custom}</small></span>
          </label>
          <Button variant="text" onClick={() => open('edit', template)}>{O.prompts.manager.edit}</Button>
          <Confirm label={O.prompts.manager.remove} confirmLabel={O.prompts.manager.removeConfirm} cancelLabel={O.prompts.manager.cancel} onConfirm={() => remove(template)} />
        </div>
      ))}

      <p className="my-2 flex items-center gap-3">
        <Button variant="text" onClick={() => open('new')}>{O.prompts.manager.create}</Button>
        <Button variant="text" onClick={() => fileInput.current?.click()}>{O.prompts.manager.importFile}</Button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => importFile(e.target.files?.[0])} />
        <Button variant="text" className="disabled:opacity-50" disabled={value.patterns.length === 0} onClick={() => downloadPromptFile(value.patterns)}>{O.prompts.manager.exportMine}</Button>
        <span className="text-[11px] text-fg-2">{message}</span>
      </p>

      {editor && (
        <div className="mt-1 rounded-control border border-line p-3">
          <strong className="mb-3 block text-[13px] font-semibold">{titles[editor.mode]}</strong>
          <Field label={O.prompts.manager.name}>
            <input className={inputClass} value={editor.draft.name} readOnly={readOnly} onChange={e => setEditor({ ...editor, draft: { ...editor.draft, name: e.target.value } })} />
          </Field>
          {(['systemPrompt', 'prompt'] as PromptField[]).map(which => (
            <Field key={which} label={which === 'systemPrompt' ? O.prompts.manager.systemPrompt : O.prompts.manager.userPrompt}>
              <textarea
                ref={el => { areas.current[which] = el }}
                className={`${codeAreaClass} ${which === 'systemPrompt' ? 'min-h-[140px]' : 'min-h-[100px]'}`}
                value={editor.draft[which]}
                readOnly={readOnly}
                onFocus={() => { lastFocused.current = which }}
                onChange={e => setEditor({ ...editor, draft: { ...editor.draft, [which]: e.target.value } })}
              />
            </Field>
          ))}
          {!readOnly && (
            <p className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-fg-2">{O.prompts.manager.insert}</span>
              {PROMPT_TOKENS.map(token => (
                <Button variant="chip" key={token} title={tokenHint(token)} onClick={() => insertToken(token)}>{getTokenCellText(token)}</Button>
              ))}
            </p>
          )}
          <p className="flex items-center gap-3">
            {readOnly
              ? <Button variant="solid" onClick={() => copyBuiltIn(editor.draft)}>{O.prompts.manager.copy}</Button>
              : <Button variant="solid" onClick={save}>{O.prompts.manager.addToList}</Button>}
            <Button variant="text" onClick={() => setEditor(null)}>{readOnly ? O.prompts.manager.close : O.prompts.manager.cancel}</Button>
          </p>
        </div>
      )}
    </div>
  )
}
