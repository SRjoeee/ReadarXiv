// The PDF download of the rebuilt reader (UI.md S-R-09, PDF-READER §11.12), as the extension's reader gives it: the download
// menu's two files greyed until the final translation is on screen, each made in the page and saved by the browser under its
// name, read back (the translation's characters as text, the side-by-side's pages twice as wide); one at a time, the file being
// made's share in the capsule with its cancel; a cancel saving nothing; a failure (the add-on not read whole) with its retry,
// which makes the file; and the same from the reading options in a window too narrow for the bar's own menu. The stand-in
// serves its face as WOFF2, as our server serves its slices, so that each file decodes them as a host's reader does (PDF.js's
// worker over the reader's own port, no global worker set: #686), and two files in a row leave the page's workers as they were;
// and a page whose crops' ink sits inside a form (page-in-form.mjs) gives a file that draws every crop's ink (#crops-sharp);
// and on both files every word poppler reads stands on ink and in its own half (a crop's form holds its own ink alone: a
// clipped-away copy of a paragraph's other formulas is text a viewer selects where nothing is drawn, lane export-select).
// Called by reader-v2.mjs with its context, its stand-in and its reporting.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lex, openObjects } from '../../packages/engine/src/index.ts'
import { withPageInForm } from './lib/page-in-form.mjs'
import { withWidths } from './lib/with-widths.mjs'

const PL = createRequire(import.meta.url)('@cantoo/pdf-lib')
/** each crop a saved file draws on page `n` (its crop forms, AXTC…), and whether it draws ink: a show of a string, in a render
 *  mode that paints (neither 3, invisible, nor 7, a clip alone), in its form or in a form it draws, down the copies the export
 *  bakes (AXTB…), the mode carried through q and Q and into a form; the per-crop presence the lab reads by pixel */
function cropsIn(path, n) {
  const X = openObjects(new Uint8Array(readFileSync(path)), { PL, objectsMax: 1e6, decodedMax: 1 << 26 })
  const N = (k) => PL.PDFName.of(k)
  const look = (v) => (v instanceof PL.PDFRef ? X.lookup(v) : v)
  const text = (st) => new TextDecoder('latin1').decode(PL.decodePDFRawStream(st).decode())
  const xobj = (res, name) => look(look(look(res)?.get(N('XObject')))?.get(N(name)))
  const SHOW = new Set(['Tj', 'TJ', "'", '"'])
  const string = (a) => a?.t === 'str' && a.b.length > 0
  const ink = (form, tr0 = 0, depth = 0) => {
    let tr = tr0
    const saved = []
    for (const o of lex(PL.decodePDFRawStream(form).decode())) {
      if (o.op === 'q') saved.push(tr)
      else if (o.op === 'Q') tr = saved.pop() ?? tr
      else if (o.op === 'Tr') tr = Number(o.args[0])
      else if (SHOW.has(o.op) && tr !== 3 && tr !== 7 && o.args.some((a) => string(a) || (Array.isArray(a) && a.some(string))))
        return true
      else if (o.op === 'Do' && depth < 12 && /^AXTB\d+$/.test(o.args[0]?.v ?? '')) {
        const f = xobj(form.dict.get(N('Resources')), o.args[0].v)
        if (f instanceof PL.PDFRawStream && ink(f, tr, depth + 1)) return true
      }
    }
    return false
  }
  const page = X.pages()[n - 1]
  return [...text(look(page.node.get(N('Contents')))).matchAll(/\/(AXTC\d+_\d+_\d+) Do/g)].map((m) => {
    const f = xobj(page.node.get(N('Resources')), m[1])
    return { name: m[1], ink: f instanceof PL.PDFRawStream && ink(f) }
  })
}

/** poppler's reading of a saved file's page `n` (pdftotext -bbox) against its own drawing of it (pdftoppm, 144 dpi, grey):
 *  the words with no ink under them, and on a side-by-side page the words across its two halves. Null where poppler is not
 *  installed */
function wordsOnInk(path, n, halves) {
  if (spawnSync('pdftotext', ['-v']).status !== 0 || spawnSync('pdftoppm', ['-v']).status !== 0) return null
  const dir = mkdtempSync(join(tmpdir(), 'axt-ink-'))
  try {
    spawnSync('pdftotext', ['-bbox', '-f', String(n), '-l', String(n), path, join(dir, 'w.html')])
    spawnSync('pdftoppm', ['-r', '144', '-gray', '-f', String(n), '-l', String(n), '-singlefile', path, join(dir, 'p')])
    const html = readFileSync(join(dir, 'w.html'), 'utf8')
    const [, pw] = /<page width="([\d.]+)"/.exec(html) ?? []
    const b = readFileSync(join(dir, 'p.pgm'))
    const head = new TextDecoder('latin1').decode(b.subarray(0, 40)).split(/\s+/)
    const W = Number(head[1]),
      H = Number(head[2])
    const px = b.subarray(b.length - W * H)
    const k = 144 / 72
    const words = [...html.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(
      (m) => ({ box: m.slice(1, 5).map(Number), text: m[5] }),
    )
    const inked = ({ box: [x0, y0, x1, y1] }) => {
      for (let r = Math.max(0, Math.floor(y0 * k)); r < Math.min(H, Math.ceil(y1 * k)); r++)
        for (let c = Math.max(0, Math.floor(x0 * k)); c < Math.min(W, Math.ceil(x1 * k)); c++) if (px[r * W + c] < 200) return true
      return false
    }
    const half = Number(pw) / 2
    return {
      words: words.length,
      noInk: words.filter((w) => !inked(w)).map((w) => w.text),
      across: halves ? words.filter((w) => w.box[0] < half - 0.5 && w.box[2] > half + 0.5).map((w) => w.text) : [],
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** the menu's words in the interface's language the run uses (zh-CN): the button, the rows, the capsule's chips */
const W = { menu: '下载', translation: '译文 PDF', sideBySide: '对照 PDF', cancel: '取消', retry: '重试', options: '阅读选项' }

export async function exportChecks(t) {
  const { api, PAPER, openReader, laid, readerState, setConfig, clearPaperStore, section, check, SHOTS } = t
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  /** a saved file read back by PDF.js: its pages, its first page's width, its text */
  const readBack = async (path) => {
    const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)) })
    const doc = await task.promise
    const page = await doc.getPage(1)
    const text = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ')
    const out = { pages: doc.numPages, width: Math.round(page.getViewport({ scale: 1 }).width), text }
    await task.destroy()
    return out
  }
  /** the file of a row of the download menu (opened from `opener`), saved by the browser: its name and what it reads as; where
   *  the reader fails it instead, `failed`, the reader's own words of the failure (its console's) */
  const press = async (page, opener, row, o = {}) => {
    const said = []
    const heard = (m) => {
      if (/the PDF download failed/.test(m.text())) said.push(m.text())
    }
    page.on('console', heard)
    try {
      await opener()
      const item = page.getByRole('menuitem', { name: row, exact: true })
      const timeout = o.timeout ?? 30_000
      const saved = o.expect === false ? null : page.waitForEvent('download', { timeout }).then((d) => ({ d }), () => ({ why: 'no file in time' }))
      await item.click()
      if (!saved) return null
      const failed = page
        .waitForFunction(() => window.__reader?.controller?.getState().exportFailed != null, null, { timeout })
        .then(() => ({ why: 'the reader failed the file' }), () => new Promise(() => {}))
      const r = await Promise.race([saved, failed])
      if (!r.d) {
        await page.waitForTimeout(200)
        return { failed: said.join(' | ') || r.why }
      }
      const path = join(SHOTS, `export-${o.tag ?? ''}${r.d.suggestedFilename()}`)
      await r.d.saveAs(path)
      return { name: r.d.suggestedFilename(), path, ...(await readBack(path)) }
    } finally {
      page.off('console', heard)
    }
  }
  /** the browser's cache emptied: an object of the layer is immutable, and a file made again reads it from there, never from
   *  the stand-in that holds or refuses it */
  const uncached = async (page) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.clearBrowserCache')
    await cdp.detach()
  }
  const barMenu = (page) => () => page.getByRole('button', { name: W.menu, exact: true }).click()
  /** the reader with its final translation on screen */
  const translated = async (page) =>
    (await laid(page)) &&
    (await page.waitForFunction(() => window.__reader?.controller?.getState().download === 'translation', null, { timeout: 45_000 }).then(() => true, () => false))

  section('the PDF download: the translation\'s file and the side-by-side\'s, made in the page; one at a time, its cancel, its failure and retry, a narrow window')
  {
    api.set({ whole: null })
    await setConfig({ targetLanguage: 'deu' })
    const page = await openReader({ mode: 'bilingual' })
    // greyed until the final translation is on screen
    await barMenu(page)()
    const early = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('[role="menuitem"]')].map((r) => ({ text: r.textContent, disabled: r.getAttribute('aria-disabled') })),
      download: window.__reader.controller.getState().download,
    }))
    await page.keyboard.press('Escape')
    const ready = await translated(page)
    const greyed = early.download !== 'translation' && early.rows.filter((r) => /PDF/.test(r.text ?? '') && r.disabled === 'true').length >= 2
    check('the two files\' rows stand greyed until the final translation is on screen, then are offered', ready && greyed, JSON.stringify(early))

    // (the page's workers before the two files: the decoding of their faces' WOFF2 opens one of the export's own, which each file
    // ends; none is left behind)
    const workersBefore = page.workers().length
    const started = []
    page.on('worker', (w) => {
      const one = { closed: false }
      started.push(one)
      w.on('close', () => {
        one.closed = true
      })
    })
    const tr = await press(page, barMenu(page), W.translation)
    const s = await readerState(page)
    check('the translation\'s file: saved as <id>.<target>.pdf, its translation read as text (the echo\'s), arXiv\'s page width',
      !!tr && tr.name === `${PAPER}v${t.fixture.version}.${s.prefs?.target}.pdf` && /\[echo\]/.test(tr.text) && tr.width < 700, JSON.stringify(tr && (tr.failed ? tr : { name: tr.name, pages: tr.pages, width: tr.width, text: tr.text.slice(0, 80) })))
    // (every crop of the file's page 1 drawn with its ink: the original fixture's, whose crops' groups are marked in the page)
    const cropsHere = tr?.path ? cropsIn(tr.path, 1) : []
    const sbs = await press(page, barMenu(page), W.sideBySide)
    check('the side-by-side file: saved as <id>.<target>.side-by-side.pdf, as many pages, each twice as wide, the translation read on it',
      !!sbs?.name && !!tr?.name && sbs.name.endsWith(`.${s.prefs?.target}.side-by-side.pdf`) && sbs.pages === tr.pages && Math.abs(sbs.width - 2 * tr.width) <= 1 && /\[echo\]/.test(sbs.text), JSON.stringify(sbs && (sbs.failed ? sbs : { name: sbs.name, pages: sbs.pages, width: sbs.width })))
    await page.waitForTimeout(500)
    const workersAfter = page.workers().length
    check('two files in a row: each decodes its faces on a worker of its own and ends it, the page\'s workers as before them', !!tr?.name && !!sbs?.name && workersAfter === workersBefore && started.length === 2 && started.every((w) => w.closed), JSON.stringify({ before: workersBefore, after: workersAfter, started: started.length, closed: started.filter((w) => w.closed).length }))
    const done = await page.evaluate(() => document.querySelector('.capsule')?.textContent ?? '')
    check('the capsule says the file is downloaded', /已下载/.test(done), done)

    await page.close()

    // one at a time, its share and its cancel: the add-on's whole read held, the capsule and the menu read meanwhile (a reader of
    // its own, the papers this machine keeps emptied: a file made before left the add-on there, read whole)
    await clearPaperStore()
    api.set({ whole: 4000 })
    const held = await openReader({ mode: 'bilingual' })
    await translated(held)
    await uncached(held)
    await press(held, barMenu(held), W.sideBySide, { expect: false })
    const working = await held.waitForFunction(() => /正在生成对照 PDF/.test(document.querySelector('.capsule')?.textContent ?? ''), null, { timeout: 5000 }).then(() => true, () => false)
    await barMenu(held)()
    const rows = await held.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((r) => ({ text: r.textContent, disabled: r.getAttribute('aria-disabled'), busy: r.getAttribute('aria-busy') })))
    await held.keyboard.press('Escape')
    const one = rows.find((r) => r.text?.startsWith(W.sideBySide))?.busy === 'true' && rows.find((r) => r.text === W.translation)?.disabled === 'true'
    check('while a file is made: the capsule says which, with its share; its row turns, the other is greyed', working && one, JSON.stringify(rows))
    let saved = false
    held.once('download', () => {
      saved = true
    })
    await held.getByRole('button', { name: W.cancel, exact: true }).click()
    await held.waitForTimeout(5000)
    const after = await readerState(held)
    check('a cancel saves nothing and says nothing: the capsule gone, nothing failed', !saved && after.exporting === null && after.exportFailed === null, JSON.stringify({ saved, exporting: after.exporting, failed: after.exportFailed }))

    await held.close()

    // a failure, and its retry (a reader of its own, as above)
    await clearPaperStore()
    api.set({ whole: 'reset' })
    const page2 = await openReader({ mode: 'bilingual' })
    await translated(page2)
    await uncached(page2)
    await press(page2, barMenu(page2), W.translation, { expect: false })
    const failed = await page2.waitForFunction(() => /译文 PDF 下载失败/.test(document.querySelector('.capsule')?.textContent ?? ''), null, { timeout: 15_000 }).then(() => true, () => false)
    check('a file that cannot be made: the capsule says so, with its retry', failed && (await page2.getByRole('button', { name: W.retry, exact: true }).count()) === 1)
    api.set({ whole: null })
    const retried = page2.waitForEvent('download', { timeout: 30_000 }).then((d) => d.suggestedFilename(), () => null)
    await page2.getByRole('button', { name: W.retry, exact: true }).click()
    const name = await retried
    check('its retry makes the same file and saves it', name?.endsWith('.pdf') === true && !name.includes('side-by-side'), String(name))
    await page2.close()

    // a window too narrow for the bar's menu: the reading options' download row
    const narrow = await openReader({ mode: 'bilingual' })
    await narrow.setViewportSize({ width: 420, height: 800 })
    await translated(narrow)
    const viaOptions = await press(narrow, async () => {
      await narrow.getByRole('button', { name: W.options, exact: true }).click()
      await narrow.locator('.pop .row').filter({ hasText: W.menu }).getByRole('button', { name: W.menu, exact: true }).click()
    }, W.sideBySide)
    check('below 500 px: the reading options\' download row offers both files, and the side-by-side one is saved from it', !!viaOptions?.name && viaOptions.name.endsWith('.side-by-side.pdf'), JSON.stringify(viaOptions && (viaOptions.failed ? viaOptions : { name: viaOptions.name, width: viaOptions.width })))
    await narrow.close()

    // a page whose crops' ink sits inside a form (the add-on's figure forms: 2611.18114v1 p26's 7×7, 1,015 crops of the 245):
    // every crop the file draws there draws its ink, as many as where the same crops' ink sits in the page itself
    await clearPaperStore()
    api.use(withPageInForm(t.fixture, 1))
    const inForm = await openReader({ mode: 'bilingual' })
    await translated(inForm)
    const formFile = await press(inForm, barMenu(inForm), W.translation, { tag: 'in-form-' })
    const cropsThere = formFile?.path ? cropsIn(formFile.path, 1) : []
    check(
      'a page whose crops\' ink sits inside a form: the file draws every crop with its ink, as many as where it sits in the page',
      cropsHere.length > 0 && cropsHere.every((c) => c.ink) && cropsThere.length === cropsHere.length && cropsThere.every((c) => c.ink),
      JSON.stringify({ inThePage: cropsHere, inAForm: cropsThere, failed: formFile?.failed }),
    )
    await inForm.close()

    // every word poppler reads on page 1 of both files, its paragraphs of several formulas each among them, stands on ink, and
    // on the side-by-side page in one half (the fixture with its fonts' widths stated, as arXiv's papers state them: with-widths)
    await clearPaperStore()
    api.use(await withWidths(t.fixture))
    const wide = await openReader({ mode: 'bilingual' })
    await translated(wide)
    const trW = await press(wide, barMenu(wide), W.translation, { tag: 'widths-' })
    const sbsW = await press(wide, barMenu(wide), W.sideBySide, { tag: 'widths-' })
    const onInk = [trW?.path && wordsOnInk(trW.path, 1, false), sbsW?.path && wordsOnInk(sbsW.path, 1, true)]
    check(
      onInk.some((x) => x === null)
        ? 'every word of both files stands on ink, in its own half (poppler not installed: not read)'
        : "every word of both files stands on ink, in its own half: no formula's copy clipped out of sight",
      onInk.every((x) => x === null || (x && x.words > 0 && x.noInk.length === 0 && x.across.length === 0)),
      JSON.stringify(onInk),
    )
    await wide.close()
    api.use(t.fixture)
    await clearPaperStore()
  }
  api.set({ whole: null })
}
