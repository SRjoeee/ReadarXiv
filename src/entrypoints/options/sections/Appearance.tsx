// The appearance section (the redesign's design, §6.4): the extension's appearance (§3) with the dark pages' dimming under it, the
// translation styles (Task 56), and the hover highlight with its colour. Every control writes at once
import { Monitor, Moon, Pencil, Plus, Sun } from 'lucide'
import { Fragment, useRef, useState } from 'react'
import { type Appearance as Looks, BUILT_IN_HIGHLIGHTS, BUILT_IN_STYLES, type HighlightProfile, type StyleProfile, duplicateStyle, newProfileId, resetBuiltIns } from '@/config/appearance'
import type { Config } from '@/config/schema'
import { styleSample } from '@/ui/style-sample'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'
import { radioKeys } from '@/ui/controls/radio'
import { Reveal } from '@/ui/controls/Reveal'
import { Segmented } from '@/ui/controls/Segmented'
import { Switch } from '@/ui/controls/Switch'
import { O, S, copyName, profileName } from '@/ui/strings'
import type { OptionsData } from '../data'
import { Card, GroupHeading } from '../ui/Card'
import { ColourPick } from '../ui/ColourPick'
import { type ListWrites, focusLost, insertAt, undoHasFocus, useFocusWhenDrawn, useLinger, useListWrites, withUndo } from '../ui/lists'
import { IconButton, Row, Status } from '../ui/Row'
import { UndoRow } from '../ui/UndoRow'
import { StyleEditor } from './StyleEditor'

/** the system's first (the maintainer, 2026-09-26), as in the reader's own options */
const THEMES = ['system', 'light', 'dark'] as const
const GLYPHS = { system: Monitor, light: Sun, dark: Moon }

/** The reader's colour of their own for the highlight (§6.4): one profile, added the first time and changed after */
export const OWN_HIGHLIGHT_ID = 'hl-own'
/** its band's strength: the built-ins' middle (soft-green 0.22, sky 0.25, sand 0.3) */
const OWN_STRENGTH = 0.25

/** a band's swatch as the band reads on a page: its colour at its strength over the ground */
const band = (h: HighlightProfile) => `color-mix(in oklab, ${h.color || BUILT_IN_HIGHLIGHTS[0]!.color} ${Math.round(h.opacity * 100)}%, var(--chrome))`

export function Appearance({ data }: { data: OptionsData }) {
  const { config, patch } = data
  /** the styles list's writes, its heading's Restore among them: one that lands takes a refused deletion's line away */
  const styleWrites = useListWrites(patch)
  if (!config) return null
  const k = O.search.keywords
  return (
    <>
      <Card>
        <Row row="appearance/theme" words={k['appearance/theme']} label={O.appearance.theme}
          trailing={<Segmented label={O.appearance.theme} value={config.theme} options={THEMES.map(t => ({ value: t, label: O.appearance.themes[t], icon: <Icon node={GLYPHS[t]} size={14} /> }))}
            onChange={theme => void patch(latest => ({ ...latest, theme }))} />} />
        <Reveal open={config.theme !== 'light'}>
          <Row level={1} toggles row="appearance/dim" words={k['appearance/dim']} label={O.appearance.dim} description={O.appearance.dimHint}
            trailing={<Switch label={O.appearance.dim} checked={config.pdfReader.dimPages} onChange={on => void patch(latest => ({ ...latest, pdfReader: { ...latest.pdfReader, dimPages: on } }))} />} />
        </Reveal>
      </Card>
      <GroupHeading title={O.appearance.styles}
        action={<Button type="button" kind="text" size="md" onClick={() => void styleWrites.write(latest => ({ ...latest, appearance: resetBuiltIns(latest.appearance, 'styles') }))}>{O.appearance.restore}</Button>} />
      <Styles data={data} writes={styleWrites} />
      <Card gap row="appearance/highlight">
        <Row toggles words={k['appearance/highlight']} label={S.rows.highlight} description={O.appearance.highlightHint}
          trailing={<Switch label={S.rows.highlight} checked={config.reading.sentenceHighlight} onChange={on => void patch(latest => ({ ...latest, reading: { ...latest.reading, sentenceHighlight: on } }))} />} />
        <Reveal open={config.reading.sentenceHighlight}>
          <Row level={1} label={O.appearance.colour} trailing={<HighlightSwatches config={config} patch={patch} />} />
        </Reveal>
      </Card>
    </>
  )
}

/** The highlight's colours (§6.4): its profiles as swatches, as the reader's reading options show them, and one of one's own */
function HighlightSwatches({ config, patch }: { config: Config; patch: OptionsData['patch'] }) {
  const a = config.appearance
  const choose = (id: string) => void patch(latest => ({ ...latest, appearance: { ...latest.appearance, activeHighlight: id } }))
  const setOwn = (color: string) => void patch(latest => {
    const list = latest.appearance.highlights
    const highlights = list.some(h => h.id === OWN_HIGHLIGHT_ID)
      ? list.map(h => (h.id === OWN_HIGHLIGHT_ID ? { ...h, color } : h))
      : [...list, { id: OWN_HIGHLIGHT_ID, name: O.appearance.pickColour, color, opacity: OWN_STRENGTH }]
    return { ...latest, appearance: { ...latest.appearance, highlights, activeHighlight: OWN_HIGHLIGHT_ID } }
  })
  const own = a.highlights.find(h => h.id === OWN_HIGHLIGHT_ID)
  return (
    <span className="o-swatches">
      {a.highlights.filter(h => h.id !== OWN_HIGHLIGHT_ID).map(h => (
        <button key={h.id} type="button" className="swatch o-swatch" aria-label={profileName(h, 'highlights')} title={profileName(h, 'highlights')}
          aria-pressed={h.id === a.activeHighlight} style={{ background: band(h) }} onClick={() => choose(h.id)} />
      ))}
      <ColourPick label={O.appearance.pickColour} value={own?.color} pressed={a.activeHighlight === OWN_HIGHLIGHT_ID} onPick={setOwn} />
    </span>
  )
}

/** `fallback` is the id the deletion handed the choice to: undo returns the choice to the deleted style only if
 *  nothing else was picked in the meantime (fix round 1, item 3) */
interface GoneStyle { profile: StyleProfile; index: number; active: boolean; fallback: string; focus: boolean }

/** The translation styles (§6.4): one card, one radio group; a row a style, its editor under it; the new-style row last */
function Styles({ data, writes }: { data: OptionsData; writes: ListWrites<Config> }) {
  const a = data.config!.appearance
  const [editing, setEditing] = useState<string | null>(null)
  const drawn = useLinger(editing)
  const [gone, setGone] = useState<GoneStyle[]>([])
  /** a style just made or duplicated: its row comes in with §8's row motion */
  const [fresh, setFresh] = useState<string | null>(null)
  const radios = useRef(new Map<string, HTMLElement>())
  /** a row brought back is focused once it is drawn (ui/lists.ts) */
  const focusDrawn = useFocusWhenDrawn(id => radios.current.get(id))
  const newStyleButton = useRef<HTMLButtonElement>(null)
  const k = O.search.keywords
  const setLooks = (fn: (c: Looks) => Looks) => writes.write(latest => ({ ...latest, appearance: fn(latest.appearance) }))
  const choose = (id: string) => void setLooks(c => ({ ...c, activeStyle: id }))
  const open = (id: string) => { choose(id); setEditing(id) }
  const close = (id: string) => { setEditing(null); radios.current.get(id)?.focus() }
  const add = (next: StyleProfile) => {
    void setLooks(c => ({ ...c, styles: [...c.styles, next], activeStyle: next.id }))
    setFresh(next.id)
    setEditing(next.id)
  }
  const remove = (p: StyleProfile) => {
    const index = a.styles.findIndex(s => s.id === p.id)
    const remaining = a.styles.filter(s => s.id !== p.id)
    const fallback = remaining[0]?.id ?? BUILT_IN_STYLES[0]!.id
    const g: GoneStyle = { profile: p, index, active: a.activeStyle === p.id, fallback, focus: !document.documentElement.hasAttribute('data-axt-pointer') }
    setGone(x => [...x, g])
    setEditing(null)
    // the chosen one deleted: the first of the list takes over, never nothing. Refused, the style is still stored:
    // its row stays, and takes back the focus its undo row held as that row goes (Task 65)
    void writes.attempt(latest => {
      const c = latest.appearance
      const styles = c.styles.filter(s => s.id !== p.id)
      return { ...latest, appearance: { ...c, styles, activeStyle: c.activeStyle === p.id ? styles[0]?.id ?? BUILT_IN_STYLES[0]!.id : c.activeStyle } }
    }).then(done => {
      if (done) return
      if (undoHasFocus(p.id)) radios.current.get(p.id)?.focus()
      setGone(x => x.filter(y => y !== g))
    })
  }
  const undo = (g: GoneStyle) => {
    setGone(x => x.filter(y => y !== g))
    // the write is a real round trip (patch()): the row the focus is meant to land on may not exist until it resolves
    // (fix round 1, item 2) and is drawn, which the focus waits for (Part 7's final review); the choice returns only if
    // nothing else was picked while the window was open (item 3). Refused, the style stays deleted: its undo row comes
    // back with a fresh 5 s (round 3, item 3)
    void writes.attempt(latest => {
      const c = latest.appearance
      return c.styles.some(s => s.id === g.profile.id) ? latest
        : { ...latest, appearance: { ...c, styles: insertAt(c.styles, g.index, g.profile), activeStyle: g.active && c.activeStyle === g.fallback ? g.profile.id : c.activeStyle } }
    }).then(done => {
      if (done) focusDrawn(g.profile.id)
      else setGone(x => [...x, { ...g, focus: focusLost() }])
    })
  }
  const ids = a.styles.map(s => s.id)
  const keys = radioKeys(ids, a.activeStyle, () => true, choose, i => radios.current.get(ids[i]!)?.focus())
  return (
    <Card role="radiogroup" label={O.appearance.styles} row="appearance/styles"
      // the arrows are the radios' own: a key from the editor's name field, its CSS field or one of its segmented
      // controls must not also choose the neighbouring style (fix round 1, item 1)
      onKeyDown={e => { if ([...radios.current.values()].includes(e.target as HTMLElement)) keys(e) }}>
      {withUndo(a.styles, gone).map(entry => {
        if ('gone' in entry) {
          const g = entry.gone
          return (
            <UndoRow key={`gone-${g.profile.id}`} item={g.profile.id} name={profileName(g.profile, 'styles')} focus={g.focus} onUndo={() => undo(g)}
              onExpire={hadFocus => {
                setGone(x => x.filter(y => y !== g))
                // the undo row it stood in is gone: land the focus on the row still there (fix round 1, item 2)
                if (hadFocus) requestAnimationFrame(() => newStyleButton.current?.focus())
              }} />
          )
        }
        const s = entry.item
        const name = profileName(s, 'styles')
        return (
          <Fragment key={s.id}>
            <Row kind="radio" checked={s.id === a.activeStyle} onChoose={() => choose(s.id)} label={name} words={k['appearance/styles']} arriving={fresh === s.id}
              description={O.reading.previewTarget} sample={styleSample(s)}
              radioRef={el => { if (el) radios.current.set(s.id, el); else radios.current.delete(s.id) }}
              trailing={
                <IconButton icon={Pencil} label={O.appearance.edit(name)} hover aria-expanded={editing === s.id}
                  // the pencil toggles: pressed again on its own open editor, it closes it (fix round 1, item 6)
                  onClick={() => (editing === s.id ? close(s.id) : open(s.id))} />
              } />
            <Reveal open={editing === s.id}>
              {drawn === s.id && (
                <StyleEditor value={s}
                  // a partial change merged onto the *latest* stored profile, not onto this render's `s` (item 4)
                  onChange={over => setLooks(c => ({ ...c, styles: c.styles.map(x => (x.id === s.id ? { ...x, ...over } : x)) }))}
                  onDone={() => close(s.id)} onDuplicate={() => add(duplicateStyle(s, copyName(s, 'styles')))} onDelete={() => remove(s)} />
              )}
            </Reveal>
          </Fragment>
        )
      })}
      <Row kind="button" quiet lead={<Icon node={Plus} size={14} />} label={O.appearance.create} buttonProps={{ ref: newStyleButton }}
        onPress={() => add({ ...BUILT_IN_STYLES[0]!, id: newProfileId('style'), name: O.appearance.newStyle })} />
      {writes.failed && <p className="o-list-note" role="status"><Status tone="alert">{O.saveFailed}</Status></p>}
    </Card>
  )
}
