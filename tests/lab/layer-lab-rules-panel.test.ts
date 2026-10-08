import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRulesPanel, type RulesPanel } from '../../lab/pdf/layer-lab/rules-panel.mjs'
import * as R from '@/pdf-reader/engine/rules/layout.mjs'

// The rules panel's save (lab/pdf/layer-lab/rules-panel.mjs, the rules-as-data plan §7), driven through its controls with a
// fetch that answers as the lab's server does: what it sends is a set the engine reads, and what it takes as saved is the
// set it sent

const FILE = readFileSync(resolve('src/pdf-reader/engine/rules/layout-rules.json'))
const SHA = createHash('sha256').update(FILE).digest('hex')

const h = (tag: string, attrs: Record<string, unknown> = {}, ...kids: (Node | string | null | undefined)[]) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v))
  e.append(...kids.filter((k): k is Node | string => k != null))
  return e
}
const icon = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg')
/** the page's words are not what these tests read: a key stands for its string */
const t = (key: string, ...args: unknown[]) => [key, ...args].join(' ')

interface Post { body: string; answer: (version?: number) => void }
let posts: Post[]
let root: HTMLElement

beforeEach(() => {
  posts = []
  root = document.createElement('div')
  document.body.replaceChildren(root)
  vi.stubGlobal('fetch', (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      return new Promise(done => posts.push({
        body: String(init.body),
        answer: (version = 2) => done({ ok: true, status: 200, json: async () => ({ ok: true, version, sha256: 'f'.repeat(64), bytes: 1, changed: [] }) }),
      }))
    }
    if (url !== '/api/rules') throw new Error(url)
    return Promise.resolve({ ok: true, status: 200, headers: { get: (k: string) => (k.toLowerCase() === 'etag' ? `"${SHA}"` : null) }, arrayBuffer: async () => FILE.buffer.slice(FILE.byteOffset, FILE.byteOffset + FILE.byteLength) })
  })
})
afterEach(() => { vi.unstubAllGlobals() })

/** the panel, on the built-in file, showing zh */
async function panel(): Promise<RulesPanel> {
  const p = createRulesPanel({ root, h, icon, t, R, names: {}, catalog: { groups: [], faces: [], families: [] }, onChange: () => {} })
  await p.start()
  p.setTarget('zh')
  return p
}
/** a boolean field's switch, clicked */
const flip = (path: string) => (root.querySelector(`[data-rule="${path}"] button[role="switch"]`) as HTMLButtonElement).click()
const writeNote = (text: string) => {
  const box = root.querySelector('#rules-note') as HTMLTextAreaElement
  box.value = text
  box.dispatchEvent(new Event('input'))
}
const save = () => {
  const button = root.querySelector('#rules-save') as HTMLButtonElement
  expect(button.disabled).toBe(false)
  button.click()
}
/** let the click's promise chain run */
const settle = () => new Promise<void>(done => setTimeout(done, 0))

describe('the save', () => {
  it('sends the note as one line of text, whatever the textarea held: a set refuses a control in a string', async () => {
    await panel()
    // (a newline and a tab; a carriage return, a bell and a right-to-left override; a line separator, which is a space to a
    // reader and to `\s` alike)
    for (const [typed, sent] of [['tune\nleads\tlooser', 'tune leads looser'], ['\n  a\r\n\r\nb  \u0007c \u202e', 'a b c'], ['one\u2028two', 'one two']]) {
      flip('keepAll')
      writeNote(typed!)
      save()
      await settle()
      const post = posts.pop()!
      const { set } = await R.readRules(new TextEncoder().encode(post.body))
      expect(set.note, JSON.stringify(typed)).toBe(sent)
      post.answer(2)
      await settle()
    }
  })

  it('takes a note of controls alone for no note: Save stays off', async () => {
    await panel()
    flip('keepAll')
    writeNote('\n\u0007 \t')
    expect((root.querySelector('#rules-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('takes as saved the set it sent: an edit made while the save is in flight stays unsaved', async () => {
    const p = await panel()
    flip('keepAll')
    writeNote('keep all')
    save()
    await settle()
    expect(posts).toHaveLength(1)
    // (the answer has not come: a second edit)
    flip('cjkQuotes')
    posts[0]!.answer(2)
    await settle()
    const sent = JSON.parse(posts[0]!.body)
    expect(sent.languages.zh.keepAll).toBe(true)
    expect(sent.languages.zh).not.toHaveProperty('cjkQuotes')
    // the second edit is still the working set's, and is not in what the file now holds
    expect(p.dirty()).toBe(true)
    expect(p.set()!.languages.zh!.cjkQuotes).toBe(false)
    expect(p.set()!.version).toBe(2)
    expect((root.querySelector('#rules-save') as HTMLButtonElement).disabled).toBe(true)
    writeNote('and the quotes')
    expect((root.querySelector('#rules-save') as HTMLButtonElement).disabled).toBe(false)
  })

  it('takes a save with no edit made meanwhile as the set it sent: nothing is left unsaved', async () => {
    const p = await panel()
    flip('keepAll')
    writeNote('keep all')
    save()
    await settle()
    posts[0]!.answer(2)
    await settle()
    expect(p.dirty()).toBe(false)
    expect(p.set()!.version).toBe(2)
    expect(p.set()!.note).toBe('keep all')
  })
})
