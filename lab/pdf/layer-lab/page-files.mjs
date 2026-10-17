// lab/pdf/layer-lab/page-files.mjs
// The files serve.mjs serves at /lab/ (the page and its own modules), and the check that every module they import by a
// relative path is among them: a module left out leaves the page without its script (a failed import, a lab that does not
// load), which only opening the page showed. serve.mjs applies the check before it listens.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PAGE_FILES = new Set([
  'index.html', 'lab.mjs', 'lab.css', 'strings.mjs', 'rules-model.mjs', 'rules-panel.mjs', 'layer.mjs', 'proto.mjs',
  'doc-loads.mjs', 'notes.mjs', 'run-slot.mjs',
])

/** the relative imports (static or dynamic) of the page's modules and the files the page itself names, each with the file that names it, that PAGE_FILES does not serve */
export function unservedImports(dir, files = PAGE_FILES) {
  const missing = []
  for (const file of files) {
    if (!/\.(mjs|html)$/.test(file)) continue
    const source = readFileSync(join(dir, file), 'utf8')
    const re = file.endsWith('.html')
      ? /(?:src|href)="\/lab\/([^"]+)"/g
      : /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]\.\/([^'"]+)['"]/g
    for (const m of source.matchAll(re)) if (!files.has(m[1])) missing.push(`${file} -> ${m[1]}`)
  }
  return missing
}
