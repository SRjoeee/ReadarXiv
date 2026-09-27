// A paper's two ways in (the redesign's design, §5.5; S-P-50b): the HTML entry with a globe, the PDF entry with a document, brand
// buttons side by side, equal widths; the one that cannot be used greyed. An entry page draws them, and P0 for a paper
// it names
import { FileText, Globe } from 'lucide'
import { Button } from '@/ui/controls/Button'

export interface EntryButton { label: string; disabled: boolean; run: () => void }

export function Entries({ html, pdf }: { html: EntryButton; pdf: EntryButton }) {
  const press = (entry: EntryButton) => () => { if (!entry.disabled) entry.run() }
  return (
    <div className="twin">
      <Button kind="brand" size="lg" icon={Globe} disabled={html.disabled} onClick={press(html)}>{html.label}</Button>
      <Button kind="brand" size="lg" icon={FileText} disabled={pdf.disabled} onClick={press(pdf)}>{pdf.label}</Button>
    </div>
  )
}
