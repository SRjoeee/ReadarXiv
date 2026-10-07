// The settings page (the redesign's design, §6.1): a sidebar — the mark, the search, the four sections, the interface
// language at its foot (Task 53; at the end of the mark's row in a narrow window, Task 103b) — and a column of up to 680
// px holding one section, or every section's matches while a search runs, the two centred as one group (Task 103b). There is no save button: every control writes as it changes. `#<section>/<row>` opens a section at a
// row and lights it. Settings that cannot be read (S-O-02, §6.7) draw a card at the top and the data section alone: the other
// sections would show the defaults as if they were the reader's, and nothing they save is accepted
import { BookOpen, CircleAlert, Database, type IconNode, Languages, Palette, Search, X } from 'lucide'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BrandMark } from '@/ui/BrandMark'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'
import { O, fallbackText } from '@/ui/strings'
import { type OptionsData, useOptionsData } from './data'
import { type Place, SECTIONS, type Section, parseHash, reach } from './hash'
import { Appearance } from './sections/Appearance'
import { Data } from './sections/Data'
import { LanguageFoot, LanguageRow } from './sections/Language'
import { Reading } from './sections/Reading'
import { Translate } from './sections/Translate'
import { Card } from './ui/Card'
import { ConfirmButton } from './ui/ConfirmButton'
import { Row } from './ui/Row'
import { SearchQuery, applySearch } from './ui/search'

const ICONS: Record<Section, IconNode> = { translate: Languages, appearance: Palette, reading: BookOpen, data: Database }

export type Content = Record<Section, (data: OptionsData) => ReactNode>

/** What each section draws. Until its own task replaces it, a section draws the page's parts from before the redesign */
const CONTENT: Content = {
  translate: data => <Translate data={data} />,
  appearance: data => <Appearance data={data} />,
  reading: data => <Reading data={data} />,
  data: data => <Data data={data} />,
}

export function App({ content = CONTENT }: { content?: Content }) {
  const data = useOptionsData()
  const [place, setPlace] = useState<Place>(() => parseHash(location.hash))
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(0)
  const main = useRef<HTMLElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const q = query.trim().toLowerCase()
  const unreadable = data.fallbackReason !== null
  const sections: readonly Section[] = unreadable ? ['data'] : SECTIONS
  const current: Section = sections.includes(place.section) ? place.section : sections[0]!
  const ready = data.config !== null

  // a link followed while the page is open (the reader's settings, a note's settings button)
  useEffect(() => {
    const follow = () => { setQuery(''); setPlace(parseHash(location.hash)) }
    addEventListener('hashchange', follow)
    return () => removeEventListener('hashchange', follow)
  }, [])
  // the row a link asks for is reached once its section is drawn with the settings in it
  useEffect(() => { if (ready && main.current) reach(main.current, place) }, [place, ready])
  // the search's pass over what is drawn, after every render: a row can appear or go under a running search
  useLayoutEffect(() => { if (main.current) setFound(applySearch(main.current, q)) })

  const go = (section: Section) => {
    setQuery('')
    setPlace({ section })
    history.replaceState(null, '', `#${section}`)
  }
  const clear = () => {
    setQuery('')
    field.current?.focus()
  }
  // while searching, every section — and, after the appearance section, the interface language's own row (settings-2's order)
  const shown: (Section | 'language')[] = !q ? [current] : unreadable ? ['data'] : ['translate', 'appearance', 'language', 'reading', 'data']
  return (
    <div className="ui o-frame">
      <aside className="o-side">
        <div className="o-brand"><BrandMark size={20} />{O.title}</div>
        <label className="o-search">
          <Icon node={Search} size={14} />
          <input ref={field} value={query} placeholder={O.search.placeholder} aria-label={O.search.placeholder} autoComplete="off"
            onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); setQuery('') } }} />
          {query && <button type="button" className="o-search-clear" aria-label={O.search.clear} onClick={clear}><Icon node={X} size={14} /></button>}
        </label>
        <nav aria-label={O.title} className="o-nav">
          {sections.map(id => (
            <button key={id} type="button" className="o-nav-item" aria-current={!q && id === current ? 'page' : undefined} onClick={() => go(id)}>
              <Icon node={ICONS[id]} size={14} />
              {O.sections[id]}
            </button>
          ))}
        </nav>
        {!unreadable && <LanguageFoot data={data} />}
      </aside>
      <main ref={main} className="o-main" data-searching={q ? '' : undefined}>
        <div className="o-column">
          {unreadable && <Unreadable data={data} />}
          <SearchQuery.Provider value={q}>
            {shown.map(id => (
              <section key={id} className="o-section" data-section={id}>
                <h1 className="o-title">{id === 'language' ? O.uiLanguage : O.sections[id]}</h1>
                {id === 'language' ? <LanguageRow data={data} /> : content[id](data)}
              </section>
            ))}
          </SearchQuery.Provider>
          {q && found === 0 && (
            <p className="o-empty">{O.search.none(query.trim())} <Button type="button" kind="text" size="sm" onClick={clear}>{O.search.clear}</Button></p>
          )}
          <p className="o-sr" role="status" aria-live="polite">{q ? (found ? O.search.found(found) : O.search.none(query.trim())) : ''}</p>
        </div>
      </main>
    </div>
  )
}

/** S-O-02 (§6.7): what could not be read, why, and the way out, confirmed in place as a cache's clearing is */
function Unreadable({ data }: { data: OptionsData }) {
  return (
    <div className="o-unreadable">
      <Card>
        <Row lead={<Icon node={CircleAlert} className="o-danger" />} label={O.fallbackNotice}
          description={data.fallbackReason ? fallbackText(data.fallbackReason) : undefined}
          trailing={<ConfirmButton label={O.fallbackReset} confirmLabel={O.fallbackResetConfirm} onConfirm={() => void data.reset()} />} />
        {data.resetFailed && <Row quiet label={O.fallbackResetFailed} />}
      </Card>
    </div>
  )
}
