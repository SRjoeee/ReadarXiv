# The PDF reader's interface: design

2026-09-25. Agreed with the maintainer over nine rounds of a variants harness (`poc-reader/variants.*`, local and never
committed, deleted once this is built) between 2026-09-24 and 09-25; the maintainer's words are quoted where a decision
rests on them. This document is what the implementation plan argues from. Where it and the harness disagree, this
document wins; where it is silent, the harness shows the agreed look.

## 1. Goal, scope, principles

The bilingual PDF reader gets its real interface, built where it will stay: an extension page under
`src/entrypoints/pdf-reader/`, React and TypeScript. The engine (the `poc-reader` modules that fetch, translate,
compile, anchor and synchronise) moves behind a typed controller **unchanged**, except for the three measured changes
and the small ones in §10. The next stage, before the reader leaves the experiment, ports the engine to TypeScript
and pays #299's debt.

Not in this stage: the engine's TypeScript port and #299; jumping back after a jump (#300); a draggable splitter (the
maintainer: 「可拖动的分栏不做」); typesetting by writing system (#295); anything paid (「暂时不用收费」).

The maintainer's standards, which every section below answers to:

- **Experience first**: 「优雅、简洁但富含细节、且克制」. Each control, state and motion answers "what does the reader
  gain"; nothing is there for looks.
- **Performance first**: 「性能极佳……避免中看不中用」. Every visual detail that runs while reading (blur, shadow,
  filter, animation) is measured on the heaviest paper before it ships (§12).
- **No technical path is ever shown to a reader**: 「过去和将来都不应该出现这种纯技术性的、非用户可感知的纯开发者提示」.
  LaTeX, compiling, typesetting services, engines, providers never appear in the interface; when a technical reason makes
  a function unavailable, its control is greyed out, without an explanation.
- **Its own visual language**: the reader does not inherit the extension's design system (「不用继承我们之前的系统」);
  the extension's interaction rules (one kind of control, one popover; settings apply at once) and copy rules still do.

## 2. Where the reader is reached

What changes on the extension's side is §9; here, the ways in.

- **An arXiv PDF** (`arxiv.org/pdf/<id>`) opens straight into the reader when `pdfReader.enabled` is on (the default).
  `pdf.content.ts` lays the reader's page over the browser's viewer in a full-window frame, as it does today, so the
  address stays arXiv's. Off, the browser's viewer shows the PDF with the floating button.
  - A PDF address carrying `#readarxiv` opens the reader whatever the setting says: it is an explicit request, and the
    abstract page's entry and the floating button use it (the HTML version's link carries the same hash today).
- **The abstract page's popup**: the entry view's one button becomes two, side by side, **HTML 对照翻译** and **PDF 对照
  翻译**, where `reading.openIn` says (a new tab by default). The reader chooses; we do not choose for them (the
  maintainer: 「在PDF入口和HTML入口中自选——我们不替用户做决定」). PDF 对照翻译 opens the paper's PDF address with
  `#readarxiv`, which asks for a translation: the reader opens translating, in 对照 or 译文 as last chosen (§3), and
  leaves 原文 if it was last left there.
  - HTML 对照翻译 is disabled with the existing note when the paper has no HTML version (a thing a reader can see on
    arXiv).
  - PDF 对照翻译 is disabled **without words** when the paper cannot be had as a bilingual PDF (§1's rule).
  - How that is known (checked 2026-09-25 on 1706.03762, which has a source, and 2608.07562, one of the corpus's 11
    PDF-only submissions):
    - on the abstract page, arXiv's own source link in the Access Paper list, `a.download-eprint` (TeX Source, to
      `/src/<id>`), read as the HTML link is now, with no request; a PDF-only submission has no such link. The selector
      goes into `src/core/rules/abstract.ts`;
    - on a PDF page with the reader closed, a HEAD on `arxiv.org/src/<id>`, as the HTML version is checked there now: a
      source answers `application/gzip` (a `.tar.gz` or a gzipped file), a PDF-only submission `application/pdf`.
- **The floating button**: on the abstract page, and on a PDF page with the reader closed, the logo opens the panel —
  the popup in its frame, with the two entries — and the column's separate control-panel segment goes on those pages,
  since the logo now does what it did (the maintainer's ruling, 2026-09-24). The settings segment stays. On the HTML page
  nothing changes. **Inside the reader there is no floating button** (the maintainer: 「不出现」), as today.
- **A browser the reader cannot run on**: PDF.js's modern build calls built-ins newer than the extension's floor
  without a guard (Chrome 131 has none of them: measured 2026-09-25, Part 1's final review). There the reader is not
  offered: arXiv's PDF stays in the browser's viewer with the floating button, and the popup's PDF entry is disabled without words,
  as for a paper that cannot be had. `src/pdf-reader/support.ts` (`readerRuns`) decides; the modern build is kept for
  every browser that has them.
- **Leaving**: 在默认查看器中打开 closes the frame (the `axt-pdf-reader-close` message, its origin checked, as today); the
  browser's viewer is underneath, and the floating button comes with it.

## 3. Displays and what they share

Three displays: **原文** (the original alone), **对照** (the two side by side), **译文** (the translation alone). The words
appear in tooltips, menus and to screen readers; the toolbar shows icons (§6.2).

- **The display is the extension's**, shared with the HTML page (the maintainer approved, 2026-09-24): 对照 is the HTML
  page's side-by-side mode and 译文 its translation-only mode; the HTML page's stacked mode opens the reader in 对照.
  原文 is "translation off", as the popup's 显示原文 is. Whatever was last chosen, on either page, is what opens next.
- **Swap sides** (对照 only): the translation on the left, the original on the right. Remembered.
- **Sync scrolling** (对照 only): the two sides keep their tops aligned — one mode, no choices (the maintainer checked
  the patent question: no conflict). On by default; remembered; the same value as the settings page's switch.
- **Single display**: the scroller spans the window, so the margins scroll too and the scroll indicator sits on the
  window's edge; the page is centred, and *fit width* fits it to the pane but never beyond a reading width of 1060 CSS px
  (the width the old 1100 px column gave).

## 4. Visual language: "paper"

The direction the maintainer chose (「选"纸"」) after rejecting a first round as 「不够PDF工具场景化」, with PDFSlick's
restraint as the floor (「只是一个及格线」) and alphaXiv's natural transitions as the model for motion.

### 4.1 Tokens

One cool neutral ramp at hue 255 and one status hue, all oklch; light and dark values. The dark ramp is used when the
appearance is dark, or is the system's and the system is dark.

| Token | Light | Dark |
|---|---|---|
| `--n-0` | `oklch(1 0 0)` | `oklch(0.255 0.006 255)` |
| `--n-1` | `oklch(0.985 0.002 255)` | `oklch(0.215 0.006 255)` |
| `--n-2` | `oklch(0.962 0.004 255)` | `oklch(0.185 0.006 255)` |
| `--n-3` | `oklch(0.935 0.006 255)` | `oklch(0.275 0.007 255)` |
| `--n-4` | `oklch(0.905 0.007 255)` | `oklch(0.31 0.008 255)` |
| `--n-5` | `oklch(0.86 0.008 255)` | `oklch(0.36 0.009 255)` |
| `--n-7` | `oklch(0.62 0.012 255)` | `oklch(0.56 0.01 255)` |
| `--n-8` | `oklch(0.505 0.014 255)` | `oklch(0.71 0.01 255)` |
| `--n-10` | `oklch(0.235 0.012 255)` | `oklch(0.935 0.005 255)` |
| `--danger` | `oklch(0.545 0.17 28)` | `oklch(0.69 0.15 28)` |
| `--focus` | `oklch(0.55 0.15 255)` | `oklch(0.72 0.12 255)` |

Roles: `--canvas` n-3 (behind the pages), `--chrome` n-0 (toolbar, sidebar, popovers), `--chrome-line` n-4 (0.5 px
hairlines), `--ink` n-10, `--ink-2` n-8, `--ink-3` n-7, `--fill` n-3 (hover and pressed), `--well` n-3 (the display
switch's track), `--lift` n-0 (its thumb). Floating surfaces: `--float-bg` n-0 at 90 %, with a hairline and a soft
shadow. Pages carry a hairline and a 1–2 px shadow; 14 px between pages.

Contrast, measured (WCAG 2.2, OKLCH → sRGB): ink on chrome 16.7:1 (dark 13.0:1); ink-2 on chrome 5.9:1 (6.1:1), on the
well 4.9:1 (5.8:1); ink-3 on chrome 3.6:1 (3.4:1). So **ink-3 is for icons and hairline-weight marks only** (3:1 for
non-text), never for text: the harness's page numbers in the contents set in ink-3 fail and use ink-2 here; the switch's
off-state track, n-5 in the harness (1.5:1 against chrome), uses ink-3 here.

### 4.2 Type, icons, motion

- Type: the system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "PingFang SC", "Noto Sans SC",
  sans-serif`), 13 px base; 12.5 px for controls, 12 px for secondary text, 11 px only for page numbers; 500 for control
  labels, 600 for the title and the current section; tabular figures wherever numbers change.
- Icons: Lucide, 16 px, stroke 1.5 on the 24 grid (1 CSS px), `currentColor`; the display switch's own three (§6.2).
- Motion: one easing, `cubic-bezier(0.2, 0, 0, 1)`; 120–260 ms; enter heavier than exit; press scales to 0.96. Under
  `prefers-reduced-motion: reduce` every movement becomes a fade or nothing.

### 4.3 Appearance and dark pages

- **Appearance**: 浅色 / 深色 / 跟随系统, default 跟随系统 (「深色模式跟随系统」). A change is one crossfade of the whole
  page (the View Transitions API, 260 ms), not element by element (the maintainer: 「要学alpharxiv的方式，过渡自然」).
- **深色时调暗页面**, a switch in the reading options, **default on** (「默认是开启这个功能的」): in the dark appearance the
  pages' canvases take `filter: invert(88.8%) hue-rotate(180deg)` and an undrawn page's background is `rgb(29 29 29)`,
  so nothing flashes white while scrolling. Only the canvas is filtered: the highlight and the figure overlays keep their
  colours. Off, the pages stay white in the dark chrome.
- The night-reading switch of the earlier rounds is gone; the two items above replace it (the maintainer's point 3,
  2026-09-24).

## 5. Layout

- **Toolbar**, 44 px, fixed, a three-zone grid (`minmax(0, 1fr) auto minmax(0, 1fr)`): lead, centre, trail (§6.1). A
  0.5 px hairline below it.
- **Document area** below it; in 对照 two panes with an 8 px gutter of canvas between them (so that zoomed pages never run
  into each other, the maintainer's point 7).
- **Contents sidebar**, 236 px, slides in from the left over 200 ms and moves the document area with it.
- **Floating over the document**: one page pill per pane at its bottom centre (16 px up); the status capsule at the
  document area's bottom centre, 58 px up, above the pills; the scroll indicator on each pane's right edge.
- **Narrow windows**: the title yields first (it truncates; below 1100 px only the arXiv id is left, the title in its
  tooltip); below 900 px the language and service menus move into the reading options, as their first two rows. When the
  document area is narrower than 840 px, two pages side by side are too small to read: 对照 stays chosen, the translation
  is shown alone, and the capsule says so once, 窗口较窄，暂只显示译文 — the HTML page's rule and wording (S-P-74, 窗口较窄，
  暂按上下显示). The widths are to be checked by reading at them while building.

## 6. Components

### 6.1 The toolbar

**Lead**

- 目录 (Lucide `panel-left`, pressed while open).
- The title: 600 13 px, one line, truncating first; the whole title in the tooltip.
- The arXiv id: `arXiv:2608.02163` in ink-2 12 px tabular figures, a link to the abstract page in a new tab (the
  maintainer: 「改成可以点，点击打开abs页」); on hover or focus it takes the fill and a small `arrow-up-right` slides in
  beside it. Tooltip 在 arXiv 打开摘要页.

**Centre**: the display switch (§6.2).

**Trail**, in this order, a hairline divider between the groups:

1. 交换左右 (`arrow-left-right`, pressed when swapped) and 同步滚动 (`link-2`, pressed when on). Both act in 对照 only;
   in the single displays they stay in place, greyed, so the bar never reflows.
2. Zoom: − · the value with a chevron · +. The value opens a menu: 适合宽度, 适合页面, 实际大小, then 50 %–200 %; the
   current one checked. Shortcuts ⌘− and ⌘+ (Ctrl on other systems).
3. The target language (its name and a chevron, **no icon**: the translation mark belongs to the display switch alone,
   and the name says what the menu is) and the service (its name and a chevron). Their menus are §6.7's.
4. 阅读选项 (`sliders-horizontal`), a popover: 对照高亮 (switch), 高亮颜色 (a swatch for each highlight profile: the
   three built-in, 柔和绿, 淡黄, 淡蓝, and any added in the settings), a separator, 图片翻译 (switch; the popup's word,
   the maintainer's ruling of 2026-09-25), a separator, 外观 (a small segmented control: 浅色, 深色, 跟随系统),
   深色时调暗页面 (switch). All are settings (§9.1), the same values the popup and the settings page change; a change
   applies at once.
5. 下载 (`download`), a menu of two items, text only: 译文 PDF, 原文 PDF (the maintainer: 「只要译文 PDF / 原文 PDF」).
   Files are named `<id>.pdf` and `<id>.<target>.pdf`. Free. 译文 PDF is the final translation: while the translation is
   still coming in (previews), the item is greyed.
6. 设置 (`settings`): opens the settings page at its PDF reader section.
7. 在默认查看器中打开 (`log-out`): leaves the reader for the browser's own viewer (the maintainer's wording, 2026-09-25).

Buttons are 30 × 30 with a 7 px radius and a hit area grown to the bar's height; hover and open take the fill. Every
button has a tooltip: after 500 ms of hover, at once on keyboard focus; one line always (a tooltip wrapped when it was
measured at its last place near the window's edge); the shortcut, when there is one, in a lighter `kbd` after the words.

### 6.2 The display switch

A well (the `--well` track, 30 px high, 9 px radius, 2 px padding) of three equal segments, **40 px each whatever the
interface's language** (the maintainer's reason for icons: 「不同语言界面下文字长度不一样，字宽导致按钮变来变去会很难看」).
The chosen one sits on a lifted thumb that slides between segments in 220 ms; chosen icons take ink, the others ink-2,
a disabled one ink-3 at 55 %.

The icons, each on a 24 × 18 canvas, 1 unit = 1 CSS px, stroke 1.2 with round caps and joins:

- **原文**: a pane (`rect x 2.25 y 2.5 w 19.5 h 13 rx 3`) with an **A** in its middle.
- **对照**: the same pane split by a vertical rule at x 12.
- **译文**: the same pane with **文** in its middle.

The letters are Noto Sans SC (SIL OFL 1.1) at weight 350, the face's DemiLight — its Latin and CJK designed together —
turned into outlines so that every system draws the same shapes (system faces were tried first: headless Chromium gave
PingFang's heaviest weight at that size, and Windows and Linux would draw other faces). Each is centred on the pane by
its ink, not its em box: A 8 px high, 文 9 px (a CJK glyph looks smaller than a Latin capital of its height). 文 is
narrowed across to 0.8 of its width (9.1 → 7.3 px, beside A's 6.5; the maintainer asked for it to come near A's width),
and the weight that takes from its verticals and diagonals is given back by a 0.16 px stroke round its outline. The
outlines are produced by a script from the font (kept with the reader's code) and committed as path data; the font's
licence goes into `docs/THIRD_PARTY.md`. The maintainer may refine 文 by hand later (「这个之后有时间我们再改」); editable
SVGs of the three icons and of 文's full-width source outline were handed over for that.

Rejected on the way, so that nobody tries them again: words (their width changes with the language); letter pairs and
panes marked by drawn letters (「文字的都设计太差了」); left half / right half for the single displays (which side is
which is a convention, 「解释有点牵强」); a translation badge on the pane's corner, outline or solid (right idea, 「不够简洁」,
then replaced by the maintainer's letters in the middle).

It is a single choice, so it is a radio group to assistive technology: `role="radiogroup"` named 显示, three
`role="radio"` with `aria-checked` and the words as their names, arrow keys moving the choice. Keys **1**, **2**, **3**
choose 原文, 对照, 译文 anywhere on the page outside a text field; the tooltips show them. A display that cannot be had
(§8) is `aria-disabled` and skipped by the arrows.

### 6.3 The contents sidebar

- A header 目录 (11.5 px, 600, ink-2), then the paper's own headings as a **folding tree** of up to three levels, one
  28 px row each: level 1 at 12.5 px 500 in ink, levels 2 and 3 at 12 px 400 in ink-2, indented 14 px per level. A fold
  chevron (12 px, rotating 90° in 150 ms) before every entry that has children; a leaf keeps the chevron's slot, so every
  title starts on one edge. Compact, after PDFSlick's folding outline and alphaXiv's hierarchy (the maintainer:
  「空间占用有点太大……两者都更紧凑简洁」).
- Each row: the **translated title**, one line, truncating; the original title in its tooltip; the page number at the end
  (11 px, tabular, ink-2 — §4.1).
- The section being read is marked (the fill, 600) and its branch expanded; the mark follows the reading as it scrolls.
  A row jumps both sides to the heading.
- The headings and their levels come from the paper's source as the engine reads it: the source parser
  (`latex-front`) knows which sectioning command each heading unit comes from (`section`, `subsection`,
  `subsubsection`, …) and keeps it on the unit as its level (§10.4); a copy stored before that has no levels and its
  outline is flat. A heading's page is the translation's.

### 6.4 The page pills

One per pane at its bottom centre (EmbedPDF's idea, the maintainer: 「把页码直接放在PDF显示区中间会更好」), a 30 px
capsule on the floating surface: ‹ · the page number (an input, 3.2 ch, select-all on focus) · / total · ›.

- Shown while its pane scrolls and for 2.5 s after, and while hovered or focused; otherwise transparent and not in the
  way of the pointer. Updated from PDF.js's `pagechanging`, never read ahead of it (the harness's first pill lagged a
  page behind for that reason).
- Typing a number and Enter goes there; the arrows step a page.
- Named 原文页码 and 译文页码; the buttons 上一页 and 下一页.

### 6.5 The scroll indicators

The panes' native scrollbars are off. Each pane shows its own indicator on its **right edge** — both panes, where every
scroll area keeps it (the maintainer turned down mirroring the left one to the outer edge: 「当handle靠右显示时……会破坏
用户原有的习惯」 — the handle belongs on the right).

- A 14 px track, a 4 px round thumb in ink at 30 %; its length is the pane's visible share (at least 32 px).
- Hidden at rest; shown while the pane scrolls and for 0.9 s after, and while the pointer is on it; the thumb widens to
  7 px and darkens to 45 % under the pointer.
- The thumb drags (the pane follows; the other side follows through sync as for any scroll); a press on the track turns a
  screen towards it. A press on an indicator makes its pane the leading side, as a press in the pane does.
- The thumb's position is a CSS scroll-driven animation on the pane's scroll timeline (`scroll-timeline` on the
  scroller, `timeline-scope` on the pane): it moves on the compositor, and no script runs while scrolling. Script sets
  only its length, on resize and zoom.

### 6.6 The status capsule and the card

One anatomy for every state: an icon, one sentence, at most one action. Its place is the document area's bottom centre,
above the page pills, clear of the header (the maintainer: 「放在文字切换的上方、页数切换条的上方……不让它占用HEADER的地
方」). It is `role="status"`, present and empty from the first paint, so that what it says later is announced.

- A 34 px capsule on the floating surface. It enters by rising 10 px and fading in with a slight scale (240 ms) and
  leaves lighter (160 ms); a new state of the same kind changes its words in place — the words fade in, the capsule's
  width eases to theirs (200 ms) — instead of leaving and coming again.
- **Progress** is a line along the toolbar's foot, not the capsule's: 2 px of quiet ink (`--ink-3` at 80 %), its length
  the share done — the PDF's download while the reader loads, the paragraphs translated while a translation runs. It
  grows by a transform and fades out at the length it reached; each stage is a line of its own, so that the
  translation's starts afresh rather than the download's shrinking back. It is all that shows a load or a translation
  under way: no capsule does, and the words (正在加载, 正在翻译, 正在按当前设置重新翻译) are said to screen readers in
  the status region. (The harness's fifth round moved the progress into a fill of the capsule, ink at 8 %, with the
  status words; the maintainer asked for the line back, 2026-09-25 — the status words were what had to leave the
  header, not the line — and then for no capsule while it runs: the line says it.)
- The paragraphs that failed are told once the run has ended, not while it runs.
- **A notice** carries a chip action and a close button; closing it is remembered for this paper's visit.
- **When the translation's pane has nothing to show**, the same anatomy is a card centred in that pane (300 px, 14 px
  radius, the popover shadow), with a filled action; the capsule is not shown as well.

The states are §8's.

### 6.7 Popovers and menus

- Anchored under their button, 6 px below it, kept within the window; they grow from the button (scale 0.97 → 1 and
  4 px, 150 ms). Escape and a press outside close them; focus returns to the button.
- Items are 30 px rows with an 8 px radius; the chosen one checked.
- 目标语言: a search field, then the nine languages the reader supports, each in its own language: 日本語, 简体中文,
  繁體中文, 한국어, Deutsch, Español, Français, Português, Русский.
- 翻译服务: the same list and labels as the popup's service menu.
- They are built on the shared `Menu` once it has the fixes in §9.4.

### 6.8 Pinch zoom

A trackpad pinch (or Ctrl/⌘ with the wheel) over the pages zooms both panes together around the pointer, as EmbedPDF
does (「直接双指捏合滑动就可以放大缩小」): a trackpad's small deltas zoom continuously, a mouse notch steps a tenth. PDF.js
scales the pages by CSS while the pinch lasts and draws them once, 400 ms after it ends
(`updateScale({ scaleFactor, origin, drawingDelay: 400 })`). The browser's own zoom is taken only over the pages. The
overlays follow the pinch exactly (§10.1).

## 7. Interaction details

- A press on a toolbar button scales it to 0.96; hover and open take the fill in 150 ms.
- The display switch's thumb slides; the sidebar slides; the pills and indicators fade; the capsule rises; the appearance
  crossfades. Nothing jumps.
- Escape closes the open popover; 1 / 2 / 3 choose the display; ⌘± zoom.

## 8. States

The mechanism is §6.6; the words come from the locale packs, and failure reasons reuse the ones the popup already shows.
No state that tells the reader nothing is shown (no "done").

| State | When | Shown |
|---|---|---|
| Reading | 原文; a translation ready; a stored translation shown, offline included | nothing |
| Loading | a large PDF is loading | the progress line by the share downloaded; 正在加载 said to screen readers |
| Translating | the first translation | the progress line by the share of paragraphs done; 正在翻译 said to screen readers |
| Translating again | a stored translation, settings changed | the progress line likewise, 正在按当前设置重新翻译 said to screen readers; the old translation stays readable and is replaced paragraph by paragraph |
| Some paragraphs failed | a translation with gaps | capsule: {n} 处翻译失败 · 重试 · close |
| Language not supported | the shared target language is not one of the nine | 原文, with the capsule: PDF 对照暂不支持{语言} · 选择语言 (opens the language menu in place); choosing one of the nine translates |
| Nothing translated | a service failure with no paragraph done | card in the translation's pane: the reason (网络连接失败, API Key 无效或已过期, 尚未配置 API Key, …) · 重试, or 设置 when the reason is a key (opening the settings page at the services) |
| Cannot be had | the paper cannot be turned into a bilingual PDF, for any technical reason | 对照 and 译文 greyed in the switch, no words; the reader shows 原文 |
| Narrow window | 对照 chosen, the document area under 840 px (§5) | the translation alone; capsule, once: 窗口较窄，暂只显示译文 |

- Recovery is automatic where it can be: when the network comes back the translation goes on by itself; 重试 asks only
  for the paragraphs that are missing, the rest come from the cache; rate limiting never shows (the chain retries it, and
  only its final giving-up counts as a failure).
- A failure never takes focus.

## 9. The extension around the reader

### 9.1 Settings: one set, shared

The reader keeps no settings of its own apart from the extension's: the popup, the settings page and the reader change
the same values, and each follows the others through the shared configuration's subscription at once
(`useSurfaceConfig`). There is no new message for it.

**Read, as they are**: `targetLanguage` (the nine are the reader's; §8 for the others), `provider` and `services`,
`reading.sentenceHighlight` (对照高亮), `appearance.activeHighlight` among `appearance.highlights` (高亮颜色: the swatches are
the configured highlight profiles, the three built-in and any added), `image.enabled` with `image.modes` (图片翻译:
figure text is shown when it is on and the display's mode, §3, is among the modes, as on the HTML page), `uiLanguage`
(the reader's words), `mode` (the display, §3).

- **Writing the display**: 对照 writes `mode: 'side'`, unless it is `'stack'` (a side-by-side choice already for the
  reader); 译文 writes `'only'`; both clear `pdfReader.original`. 原文 sets `pdfReader.original` and leaves `mode` alone.

**New**, a `pdfReader` group; `CONFIG_VERSION` 18 → 19, with a migration that adds it with its defaults:

| Key | Type | Default | What |
|---|---|---|---|
| `pdfReader.enabled` | boolean | true | 在 arXiv 的 PDF 上使用对照阅读器 |
| `pdfReader.original` | boolean | false | the reader was last left in 原文 (the HTML page's "translation on" is the tab's session, not a setting) |
| `pdfReader.sync` | boolean | true | 同步滚动: the engine's `same` mode on, `off` off |
| `pdfReader.swapped` | boolean | false | 交换左右 |
| `pdfReader.appearance` | `'light' \| 'dark' \| 'system'` | `'system'` | 外观 (the extension has no appearance setting; its pages follow the system) |
| `pdfReader.dimPages` | boolean | true | 深色时调暗页面 |

The experiment's own `axtPdfReader` storage key goes, without a migration: it was never released (rule 7 is about what a
released version left on a machine).

### 9.2 The popup while the reader is open

The entry message's answer (`EntryStatus`) gains the page's kind, `'abs' | 'pdf'`, and on a PDF page whether the reader
is open. With the reader open, the popup acts on it, by the settings (the maintainer: general functions stay; what the
reader cannot do is greyed or hidden):

- 翻译服务: all, as elsewhere.
- 目标语言: the nine only.
- The prompt row: as elsewhere.
- The mode bar: 左右 and 仅译文 usable; 上下 disabled, its title PDF 对照不支持上下排列 (a layout the reader can see, not
  a technical reason). A `mode` of `'stack'` shows as 左右 chosen, since that is what the reader shows.
- The primary button: 翻译本页 / 显示原文, clearing or setting `pdfReader.original`.
- 对照高亮 and 图片翻译: as elsewhere.
- The style menu: hidden (it has no effect on a typeset PDF; hidden, not explained).

With the reader closed, a PDF page gets the abstract page's entry view: the two buttons.

### 9.3 The settings page

- A new section **PDF 阅读器** (`#pdf-reader`, after 阅读): 在 arXiv 的 PDF 上使用对照阅读器, 同步滚动, 外观, 深色时调暗页面.
  The reader's 设置 button opens the settings page there.
- **数据** gains a line for the PDF translations kept on this machine, `{n} 篇 · {size}`, and 清除 through the existing
  `Confirm` (two presses; it disarms after 4 s), beside the HTML translations' line (the maintainer: 「其他暂时这样」 on
  the proposal). The settings page is on the extension's origin and calls the store's `usage()` and `clear()` directly.

### 9.4 The shared `Menu`, made accessible

The reader's menus are built on `src/ui/Menu.tsx`, and its gaps are closed for every user of it (the popup, the
settings page's drawers): the active item announced as the arrows move; Home and End; typing a letter jumps to it; focus
back on the trigger when it closes; no buttons inside a listbox.

## 10. Engine changes, each measured

### 10.1 Overlays follow a pinch by transform

The highlight bands and the figure overlays are positioned in CSS pixels of the page as it was drawn. While a pinch lasts
PDF.js scales the page by CSS alone, so they drifted off their figures: 54 → 108 → 209 px from 83 % to 114 %. Each keeps
its pixel geometry and gains `transform-origin: <−left>px <−top>px` and `scale: calc(var(--total-scale-factor) / s0)`, `s0`
the viewport scale it was drawn at: it scales about the page's origin with the page, on the compositor, with no layout
and no script. Mid-pinch it stays within 0.7 px of its place.

Measured on 2608.02163, a pinch 83 % → 245 % in 36 steps, three runs each, in a real window; the method is in
`REPORT.md`'s nineteenth addendum, and the implementation commits the probe, driving PDF.js's `updateScale` itself so
that it needs no harness:

| Way | Layout per pinch, 1 figure / 220 labels | Main thread | Frames over 1.5× |
|---|---|---|---|
| Pixels (before) | 29 / 86 ms | 303 / 528 ms | 1–3 |
| Percent of the page box | 4–9× the layout | 2–4× | 7–56 |
| Transform (this) | 30 / 84 ms | 335 / 476 ms | 1–2 |
| Hidden while pinching | 29 / 91 ms | 295 / 431 ms | 0–2 |

Percent positioning — proposed first, and the reason the maintainer asked for certainty (「一定要确定……不是贪小便宜吃大
亏的，它不能影响性能」) — costs the whole page's layout on every frame as soon as one child of a page is sized in percent,
whatever the number of labels (2.5× with the labels removed). PDF.js itself hides its text layer during a pinch for the
same reason. Freezing the overlays into a layer (`will-change: transform`) during a pinch gained nothing and cost more
under load; hiding them costs the same as the transform but loses them for the pinch. Neither is used.

### 10.2 Overlays kept across a redraw

PDF.js's page `reset()` removes every node it does not own when it redraws a page after a zoom; the overlays were put
back only after the figure pipeline ran again, so a figure showed its original text for 40–300 ms. A `MutationObserver`
on the pages puts a removed overlay back in the same task, before the frame is painted, except the ones the reader
removes itself (marked as it removes them). Measured: 0 ms bare, at no cost; the transform keeps them right at the new
scale, and nothing is recomputed unless their content changes.

### 10.3 Stopping early when the service fails

When a batch fails because of the service itself (network, key, quota), the rest are not sent: they would fail the same
way. With no paragraph translated nothing is compiled and the card shows the reason; with some, what there is is
compiled and the notice counts the rest. (Before: every batch retried for 24–48 s, and after 215 s an English "translation"
was compiled.)

### 10.4 Small ones

- A heading unit keeps the level of its sectioning command, for the contents (§6.3).
- A figure's bitmap is read by the extension's recogniser through the background (`axt:ocr`), as the HTML page's
  are: the package carries one recogniser (its build check allows one runtime), and results are cached by the image's
  hash.
- A replaced viewer lets go of its pages: `setDocument(null)` on it and on its link service cancels its page views, their
  text layers and its annotation editor's manager. Before, each swap of the right side kept the whole old viewer alive
  (measured on the demo paper, the heap by CDP: 26 pages and 2 text layers a swap, 234 pages after nine; one more
  document `selectionchange` listener each time); after, none. PDF.js's `abortSignal` is not used: nothing is left
  for it after the teardown, and the document-level selection listener all text layers share is bound to the signal
  of whichever viewer's text layer came first, so aborting that viewer would take text selection from the viewers
  still on screen.
- A test pins the PDF.js internals the engine reads (`_pages`, the page views' `pdfPage.view`, `renderingState`), so an
  upgrade that changes them fails at once.

## 11. Architecture

### 11.1 The page

- `src/entrypoints/pdf-reader/` (`index.html`, `main.tsx`, `App.tsx`), built by WXT with React and TypeScript.
  `pdf.content.ts` opens it in its frame with `?paper=<id>`; `web_accessible_resources` names it.
- Its compile page stays where it is, on our static site, in an `iframe` (`?site=`), unchanged.
- The demo papers stay reachable by address for the probes and the e2e checks (`?paper=<id>` without `live=1`, the
  probes' form since the prototype), never from the interface.

### 11.2 The engine, moved

- The modules move to `src/pdf-reader/engine/` with their import paths changed and nothing else: `anchors`, `sync`,
  `figures`, `engine`, `mt`, `live`, `latex-front`, `paper-meta`, `scripts`, `tar`, `cache`, `names`, `ocr-worker`.
  They import the extension's source directly; the `lib/axt` shared build goes.
- PDF.js from npm at the version vendored now (6.3.289), pinned, bundled by Vite; its cmaps, standard fonts and wasm as
  static files. Text recognition in figures uses the extension's own.
- `reader.js` is cut along its seams: the viewers, anchoring, sync, overlays and the live pipeline become the engine's
  session module behind the controller; its toolbar, hidden controls, status text and link box go, replaced by the
  React interface. Behaviour changes only where §10 says.

### 11.3 The controller

One typed boundary between the engine and the interface (pdfslick's per-viewer store, adopted): the engine reports a
state the interface subscribes to (`useSyncExternalStore`), and takes commands.

```ts
type Display = 'original' | 'bilingual' | 'translation'
type Side = 'left' | 'right'
interface ReaderState {
  paper: { id: string; title: string }
  display: Display
  available: { bilingual: boolean; translation: boolean } // false: cannot be had (§8), greyed
  phase: 'loading' | 'translating' | 'retranslating' | 'ready' | 'failed'
  progress: number                                         // 0–1, the share of paragraphs done
  failedUnits: number                                      // the notice's {n}
  failure: ProviderErrorKind | null                        // the card's reason, through REASON
  languageSupported: boolean
  finalReady: boolean                                      // 译文 PDF can be downloaded
  scale: number
  sides: Record<Side, { page: number; pages: number }>
  outline: Array<{ id: string; title: string; original: string; level: 1 | 2 | 3; page: number }>
  currentHeading: string | null
}
interface ReaderController {
  getState(): ReaderState
  subscribe(listener: () => void): () => void
  setDisplay(display: Display): void
  zoomTo(to: number | 'page-width' | 'page-fit' | 'page-actual'): void
  pinch(factor: number, origin: { x: number; y: number }): void
  goToPage(side: Side, page: number): void
  goToHeading(id: string): void
  setSync(on: boolean): void
  setSwapped(on: boolean): void
  lead(side: Side): void                                   // a press on a side's indicator makes it the leading side
  retry(): void
  download(which: 'translation' | 'original'): Promise<Blob>
  dispose(): void
}
```

The engine's failure classes (`EngineError`: permanent, isolatable, the service's) map to `ProviderErrorKind` here, so
that the reasons are the popup's. The exact shapes are the plan's to fix; the boundary is this one.

### 11.4 Components

`App` · `Toolbar` (`SidebarToggle`, `PaperTitle`, `ArxivLink`; `DisplaySwitch`; `SwapToggle`, `SyncToggle`, `Zoom`,
`LanguageMenu`, `ServiceMenu`, `ReadingOptions`, `DownloadMenu`, `SettingsButton`, `LeaveButton`) · `Outline` · per
pane `PagePill` and `ScrollIndicator` (the engine owns the pane's scroller) · `StatusCapsule` · `FailureCard` ·
`Tooltip`. Popovers and tooltips use the native popover API and CSS anchor positioning (Chrome 131+, as the figure
viewer's control does).

### 11.5 Styling

Tailwind v4, as the popup and the settings page use it, with **the reader's own token sheet** (§4.1, `@theme inline`),
not `ui.css`. PDF.js's viewer sheet with a `box-sizing` reset inside the viewers (pdfslick's lesson; the highlight
offset of 2026-09-22 was ours for want of it).

### 11.6 Words

The reader's words go into the locale packs (`zh-CN`, `en`) under a new surface in `docs/UI.md`, **R** (`S-R-01` …),
with the popup's where they are the same (§15). Nothing in the reader is hard-coded any more; its status text, English
today, goes.

## 12. Performance gates

Each before the stage's pull request, on the heaviest demo paper, in a real window:

- The pinch: §10.1's probe again, in the real page; the transform within the before's noise.
- **Backdrop blur on the pills and the capsule**: they show while a pane scrolls, so their `backdrop-filter:
  blur(16px) saturate(1.5)` is drawn on every scroll frame. Measure frame times while scrolling with them shown; if
  frames drop, they take the opaque floating surface instead.
- **Dark pages**: scrolling with the canvas filter on, and memory at 400 %; the filter must not cost frames.
- The scroll indicators: no scroll listener other than a passive one that toggles their visibility.
- The appearance crossfade: once per change; nothing while reading.
- No `:has()` in the reader's own style sheets (the extension's rule, DESIGN §7.2, applies here too), nor in the
  utilities Tailwind generates for them, which come from the reader's own sources alone. PDF.js's viewer sheet keeps
  its 17, all keyed to PDF.js's classes (annotation and editor layers, the thumbnails): a highlight band's insertion
  costs the same with them and without them (0.3–0.9 ms against 0.4–0.5 ms for six, at 10 000 elements; Part 3's
  final review). The gate is `tests/styles/no-has.test.ts`.

## 13. Accessibility

- Every control has a name; icon-only buttons by `aria-label` equal to their tooltip's words.
- Tooltips on keyboard focus as on hover; everything a pointer does, a keyboard does; focus rings are 2 px `--focus`,
  2 px offset.
- The display switch is a radio group (§6.2); the zoom, download and language/service menus are menus or listboxes with
  the shared `Menu`'s fixed keyboard behaviour; the reading options are a dialog.
- The status capsule is a live region present from the start; failures never move focus.
- Contrast as §4.1; meaning never rides on colour alone (the danger colour always has its icon and words).
- `prefers-reduced-motion` honoured everywhere (§4.2).

## 14. Testing

- **Unit** (Vitest): the display ↔ `mode` mapping both ways; the 18 → 19 migration; the popup view-model's reader
  rules (§9.2); the engine's failure classes to `ProviderErrorKind`; `DisplaySwitch` as a radio group (arrows, 1/2/3, a
  disabled choice skipped); the `Menu` fixes; the overlay transform and the redraw observer against a fake page.
- **Copy**: every reader string comes from the locale packs in both languages; a test fails on a reader-facing string
  naming LaTeX, TeX, compiling, typesetting, an engine or a provider (§1's rule).
- **The engine moved intact**: the existing browser checks pass on the new page unchanged — the cache revisit, the
  viewer faults, the lost cases, the sync frame measurement, `e2e:pdf`.
- **New browser checks**: the pinch (both sides scale; overlays within 1 px mid-pinch; no bare time after the redraw);
  the page pills; the indicators (a drag moves both sides); the abstract popup's two buttons and their disabled states;
  the settings section and the PDF translations' line and 清除; dark pages; the keyboard (1/2/3, the switch's arrows,
  Escape).
- **Probes** for §12, committed with the checks.
- Before the pull request: a `better-interface` review, `break` (every state of §8 rendered), and the gate
  `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## 15. Copy

The words as agreed, zh-CN with the English they stand for; the plan gives them `S-R` ids. Where the popup already says
the same thing, its string is reused (marked).

| Where | zh-CN | English |
|---|---|---|
| Toolbar | 目录 | Contents |
| | 在 arXiv 打开摘要页 | Open the abstract on arXiv |
| | 显示 (the switch's name) · 原文 · 对照 · 译文 | Display · Original · Side by side · Translation |
| | 交换左右 · 同步滚动 | Swap sides · Sync scrolling |
| | 缩小 · 放大 · 缩放比例 · 适合宽度 · 适合页面 · 实际大小 | Zoom out · Zoom in · Zoom · Fit width · Fit page · Actual size |
| | 目标语言 · 搜索语言 · 翻译服务 | Target language · Search languages · Translation service |
| | 阅读选项 | Reading options |
| | 对照高亮 (S-P-80, reused) · 高亮颜色 · 图片翻译 (S-P-85, reused) | Hover highlight · Highlight colour · Images |
| | 外观 · 浅色 · 深色 · 跟随系统 · 深色时调暗页面 | Appearance · Light · Dark · System · Dim pages in dark mode |
| | 下载 · 译文 PDF · 原文 PDF | Download · Translation PDF · Original PDF |
| | 设置 (S-P-02, reused) · 在默认查看器中打开 | Settings · Open in the default viewer |
| Page pills | 原文页码 · 译文页码 · 上一页 · 下一页 | Original's page · Translation's page · Previous page · Next page |
| Status | 正在加载 · 正在翻译 · 正在按当前设置重新翻译 | Loading · Translating · Translating again with the current settings |
| | {n} 处翻译失败 (reused) · 重试 (reused) · 关闭 | {n} passages failed · Retry · Close |
| | PDF 对照暂不支持{语言} · 选择语言 | A bilingual PDF isn't available in {language} yet · Choose language |
| | 窗口较窄，暂只显示译文 (after S-P-74) | The window is narrow, so this shows the translation alone for now |
| | the reasons (`REASON`, reused) | |
| Popup | HTML 对照翻译 · PDF 对照翻译 | Bilingual HTML · Bilingual PDF |
| | PDF 对照不支持上下排列 | The bilingual PDF can't be stacked |
| Settings | PDF 阅读器 · 在 arXiv 的 PDF 上使用对照阅读器 | PDF reader · Use the bilingual reader for arXiv PDFs |
| | {n} 篇 · {size} · 清除 (as the HTML line) | {n} papers · {size} · Clear |

## 16. Open and deferred

- 文 may be refined by hand (§6.2); the committed path data is replaced when it is.
- Jump back (#300), the engine's TypeScript port and #299: the next stage.
