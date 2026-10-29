// The reading section (the redesign's design, §6.5): how a paper is translated, figure text, where a translation opens
// from an abstract or a PDF page, the floating button, the PDF group, and what the PDF reader translates. Every control
// writes at once; the whole-paper way reaches an open paper at once (the session releases what waits, Part 2). The
// floating button's state is not in the configuration: the background, its only writer, is asked (floating-entry.ts)
import { Reveal } from '@/ui/controls/Reveal'
import { Segmented } from '@/ui/controls/Segmented'
import { Switch } from '@/ui/controls/Switch'
import { CLASS_ROWS } from '@/pdf-reader/settings'
import { O, R, S } from '@/ui/strings'
import type { OptionsData } from '../data'
import { useFloatingEntry } from '../floating-entry'
import { Card, GroupHeading } from '../ui/Card'
import { segmentWidth } from '../ui/lists'
import { Row } from '../ui/Row'

const WAYS = ['on-demand', 'whole'] as const
const OPEN_IN = ['new-tab', 'same-tab'] as const

export function Reading({ data }: { data: OptionsData }) {
  const { config, patch } = data
  const floating = useFloatingEntry()
  if (!config) return null
  const k = O.search.keywords
  const setReader = (change: Partial<typeof config.pdfReader>) => void patch(latest => ({ ...latest, pdfReader: { ...latest.pdfReader, ...change } }))
  return (
    <>
      <Card>
        <Row row="reading/way" words={k['reading/way']} label={O.reading.translateWay} description={O.reading.translateWayHints[config.preload === 'whole' ? 1 : 0]} swap
          trailing={descId => <div className="o-seg" style={segmentWidth(220)}><Segmented size="sm" label={O.reading.translateWay} value={config.preload} describedBy={descId}
            options={WAYS.map((value, i) => ({ value, label: O.reading.translateWays[i]! }))} onChange={preload => void patch(latest => ({ ...latest, preload }))} /></div>} />
        <Row toggles row="reading/images" words={k['reading/images']} label={S.rows.images} description={O.reading.imagesHint}
          trailing={<Switch label={S.rows.images} checked={config.image.enabled} onChange={on => void patch(latest => ({ ...latest, image: { enabled: on } }))} />} />
        <Row row="reading/open-in" words={k['reading/open-in']} label={O.reading.openIn} description={O.reading.openInHint}
          trailing={descId => <div className="o-seg" style={segmentWidth(200)}><Segmented size="sm" label={O.reading.openIn} value={config.reading.openIn} describedBy={descId}
            options={OPEN_IN.map((value, i) => ({ value, label: O.reading.openInStops[i]! }))} onChange={openIn => void patch(latest => ({ ...latest, reading: { ...latest.reading, openIn } }))} /></div>} />
        <Row toggles row="reading/floating" words={k['reading/floating']} label={O.reading.floatingEntry} description={O.reading.floatingEntryHint}
          // the page cannot say a state it does not know: while the background has not answered, the switch is held
          // in place (o-unknown, visibility: hidden) rather than shown on, which would say "on" and then flip
          trailing={<span className={floating.enabled === null ? 'o-unknown' : undefined}>
            <Switch label={O.reading.floatingEntry} checked={floating.enabled === true} onChange={floating.setEnabled} />
          </span>} />
      </Card>
      <GroupHeading title={O.reading.pdf} />
      <Card row="reading/pdf">
        <Row toggles words={k['reading/pdf']} label={O.reading.pdfEnabled} description={O.reading.pdfEnabledHint}
          trailing={<Switch label={O.reading.pdfEnabled} checked={config.pdfReader.enabled} onChange={enabled => setReader({ enabled })} />} />
        <Reveal open={config.pdfReader.enabled}>
          <Row level={1} toggles label={R.sync} description={O.reading.syncHint}
            trailing={<Switch label={R.sync} checked={config.pdfReader.sync} onChange={sync => setReader({ sync })} />} />
        </Reveal>
      </Card>
      {/* what the PDF reader translates (S-O-56): the reading options' group (S-R-27), its words and order, under its own heading,
          whose aside says it is the PDF's alone — the HTML page translates every part, and its figure text is the switch above.
          Shown whether the reader opens arXiv's PDFs or not: #readarxiv opens it either way */}
      <GroupHeading title={R.classes.name} aside={O.reading.classesAside} />
      <Card row="reading/classes">
        {CLASS_ROWS.map(t => (
          <Row key={t} toggles words={k['reading/classes']} label={R.classes[t]}
            trailing={<Switch label={R.classes[t]} checked={config.pdfReader.classes[t]} onChange={on => void patch(latest => ({ ...latest, pdfReader: { ...latest.pdfReader, classes: { ...latest.pdfReader.classes, [t]: on } } }))} />} />
        ))}
      </Card>
    </>
  )
}
