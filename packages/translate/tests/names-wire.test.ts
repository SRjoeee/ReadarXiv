// A block name sent as an element (docs/PDF-READER.md §19.15): a variant's `person` element travels every wire as any element
// does, and the replies the typesetter cuts a block's names line by (packages/typeset tests/unit/named.test.ts) are these
// adapters' own readings of the tags wire's answers: the element where it stood, moved before the name, inside the group of
// the name before it.
import { describe, expect, it } from 'vitest'
import { type ChromeApi, chrome } from '../src/adapters/chrome.ts'
import { google } from '../src/adapters/google.ts'
import { microsoft } from '../src/adapters/microsoft.ts'
import { scriptedFetch } from '../src/testing/fakes.ts'
import { el, span, t, unit } from './pieces.ts'

const fetch = scriptedFetch(() => ({ status: 200, body: '[]' })).fetch
const api = {
  availability: async () => 'available',
  create: async () => ({ translate: async (s: string) => s }),
} as unknown as ChromeApi
const tags = [google({ fetch }), chrome({ api })] as const
// (2610.22065v1's names line, a group round the first name: "Wenshuai Yao[1], Wenyong Zhou[3],")
const line = unit('b', [span('0', 'bold', [t('Wenshuai Yao')]), el('1'), t(', Wenyong Zhou'), el('3'), t(',')])

describe('a variant’s person element on every wire', () => {
  const v = unit('v', [t('Corresponding author: '), el('n0', 'person'), t('.')], true)
  it('goes as an element, its name on no wire', () => {
    for (const w of tags) expect(w.write(v, 'zh-Hans')).not.toContain('Wenyong')
    expect(tags[0].write(v, 'zh-Hans')).toContain('Corresponding author: <span id="1" translate="no">x1</span>.')
    expect(tags[1].write(v, 'zh-Hans')).toContain('Corresponding author: <x id="1"/>.')
    expect(microsoft({ fetch }).write(v, 'zh-Hans')).toContain('Corresponding author: @a#.')
  })
  it('comes back as the element it went as', () => {
    for (const w of tags)
      expect(w.read(v, '通讯作者：<x id="1"/>。')?.content).toEqual([
        { t: 'text', s: '通讯作者：' },
        { t: 'el', id: 'n0' },
        { t: 'text', s: '。' },
      ])
  })
})

describe('the tags wire’s readings of a names line (Google, Chrome’s built-in translator)', () => {
  it('reads the elements where they stood', () => {
    for (const w of tags)
      expect(w.read(line, '<t id="1">姚文帅</t><x id="2"/>，周文勇<x id="3"/>，')?.content).toEqual([
        { t: 'span', id: '0', content: [{ t: 'text', s: '姚文帅' }] },
        { t: 'el', id: '1' },
        { t: 'text', s: '，周文勇' },
        { t: 'el', id: '3' },
        { t: 'text', s: '，' },
      ])
  })
  it('reads an element moved inside the group of the name before it', () => {
    for (const w of tags)
      expect(w.read(line, '<t id="1">姚文帅<x id="2"/></t>，周文勇<x id="3"/>，')?.content).toEqual([
        {
          t: 'span',
          id: '0',
          content: [
            { t: 'text', s: '姚文帅' },
            { t: 'el', id: '1' },
          ],
        },
        { t: 'text', s: '，周文勇' },
        { t: 'el', id: '3' },
        { t: 'text', s: '，' },
      ])
  })
  it('reads the elements moved before the names: each name then stands between the elements of the one before', () => {
    const bare = unit('b', [t('Wenshuai Yao'), el('1'), t(', Wenyong Zhou'), el('3'), t(',')])
    for (const w of tags)
      expect(w.read(bare, '<x id="1"/>姚文帅，<x id="2"/>周文勇，')?.content).toEqual([
        { t: 'el', id: '1' },
        { t: 'text', s: '姚文帅，' },
        { t: 'el', id: '3' },
        { t: 'text', s: '周文勇，' },
      ])
  })
})
