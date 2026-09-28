// The interface language (the redesign's design, §6.1): at the sidebar's foot, a row like the sections' with a globe on
// the icons' edge — the cue that needs no reading, since a reader who cannot read this interface is the one looking for
// it — the value after it, and a menu opening upward whose languages are written in their own names, with `lang`. In
// a narrow window the sheet puts the same control at the end of the mark's row, its menu opening downward (Task 103b:
// one element, placed by the sheet, never a second copy). A search shows it as a row too, which says where it is at
// the window's width. A change reloads the page in the new language once the write has landed and no draft is open
// (shared/surface-config.ts), so nothing is ever half translated and no draft is lost
import { ChevronDown, Globe } from 'lucide'
import type { CSSProperties } from 'react'
import { LOCALE_CODES, LOCALE_NAMES, type LocaleCode } from '@/locales'
import { Icon } from '@/ui/controls/Icon'
import { MenuList } from '@/ui/controls/MenuList'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { O, localeInUse } from '@/ui/strings'
import type { OptionsData } from '../data'
import { Card } from '../ui/Card'
import { shut } from '../ui/lists'
import { Row, Value } from '../ui/Row'

const known = (code: string): code is LocaleCode => Object.hasOwn(LOCALE_NAMES, code)

/**
 * `read`: the settings are in. Until then the value is not said at all — not the browser's (`O.uiLanguageAuto`), which a
 * reader who chose a language would see flip to theirs — and no language is checked: the page's rule, never say one
 * thing and then another (S-O-49c's switch, `.o-unknown`; Part 7's final review). The value keeps its place, out of
 * sight and out of the accessibility tree
 */
function useLanguage(data: OptionsData) {
  const read = data.config !== null
  const chosen = data.config?.uiLanguage ?? 'auto'
  const value = known(chosen) ? LOCALE_NAMES[chosen] : O.uiLanguageAuto
  const items = [
    { id: 'auto', name: O.uiLanguageAuto, checked: read && !known(chosen), lang: localeInUse() },
    ...LOCALE_CODES.map(code => ({ id: code, name: LOCALE_NAMES[code], checked: read && chosen === code, lang: code })),
  ]
  const choose = (code: string) => { if (code !== chosen) void data.patch(latest => ({ ...latest, uiLanguage: code })) }
  return { read, chosen, value, items, choose }
}

/**
 * The menu starts afresh after each close (Popover's generation) and when the choice changes: its active option is taken
 * once, as it is drawn, and the foot is drawn before the settings arrive, so it would open on the browser's language
 * rather than the one chosen
 */
const menuKey = (generation: number, chosen: string) => `${generation}:${chosen}`

export function LanguageFoot({ data }: { data: OptionsData }) {
  const pop = usePopover('listbox')
  const { read, chosen, value, items, choose } = useLanguage(data)
  return (
    <>
      <button type="button" className="o-nav-item o-lang" aria-label={read ? `${O.uiLanguageName}: ${value}` : O.uiLanguageName} {...pop.trigger} style={{ anchorName: pop.anchor } as CSSProperties}>
        <Icon node={Globe} size={14} />
        <span className={read ? 'o-lang-value' : 'o-lang-value o-unknown'}>{value}</span>
        <Icon node={ChevronDown} size={14} />
      </button>
      <Popover {...pop.popover} role="listbox" label={O.uiLanguageName} className="o-lang-menu">
        <MenuList key={menuKey(pop.generation, chosen)} kind="listbox" label={O.uiLanguageName} items={items} onClose={() => shut(pop.popover.id)} onPick={id => { shut(pop.popover.id); choose(id) }} />
      </Popover>
    </>
  )
}

/**
 * The row only a search shows (§6.1): the interface language lives in the sidebar. Its description says where, as the
 * window's width has it — the sidebar's foot, or below 640 px the title row's end (Task 104b)
 */
export function LanguageRow({ data }: { data: OptionsData }) {
  const pop = usePopover('listbox')
  const { read, chosen, value, items, choose } = useLanguage(data)
  return (
    <Card>
      <Row kind="button" row="language/ui" words={O.search.keywords['language/ui']} label={O.uiLanguage} description={O.uiLanguageElsewhere}
        narrowDescription={O.uiLanguageElsewhereNarrow}
        trailing={<Value>{read ? value : <span className="o-unknown">{value}</span>}</Value>} buttonProps={{ ...pop.trigger, style: { anchorName: pop.anchor } as CSSProperties }} />
      <Popover {...pop.popover} role="listbox" label={O.uiLanguageName} className="o-end">
        <MenuList key={menuKey(pop.generation, chosen)} kind="listbox" label={O.uiLanguageName} items={items} onClose={() => shut(pop.popover.id)} onPick={id => { shut(pop.popover.id); choose(id) }} />
      </Popover>
    </Card>
  )
}
