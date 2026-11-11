// The full-width punctuation's check (lane cjk-punct, docs/PDF-READER.md §18.47): fixture s1-columns laid by the reader's own
// typesetter over our site's faces in zh, zh-TW, ja and ko, from translations written for this check (CC0, no text of any
// paper), whose lines hold 。，、：；！？（） beside CJK, Latin, digits and the fixture's element crop, and one line of no
// script at all ("2024（3）。": digits and marks alone, the case a run's script decides a face's glyphs by, staging's
// 2611.03953v2-zh-TW p13). Every laid page's drawing is measured as the browser drew it: each character's place and advance
// from the SVG, each mark's ink and its neighbours' from pixels (the overlay's SVG drawn again at SCALE px a point, each
// glyph alone), each crop's ink from its Page item. Three verdicts:
//   (i)   no mark's ink box overlaps the ink box of the glyph or crop beside it on its line (by more than a device px);
//   (ii)  one character in one face stands at one place in its box wherever it is drawn (its ink's offsets from its origin,
//         em of its size, within two device px);
//   (iii) every run's drawn advance is the layout's measure of it (the reader's Metrics at the run's face and size, its
//         tracking after each character), within ADVANCE_TOL points a character: the run drawn on its own, as the layout
//         measures it. Drawn among the others it may differ by a kern pair (a run opening with a mark of no script after a run
//         of another script, Korean's "(k" after Hangul: Chromium shapes the mark with the run before it, across the tspans of
//         one <text>); those are reported (`context`), not judged: the painter draws a line as one <text>.
// The interface is the owner's on staging (zh-CN: the document's language), whatever the target.

/** device px a point the drawing is measured at */
export const SCALE = 6
/** the drawn advance's tolerance against the layout's, points a character: Chromium lays SVG text out in a font scaled to the
 *  screen, each advance to a fixed point of it, its canvas measure at 100 px; the largest difference a character over the four
 *  targets' runs drawn on their own, once each run is drawn at its size and tracking, was 0.0037 pt (lane cjk-punct's note) */
export const ADVANCE_TOL = 0.004
export const PUNCT_TARGETS = ['zh', 'zh-TW', 'ja', 'ko']
/** the marks every target's drawing must hold, each checked beside its neighbours */
export const MARKS = '。，、：；！？（）'

const EL = { t: 'el', id: '1' }
/** sentences each target's two crowded units (3 and 8) carry three times over, so that their fit compresses the marks as far as
 *  its rules let it (a paragraph longer than its room: staging's 2611.03953v2 p13), marks beside digits, Latin and marks */
const CROWD = {
  zh: '粒度：144 与 4；精度：98.5%、召回：97.2%，F1：96.1（平均：95.0）。为何？见表 2！',
  'zh-TW': '粒度：144 與 4；精度：98.5%、召回：97.2%，F1：96.1（平均：95.0）。為何？見表 2！',
  ja: '粒度：144 と 4；精度：98.5%、再現率：97.2%，F1：96.1（平均：95.0）。なぜか？表 2 を見よ！',
  ko: '세분화: 144 와 4; 정밀도: 98.5%, 재현율: 97.2%, F1: 96.1(평균: 95.0). 왜? 표 2를 보라!',
}
/** each target's translation of s1-columns's 15 units, in their order (the fixture's de rows'): a string, or pieces with the
 *  element its unit holds (units 3, 6 and 11) */
const TEXTS = {
  zh: [
    '双语阅读器：保留版式的合成页面（测试）',
    '我们提出一种阅读器：它把论文逐段译为读者的语言，同时保留每个图、公式与引用的位置。实验覆盖 15 篇论文、3 种语言；结果如何？很好！',
    '引言',
    [
      '在公式',
      EL,
      '中，x 表示输入；参数取 0.5（见第 3 节）。模型 GPT-4（规模：7B）与基线相比如何？答案：更好！粒度：144 与 4；准确率为 98.5%。',
    ],
    '第二段：我们比较了 BERT、GPT 与 T5 三种模型（分别记为 A、B、C），并报告 F1 分数：92.3、91.8 与 90.1。为什么？因为它们最常用！',
    '（1）：2。',
    ['如图所示，', EL, '（公式 2）给出了上界；当 n = 10 时，误差为 0.01。注意：该界是紧的！'],
    '方法',
    '我们的方法分三步：读取、对齐、排版。第一步（读取）只需 2 秒；第二步：对齐全部 128 个单元；第三步？排版！',
    '表 1 列出了结果：平均分 46.4（标准差 0.3）。',
    '图 1：示意图。',
    [
      '进一步地，',
      EL,
      '说明：当 k 很大时，损失趋于 0；否则（k 有限），损失为正。我们在 2026 年的 MedQA、FinQA 与 IFBench 上验证了这一点；得分分别为 62.66、62.4 与 46.44。',
    ],
    '2024（3）。',
    '结论：该方法简单、快速，且无需额外训练（参见附录 A）。代码已开源！问题？请联系作者。',
    '致谢：感谢审稿人（匿名）的意见。',
  ],
  'zh-TW': [
    '雙語閱讀器：保留版式的合成頁面（測試）',
    '我們提出一種閱讀器：它把論文逐段譯為讀者的語言，同時保留每個圖、公式與引用的位置。實驗涵蓋 15 篇論文、3 種語言；結果如何？很好！',
    '引言',
    [
      '在公式',
      EL,
      '中，x 表示輸入；參數取 0.5（見第 3 節）。模型 GPT-4（規模：7B）與基線相比如何？答案：更好！粒度：144 與 4；準確率為 98.5%。',
    ],
    '第二段：我們比較了 BERT、GPT 與 T5 三種模型（分別記為 A、B、C），並報告 F1 分數：92.3、91.8 與 90.1。為什麼？因為它們最常用！',
    '（1）：2。',
    ['如圖所示，', EL, '（公式 2）給出了上界；當 n = 10 時，誤差為 0.01。注意：該界是緊的！'],
    '方法',
    '我們的方法分三步：讀取、對齊、排版。第一步（讀取）只需 2 秒；第二步：對齊全部 128 個單元；第三步？排版！',
    '表 1 列出了結果：平均分 46.4（標準差 0.3）。',
    '圖 1：示意圖。',
    [
      '進一步地，',
      EL,
      '說明：當 k 很大時，損失趨於 0；否則（k 有限），損失為正。我們在 2026 年的 MedQA、FinQA 與 IFBench 上驗證了這一點；得分分別為 62.66、62.4 與 46.44。',
    ],
    '2024（3）。',
    '結論：該方法簡單、快速，且無需額外訓練（參見附錄 A）。程式碼已開源！問題？請聯絡作者。',
    '致謝：感謝審稿人（匿名）的意見。',
  ],
  ja: [
    '二言語リーダー：版面を保つ合成ページ（試験）',
    '本稿では、論文を段落ごとに読者の言語へ訳しつつ、図・数式・引用の位置を保つリーダーを提案する。実験は 15 本の論文、3 言語で行った。結果は？良好！',
    'はじめに',
    [
      '数式',
      EL,
      'において、x は入力を表す；係数は 0.5（第 3 節参照）。モデル GPT-4（規模：7B）はベースラインと比べてどうか？答え：より良い！粒度：144 と 4；精度は 98.5%。',
    ],
    '第二段落：BERT、GPT、T5 の三つのモデル（それぞれ A、B、C）を比較し、F1 スコア：92.3、91.8、90.1 を報告する。なぜか？最もよく使われるからだ！',
    '（1）：2。',
    ['図に示すとおり、', EL, '（式 2）が上界を与える；n = 10 のとき、誤差は 0.01 である。注意：この上界は厳密だ！'],
    '手法',
    '手法は三段階からなる：読み込み、整列、組版。第一段階（読み込み）は 2 秒で済む；第二段階：128 個の単位をすべて整列する；第三段階？組版！',
    '表 1 に結果を示す：平均 46.4（標準偏差 0.3）。',
    '図 1：概念図。',
    [
      'さらに、',
      EL,
      'は次を示す：k が大きいとき、損失は 0 に近づく；そうでなければ（k が有限なら）、損失は正である。2026 年の MedQA、FinQA、IFBench で検証した；スコアはそれぞれ 62.66、62.4、46.44 である。',
    ],
    '2024（3）。',
    '結論：本手法は単純、高速で、追加の学習を要しない（付録 A 参照）。コードは公開済み！質問は？著者まで。',
    '謝辞：査読者（匿名）の意見に感謝する。',
  ],
  ko: [
    '이중 언어 리더: 판면을 보존하는 합성 페이지(시험)',
    '우리는 논문을 문단마다 독자의 언어로 옮기면서, 그림, 수식, 인용의 위치를 보존하는 리더를 제안한다. 실험은 15편의 논문, 3개 언어로 수행했다. 결과는? 좋다!',
    '서론',
    [
      '수식 ',
      EL,
      '에서 x는 입력을 나타낸다; 계수는 0.5(3절 참조)이다. 모델 GPT-4(규모: 7B)는 기준선과 비교해 어떠한가? 답: 더 낫다! 세분화: 144 와 4; 정확도는 98.5%.',
    ],
    '둘째 문단: BERT, GPT, T5 세 모델(각각 A, B, C)을 비교하고 F1 점수: 92.3, 91.8, 90.1을 보고한다. 왜인가? 가장 널리 쓰이기 때문이다!',
    '（1）：2。',
    ['그림과 같이 ', EL, '（식 2）가 상한을 준다；n = 10일 때 오차는 0.01이다。주의：이 상한은 엄밀하다！'],
    '방법',
    '방법은 세 단계로 이루어진다: 읽기, 정렬, 조판. 첫 단계(읽기)는 2초면 된다; 둘째 단계: 128개 단위를 모두 정렬한다; 셋째 단계? 조판!',
    '표 1에 결과를 보인다：평균 46.4（표준편차 0.3），중앙값 45、최댓값 50。왜？',
    '그림 1: 개념도.',
    [
      '나아가 ',
      EL,
      '는 다음을 보인다: k가 클 때 손실은 0에 가까워진다; 그렇지 않으면(k가 유한하면) 손실은 양수이다. 2026년의 MedQA, FinQA, IFBench에서 검증했다; 점수는 각각 62.66, 62.4, 46.44이다.',
    ],
    '2024（3）。',
    '결론: 이 방법은 단순하고 빠르며, 추가 학습이 필요 없다(부록 A 참조). 코드는 공개되었다! 질문? 저자에게 연락하라.',
    '감사의 글: 심사자(익명)의 의견에 감사한다.',
  ],
}

/** the rows of `target` for fixture s1-columns (its `de.rows.json` rows, their ids in order), or null for another target */
export function punctRows(target, deRows) {
  const texts = TEXTS[target]
  if (!texts || texts.length !== deRows.length) return null
  return {
    format: 1,
    rows: deRows.map((r, k) => ({
      id: r.id,
      ok: true,
      content: [
        ...(Array.isArray(texts[k]) ? texts[k] : [texts[k]]),
        ...(k === 3 || k === 8 ? [CROWD[target].repeat(3)] : []),
      ].map((p) => (typeof p === 'string' ? { t: 'text', s: p } : p)),
      by: 'cjk-punct',
    })),
  }
}

const CJK_FACE = /^"?axt-(shs-sc|shs-tc|shs-k|mincho|fandolkai|bkai00mp)"?$/
const isMark = (ch) => /\p{P}/u.test(ch)

/**
 * Every laid page of the composer's drawing measured: per page, its lines' glyphs (character, face, size, origin, advance,
 * ink box in the SVG's units) and crops (ink boxes), and every run's drawn advance against the layout's. `page`: a harness
 * page whose composer laid with the reader's own typesetter (main.ts layer's `typeset`)
 */
export async function measurePunct(page, laidPages) {
  const out = { glyphs: [], crops: [], runs: [] }
  for (const n of laidPages) {
    await page.evaluate((n) => window.__h.panes.goToPage('right', n), n)
    await page.waitForFunction(
      (n) => !!document.querySelector(`.axt-pane.right .axt-slot[data-page-number="${n}"] .axt-over > svg`),
      n,
      { timeout: 20_000, polling: 50 },
    )
    await page.evaluate(() => document.fonts.ready)
    // (the runs' drawn advances against the reader's Metrics, and the lines with a mark drawn in a CJK face, each character's
    // place; the drawing copied at SCALE, each glyph a tspan of its own whose fill alone shows it)
    const prep = await page.evaluate(
      async ([n, S, cjkFace]) => {
        const face = new RegExp(cjkFace)
        const h = window.__h
        const P = h.composer.laid(n)
        const svg = document.querySelector(`.axt-pane.right .axt-slot[data-page-number="${n}"] .axt-over > svg`)
        const pdf = await h.composed.getPage(n)
        const [vx0, , , vy1] = pdf.view
        // (iii) each text item a tspan, in the painter's order; each drawn where it stands and alone, its copy in a <text> of its
        // own beside the drawing (the same sheet and language): a run in a <text> of others is shaped with them, a mark of no
        // script taking its script from the run before it, which the layout's measure of the run alone does not see
        const items = []
        for (const m of P.members)
          if (m.state === 'laid')
            for (const [, , , its] of m.lines) for (const it of its) if (!('src' in it)) items.push(it)
        const spans = [...svg.querySelectorAll('tspan')]
        const runs = []
        const apart = svg.cloneNode(false)
        svg.parentNode.append(apart)
        const alone = spans.map((sp) => {
          const t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
          const c = sp.cloneNode(true)
          t.append(c)
          apart.append(t)
          return c
        })
        if (spans.length !== items.length) runs.push({ error: `${spans.length} tspans for ${items.length} items` })
        else
          spans.forEach((sp, i) => {
            const it = items[i]
            const t = sp.closest('text')
            let at = 0
            for (const s of t.querySelectorAll('tspan')) {
              if (s === sp) break
              at += s.textContent.length
            }
            const one = alone[i].closest('text')
            if (it.dx?.length)
              [...it.s].forEach((ch, j) => {
                if (/\s/.test(ch)) return
                runs.push({
                  s: ch,
                  face: it.face,
                  drawn: t.getExtentOfChar(at + j).width,
                  alone: one.getExtentOfChar(j).width,
                  laid: h.served.metrics.advance(it.face, it.size, ch),
                })
              })
            else
              runs.push({
                s: it.s,
                face: it.face,
                size: it.size,
                track: it.track ?? 0,
                drawn: sp.getComputedTextLength(),
                alone: alone[i].getComputedTextLength(),
                laid: h.served.metrics.advance(it.face, it.size, it.s) + (it.track ?? 0) * [...it.s].length,
              })
          })
        apart.remove()
        // (i, ii) the crops' ink on this page's lines, in the SVG's units (paint.ts's frame: x − vx0, vy1 − y)
        const crops = []
        for (const m of P.members)
          if (m.state === 'laid')
            for (const [y, , , its] of m.lines)
              for (const it of its) {
                if (!('src' in it)) continue
                const [, x0, , , , base] = it.src
                const boxes = it.ink?.length ? it.ink : [[it.src[1], it.src[2], it.src[3], it.src[4]]]
                for (const [a, b, c, d] of boxes)
                  crops.push({
                    line: +(vy1 - y).toFixed(2),
                    x0: it.x + (a - x0) * it.k - vx0,
                    x1: it.x + (c - x0) * it.k - vx0,
                    y0: vy1 - (y + (d - base) * it.k),
                    y1: vy1 - (y + (b - base) * it.k),
                  })
              }
        // the copy, at S px a unit, each glyph its own tspan
        let box = document.getElementById('axt-punct-probe')
        if (!box) {
          box = document.createElement('div')
          box.id = 'axt-punct-probe'
          const st = document.createElement('style')
          st.textContent =
            '#axt-punct-probe{position:fixed;left:0;top:0;z-index:2147483647;background:#fff}#axt-punct-probe .axt-over{position:relative}#axt-punct-probe .axt-g{fill-opacity:0}#axt-punct-probe .axt-g.on{fill-opacity:1}'
          document.head.append(st)
          document.body.append(box)
        }
        box.className = 'axt-reader'
        const decided = document.querySelector('.axt-reader')?.getAttribute('data-axt-layer-text')
        if (decided) box.setAttribute('data-axt-layer-text', decided)
        box.replaceChildren()
        const vb = svg.viewBox.baseVal
        const over = document.createElement('div')
        over.className = 'axt-over'
        over.style.width = `${vb.width * S}px`
        over.style.height = `${vb.height * S}px`
        over.style.setProperty('--axt-frame-w', `${vb.width * S}px`)
        over.style.setProperty('--axt-frame-h', `${vb.height * S}px`)
        const copy = svg.cloneNode(true)
        over.append(copy)
        box.append(over)
        const lines = []
        for (const t of copy.querySelectorAll('text')) {
          const chars = []
          for (const sp of [...t.querySelectorAll(':scope > tspan')]) {
            const cs = getComputedStyle(sp)
            const fam = cs.fontFamily.split(',')[0].trim()
            const text = sp.textContent
            sp.textContent = ''
            for (const ch of text) {
              const g = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
              g.setAttribute('class', 'axt-g')
              g.textContent = ch
              sp.append(g)
              chars.push({ ch, fam, weight: cs.fontWeight, size: Number(sp.getAttribute('font-size')) })
            }
          }
          if (!chars.some((c) => isMarkIn(c.ch) && face.test(c.fam))) continue
          chars.forEach((c, k) => {
            const p = t.getStartPositionOfChar(k)
            c.x = p.x
            c.y = p.y
            c.adv = t.getExtentOfChar(k).width
          })
          lines.push({ index: [...copy.querySelectorAll('text')].indexOf(t), chars })
        }
        function isMarkIn(ch) {
          return /\p{P}/u.test(ch)
        }
        return { runs, crops, lines, width: vb.width, height: vb.height }
      },
      [n, SCALE, CJK_FACE.source],
    )
    out.runs.push(...prep.runs.map((r) => ({ page: n, ...r })))
    out.crops.push(...prep.crops.map((c) => ({ page: n, ...c })))
    // each line's glyphs shown a quarter at a time (the nearest two shown four apart), the copy moved so the line's band is in
    // view
    for (const line of prep.lines) {
      const cs = line.chars.filter((c) => !/\s/.test(c.ch))
      const size = Math.max(...cs.map((c) => c.size))
      const y = cs[0].y
      const xa = Math.min(...cs.map((c) => c.x)) - size,
        xb = Math.max(...cs.map((c) => c.x + c.adv)) + size
      const band = { x: xa, y: y - 1.4 * size, w: xb - xa, h: 2 * size }
      for (let r = 0; r < 4; r++) {
        const shown = []
        line.chars.forEach((c, k) => {
          if (k % 4 === r && !/\s/.test(c.ch)) shown.push(k)
        })
        if (!shown.length) continue
        const png = await page.evaluate(
          ([li, shown, band, S]) => {
            const box = document.getElementById('axt-punct-probe')
            const t = box.querySelectorAll('text')[li]
            for (const [k, g] of [...t.querySelectorAll('.axt-g')].entries())
              g.classList.toggle('on', shown.includes(k))
            for (const o of box.querySelectorAll('text')) if (o !== t) o.style.visibility = 'hidden'
            t.style.visibility = ''
            box.style.left = `${-band.x * S}px`
            box.style.top = `${-band.y * S}px`
            return null
          },
          [line.index, shown, band, SCALE],
        )
        void png
        const shot = await page.screenshot({
          clip: { x: 0, y: 0, width: Math.ceil(band.w * SCALE), height: Math.ceil(band.h * SCALE) },
        })
        // each shown glyph's ink: the dark pixels from the origin of the glyph before it to that of the glyph two after it (the
        // shown glyphs nearest it are four away: the one before ends before that origin, the one after starts after the other)
        const windows = shown.map((k) => {
          const prev = line.chars[k - 1],
            after = line.chars[k + 2]
          const c = line.chars[k]
          return [k, prev ? prev.x : c.x - size, after ? after.x : c.x + c.adv + size]
        })
        const inks = await page.evaluate(
          async ([b64, windows, band, S]) => {
            const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
            const c = new OffscreenCanvas(bmp.width, bmp.height)
            const x = c.getContext('2d')
            x.drawImage(bmp, 0, 0)
            const d = x.getImageData(0, 0, bmp.width, bmp.height).data
            return windows.map(([k, wa, wb]) => {
              const i0 = Math.max(0, Math.floor((wa - band.x) * S)),
                i1 = Math.min(bmp.width, Math.ceil((wb - band.x) * S))
              let a = Infinity,
                z = -1,
                top = Infinity,
                bot = -1
              for (let j = 0; j < bmp.height; j++)
                for (let i = i0; i < i1; i++) {
                  const p = (j * bmp.width + i) * 4
                  if (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2] < 128) {
                    if (i < a) a = i
                    if (i > z) z = i
                    if (j < top) top = j
                    if (j > bot) bot = j
                  }
                }
              return [
                k,
                z < 0
                  ? null
                  : {
                      x0: band.x + a / S,
                      x1: band.x + (z + 1) / S,
                      y0: band.y + top / S,
                      y1: band.y + (bot + 1) / S,
                    },
              ]
            })
          },
          [shot.toString('base64'), windows, band, SCALE],
        )
        for (const [k, ink] of inks) line.chars[k].ink = ink
      }
      for (const [k, c] of line.chars.entries())
        out.glyphs.push({ page: n, line: line.index, k, baseline: +c.y.toFixed(2), ...c })
    }
    await page.evaluate(() => document.getElementById('axt-punct-probe')?.replaceChildren())
  }
  return out
}

/** the three verdicts over a measured drawing (measurePunct): the faults of each, and what the marks stood beside */
export function judgePunct(m) {
  const tol = 1 / SCALE
  const overlaps = []
  const beside = {}
  const byLine = new Map()
  for (const g of m.glyphs) {
    const key = `${g.page}|${g.line}`
    if (!byLine.has(key)) byLine.set(key, [])
    byLine.get(key).push(g)
  }
  const kindOf = (o) =>
    o.crop
      ? 'crop'
      : /\p{Nd}/u.test(o.ch)
        ? 'digit'
        : /\p{sc=Latn}/u.test(o.ch)
          ? 'latin'
          : isMark(o.ch)
            ? 'mark'
            : 'cjk'
  for (const [key, gs] of byLine) {
    const [page] = key.split('|').map(Number)
    const base = gs[0].baseline
    const items = [
      ...gs.filter((g) => g.ink && !/\s/.test(g.ch)).map((g) => ({ ...g, box: g.ink })),
      ...m.crops
        .filter((c) => c.page === page && Math.abs(c.line - base) < 0.05)
        .map((c) => ({ crop: true, ch: '', box: c, x: c.x0 })),
    ].sort((a, b) => a.box.x0 - b.box.x0 || a.x - b.x)
    items.forEach((g, i) => {
      if (g.crop || !isMark(g.ch) || !CJK_FACE.test(g.fam)) return
      for (const o of [items[i - 1], items[i + 1]]) {
        if (!o) continue
        const k = kindOf(o)
        if (!beside[g.ch]) beside[g.ch] = new Set()
        beside[g.ch].add(k)
        const w = Math.min(g.box.x1, o.box.x1) - Math.max(g.box.x0, o.box.x0)
        const hgt = Math.min(g.box.y1, o.box.y1) - Math.max(g.box.y0, o.box.y0)
        if (w > tol && hgt > 0)
          overlaps.push({ page, mark: g.ch, fam: g.fam, with: o.crop ? 'crop' : o.ch, by: +w.toFixed(3) })
      }
    })
  }
  // (ii) one character in one face, one place in its box
  const places = new Map()
  for (const g of m.glyphs) {
    if (!g.ink || !isMark(g.ch) || !CJK_FACE.test(g.fam)) continue
    const key = `${g.fam} ${g.weight} ${g.ch}`
    const o = [
      (g.ink.x0 - g.x) / g.size,
      (g.ink.x1 - g.x) / g.size,
      (g.y - g.ink.y1) / g.size,
      (g.y - g.ink.y0) / g.size,
    ]
    if (!places.has(key)) places.set(key, { n: 0, lo: [...o], hi: [...o], size: g.size })
    const p = places.get(key)
    p.n++
    p.size = Math.min(p.size, g.size)
    o.forEach((v, i) => {
      p.lo[i] = Math.min(p.lo[i], v)
      p.hi[i] = Math.max(p.hi[i], v)
    })
  }
  const wandering = []
  for (const [key, p] of places) {
    const spread = Math.max(...p.lo.map((v, i) => p.hi[i] - v))
    if (spread > 2 / SCALE / p.size) wandering.push({ mark: key, n: p.n, spreadEm: +spread.toFixed(3) })
  }
  // (iii) every run's advance drawn on its own, the layout's; and where it stands among the others, reported
  const tolOf = (r) => ADVANCE_TOL * [...r.s].length
  const advances = m.runs.filter((r) => r.error || Math.abs(r.alone - r.laid) > tolOf(r))
  const worst = m.runs.reduce((a, r) => (r.error ? a : Math.max(a, Math.abs(r.alone - r.laid) / [...r.s].length)), 0)
  const context = m.runs.filter((r) => !r.error && Math.abs(r.drawn - r.alone) > tolOf(r))
  const missing = [...MARKS].filter((c) => !beside[c])
  return {
    overlaps,
    wandering,
    advances: advances.slice(0, 12).map((r) => ({
      s: r.s?.slice(0, 12),
      face: r.face?.replace(/^.*?px /, ''),
      alone: +r.alone?.toFixed(3),
      laid: +r.laid?.toFixed(3),
      error: r.error,
    })),
    advancesOff: advances.length,
    runs: m.runs.length,
    worstAdvance: +worst.toFixed(4),
    context: context.map((r) => ({
      s: r.s,
      drawn: +r.drawn.toFixed(3),
      alone: +r.alone.toFixed(3),
      laid: +r.laid.toFixed(3),
    })),
    marks: m.glyphs.filter((g) => isMark(g.ch) && CJK_FACE.test(g.fam)).length,
    beside: Object.fromEntries(Object.entries(beside).map(([k, v]) => [k, [...v].sort().join(',')])),
    missing,
  }
}
