// A compile's TeX errors and the units they stand in: live.mjs's safety net, which sets a unit TeX cannot set in the
// source so that the rest of the paper is set translated (experiments/pdf-bilingual/plans/2026-10-04-compile-resilience.md,
// Task 2). The same for native nonstop latexmk, which logs every error, and for the TeX page's BusyTeX, which halts on
// the first: TeX writes each as `! <message>`, the levels of input it was reading, and at the base level `l.<n>`, the
// line of the file it was reading and the text of that line before and after its place
import { lastTexLog } from './latex-front.mjs'

/**
 * TeX's errors in a compile's last pass, each with the line of input TeX was reading and the text around its place:
 * { message, line, before, after }, and `char`, the code point of a letter lost (an error under \tracinglostchars=3, or
 * LaTeX's "Unicode character … not set up"). An error with no line of input (`<*>`, the end of the job) is left out, as
 * is one the output routine or a \write raised (`<output>`, `<write>`): TeX was then reading whatever line it was, in
 * whichever unit, while setting a page's head or a note to a file
 */
export function texErrors(log) {
  const lines = lastTexLog(log ?? '').split('\n'), out = []
  for (let k = 0; k < lines.length; k++) {
    if (!lines[k].startsWith('! ')) continue
    let message = lines[k].slice(2), elsewhere = false
    for (let j = k + 1; j < Math.min(lines.length, k + 40) && !lines[j].startsWith('! '); j++) {
      const m = /^l\.(\d+) ?(.*)$/.exec(lines[j])
      if (!m) {
        // a message longer than a log line goes on on the next (TeX wraps at 79 columns)
        if (j === k + 1 && !/^[<\\]/.test(lines[j]) && lines[j].trim()) message += lines[j]
        if (/^<(?:output|write)>/.test(lines[j])) elsewhere = true
        continue
      }
      if (elsewhere) break
      const char = /^Missing character: There is no .*?\(U\+([0-9A-F]+)\)|^LaTeX Error: Unicode character .*?\(U\+([0-9A-F]+)\)/.exec(message)
      out.push({ message, line: Number(m[1]), before: m[2].replace(/^\.\.\./, ''), after: (lines[j + 1] ?? '').trim().replace(/\.\.\.$/, ''), ...(char ? { char: parseInt(char[1] ?? char[2], 16) } : {}) })
      break
    }
  }
  return out
}

/**
 * The text of a line as TeX's log and the file agree on it, whatever either's encoding: its ASCII, spaces left out. A
 * native log is read as Latin-1, BusyTeX's as text, and TeX writes a letter past ASCII as its bytes or as ^^ codes; the
 * file's line is bytes, read either way
 */
const skeleton = s => s.replace(/\^\^\^\^[0-9a-f]{4}|\^\^[0-9a-f]{2}|\^\^[@-_?]/g, '').replace(/[^\x21-\x7e]/g, '')
/** how much of the text before and after an error's place must be found on its line */
const CONTEXT = 12
/** whether the text holds an error's context: the last characters before its place, and the first after; at least one
 *  of them there to look for */
const holds = (text, e) => {
  const b = skeleton(e.before).slice(-CONTEXT), a = skeleton(e.after).slice(0, CONTEXT), l = skeleton(text)
  return (!!b || !!a) && (!b || l.includes(b)) && (!a || l.includes(a))
}
const latin1Of = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s }
/** line `n` of a file's bytes (1-based), and where it begins */
const lineAt = (bytes, n) => {
  let at = 0
  for (let k = 1; k < n; k++) { at = bytes.indexOf(10, at) + 1; if (!at) return null }
  const end = bytes.indexOf(10, at)
  return { from: at, to: end < 0 ? bytes.length : end }
}

/**
 * The units whose lines hold the errors: `files`, path → the bytes a compile was given; `lines`, each unit's
 * { file, unit, first, last, from?, to? } in them, its lines and its bytes (live.mjs translationFiles' `spans`). An
 * error is a unit's when one file the compile was given has a unit on the error's line whose text there holds the
 * error's context — so that a package's own line `n` is not the paper's — and that unit is one: where units share the
 * line, the one whose own bytes on it hold the context. A lost letter is a unit's only when the unit holds the letter.
 * Two files that fit, or none, place nothing
 */
export function unitsAtErrors(errors, files, lines) {
  const out = new Set()
  const text = (bytes, from, to) => { const b = bytes.subarray(from, to); return [latin1Of(b), new TextDecoder().decode(b)] }
  for (const e of errors) {
    const at = lines.filter(x => x.first <= e.line && e.line <= x.last)
    const fits = []
    for (const file of new Set(at.map(x => x.file))) {
      const bytes = files.get(file), line = bytes && lineAt(bytes, e.line)
      if (!line || !text(bytes, line.from, line.to).some(t => holds(t, e))) continue
      const here = at.filter(x => x.file === file)
      // where units share the line: the one whose own bytes on it hold the context
      const own = here.length === 1 ? here : here.filter(x => x.from !== undefined && text(bytes, Math.max(line.from, x.from), Math.min(line.to, x.to)).some(t => holds(t, e)))
      fits.push(...own.map(x => ({ ...x, bytes })))
    }
    if (fits.length !== 1) continue
    const [fit] = fits
    if (e.char !== undefined && !text(fit.bytes, fit.from ?? lineAt(fit.bytes, fit.first)?.from ?? 0, fit.to ?? lineAt(fit.bytes, fit.last)?.to ?? fit.bytes.length)[1].includes(String.fromCodePoint(e.char))) continue
    out.add(fit.unit)
  }
  return [...out]
}
