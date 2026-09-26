// Menus (Part 3, Task 19): the service menu on two lines, with a pack to download, one downloading and the way to manage
// the services; the style menu, each style's sample drawn in it and marked as Chinese; the language menu with its
// search, in the reader's rows, each name marked as its language. The last pick or action is written under them, for
// the probe
import { type CSSProperties, useState } from 'react'
import { BUILT_IN_STYLES } from '@/config/appearance'
import { toBcp47 } from '@/config/languages'
import { languageItems } from '@/pdf-reader/ui/languages'
import { styleTile } from '@/ui/appearance/tiles'
import { Button } from '@/ui/controls/Button'
import { MenuList, type MenuListItem } from '@/ui/controls/MenuList'
import { Popover, usePopover } from '@/ui/controls/Popover'
import { PREVIEW_TARGET, S, profileName } from '@/ui/strings'

function Menu({ name, label, items, layout, search, noMatch, onEvent }: { name: string; label: string; items: MenuListItem[]; layout?: 'inline' | 'two-line'; search?: string; noMatch?: string; onEvent: (event: string) => void }) {
  const pop = usePopover('listbox')
  const shut = () => document.getElementById(pop.popover.id)?.hidePopover()
  return (
    <>
      <Button data-menu={name} {...pop.trigger} style={{ anchorName: pop.anchor } as CSSProperties}>{label}</Button>
      <Popover {...pop.popover} role="listbox" label={label}>
        <MenuList key={pop.generation} kind="listbox" label={label} layout={layout} search={search} noMatch={noMatch} items={items} onClose={shut}
          onPick={id => { onEvent(`pick:${id}`); shut() }} onAction={id => onEvent(`action:${id}`)} />
      </Popover>
    </>
  )
}

export function Menus() {
  const [last, setLast] = useState('')
  const services: MenuListItem[] = [
    { id: 'microsoft', name: S.service.microsoft, hint: S.service.free, checked: true },
    { id: 'google', name: S.service.google, hint: S.service.free },
    { id: 'chrome', name: S.service.chrome, hint: S.service.chrome_ready, disabled: true, action: { label: S.service.chrome_download } },
    { id: 'chrome-busy', name: S.service.chrome, hint: S.service.chrome_downloading, disabled: true, action: { label: S.service.chrome_download, busy: true } },
    { id: 'manage', name: S.service.manage, manage: true },
  ]
  const styles: MenuListItem[] = [
    // the sample is the Chinese preview sentence whatever the interface (locales/preview.ts): marked as such
    ...BUILT_IN_STYLES.map((style, i) => ({ id: style.id, name: profileName(style), hint: PREVIEW_TARGET, preview: styleTile(style), lang: 'zh-CN', checked: i === 0 })),
    { id: 'manage', name: S.rows.manageStyles, manage: true },
  ]
  // each language written in its own name, and marked as that language
  const languages: MenuListItem[] = languageItems('cmn').map(({ selected, ...item }) => ({ ...item, checked: selected, lang: toBcp47(item.id) }))
  return (
    <>
      <div data-row>
        <Menu name="services" label={S.rows.service} items={services} layout="two-line" onEvent={setLast} />
        <Menu name="styles" label={S.rows.style} items={styles} onEvent={setLast} />
        <Menu name="languages" label={S.rows.language} items={languages} search={S.menu.searchLanguages} noMatch={S.menu.noMatch} onEvent={setLast} />
      </div>
      <output data-last>{last}</output>
    </>
  )
}
