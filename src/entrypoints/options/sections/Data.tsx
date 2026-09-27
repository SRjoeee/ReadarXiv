// The data section (the redesign's design, §6.6): what the extension keeps on this machine — the translation cache, the PDF reader's
// translated papers (the reader's design, §9.3) — each cleared with a confirm in place, and the diagnostics log a
// reader can download to attach to an issue (issue #156). A store that cannot be read says so (S-O-71): shown as an
// empty one, a failure would make the reader think there is nothing there (Codex on #52)
import { useState } from 'react'
import { downloadTextFile } from '@/shared/download'
import { sendMessage } from '@/shared/messages'
import { Button } from '@/ui/controls/Button'
import { O } from '@/ui/strings'
import type { OptionsData } from '../data'
import { usePdfTranslations } from '../pdf-translations'
import { Card } from '../ui/Card'
import { ConfirmButton } from '../ui/ConfirmButton'
import { Row } from '../ui/Row'

export const DIAGNOSTICS_FILE_NAME = 'read-arxiv-diagnostics.json'

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)

export function Data({ data }: { data: OptionsData }) {
  const { cache, cacheError, clearCache, cacheCleared } = data
  const pdf = usePdfTranslations()
  const [exportFailed, setExportFailed] = useState(false)
  const k = O.search.keywords
  const exportDiagnostics = async () => {
    try {
      const payload = await sendMessage({ type: 'axt:diag-export' })
      downloadTextFile(DIAGNOSTICS_FILE_NAME, JSON.stringify(payload, null, 2), 'application/json')
      setExportFailed(false)
    } catch {
      setExportFailed(true)
    }
  }
  return (
    <Card>
      <Row row="data/cache" words={k['data/cache']} label={O.data.cache}
        description={cacheError ? O.data.cacheError : cache ? O.data.cacheLine(cache.entries, mb(cache.bytes)) : '…'}
        trailing={<ConfirmButton label={O.data.clear} confirmLabel={O.data.clearConfirm} doneLabel={O.data.cleared} done={cacheCleared} onConfirm={() => void clearCache()} />} />
      <Row row="data/pdf" words={k['data/cache']} label={O.data.pdf}
        description={pdf.failed ? O.data.cacheError : pdf.usage ? O.data.pdfLine(pdf.usage.count, mb(pdf.usage.bytes)) : '…'}
        trailing={<ConfirmButton label={O.data.clear} confirmLabel={O.data.clearConfirm} doneLabel={O.data.cleared} done={pdf.cleared} onConfirm={() => void pdf.clear()} />} />
      <Row row="data/diagnostics" words={k['data/diagnostics']} label={O.data.diagnostics} description={exportFailed ? O.data.diagnosticsError : O.data.diagnosticsHint}
        trailing={<Button type="button" kind="neutral" size="sm" onClick={() => void exportDiagnostics()}>{O.data.diagnosticsExport}</Button>} />
    </Card>
  )
}
