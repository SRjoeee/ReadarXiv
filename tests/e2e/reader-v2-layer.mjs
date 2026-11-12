// The second half of the rebuilt reader's browser checks (reader-v2.mjs): the reader on the layer the stand-in serves, as the
// extension's host gives it what it needs. Called by reader-v2.mjs with its context, its stand-in and its reporting.
/** the right pane (the chrome's): its laid pages' text layers hold the translation's spans and the page's own words */
const RIGHT = 'section.pane[data-side="right"]'

export async function layerChecks(t) {
  const { context, worker, id, api, PAPER, PV, LINK, echo, readerState, sessionState, probe, openReader, paperOpened, laid, setConfig, clearPaperStore, section, check, control, note, sleep, SHOTS } = t
  const rightText = page => page.evaluate(sel => document.querySelector(sel)?.textContent ?? '', RIGHT)
  /** a laid page's translation on the right (its text layer is built after the page is put in place) */
  const echoed = (page, timeout = 15_000) => page.waitForFunction(sel => (document.querySelector(sel)?.textContent ?? '').includes('[echo]'), RIGHT, { timeout }).then(() => true, () => false)
  const asks = kind => api.asked(kind).length

  // ------------------------------------------------------------------------------------------------ the reader on the layer
  section('the reader on the layer: prepared, laid on the right as the extension translates, the original until then; the contents, a link out of the paper, the original\'s download')
  {
    await clearPaperStore()
    api.set({ prepared: [], prepareMs: 4000, fresh: true })
    // (a target no section before asked: the background keeps the rows it was given, and they would answer without the service)
    await setConfig({ targetLanguage: 'nld' })
    const postsBefore = echo.seen.post, asksBefore = api.requests.length
    const since = () => api.requests.slice(asksBefore)
    const page = await openReader({ mode: 'bilingual' })
    const opened = await paperOpened(page)
    check('the reader opens the paper: its pages on the left', opened, JSON.stringify(opened ? await readerState(page).then(s => ({ pages: s.sides.left.pages, phase: s.phase })) : {}))
    // while the paper is prepared: the reader says so, nothing laid on the right
    const preparing = await page.waitForFunction(() => window.__reader.reader.state().layer.s === 'preparing', null, { timeout: 10_000 }).then(() => true, () => false)
    const during = { laid: (await probe(page)).laidPages, phase: (await readerState(page)).phase }
    check('while the paper is prepared, the reader says it is preparing and lays nothing', preparing && during.laid === 0 && during.phase === 'preparing', JSON.stringify(during))
    const wasLaid = (await laid(page)) && (await echoed(page))
    const text = await rightText(page)
    check('the extension\'s translation taken: a page laid on the right, its translation the echo service\'s', wasLaid && /\[echo\]/.test(text) && echo.seen.post > postsBefore, `${(await probe(page)).laidPages} laid; ${echo.seen.post - postsBefore} asks of the service; ${text.slice(0, 80)}`)
    control('a page the layer has not laid shows no translation (before the prepare ended)', { ok: during.laid > 0, detail: `${during.laid} laid then` })
    const mine = since(), opensSeen = mine.filter(r => r.path === '/api/v2/open'), objects = mine.filter(r => r.path.startsWith('/api/v2/o/')).map(r => r.path)
    check('our server asked as the reader asks it: opens naming no target (rows made here), the paper followed until its layer, each object once (the store keeps it)', opensSeen.length >= 1 && opensSeen.every(r => r.body?.includes('"target":null')) && mine.some(r => r.path.startsWith('/api/v2/papers/')) && new Set(objects).size === objects.length, `${opensSeen.length} open(s) ${opensSeen[0]?.body}; ${mine.filter(r => r.path.startsWith('/api/v2/papers/')).length} follow(s); ${objects.length} object asks, ${new Set(objects).size} distinct`)
    // the contents: the paper's headings, titled by the translation
    const outline = (await readerState(page)).outline ?? []
    check('the contents: the paper\'s headings, titled by the rows', outline.length >= 3 && outline.some(e => /\[echo\]/.test(e.title ?? '')), JSON.stringify(outline.slice(0, 3)))
    // a link out of the paper on a laid page opens in a new tab through the host, the reader staying
    const anchor = page.locator(`${RIGHT} a[href="${LINK}"]`)
    const found = await anchor.first().waitFor({ timeout: 10_000 }).then(() => true, () => false)
    const tabOpened = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
    if (found) await anchor.first().click()
    const tab = await tabOpened
    await tab?.waitForLoadState('load').catch(() => undefined)
    const opener = tab ? await tab.evaluate(() => window.opener === null) : null
    check('a link of a laid page out of the paper opens in a new tab through the host, with no opener, the reader staying', found && tab?.url() === LINK && opener === true && page.url().includes('pdf-reader.html'), `found ${found}, opened ${tab?.url() ?? 'nothing'}, no opener ${opener}`)
    await tab?.close()
    // the original's download: arXiv's PDF in a tab of its own, at #axt-viewer, no reader laid over it
    const viewerOpened = context.waitForEvent('page', { timeout: 10_000 }).catch(() => null)
    await page.evaluate(() => window.__reader.controller.download('original'))
    const viewer = await viewerOpened
    await viewer?.waitForLoadState('load').catch(() => undefined)
    await sleep(1500)
    const framedOver = viewer ? await viewer.evaluate(() => !!document.querySelector('iframe[data-axt-pdf-reader]')).catch(() => null) : null
    check('the original\'s download opens arXiv\'s PDF in a tab of its own at #axt-viewer, no reader laid over it', !!viewer && /^https:\/\/arxiv\.org\/pdf\/[^#]+#axt-viewer$/.test(viewer.url()) && framedOver === false, `${viewer?.url() ?? 'nothing'}, reader over it ${framedOver}`)
    await viewer?.close()
    // the highlight: the pointer over a laid paragraph lights it on both panes
    const span = await page.evaluate(sel => { const s = [...document.querySelectorAll(`${sel} span[lang]`)].find(x => (x.textContent ?? '').trim().length > 3 && x.getBoundingClientRect().width > 4); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.x + Math.min(10, r.width / 2), y: r.y + r.height / 2 } }, RIGHT)
    if (span) await page.mouse.move(span.x, span.y)
    const lit = span ? await page.waitForFunction(() => window.__reader.probe().lit !== null, null, { timeout: 5_000 }).then(() => true, () => false) : false
    check('the pointer over a laid paragraph lights its unit (the reader\'s highlight, its both panes the package\'s e2e)', lit, JSON.stringify({ span, lit: (await probe(page)).lit }))
    await page.screenshot({ path: `${SHOTS}/reader-v2-laid.png` })
    await page.close()
  }

  // -------------------------------------------------------------------------------------- another target, another service
  section('another target in place; a service that fails, and another chosen')
  {
    api.set({ prepared: [PAPER], prepareMs: 0 })
    const page = await openReader({ mode: 'bilingual' })
    await paperOpened(page)
    await laid(page)
    await page.evaluate(() => { window.__notReloaded = true })
    const opensBefore = asks('open')
    await setConfig({ targetLanguage: 'fra' })
    const retargeted = await page.waitForFunction(() => window.__reader.reader.state().rows.target === 'fr' && window.__reader.reader.state().rows.s === 'complete', null, { timeout: 30_000 }).then(() => true, () => false)
    await page.waitForFunction(sel => !!document.querySelector(`${sel} [lang^="fr"]`), RIGHT, { timeout: 15_000 }).catch(() => undefined)
    const lang = await page.evaluate(sel => document.querySelector(`${sel} [lang^="fr"]`)?.getAttribute('lang') ?? null, RIGHT)
    check('another target laid in place: the page not loaded again, its translation in the new target\'s language, nothing asked of our server again', retargeted && (await page.evaluate(() => window.__notReloaded === true)) && /^fr/.test(lang ?? '') && asks('open') === opensBefore, `target ${(await sessionState(page)).prefs.target}, lang ${lang}, opens ${asks('open') - opensBefore} more`)
    await page.close()

    // a service whose key the endpoint refuses: nothing translated, the card says the key's (not a missing key's), its way
    // to the settings; then another service chosen asks again, by itself, for what stopped short (the feature list's I10, D4)
    await setConfig({ targetLanguage: 'ita' })
    await t.worker.evaluate(async url => {
      const { config } = await chrome.storage.local.get('config')
      // (the automatic fallback to the free service off: its failure is the service's own, told, and no request leaves the table)
      await chrome.storage.local.set({ config: { ...config, fallback: { enabled: false }, services: [...config.services.filter(s => s.id !== 'svc-e2efail0'), { id: 'svc-e2efail0', kind: 'openai-compat', name: 'refused', baseURL: url, model: 'local-echo', apiKey: 'sk-refused', thinking: 'disabled' }], provider: 'svc-e2efail0' } })
    }, echo.failingURL)
    const failing = await openReader({ mode: 'bilingual' })
    await paperOpened(failing)
    const failed = await failing.waitForFunction(() => window.__reader.controller.getState().failure === 'auth', null, { timeout: 30_000 }).then(() => true, () => false)
    const card = await failing.locator('div.card[data-card]').innerText().catch(() => '')
    check('a service whose key is refused: nothing translated, the card says the key is invalid (the key\'s words), with the settings', failed && /API Key/.test(card) && !/\u5c1a\u672a\u914d\u7f6e/.test(card), `${(await readerState(failing)).failure}; “${card.replace(/\s+/g, ' ').slice(0, 80)}”`)
    const postsBefore = echo.seen.post
    await setConfig({ provider: 'svc-e2eecho0' })
    const mended = (await laid(failing, 1, 30_000)) && (await echoed(failing))
    check('another service chosen: what stopped short asked of it by itself, no retry pressed, the page laid', mended && echo.seen.post > postsBefore && /\[echo\]/.test(await rightText(failing)), `${echo.seen.post - postsBefore} asks of the new service; ${(await probe(failing)).laidPages} laid`)
    await failing.close()
    await setConfig({ targetLanguage: 'deu', fallback: { enabled: true } })
  }

  // ------------------------------------------------------------------------------------------------- what to translate
  section('what to translate: a toggle from the reading options or the settings page, in place; nothing asked of our server or the service')
  {
    const page = await openReader({ mode: 'bilingual' })
    await paperOpened(page)
    await laid(page)
    await sleep(1000)
    const opens = asks('open'), objects = asks('object'), posts = echo.seen.post
    // the reading options' author information (names), as the reader writes it: the extension's setting
    await page.evaluate(() => window.__reader.controller.setPrefs({ classes: { names: true } }))
    await sleep(800)
    const written = await t.worker.evaluate(async () => (await chrome.storage.local.get('config')).config.pdfReader.classes)
    const shown = (await sessionState(page)).prefs.classes
    check('a toggle in the reading options written to the extension\'s setting, and the reader shows it', written.names === true && shown.names === true, JSON.stringify({ written, shown }))
    // the settings page's switch (the text in tables off): the reader follows
    await setConfig({ pdfReader: { classes: { ...written, tables: false } } })
    const followed = await page.waitForFunction(() => window.__reader.reader.state().prefs.classes.tables === false, null, { timeout: 10_000 }).then(() => true, () => false)
    check('a toggle from the settings page: the reader follows', followed, JSON.stringify((await sessionState(page)).prefs.classes))
    check('… and nothing asked again: no open, no object of our server, nothing sent to the service', asks('open') === opens && asks('object') === objects && echo.seen.post === posts, `opens +${asks('open') - opens}, objects +${asks('object') - objects}, service +${echo.seen.post - posts}`)
    note('what a toggle shows and hides on a laid page is the reader package\'s (its e2e: "reader: no engine given, the reader\'s own typesetter …: a toggle lays them again"); this fixture has no table or author block to show it here')
    await setConfig({ pdfReader: { classes: { figures: true, tables: true, heads: true, references: false, names: false } } })
    await page.close()
  }

  // ------------------------------------------------------------------------------------------------ the states
  section('the reader\'s states on our server\'s answers: none for the paper, refused, out of reach and back, arXiv\'s bytes not the layer\'s original')
  {
    await clearPaperStore()
    // no source: the original shown, the translated displays greyed, the capsule says so
    api.set({ failed: { [PAPER]: 'no-source' }, fresh: true })
    const none = await openReader({ mode: 'bilingual' })
    await paperOpened(none)
    await none.waitForFunction(() => window.__reader.controller.getState().available === false, null, { timeout: 15_000 }).catch(() => undefined)
    const n = await readerState(none)
    check('no source for the paper: the original shown, the translated displays greyed, the capsule says so', n.available === false && n.display === 'original', JSON.stringify({ available: n.available, display: n.display, unavailable: n.unavailable }))
    await none.close()
    api.set({ failed: {}, fresh: true })

    // the visitor's new papers spent: the original readable, the capsule with its time
    api.set({ refuse: { why: 'quota', retryAfterS: 3600 } })
    const quota = await openReader({ mode: 'bilingual' })
    await paperOpened(quota)
    const said = await quota.waitForFunction(() => window.__reader.controller.getState().unavailable !== null, null, { timeout: 15_000 }).then(() => true, () => false)
    const q = await readerState(quota)
    check('new work refused (the visitor\'s quota): the original readable, the capsule says the bilingual version cannot be had now, with its time', said && q.available === true && q.sides.left.pages > 0, JSON.stringify(q.unavailable))
    await quota.close()
    api.set({ refuse: null })

    // our server out of reach: the original readable, the capsule; back, a retry brings the layer
    for (const fault of [503, 'reset']) {
      // (no paper kept: one this machine keeps opens without our server, the section after this one)
      await clearPaperStore()
      api.set({ fault, fresh: true })
      const down = await openReader({ mode: 'bilingual' })
      await paperOpened(down)
      const told = await down.waitForFunction(() => window.__reader.controller.getState().unavailable !== null, null, { timeout: 20_000 }).then(() => true, () => false)
      const st = await readerState(down)
      const words = await down.locator('[role="status"]').innerText().catch(() => '')
      if (fault === 503) {
        // our server at fault: the session stops asking; said, with the retry (S-R-24)
        check('our server at fault (503): the original readable, the capsule says the bilingual version cannot be had now, with its retry', told && st.sides.left.pages > 0 && st.unavailable?.self !== true, `${JSON.stringify(st.unavailable)} “${words.replace(/\s+/g, ' ').slice(0, 80)}”`)
        api.set({ fault: null })
        await down.evaluate(() => window.__reader.controller.retry())
        const back = (await laid(down, 1, 30_000)) && (await echoed(down))
        check('… and its retry, our server back, brings the layer: the page laid', back, JSON.stringify((await readerState(down)).unavailable))
      } else {
        // the network failing the asks (a reset): said as the network, no retry offered, the session asking again by itself
        // (the ruled flow, PDF-READER §8.1: a status says what the reader waits for)
        check('our server out of reach (a reset): the original readable, the network said, no retry offered (the session asks again by itself)', told && st.sides.left.pages > 0 && st.unavailable?.why === 'network' && st.unavailable?.self === true, `${JSON.stringify(st.unavailable)} “${words.replace(/\s+/g, ' ').slice(0, 80)}”`)
        api.set({ fault: null })
        const back = (await laid(down, 1, 60_000)) && (await echoed(down))
        check('… and our server back, the session\'s own next ask brings the layer: the page laid, nothing pressed', back, JSON.stringify((await readerState(down)).unavailable))
      }
      await down.close()
    }

    // arXiv's bytes not the ones the layer was made over: our copy read for both panes
    t.setPdfAnswer('other')
    const ours = api.asked('object').length
    const other = await openReader({ mode: 'bilingual' })
    await paperOpened(other)
    const usedOurs = await laid(other, 1, 30_000)
    const copyAsked = api.asked('object').slice(ours).filter(r => r.path.startsWith(`/api/v2/o/arxiv/${PV}.pdf`)).length
    check('the tab\'s PDF not the one the layer was made over: our copy of it read, the page laid', usedOurs && copyAsked > 0, `${copyAsked} reads of our copy; ${(await probe(other)).laidPages} laid`)
    await other.close()
    t.setPdfAnswer('ok')
    const theirs = api.asked('object').length
    const same = await openReader({ mode: 'bilingual' })
    await paperOpened(same)
    await laid(same, 1, 30_000)
    control('the tab\'s PDF the one the layer was made over: our copy not read (the same assertion)', { ok: api.asked('object').slice(theirs).some(r => r.path.startsWith(`/api/v2/o/arxiv/${PV}.pdf`)), detail: 'our copy read' })
    await same.close()
  }

  // --------------------------------------------------------------------------------- the papers this machine keeps (O3, O4)
  section('the papers this machine keeps: opened with our server out of reach, counted and cleared on the settings page')
  {
    await clearPaperStore()
    api.set({ prepared: [PAPER], fault: null, fresh: true })
    // read once, online: the paper's layer kept
    const online = await openReader({ mode: 'bilingual' })
    await paperOpened(online)
    await laid(online)
    await sleep(1500)
    await online.close()
    // our server out of reach: the paper kept opens translated, nothing new drawn, nothing sent to the service
    api.set({ fault: 'reset' })
    const posts = echo.seen.post, asked = api.requests.length
    const offline = await openReader({ mode: 'bilingual' })
    await paperOpened(offline)
    const kept = (await laid(offline, 1, 30_000)) && (await echoed(offline))
    const st = await readerState(offline)
    check('a paper this machine keeps opens translated with our server out of reach: laid, no capsule of a refusal, nothing sent to the service', kept && st.unavailable === null && echo.seen.post === posts && /\[echo\]/.test(await rightText(offline)), `${(await probe(offline)).laidPages} laid; ${JSON.stringify(st.unavailable)}; service +${echo.seen.post - posts}; our server asked ${api.requests.length - asked} times (refused)`)
    await offline.close()
    // the settings page's Data section: the papers kept, counted (its unit, `\u7bc7` in Chinese, a paper)
    const options = await t.extensionPage('options.html#data')
    await sleep(1500)
    const line = await options.locator('body').innerText()
    const counted = /[1-9]\d*\s*\u7bc7/.test(line)
    check('the settings page counts the papers kept: the rebuilt reader\'s store', counted, (line.match(/[^\n]*\u7bc7[^\n]*/g) ?? []).join(' | ').slice(0, 160))
    await options.close()
    await clearPaperStore()
    // none kept: our server out of reach, the original and the capsule (the existing words)
    const bare = await openReader({ mode: 'bilingual' })
    await paperOpened(bare)
    const told = await bare.waitForFunction(() => window.__reader.controller.getState().unavailable !== null, null, { timeout: 20_000 }).then(() => true, () => false)
    const words = await bare.locator('[role="status"]').innerText().catch(() => '')
    control('a paper not kept, our server out of reach: nothing laid, the capsule (the same assertion of laid)', { ok: (await probe(bare)).laidPages > 0, detail: `${told ? 'told' : 'not told'} “${words.replace(/\s+/g, ' ').slice(0, 80)}”` })
    await bare.close()
    api.set({ fault: null })
  }
}
