// Segmented controls (Part 3, Task 18): equal segments — the appearance with its icons and words, the underline's five
// small ones, the appearance as icons alone — and segments that take their words' widths at the popup's width, the
// display, once more with a display the page cannot show
import { Columns2, Monitor, Moon, Rows2, Sun, Type } from 'lucide'
import { useState } from 'react'
import { Icon } from '@/ui/controls/Icon'
import { Segmented } from '@/ui/controls/Segmented'
import { O, R, S } from '@/ui/strings'

type Theme = 'system' | 'light' | 'dark'
type Line = 'none' | 'solid' | 'dotted' | 'dashed' | 'wavy'
type Mode = 'side' | 'stack' | 'only'

export function Segments() {
  const [theme, setTheme] = useState<Theme>('system')
  const [line, setLine] = useState<Line>('none')
  const [mode, setMode] = useState<Mode>('side')
  const [readerMode, setReaderMode] = useState<Mode>('only')
  const themes = [
    { value: 'system' as const, label: R.options.system, icon: <Icon node={Monitor} size={14} /> },
    { value: 'light' as const, label: R.options.light, icon: <Icon node={Sun} size={14} /> },
    { value: 'dark' as const, label: R.options.dark, icon: <Icon node={Moon} size={14} /> },
  ]
  const lines = (['none', 'solid', 'dotted', 'dashed', 'wavy'] as const).map(value => ({ value, label: O.reading.underlines[value] }))
  const modes = (stacks: boolean) => [
    { value: 'side' as const, label: S.mode.side, icon: <Icon node={Columns2} /> },
    { value: 'stack' as const, label: S.mode.stack, icon: <Icon node={Rows2} />, ...(stacks ? {} : { disabled: true, title: S.mode.stackPdf }) },
    { value: 'only' as const, label: S.mode.only, icon: <Icon node={Type} /> },
  ]
  return (
    <>
      <div data-row data-seg="equal"><Segmented label={R.options.appearance} value={theme} options={themes} onChange={setTheme} /></div>
      <div data-row data-seg="small"><Segmented label={O.reading.underline} value={line} options={lines} onChange={setLine} size="sm" /></div>
      <div data-row data-seg="icons"><Segmented label={R.options.appearance} value={theme} options={themes} onChange={setTheme} size="sm" iconsOnly /></div>
      <div data-row data-seg="fit" className="popup-width"><Segmented label={R.display.name} value={mode} options={modes(true)} onChange={setMode} fit /></div>
      <div data-row data-seg="fit-disabled" className="popup-width"><Segmented label={R.display.name} value={readerMode} options={modes(false)} onChange={setReaderMode} fit /></div>
    </>
  )
}
