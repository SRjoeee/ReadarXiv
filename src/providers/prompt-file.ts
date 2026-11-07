// The prompts file (UI.md S-O-61, S-O-61b; DESIGN §8.2): the reader's own prompts exported and imported as JSON. Its
// shape is an external contract (hard rule 7: files exported by any earlier version, and by the extension it was first
// shaped after, must still import): `arxiv-translate_prompts.json`, an array of `{ name, systemPrompt, prompt }`, no
// ids — an import gives each prompt a new one, so a file read twice adds two copies and never overwrites. `name` and
// `prompt` are strings, `name` not empty; `systemPrompt` may be left out and reads as empty; other fields are ignored.
// One entry out of shape makes the whole file unusable, and the settings page says which of the two failures it was.
import { z } from 'zod'
import { downloadTextFile } from '@/shared/download'
import type { PromptTemplate } from './prompt-library'

/** The exported file's name, kept from the project's first name (DESIGN §3, Names) */
export const PROMPT_FILE_NAME = 'arxiv-translate_prompts.json'

const promptFileEntrySchema = z.object({
  name: z.string().min(1),
  prompt: z.string(),
  systemPrompt: z.string().default(''),
})
export type PromptFileEntry = z.infer<typeof promptFileEntrySchema>

/** What was wrong with a file: not JSON at all, or JSON that is not a list of prompts */
export type PromptFileError = 'notJson' | 'badShape'

export class PromptFileFormatError extends Error {
  readonly kind: PromptFileError
  constructor(kind: PromptFileError) {
    super(`prompt file: ${kind}`)
    this.name = 'PromptFileFormatError'
    this.kind = kind
  }
}

/** The prompts a file's text holds, in its order; a PromptFileFormatError where it holds none in the file's shape */
export function parsePromptFile(json: string): PromptFileEntry[] {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new PromptFileFormatError('notJson')
  }
  const parsed = z.array(promptFileEntrySchema).safeParse(data)
  if (!parsed.success) throw new PromptFileFormatError('badShape')
  return parsed.data
}

/** A file the reader picked, read and parsed; a file that cannot be read as text is not JSON either */
export async function readPromptFile(file: File): Promise<PromptFileEntry[]> {
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new PromptFileFormatError('notJson')
  }
  return parsePromptFile(text)
}

/** The file's text for these prompts: each one's name and two parts, without its id, indented for a reader's eye */
export function serializePrompts(patterns: PromptTemplate[]): string {
  return JSON.stringify(patterns.map(({ name, systemPrompt, prompt }) => ({ name, systemPrompt, prompt })), null, 2)
}

/** Hand the reader the file of these prompts */
export function downloadPromptFile(patterns: PromptTemplate[], doc: Document = document): void {
  downloadTextFile(PROMPT_FILE_NAME, serializePrompts(patterns), 'application/json', doc)
}
