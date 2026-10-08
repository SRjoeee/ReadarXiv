# The PDF reader's interface: design

2026-09-25, moved here from the experiment on 2026-10-08 as it stood at its freeze (the tag `exp-freeze-2026-10-07`).
Agreed with the maintainer over nine rounds of a variants harness (local, never committed, deleted once the interface was
built) between 2026-09-24 and 09-25; the maintainer's words are quoted where a decision rests on them. This document is
what the implementation was argued from. Where it and the harness disagreed, this document won.

How the reader meets the rest of the extension is DESIGN §16; the identities its rules are versioned by are §18; the gates
and measurements of its engine are `lab/pdf/README.md`. The experiment's running record and its plans are no longer in the tree
(`git show exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md`). §3 (the displays) and §8 (the states) describe the
reader as it was built, with a final compile; they are rewritten for the instant layer in a later change of the reader's
rebuild. The original's §16, the stage's open items, is not kept: its first item is the next stage's work, and its second
(a service changed while a paper is translating) was decided and never built.

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
  a function unavailable, its control is greyed out, without an explanation. (A paper that cannot be had says that much,
  and never why: §8, the maintainer, 2026-09-26.)
- **Its own visual language**: the reader does not inherit the extension's design system (「不用继承我们之前的系统」);
  the extension's interaction rules (one kind of control, one popover; settings apply at once) and copy rules still do.

## 2. Where the reader is reached

What changes on the extension's side is §9; here, the ways in.

- **An arXiv PDF** (`arxiv.org/pdf/<id>`) opens straight into the reader when `pdfReader.enabled` is on (the default).
  `pdf.content.ts` lays the reader's page over the browser's viewer in a full-window frame, as it does today, so the
  address stays arXiv's. Off, the browser's viewer shows the PDF with the floating button.
  - A PDF address carrying `#readarxiv` opens the reader whatever the setting says: it is an explicit request, and the
    abstract page's entry and the floating button use it (the HTML version's link carries the same hash today).
- **The abstract page's popup**: the entry view's one button becomes two, side by side, **HTML 翻译** and **PDF 翻译**
  (the maintainer, 2026-09-25: as few words as stay clear), where `reading.openIn` says (a new tab by default). The
  reader chooses; we do not choose for them (the maintainer: 「在PDF入口和HTML入口中自选——我们不替用户做决定」). PDF 翻译 opens the paper's PDF address with
  `#readarxiv`, which asks for a translation: the reader opens translating, in 对照 or 译文 as last chosen (§3), and
  leaves 原文 if it was last left there.
  - HTML 翻译 is disabled with the existing note when the paper has no HTML version (a thing a reader can see on
    arXiv).
  - PDF 翻译 is disabled **without words** when the paper cannot be had as a bilingual PDF (§1's rule).
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

**Shared since 2026-09-27** (the extension's redesign, its design §2.1): these tokens are the extension's now, held as
data in `src/shared/tokens.ts`, from which `pnpm tokens` writes `src/styles/tokens.css`; the reader's sheet imports it,
with the controls it shares (`src/styles/controls.css`, `src/ui/controls/`). The values below are unchanged, and the
reader was held to its pixels before and after the move (`lab/pdf/spikes/reader-pixels.mjs`). The
extension adds roles the reader has no use for — the brand, success, the search mark, the page's and the popup's
grounds — in the redesign's §2.1.

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
| `--focus` | `--n-10`, the ink (a blue until 2026-09-26) | `--n-10` |

Roles: `--canvas` n-3 (behind the pages), `--chrome` n-0 (toolbar, sidebar, popovers), `--chrome-line` n-4 (0.5 px
hairlines), `--line-strong` n-7 (an edge that marks a choice, a chosen swatch's: a step lighter than the focus's ink,
3.64:1 and 3.39:1 on the chrome; 2026-09-26), `--ink` n-10, `--ink-2` n-8, `--ink-3` n-7, `--fill` n-3 (hover and
pressed), `--well` n-3 (the display switch's track), `--lift` n-0 (its thumb). Floating surfaces: `--float-bg` n-0 at 90 %, with a hairline and a soft
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
- **Narrow windows**: the title yields first (it truncates, and leaves when the lead has too little room for it —
  the lead's own width, which the trail's menus narrow; the title stays in the id's tooltip), then the id, when the
  lead cannot hold it; the service's and the language's names are cut short at 11 em, whole in their tooltips; below
  900 px the language and service menus move into the reading options, as their first two rows; below 500 px the
  download, the settings and the way back move there too, before them, and the zoom keeps its value's menu (− and +
  give way; ⌘± and the pinch stay), so that the bar holds at 320 px (the interface review; the maintainer,
  2026-09-26). When the
  document area is narrower than 840 px, two pages side by side are too small to read: 对照 stays chosen, the translation
  is shown alone, and the capsule says so once, 窗口较窄，暂只显示译文 — the HTML page's rule and wording (S-P-74, 窗口较窄，
  暂按上下显示). The words stay 5 s of being read: the time stands while the pointer is over the capsule or it holds the
  focus, and the rest of it runs once neither does (the maintainer, 2026-10-01); holding no action, the capsule is a
  stop of its own for the keyboard while it is shown (Codex and Devin on #307). The widths are to be checked by
  reading at them while building.

## 6. Components

### 6.1 The toolbar

**Lead**

- 目录 (Lucide `panel-left`, pressed while open).
- The title: 600 13 px, one line, truncating first; the whole title in the tooltip. It is the page's heading (`h1`) at every width: below the lead's 320 px it is hidden to the eye, not removed, so that it stays in the accessibility tree; until it is known the heading is the product's name, said and not drawn (UI.md S-R-03).
- The arXiv id: `arXiv:2608.02163` in ink-2 12 px tabular figures, a link to the abstract page in a new tab (the
  maintainer: 「改成可以点，点击打开abs页」); on hover or focus it takes the fill and a small `arrow-up-right` slides in
  beside it. Tooltip 在 arXiv 打开摘要页, which the link's name carries too, after what is on it (UI.md S-R-03).

**Centre**: the display switch (§6.2).

**Trail**, in this order, a hairline divider between the groups:

1. 交换左右 (`arrow-left-right`, pressed when swapped) and 同步滚动 (`link-2`, pressed when on). Both act in 对照 only;
   in the single displays they stay in place, greyed, so the bar never reflows.
2. Zoom: − · the value with a chevron · +. The value keeps the width of its widest, 000 %, in tabular figures, its
   figures at the trailing edge, so that nothing on the bar moves as it changes (at 99 % → 100 % the button grew 3 px and
   shifted everything beside it: better-typography, 2026-09-26). The value opens a menu: 适合宽度, 适合页面, 实际大小, then 50 %–200 %; the
   current one checked. Shortcuts ⌘− and ⌘+ (Ctrl on other systems).
3. The target language (its name and a chevron, **no icon**: the translation mark belongs to the display switch alone,
   and the name says what the menu is) and the service (its name and a chevron). Their menus are §6.7's.
4. 阅读选项 (`sliders-horizontal`), a popover: 对照高亮 (switch), 高亮颜色 (a swatch for each highlight profile: the
   three built-in, 柔和绿, 淡黄, 淡蓝, and any added in the settings), a separator, 图片翻译 (switch; the popup's word,
   the maintainer's ruling of 2026-09-25), a separator, 外观 (a small segmented control of three icons, equal whatever
   the language — 跟随系统 a monitor, 浅色 a sun, 深色 a moon, in that order — their words in tooltips and to screen
   readers; the maintainer, 2026-09-26: words ran off the thumb in English),
   深色时调暗页面 (switch). All are settings (§9.1), the same values the popup and the settings page change; a change
   applies at once.
5. 下载 (`download`), a menu of two items, text only: 译文 PDF, 原文 PDF (the maintainer: 「只要译文 PDF / 原文 PDF」).
   Files are named `<id>.pdf` and `<id>.<target>.pdf`. Free. 译文 PDF is the final translation: while the translation is
   still coming in (previews), the item is greyed.
6. 设置 (`settings`): opens the settings page at its PDF reader section.
7. 在默认查看器中打开 (`log-out`): leaves the reader for the browser's own viewer (the maintainer's wording, 2026-09-25).

Buttons are 30 × 30 with a 7 px radius and a hit area grown to the bar's height; hover, open and pressed take the fill,
and a hover's look only where a pointer hovers (`@media (hover: hover)`: on a touch screen it latched after a tap).
The interface review proposed a 1 px ring for pressed, since the fill is the hover's too and stands 1.2:1 against the
bar; the maintainer kept the design without it (「这个不要 我们保留之前的设计」, 2026-09-26). Every button has a tooltip:
after 500 ms of hover, at once on keyboard focus; one line always (a tooltip wrapped when it was measured at its last
place near the window's edge); the shortcut, or the value the button shows, in a lighter `kbd` after the words. The
zoom's value, the language and the service are labelled by what is on them — the value first, then their words, hidden
(83% 缩放比例, 简体中文 目标语言: WCAG 2.5.3, by `aria-labelledby`). 设置 is a link, opened in a new tab. The bar is the page's banner: each control a Tab stop of its own (an
ARIA toolbar would have promised arrow keys between them). In forced colours the chosen display, a pressed button and
a switch that is on take the system's Highlight (the interface review, 2026-09-26).

### 6.2 The display switch

A well (the `--well` track, 30 px high, 9 px radius, 2 px padding) of three equal segments, **40 px each whatever the
interface's language** (the maintainer's reason for icons: 「不同语言界面下文字长度不一样，字宽导致按钮变来变去会很难看」).
The chosen one sits on a lifted thumb that slides between segments in 220 ms; chosen icons take ink, the others ink-2,
a disabled one ink-3 at 55 %.

The icons, each on a 24 × 18 canvas, 1 unit = 1 CSS px, stroke 1 with round caps and joins — as the toolbar's Lucide
icons render beside them — the frame's edges on the pixel grid (the maintainer's round 11, 2026-09-25; stroke 1.2 and
`x 2.25 w 19.5` before):

- **原文**: a pane (`rect x 2.5 y 2.5 w 19 h 13 rx 3`) with an **A** in its middle.
- **对照**: the same pane split by a vertical rule at x 12, drawn `crispEdges` so that a 1x screen keeps it one pixel.
- **译文**: the same pane with **文** in its middle.

The letters are Noto Sans SC (SIL OFL 1.1) at weight 350, the face's DemiLight — its Latin and CJK designed together —
turned into outlines so that every system draws the same shapes (system faces were tried first: headless Chromium gave
PingFang's heaviest weight at that size, and Windows and Linux would draw other faces). Each is centred on the pane by
its ink, not its em box: A 8 px high, 文 8.8 px (a CJK glyph looks smaller than a Latin capital of its height). 文 is
narrowed across to 0.76 of its width (to 6.74 px, beside A's 6.47; the maintainer asked for it to come near A's width),
and the weight that takes from its verticals and diagonals is given back by a 0.18 px stroke round its outline (round
11: 9 px, 0.8 and 0.16 before; its measurements are with the round's files). The
outlines are produced by a script from the font (kept with the reader's code) and committed as path data; the font's
licence goes into `docs/THIRD_PARTY.md`. These are the final glyphs: the hand refinement once left for later was dropped
by the maintainer (2026-09-26).

Rejected on the way, so that nobody tries them again: words (their width changes with the language); letter pairs and
panes marked by drawn letters (「文字的都设计太差了」); left half / right half for the single displays (which side is
which is a convention, 「解释有点牵强」); a translation badge on the pane's corner, outline or solid (right idea, 「不够简洁」,
then replaced by the maintainer's letters in the middle).

It is a single choice, so it is a radio group to assistive technology: `role="radiogroup"` named 显示, three
`role="radio"` with `aria-checked` and the words as their names, arrow keys moving the choice. No single key chooses a
display anywhere on the page: 1, 2 and 3 did, which a stray keystroke or a spoken word could set off (WCAG 2.1.4; the
maintainer removed them, 2026-09-26). A display that cannot be had (§8) is `aria-disabled` and skipped by the arrows.

### 6.3 The contents sidebar

- A header 目录 (11.5 px, 600, ink-2), then the paper's own headings as a **folding tree** of up to three levels, one
  28 px row each: level 1 at 12.5 px 500 in ink, levels 2 and 3 at 12 px 400 in ink-2, indented 14 px per level. A fold
  chevron (12 px, rotating 90° in 150 ms) before every entry that has children; a leaf keeps the chevron's slot, so every
  title starts on one edge. Compact, after PDFSlick's folding outline and alphaXiv's hierarchy (the maintainer:
  「空间占用有点太大……两者都更紧凑简洁」).
- Each row: the **translated title**, one line, truncating, in the language it is in (`lang`); the original title in its tooltip; the page number at the end
  (11 px, tabular, ink-2 — §4.1). A fold's tooltip says 展开 or 收起, to its right; the fold is named by the section (UI.md S-R-02a).
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
- Named 原文页码 and 译文页码; the buttons 上一页 and 下一页, whose tooltips stand above them (the pill is at the pane's foot).

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
  leaves lighter (160 ms); a new state of the same kind changes its words in place instead of leaving and coming again,
  its words moving with its box as one motion (the web's round 4, approved 2026-10-04; `Capsule.tsx`,
  `capsule-motion.ts`, the one capsule of the extension and the website):
  - **Growing, the box leads**: its width moves at once, 300 ms on `--ease-soft` (`cubic-bezier(0.65, 0, 0.35, 1)`); the
    old words stay, and old and new cross-fade once, at the later of 60 % of the way (161 ms) and the new words fitting
    — clear of what follows them, which is pinned to the box's end and travels with it.
  - **Shrinking, the words lead**: they cross-fade at once while the box closes, 250 ms on `--ease-in-out`
    (`cubic-bezier(0.77, 0, 0.175, 1)`), whose slow start keeps it behind them.
  - **The cross-fade**, both ways, on `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`): the old words 150 ms, 1 → 0, 4 px
    up, blurred to 2 px; the new 200 ms from 4 px below, 2 px → 0, starting with the old; the blur masks the overlap.
    While the box resizes, its moving end fades into the capsule's ground over 16 px, never a cut.
  - **A count** (`withCount`) changes in place: tabular figures, each digit over a hidden 0 that holds its width; a
    changed digit cross-fades, 150 ms on `--ease-out`, shown at most once per 300 ms, a burst landing on its latest. A
    digit gained opens a cell from nothing with the box, 300 ms on the soft curve, the whole number cross-fading at
    161 ms — never a lone 0. It is the one width change between two changes of words.
  - **A chip that comes** opens the box as growing words do and fades in once it fits; until its entrance begins it is
    inert — not focusable, not pressed, not in the accessibility tree — and under reduced motion, with no wait, it is
    reachable at once (Codex on #317). One that goes is inert as it starts to leave.
  - **A change mid-way** retargets from where things stand: the width from its current value, a fade from its current
    opacity; words not yet shown are dropped unseen.
  - **One line, 34 px, in every frame**, and no ink past the border; a sentence too long for one line at the window's
    width wraps and balances (`data-wrap`), and then only its words cross-fade. Nothing is fitted to one language's
    widths. Measured frame by frame in Chromium, Firefox and WebKit (`tests/e2e/probes/capsule.mjs`).
  - **Reduced motion**: opacity with the 2 px blur, at once; nothing slides; the width snaps, growing at once and
    shrinking once the old words have gone (150 ms); the spinner stands (the maintainer, 2026-10-04).
  - **What a screen reader is told**: the words' cell is `aria-hidden`; the sentence is told whole (or `spoken`, other
    words, where it holds a count said once a stage) in a line of its own, once per change of that text. A language's
    own name (S-R-13) is a part drawn in its own `lang` (`withPart`; Devin on #313).
- **Progress** is a line along the toolbar's foot, not the capsule's: 2 px of quiet ink (`--ink-3` at 80 %, 2.67:1 on the chrome — the maintainer kept it over a graphic's 3:1 after trying both, 2026-10-02), its length
  the share done of one process: the PDF's download its first stretch (all of it when the original alone is shown), the
  paragraphs translated after it, the final's compile its last stretch (the maintainer asked why it ran twice,
  2026-10-02: the download's line and the translation's were two). It grows by a transform, never runs back within a
  process, and fades out at the length it reached; a process begun after it left — a translation asked for once the
  original was read — is a line of its own, from its start. It is all that shows a load or a translation
  under way: no capsule does, and the words (正在加载, 正在翻译, 正在按当前设置重新翻译) are said to screen readers in
  the status region. (The harness's fifth round moved the progress into a fill of the capsule, ink at 8 %, with the
  status words; the maintainer asked for the line back, 2026-09-25 — the status words were what had to leave the
  header, not the line — and then for no capsule while it runs: the line says it.)
- The paragraphs that failed are told once the run has ended, not while it runs.
- **A notice** carries a chip action and a close button, whose tooltip stands above it; closing it is remembered for this paper's visit, each notice apart — the partial one's close does not close the count of failed passages it stood before (#314).
- **Two notes that are not a notice**: settings that cannot be read stand for as long as it is so, with a link to the settings page and no close (UI.md S-R-21); a write storage refused is told with the settings page's sentence until it is closed or a later write of this page goes through (S-R-22).
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
- Escape closes the open popover, and a Tab out of it closes it too, the focus going on; ⌘± zoom.

## 8. States

The mechanism is §6.6; the words come from the locale packs, and failure reasons reuse the ones the popup already shows.
No state that tells the reader nothing is shown (no "done").

| State | When | Shown |
|---|---|---|
| Reading | 原文; a translation ready; a stored translation shown, offline included | nothing |
| Loading | a large PDF is loading | the progress line by the share downloaded, its first stretch; 正在加载 said to screen readers |
| Translating | the first translation | the same line on, by the share of paragraphs done, then the final; 正在翻译 said to screen readers |
| Translating again | a stored translation, settings changed | the progress line likewise, 正在按当前设置重新翻译 said to screen readers; the old translation stays readable and is replaced paragraph by paragraph |
| Some paragraphs failed | a translation with gaps | capsule: {n} 处翻译失败 · 重试 · close |
| Language not supported | the shared target language is not one of the nine | 原文, with the capsule: PDF 对照暂不支持{语言} · 选择语言 (opens the language menu in place); choosing one of the nine translates |
| Nothing translated | a service failure with no paragraph done | card in the translation's pane: the reason (网络连接失败, API Key 无效或已过期, 尚未配置 API Key, …) · 重试, or 设置 when the reason is a key (opening the settings page at the services) |
| Cannot be had | the paper has no source, or none of the ways of typesetting it worked (every one tried, none for want of time) | 对照 and 译文 greyed in the switch; the reader shows 原文, with the capsule: 这篇论文暂不支持 PDF 翻译, and 改用 HTML 翻译 where arXiv has an HTML version (opened where `reading.openIn` says); no close. Remembered on this machine by paper version, language and pipeline, when the paper's own source set there: a visit again asks nothing of the service, a new pipeline tries once more (the maintainer, 2026-09-26; the words first had none) |
| No paper | the address names none (a hand-typed one) | the phase is ready, not loading; 对照 and 译文 greyed and 原文 selected whatever the saved display; a card in the document area: 找不到这篇论文 · 前往 arXiv (a link, opened where `reading.openIn` says) |
| Settings cannot be read | storage did not answer in a page's first 1,500 ms, or its value cannot be used | the defaults in use and the PDF opened on them, not held for the storage; capsule: 设置读取失败，当前使用默认设置 · 设置, for as long as it is so, beside an address with no paper's card too; the controls that write the settings greyed, with the reason in their tooltips; the menus keep their places |
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
figure text is shown when it is on and the display's mode, §3, is among the modes, as on the HTML page) (since v20 the
switch alone: figure text in every display), `uiLanguage` (the reader's words), `mode` (the display, §3).

- **Writing the display**: 对照 writes `mode: 'side'`, unless it is `'stack'` (a side-by-side choice already for the
  reader); 译文 writes `'only'`; both clear `pdfReader.original`. 原文 sets `pdfReader.original` and leaves `mode` alone.

**New**, a `pdfReader` group; `CONFIG_VERSION` 18 → 19, with a migration that adds it with its defaults:

| Key | Type | Default | What |
|---|---|---|---|
| `pdfReader.enabled` | boolean | true | 在 arXiv 的 PDF 上使用对照阅读器 |
| `pdfReader.original` | boolean | false | the reader was last left in 原文 (the HTML page's "translation on" is the tab's session, not a setting) |
| `pdfReader.sync` | boolean | true | 同步滚动: the engine's `same` mode on, `off` off |
| `pdfReader.swapped` | boolean | false | 交换左右 |
| `pdfReader.appearance` | `'light' \| 'dark' \| 'system'` | `'system'` | 外观 (the extension has no appearance setting; its pages follow the system) — moved to the extension's theme at configuration v20 (the redesign's §3): one appearance for every surface, set here or on the settings page |
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
- The style menu: greyed, in its place (it has no effect on a typeset PDF; greyed, not explained — the maintainer, 2026-09-28: the foot stays the same on every page).

With the reader closed, a PDF page gets the abstract page's entry view: the two buttons.

### 9.3 The settings page

- A new section **PDF 阅读器** (`#pdf-reader`, after 阅读): 在 arXiv 的 PDF 上使用对照阅读器, 同步滚动, 外观, 深色时调暗页面
  (since the redesign: the PDF group of the Reading section at `#reading/pdf`, the appearance and the dimming under
  Appearance; `#pdf-reader` still leads there). The reader's 设置 button opens the settings page there.
- **数据** gains a line for the PDF translations kept on this machine, `{n} 篇 · {size}`, and 清除 through the existing
  `Confirm` (two presses; it disarms after 4 s), beside the HTML translations' line (the maintainer: 「其他暂时这样」 on
  the proposal). The settings page is on the extension's origin and calls the store's `usage()` and `clear()` directly.

### 9.4 The shared `Menu`, made accessible

The reader's menus are built on `Menu`, the shared component of `src/ui/` at the time, and its gaps are closed for every user of it (the popup, the
settings page's drawers): the active item announced as the arrows move; Home and End; typing a letter jumps to it; focus
back on the trigger when it closes; no buttons inside a listbox. (Retired with the redesign: the reader's menus are
`MenuList`, `src/ui/controls/`, and `Menu` is gone.)

## 10. Engine changes, each measured

### 10.1 Overlays follow a pinch by transform

The highlight bands and the figure overlays are positioned in CSS pixels of the page as it was drawn. While a pinch lasts
PDF.js scales the page by CSS alone, so they drifted off their figures: 54 → 108 → 209 px from 83 % to 114 %. Each keeps
its pixel geometry and gains `transform-origin: <−left>px <−top>px` and `scale: calc(var(--total-scale-factor) / s0)`, `s0`
the viewport scale it was drawn at: it scales about the page's origin with the page, on the compositor, with no layout
and no script. Mid-pinch it stays within 0.7 px of its place.

Measured on 2608.02163, a pinch 83 % → 245 % in 36 steps, three runs each, in a real window; the method is in the report's nineteenth addendum
(`git show exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md`), and the implementation commits the probe, driving PDF.js's `updateScale` itself so
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
removes itself (marked as it removes them). Measured: 0 ms bare (no figure was without its overlay after a redraw); what the observer itself costs while
reading was not measured apart. The transform keeps the overlays right at the new scale, and nothing is recomputed unless
their content changes.

### 10.3 Stopping early when the service fails

When a batch fails because of the service itself (network, key, quota), the rest are not sent: they would fail the same
way. With no paragraph translated nothing is compiled and the card shows the reason; with some, what there is is
compiled and the notice counts the rest. (Before: every batch retried for 24–48 s, and after 215 s an English "translation"
was compiled.)

Measured on the fake compiler (`parked/lab/spikes/cache-cases.mjs`): a failure in the second of three batches sends no third, and
the final is compiled with the first; nothing translated compiles nothing, not even the marked original. A key refused
midway stops the run the same way, and the run resolves (the unhandled rejection it left on the page is gone). The
figures' text goes through the same service: once a run has stopped, none is sent until it runs again. The notice's
{n} is the paragraphs left in the source language: a paragraph a stored copy had translated keeps it when its new try
fails, and is not counted.

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

Tailwind v4, as the popup and the settings page use it, with **the extension's token sheet** (`src/styles/tokens.css`
since the redesign; §4.1) through `@theme inline`, not `ui.css`. PDF.js's viewer sheet with a `box-sizing` reset inside
the viewers (pdfslick's lesson; the highlight offset of 2026-09-22 was ours for want of it).

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

- Every control has a name; icon-only buttons by `aria-label` equal to their tooltip's words; a button that shows a
  value is labelled by it, then by its words (WCAG 2.5.3); the zoom's shortcuts are in `aria-keyshortcuts`.
- Tooltips on keyboard focus as on hover; everything a pointer does, a keyboard does; focus rings are 2 px `--focus`,
  2 px offset, in the ink, and the keyboard's alone: a text field rings on a click too (the browser's rule), so under
  the pointer a field shows its caret and its fill, and its ring, a Tab away, hugs it (offset 0) so that it crosses no
  word beside it (`modality.ts`; the maintainer, 2026-09-26).
- The display switch is a radio group (§6.2); the zoom, download and language/service menus are menus or listboxes with
  the shared `Menu`'s fixed keyboard behaviour; the reading options are a dialog, which takes the focus to its first
  control that shows. A popover closes when the focus leaves it for another control, a press on its own button left to
  that button's click. The capsule's 选择语言 opens the language menu itself, the one the reading options hold in a
  narrow window.
- Forced colours keep every state: the chosen, pressed and switched-on controls take `Highlight`.
- The status capsule is a live region present from the start; failures never move focus.
- Contrast as §4.1; meaning never rides on colour alone (the danger colour always has its icon and words).
- `prefers-reduced-motion` honoured everywhere (§4.2).

## 14. Testing

- **Unit** (Vitest): the display ↔ `mode` mapping both ways; the 18 → 19 migration; the popup view-model's reader
  rules (§9.2); the engine's failure classes to `ProviderErrorKind`; `DisplaySwitch` as a radio group (arrows, a
  disabled choice skipped, no single key on the page); the `Menu` fixes; the overlay transform and the redraw observer against a fake page.
- **Copy**: every reader string comes from the locale packs in both languages; a test fails on a reader-facing string
  naming LaTeX, TeX, compiling, typesetting, an engine or a provider (§1's rule).
- **The engine moved intact**: the existing browser checks pass on the new page unchanged — the cache revisit, the
  viewer faults, the lost cases, the sync frame measurement, `e2e:pdf`.
- **New browser checks**: the pinch (both sides scale; overlays within 1 px mid-pinch; no bare time after the redraw);
  the page pills; the indicators (a drag moves both sides); the abstract popup's two buttons and their disabled states;
  the settings section and the PDF translations' line and 清除; dark pages; the keyboard (the switch's arrows, Escape, a
  Tab out of a menu); the bar at every width in both languages; forced colours.
- **Probes** for §12, committed with the checks.
- Before the pull request: a `better-interface` review, `break` (every state of §8 rendered), and the gate
  `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## 15. Copy

The words as agreed, zh-CN with the English they stand for; `docs/UI.md` gives them `S-R` ids. Where the popup already says
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
| | 外观 · 跟随系统 · 浅色 · 深色 · 深色时调暗页面 | Appearance · System · Light · Dark · Dim pages in dark mode |
| | 下载 · 译文 PDF · 原文 PDF | Download · Translation PDF · Original PDF |
| | 设置 (S-P-02, reused) · 在默认查看器中打开 | Settings · Open in the default viewer |
| Page pills | 原文页码 · 译文页码 · 上一页 · 下一页 | Original's page · Translation's page · Previous page · Next page |
| Status | 正在加载 · 正在翻译 · 正在按当前设置重新翻译 | Loading · Translating · Translating again with the current settings |
| | {n} 处翻译失败 (reused) · 重试 (reused) · 关闭 | {n} passages failed · Retry · Close |
| | PDF 对照暂不支持{语言} · 选择语言 | A bilingual PDF isn't available in {language} yet · Choose language |
| | 窗口较窄，暂只显示译文 (after S-P-74) | The window is narrow, so this shows the translation alone for now |
| | the reasons (`REASON`, reused) | |
| Popup | HTML 翻译 · PDF 翻译 (the maintainer, 2026-09-25: as few words as stay clear) | Translate HTML · Translate PDF |
| | PDF 对照不支持上下排列 | The bilingual PDF can't be stacked |
| Settings | PDF 阅读器 · 在 arXiv 的 PDF 上使用对照阅读器 | PDF reader · Use the bilingual reader for arXiv PDFs |
| | {n} 篇 · {size} · 清除 (as the HTML line) | {n} papers · {size} · Clear |

## 17. The highlight

The hover highlight (the reading options' switch, S-P-80) as built on `exp/pdf-highlight` (its plan, with its record at the end:
`git show exp-freeze-2026-10-07:experiments/pdf-bilingual/plans/2026-10-01-pdf-highlight.md`): what lights and how it looks, where its shapes come from, and
what it costs. Every number is from the ten papers of the highlight's investigation (`data/runs/highlight-ten`: arXiv's
PDF on the left, our Chinese typesetting on the right), investigator B's four papers of the ground truth
(`data/runs/highlight-gt`) and the demo papers. The counts are one run of the Node gate, `lab/pdf/spikes/highlight-gate.mjs`, on
2026-10-02 at the head of the final review's fix round, and the costs one run of the browser gate's,
`lab/pdf/spikes/highlight-gate-browser.mjs costs`, that day (§17.6); what another probe measured carries its own date.

### 17.1 What lights

- **The pointer lights; nothing else does.** Hovering a sentence lights it and its translation on both sides; hovering
  a unit that lights whole lights it whole on both. A click holds nothing — the pin drawn in the draft round was
  dropped by the maintainer on 2026-10-01 after a test build; a click only levels the two panes by what lies under it
  (anywhere inside what the highlight paints is its unit's; a float's wash or outline levels by what is around it).
- **Sentences**, where a unit's sentences are known on both sides; else **the whole unit** (paragraph, theorem,
  footnote, list item), decided for both sides together — a unit never lights by sentence on one side and whole on the
  other. A unit of one sentence lights as a sentence shape (its first row from where its text begins).
- **Whole, whatever their sentences**: headings, captions, table cells and a drawing's text (TikZ labels).
- **Tables, algorithms and figures** light whole with their captions, on both sides: a table or an algorithm one wash
  over it to its rules, with its caption; a figure outlined (1.5 px), its caption washed — a wash multiplied into a
  figure would change its colours. Hovering the float, its caption or one of its cells lights it. A subcaption lights
  its own panel with it; the main caption lights the whole figure, every panel and subcaption. A float lights by its
  caption's id, which both sides share; where it is found on one side only, its caption lights alone on the other.
  A caption's float is a figure on both sides when it is one on either (outlined on both), once both pages are drawn.

### 17.2 Where the sentences come from

- **Microsoft** reports its own sentence lengths for the text it was sent (`sentLen`); the extension's service
  verifies them, its translation cache keeps them, and the reader's engine passes them on (`session/translate.mjs`). Nothing is
  added to the request, and the wording is Microsoft's own.
- **Google and an LLM** take the tags path's markers (DESIGN §8.6): the reader cuts each unit's wire text into
  sentences (`mt.mjs cutsOf`: the shared splitter, with a split context that reads the LaTeX placeholders — a citation
  or a footnote annotates the sentence before it, `\citet` is its sentence's subject, a reference a number, an inline
  formula a word), the service puts a marker at each cut and reads where they come back. Units that light whole are
  sent without cuts. Google, zh (2026-10-01): on investigator B's sample 267 of 267 markers back once and in order, 83
  of 83 running units aligned; on the four full papers 1 239 of 1 239 and 507 of 507. With markers Google translates
  each sentence apart: its wording changed in 77 of 83 units (median 4.6 % of characters); of eight pairs read, two
  better, three about even, three worse. The maintainer kept Google by sentence (2026-10-01). An LLM's path is unit
  tested with a fake model (merged, split or reordered sentences fall back to the paragraph) and was measured with the
  maintainer's key on 2026-10-02 (OpenRouter, `deepseek/deepseek-v4-flash`, Chinese; `lab/pdf/spikes/highlight-sentences-tags.mjs`,
  ENGINE=llm): on the four full papers, units marked directly, 1 227 of 1 233 markers back once and 482 of 502 units
  of more than one sentence aligned (4 lost a marker, 16 a placeholder); on B's sample 75 of 81 marked directly, and as
  the reader sends them 68 of 81 — the service left unmarked the 10 whose marked text was over the LLM's 1 000-character
  batch cap (32 of the full papers' 502). Marked all the same since (`2ae0d235`, DESIGN §8.6): 79 of 81, those over the
  cap 9 of 10 on their first marked request (one lost a placeholder). Against the same units sent unmarked the text was
  the same in 3 of 81, a median edit of 10.2 % of its characters — though an LLM's two answers differ without markers
  too.
- **Cleaning** (`mt.mjs sentencesOf`): the lengths must partition both texts; a boundary inside a marker, a tag or an
  entity goes to its end; a boundary that begins no sentence on either side (a trailing marker, a formula alone) is
  dropped on both together. Each sentence after the first is kept as the offset of its first word in the unit's plain
  source and in its plain translation — the texts each side is anchored by.
- **Found on each side** (`anchors.mjs sentenceStarts`, report-B's option X: no new TeX mark): the page token of each
  sentence's first word, as the unit's own text match inside its marks found it; its second or third word where the
  first was not found; past that, the unit lights whole. arXiv's PDF has marks only once our marked original is compiled
  — in a live run right after the first preview (the typesetting rule plans every later compile from it, 2026-10-02) — so a unit there found by its text alone takes its
  starts where its match covers 80 % of its words or more (B3c): on the ten papers 625 of 738 units of more than one
  sentence, 1 702 starts, all on the token the marks give; on the ground truth's arXiv PDFs on the mark's line as often
  as with marks (98.6–100 % against 98.9–100 %). In a live open with Microsoft and nothing cached, the first sentence
  lit 155 ms after the first preview on 2608.02785 (12.6 s before) and 173 ms on 2608.06701 (20.1 s before; B3c,
  2026-10-01).
- **Held to a ground truth**: investigator B's compiles with a mark at every sentence's start — starts on the mark's
  line on our original 98.9–100 %, our translation 100 %, arXiv's PDF 98.9–100 % with the marks and 98.6–100 % by text
  alone. The ten papers: 965 running-text units lit by sentence on both sides, 707 of more than one sentence; B's four
  papers 451 of 466 units of more than one sentence with every start found on arXiv's PDF and our translation.
- **The splitter's abbreviations** (shared with the HTML page, DESIGN §8.6): no cut after a place's or a title's
  (`Mt.`, `Mr.`) or a Latin one; after a case's `v.` only behind a capitalised name (`Oregon v. Mitchell`, not `a vertex
  v.`), after the label of a numbered part (`Ch.`, `Sect.`, `Eqn.`, `Tab.`, `App.`) or a month only before its number,
  after any short capitalised label only before a number that is no enumerator (`2)`, `2.`); and never after a
  placeholder's own letter — a sentence ending on a formula keeps its boundary. On the reader's units of twelve papers,
  against the splitter before 2026-10-01: 6 cuts removed (`Oregon v.` ×5, `Mt.`), each false, none added
  (2026-10-02); the reader's split context gives a formula as `x`, so the placeholder rule changes nothing there.

### 17.3 The shapes

- **Runs and rows** (`highlight.mjs`): a unit's tokens on a page, in its lines, by column → its runs, one page and one
  column each, cut where another unit's line stands between two of its rows (a float set inside a paragraph) and, on a
  page of two columns, where a full-width line does (revtex's widetext); rows are lines merged where they overlap, so a
  display's numerator, denominator, limits, scripts and number are one row. What stands between two of a unit's words
  and is no unit's is its own (an inline formula's pieces), in running text only and never across another unit's line;
  the words before its first one on its line (a theorem's head, a list's label) too.
- **The column's text edges** come from every page's long lines, per page size, parity and column, so a page of
  displays takes the document's measure and a landscape page keeps its own; a run reaches up to 6 units past an edge
  (an overfull display) and snaps to it within 3. A float's cells keep their ink past the edge.
- **The ink**: a token's ink is its text item's share by a proportional face's widths (Times-Roman's for ASCII, a full
  em for CJK — and for dashes and quotation marks in an item mostly CJK — half an em otherwise; an even share in a
  monospaced face), widened over the marks it sets against itself (an opening bracket, a closing stop; a CJK stop inks
  half its em) and to the end of an item of marks alone after it. English sentence boundaries through a letter on the
  canvas: 3 of 166 (61 with an even share; B3's probe, 2026-10-01).
- **One outline a shape, 3 px corners**, padded 3 px beside the column's text and half the leading above and below —
  the lower quartile of the space between a kind's lines on that page (a footnote by a footnote's), and over what hangs
  past the first and last lines (a script, a denominator).
- **The sentence shape**: its first row from its start, the rows between across its unit's text in the column, its last
  row to its end with its punctuation; two sentences on one row meet halfway through the space between them. Over a
  column or a page break the rows reach the unit's text edge there — the column's edge less the unit's least indent, so a
  list's item keeps to its own — but not over another unit's words on that row, nor under a float's painted shape; an
  overfull line sticks out alone, by up to 6 units. Where a unit's shapes cannot hold its words (two lines of text made
  one row by a tall formula, a glyph hanging into another sentence's row) it lights whole: 12 of the 977 units whose
  starts both sides found, on the ten papers.
- **The hit test is the paint**: the same shapes, the smaller unit winning where two overlap (a heading run into its
  paragraph); a float's shape wins over a larger block, a smaller block over the float. On the ten papers 0 holes in
  37.3 M points of painted blocks (7–16 % of points lit nothing or a neighbour before), in 25.3 M of sentence shapes and
  in 6.2 M of floats' shapes, 0 points lit as another sentence of the unit, 0 points of running text taken by a float,
  and every anchored unit lit (1 829 of 2 553 on both sides).
- **Floats** (`floats.mjs`), made on a page's first drawing from the operator list it was drawn by (its figures, its
  rules, its other marks): each figure to its nearest caption only, the one just below first; from each caption a walk
  away from it over what lies across it — lines no running text owns, figures, marks, rules — stopping at another unit's
  line, another caption's figure or a gap, and at its own last rule. A float that holds a figure or a drawing (3 % of it
  marked outside its text) is a figure; one of text and rules a table. Found on the ten papers: figures 46 of 47, tables
  52 of 52, algorithms 2 of 2.

### 17.4 The pointer's path

- One hit test and one paint per animation frame (`pointer.mjs`); the pointer read before anything is written; no layout
  read — each pane's and page's place kept when the layout changes (a ResizeObserver, the contents panel's slide, a
  zoom) and the scroll as its event gives it. A miss keeps what is lit 120 ms (the HTML page's value), so crossing the
  space between two paragraphs does not blink; a scroll under a still pointer lights what comes under it.
- A side's layout is made in the idle time once no side is being anchored (or at once in its own task when the pointer
  needs it first), a page's geometry and its sentences on the page's first drawing, a side's sentences in an idle period
  of their own after its layout, the left's again after the right's; nothing of a sentence's fit is made in the
  pointer's frame. A unit whose sentences are known but not yet found, or whose fit is not yet worked out, is a miss
  meanwhile (25–125 ms after the pointer comes to rest on an open, 2026-10-01), then lights its sentence — never the
  paragraph first.
- What is lit is drawn again by what replaces it — a new compile's right side, the left anchored again by our marked
  original's marks — and the pointer resting on it is carried to the new side. While its unit's sentences or their fit
  are on their way there, what was drawn for it stays, never its paragraph; when they land it is drawn anew and the
  pointer is asked again. A sentence lit at a swap is drawn on the new side at the swap itself: where the idle time has
  not made the new side's layout and sentences yet they are made before the swap, each in a task of its own and only
  while a sentence is lit, and the lit unit's fit in the swap's task (under 1 ms) — on 2608.02459 and 2608.06701, a
  pointer resting on either pane through a swap or a re-anchor, the sentence painted on both sides in every frame,
  where the new side had been blank for 40–200 ms; the swap 15–40 ms later at the median (2026-10-02).
- What a run's sentence was drawn as is kept and put back when it is lit again at the same scale (at most 512), and
  let go when a page's floats come.

### 17.5 What a copy keeps

- The record keeps each unit's sentences beside its translation (`CachedUnit.sentences`, `{ src, tr }`: the offsets
  above), additive and optional — no pipeline change; on 2608.02459 +20.7 KB (2.7 %, B3, 2026-10-01). A copy made
  before keeps working and lights by paragraph until its paper is translated again. A copy's sentences are used only
  where they are of their shape and the translation made again from its pieces is the text they were counted in; what
  the offsets mean rests on `plainSource`, `plainTranslated` and `anchors.mjs tokens` — a change to any is a change of
  the record. A run again (a retry, the network back) seeds itself with what the visit's last run made, sentences and
  all (`cache.mjs seedAgain`).

### 17.6 What it costs (2026-10-02, interleaved against a base build)

One run of the browser gate's `costs` (three rounds, pooled) at the head of the final review's fix round against
`174b5896` — the paragraph blocks of B1, before sentences and floats. B1 against the reader before it (`5957a4be`,
2026-10-01): per light p50 script 0.15–0.17 ms against 0.14–0.19, style and layout 0.28–0.34 against 0.22–0.33, the open
within noise.

- Per light (a sweep on 08350, 29181, 06701), p50 script 0.152–0.243 ms against the base's 0.159–0.179, p95
  0.319–0.427 against 0.291–2.403; style and layout after it p50 0.259–0.393 ms against 0.279–0.366; no layout forced
  where the highlight is written; no long task in a sweep. 2608.06701 sits near its limit (0.243 against 0.159, the
  limit 0.26): a sweep there lights 44 times, sentences, against the base's 14 blocks.
- The open: time to ready and anchoring within noise of the base — 02459 873 and 607 ms against 909 and 615 (p50),
  04322 537 and 419 against 540 and 429 (on a loaded machine paired rounds have differed by −395 to +336 ms; in Node,
  anchoring 90.5 ms cold on 02459's translation, B3c, 2026-10-01).
- In idle time after the open, 02459's layouts 15.1–17.0 ms on the left and 10.1–11.1 ms on the right, each in an
  idle period of its own with its drawn pages' geometry (the base's paragraph blocks 8.7–9.3 and 7.8–8.3), and its
  sentences 2.3–2.9 ms a side; a page's geometry at its first drawing 0.03–0.17 ms in the browser (B1, 2026-10-01), the
  rows' reach adding 6–12 % since; a page's floats 0.3–0.8 ms p50 (up to about 4 ms on a side's first pages; B4,
  2026-10-01), from the operator list it was drawn by — asking the worker for it again had made pages 7–8 of 06701
  take 326–387 ms to draw, against 198–224.
- Memory: a side's layout keeps what a page's geometry needs of its tokens, not the tokens — on 2608.02459, both
  layouts and sentences made and the garbage collected, the heap 10.5 MB; 31.8 MB while an arrow the layout kept held
  the anchoring's scope and both sides' tokens with it (the final review; the browser gate checks the tokens are let
  go).

### 17.7 Known limits

- A grid of panels in several rows with the subcaptions over their panels pairs them wrongly (each subcaption is read
  with the panel under it).
- A float found on one side only lights its caption alone on the other; a plain-word inline diagram marked under 3 % is
  washed as a table; a caption between two tables takes the one below.
- An equation number set on its own line below its display (2608.09746 #27) is no unit's and is not lit.
- A table at a page's head whose first row is single letters over numbers, after a display that closed the page before,
  is taken by that display's walk: no distance tells them apart (A1, measured: lead walks' first gaps up to 19.6 pt).
- Two lines of text made one row by a tall formula, with a sentence beginning on the second, light their unit whole (12
  units on the ten papers, with those a hanging glyph makes whole).
- Before our marked original is compiled, units of arXiv's PDF matched under 80 % by their text alone light whole (113
  of 738 on the ten papers; 29181 38 of 90).
- A copy made before the highlight lights by paragraph until it is translated again; an LLM's sentences are measured
  on one model (above); with Google the markers change the wording (above).

## 18. Rules and their versions

Three kinds of rule decide what the reader shows, and they change at three different costs. Each has its own identity,
and no identity names another kind's change: a tuning of how a page is drawn must not make a paper compile again, and a
fix to a unit's cutting must not wait for the store. This section is the contract the engine, the web and the extension
read their versions by (the rules-as-data plan of 2026-10-08, agreed with the maintainer the same day); a test holds the
table of §18.2 to the identities the engine exports and the table of §18.5 to the fields of the rule set.

### 18.1 The three kinds

**The test that classifies a rule.** Ask what the change alters:

- **the units, their geometry, the layout file or the add-on** (what our server makes per paper): **extraction**;
- **what is sent to a translator, or how a reply becomes a row** (what a language's translation holds): **translation**;
- **only the pixels and text a reader draws from the same bundle and the same rows**: **layout**.

A rule that does two of these is split, or classed by the more expensive.

| Kind | Where it runs | Where it lives | Its identity | A change reaches readers by | Cost of a change |
|---|---|---|---|---|---|
| Extraction | the server, when a paper's bundle is made | engine code: `latex-front.mjs`, `arg-roles.mjs`, `latexml-args.mjs`, `groups.mjs` `groupOf`, the layout maker, the remover. HTML: `src/core/rules/latexml.ts`, in the extension | `PIPELINE_VERSION`, `LAYOUT`, `REMOVAL`: the bundle's content versions, in its key (HTML: `RULES_VERSION`, in the per-text key) | the web's deploy. Each paper's bundle is made again on its next open (§18.4). HTML: an extension release | one compile per opened paper. Rows are rebuilt, and the per-text cache answers every unit the change left alone |
| Layout | each reader, at draw time | the rule set, `rules/layout-rules.json` (§18.5) | `RULES_SCHEMA` (the shape and how the engine reads it) and the set's `version` (the values) | publishing: both readers take it on their next load | none |
| Translation | each reader (the extension), the translation workflow (the web) | engine code: `translate/mt.mjs` (`serialize`, `rehydrate`, the wires, `translateUnits`), `translate/kept.mjs` and `keptFor`, `translate/groups.mjs` `decideGroups` and `NAMES_SHARE`, `batchesOf`; and, held by each reader, the paper's context sent with every batch (`paperContext`) | `TRANSLATE_VERSION` (`translate/version.mjs`) | the next release of each reader's engine. Rows of the old version are translated again on open | the rows. The per-text cache holds the translator's raw answers, so the translator is asked again only for texts that changed |

The edge cases, decided:

- **`NAMES_SHARE` (a table's groups)** is a translation rule. The workflow decides groups, and the rows a reader gets hold the decision (`state: 'kept'`), not the cells' translations. Making it a layout rule would mean rows that carry every kept cell's translation, for a threshold measured once.
- **`authorsTranslated`** decides which units a target sends, so it is a translation rule and lives in `translate/kept.mjs`, apart from the TeX path's `scripts.mjs`.
- **Float labels** (the names a language gives a figure or a table, and whether to use them) are layout: one language's choice at draw time. **Hyphenation** (which patterns a target uses, and their minimums) is layout; the pattern files are assets the host serves, and the algorithms are code.
- **The font roles** (which CJK family, Kai and weights a script takes) are layout. The face catalog (files, licences, size corrections, coverage) and the Latin design table are facts about files and stay code.
- **`textless`** is extraction, but v0 also applies it at draw time to a unit's source (only the alignment fallback reads it). A reader applying an extraction rule to a bundle's content is a defect class; it is listed for the debt pass.
- **Cell membership** (`groupOf`, from `tableGrid`) is extraction: the bundle carries each cell's place.

### 18.2 The identities

| Identity | Kind | Covers | Enters | A bump means |
|---|---|---|---|---|
| `BUNDLE` (web `'1'`, engine `'1'`) | reader contract | everything a reader parses: the bundle's shape, the units' tuple, kinds and flags, the layout file's schema, the manifest's schema, the left geometry | the request (§18.4) and the R2 key | readers older than it get `unknown-versions` until they update |
| `PDFJS` | reader contract | the PDF.js whose reading the layout and the manifest are made against | as `BUNDLE` | as `BUNDLE` |
| `PIPELINE_VERSION` | extraction | the units' cutting, kinds and texts, the cells' places, the left side's marks. **Not** the wire, its reading back or the paper's context | the R2 key; the rows' identities | bundles made again lazily; rows again |
| `LAYOUT`, `REMOVAL` | extraction | the layout maker, the remover | the R2 key | bundles made again lazily |
| `TRANSLATE_VERSION` (`translate/version.mjs`, `'1'`) | translation | `serialize`, the three wires, `rehydrate` (strict and tolerant), `translateUnits`' fallbacks, `keptFor` and `authorsTranslated`, `decideGroups` and `NAMES_SHARE`, `batchesOf`, and the paper's context each reader builds (`paperContext`: the extension's is `session/translate.mjs`, the web has its own, since it cuts the abstract as the HTML page does, which the engine does not hold) | the web's translation identity, the extension's rows cache, never a bundle key | rows translated again on open |
| `RULES_SCHEMA` (`rules/layout.mjs`, `1`) | layout | the rule set's fields, ranges and how the engine reads them | the rules route (`/s<n>`) | a new pointer; engines of the old schema keep the last set published for it |
| the set's `version` | layout | the values | its immutable URL | readers take it on their next load |
| `RULES_VERSION` (`src/core/rules/latexml.ts`) | HTML extraction | the HTML page's rule file | the HTML page's per-text key only | as DESIGN §5.5 |
| `TYPESETTING_VERSION` (`live.mjs`) | parked | the compile path | parked records | none |

- **The web's translation identity** is `axt-tr/2|<paper>|v<version>|<target>|<chain>|p<PIPELINE>|t<TRANSLATE>|b<BUNDLE>`, with no `r<RULES>`: the rules of the HTML page cut none of a PDF's units.
- **The background's per-text key** keeps `RULES_VERSION` for the HTML page's blocks only; a PDF text's key holds none (`cache/key.ts` `CacheSource`, named by every cache descriptor and `CACHE_KEY_VERSION` still 6: no HTML key changed, and a PDF text's old entries are no key of the new ones). The cache holds the translator's raw answer to a text, which no rule of reading changes.
- **Until the extension's rows cache replaces `session/session.mjs`'s copies** (the extension's stage 5, task 10), a copy is judged by `PIPELINE_VERSION` alone, so a change of the translation rules that must void copies raises both.
- **A file is refused by its schema, never by its maker.** `parseLayout` refuses a layout file whose `schema` is not 1 and `checkAddonManifest` a manifest whose `schema` is not 1; the file's `layout` and the manifest's `removal` are read for their shape (a version token) and never compared, so a reader opens what a newer maker or remover wrote. A change of either file's fields, bounds or meaning raises its `schema` and `BUNDLE`, not `LAYOUT` or `REMOVAL`.

### 18.3 Bump rules

- **A change of a value in the rule set** raises `version` by one. Nothing else moves.
- **A field added, removed or renamed, a range or enumeration changed, or the engine reading a field differently** raises `RULES_SCHEMA`.
  - The new schema publishes under `s<n+1>`, and `s<n>`'s pointer stays at its last set.
  - A newer engine's built-in carries the new field, and the published set gains it in the same pull request.
- **Adding a language:** the published set gains its entry first. Engines that do not offer it ignore it. The engine that offers it follows.
- **A drawing code change that keeps every field's meaning** bumps nothing. The layer gate measures it, and the live-engines check guards each published set on the engines that read it.
- **Extraction and translation changes** bump their identity as §18.2 says. A change that touches two kinds bumps both.
- **The classification test of §18.1 decides which kind a change is.** When it is unclear, the change takes the more expensive kind and the pull request says why.

### 18.4 Bundles: the reader names its contract, the server names the content

Were a reader to ask for a bundle by all of its own versions, every extraction fix would strand each released extension for new papers until the store shipped its update. So the reader names only what it can verify, its contract, and the server names the content:

```
ctag (the reader's contract) = b<BUNDLE>-j<PDFJS>
vtag (the content)           = <ctag>-p<PIPELINE>-l<LAYOUT>-r<REMOVAL>      // the R2 key
GET /api/v1/layer/<id>v<n>/<ctag>   302 to /api/v1/layer/<id>v<n>/<vtag>, the newest made under that ctag (max-age=300)
                                    and, when that vtag is not the server's own, the server's own prepare begun in the background
                                    | 202 Preparing | 404 | 429
GET /api/v1/layer/<id>v<n>/<vtag>   200 immutable
```

- **The engine's half:** `CTAG` and `VTAG` are `layer-proto/bundle.mjs`'s. `readBundle` compares the contract's two versions (`bundle`, `pdfjs`) with the reader's and names the maker's three and the image's, never comparing them; the layout file and the manifest it holds are refused by their schemas (§18.2).
- **What it buys:** an extraction fix reaches every reader on its next open, at one compile a paper, with no release.
- **What it costs:** one redirect, and the first open after a bump reads the previous bundle while the new one is made.
- The routes are the web's (its layer API v1); this section is the contract they are built to.

### 18.5 The rule set's fields

The rule set is one schema-validated file, `rules/layout-rules.json`: configuration in a closed vocabulary (numbers, booleans, enumerations and short lists of characters), never a pattern, a selector or code. It has three scopes. A **script's** fields (`Hans`, `Hant`, `Jpan`, `Kore`, `Latn`, `Cyrl`) are v0's own `Params`; a **language** (a target) may override any of them field by field, and has its own `labels`; the **set** holds the hyphenation minimums. `resolveRules(set, target)` gives one target's rules, and a set that fails any bound is refused whole, naming the field. **A set holds a `languages` entry for every one of `TARGETS`**, the targets either reader offers: the web's eight (`zh`, `zh-TW`, `ja`, `ko`, `de`, `fr`, `es`, `ru`) and the extension's Portuguese (`pt`). A set that omits one is refused when it is read, not when that language's run opens; other languages (`pt-BR`, the language wave's) may be added beside them. `TARGETS` must cover every language of `VERIFIED` (`session/verified.mjs`, compared by language and script: `zh-Hant` there is `zh-TW` here), which a test holds, so a language added to `VERIFIED` is added to `TARGETS` and to the built-in file with it. The engine's built-in copy is the fallback. The words are `RULES_FIELDS`', the lab's rows.

| Field | Scope | Group | Range or values | What it does |
|---|---|---|---|---|
| `order` | script | fit | an ordering of track, borrow, lead, shrink | The knobs the fit turns when a translation does not fit, in order: tracking, borrowing free space below, the leading, then the size. |
| `leadBase` | script | fit | 0.8 to 2, step 0.05 | The translation's line pitch, × the original's line pitch. |
| `leadFloor` | script | fit | 0.8 to 2, step 0.05 | The tightest line pitch the fit falls back to, × the original's. |
| `leadRel` | script | fit | yes or no | Whether the leading is taken relative to the original's own pitch (never stacked on a loose original's) or applied as it is. |
| `grid` | script | fit | `0`, `1` | Whether the lines stay on the original's baseline grid while the size shrinks (1) or not (0). |
| `trackMin` | script | fit | -0.3 to 0, step 0.005 | The tightest letter spacing the fit uses, in em (zero or less). |
| `trackStart` | script | fit | -0.3 to 0.3, step 0.005, or none | The letter spacing the fit starts from, in em; empty gives back the face's size correction. |
| `compressMax` | script | fit | `0`, `1`, `2` | How far full-width punctuation is compressed: 0 not at all, 1 at a line's start and between two marks, 2 every mark. |
| `centredPunct` | script | fit | yes or no | Whether punctuation is centred in its em box (Traditional Chinese): no mark is then compressed or hung. |
| `borrow` | script | fit | `0`, `1` | Whether a unit may borrow the free space below its last line (1) or not (0). |
| `borrowGap` | script | fit | 0 to 2, step 0.05 | The gap kept clear under borrowed space, × the original's line pitch. |
| `floor` | script | fit | 0.4 to 1, step 0.05 | The smallest size the fit sets a unit at, × the original's size. |
| `step` | script | fit | 0.01 to 0.1, step 0.005 | The size step between the fit's tries, × the original's size. |
| `further` | script | fit | some of widen, flow, shrink, in that order | The steps tried, in order, for a unit the fit leaves clipped: widen its lines, flow past a kept region, shrink below the floor. |
| `floorMin` | script | fit | 0.3 to 1, step 0.05 | The smallest size the last of those steps reaches, × the original's size. |
| `cjkJust` | script | fit | 0 to 1, step 0.01 | The most a line may open between CJK characters to justify, in em a gap. |
| `spaceMin` | script | fit | 0.3 to 1, step 0.05 | The least a word space shrinks to, × its natural width. |
| `spaceMax` | script | fit | 0 to 3, step 0.05 | The most a word space opens to justify a line, × its natural width. |
| `autospace` | script | fit | 0 to 1, step 0.05 | The space set between CJK text and Latin letters or digits, in em. |
| `even` | script | fit | `0`, `1`, `2` | How a page's body units are set alike: 0 each at its own, 1 at one size, 2 at one size and one leading. |
| `fillSize` | script | fit | 0 to 1.5, step 0.05 | How far a unit's size may grow to fill a loose original's paragraph, × the original's size; 0 is off. |
| `adaptiveFill` | script | fit | band, track, size; or none | Spreading a loose original's paragraphs over their space (D); empty keeps the script's leading on the original's pitch alone (B). |
| `keepAll` | script | breaking | yes or no | Whether lines break only at spaces (Korean and the alphabets) rather than between any two CJK characters. |
| `cjkQuotes` | script | breaking | yes or no | Whether curly quotes, dashes, the ellipsis and the middle dot are set as CJK characters. |
| `noStart` | script | breaking | a list of characters | The characters no line starts with. |
| `noEnd` | script | breaking | a list of characters | The characters no line ends with. |
| `hyphen` | script | breaking | `0`, `1` | Whether a Latin word is hyphenated at a line's end (1) or not (0). |
| `latinPatterns` | script | breaking | `en`, `de` | The hyphenation patterns a Latin word uses. |
| `cellClear` | script | cells | 0 to 5, step 0.1 | The room kept between a table cell's text and a rule over or under it, in PDF units. |
| `cellCapMin` | script | cells | 0.3 to 1, step 0.05 | The smallest share of the size a cell's text may be capped to between its rules. |
| `cjkFaces` | script | faces | group, kai, light; or none | The CJK family the script is drawn in; empty for an alphabet. |
| `labels` | language | labels | figure, table; or none | A float's label in this language's words; empty keeps each label as the original's. |
| `hyphenation.minWord` | set | hyphenation | 2 to 20 | The shortest word, in letters, that is hyphenated. |
| `hyphenation.en.left` | set | hyphenation | 1 to 6 | The fewest letters English leaves before a hyphen. |
| `hyphenation.en.right` | set | hyphenation | 1 to 6 | The fewest letters English leaves after a hyphen. |
| `hyphenation.de.left` | set | hyphenation | 1 to 6 | The fewest letters German leaves before a hyphen. |
| `hyphenation.de.right` | set | hyphenation | 1 to 6 | The fewest letters German leaves after a hyphen. |

### 18.6 Hosts: opening a layer with a rule set

What a host (the web's door, the extension's session, the gate, the lab) calls. Each host owns its fetch and its cache; the engine owns the reading.

- **`openLayer({ …, rules? })`** (`layer-proto/reader.mjs`) and **`openProto({ …, rules? })`** (`layer-proto/run.mjs`, v0's open, which the gate and the lab call) take the set that every choice made for the target is read from, resolved once at the open. Absent: `BUILTIN_RULES`, the engine's copy of the published file. Neither takes a single rule as an argument.
- **`firstFaceOf(target, rules?)`** is the host's early face request, made before the paper's family is known: the CJK body face the set names for the target, else `null`. Pass it the set the layer will be opened with (absent: the built-in).
- **`stats().rules`** is `{ schema, version }` of the set the layer was opened with (`ProtoRun.rules` likewise). While no set was passed it is the built-in's. A host records it.
- **`readRules(bytes, { etag })`** (`rules/layout.mjs`) reads an answer's body as a set and returns `{ set, sha256 }`. It refuses, naming the field, a body of more than `RULES_CAP` (65,536) bytes, a body of malformed UTF-8, more JSON values than `RULES_VALUES`, text that is not JSON, and a set that fails the schema or a cross-check; a refused set is never partly used.
  - **`etag`** is the answer's `ETag` header, given where there is one. It is compared with the SHA-256 of the bytes given to `readRules`, the body decoded of any content coding, and a different one is refused with the field `etag`. Two forms are read: the strong `"<sha256>"` and the weak `W/"<sha256>"`, which a CDN may put in the strong one's place when it recodes the body. Any other form is refused. A host passes the header as it came, or `null`.
- **The reader's choice** is the same in both readers: the server's answer, when one comes and is read; else the last read answer the reader cached; else the built-in. The server is the authority, so a lower version is taken like any other. A refused answer is ignored and counted, and the reader keeps what it had. The set is chosen when the composed document is ready, and an answer that has not come by then serves the next open: a rule-set fetch never delays a page.
- **A `rules` must come from `readRules` or `parseRules`**, or be `BUILTIN_RULES`. The door checks only a set's shape (an object holding `scripts` and `languages`, else a `TypeError`), not its values; a set built by hand can fail to resolve a target, or draw badly. `BUILTIN_RULES` is frozen to every depth and typed read-only, so a set to edit is `structuredClone(BUILTIN_RULES)`.

## 19. The engine's contract

`src/pdf-reader/engine/` is what the web imports, and nothing else of the reader is. The directory is the boundary: a gate
holds what may be imported into it (`scripts/check-boundary.mjs`, run by `pnpm lint`), a snapshot holds what it exports
(`tests/pdf-reader/engine-contract.json`), and a test holds that it loads where it is meant to
(`tests/pdf-reader/engine-contract.test.ts`).

### 19.1 The tree

```
src/pdf-reader/engine/
  pipeline.mjs translate.mjs rules.mjs layer.mjs view.mjs      the five entries: re-exports only
  source/       latex-front, tar, paper-meta, node-files                          a paper's source: the server
  pipeline/     live, anchors, versions, record.ts, tex-errors, and the compile path's cache, scripts, typeset/   the server
  layout/       file, json, marks, make, paper, ink, carry, match, stream, remove, addon, addon-manifest         the layout file and the add-on (file, json and addon-manifest also the readers')
  translate/    mt, groups, kept, mixed, version                                    the wires and the units a target keeps: both
  rules/        layout (the rule set and its reader), font-roles, font-coverage, script, arg-roles, latexml-args   both
  layer-proto/  run, reader (the reader's door), bundle, rows, fonts, hyph, removal, tex, check, layer1, layer2     the drawn layer: the browser
  layer/        pieces, swap, and check (the pixel checker the layer gate's instrument loads)                       the browser
  view/         highlight, floats, figures, pointer, sync, overlay, outline, engine.css                              the browser
```

What the engine does not hold: the extension's session (`src/pdf-reader/session/`), its translation client
(`session/translate.mjs`, with `paperContext`), the TeX page's store and hints, the languages the reader typesets
(`session/verified.mjs`) and the addresses (`src/pdf-reader/addresses.mjs`); and, parked (`parked/README.md`), the first
instant layer (`parked/engine/`).

### 19.2 The five entries

| Entry | Loads in | What it gives |
|---|---|---|
| `pipeline` | Node (the server) | A paper's source to its units (`openPaper`, `loadProject`, `unpackSource`, `analyze`); the marked original and the probes (`originalFiles`, `probeFiles`, `readingsOf`, `stoppedShort`); the left geometry (`anchors`); the layout marks, the layout maker and the add-on's maker (`layoutMarksOfPaper`, `makeLayout`, `paperAddon`, the remover); the layout file and the add-on's manifest, with their caps; the bundle's writer (`writeBundle`, `bundleUnitsOf`); the faces' coverage; `PIPELINE_VERSION`, `PDFJS`. Not the compile path's typesetting, strategies or cache, and not `runLive`. |
| `translate` | Node and browser | The wires a unit goes out as and the reading back (`serialize`, `rehydrate`, `serializeTags`, `rehydrateTags`, `translateUnits`, the sentences, the batches); the table groups (`decideGroups`, `groupOf`); the units a target keeps (`authorsTranslated`); the rows (`rowOf`, `unitOf`, `layerRows`, `toTranslate`, `batchesOf`, `runRows`); `TRANSLATE_VERSION`. No DOM, no network. |
| `rules` | Node and browser | The layout rule set and its reader (`readRules`, `parseRules`, `resolveRules`, `BUILTIN_RULES`, `RULES_SCHEMA`, `RULES_CAP`, `TARGETS`), the font roles (`FACES`, `rolesFor`, `faceFor`, `familyOfFonts`) and the script of a tag (`scriptOf`). |
| `layer` | browser | The reader's door whole (`layer-proto/reader.mjs`): `openLayer`, `firstFaceOf`, `readBundle` and its caps and refusal, `BUNDLE`, `CTAG`, `VTAG`, `parseLayout`, `indexLayout`, `parseAddonManifest`, the rows' helpers it takes. |
| `view` | browser | What is lit under the pointer (`highlight`, `floats`, `figures`, `pointer`), the synchronised scrolling (`sync`), the overlays kept through a zoom (`overlay`) and the outline. |

### 19.3 What holds

- **Imports.** A file of the engine imports by relative path: the engine's own files, `src/core/sentences`,
  `src/core/protector/tokens` and `src/core/names`, a `node:` module, and in `rules/` the layout rules' validator (`zod/mini`). No alias
  (an alias is refused for its spelling), no other package, no module of the extension. A TypeScript file is reached by its
  extension, which Node reads with its own type stripping; the closure behind the three core modules is those three files.
- **Loading.** `pipeline`, `translate` and `rules` load in plain Node with no bundler (a child process in the contract test);
  `layer` and `view` load in a browser's environment. The closures of `translate`, `rules`, `layer` and `view` hold none of the
  server's modules (the front end, the compile path, the layout maker, the marks, the remover and the add-on's maker).
- **Licence.** No file in the closure of the five entries states that it is ported from a reference project or a scoped
  package (the web's R21 detector, `portedInClosure`). The shared interface (`controller.ts`, `src/pdf-reader/ui/**`,
  `src/ui/controls/**`) does reach four ported files today (the language table, the Microsoft client, the prompt library and the
  retry policy, by one import each); the test pins them as a list that may shrink and never grow, until they are cut or the web
  takes them as ported code with the registry's entry.
- **Reached.** Every module of the engine is reached by an entry, by the checker the layer gate names, or by what ships or is
  kept in the lab (`unreached`); a module only a test reaches is parked with its tests.
- **Versions.** The identities of §18 move with the code that owns them; a change of an entry's names is made on purpose, by
  recording `engine-contract.json` again (`WRITE_CONTRACT=1 pnpm vitest run tests/pdf-reader/engine-contract.test.ts`), and
  the web sees it as a change of the surface it pins.
- **Behaviour.** `tests/pdf-reader/engine-golden.test.ts` holds, as SHA-256 values, what the engine makes of inputs the
  repository wrote itself (units, wires, the files of every compile, the bundle, the layout file, the add-on's manifest,
  the rows). A move or a refactor leaves every hash as it is.

### 19.4 The layer API, as the web defines it

The routes are the web's, `/api/v1/` kept for every released extension; the engine holds the format both readers parse and the
tags they ask by (`layer-proto/bundle.mjs`).

- **One file per paper version.** The bundle is a single JSON file: `{ schema, paper { id, version, pages }, base { bytes,
  sha256, url }, versions { bundle, pipeline, layout, removal, pdfjs, image }, units, left, layout | null, addon { manifest,
  tail } | null }`. Both readers parse it with `readBundle(json, caps)` after the byte cap (`BUNDLE_CAP`) and the value count
  (`BUNDLE_VALUES`) are checked before `JSON.parse`; a refused bundle draws no layer, a refused unit is dropped and counted, a
  layout of `null` draws the layer without the hybrid, an add-on of `null` erases and restores.
- **Routes by tag.** `GET /api/v1/layer/<id>v<n>/<tag>` answers 200 with the bundle, 202 `Preparing { position, stage,
  progress, retryAfterMs }`, 404 `{ why }` (`not-prepared`, `no-source`, `no-pdf`, `cannot-prepare`, `unknown-versions`) or 429
  `{ retryAfterMs }`; `POST …/<tag>/prepare` (JSON body `{}`) answers 202, 200 `{ ready: true }`, 404 or 429; `GET
  /api/v1/original/<id>v<n>` is `base.url`, our copy of arXiv's bytes. The tag is the engine's `VTAG`, or its contract
  tag `CTAG` where the server redirects to the newest bundle made under it (§18.4). The public GETs answer CORS `*`; the prepare
  POST relies on the extension's host permission.
- **What the reader sends.** A paper's id and version, and the engine's public versions (the tag). Nothing else leaves the machine.
- **The rows.** `runRows` makes a language's rows from the bundle's units; the reader draws them through the door
  (`openLayer(…).take(rows)`). The rows are cached by the bundle's key, the target and the chain.
- **The faces and the patterns.** From the web's `/static-fonts/*` and its `hyph` files, which answer CORS `*`.

### 19.5 The hand-off

The web moves its imports to the five entries, once: its server takes `pipeline` and `translate`, its reader `layer`, `view`,
`translate` and `rules`; its fork-session script and the copies of the session it makes go with the reading view that replaces
them. The extension's own modules are not importable from the web, and a module the web needs that no entry exports is a
request for an entry's change, made here with its test, not an import by path.
