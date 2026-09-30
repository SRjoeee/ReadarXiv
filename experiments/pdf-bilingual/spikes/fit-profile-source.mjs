// Pinned-source pilot: alter only typography, preserving the cached translation and native graphics.
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { readLines, SIZE_TEX } from './lock.mjs'
import { digest } from './fit-profiles.mjs'
export const walk = dir => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p] })
export function prepareProfileSource(source, dest, profile) {
  if (existsSync(dest)) throw new Error('Use a fresh output directory; no existing experiment is overwritten')
  const databases = walk(source).filter(f => f.endsWith('.fdb_latexmk'))
  if (databases.length !== 1) throw new Error('Ambiguous compile database')
  const entry = readFileSync(databases[0], 'utf8').match(/^\["(?:pdf|xe|lua)latex"\] [\d.]+ "([^"]+\.tex)"/m)?.[1]
  const main = entry && join(source, entry)
  if (!main || !existsSync(main)) throw new Error('No compiled main TeX source')
  const stem = basename(main, '.tex'), log = readFileSync(join(source, `${stem}.log`), 'latin1')
  const ids = [...readLines(log).keys()]
  cpSync(source, dest, { recursive: true, filter: f => !/\.(?:aux|log|fls|fdb_latexmk|xdv|out|toc|synctex\.gz)$/.test(f) && f !== join(source, `${stem}.pdf`) })
  const files = walk(dest).filter(f => f.endsWith('.tex')), inputs = [], unitSet = new Set(ids)
  let changes = 0, markers = 0
  for (const f of files) {
    const before = readFileSync(f, 'utf8')
    let after = before
    if (relative(dest, f) === relative(source, main)) {
      const matches = [...after.matchAll(/\\else ([\d.]+)\\baselineskip\\fi/g)]
      if (matches.length !== 1) throw new Error('Unexpected leading scaffold')
      after = after.replace(/\\else ([\d.]+)\\baselineskip\\fi/, `\\else ${profile.lead.toFixed(4)}\\baselineskip\\fi`)
      if (profile.cjk) {
        if (!/\\setCJKmainfont\[Scale=[\d.]+/.test(after)) throw new Error('Unexpected CJK font scaffold')
        after = after.replace(/(\\setCJKmainfont\[Scale=)[\d.]+/, `$1${profile.scale.toFixed(4)}`)
        if (profile.track > 0.0005) after = after.replace('\\begin{document}', `\\xeCJKsetup{CJKglue={\\hskip ${profile.track.toFixed(4)}em plus 0.08\\baselineskip}}\n\\begin{document}`)
      } else {
        after = SIZE_TEX + ids.map(i => `\\expandafter\\def\\csname axtsize@${i}\\endcsname{${profile.scale.toFixed(4)}}\n`).join('') + after
      }
    }
    if (!profile.cjk) after = after.replace(/\\axtlines\{(\d+)\}\\axtlead\{\1\}/g, (m, id) => { if (!unitSet.has(Number(id))) return m; markers++; return m.replace('\\axtlead', `\\axtsize{${id}}\\axtlead`) })
    const body = s => s.slice(s.includes('\\begin{document}') ? s.indexOf('\\begin{document}') : 0).replace(/\\axtsize\{\d+\}/g, '')
    if (body(before) !== body(after)) throw new Error('Translated body changed')
    inputs.push({ file: relative(dest, f), beforeHash: digest(before), afterHash: digest(after), bodyHash: digest(body(before)) })
    if (after !== before) { changes++; writeFileSync(f, after) }
  }
  return { main: relative(source, main), stem, ids: ids.length, markers, changes, inputs }
}
