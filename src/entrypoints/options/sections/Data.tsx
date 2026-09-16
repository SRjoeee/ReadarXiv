// Data: what the extension keeps on this machine — the translation cache, and the diagnostics log a reader can
// download to attach to an issue (issue #156).
import { useState } from 'react'
import { sendMessage } from '@/shared/messages'
import { Button } from '@/ui/Button'
import { Confirm } from '@/ui/Confirm'
import { downloadTextFile } from '@/shared/download'
import { O } from '@/ui/strings'
import type { OptionsData } from '../data'

export const DIAGNOSTICS_FILE_NAME = 'read-arxiv-diagnostics.json'

export function Data({ data }: { data: OptionsData }) {
  const { cache, cacheError, clearCache, cacheCleared } = data
  const [exportFailed, setExportFailed] = useState(false)
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
    <div className="rounded-card border border-line bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold">{O.data.cache}</span>
          <span className="text-[11px] text-fg-2">
            {/* Unreadable is reported as unreadable: shown as “0 entries”, a failure would make the reader think the cache is empty (Codex on #52) */}
            {cacheError ? O.data.cacheError : cache ? O.data.cacheLine(cache.entries, (cache.bytes / 1024 / 1024).toFixed(1)) : '…'}
          </span>
        </span>
        {cacheCleared
          ? <span className="text-[12px] font-semibold text-fg-2">{O.data.cleared}</span>
          : <Confirm label={O.data.clear} confirmLabel={O.data.clearConfirm} cancelLabel={O.services.cancel} onConfirm={() => void clearCache()} />}
      </div>
      <p className="mt-2 text-[11px] text-fg-2">{O.data.cacheHint}</p>
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold">{O.data.diagnostics}</span>
          <span className="text-[11px] text-fg-2">{exportFailed ? O.data.diagnosticsError : O.data.diagnosticsHint}</span>
        </span>
        <Button variant="text" onClick={() => void exportDiagnostics()}>{O.data.diagnosticsExport}</Button>
      </div>
    </div>
  )
}
