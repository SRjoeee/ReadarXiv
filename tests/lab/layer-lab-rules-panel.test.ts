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

const h = (tag: string, attrs: Record<string, unknown> = {}, ...kids: (Node | string | null | undefined)[]) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v))
  e.append(...kids.filter((k): k is Node | string => k != null))
  return e
}
const icon = () => document.createElementNS('http://www.w3.org/2000/svg', 'svg')
/** the page's words are not what these tests read: a key stands for its string */
const t = (key: string, ...args: unknown[]) => [key, ...args].join(' ')

/** a rule set's bytes as the lab's server sends them: the built-in set, edited */
// biome-ignore lint/suspicious/noExplicitAny: a set under edit has no fixed shape
const bytesOf = (edit: (s: any) => void) => {
  const set = JSON.parse(FILE.toString('utf8'))
  edit(set)
  return Buffer.from(R.writeRules(R.parseRules(set)), 'utf8')
}
const shaOf = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const answerWith = (bytes: Buffer) => Promise.resolve({
  ok: true, status: 200,
  headers: { get: (k: string) => (k.toLowerCase() === 'etag' ? `"${shaOf(bytes)}"` : null) },
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
})

interface Post { body: string; answer: (version?: number) => void; refuse: (status: number, body: object) => void }
let posts: Post[]
let root: HTMLElement
/** what GET /api/rules answers (the worktree's file), and what a ref's route does */
let served: Buffer
let ofRef: Buffer

beforeEach(() => {
  posts = []
  served = FILE
  ofRef = FILE
  root = document.createElement('div')
  document.body.replaceChildren(root)
  vi.stubGlobal('confirm', () => true)
  vi.stubGlobal('fetch', (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'POST') {
      return new Promise(done => posts.push({
        body: String(init.body),
        answer: (version = 2) => done({ ok: true, status: 200, json: async () => ({ ok: true, version, sha256: 'f'.repeat(64), bytes: 1, changed: [] }) }),
        refuse: (status, body) => done({ ok: false, status, json: async () => body }),
      }))
    }
    if (url === '/api/rules') return answerWith(served)
    if (url.startsWith('/api/rules?ref=')) return answerWith(ofRef)
    throw new Error(url)
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
/** let the click's promise chain run */
const settle = () => new Promise<void>(done => setTimeout(done, 0))
/** a set loaded from a git ref, through the loads row */
const loadRef = async (ref: string) => {
  const input = root.querySelector('.ref-row input') as HTMLInputElement
  input.value = ref
  input.dispatchEvent(new Event('input'))
  ;(root.querySelector('.ref-row button') as HTMLButtonElement).click()
  // (a set is read with a digest, which takes a turn of its own: wait for the panel to say it loaded)
  await vi.waitFor(() => expect(root.querySelector('p.note[role="status"]')?.textContent).toContain('rules.loaded'))
}
const save = () => {
  const button = root.querySelector('#rules-save') as HTMLButtonElement
  expect(button.disabled).toBe(false)
  button.click()
}

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

  it('sends the version of the file it read, not the loaded set\'s own: the server writes it only if the file is still that', async () => {
    const p = await panel()
    // (a set from a commit, at a version of its own)
    ofRef = bytesOf(s => { s.version = 5; s.scripts.Hans.leadBase = 1.31 })
    await loadRef('feature')
    expect(p.set()!.version).toBe(5)
    flip('keepAll')
    writeNote('keep all')
    save()
    await settle()
    expect(JSON.parse(posts[0]!.body).version).toBe(1)
  })

  it('builds the next save on the version the file has after the one before', async () => {
    await panel()
    flip('keepAll')
    writeNote('keep all')
    save()
    await settle()
    posts[0]!.answer(2)
    await settle()
    flip('cjkQuotes')
    writeNote('and the quotes')
    save()
    await settle()
    expect(JSON.parse(posts[1]!.body).version).toBe(2)
  })

  it('on a stale file says so and offers to load it, changing nothing on its own', async () => {
    const p = await panel()
    flip('keepAll')
    writeNote('keep all')
    save()
    await settle()
    posts[0]!.refuse(409, { ok: false, error: 'stale', why: 'the file moved', version: 3 })
    await settle()
    const message = root.querySelector('p.note[role="status"]') as HTMLElement
    expect(message.hidden).toBe(false)
    expect(message.textContent).toContain('rules.stale 1 3')
    // (the edit is still there, unsaved; nothing was taken from the file)
    expect(p.dirty()).toBe(true)
    expect(p.set()!.languages.zh!.keepAll).toBe(true)
    // (the reader asks for the file: it replaces the edit, after the question every load asks)
    served = bytesOf(s => { s.version = 3; s.scripts.Hans.leadBase = 1.31 })
    const load = message.querySelector('button') as HTMLButtonElement
    expect(load.textContent).toBe('rules.staleLoad')
    load.click()
    await vi.waitFor(() => expect(p.set()!.version).toBe(3))
    expect(p.set()!.scripts.Hans!.leadBase).toBe(1.31)
    expect(p.set()!.languages.zh!.keepAll).not.toBe(true)
    expect(p.dirty()).toBe(false)
    expect(message.querySelector('button')).toBeNull()
  })

  it('lets a save that is answered after another set was loaded change the file only, not the set shown', async () => {
    const p = await panel()
    flip('keepAll')
    writeNote('keep all')
    save()
    await settle()
    // (the answer has not come: another set is loaded)
    ofRef = bytesOf(s => { s.version = 5; s.scripts.Hans.leadBase = 1.31 })
    await loadRef('feature')
    expect(p.from()!.kind).toBe('ref')
    posts[0]!.answer(2)
    await settle()
    // the set shown is the one loaded, with its own version, base and origin
    expect(p.from()!.kind).toBe('ref')
    expect(p.set()!.version).toBe(5)
    expect(p.set()!.scripts.Hans!.leadBase).toBe(1.31)
    expect(p.set()!.languages.zh!.keepAll).not.toBe(true)
    expect(p.dirty()).toBe(false)
    // and the file is what the save wrote: version 2, which the shown set is compared with and the next save is built on
    expect(root.querySelector('#rules-compare')!.textContent).toContain('rules.vsFile 2')
    flip('cjkQuotes')
    writeNote('next')
    expect((root.querySelector('#rules-save-hint') as HTMLElement).textContent).toContain('rules.saveHint 3')
    save()
    await settle()
    expect(JSON.parse(posts[1]!.body).version).toBe(2)
  })
})
