// A prompt's text read as words (the redesign's design, §6.3): its variables drawn as small labels, never {{…}}. One's
// own is written here too — plain text (a paste stays plain), its labels atoms a caret passes over whole — and read back
// into its {{token}} form as it changes. The editable text is drawn once, from the text it opened with, and then left to
// the reader: React leaves alone the children it drew the same way
import { Fragment, type Ref, useState } from 'react'
import { PROMPT_TOKENS, type PromptToken, getTokenCellText } from '@/providers/prompt-library'
import { O } from '@/ui/strings'

const TOKEN = new RegExp(`\\{\\{(${PROMPT_TOKENS.join('|')})\\}\\}`, 'g')

export type PromptPart = { text: string } | { token: PromptToken }

/** The text as runs of words and variables */
export function promptParts(text: string): PromptPart[] {
  const out: PromptPart[] = []
  let at = 0
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) })
    out.push({ token: m[1] as PromptToken })
    at = m.index + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** What a text says with its variables by their labels, on one line: one's own prompt is described by its start */
export function plainWords(text: string): string {
  return text.replace(TOKEN, (_, token: PromptToken) => O.prompts.tokens[token]).replace(/\s+/g, ' ').trim()
}

/** The text a field holds, its labels back in their {{token}} form; a line the browser broke with an element counts once */
export function readPrompt(el: Node): string {
  let out = ''
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? ''
    else if (node instanceof HTMLElement) {
      if (node.dataset.token) out += getTokenCellText(node.dataset.token as PromptToken)
      else if (node.tagName === 'BR') out += '\n'
      else out += (out && !out.endsWith('\n') ? '\n' : '') + readPrompt(node)
    }
  }
  return out
}

const labelOf = (token: PromptToken, key: number) => <span key={key} className="o-var" data-token={token} contentEditable={false}>{O.prompts.tokens[token]}</span>
// biome-ignore lint/suspicious/noArrayIndexKey: a text's runs, drawn once in order from the text and never reordered
const draw = (parts: PromptPart[]) => parts.map((p, i) => ('token' in p ? labelOf(p.token, i) : <Fragment key={i}>{p.text}</Fragment>))

/** A variable put where the caret is in `el` (at its end when the caret is elsewhere), the caret after it */
export function insertToken(el: HTMLElement, token: PromptToken): void {
  const doc = el.ownerDocument
  const chip = doc.createElement('span')
  chip.className = 'o-var'
  chip.dataset.token = token
  chip.contentEditable = 'false'
  chip.textContent = O.prompts.tokens[token]
  const selection = doc.getSelection()
  const range = selection && selection.rangeCount > 0 && el.contains(selection.getRangeAt(0).startContainer) ? selection.getRangeAt(0) : null
  if (range) {
    range.deleteContents()
    range.insertNode(chip)
  } else el.append(chip)
  el.focus()
  const after = doc.createRange()
  after.setStartAfter(chip)
  after.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(after)
}

export function PromptText({ text, editable = false, label, onText, onFocus, ref }: {
  text: string
  editable?: boolean
  label: string
  onText?: (text: string) => void
  onFocus?: () => void
  ref?: Ref<HTMLDivElement>
}) {
  const [drawn] = useState(() => draw(promptParts(text)))
  if (!editable) return <div className="o-prompt-text">{draw(promptParts(text))}</div>
  return (
    // biome-ignore lint/a11y/useSemanticElements: a field that draws its variables as labels, which an input or a textarea cannot hold
    <div ref={ref} className="o-prompt-text" data-editable="" role="textbox" aria-multiline="true" aria-label={label} tabIndex={0}
      contentEditable="plaintext-only" suppressContentEditableWarning onFocus={onFocus} onInput={e => onText?.(readPrompt(e.currentTarget))}>
      {drawn}
    </div>
  )
}
