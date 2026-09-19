import { afterEach, expect } from 'vitest'
import { isInjected, T_CLASS } from '@/core/marks'
import { TAIL_ATTR } from '@/core/renderer/attrs'

/** Parse a fragment inside the translation root */
export function docOf(body: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><head></head><body><article class="ltx_document">${body}</article></body></html>`,
    'text/html',
  )
}

/** Build a fragment from an HTML string (imitating rehydrate's output) */
export function frag(doc: Document, html: string): DocumentFragment {
  const template = doc.createElement('template')
  template.innerHTML = html
  return template.content
}

/**
 * The tail mark's invariant over a whole tree (DESIGN §7.2; `markTail` in renderer/side-layout.ts): an element of the
 * page carries `data-axt-tail` exactly when its next sibling is one of our translation-side nodes and that node closes
 * the container. The mark is kept by convention — whatever inserts or removes such a node calls `markTail` with the
 * original — and nothing in the code can hold a new inserter to it; this does, wherever a test has rendered something.
 * Our own nodes and what is inside them are not originals: a split copy's inside has no pairs, and its marks were
 * stripped with every other `data-axt-*`. Returns a description of every element that breaks it
 */
export function tailMarkBreaches(root: Document | Element): string[] {
  const breaches: string[] = []
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (isInjected(el) || el.closest(`.${T_CLASS}`)) continue
    const next = el.nextElementSibling
    const closes = !!next && next.classList.contains(T_CLASS) && next.nextElementSibling === null
    if (closes === el.hasAttribute(TAIL_ATTR)) continue
    const name = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${String(el.className).split(/\s+/).join('.')}` : ''}`
    breaches.push(closes ? `${name}: its translation-side node closes the container, and it has no mark` : `${name}: marked, and nothing of ours closes the container after it`)
  }
  return breaches
}

/**
 * `docOf` for a test file that holds whatever it renders to the tail mark's invariant: every document made through
 * the returned function is checked after each case. Called once at the top of the file — `const docOf = docOfChecked()`
 * — so the cases themselves stay as they are.
 *
 * `handBuilt` is the way out, said where it is taken: a case that writes our nodes into its HTML, or moves nodes about
 * by hand, shows a state no renderer produced, and nobody kept its marks
 */
export function docOfChecked(): ((body: string) => Document) & { handBuilt: (body: string) => Document } {
  const docs: Document[] = []
  afterEach(() => {
    for (const doc of docs.splice(0)) expect(tailMarkBreaches(doc), 'the tail mark\'s invariant (renderer/side-layout.ts markTail)').toEqual([])
  })
  const checked = (body: string) => {
    const doc = docOf(body)
    docs.push(doc)
    return doc
  }
  return Object.assign(checked, { handBuilt: docOf })
}

