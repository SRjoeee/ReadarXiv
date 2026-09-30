import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ADVANCED_SEARCH, searchUrl } from '@/entrypoints/popup/find'
import { S, setLocale } from '@/ui/strings'
import { stubPopovers } from '../pdf-reader/ui/popover-stub'
import { draw, drawInput, fixture } from './draw'

// P0 (the redesign's design, §5.4; round 6): the sentence, the field, and what Enter does under it. Nothing opens until
// Enter; everything opens in a new tab (the state's openLink)
let restore = () => {}
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

const enter = (input: HTMLInputElement, isComposing = false) => act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing })) })

describe('P0: the field and what Enter does (the redesign\'s design, §5.4)', () => {
  it('an empty field: the sentence over it, the help line under it, the advanced search a link opening in a new tab', async () => {
    const { main, actions } = await draw('P0')
    const find = main.querySelector('.find')!
    expect([...find.children].map(c => c.className)).toEqual(['line', 'find-field', 'found'])
    expect(find.querySelector('.line')!.textContent).toBe(S.find.lead)
    const input = find.querySelector('input')!
    expect([input.placeholder, input.getAttribute('aria-label'), input.value]).toEqual([S.find.field, S.find.field, ''])
    const link = find.querySelector<HTMLAnchorElement>('.found a')!
    expect([link.textContent, link.href, link.target]).toEqual([S.find.advanced, ADVANCED_SEARCH, '_blank'])
    expect(find.querySelector('.found .line')!.textContent).toBe(`${S.find.enter} · ${S.find.advanced}`)
    await act(async () => { link.click() })
    expect(actions.openLink).toHaveBeenCalledWith(ADVANCED_SEARCH)
  })

  it('an arXiv PDF address: one brand row, its words, the paper and the key; Enter and a click open it', async () => {
    const { main, actions } = await draw('P0b')
    const row = main.querySelector<HTMLElement>('.go.brand')!
    expect([row.querySelector('.go-label')!.textContent, row.querySelector('.go-id')!.textContent, row.querySelector('kbd')!.textContent]).toEqual([S.entry.pdf, S.find.paper('2501.07202v1'), '↵'])
    await enter(main.querySelector('input')!)
    expect(actions.openLink).toHaveBeenLastCalledWith('https://arxiv.org/pdf/2501.07202v1#readarxiv')
    await act(async () => { row.click() })
    expect(actions.openLink).toHaveBeenCalledTimes(2)
  })

  it('words: the neutral row of arXiv\'s own search, which Enter opens', async () => {
    const { main, actions } = await draw('P0a')
    expect(main.querySelector('.go:not(.brand) .go-words')!.textContent).toBe(S.find.search('attention is all you need'))
    await enter(main.querySelector('input')!)
    expect(actions.openLink).toHaveBeenCalledWith(searchUrl('attention is all you need'))
  })

  it('Enter that ends an input method\'s composition opens nothing: a title typed in Pinyin ends so', async () => {
    const { main, actions } = await draw('P0a')
    await enter(main.querySelector('input')!, true)
    expect(actions.openLink).not.toHaveBeenCalled()
  })

  it('what is typed goes to the state, and a paste is only that: nothing opens', async () => {
    const { main, actions } = await draw('P0')
    const input = main.querySelector('input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'https://arxiv.org/pdf/2501.07202')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(actions.setQuery).toHaveBeenCalledWith('https://arxiv.org/pdf/2501.07202')
    expect(actions.openLink).not.toHaveBeenCalled()
  })

  it('a paper named: its line at once, its entries revealed when both checks are back; a greyed entry opens nothing and says why', async () => {
    const pending = await draw('P0d')
    expect(pending.main.querySelector('.paper b')!.textContent).toBe(S.find.paper('2501.07202v1'))
    // Enter has nothing to open: the reader chooses an entry
    await enter(pending.main.querySelector('input')!)
    expect(pending.actions.openLink).not.toHaveBeenCalled()
    // the reveal closed, its contents inert (§8, §9)
    expect(pending.main.querySelector('.found [inert]')).not.toBeNull()
    await pending.unmount()
    const both = await draw('P0e')
    const entries = [...both.main.querySelectorAll<HTMLElement>('.twin > button')]
    expect(entries.map(b => b.getAttribute('aria-disabled') === 'true')).toEqual([false, false])
    await act(async () => { entries[0]!.click() })
    expect(both.actions.openLink).toHaveBeenCalledWith('https://arxiv.org/html/2501.07202v1#readarxiv')
    await both.unmount()
    const none = await draw('P0f')
    const [html] = [...none.main.querySelectorAll<HTMLElement>('.twin > button')]
    expect(html!.getAttribute('aria-disabled')).toBe('true')
    await act(async () => { html!.click() })
    expect(none.actions.openLink).not.toHaveBeenCalled()
    expect(none.main.querySelector('.found .line.mark')!.textContent).toBe(S.note.noHtmlVersion)
  })

  it('a link elsewhere: said, and Enter opens nothing', async () => {
    const { main, actions } = await draw('P0g')
    expect(main.querySelector('.found .line.mark')!.textContent).toBe(S.find.elsewhere)
    await enter(main.querySelector('input')!)
    expect(actions.openLink).not.toHaveBeenCalled()
  })

  // Task 33's review, carried into this task: with neither entry offered (no HTML version and no bilingual PDF), P17
  // draws the reason as a Note in the alert tone (view-model.ts's noHtmlNote, entry.pdf === null). P0's paper case must
  // say the same thing the same way, not fall back to the plain "line mark" that a missing HTML version alone gets when
  // the PDF entry beside it still works (the P0f case above, tone info)
  it('a paper with neither entry: the alert note drawn as a Note, exactly as P17 draws it — not the plain line', async () => {
    const noHtml = fixture('P0f').input
    const neither = { ...noHtml, find: { ...noHtml.find, entries: { ...noHtml.find.entries!, pdf: null } } }
    const { main, actions } = await drawInput(neither)
    const note = main.querySelector('.found .note')!
    expect(note.getAttribute('data-tone')).toBe('alert')
    expect(note.querySelector('p')!.textContent).toBe(S.note.noHtml)
    // not drawn as the info-tone case's plain line
    expect(main.querySelector('.found .line.mark')).toBeNull()
    const [html] = [...main.querySelectorAll<HTMLElement>('.twin > button')]
    expect(html!.getAttribute('aria-disabled')).toBe('true')
    await act(async () => { html!.click() })
    expect(actions.openLink).not.toHaveBeenCalled()
  })

  // The final review (A-I1): with no service able to run and none to take over, both entries are greyed, and the reason
  // is the service's, drawn as P17b draws it — an alert Note whose settings button opens the settings — never S-P-33a's line
  it('a paper whose entries no service can serve: the service\'s reason as an alert Note with the settings button, and no S-P-33a line', async () => {
    const { config, rejected, saved } = fixture('P8b').input
    const { main, actions } = await drawInput({ ...fixture('P0f').input, config, rejected, saved })
    const note = main.querySelector('.found .note')!
    expect(note.getAttribute('data-tone')).toBe('alert')
    expect(note.querySelector('p')!.textContent).toBe(S.note.cannotRun(S.note.llmRejected))
    expect(main.querySelector('.found .line.mark')).toBeNull()
    expect([...main.querySelectorAll<HTMLElement>('.twin > button')].map(b => b.getAttribute('aria-disabled'))).toEqual(['true', 'true'])
    const settings = note.querySelector<HTMLButtonElement>('button')!
    expect(settings.textContent).toBe(S.settings)
    await act(async () => { settings.click() })
    expect(actions.openOptions).toHaveBeenCalledOnce()
  })

  // Codex 5a: the row for a pasted arXiv address is greyed as a greyed entry is, and says why as the entries' note does
  it.each(['P0c', 'P0b'])('%s under settings no service can serve: the brand row greyed, still focusable, without its key; a click or Enter opens nothing; the service\'s reason as an alert Note with the settings button', async id => {
    const { config, rejected, saved } = fixture('P8b').input
    const { main, actions } = await drawInput({ ...fixture(id).input, config, rejected, saved })
    const row = main.querySelector<HTMLButtonElement>('.go.brand')!
    expect([row.getAttribute('aria-disabled'), row.disabled, row.querySelector('kbd')]).toEqual(['true', false, null])
    await act(async () => { row.click() })
    await enter(main.querySelector('input')!)
    expect(actions.openLink).not.toHaveBeenCalled()
    const note = main.querySelector('.found .note')!
    expect([note.getAttribute('data-tone'), note.querySelector('p')!.textContent]).toEqual(['alert', S.note.cannotRun(S.note.llmRejected)])
    const settings = note.querySelector<HTMLButtonElement>('button')!
    expect(settings.textContent).toBe(S.settings)
    await act(async () => { settings.click() })
    expect(actions.openOptions).toHaveBeenCalledOnce()
  })

  // Fix round 1 (Task 36's review, Important): `.found` changes as the reader types — the help line, the brand row,
  // the search row, the paper line, the "only arXiv links" sentence — but none of that was ever said to a screen
  // reader. The design's §9: results are polite status messages, never assertive. The echo stays out of the entries'
  // own buttons and the note on purpose (Find.tsx): each change announces the row's one short line, not the two
  // buttons or the reason one is greyed, which a reader reaches directly by tabbing to them
  it('what the field understood is said politely, never as an alert: the words for a PDF link, then for a search', async () => {
    const pdf = await draw('P0b')
    const said = pdf.main.querySelector('[role="status"]')!
    expect(said.textContent).toBe(`${S.entry.pdf} ${S.find.paper('2501.07202v1')}`)
    expect(pdf.main.querySelector('[role="alert"]')).toBeNull()
    await pdf.unmount()
    const words = await draw('P0a')
    expect(words.main.querySelector('[role="status"]')!.textContent).toBe(S.find.search('attention is all you need'))
    expect(words.main.querySelector('[role="alert"]')).toBeNull()
  })

  // Fix round 1: P0's one purpose is this field; the popup opening on a page that is not a paper should let the reader
  // type at once
  it('the field takes the focus when P0 mounts', async () => {
    const { main } = await draw('P0')
    expect(document.activeElement).toBe(main.querySelector('input'))
  })
})
