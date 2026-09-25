// The PDF reader (the reader's design, §9.3): whether arXiv's PDFs open in it, and the three reading options its own
// menu shows — the same values, in the same words (R), so a change here is the reader's too, and the other way round.
// Every control writes at once, as on the rest of the page.
import type { Config } from '@/config/schema'
import { Row } from '@/ui/Field'
import { Segmented } from '@/ui/Segmented'
import { Switch } from '@/ui/Switch'
import { O, R } from '@/ui/strings'
import type { OptionsData } from '../data'

const APPEARANCES = ['light', 'dark', 'system'] as const

export function PdfReader({ data }: { data: OptionsData }) {
  const { config, patch } = data
  if (!config) return null
  const reader = config.pdfReader
  const set = (change: Partial<Config['pdfReader']>) => void patch(latest => ({ ...latest, pdfReader: { ...latest.pdfReader, ...change } }))
  return (
    <div className="rounded-card border border-line bg-card px-3.5">
      <Row label={O.pdfReader.enabled}>
        <Switch checked={reader.enabled} onChange={enabled => set({ enabled })} label={O.pdfReader.enabled} />
      </Row>
      <Row label={R.sync}>
        <Switch checked={reader.sync} onChange={sync => set({ sync })} label={R.sync} />
      </Row>
      <Row label={R.options.appearance}>
        {/* the bar's own width: in a row, a segmented bar shrinks to its words and breaks the longest */}
        <div className="w-[240px] shrink-0">
          <Segmented
            value={reader.appearance}
            options={APPEARANCES.map(value => ({ value, label: R.options[value], title: R.options[value] }))}
            onChange={appearance => set({ appearance })}
          />
        </div>
      </Row>
      <Row label={R.options.dim}>
        <Switch checked={reader.dimPages} onChange={dimPages => set({ dimPages })} label={R.options.dim} />
      </Row>
    </div>
  )
}
