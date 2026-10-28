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
  - A PDF address carrying `#axt-viewer` opens no reader whatever the setting says: the browser's own viewer asked for,
    with the floating button (the reader's original download opens arXiv's PDF so: `core/pdf/entry.ts` `VIEWER_HASH`).
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
   The translation's file is named `<id>.<target>.pdf`. Free. 译文 PDF is the final translation: while the translation is
   still coming in (previews), the item is greyed. The original's item opens arXiv's own PDF in a tab of its own, with no
   opener and no referrer, at `#axt-viewer` (§2: no reader laid over it): the browser streams it and its viewer saves it
   (`<id>.pdf` as arXiv names it). The reader never reads the whole
   original to save it: that is 46 MB through the page for every reader, in case one asks (ruled 2026-10-17, for the web
   too); a true download from the reader would need the `downloads` permission, a store-listing item not taken.
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
- Items are 30 px rows with an 8 px radius, their words 10 px in, on the search field's words; the chosen one's check
  at the row's end, 10 px in, in a 14 px slot every row of the menu keeps, after anything else the row holds (UI.md §4).
  Until 2026-10-25 it led the row (the maintainer: 「对勾都在前方…我们应该把它放在字的后边」).
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
| Preparing | the paper's bilingual files are being made (our server's prepare, a paper no reader opened before) | the original; the progress line's first half after the download, by the prepare's progress; 正在准备 PDF 对照 said to screen readers (S-R-23) |
| Translating | the paper's paragraphs being translated by the service chosen | the same line on, by the share of paragraphs done; 正在翻译 said to screen readers; each page laid on the right as its paragraphs come, the original's page until then |
| Not to be had now | Read arXiv's website out of reach, or at its limit | the original readable, the displays as they are; capsule: PDF 对照暂时无法加载 · 重试 · 改用 HTML 翻译 where arXiv has an HTML version (S-R-24); passing, not remembered; a paper whose files this machine keeps opens without it |
| Some paragraphs failed | a translation with gaps | capsule: {n} 处翻译失败 · 重试 · close |
| Language not supported | the shared target language is not one of the nine | 原文, with the capsule: PDF 对照暂不支持{语言} · 选择语言 (opens the language menu in place); choosing one of the nine translates |
| Nothing translated | a service failure with no paragraph done | card in the translation's pane: the reason (网络连接失败, API Key 无效或已过期, 尚未配置 API Key, …) · 重试, or 设置 when the reason is a key (opening the settings page at the services) |
| Cannot be had | no bilingual version can be made of the paper (no source, no PDF, a prepare that cannot succeed, one this version of the reader cannot read) | 对照 and 译文 greyed in the switch; the reader shows 原文, with the capsule: 这篇论文暂不支持 PDF 翻译, and 改用 HTML 翻译 where arXiv has an HTML version (opened where `reading.openIn` says); no close |
| No paper | the address names none (a hand-typed one) | the phase is ready, not loading; 对照 and 译文 greyed and 原文 selected whatever the saved display; a card in the document area: 找不到这篇论文 · 前往 arXiv (a link, opened where `reading.openIn` says) |
| Settings cannot be read | storage did not answer in a page's first 1,500 ms, or its value cannot be used | the defaults in use and the PDF opened on them, not held for the storage; capsule: 设置读取失败，当前使用默认设置 · 设置, for as long as it is so, beside an address with no paper's card too; the controls that write the settings greyed, with the reason in their tooltips; the menus keep their places |
| Narrow window | 对照 chosen, the document area under 840 px (§5) | the translation alone; capsule, once: 窗口较窄，暂只显示译文 |

- Recovery is automatic where it can be: our server's wait (a 202's, a 429's) is waited and asked again, a 429's three
  times in a row at most (S-R-26: a visitor's limit lasts up to a day, and a tab left open asked every ten minutes for as
  long as it stayed open; #88 E5); 重试 opens the
  layer again and asks only for the paragraphs that are missing, the rest coming from the cache; rate limiting never shows
  (the chain retries it, and only its final giving-up counts as a failure).
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
switch alone: figure text in every display; and on the layer the vector figures' text, §19.12, shown or hidden in place), `uiLanguage`
(the reader's words), `mode` (the display, §3).

- **Writing the display**: 对照 writes `mode: 'side'`, unless it is `'stack'` (a side-by-side choice already for the
  reader); 译文 writes `'only'`; both clear `pdfReader.original`. 原文 sets `pdfReader.original` and leaves `mode` alone.
- **Another target language**, once a translation has started (chosen here or elsewhere): the translation in it in place, the
  page never loaded again (`settings.ts` `followOf` `retarget`, the run's `retarget`, §11.8). The left, both documents, the zoom,
  the sync and the reading place stay; each laid page shows the language before until the new one's page is laid, and the
  original's page where the new one's service fails or stops short with nothing translated. The line and the phase are an open's (Translating, §8). A hold
  for the language before (one the layer does not set) is lifted and the translated display shown again; a hold for the
  paper's own reason stays.

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

Texts that did not come back for a reason that is not theirs (the service's own: a network down, a timeout, a rate limit
the background's queue has already retried) are not sent again piece by piece, since they would only fail again, once for
each piece. They stay in the source language, counted, and the failure is kept (`EngineError.lost`, `mt.mjs`
`translateUnits`).

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
- The translation scope the reader binds in the background is withdrawn when the page goes (`pagehide`), and that handler
  is set before the status call that binds the scope: an extension page is no tab the background watches, so nothing else
  withdraws it, and a page closed while that call was out left its scope bound. A reader that finds no engine able to
  translate withdraws the scope it just bound at once (`session/translate.mjs` `openEngine`).
- A test pins the PDF.js internals the engine reads (`_pages`, the page views' `pdfPage.view`, `renderingState`), so an
  upgrade that changes them fails at once.

## 11. Architecture

### 11.1 The page

- `src/entrypoints/pdf-reader/` (`index.html`, `main.tsx`, `App.tsx`), built by WXT with React and TypeScript.
  `pdf.content.ts` opens it in its frame with `?paper=<id>`; `web_accessible_resources` names it, at the browser session's
  dynamic address (`use_dynamic_url`, DESIGN §4.0c).
- It frames nothing: the translation is the layer's, drawn in the page (§11.7–§11.9); the compile page it framed until
  Stage 5 is parked (`parked/README.md`).
- **The reader's address is not trusted.** The reader is a page that arXiv's pages may frame, so its URL is not its own to
  trust: a page that frames it must not point its requests anywhere else. It fetches the paper from arXiv and its layer
  from our server, or either from a server on this machine when a probe says so; the build, never a paper, a service or a
  framing page, chooses which server it reads the layer from (`src/pdf-reader/addresses.ts` `READER_API`).
- **Framed, the reader acts only for the content script that made its frame** (`shared/frame-owner.ts`, DESIGN §4.0c):
  with no such content script to vouch for it, it draws nothing and does nothing — no paper fetched, no run started, no
  setting written, whatever its address asks (`ask=translate` included). **Nor does a release build's reader that is no
  frame**: the PDF page only ever frames it, while an arXiv page that learnt its address could send its own tab there
  (Chrome 153 lets that navigation through; Chrome 131 refuses it: measured 2026-10-24), and there the settings alone
  would start a run (`?paper=` and a translated display). A development build, and the
  harness's copy of a release build (the manifest key `axt_top_level_reader`, which `scripts/check-output.mjs` holds no
  build carries; `tests/e2e/lib/extension.mjs`), open it as its address says, for the browser checks and the probes.
- **`?paper=` is an arXiv id or none** (`core/paper-id.ts`, read once by `addresses.ts` `paperOf`): anything else is an
  address with no paper, its card shown, and never a request or a link.
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

`retry()` on a reader whose session could not open loads the page again, as it first was: there is no session to resume.

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

### 11.7 The reading view: one view for both readers

The engine holds one reading view, `createReaderView(host)` in `engine/view/reader-view.mjs` (exported by `view.mjs`), which
the web's reader and the extension's both run. It imports engine modules only: no extension module and no `pdfjs-dist`.
PDF.js is the host's kit, so every PDF.js type the view names is structural.

- **The host seam** (`ReaderHost`): the two panes' scrollers, PDF.js's kit (its library, `EventBus`, `PDFViewer`,
  `PDFPageView`, `PDFLinkService`, `LinkTarget`, and the `getDocument` options its data files are found by), the words a page
  is named by, the look (`ViewPrefs`: the view reads the highlight's on or off; the panes swapped, dimmed pages and the theme
  are the host's sheet), a link out of the paper, a clock, whether `scrollend` comes, a title where the PDF's metadata has
  none, and one channel for the view's events (`ViewEvent`). The view writes no preference: the display, the sync, a narrow
  window, the zoom and the pinch are commands.
- **The original takes no bytes.** `showOriginal(open)` calls the host's opener once, with the view's own `getDocument`
  options, and owns the task it returns: a newer call supersedes one still loading (its task destroyed, its call
  `'superseded'`), an opener that throws or a task that rejects is `'failed'`, and the call answers `'opened'` once the pages
  are laid out. `dropOriginal(task)` lets go only of the task shown: the places' page views first, then the viewer emptied,
  then the task. `originalData()` reads the bytes through the document.
- **The right pane opens no document.** It holds the places (`places.mjs`): a page box for each of the original's pages,
  sized by the left page box's own style under the left viewer's `--scale-factor`, so that both panes hold the same pages at
  the same places at every zoom with nothing measured. A place near the view (one pane's height above and below) shows the
  best version of its page there is: the layer's content once the layer side has laid it, else the original's page drawn
  from the left's document by PDF.js's own page view (canvas, text layer, links through the view's jump), else, with no
  original, the skeleton. A far place is an empty box: its page view goes, canvas and all. The places borrow the left's
  document and never clean its pages up.
- **The sync is the identity follower** (`sync.mjs` `createFollower`). Both panes hold the same pages, so the other pane moves
  by the reader's own steps (on the compositor, by a ScrollTimeline, where the browser has one) and is levelled at rest by
  the same point of the same page; a click levels the same point at the click's height. It is available once the places
  exist. The web reader's fixes are plain behaviour: the scroll's end by a timer where no `scrollend` comes, no rest while
  a finger is held, a rest an input called off armed again, a glide baked on input, a click's level calling off the rest
  and the timer's end, the pair levelled once a zoom settles.
- **The right zoomed through the left.** A zoom, a fit or a pinch over either pane scales the left's viewer, which the
  places follow; the right shown alone is fitted to its own pane. A step and a pinch are drawn 400 ms after the last one
  (one redraw a burst), the places' page views with them. A zoom and a display's change keep the reading place (the page and
  the point at the reading line); a pinch reads every rectangle before it writes.
- **The highlight** (`lighting.mjs`) reads a pane through its shapes alone (`Shapes`, the seam the shapes' PR builds); a
  pointer over a page of either pane is a want of that page. The highlight's layer follows a pinch by transform and is kept
  through PDF.js's redraws (§10.1–§10.2).
- **The layer side's handle** is internal: `internalsOf(view)` (not exported by `view.mjs`) gives the right pane, its places
  and their content swaps, the left's pages, the shapes' seam, the units, and the page-drawn, want, near and original
  listeners. Disposing the view disposes its layer side first, then leaves no listener, observer, animation, document, task,
  place or page view.

The extension's host is `src/pdf-reader/session/host.ts` (`openReader`): the reader on the view since Stage 5 (the compiled
session it replaced is parked, `parked/extension-compile/`), arXiv's PDF shown at the open, always, and the paper's layer
the run's (`session/run.ts`, §11.10). `scripts/check-output.mjs` checks that every build holds the view. A link the view opens
out of the paper is a web page or a mail address, never a script, data or a page of the browser's.
The view's rows are `tests/pdf-reader/reader-view.test.ts` (V1–V14, on PDF.js stand-ins and a clock moved by hand) and
`tests/pdf-reader/reader-view-bundle.test.ts` (a browser build of the view and layer entries reads nothing outside the engine,
no `pdfjs-dist`, and nothing of the server's).

### 11.8 The layer side: one sink for a paper's layer

`createLayerSide(view, options)` (`engine/view/layer-side.mjs`, exported by `view.mjs`) is the reading view's one layer
side. The host tells it what it hears of the paper's layer — refs, rows and their end, from any source, in any order — and
gives it a transport (`fetchObject`, an object by its ref), the base's check (`bind`) and the composed document's opener
(`composed`: the base page, our compile's wrapped by optional content, §19.7, §19.9; parts carry no tails, so it is opened once
for a head, and `composed(null, options)` is the one call). No host calls the door.

- **The feed** (`feed.mjs`) merges what is told, deduplicated by digest, fetches each object once while it is wanted and
  reads it with the format's own readers (cap, digest against its ref, values, shape, chain): the units chunks and the head
  into the index, then the parts in page order against the chain they make. An object's bytes go once it is read (the door
  holds what it reads); a part that waits is not fetched before it joins. A part extends the chain where it begins after
  the last one and names its digest as `prev` (a catalog's part, which names none, by its pages). One beginning at or
  before the last told, under another digest, is a fork, and the chain is reset from its page, where it joins and is heard
  later than every part it lets go (a source that comes late, a 202 made before a job's fork, does not undo it) or those
  are refused. A tell with the parts' end whose parts reach it (the catalog; one of no part at an end of page 0) names the chain
  whole: a part waiting from before it is let go (the same catalog told again keeps those heard since), and no later part
  forks it; one may extend it. A part that does not follow yet waits; one refused stops the chain at the part before it, and is fetched and read
  again when it is told again (an abort of the host's transport is a refusal too). A second head is passed over with one
  warning.
- **The order** (the reader view's contract §2.2): the index read; the base bound, once (false is no layer); the original
  open; the composed document opened with the view's assets, `PDF_OPTIONS` and `disableAutoFetch`, and its one
  optional-content configuration read (`visibilityOf`, below); the door opened over it with the parts read so far; each later
  part added in page order; the rows held until the door opens, then taken; the parts ended once the
  catalog's `through` is added. A fork, a later attempt (`again()`), or parts past the end the door was told (a later
  build's) dispose the door before it is opened again (one open layer a page): `again()` carries no row (the host takes
  its rows again), the others every row so far (the units are the head's). Only the first open waits for the original: a
  dropped original stops no later part, no `again()`. A part the door refuses stops the parts added to that door there,
  with one warning; the side stays open. A refusal of the whole side carries a code (`head`, `units`, `index`, `base`,
  `composed`, `open`).
- **The link layer under a delta.** The delta keeps the original's `/Annots` on a replaced page (about 91 % of its link rectangles
  match ours); the layer draws its own links from the layout (the door's `links`, one wrapper). The composed document's annotation
  layer is rendered nowhere: the side draws the copy canvas, the SVG and that wrapper, never a viewer's annotation layer, and the
  copy is rendered with `AnnotationMode.DISABLE` on a replaced page so that none of the original's appearances are drawn into it.
  `layer-side.test.ts` L18 pins it: no annotation element on a laid page, each link once, all in the wrapper.
- **A page of a part with no layout** (over our base: the engine's check refused the part, or its producer recorded none, a
  part's `layout` null) draws nothing and erases nothing, so its pages would show our base page in other line breaks beside
  arXiv's. What TeX's positions do not draw is arXiv's PDF: such a page (some part holds it and every part that holds it has no
  layout, `noLayoutPage`, a unit running on from the page before can put a page in two parts) is not asked of the door and not
  committed, one the door laid before its parts were all told is not committed, and its place keeps, or returns to after a
  fork, the original's page view. Any other head is laid as before (it draws nothing: `layerDraws`).
- **The document** is the side's: one composed document a head, destroyed once, at a refusal of the side (its feed's fetches
  with it, and the right's shapes the original's again) or at dispose, once no door reads it (the door's `onRetired`, told at
  the door's dispose). `again()` disposes the door and opens the next over the same document.
- **Each place shows the best version there is** (§11.7): its pre-layer content until the door has laid its page and the
  place is near the view, then the layer's copy (the door's `copyOf(page, { k, width, height, context, annotationMode })`:
  the composed document's page rendered at the place's k, device pixels a PDF unit within 2^24 pixels, on a canvas of the
  place's box at that k, the groups of the units drawn there hidden, below; never a canvas the left or a page view drew,
  at the commit or at a zoom's recopy: one page render a laid page, 10 to 25 ms on the sample; a page of a delta over
  arXiv's PDF, §19.8, is drawn with annotations off where the delta replaces it) and its SVG, put in one task, in place: the place's size and the pane's
  scroll unchanged, its page view destroyed first, no viewer document set. A zoom draws the copies again at the new k
  600 ms after it, nothing laid again; a copy is kept while it is at the scale a copy drawn then would be at. A page this
  door laid that leaves the view takes its drawing out of the document and holds an empty element (retired: the place shows
  no page, and no page view is made of it); a page the door makes ready while it is far is retired at once, and committed
  directly when it comes near. The one exception: a page that holds the focus (a link, or the place a jump gave it to) is
  kept in place as it goes far, and retired once the focus has left it (read a task after the focus moves, never in a
  microtask: a native Tab clears the focus before it arrives at the next link), so at most one far page stays in the
  document, and the focus never falls to the document.
- **The layer's text, at the page's weight** (the maintainer's ruling of 2026-10-29; `engine.css`, `view/text-rendering.mjs`).
  The SVG's text is drawn as PDF.js draws the page's own on its canvas. Two settings had drawn it lighter on macOS, and both
  had to go: the `-webkit-font-smoothing: antialiased` the reader's page sets for its chrome (inherited), and
  `text-rendering: geometricPrecision`, which Chromium on macOS draws without the system's smoothing whatever the smoothing
  says. Measured (Chromium 153, macOS, device pixel ratio 2, the same Chinese line in Source Han Serif SC Regular at 11.96
  px): PDF.js 7,327 units of ink, a canvas's `fillText` 7,326, the SVG with both 5,870 (80 %), with neither 7,326; over a
  page of 2608.16117v1, Chinese and German, 79 and 80 %, and the same in the dark (79 %). WebKit (Playwright's 26.6, macOS)
  draws geometricPrecision at full weight and only the smoothing mattered (77 % with it). So the layer's SVG takes the
  browser's own smoothing everywhere (a no-op where there is none to take), and `text-rendering: auto` where the browser
  lays a line out alike under both: geometricPrecision is there so that a word's glyphs advance as the engine measured them
  on a canvas, and Chromium on Linux (headless, device pixel ratio 1 and 2 alike, fontconfig's hinting ignored for web
  fonts) lays `auto` out on whole-pixel advances, up to 4.5 CSS px off over a page of German (mean 0.59), while there
  geometricPrecision costs no weight (within 4 % of the canvas either way). The test is the browser's, not the platform's, and
  it is the layer's own words that tell, in its own faces: a face the system holds is laid out with fractional advances under
  both on Linux too, where the web fonts the layer draws in are not (a first probe in the system's serif took `auto` there,
  and moved the page's letters by the 4.5 px above). At the commit of the first laid page that offers words drawn from one
  place each (a Latin word: one x, its glyphs advancing as the browser lays them; a CJK run has an x a character, which no
  rendering moves), the layer side lays up to 24 of them out again off the view, at the layer's scale, in their faces, sizes
  and tracking, under each rendering, before the page is painted; `auto` is taken where every glyph's advance within a word
  agrees within 0.05 CSS px (macOS's differ by a 64th of a pixel at two sizes; a whole-pixel advance by up to half a pixel)
  over at least 16 fractional ones, once a document, written on `<html>` as `data-axt-layer-text="auto"`, which `engine.css`
  reads; anything else keeps geometricPrecision, and a page that tells too little (no such words, or a monospaced face whose
  advances are whole) leaves it to the next. Measured (`lab/pdf/spikes/layer-text-check.mjs`, every character of a page
  against geometricPrecision): Chromium on Linux (Docker, device pixel ratio 1 and 2) keeps geometricPrecision, its places
  unchanged; Chromium on macOS takes `auto`, every character of four papers' twelve pages (16,528) within 0.17 CSS px of where
  geometricPrecision put it (mean 0.007; the ends of long words), at zooms of 0.75 to 3 and device pixel ratios of 1 and 2;
  WebKit takes `auto`, its places the same to the pixel. Not yet seen by eye: Chrome on Windows, a Linux desktop, Safari on
  iOS (which has no smoothing to restore).
- **No flash coming back** (the owner's goal of 2026-10-24: a page already seen never shows the original, or an empty place,
  before its translation, coming back to it). A retired page's drawing — its copy, its SVG and its links, detached — is kept off the view,
  and put back in its place in the same task as the page comes near again (`bringBack`), one pane height before it can be
  seen: no ask, no copy drawn, the right's shapes the page's own. The drawings are kept within the device's budget
  (`keepBudget`): a 64th of its memory (`navigator.deviceMemory`, 4 GB where the browser does not say) at 4 bytes a pixel, at
  least two of its screens' pixels, at most `KEEP_PIXELS`, 2^25 pixels (128 MiB), and on iOS and iPadOS at most
  `IOS_KEEP_PIXELS`, 2^23 (32 MiB: its WebKit tells no memory and kills a tab past its process's limit; until Safari 17 it also
  refused a canvas past a page-wide canvas cap of about 200 MB on an iPhone SE, WebKit bug 195325, which WebKit PR 14375 removed;
  32 MiB beside the near pages' copies stays under a third of the lowest cap reported); past it the drawing farthest from the
  view goes first. A copy costs its pixels: an A4 page at 120 % on a 2x screen is 1905 × 2694 pixels, 19.6 MiB of the GPU process's
  memory in Chromium 153 on Metal (an `ImageBitmap` of it no less; the probe of 2026-10-24). So a computer of 8 GB keeps six and
  a half such pages, nine at 100 %, twelve at the reader's fit (two thirds of what the left pane's PDF.js holds of its own at
  that zoom, its ten page views drawn), and a phone of 4 GB 64 MiB, some ten pages of its screen at the fit. A page let go past
  it is laid again from the door's kept markup as before. A drawing kept across a zoom comes back as it was and is drawn again
  at the new k. A later attempt, a fork or another target lets every kept drawing go (they are the door before's), as do
  `dropOthers()`, a refusal and the dispose. A host may give its own budget (`keepPixels`; 0 keeps none).
- **The faces, in one wave** (`layer-proto/warm.mjs`). v0 checks and loads the faces of a unit as it lays it, one unit after
  another (E2), so a page whose units brought new characters waited a round trip a unit: 2602.23285v2 in Chinese asked 38
  font files in 12 waves before its first page, 4.3 to 9.2 s of a cold visit (production, 2026-10-24). The side asks the
  slices of what v0 will draw of the near pages at once, the page in the middle of the view first (page 1 alone until a page
  is shown, the others after it), as soon as the index, their rows and the parts that locate them are in (before the
  composed document is open): each unit's translation in the style its lines are set in on the page (their most common font
  by width, formulas aside, as v0 takes its original's most common class; a heading the layout tells no font of in the
  bold), an author's unit never (v0 never draws one; on 2602.23285v2's page 1 its names alone took 16 slices, 1.7 MB, where
  the units drawn take 1.4 MB), the page's babel names in the target's words, the alphabet slice of each text font the page
  is set in, and on page 1 the faces v0 warms there (`warmFaces`). CJK characters go by the rules' class to the CJK face,
  the rest to the style's Latin face; the paper's family is read from the parts' layouts (each font weighted by the lines
  set in it; the same family page 1's characters give on the seven papers of the gate pack). The slices are loaded
  `WAVE_SLOTS` (4) at a time: the edge answers a connection's streams side by side whatever their priority (staging,
  2026-10-24: a High fetch beside 28 slices loaded as fonts, VeryHigh, ended in 175 to 470 ms, as beside 28 asked Low or
  High), so a wave of 28 slices in flight held each read of the original the composed document makes, one after another,
  to a share of the line in 29. v0's checks are unchanged: they find the slices loaded or loading, and a run the wave did
  not foresee (a bold word in a paragraph, a character only the original's text holds) asks its own as before. A slice is
  asked once.
- **Translating** (the owner's "Field", 2026-10-25). While a near page is not laid, its place shows the original's page,
  and each paragraph the parts read so far locate on it carries a mark: a card over its box, showing its own share of one
  diagonal light that crosses the whole page. The page's overlay is a size container and carries the pass (one registered
  property, `--axt-tr-p`, for the page); a mark's background is three pages wide, set back by the mark's place in the page, so
  the light is one surface whatever the paragraphs. On paper the light clears a faint ground rather than covering the glyphs.
  A mark shows after 300 ms (a fast page shows none) and fades in over 0.4 s; a pass takes 3.4 s, its last 20 % a pause. The
  card stands out from its paragraph by 14 CSS pixels inline and 4 block, with 8-pixel corners, at the reader's 100 % (the
  owner's, 2026-10-25), scaled with the page so a zoom keeps it in proportion; each side's padding is at most half the gap to
  the nearest card beside it, so no two cards meet.
  Every value of the look is a custom property of `engine.css` (`--axt-tr-*`: the ground, the light and its shoulders and
  where they stand, the angle, the blend, a filter, the card's padding and corner, the pass and its easing, the drift, the
  delay and the fade; a look of another shape sets `--axt-tr-image`, `-size` and `-position` on the mark), so that the owner's
  final look (Graphite now; Pearl, Aurora or Ember) is a change of values, no code. With reduced motion asked, and where the
  browser cannot animate a registered property or size a container (Firefox before 128 among the reader's browsers), the mark
  is the still ground. The marks sit at the paragraph's box in shares of the page, so no zoom moves them, above the page and
  under the pointer (no pointer events, hidden from assistive technology). A page is laid whole, through its page pass, the
  moment its rows and slices are in (the coordinator's ruling of 2026-10-24: pages, never a unit drawn on a provisional fit
  that later moves), and all its marks go in the same task its drawing is put in place. An author's unit has none (it is
  never drawn), nor has a paragraph whose rows ended with no row of it, nor has a page that failed (the original's).
- **The pages ahead** (the prefetch on the layer). Once the rows of the attempt have ended (a host that translates as it shows
  is asked for nothing it has not translated), the door is open, no page of the view is asked of it, the right pane is shown
  and the document visible, and the view has rested `AHEAD_IDLE_MS` (600 ms: no scroll, nothing asked, the last near page
  committed), the side lays the `AHEAD_PAGES` (2) pages after the last near page past the middle of the view, one at a time,
  each after its faces' wave, and draws each at its place's k into a drawing kept off the view: the reader reaching it finds
  it put back at once. A scroll gives the window up (its ask and its copy under way aborted) until the view rests again; a
  page come near meanwhile is committed as any near page. A host may lay none (`ahead: 0`). A page that fails, or whose copy fails, shows the
  original and is asked again on a zoom, on coming near or (a copy) on the next scroll; one asked, told `laying` and not
  laid within 30 s (`PAGE_MS`) shows the original, warns once a side and is asked again on the next scroll, its late
  `ready` taken. A page still `waiting` (its part, its closure or its rows) is never a stall. After a reopen a laid page
  keeps its drawing until the new door's page is ready; leaving the view, that drawing goes and the place shows its own
  content again. The document holds a copy for the places near the view alone (their pixels bounded by the near area at
  any zoom); far ones are kept off it, within the device's budget.
- **No scale is captured.** Before the per-unit erasure a copy could be cut from the left's canvas or a place's page view where
  PDF.js had drawn it near k, which meant reading the scale PDF.js drew at (`pagerender`), refusing a canvas drawn at two
  scales (PDF.js's `approximateFraction` floors width and height to different terms at most ratios) and slack for the
  difference (`K_SLACK`). A copy is now always the composed document's own render at the place's k, so none of it remains:
  `view/drawn.mjs` keeps `pageBox` (PDF.js's rounding of a viewport) alone.
- **The page drawn from the composed document** is drawn as PDF.js draws a page view: at k on a canvas of the place's box
  at k's resolution (`places.box`, PDF.js's rounding of the viewport, nothing of the layout read), on the left's page
  views' own context (opaque; read back by the CPU unless the host opens its documents with `enableHWA`, as PDF.js's
  `willReadFrequently: !enableHWA` gives it). Where both are the CPU's (the extension) its copy is the left's to the
  pixel; where the host draws on the GPU's (the web) the two differ by anti-aliasing, and a registration check there needs
  a tolerance for it. The SVG and the links are laid in the same frame: the page's size at its scale (`--axt-frame-w` and
  `-h`, `--total-scale-factor` times its size in PDF units), never the place's floored box. `pnpm e2e:registration` holds it
  on the sample at DPR 1 and 2, at the fit and every step of the zoom menu: each copy on the place's box at the pixel ratio,
  the SVG and the links the page's size, a page far from the view and back its very copy (nothing drawn again), and a page
  drawn again at the same zoom (a zoom away and back) the same copy to the pixel (84 of 84, 2026-10-24; at the fit and 100 %
  no zoom's recopy makes a long task).
- **What a copy hides** (the per-unit erasure's reader side, `layer-proto/visibility.mjs`, `layer-proto/hide.mjs`; the file
  side is §19.9). Our page is wrapped: each unit's text in group `axt:u<id>`, its placeholders in `axt:u<id>.p`, its label
  in `axt:u<id>.l`, each babel name in `axt:n<occ>`, all shown by default. A copy is the page with the groups of the units
  drawn there hidden, and nothing of the page is erased by a rectangle: what a unit owns goes, glyph for glyph, and nothing
  else (no paper fill, no swap, no removed page; those, the text-removed PDF's add-on and its tails are deleted).
  - **One configuration a document.** PDF.js 6.3.289 makes a new optional-content configuration on every render it is not
    given one for (+23 MiB of main-thread peak on the 147-page thesis), so `visibilityOf(doc)` reads it once (6 ms for the
    thesis's 979 groups in Chromium) and passes it to every render of the document. The configuration is read at paint
    time, so it is never changed while a render that uses it runs: the document's renders go through one queue, each
    setting the visibility it needs just before it starts (only the groups that change; 1.4 ms for 40,000) and awaited
    before the next. A foreign group (the paper's own layers) is never touched.
  - **Three renders, at one k on one canvas size.** A: the drawn units' groups hidden, every other group shown. B, only
    where a crop or a placeholder kept in place needs it: every unit's text and label hidden, every placeholder shown, so
    that a crop cut through its own segments brings no neighbouring word. C, only where a unit keeps characters of its own
    (a kept line, a character it keeps or accounts for nowhere): every group shown, pasted back through their boxes
    (`pastedKeep`). A crop of a label is cut from C. The copy is A, then the pastes and crops, then the SVG, in one task.
  - **What a unit hides on a page** (`unitHiding`): its text group always; its placeholders' group where one of them is not
    kept where it stands (drawn as a crop, or as text in the translation), its kept ones and its displays then pasted from B
    through their segments; its label group where the reading draws the label in the target's form; a babel name that leads
    it (RUN_IN) with it. A unit the head lists as `unhidden` (marks, across, spell, page, bounds) or whose text group the
    document does not hold (an unwrapped page; a base that was not wrapped) is the original's and is not drawn — a table's
    cell so alone, the rest of its group drawn (the coordinator's ruling of 2026-10-24, coverage first: a table with one
    English cell beats an English table), but for one spanning columns or rows (`\multicolumn`, `\multirow`), whose box the
    others share, and one that fails the spell check (its range may hold a sibling's ink), which keep the group the
    original's as any cell that cannot be drawn does; one the
    head lists as `labelKept` draws its body alone and never hides a label. A table rule near a CJK cell (`cellBands`) is
    read from the part's `rules` (each page's, made by the maker over our page's ink: `layout/cell-rules.mjs`), the one fact
    of the add-on's manifest a reader kept.
  - **Measured** (the reader's lab gate `lab/pdf/spikes/ocg-reader.mjs`, Chromium of Playwright, GPU canvases, k 2.5; the pack's
    seven papers in Chinese, our final pass wrapped from the papers' source units, 2026-10-23): every page laid and drawn
    (124 pages of the six papers with a geometry; a unit hidden on a page 1,092 times, 187 boxes pasted from B, 14 kept boxes from C, 702
    crops).
    G1, every group shown against our unwrapped page: 0 px on every page, but on two pages of 2608.04322v1 (p3, p9) where
    two renders of the same unwrapped page differ from each other (497 and 2,469 px) — Chromium's, as the file side found
    (§19.9). The copy's spill, a pixel the copy changes where render A left the page's own ink and outside every rectangle
    it hides, pastes or crops into: 0 on every page, but those two and one more where two renders of A differ (2609.26457v1
    p6, 397 px, 0 rendered again). Render A against our unwrapped page at the same k, the median of a paper's pages (cold, a page's
    first render): 19.5 against 22.1 ms (1512.03385v1), 18.3 against 20.8 (1706.03762v7), 17.4 against 19.1 (1810.04805v2),
    14.9 against 18.7 (2608.04322v1), 18.5 against 15.7 (2608.16117v1), 15.0 against 19.3 (2609.26457v1); on the thesis (2307.16209v1, 147 pages, render alone) 9.2 ms against 10.0 cold (p95 25.1 against
    25.1), 9.5 against 8.3 warm (p95 23.8 against 22.4): within §8's 1.5× cold and about 1.1× warm. A copy (render A, B and C
    where asked, its pastes and crops) 31.9 to 36.5 ms at the median.
  - **One parse a page, planes cut to their boxes** (the review of #447). The document keeps its pages' rendering state for every
    render after them (`visibility.mjs`, through which every render of the document goes: `WARM_PAGES` 4 pages, the one drawn
    last kept longest, the oldest let go by its `cleanup()`, the rest with the document): PDF.js 6.3.289's `page.cleanup` drops
    the operator list and the decoded images, so A, B and C and every recopy after a zoom each parsed the page and decoded its
    images again (2602.23285v2 p8, 16.6 MB of images, at k 2 in Node: 4 operator lists and 80 image decodes for A, B, C and A
    again, 1 and 20 now). The lay's reads of a page (its pixels, a live reading) keep it warm too, so a page's copy renders from
    the parse its lay made, and a run opened again over the same document (another target, a retry) reads and copies its warm
    pages with no operator list asked. The bound is the document's: at most `WARM_PAGES` pages' operator lists and decoded
    images, whatever runs over it. It stays 4 beside the drawings kept off the view (2026-10-24): a page coming back is put
    back from its drawing with no render, so more warm pages would buy the scroll back nothing, while a warm page holds its
    images decoded (2602.23285v2 p8, 16.6 MB of them compressed) where a kept drawing costs its pixels alone. B and C are rendered on the box their operations cut from alone (`layer2.mjs`
    `opsSources`: 8 to 30 % of the pages' pixels on the pack), with render A's annotation mode, and a copy of a page that leaves
    the view is aborted before its next render (`copyOf`'s `signal`).
  - **Another target, in place** (`retarget(to)`). The layer is the paper's whatever the language, so another target is a later
    attempt over the same layer and the same composed document: the door laying the target before is let go at once (its
    generation past: nothing it lays or copies is put in place, and no page is asked of it in the new language; its copies
    under way aborted), then the door opened again as `again()` opens it, over the latest composed document (no document opened
    or read again, no range of the base or the original asked). Its run sets its own groups off a page (render A) through the
    document's one configuration. A laid page keeps the target before until the new target's page commits; one the new door
    fails or stalls shows the original's page; `dropOthers()`, the host's word that the new target's rows will not come (its
    service failed, or it stopped short with no unit translated), lets every page still showing another target's layer go to the
    original's (one holding the focus once the focus leaves it). A kept page's shapes are muted (`shapes.mjs` `mute`): nothing
    of it is lit or hit until the new target's page commits, since neither the new layout nor the mirror describes its drawing;
    it is not drawn again on a zoom either (its door is gone), so it is soft until then. The run's renders stop once it is let go
    (`VIS.render`'s `live`), so the door before holds no turn of the document's queue; a live reading pins its page warm until
    its fills are read. A stop tells the end only where a unit of the target was translated (`whole` or `partial`); a service
    that never answers ends as any stop does, by the request queue's bounds (each batch's timeout, the queue's whole budget).
    A language change during a limit's wait (429) is retargeted in place, the look asked no sooner. Whatever the target, a laid
    page whose copy hides nothing (`LaidPage.hides` 0: no unit translated there, its rows `none`, lost or not come by the end, or
    nothing to translate) is never put in place: arXiv's page stays, never our base page in its place. `dropOthers()` lets go
    every drawing of a door before, another target's or this one's before it was opened again. The left pane is not
    touched. A same-target retry keeps its pages as before.
  - **The left first, or in the same frame.** A copy ready while the left's page is being drawn waits for it (at most
    `LEFT_WAIT_MS`) and is put in place in the task the left's page is told drawn in. Chromium, 2602.23285v2 p8 at k 2, asked to
    both painted, three runs: 3,275 to 3,324 ms before (the right 2,031 to 2,083 ms after the left), 1,260 to 1,272 ms now (0 to
    38 ms apart), against 1,211 to 1,238 ms for the left alone.
  - **Failures.** A group the document does not hold: the unit is the original's. A render that throws: the page shows the
    original (`shownOriginal`) and is asked again on the next scroll or zoom.
- **The highlight's data** (§17.8): the left's shapes from the parts' rectangles as they come and, on the first want of a
  page from either pane, its left part (`leftPageOf`, once a page; nothing fetched before), added in a task of its own, then
  the left parts of the other pages its running units are on (a page so fetched brings no more); the
  right's from the laid page's words where its place shows the layer, the left's mirrored elsewhere (`layerShapes`); a
  page's floats from what PDF.js drew the left's page by. The geometry is kept for the near pages and the last 20 wanted.
- **The contents** (`contents.mjs`): the index's headings through `outline.ts`'s rule, each at its unit's first rectangle
  once a part locates it, else at the page the left document's outline gives its title (matched in order), else none;
  titled by its row once taken (`again()` lets the rows' titles go; a fork asks the outline again for the new contents).
  `outline` is told at the index and after each change (once a frame), `heading` from the
  scroll of either pane: the last heading at or above the reading line of the pane read.
- **What it tells**: `layer` events (`opening`, `open` with the pages laid, `refused` with its why), `coverage()` and a
  bounded `probe()` (counts, states, a ring of the last 32 commits), and `rowsFor(page)`, the units whose rows the door's
  page still waits for (its closure's: the door lays a page asked by its closure alone, the newest ask first), which a host
  translating as it shows translates first. The stall clock starts at the page's `laying`, which the door tells when its
  drive takes the page, not at the ask. The door's stats tell no late rows and no skipped
  units yet: `coverage()` gives 0 and {} for them.

The extension's run makes the side and tells it (§11.10). The side's rows are `tests/pdf-reader/layer-side.test.ts` (the fake door), `layer-side-door.test.ts` (the real door),
`feed.test.ts`, `contents.test.ts` and `shapes.test.ts` SH5; `pnpm e2e:reader` runs it on the sample cut into BUNDLE 4's
objects (`tests/e2e/lib/layer-cut.mjs`, our base the sample's final pass wrapped, `tests/fixtures/pdf/ocg/`), served by the
stand-in of the layer API (120 of 120 over our base whole, 121 of 121 as a delta, 2026-10-23), and `pnpm e2e:registration`
holds the frame.

### 11.9 The layer's links

A laid page's links (`LaidPage.links`, the engine's records: boxes in the page's PDF units, a destination or an address of
`http:`, `https:` or `mailto:`, a name, a reading order, a border) are committed with its copy and its SVG, in the same
task: `engine/view/links.mjs` makes them into `div.axt-links > a.axt-link > span.axt-link-box` over the drawing and under
the highlight's layer, outside the dark filter (the left's links keep their colours too).

- **Real links in reading order.** One `<a href>` a record, in the record's `order`: a page's links are reached by Tab after
  the pages before it, Enter follows one, and a screen reader names it by its record's `name`, the text drawn under it, set
  as an attribute's text (a name is the PDF's text and may hold control or bidirectional characters: never markup). A link
  with no glyph under it (an image, a symbol) is named by the host's `ViewWords.linkName`, else by the view's placeholder:
  the extension's are the owner's words, by where it goes (UI.md S-R-25, `pdf-reader/ui/link-names.ts`). A record the view
  cannot carry (no box of area, neither or both targets, an address off the allow-list) is left out.
- **Placed by shares.** The anchor spans the union of its boxes and each box is a span of it, every size a share of the
  page's frame (or the link's) made once from the place's viewport (its rotation, its box's origin): the links' element is
  laid at the page's size at its scale, the copy's frame (§11.8), never the place's box that PDF.js floors to whole CSS
  px, so CSS scales them at any zoom, nothing is read from the layout and nothing runs on a frame. The anchor takes no pointer, its
  boxes do: the space between two lines of one link is the page's.
- **Followed.** A link inside the paper is resolved on the left's document (a name by `getDestination`, its page by
  `getPageIndex`) and jumped to on the right, the pane clicked, by the view's own jump (its zoom too, as PDF.js takes one):
  the left follows where the sync is on and stays where it is off. Followed by the keyboard, the focus goes to the place
  jumped to, so that reading and Tab go on from there. A link out of the paper, by a click, Enter, a modified or a middle
  click, goes through the host's `links.openExternal` alone (its policy, its new tab); the browser's own navigation never
  runs. A click on a link, on either pane, levels nothing (the click's levelling skips a link).
- **Looked at.** As PDF.js draws a link on the left: the PDF's border where it gives one (its width, colour and style:
  solid, dashed, underline), a yellow wash under a hovering pointer; the focus ring is the reader's (2 px, `--focus`), the
  system's in forced colours.
- **Gone with the drawing.** A page let go far from the view takes its links; after a reopen the drawing kept keeps its own
  until the new door's replaces it; dispose leaves none. A link holding the focus when its page is drawn again gives it to
  the link of the same rank, else to the place; its page is not let go far from the view while it holds it (above).

The rows are `tests/pdf-reader/links-view.test.ts` (LV1–LV4 on links.mjs, LS1–LS7 on the side over the fake door) and the
real door's in `layer-side-door.test.ts`.

### 11.10 The extension's run on the layer

`session/run.ts` `startRun(view, paper, host)` is the extension's run of a paper (Stage 5 Task 9; the shared reader view's
contract §4.3), started by the host once a translated display is shown in a visible tab:

1. **The service first** (`session/translate.mjs` `openEngine`, the background's chain): its target is the layer's (one of
   the engine's `TARGETS`, else S-R-13 and nothing asked of our server); a service that cannot run is the card's reason.
2. **The layer's look** (`session/server.ts`, the layer API v1 by the reader's CTAG): a catalog is told to the side whole,
   with its end, and kept on this machine, and ends the prepare (`prepared`: the prepare is a state of its own beside the
   phase, so that a poll after the translation has begun moves no phase); each 202 is the prepare under way, said (S-R-23),
   its objects so far told, asked again once its wait has passed (never sooner, at least a second; every 5 s at most once
   it has been polled for 2 minutes; given up after 10, S-R-24 with its retry; none while the tab is hidden, that time not
   counted); a 404 `not-prepared` asks the prepare, once a visit (given back where the prepare never reached our server, so
   that a retry asks it again); any other 404 is why there is none (S-R-17); a 429 waits
   its time (S-R-26 meanwhile, whose retry waits it out too) and asks again, three times in a row at most (`REFUSED_ASKS`;
   the next 429 stops the look, S-R-26 staying, and a retry then asks at once), a prepare it refused given back like one that
   never reached our server; our server out of reach (a 5xx, the network, or nothing within
   30 s, its answer and body together, `REQUEST_MS`: twice) opens a paper whose catalog this machine holds (its place in the
   store renewed), else S-R-24. A retry begins the run again where the side refused its layer (a new side, its look, its bind,
   the base's tag heard anew), and opens the service again where it stopped short (its scope bound to the chain the settings
   make now); an engine that comes after its beginning was let go is closed. Only the paper's id and version leave the
   machine, in the address: no query, `{}` the prepare's only body, no credentials, no referrer. A head that cannot draw
   (item 4) ends the look: `translate()` decides it when the index arrives, before bind and before a unit goes to the user's
   service, tells the lasting `unavailable` `cannot-prepare`, and sets `terminal`, so that a prepare under way is asked no more
   and no `layer`, `preparing` or `prepared` follows it (the host would restore availability on any of them); a retry resets it.
3. **The objects** through this machine's store first (`cache/layer-store.ts`, by digest, checked there), then our server
   within each ref's bytes; the side's readers check every one.
4. **The base** (`bind`; the layer route, §19.7). Only a layer over our own compile draws: `session/base.ts` `layerDraws` is the
   engine's (the head's `base.source` is `ours`); a head over arXiv's PDF, with the why our compile was refused (its
   fallback) or with none, and every head of BUNDLE 7, is no layer: the original stays, nothing is translated. A base of ours
   is bound by its head's `check` (`bindOurs`): the box proved before it committed the head that our base page has arXiv's page
   count and every page's box and the lines it was checked on (`check.pages` equal, `check.boxes` `equal`), so nothing of the
   tab's bytes is compared at bind (no `endsAlike`), and a check that says otherwise, a head with no usable `orig`, a digest or
   length no address is made of, or no PDF.js for ranges is no layer. The head also names `orig`, the arXiv PDF the check ran
   over, and the run proves in the background (`proveTab`, once the left has loaded its bytes) that the tab's PDF is it: the same
   leaves everything as it is; other (arXiv replaced its file, the tab is another's), our copy of the orig is shown on the left
   in its place (`showOurs`: this machine's whole copy first, else read whole from `/api/v1/original` and checked against the
   orig's digest), `original { ours }` is told then and only then, and the pages are laid again; none to be had lets the layer go
   (S-R-24). What the left shows is kept (`leftShows`: the tab proven to be an orig, or our copy of one) and compared with every
   head's orig, which a retry may change: the same, nothing is fetched; another, the newly named original is shown before the
   layer is used (none to be had: no layer), never the new layer over the old PDF.
   **A base held as a delta** (`base.kind` 'delta', §19.8): `bindOurs` fetches the delta object by the head's digest through the
   layer's object route (`objectBytes`, this machine's store first, `DELTA_MS` for the ask, `DELTA_MAX_BYTES` the bound) and holds it
   to `checkDelta(head, bytes)` (length, digest, its section over `orig`, its startxref the head's) before it is used; a delta that
   does not check, or past the bound, is no layer. Pages `check.pages` [M, N] with M at most N (a paper of several toplevel
   sources) bind; the pages past M are the original's and the layer draws none there. The composed document is then ONE byte
   source: the ORIGINAL by ranges from our server's copy (`/api/v1/original/<id>v<n>`, bound by `head.orig.bytes` and the tag the
   layer's objects name, else the first answer's), then the delta in memory after its last byte (`composedRange`
   unchanged; `/api/v1/base` is asked for a whole base alone). The composed document IS arXiv's bytes there, so the proof of the
   tab's PDF against `head.orig` applies exactly as above (`leftShows`, `proveTab`, `showOurs`), also across a retry whose head
   names another orig. The extension reads the original from our server's copy, not the tab's own source (it holds none by
   ranges); the left pane and the composed document are two streams of the same bytes there, which the web, one store, is not.
5. **The composed document** (a whole base): our base page by ranges at `/api/v1/base/<id>v<n>/<sha256>` (`openRanged`, its own address: the
   digest of its bytes, so one object per URL), every answer a 206 of exactly the bytes asked, of the head's length and the tag
   of the first answer (a `Bound` may carry the length alone: no route names a tag beforehand);
   else the source refused (a page it cannot read stays the original's, the side's stall). A read with nothing from our server
   for 10 s is asked once more. The left is never read for the layer.
6. **The rows**: the engine's `runRows` over the side's index, the paper's title and abstract as an LLM's context, the units
   nearest the page in view first (that page's closure by the side's `rowsFor`, then ahead before behind), each batch's rows
   taken as they come, then the end. A retry is the side's `again()`, every row held taken at once, and the run again.

The served faces are `session/faces.ts` (our site's static table: `/static-fonts/index.json` and `/static-fonts/<group>.json`),
the hyphenation `<api>/hyph/<lang>.json`.
An id with no version is the latest version arXiv's abstract page lists (`session/paper.ts`: within 15 s and 2 MB, a read
that cannot be had forgotten so that a retry reads it again). The run's rows are
`tests/pdf-reader/run.test.ts`, `server.test.ts`, `ranges.test.ts`, `faces.test.ts` and `reader-host.test.ts`; `pnpm e2e:reader` runs the
reader on the sample (cut as a layer over our own compile, `tests/e2e/lib/layer-cut.mjs`) served by the stand-in of the layer API, through the echo service.

### 11.11 The layer's text: selection, copy and find on a laid page

A laid page is a copy of the composed page with the layer's drawing on it, its translation an SVG. Selection, copy and find on it
work as on the left's pages: **one transparent PDF.js text layer per laid page**, over the SVG and under the links, holding one copy
of every text the page shows. The visible paint does not change (the e2e row compares the place's pixels with and without it).
Decided 2026-10-24 (the owner's request of 2026-10-23; the route note that drafted it is folded here).

- **What it holds** (`layer-proto/textlayer.mjs`, pure; unit rows TL1-TL21). The composed page's text items (PDF.js's text
  content of our compile's page, kept compact on the page's record as it is drawn: `itemsOf`, upright text alone, ~13-70 KB on
  the heaviest pages; a line ends after an item where the next one stands on another line, by the geometry alone, so that a
  page read from its draw, which carries no `hasEOL`, gives the same layer as one read live) split by the page's drawing
  operations, by the links' rule (`links.mjs erasedOf`): a character whose place's centre (equal advance across its item, as
  `pointsOf` estimates) the operations leave hidden (a `hidden` rectangle, where the unit's or the name's groups are off, unless a
  later `paste` shows it again from render B or C; §19.9's per-unit erasure) is
  the drawing's, and an item whose characters part (a heading's number kept, its title erased, in one item) is cut into the
  runs of its characters alike.
  Erased and under the source of a crop of the same page: **moved**, relocated by the crop's map from its source to its drawn box
  (a formula's text where its ink is drawn); a crop cut from another page takes that page's items under its source; a crop
  with none under it carries its own plain text (the SVG's alternative) over its drawn box. Erased otherwise: dropped, its
  translation takes its place. Not erased: **kept** where PDF.js gives it (heading numbers, labels, untranslated units,
  references, page numbers). Each drawn unit and babel name adds its lines as **translated** items, one a drawn line (split
  where a crop stands, the script changes or a superscript begins or ends: each span its own measure, a superscript on the
  baseline it is drawn on), at the line's box across its tokens' bands
  (`words.mjs tokenBand`), its text as a copy reads it (lineRuns' spaces). Items of the page's own that abut on one baseline at
  one size are one item (a run PDF.js reads in pieces where its font changes); at most 2000 items (`TEXT_ITEMS_MAX`, past it a
  line's neighbours are merged).
- **Reading order.** The composed page's text content is in its content stream's order, which for a TeX page is its reading
  order (columns, floats, footnotes as the output routine shipped them). Each drawn thing owns the items its operations erased
  (the last operation that erased an item lies in that thing's range of the page's operations: the run records each unit's and
  name's range as it paints), and its lines go, as one block in their own order, where the first item it erased was: a heading
  number before its translated heading, a reference after the paragraph above it. A kept item the stream sets between two items
  of one drawn thing (a displayed formula a unit keeps, a float set inside a paragraph's run) goes inside its block, before the
  first of its lines on its line to its right or below it in its column (a line's slot across, not its text, says the column).
  A drawn thing that erased nothing is placed by the same geometry. Between two sources a copy breaks the line where they stand
  on two lines (`eol`) and gets a space where they stand apart on one; within a source, its own breaks (PDF.js's `hasEOL`, a
  translated paragraph's lines joined as one).
- **The contract.** The door's `textOf(page)` → `Promise<TextLayerData>`: `{ items: [{ str, x, y, w, h, base, dir, fontSize, from:
  'kept' | 'moved' | 'translated', unit?, eol? }], page: { w, h }, stats }`, PDF units of the page (user space, unrotated, y up, as
  `LinkRecord.boxes`; `x, y, w, h` the item's box, `base` its baseline), plain data made anew and equal on every call, read from
  the page's record alone (no layout, ink or PDF.js call), for any ready page until dispose; a page not ready rejects, and it
  throws after dispose, as `copyOf`. `LaidPage` is unchanged: nothing is added to the commit's path. The fake door's and the real
  door's conformance rows hold it; the real door's three opens (in parts, warm, BUNDLE 3) give every page the same layer, pure of
  the order the pages were asked in.
- **The host** (`view/text-layer.mjs`, `layer-side.mjs`): after a page's commit, once the main thread is idle (`requestIdleCallback`
  within `TEXT_IDLE_MS` 500), the side asks the door for the page's data and the view builds it with **PDF.js's own
  `TextLayerBuilder`** (the host's pdf_viewer, given in the kit's `viewer.TextLayerBuilder`) over a text content of the items (each
  an upright run at its baseline, its width the item's, one generic face that PDF.js measures and scales each span to; a single
  character given twice the scale across, the one case where PDF.js scales a one-character span to its width): one
  span an item, `user-select: text`, PDF.js's handling of a drag (end of content, `selecting`) and of a copy (its Unicode
  normalisation). Translated spans carry the target's `lang`. An upright page's layer lies in the copy's frame (`--axt-frame-w`,
  `-h`, the SVG's), contained (`contain: strict`). The SVG's text becomes drawn, not read: `aria-hidden` and `user-select: none`,
  so a selection, a copy, a search and a screen reader each meet one copy of the text (Chromium's `window.find` finds the text
  layer's alone; Firefox's and WebKit's find read the SVG's drawn text too, which `user-select` does not take out of a search
  there: a translated phrase is found first in the SVG, at the same place). It is part of the drawing it belongs to: a drawing kept off the view (§11.8, "No flash coming back") keeps its
  text layer and brings the same one back as its page comes near; a page laid ahead has its text layer built while it is kept,
  so it is there the moment the page is near; one that arrives while its page is kept goes into the kept drawing. It goes when
  its drawing goes (retired with no drawing kept, let go past the keep's budget, failed back to the original, replaced, another
  target's or door's, disposed), cancelled from PDF.js's registry of its selection listener; one that comes after its page was
  let go is put nowhere. Its translated spans carry the language of the target their drawing was laid in. Through a zoom's or a pinch's steps
  (CSS alone until PDF.js draws again, places.mjs) the text layers are out of style and layout (display: none): each span's size
  is a calc of --total-scale-factor, which every step changes, so a step made every span of every near page again (the web's
  zoom check: twice main's frames over budget in a pinch). The stack is marked `data-axt-scaling` from the first step to
  TEXT_BACK_MS (500 ms) after the redraw, so that a run of steps sizes them once, after its last; none is built in a pane while it
  is marked. A selection in them stays, and shows again with them. Measured against main (zoom.mjs, alternated): WebKit level,
  Chromium's pinch some 4 frames over main's (mean 27 to 23), the cost of taking the layers' boxes down at a gesture's first step
  and building them again after its last. Freezing them at the gesture's starting scale under visibility: hidden instead levelled
  Chromium's pinch but cost WebKit's and Firefox's step zoom (WebKit 16 to main's 13), and content-visibility: hidden cost
  WebKit's pinch: the follow-up is a freeze whose style no step reaches in any engine. The hover highlight is
  unaffected: the lighting reads the pointer's place, not its target. A host whose PDF.js gives no builder draws the page as
  before, with none. A page shown as the original's (no layout, refused parts, a page over arXiv's PDF) is never committed, so it
  gets no layer of ours: PDF.js's own is there.
- **Cost** (`lab/pdf/spikes/text-layer-cost.mjs`, `lab/pdf/records/text-layer.md`, Chromium 153, real pages, a synthetic full,
  half or no translation of them): the engine's step at most 1.2 ms a page (budget 3 ms), the host's build, its append and a
  forced layout at most 4.0 ms (budget 5 ms), at most 361 nodes (budget 2000), on 2602.23285v2 pp6-9 (977 items on p7, the
  heaviest) and 2608.16117v1 pp11, 13. Before runs were merged, every item its own span, p7 with nothing translated took 9.1 ms:
  the merge is what holds the budget. On the sample in the extension: 1.4-1.8 ms a page (`probe().textsRing`).
- **Not in v1.** Rotated and vertical text (an axis label turned a quarter) is left out of our layer (`itemsOf`): the left's
  layer has it. Right-to-left targets. Selection on a page turned a quarter (`/Rotate`) is PDF.js's own box and rotation rule,
  not checked in a browser yet (the sample has none). The SVG's text out of Firefox's and WebKit's find. A zoom does not measure the spans again (PDF.js scales them by CSS; their widths were
  measured once). The composed page's text content holds the hidden units' text too (PDF.js extracts text whatever a group's
  visibility): the operations' `hidden` rectangles, not the text content, say which of it the drawing replaces.

The rows: `tests/pdf-reader/textlayer.test.ts` (TL1-TL21, the pure core), `layer-door.test.ts` (the real door's pages and their
layers through three opens) and the conformance suite (`helpers/door-conformance.ts`), `text-layer-view.test.ts` (TV1-TV3 the
builder, TS1-TS10 the side: TS7-TS9 a kept drawing's and a page laid ahead's, TS10 another target's); in a real browser `pnpm e2e:reader` (built after the commit between the drawing and the links; one
drag from a heading's number through its translated heading into the paragraph after it, the selection and its copy; a
formula's text where its crop is drawn; find of a translated and of a kept phrase in the text layer; invisible, with its
control; one copy of each text in the accessibility tree; the hover over it; let go far from the view) and the web's
`web/e2e/layer.mjs`.

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
- **A token's sentence is the text's** (`highlight.mjs withSentences`, `segsOf`): on the left a token paired with a word
  of the unit's source is in that word's sentence; on a laid page a word is in its word's, and any other token — a formula's
  crop, a display's kept line, a lead — in the sentence its place in the translation falls in (the word table's `at`).
  Token order still makes the rows and the runs, and decides only a left glyph no word is paired with (a formula's, a
  script the text layer gives late), with the floor: no such glyph on a row below one where a later sentence began is an
  earlier one's. Until 2026-10-19 every token went by order, and the page's word table wrote a unit's displays after all
  of its text: each display joined the page's last sentence, the floor gave it every row below, and nothing fell back —
  on 54 papers of the sweep 527 of 3 796 units lit by sentence (40 papers) lit a sentence short, empty or over others.
- **Never another sentence's words**: a unit lights whole on both panes where a later sentence begins above an earlier
  one's last row (the drawing does not keep the text's order: the text a layout runs on above a display, 'flow'), or
  where a sentence of one of its runs paints over a word of another sentence in another run on the page (a display wider
  than its column beside the column's text, a label read apart from its line; `runsApart`). On the 54 papers
  (2026-10-19), against the layer pinned for each paper: by sentence 3 779 units (3 796 before), of them 3 on the right
  with a word their shapes miss (none lit as another sentence; below) and none on the left (5 before); the 24 that now
  light whole all lit wrongly before — 16 a display's line made one row with the text line where the next sentence
  begins (§17.7), 5 runs over each other, 3 the left's pairs putting a later sentence's word above an earlier one's row.
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
- A translation's `inSource` mark (a final set it in the source: the author block under CJKutf8) belongs to the copy's PDF,
  not to the run. A run that sets no final writes the units' provenance over the copy's PDF, which still sets that
  translation in the source, so the mark goes with the translation from the record to the seed, to the run again's seed
  and to the run's results, and only a final that sets the unit again says anew whether it set it there
  (`cache.mjs inSourceOf`).
- Units that share a source hash (table cells, often) each take the best translation of that source, whole before partial
  (`cache.mjs seedFrom`); whether a run changed anything a stored copy holds is judged on the units as a whole, never by
  hash (`decideWrite`).
- A table group kept whole is shown in the source (`state: 'kept'`), and the record keeps beside it what the translator
  gave its cells (`translation`: whole, partial, none or lost) and their sentence cuts, so that a cell given in part is
  asked for again rather than taken as whole, and a retry that makes it whole with the same pieces is written. A cell
  left partial in the copy was asked for on every run (`cache.mjs translationOf`).

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
  units on the ten papers, with those a hanging glyph makes whole); so does a display's kept line made one row with the
  translation's line under it, where the next sentence begins (their boxes overlap by more than half a unit: 16 units on
  the 54 papers of the sweep, 2026-10-19).
- A formula or a citation that begins a sentence lights with the sentence before it, on both panes alike: a sentence
  starts at its first word (`mt.mjs sentencesOf`), and the record keeps no more. Starting it at its first piece changes what
  the record means (§18.2's `TRANSLATE_VERSION`).
- A word the layer draws past the column's edge by more than the overhang, or on a page the unit's rectangles are not on,
  is in no shape and lights with nothing (3 units on the 54 papers).
- Before our marked original is compiled, units of arXiv's PDF matched under 80 % by their text alone light whole (113
  of 738 on the ten papers; 29181 38 of 90).
- A copy made before the highlight lights by paragraph until it is translated again; an LLM's sentences are measured
  on one model (above); with Google the markers change the wording (above).

### 17.8 On the layer path: the shapes made page by page

- **One layout, made page by page** (`highlight.mjs` `pageLayout`, `layoutParts`, `layoutPage`; `shapes.mjs`
  `createShapes`). On the layer path the left's tokens come a page at a time (the door's `leftPageOf`, on the first want
  of the page) and its units' rectangles a part at a time. The document part — each page's columns, the columns' text
  edges, the half leadings — is made again of every unit told whenever a part comes, and each page's geometry made before
  is let go and made again from it (a part that tells no view or unit not told before changes nothing); a page's part
  is its left part's tokens and spans when it lands. Built so, in any
  order, it is the layout made whole: on the ten papers, both sides cut as the wire carries them and made again with the
  pages shuffled among the parts, every page's geometry (4 049 runs on 483 pages) and every sentence shape (7 669, of
  2 340 units' starts read from their pairs) equal the whole layout's (the highlight gate, 2026-10-15).
- **Token ids are the side's stream**, from the left part's `first`, as the parts' units name their streams: they rise
  page by page whatever order the pages come in, a unit's first token is known before its page comes (its head on the
  page, whether a sentence began before a run), and they equal the whole layout's. Each page's tokens are a table of its
  own; a layout made whole reads its arrays through views of them.
- **A unit's sentences wait for all its pages** (`tokensIn`): a run's sentence shapes read the unit's tokens beyond the
  run — whether a sentence began before it or goes on after it — so a unit over a page break lights whole on the pages
  that have come until the others have, then by sentence. A page's left part comes on its first want, so the side asks
  for the left parts of the other pages its running units are on in the task after its own (`layer-side.mjs spreadFrom`;
  the nearest `SPREAD_MAX`, 8; a page so fetched spreads no further, or a paper's paragraphs would fetch every page): before, a paragraph that ran on
  to the next page lit whole until the pointer had been there. On the 54 papers, 0.78 more left parts a page wanted (none
  on 43 % of pages, two on 21 %), 43 KB at the mean, 25 KB at the median, 121 KB at the 90th percentile (2026-10-19).
- **The right, mirrored** (`mirror`): until the layer's pages bring words of their own, the right's shapes are a layout of
  the right's own over copies of the left's tokens and rectangles, following the left as it is told. Its blocks equal
  the left's from run objects of its own: the paint keeps what it drew by the run, and a run shared would move the left's
  element into the right's pane. A float passes through (the right's floats are the left's), and the right's sentence
  shapes keep from under it as the left's do. Where its place shows the original, the mirror's starts are the left's (the
  same tokens), so a unit lights by sentence on both panes as it does on the left.
- **The left's starts** are its units' pairs (the left part's runs of words to tokens) read as `sentenceStarts` reads an
  anchor's, once every page the unit is on has come. The reader takes every pair shipped, so the producer ships them only
  for a unit `sentenceStarts` would read (located by its marks, or by its text over 80 % of it): on the ten papers, one
  unit's pairs read where the whole layout's anchor refused them.
- **An empty or refused left part** (a page past the left part's caps ships none, M8): no shapes on that page and
  nothing thrown; a refusal warns once a page, and a later left part for it is taken. A left part whose token ids reach
  into a page already in is refused, and the first of the two keeps its place: a bogus page that comes first leaves its
  true neighbour refused, since nothing in the two tells which is wrong.
- **The right on a laid page** (`layerShapes`): where its place shows the layer, the right's shapes are a layout of its own
  over the page's words (the door's `LaidPage.words`: the tokens it drew, in the page's PDF units, each unit's spans in
  paint order), its token ids the page's (page · 2^16 + its index), the units it shows as the original's over copies of
  the left's tokens of them, made once the page's left part is in too; elsewhere the left's mirrored. A unit's stream on
  the right is its first token on its first page, told when that page lays. The right's starts of a unit all on laid
  pages are the tokens carrying its sentences' first words (`words.word` against the row's `sentences.tr`), each token's
  sentence its word's or its place's (`words.at`, §17.3); of a unit on no laid page, the left's; of one on both, none, and
  it lights whole. The page's word table is in the order of its units' text (`words.mjs addUnitWords`): a display's kept
  lines where the line walk passed its region (`breakLines`' `past`), a kept line no placeholder holds before the block that
  follows it in the unit's rectangles.
- **Floats and the view's window**: a page's floats are made of what its drawing gives (its figures and paths,
  `floats`), and again on the page's first use after a part moves the document part — never in the part's task, which
  would make every such page's geometry again at once. A page leaving the window (`forget`) lets its geometry, its
  floats and their inputs go; its drawing gives them again. Inputs that throw are let go with one warning, and the page
  has no floats.

## 18. Rules and their versions

Three kinds of rule decide what the reader shows, and they change at three different costs. Each has its own identity,
and no identity names another kind's change: a tuning of how a page is drawn must not make a paper compile again, and a
fix to a unit's cutting must not wait for the store. This section is the contract the engine, the web and the extension
read their versions by (the rules-as-data plan of 2026-10-08, agreed with the maintainer the same day); a test holds the
table of §18.2 to the identities the engine exports and the table of §18.5 to the fields of the rule set.

### 18.1 The three kinds

**The test that classifies a rule.** Ask what the change alters:

- **the units, their geometry, the layout file, its cell rules or the wrap** (what our server makes per paper): **extraction**;
- **what is sent to a translator, or how a reply becomes a row** (what a language's translation holds): **translation**;
- **only the pixels and text a reader draws from the same bundle and the same rows**: **layout**.

A rule that does two of these is split, or classed by the more expensive.

| Kind | Where it runs | Where it lives | Its identity | A change reaches readers by | Cost of a change |
|---|---|---|---|---|---|
| Extraction | the server, when a paper's bundle is made | engine code: `latex-front.mjs`, `arg-roles.mjs`, `latexml-args.mjs`, `groups.mjs` `groupOf`, the layout maker, the ownership and the wrap. HTML: `src/core/rules/latexml.ts`, in the extension | `PIPELINE_VERSION`, `LAYOUT`, `REMOVAL`: the bundle's content versions, in its key (HTML: `RULES_VERSION`, in the per-text key) | the web's deploy. Each paper's bundle is made again on its next open (§18.4). HTML: an extension release | one compile per opened paper. Rows are rebuilt, and the per-text cache answers every unit the change left alone |
| Layout | each reader, at draw time | the rule set, `rules/layout-rules.json` (§18.5) | `RULES_SCHEMA` (the shape and how the engine reads it) and the set's `version` (the values) | publishing: both readers take it on their next load | none |
| Translation | each reader (the extension), the translation workflow (the web) | engine code: `translate/mt.mjs` (`serialize`, `rehydrate`, the wires, `translateUnits`), `translate/kept.mjs` and `keptFor`, `translate/groups.mjs` `decideGroups` and `NAMES_SHARE`, `batchesOf`; and, held by each reader, the paper's context sent with every batch (`paperContext`) | `TRANSLATE_VERSION` (`translate/version.mjs`) | the next release of each reader's engine. Rows of the old version are translated again on open | the rows. The per-text cache holds the translator's raw answers, so the translator is asked again only for texts that changed |

The edge cases, decided:

- **`NAMES_SHARE` (a table's groups)** is a translation rule. The workflow decides groups, and the rows a reader gets hold the decision (`state: 'kept'`), not the cells' translations. Making it a layout rule would mean rows that carry every kept cell's translation, for a threshold measured once.
- **`authorsTranslated`** decides which units a target sends, so it is a translation rule and lives in `translate/kept.mjs`, apart from the TeX path's `scripts.mjs`.
- **Float labels and babel's names** (the names a language gives a figure, a table and each generated heading: Abstract, References, Contents, …, and whether to use them) are layout: one language's choice at draw time. Where each name stands is extraction: the layout marks wrap the name macros' text and the layout file locates each occurrence (D1a). The layer draws the target's word wherever TeX identified the heading: by its macro, by a style's literal through the definition it sits in, and after the paper's own `\selectlanguage`; what a compile of the translation sets there (`captionsOf`) decides float labels alone (the ruling on D1a). A name TeX sets right before a unit on its first line (IEEEtran's run-in "Abstract—") is that unit's lead, flowed with its translation whatever its width, the original's joint and glue after it. **The parked final's requirement:** if the TeX page program returns, it must name the same headings: rewrite a literal the marks wrap to its macro (`\abstractname`), and apply the target's captions again after the paper's own language switch. **Hyphenation** (which patterns a target uses, and their minimums) is layout; the pattern files are assets the host serves, and the algorithms are code.
- **The font roles** (which CJK family and weights a script takes) are layout. The face catalog (files, licences, size corrections, coverage) and the Latin design table are facts about files and stay code. **A CJK script is drawn at Regular, and Bold for bold, beside every English family** (the maintainer's ruling of 2026-10-29, on crops of four papers, `research/babeldoc-typography-2026-10-29/weight/`): Light, and SemiBold for bold, beside Computer Modern and Garamond read lighter than the page they sit in and than BabelDOC's Source Han Serif Regular, by 9 % of the original's stroke on 2608.16117v1's six blocks (0.86 of it against Regular's 0.95, at the canvas's weight); the rule (`cjkFaces.light`) and the eight Light and SemiBold faces went (`RULES_SCHEMA` 6, §18.2; engines of schema 5 keep the last set published for it, §18.3). **A CJK italic run is the body's own face slanted** (the owner's ruling of 2026-10-19, Q17's row 3), in zh, zh-Hant, ja and ko alike: the same face, size correction and weight as the upright, sheared 13° about its baseline as it is drawn (an SVG skew, `layer-proto/fonts.mjs` `CJK_SLANT_DEG`, the one number; 10° was the other the owner saw). A bold italic run is the bold face sheared, no longer the bold upright. No file is fetched for it and no face is made: the run is measured in the upright's own font string, so its advance and every character's place are the upright's. The rule set's `cjkFaces.kai`, which no engine read after this ruling, went with the light designs at schema 6 (§18.2): the engines readers held before it, which draw emphasis in it, read schema 5 and keep their schema-5 set (§18.3), so no set of schema 6 names it.
  - **Measured** (Chromium, dpr 2, 44 px): the shear against the outlines sheared in the file, the Oblique 13 faces the owner judged, overlap 98.1 to 99.4 % of their ink (IoU), 0.1 to 0.8 % of the ink pixels more than a quarter apart, all at glyph edges (zh regular and bold, ja, ko).
  - **Row 2, kept for later versions** (no code): the Kai matched to the body by measurement. FandolKai (zh): its ideographs' mean ink box 0.828 × 0.848 em against the body's 0.890 × 0.910, a size factor of 1.074; ink per em² 0.135 against 0.183 (−26 %), made up by an SVG stroke at drawing time. AR PL KaitiM Big5 (bkai00mp, zh-Hant): 0.821 × 0.823 against Source Han Serif TC's 0.891 × 0.913, a factor of 1.098; ink 0.155 against 0.200 (−22 %). Its limits: Chinese only (ja and ko still get no italic); the factors are per font; the stroke only emulates weight; there is no bold Kai, so bold italic stays bold upright. The comparison page as the owner saw it, rows 1 to 4 in all four languages with their measures and licences, and its README: `~/Downloads/readarxiv-test/archive/cjk-italic-2026-10-19/` (`index.html`, `README.md`), on the maintainer's machine.
- **`textless`** is extraction, but v0 also applies it at draw time to a unit's source (only the alignment fallback reads it). A reader applying an extraction rule to a bundle's content is a defect class; it is listed for the debt pass.
- **Cell membership** (`groupOf`, from `tableGrid`) is extraction: the bundle carries each cell's place.
- **A unit's alignment** (whether its lines are centred) is extraction, and TeX's own: the marked original writes, for a unit's or a heading's end mark, the stretch of `\leftskip`, `\rightskip` and `\parfillskip` its paragraph was broken with, read once the paragraph ended (`AXT-ALIGN`, `layout/marks.mjs` `readAlign`: centred, flush left, flush right or justified; `{\centering text}` and a blank line is justified, its group closed before its paragraph ended), and the layout maker sets `UNIT_FLAG.CENTRED` from it. A unit TeX set in a box (a one-line caption `\@makecaption` centres, `\centerline`) or whose line the log lacks is read from arXiv's lines instead: every line's centre on its column's (the text block's for a full-width row), one line short of it by more than an em; and a one-line paragraph TeX set justified that its own glue centres (`\noindent\hfill X\hfill\null`) is centred where its line is on its column's middle and more than two ems off both edges. The layer draws by the flag. A table cell, which the probe does not read, it decides by the cell's own lines (several centred: a makecell's) or its table's column on the page (a single line: centred where the column's cells' middles are all within 2 pt of each other and their widths are not, so a column whose cells share a start or an end never is; a cell its column cannot decide, alone in it, a header's or of widths alike, as the layout file's flag says); a unit of a part with no layout by its lines and the page's column, as before the file had a flag (2026-10-19: the layer's own guess had centred 1810.04805's "C.1" and "5.3" headings and missed IEEEtran's centred ones).
- **A placeholder's colour** (its glyphs' fill: hyperref's coloured links and citations, a coloured formula) is extraction: the layout file's placeholder row ends with the colour more than half its inked glyphs are filled with, where that is not black (`0xRRGGBB`; `MIXED_FILL`, -1, where no one colour holds more than half), read from arXiv's operator list (`layout/ink.mjs`, every colour space as PDF.js turns it to RGB; a pattern's fill counts as none).
- **A character's colour** is an attribute of the original's glyphs, as its font is (E1 of the residuals' batch R2, 2026-10-19). Each text item of a page's draw carries its characters' fills (`layout/fills.mjs` `itemFills`: the glyphs of the page's ink on the item's baseline within its extent, read in order as the item's own text; an item they do not spell exactly — turned, a glyph too many or too few, a combined accent set as two glyphs, a right-to-left run — tells none, nor does a Type 3 glyph whose procedure paints its own colours), and a page read live tells the same from the list PDF.js drew it by, its render's or its early pixel read's, with no second parse: a walk of the glyphs alone, `LIVE_FILLS_MS` at most, past which the page tells none (`run.mjs` `liveFillsOf`, with the host's `OPS`). The reader's character holds it as `st.fill`. The drawing reads it three ways. A unit's base weight, slant, small capitals, family and colour are those most of its matched glyphs hold outside every piece that may set that attribute (a style pair or switch in any spelling, `{\bf …}` too; a colour piece, a link, a paper's own macro), and of all its glyphs only where none lies outside; a tie goes to regular, upright, serif and black, else to the unit's first glyph (`layer2.mjs` `measuredStyle`). A glyph's slant is read as it would be without the `\emph` and `\em` toggles around it, so that a unit wholly inside one is drawn as the original. A piece that may set colour and that no `colours` row tells takes its own glyphs' colour; a row (TeX's, PR-C) wins. A unit read without its source pieces (a lab record, not a reader's) keeps the reading before: the majority, its groups' share taken off (`baseOf`), and a colour only where every glyph whose fill is told holds the same one. A rendering of the page's own characters (a citation, a reference, an equation's number) is drawn in runs of its characters' fills: `[16]` keeps its black brackets and blue digits. The placeholder's row fill above stays only for a character whose fill is not told. Word-level colour inside a sentence stays a limit: no majority paints a unit. On the wire, a styled pair whose two ends stand where the wire is cut anyway (a forced break, a display or an item beside it, never an inline formula, which the translator moves as a word; a kept pair's edge; the unit's end) keeps its markers (`translate/mt.mjs` `classOf`, the boundary rule). The draw's item rows carry the fills as their tenth value (`BUNDLE5` `'7'`); the boundary rule raises `TRANSLATE_VERSION` to `'4'` and `PIPELINE_VERSION` to `'22'`, whose copies carry every unit whose wire it leaves alone (`mt.mjs` `boundaryChanges`): over 137 papers' sources 126 of 36,136 units, in 29 papers, are asked again.
- **A unit's size and its small capitals, where NFSS fakes them** (the owner's report of 2026-10-24 on staging: 2602.23285v2's appendix headings, page 15, drawn far smaller than the original in zh, es and de, and in es and de with no small capitals) are read from the original's glyphs as its other attributes are. The Times family has no small capitals of its own, nor have PSNFSS's other base-35 families: NFSS sets `\scshape` in a virtual face (`ptmrc8t` and its kind) that draws each lowercase letter as the upright face's capital at 0.8 of the size, in the same PDF font as the capitals, so that no font name says small capitals, and the `\sc` of a class's heading (ICLR's and ICML's subsections, IEEEtran's sections and table captions) is in no piece of the unit's source. The alignment pairs each page letter with the source letter it spells (case-blind): a capital paired with a lowercase source letter, set at most `SMALL_CAPS_SHARE` (0.9) of the median size of the unit's letters and digits whose case TeX kept, is a faked small capital (`layer2.mjs` `smallCapsOf`), and their median size over the capitals' is the share the unit sets them at (`capsRatio`, to the hundredth: 0.80 on 1711 of the 1747 faked capitals of the 32 papers of the corpus that set any, 0.71 on the other 36, one table's at 7 pt in 2608.27181; a unit's own, never a paper's). The unit's size is the median of its glyphs with those set aside: its capitals', the size TeX was asked for (2602.23285v2's "A.2 DYNAMIC SPECTRAL GRAPH STRUCTURE", 21 of its 25 letters at 7.97 pt, is read at 9.96 where it was read at 7.97, the median its small capitals made). It is set in small capitals where most of its glyphs that can tell say so (`capsVote`: a faked small capital says so, a lowercase source letter drawn as itself says not, and where the unit has faked ones a capital or a digit of a face that names no small capitals says nothing, since NFSS draws it alike in either shape), of the glyphs outside every piece that may set them as `measuredStyle` reads every attribute; a unit read without its source pieces (the gate's, the lab's) of all its letters, its `\textsc` groups' share taken off as `baseOf` takes off its other groups'. A capital paired with a lowercase source letter at the others' size is a capital of the text's: a class's `\MakeTextUppercase` (REVTeX's section titles, 2610.21288v1's "I. INTRODUCTION", drawn "I. INTRODUCCIÓN" in Spanish where it was "Introducción"), the unit set in them (`upper`) where most of its letters that can tell are, and its translation drawn in the target's capitals at its size. A face of real small capitals (cmcsc10, LM Roman Caps, a face with an SC name) draws its lowercase letters as themselves, and a unit with no letter of the source's own case to read the sizes against reads as before. In a CJK target, which has no case, a unit set in small capitals is laid at its nominal size × `CJK_CAPS_SIZE` (`layer2.mjs` `unitSizeOf`; 1, the owner's of 2026-10-24).
- **Small capitals the layer draws itself, and capitals.** A run in small capitals in a face with none of its own (no smcp feature: Nimbus Roman, Nimbus Sans, FreeMono; `rules/font-roles.mjs` `ownSmallCaps`) is drawn as NFSS's virtual faces draw it: each lowercase letter as the face's capital at the unit's `capsRatio` of the size, `SMALL_CAPS_RATIO` (0.8) where its page tells none (a face of real small capitals the target's face has none of), the other characters as they are; each run of one case is a token of its own, glued to the one before and never hyphenated, measured in the face with no small capitals asked of it as it is drawn, a `<tspan>` at its share of the size (`layer2.mjs` `caseRuns`, `selfCaps`; `lineRuns`' `sc`, which `svgOfUnit`, `runEdge`, `lineExtent` and the breaker's cut read). Case is each character's, whatever its script, in the target's own case mapping (`upperOf`, `toLocaleUpperCase` of the target, the root's for a code no locale reads, never the device's: Turkish i to İ and ı to I, German ß to SS measured as the expanded capitals, Greek's tonos dropped, Lithuanian's dot above dropped after i, a mark with its letter): a Latin word inside a CJK translation takes its own small capitals or capitals, a CJK character, Arabic, Devanagari and Thai none, a digit or a mark is drawn as it is. A rendering of the page's own characters keeps the small capitals its page sets (a macro's text in faked small capitals, which the PDF's text gives in capitals: a capital the page sets at most `SMALL_CAPS_SHARE` of the unit's size is drawn as a small one, `smallCapsAt`; 2602.23285v2's `\method`, "ODEBRAIN" in typewriter capitals at the text's size, is drawn as it is), a formula's text takes neither small capitals nor capitals, and a babel name in a face of real small capitals is drawn as a run is (`nameRuns`). No rule asks a browser to synthesize any (`capsRule`): synthesized, they were each browser's, Chromium's at 0.7 of the size (Nimbus Roman's "Discusión: perspectivas clave" at 20 px, 237.31 px), Firefox's at 0.8 (266.93), WebKit's at two widths (its SVG 241.57, its canvas 237.30), where the layer's own are 266.91 in all three. A face's smcp feature draws its own (Libertine, CMU, XCharter and the other faces `METRICS` says have one), and Latin Modern's caps face, whose letters are its small capitals, is asked none (`capsLetters`, `fonts.mjs`), so that it is measured as it is drawn: asked them, the canvas measured capitals it synthesized, 1125 against the 1187 px it drew. `tests/e2e/layer-small-caps.mjs` (`pnpm e2e:small-caps`) lays and draws ICLR's heading in Spanish, German and Russian, a paragraph's `\textsc` run and a REVTeX heading in capitals in Chromium, Firefox and WebKit: each run's glyphs are drawn as wide as they were measured (within 0.02 px and a sixtieth of a pixel a glyph, Firefox's unit; WebKit's `getComputedTextLength` gives a run unkerned though it draws it kerned, so the test reads `getSubStringLength`), and every item is laid at the same place in the three (within 0.00002 PDF units in the role table's faces). Measured on the gate pack (13785c79, 32 outputs, the model tier in the rules gate's configuration, base `next` 3713cf45, and 5e723185 before it alike): no measure worse and no page moved; the units' own records (`--dump`) move in 2608.04322v1 alone, against `next` its section headings at 7.97 to 9.96 pt and its table captions at 6.38 to 7.97 (84 units on 63 pages of its 7 outputs), against the first step of this change, which left the browser to synthesize them, 60 of those, their small capitals at 0.8 where Chromium set 0.7, two captions a line longer (de, fr); over those 7 outputs the pixel tier's translated share rises from 82.7 % to 83.3 % and its lost-ink regions fall from 29 to 28, as at the first step. No unit of the other 25 outputs moved (none in Latin Modern's caps face, none in capitals of the text's). A limit, the front end's: an explicit `\MakeUppercase{…}` (`\MakeTextUppercase`, `\uppercase`) in a unit's source is one placeholder of `source/latex-front.mjs`, its words left the original's, and `\section{\MakeUppercase{Related Work}}` makes no unit at all; none of the 37 930 units of the 158 local sources holds one.
- **A translator's stutter** (a word of five letters or more written twice in a row where the unit's source sets no word twice: Microsoft's "konformen konformen" in 2608.16117's German abstract, the M1 survey) is layout: `layer-proto/stutter.mjs`, applied where a unit's text becomes tokens (`layer2.mjs tokensOf2`), so every host's rows and every cached translation are drawn with the word once, and the rows, the cache and the plain text the sentence offsets count in keep the translation as it came (the word table keeps each drawn word's place in it). It bumps nothing (§18.3); making it a translation rule would raise `TRANSLATE_VERSION` and translate every unit again for a defect of three units in the 31 outputs measured. Only alphabetic scripts that set words apart by spaces: a CJK or Thai repeat is not this rule's.

### 18.2 The identities

| Identity | Kind | Covers | Enters | A bump means |
|---|---|---|---|---|
| `BUNDLE` (web `'1'`, engine `'3'`: the layout file's schema 3, the paper's `\lineskip` and `\lineskiplimit`; 2 its babel names, D1a. The file's schemas 4 (`PH_FLAG.JOINED` and `PH_FLAG.OUTSIDE`) and 5 (a found placeholder's fill, its row's last number where its glyphs are not black: 0xRRGGBB, or -1 where no one colour holds more than half of them) are not yet a contract of their own: `b3` names schemas 3 to 5, each reader's `parseLayout` refusing the others', so only this engine's reader reads a `b3` bundle holding schema 5. The web's pin does not move before `BUNDLE` 4 lands; M1 moves it with `BUNDLE` 4) | reader contract | everything a reader parses: the bundle's shape, the units' tuple, kinds and flags, the layout file's schema, the manifest's schema, the left geometry | the request (§18.4) and the R2 key | readers older than it get `unknown-versions` until they update |
| `PDFJS` | reader contract | the PDF.js whose reading the layout and the wrap are made against | as `BUNDLE` | as `BUNDLE` |
| `PIPELINE_VERSION` | extraction | the units' cutting, kinds and texts, the cells' places, the left side's marks. **Not** the wire, its reading back or the paper's context, though it is raised with `TRANSLATE_VERSION` while the extension's stored copies are judged by it alone (`translate/version.mjs`; 22 and 23 so) | the R2 key; the rows' identities | bundles made again lazily; rows again |
| `LAYOUT`, `REMOVAL` (`pipeline/versions.mjs`, `'8'`: no add-on, a part's or a bundle's cell rules in its place, our page wrapped by optional content, §11.8, §19.9; 7 the text-removed PDF's add-on) | extraction | the layout maker; how a drawn unit's ink is taken away | the R2 key | bundles made again lazily |
| `TRANSLATE_VERSION` (`translate/version.mjs`, `'5'`: a display's own stop written after its marker and taken off the reply; `'4'`: a styled pair whose two ends stand where the wire has a marker anyway keeps its markers; `'3'`: a sentence whose words change style sent whole, the pairs inside it on no wire; `'2'`: a formula split across inline formulas sent as one marker) | translation | `serialize`, the three wires, `rehydrate` (strict and tolerant), `translateUnits`' fallbacks, `keptFor` and `authorsTranslated`, `decideGroups` and `NAMES_SHARE`, `batchesOf`, and the paper's context each reader builds (`paperContext`: the extension's is `session/translate.mjs`, the web has its own, since it cuts the abstract as the HTML page does, which the engine does not hold) | the web's translation identity, the extension's rows cache, never a bundle key | rows translated again on open |
| `RULES_SCHEMA` (`rules/layout.mjs`, `6`: `cjkFaces` holds its group alone, a CJK script drawn at Regular and Bold beside every English family, its `light` designs and its unread `kai` gone, the ruling of 2026-10-29; 5 before it: `fillLeadRel` added, the fill's top relative to the original's pitch; 4: `adaptiveFill.band` read against the page's own paragraphs, 1b-C) | layout | the rule set's fields, ranges and how the engine reads them | the rules route (`/s<n>`) | a new pointer; engines of the old schema keep the last set published for it |
| the set's `version` | layout | the values | its immutable URL | readers take it on their next load |
| `RULES_VERSION` (`src/core/rules/latexml.ts`) | HTML extraction | the HTML page's rule file | the HTML page's per-text key only | as DESIGN §5.5 |
| `TYPESETTING_VERSION` (`live.mjs`) | parked | the compile path | parked records | none |

- **The web's translation identity** is `axt-tr/2|<paper>|v<version>|<target>|<chain>|p<PIPELINE>|t<TRANSLATE>|b<BUNDLE>`, with no `r<RULES>`: the rules of the HTML page cut none of a PDF's units.
- **The background's per-text key** keeps `RULES_VERSION` for the HTML page's blocks only; a PDF text's key holds none (`cache/key.ts` `CacheSource`, named by every cache descriptor and `CACHE_KEY_VERSION` still 6: no HTML key changed, and a PDF text's old entries are no key of the new ones). The cache holds the translator's raw answer to a text, which no rule of reading changes.
- **A file is refused by its schema, never by its maker.** `parseLayout` refuses a layout file whose `schema` is not 5 (4 before a found placeholder's row ended with its glyphs' fill, 2026-10-19; 3 before a display group's later displays were written `JOINED`, their ink the group's first display's, and a LOST piece outside its unit's lines `OUTSIDE`, the LOST survey of 2026-10-15; 2 before the paper's `\lineskip` and `\lineskiplimit`, 1 before the babel names, D1a) (the add-on's manifest, refused by its own `schema` the same way, went with REMOVAL 8); the file's `layout` is read for its shape (a version token) and never compared, so a reader opens what a newer maker wrote. A change of the file's fields, bounds or meaning raises its `schema` and `BUNDLE`, not `LAYOUT` or `REMOVAL` — but the layout file's schemas 4 and 5 did not raise `BUNDLE` (the controller's ruling of 2026-10-15: the next `BUNDLE`, 4, is the pipeline lane's new wire). This breaks the contract's promise for `b3`: a released reader of schema 3 asking `b3` of content this engine makes would refuse it whole, as `parseLayout` refuses any schema but its own. It holds only because no released reader asks for such content: the web's pin does not move before `BUNDLE` 4 lands, and moves with it (M1).

### 18.3 Bump rules

- **A change of a value in the rule set** raises `version` by one. Nothing else moves.
- **A field added, removed or renamed, a range or enumeration changed, or the engine reading a field differently** raises `RULES_SCHEMA`.
  - The new schema publishes under `s<n+1>`, and `s<n>`'s pointer stays at its last set.
  - A newer engine's built-in carries the new field, and the published set gains it in the same pull request.
- **Adding a language:** the published set gains its entry first. Engines that do not offer it ignore it. The engine that offers it follows.
- **A drawing code change that keeps every field's meaning** bumps nothing. The layer gate measures it, and the live-engines check guards each published set on the engines that read it.
- **Extraction and translation changes** bump their identity as §18.2 says. A change that touches two kinds bumps both.
- **A unit cut that moves raises `PIPELINE_VERSION`**, whatever else it leaves alone: a stored translation is found again by an
  identity naming the pipeline, and one made for the old cut given to the new one names pieces it does not have (#435 re-cut
  2610.19860's `\url{…}` from seven pieces to five under PIPELINE 25; staging gave unit 176 its old row, which the door dropped,
  and the unit stayed English). `tests/pdf-reader/unit-cut.test.ts` holds it mechanically: each unit's kind and its pieces'
  types over a few sources the repository keeps (the sample paper; 2610.19860's llncs `\url`), recorded with the
  `PIPELINE_VERSION` they were recorded under (`golden/unit-cut.json`). The cut moving under the same version fails, and so does
  the version moving with the cut not recorded again; `WRITE_UNIT_CUT=1` records it, and refuses while the cut moved and the
  version did not.
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
| `order` | script | fit | an ordering of track, borrow, lead, shrink | The order in which the fit turns its knobs when a translation does not fit: tracking, borrowing free space below, the leading, the size. |
| `leadBase` | script | fit | 0.8 to 2, step 0.05 | The translation's line pitch, × the original's line pitch. |
| `leadFloor` | script | fit | 0.8 to 2, step 0.05 | The tightest line pitch the fit falls back to, × the original's. |
| `leadRel` | script | fit | yes or no | Whether the leading is taken relative to the original's own pitch (never stacked on a loose original's) or applied as it is. |
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
| `adaptiveFill` | script | fit | band, track, size; or none | Spreading each unit's lines over its original's space, the page's body units to one leading and one size, the leading within a band of the page's own paragraphs' (D6, page by page); empty keeps the script's leading on the original's pitch alone (B). |
| `fillLead` | script | fit | 1 to 3, step 0.05, or none | The loosest line pitch the fill spreads a unit's lines to, in em of the size it is drawn at; empty: the original's own pitch. |
| `fillLeadRel` | script | fit | 1 to 3, step 0.05, or none | The loosest line pitch the fill spreads a unit's lines to, as a multiple of the original's own pitch, where that is looser than the pitch above; empty: the pitch above alone. |
| `leftover` | script | fit | `foot`, `pack` | Where what the fill leaves over goes: at each paragraph's foot, or packed to the end of its run of paragraphs, each keeping the original's gap to the one above it. |
| `keepAll` | script | breaking | yes or no | Whether lines break only at spaces (Korean and the alphabets) rather than between any two CJK characters. |
| `cjkQuotes` | script | breaking | yes or no | Whether curly quotes, dashes, the ellipsis and the middle dot are set as CJK characters. |
| `noStart` | script | breaking | a list of characters | The characters no line starts with. |
| `noEnd` | script | breaking | a list of characters | The characters no line ends with. |
| `hyphen` | script | breaking | `0`, `1` | Whether a Latin word is hyphenated at a line's end (1) or not (0). |
| `latinPatterns` | script | breaking | `en`, `de` | The hyphenation patterns a Latin word uses. |
| `cellClear` | script | cells | 0 to 5, step 0.1 | The room kept between a table cell's text and a rule over or under it, in PDF units. |
| `cellCapMin` | script | cells | 0.3 to 1, step 0.05 | The smallest share of the size a cell's text may be capped to between its rules. |
| `cjkFaces` | script | faces | group; or none | The CJK family the script is drawn in, at Regular and Bold; empty for an alphabet. |
| `labels` | language | labels | figure, table, abstract, ref, bib, contents, listfigure, listtable, appendix, index, proof, preface, glossary; or none | A float's label and each generated heading babel names (Abstract, References, Contents, …) in this language's words; an empty word, or none, keeps the original's. |
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

### 18.7 Layout decisions of 2026-10-23

Decisions made by the maintainer by looking at crops, and what they changed. The drawing code reads them at read time: none moves a version token (§18.1), and `RULES_SCHEMA` rises only for the field the fill rule adds.

**A Chinese or Japanese line breaks before an inline formula (PR #438).** After a CJK character or mark a formula crop no longer glues to it: a script that breaks between CJK characters (`keepAll` false) may end the line before the crop, as xeCJK's `\CJKecglue` allows. A mark no line ends with (an opening bracket), a lead's end and a kern stay glued.

**A letter-spaced line squeezes (PR #438).** A line takes the group it misses only when, without it, it would stretch more than `STRETCH_MIN` = 0.05 em a gap, the overflow is at most what it can give, and that squeeze a gap is less than the stretch. What it can give: the blank halves of comma-, full-stop- and bracket-type marks, spaces down to `spaceMin`, then `SQUEEZE` = 0.02 em a gap, never past the tracking floor (`trackMin`) and never below the tracking the page fill raised (`fitTrack`). Only marks whose ink sits in one half of the em in every face the layer draws are cut: comma, full stop, enumeration comma, brackets and quotes. Never the colon, the semicolon, `!` or `?`: the CJK face centres them, and a question mark cut by half ran 0.22 em into the next character. Measured on the 53 papers of the release route's sweep: lines more than 0.15 em a gap over their unit's least 403 to 265, ragged CJK lines 625 to 457, the owner's line (2610.10069 page 7, unit 49) 0.194 to 0.022 em a gap. Long formulas stay stretched: no new cap and no new ragged rule.

**The fill's top is relative to the original's pitch for Chinese (`fillLeadRel`).** The fill spreads a unit's lines up to a top; the em top (`fillLead`, 2 em of the size drawn) equals the original's own pitch on a double-spaced original and is below what the frame allows, so the paragraph ended early (2610.11256 page 12, unit 75: 7 lines of 9). The top is now the looser of the em top and `fillLeadRel` = 1.3 times the original's pitch, scaled by the fit's size; 1.3 is the engine's own Chinese `leadBase`, so Chinese reads at the same density as its original. Chosen by the owner by eye on crops, 2026-10-23, over 1.5 and over replacing the em top outright (which tightened 3,035 single-spaced units). Simplified and Traditional Chinese only; Japanese and Korean stay off until measured. Measured on the 53 papers (Chinese): 168 units whose leading shows change by a median of 0.20 pitch (0.36 em), none tighter, none past its frame, no new collision, and a page of single-spaced originals is unchanged. It acts only where the em cap binds: a single-spaced original keeps its top, and the band, tracking, size and the leftover below the paragraph are unchanged. For the same two scripts the halving that finds the loosest leading now tries the top itself (it was left untried when the fraction of a step was under a half, so the unit took neither tracking nor the page's size). With that step more pages grow, and a unit of one line keeps its own size in these scripts: it has no frame to spread over, and a larger size only carries its ink past the original's line (a note under a table's rule, 2610.21924 page 18, whose formulas touched the rule at x1.1).

**A unit split by its displays is laid a run at a time (2026-10-24).** The text between two displays is set on the slots between them alone, so each run of a unit is a text block of its own (the rubric below), and each takes its own state: the first of the fit's states at which its own text fits its own slots (`layer2.mjs` `runsOf`, `layoutRuns`), its size and leading its own, and the page fill fills each run as a unit of the page the unit begins on, the page's target reading the unit once, as one, at its fit as one, so that its neighbours keep the rhythm they had (`run.mjs` `fillUnitsOf`, `fillPass`; voting a run at a time moved 55 of 158 such pages' targets and 64 single-run neighbours); its runs grow with the page's size together, read by the unit's line count (`fillPage`; a run of one line had stayed at 1.0 beside its unit's others at 1.1); filling each run on its own first page was measured and declined ( on 7 Chinese papers, link colours lost 2 to 9 and paragraph ends letter-spaced 4 to 14). A run opens at a display alone: a forced break that opens another frame (tokensOf2's `brk`) keeps its frames in the run, as the unit's own walk sets them. Where a run set larger would carry a token to a later page than the unit's fit set it, the unit is laid as one. The owner's ruling of 2026-10-09 (sizes per unit where some must shrink) is carried to its natural unit: only a cramped run shrinks. Every run fits at the state the unit's fit found, so each comes out there or more naturally. One tracking a paragraph: the walk tightens a run's tracking (and its CJK punctuation's compression) before it shrinks it, so a cramped run came out tighter than a roomy one, and the page fill tracked a roomy run further still; the paragraph read at two letter spacings, its roomy part's last line looser than its own tightest lines (the sweep's (j), paragraph end letter-spaced: 967 rows over 53 papers in Chinese where `next` has 12). Each run is laid again from the tightest tracking any of them needs (`P.runTrack`, the walk's first state), and the page fill gives a unit's runs the least fill tracking any of them takes (`fillPage`); size and leading stay each run's own. The page fill keeps a unit's text on the pages its fit set it (`layer2.mjs` `keepsPages`, read for a unit's runs; read for every unit, it moves 34 more pages of 19 Chinese papers, a change of its own left for later): a looser leading holds fewer lines on a page's frame, and the page cuts (`pageCutsOf`) keep text only from the page before; 2610.21884v1's unit 10 in Chinese, a paragraph over pages 1 and 2, had its last run filled to a leading of 1.61 and a sentence of page 1 drawn at the top of page 2 (the sweep's (i), sentence drawn on another page). 2602.23285v2's unit 35 in Japanese (seven lines, then two after each of two displays) was set at 0.85 throughout because the two lines after eq. 5 held their text from 0.85 alone, its first run five tight lines over two empty ones; it is now 1.0, 1.0 and 0.85, its first run six lines at a leading of 1.1. A unit of one run (no display, or a paragraph over a page break, one run), a table's cell, a unit the fit's further steps set (widened, run past its display, below the floor) and one whose runs do not each fit alone are laid as before, byte for byte, and filled as before: measured over the Chinese sweep set (19 papers traced, 2026-10-24), every page with no line of a unit laid in runs is drawn byte for byte as `next` draws it; the 3 that differ each hold the lines of such a unit begun on the page before (2610.21201v1 page 23, 2610.21026v1 pages 18 and 33). Running the text on past the display was rejected: it moves text across the display, breaking where the paragraph meets its equation. A run's lines carry its size, scale and state (`seg`), which the drawing, the word table, the links and the checker read a line by; the even pass, which sets a page's units at one size, lays a unit as one again.

**Judging a block (the rubric for samples and rulings).** The owner, 2026-10-23: judge per block, not per line. A block is better, the same or worse than its base on three questions. (i) Uniformity inside the block: no line stretched or squeezed out of step with the others. (ii) The block lands in place: each sentence at the right place in its paragraph, paragraph boundaries where the original has them. (iii) Rhythm against its neighbours: leading and density consistent with the page's other blocks. A shift under one pitch counts as the same. Line-level shifts and per-line offsets are normal and are not a verdict.

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
  layout/       file, json, marks, make, paper, ink, carry, match, stream, own, wrap, delta, cell-rules, remove   the layout file, the wrap and the delta (file, json and cell-rules also the readers'; remove the content walk the wrap reads)
  translate/    mt, groups, kept, mixed, version                                    the wires and the units a target keeps: both
  rules/        layout (the rule set and its reader), font-roles, font-coverage, script, arg-roles, latexml-args   both
  layer-proto/  run, reader (the reader's door), bundle, rows, fonts, hyph, visibility, hide, tex, check, layer1, layer2   the drawn layer: the browser
  layer/        pieces, and check (the pixel checker the layer gate's instrument loads)                             the browser
  view/         reader-view, places, layer-side, feed, contents, lighting, highlight, shapes, floats, figures, pointer, sync, overlay, outline, engine.css   the browser
```

What the engine does not hold: the extension's session (`src/pdf-reader/session/`: its host of the view, its run on the
layer, its client of our server, the served faces, its translation client `session/translate.mjs`) and the addresses
(`src/pdf-reader/addresses.ts`); and, parked (`parked/README.md`), the first instant layer (`parked/engine/`) and the
extension's compile client (`parked/extension-compile/`).

### 19.2 The five entries

| Entry | Loads in | What it gives |
|---|---|---|
| `pipeline` | Node (the server) | A paper's source to its units (`openPaper`, `loadProject`, `unpackSource`, `analyze`); the marked original and the probes (`originalFiles`, `probeFiles`, `readingsOf`, `stoppedShort`); the left geometry (`anchors`); the layout marks, the layout maker and its cell rules (`layoutMarksOfPaper`, `makeLayout`, `pageRules`, `checkBoxes`), the wrap (`wrapFinal`); the TeX Live year arXiv's PDF says it was built on, from its pdfTeX banner and before any compile (`texLiveOfPdf(doc)`: the `PTEX.Fullbanner` of the Info dictionary PDF.js resolves from the trailer, never a scan of the bytes, else null); the page pass, a paper's layer told a part at a time (`layerOfPaper`, §19.6), and its cut (`partCutter`, `wholeCutter`, `cutBundle`); the layout file and the add-on's manifest, with their caps; the bundle's writer (`writeBundle`, `bundleUnitsOf`); the faces' coverage; `PIPELINE_VERSION`, `PDFJS`. Not the compile path's typesetting, strategies or cache, and not `runLive`. |
| `translate` | Node and browser | The wires a unit goes out as and the reading back (`serialize`, `rehydrate`, `serializeTags`, `rehydrateTags`, `translateUnits`, the sentences, the batches); the table groups (`decideGroups`, `groupOf`); the units a target keeps (`authorsTranslated`); the rows (`rowOf`, `unitOf`, `layerRows`, `toTranslate`, `batchesOf`, `runRows`); `TRANSLATE_VERSION`. No DOM, no network. |
| `rules` | Node and browser | The layout rule set and its reader (`readRules`, `parseRules`, `resolveRules`, `BUILTIN_RULES`, `RULES_SCHEMA`, `RULES_CAP`, `TARGETS`), the font roles (`FACES`, `rolesFor`, `faceFor`, `familyOfFonts`) and the script of a tag (`scriptOf`). |
| `layer` | browser | The reader's door whole (`layer-proto/reader.mjs`): `openLayer`, `firstFaceOf`, `readBundle` and its caps and refusal, `BUNDLE`, `CTAG`, `VTAG`, `parseLayout`, `indexLayout`, `parseAddonManifest`, the rows' helpers it takes. |
| `view` | browser | The reading view both readers run (`createReaderView`, §11.7, and its types) and its layer side (`createLayerSide`, `PAGE_MS`, §11.8), what is lit under the pointer (`highlight`, `floats`, `figures`, `pointer`), the synchronised scrolling (`sync`), the overlays kept through a zoom (`overlay`) and the outline. |

### 19.3 What holds

- **Imports.** A whitelist, applied to every file of the engine (modules, TypeScript and declaration files) and to every way
  a module is named: a value import or a type one, `export … from`, `import(…)`, `require(…)` and `new URL(…, import.meta.url)`.
  A file of the engine names a module by relative path, to the engine's own files, `src/core/sentences`,
  `src/core/protector/tokens`, `src/core/names` or `src/core/protector/math-runs`; or a `node:` module; or, in `rules/`, the layout rules' validator
  (`zod/mini`). Nothing else: no alias (refused for its spelling), no build setting's name (`#imports`), no root-absolute
  path, no other package, no module of the extension, and no specifier that is computed. A TypeScript file is reached by its
  extension, which Node reads with its own type stripping; the closure behind the four core modules is those four files.
- **Loading.** `pipeline`, `translate` and `rules` load in plain Node with no bundler (a child process in the contract test);
  `layer` and `view` load in a browser's environment. The closures of `translate`, `rules`, `layer` and `view` hold none of the
  server's modules (the front end, the compile path, the layout maker, the marks, the ownership and the wrap). The
  `pipeline` entry's names leave the compile path out, but its closure still loads `cache`, `scripts` and `typeset/*` through
  `live.mjs`; PR 5 splits `live.mjs` into the paper's pipeline and the compile run before that path is parked.
- **Licence.** No file in the closure of the five entries states that it is ported from a reference project or a scoped
  package (the web's R21 detector, `portedInClosure`). The shared interface (`controller.ts`, `src/pdf-reader/ui/**`,
  `src/ui/controls/**`) reaches four GPL-ported files today, by one import each: `src/config/languages.ts` (the language
  table), `src/providers/microsoft.ts`, `src/providers/prompt-library.ts` and `src/providers/request/retry-policy.ts`. The
  web imports `controller.ts` and `src/pdf-reader/ui/**` through its pin today and replaces modules by its own seams (an
  importer-scoped alias: `@/config/languages` and `pdf-reader/ui/languages` are its own files), so it must carry none of the
  four in its bundle: each is either replaced by a web seam or not imported, which the web's own R21 gate checks. That holds
  until Task 7 cuts the four from the shared interface's closure (the `ReaderHost` seams). The test pins the four as a list
  that may shrink and never grow.
- **Notices.** What the web carries with the engine and the shared interface: the LaTeXML acknowledgement now
  (`rules/latexml-args.mjs` is in the closures of `pipeline` and `layer`; `docs/THIRD_PARTY.md` has its row), and Lucide (ISC)
  and Noto Sans SC (OFL) with the shared interface (the icons of `src/ui/controls/Icon.tsx`, the glyphs of
  `src/pdf-reader/ui/display-glyphs.ts`).
- **Reached.** Every module of the engine is reached by an entry, by the checker the layer gate names, or by a file under
  `src/` or `lab/` outside the engine (`unreached`: the shipped extension and every file of the lab, its bench and spikes, not
  only its kept gates); a module only a test or a script reaches is parked with its tests.
- **Versions.** The identities of §18 move with the code that owns them; a change of an entry's names is made on purpose, by
  recording `engine-contract.json` again (`WRITE_CONTRACT=1 pnpm vitest run tests/pdf-reader/engine-contract.test.ts`), and
  the web sees it as a change of the surface it pins.
- **Behaviour.** `tests/pdf-reader/engine-golden.test.ts` holds, as SHA-256 values, what the engine makes of inputs the
  repository wrote itself (units, wires, the files of every compile, the bundle, the layout file, the rows). A move or a refactor leaves every hash as it is.

### 19.4 The layer API, as the web defines it

The routes are the web's, `/api/v1/` kept for every released extension; the engine holds the format both readers parse and the
tags they ask by (`layer-proto/bundle.mjs`).

- **One file per paper version.** The bundle is a single JSON file: `{ schema, paper { id, version, pages }, base { bytes,
  sha256, url }, versions { bundle, pipeline, layout, removal, pdfjs, image }, units, left, layout | null, rules | null }` (`rules`: the
  table rules near each page's cells, `{ "<page>": [x0, y0, x1, y1, …] }`, where the layout file is; the add-on it carried
  before REMOVAL 8 is gone). Both readers parse it with `readBundle(json, caps)` after the byte cap (`BUNDLE_CAP`) and the value count
  (`BUNDLE_VALUES`) are checked before `JSON.parse`; a refused bundle draws no layer, a refused unit is dropped and counted, a
  layout of `null` draws nothing (the layer draws only from the layout file: every unit stays the original's). Over arXiv's
  PDF (BUNDLE 3's base) no unit has a group, so every unit stays the original's too (§11.8).
- **Routes by tag.** `GET /api/v1/layer/<id>v<n>/<tag>` answers 200 with the bundle, 202 `Preparing { position, stage,
  progress, retryAfterMs }`, 404 `{ why }` (`not-prepared`, `no-source`, `no-pdf`, `cannot-prepare`, `unknown-versions`) or 429
  `{ retryAfterMs }`; `POST …/<tag>/prepare` (JSON body `{}`) answers 202, 200 `{ ready: true }`, 404 or 429; `GET
  /api/v1/original/<id>v<n>` is `base.url`, our copy of arXiv's bytes; `GET /api/v1/base/<id>v<n>/<sha256>` (no suffix) is our
  base page a head of ours names (§19.7), by its digest, by ranges, a strong `ETag`, any origin, immutable; a head held as a delta (§19.8) names no
  such page: its delta is a bundle object, `GET /api/v1/layer/<id>v<n>/<ctag>/o/<sha256>` as bytes (`application/octet-stream`), and its
  composed document reads `/api/v1/original` by ranges. The tag is the engine's `VTAG`, or its contract
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
request for an entry's change, made here with its test, not an import by path. The shared interface it imports besides
(`controller.ts`, `src/pdf-reader/ui/**`) stays under the licence rule of section 19.3: the four ported files are replaced by
its seams or left out of its bundle until they are cut from it.

### 19.6 The page pass

`layerOfPaper` (`pipeline/page-pass.mjs`, in the `pipeline` entry) makes a paper's layer (bundle 4) from its marks and arXiv's
PDF and tells it to its host a part at a time: the left (anchored on arXiv's tokens under the unit marks), the layout file
(`makeLayout`'s, each page's operator list read once for the maker and its cell rules) and the cut (`partCutter`, `cutBundle`'s
own), each part carrying its pages' cell rules (`rules`).

- **In.** `paper { id, version }`; `source` (`openPaper`'s); `marks` (`layoutMarksOfPaper`'s: `{ marks, unitMarks }` or
  `{ refused }`), or `marked { doc, log, options }` (the marked original, read by the pass a page at a time); `arxiv { doc,
  text? }` (a PDF.js document of arXiv's PDF, the caller's to open and destroy, and its text as `readArxivText` read it, else
  read here: the left's); `ours` (our base page, §19.7: `{ doc, bytes, sha256, xref, check }`, or the final pass's refusal, or
  null), `orig { bytes, sha256 }` (arXiv's PDF beside it) and `tree` (the TeX Live year it was made on); `base { bytes, sha256,
  xref }` alone is a host of BUNDLE 7's, whose paper falls back (`final`); `OPS`; `pdfjs`; `image`;
  `rules` (`DEFAULT_RULES` where not given: rules 1, 3 and 4, the page stream; `WHOLE_RULES`, next's whole run), `whole`
  (the whole made first, whatever the rules), and `frame`, `columns` (read under the whole run's rules); `verdicts`
  (default on).
- **Out, in order.** `onHead(head, chunks)`, then for each part its left parts (`onLeft`) and the part (`onPart(part, note)`),
  each awaited; `note` is `{ pages, layout: 'kept' | 'none' | { refused, … }, lines: [in place, total] }` (the lines of its
  pages in place on arXiv's PDF: information). It returns
  `{ through, count, stats }`, or `{ refused: 'anchors', why }` before anything is told.
- **Per part.** Each part is judged as it is cut (`verdicts`): its own reader taking it (`readPart` against the head, the
  chunks and the parts before); a part refused is its pages with no layout (C1.4: drawn from the left), never the paper's
  refusal. No share of a part's lines judges it: each unit is judged by its own lines (the page and line check, below). Every bound a part holds is the
  part's (`LINES_ALL`, `PAGE_TEXT_ALL`, `NAMES_MAX`, `FONTS_MAX`, the part's caps): an over-bound part is shortened, a first page
  alone past them has no layout, nothing is truncated. A page whose operator list passes `OPS_CAP` operations, whose walk
  passes `STEPS_MAX` steps, `STACK_MAX` levels or `GLYPHS_PAGE` glyphs (one operation's glyphs and placements counted within
  it), or whose list does not come within `OPS_MS` or walk within its backstop `INK_MS`, is dark (its units stay the
  original's), that page alone, whatever the pages before it: no count of pages given up on darkens a later page, and a marked
  page whose carry passes `PAGE_WORK` carries none of its lines, that page alone. A page past `BOXES_PAGE` boxes is not dark:
  its boxes past the budget are merged by cell (`degraded`, its text whole). Each bound is an abuse guard twenty times or more
  above the corpus's heaviest page (`layout/ink.mjs`, the census of 2026-10-16), and none is a fixed number of the paper's:
  each is a page's or a part's (see below for why none is needed).
- **The marked original for a host that reads it itself.** `markedOfPaper` (layout/paper.mjs, in the pipeline entry) is
  `layoutMarksOfPaper` without its reading: the mark probe and the marked compile, and the marked PDF, its last pass's log and
  readMarked's options, which a host passes as `marked: { doc, log, options }` so that the pass reads the marked original a
  page at a time beside arXiv's; its refusals are the same (`{ refused, why }`: 'probe', 'compile', 'texlive', 'engine',
  'marks', below), and `layoutMarksOfPaper` is it followed by one `readMarked`, its marks the same bytes.
- **The marked original must be the paper: the layout guard** (`layout/guard.mjs`, applied by `markedOfPaper`; R1 of
  2026-10-19). Our marks are TeX inserted into the paper's own source, and a construct the front end reads wrongly made three
  of the 50-paper sweep's marked originals another document than arXiv's, so that each paper lost its whole layout through a
  fault of ours (343 rows): 2610.21377's pgffor loop headers written back with their body's brace doubled, 2610.21201's
  etoc depth tag whose end mark TeX wrote into the contents inside a `\csname` (ten errors, 36 pages to arXiv's 34),
  2610.21288's `\appendixname` wrapped by the babel names' marks under revtex4-2 and the appendix package (the job aborted).
  Each check holds for any paper:
  - *Before the compile*: each unit's writing in the marked file against its source, by its brace balance outside comments,
    `\verb` and verbatim environments (the innermost unit that changes it); such a unit is written as the paper's own bytes
    (latex-front.mjs `patch` `asSource`: no mark, no span), and a file whose balance our other edits move (a style's literal
    babel name wrapped) has the name marks off. Over the corpus's 124 papers and the sweep's 50 it moves one paper's three
    units (2610.21377), at a median of 2.2 ms a paper (33 ms at most, 2610.19159's 1,813 units; 177 sources).
  - *After it*: it ran through (`ranThrough`); its page count is arXiv's where the host gives it (`pages`: a number or a
    function asked once; with several toplevel sources, at most arXiv's); no auxiliary file it wrote (the files a host
    returns, else its main aux, which holds every list entry LaTeX writes through `\@writefile`) holds a mark of ours where
    no text is set: anywhere but a list entry's text (`\contentsline`'s second argument) and nameref's title (`\newlabel`'s
    third group), where LaTeX writes a caption's or a heading's text by design; its TeX errors are no more than the unmarked
    original's (the paper's own files, graphicx's draft and END_TEX alone), which is compiled only where the marked one has
    any. A paper whose marked original passes costs no compile more and its marked original and layout are as before: the
    gate pack's 32 outputs byte for byte, the sample's bundle but its pipeline token.
  - *Remedies*, at most two compiles more in all, the unmarked original's among them, none past the host's compile budget
    (`compileBudgetMs`: its wall less 1.2 times the longest compile so far): TeX that never ran (no engine banner) or a host's
    limit is refused at once (`engine` where the host names the engine unknown, else `compile`: a host's own failure, its cap
    on a compile's result); errors alone: the unmarked original compiled, its count the paper's own
    (the marked original stands), else the units the other errors stand in left unmarked (tex-errors.mjs `unitsAtErrors`, as
    runLive's remedy places a translation's, less the errors the unmarked original has at the same text); a mark out of
    place: the units it names and those its errors stand in unmarked (passing, the latter marked again, kept with no more
    errors), failing, the names' marks off too; any other failure: the units its errors stand in and
    the unit at the line TeX ignored all text after ("Incomplete \iffalse; all text was ignored after line N") unmarked with
    the names' marks off, then, passing, the units marked again (the smaller remedy, kept where it passes with no more
    errors), or, failing, the
    unmarked original compiled to tell whose fault it is. An attempt that passes is the marked original; where none does, the
    best that ran through to arXiv's page count or more stands for the page pass and the carry to judge, as before — but with
    the base page asked (`final`), none of more pages than arXiv's, there or where no compile is left: the page pass refuses a
    base page of another page count whatever the carry (§19.7), so the unmarked original is compiled instead of the final
    pass and tells whose fault it is, each why naming the page counts (2610.20581 before its Latin-1 rule: 34 pages to arXiv's
    33, refused `marks` in the same four compiles, where it had spent its final pass and been refused `boxes`); none that
    ran through is refused with why: TeX's (`compile`; `texlive` where the paper's `texlive_version` is not the box's TeX
    Live year, as 2610.20595's 2023 under the box's 2025; `engine`) where the unmarked original fails too, else ours
    (`marks`), and `compile` where no compile was left to tell. A why holds no control character and WHY_MAX code units at
    most (`whyText`). A throw of the guard's own is no refusal: the brace check is skipped, or the marked original taken as
    before the guard (with the base page asked, not one of more pages than arXiv's: `compile`, the page counts named). `guard` records what the guard did (`extra`, `unmarked`,
    `names`, `failed`, `judged`). `engines`, where a host names the compilers it runs, refuses a paper of another before any
    compile ('engine').
  - *The front end's own mistakes* (pgffor's `\foreach … in {…}`, etoc's `\etocdepthtag.toc{…}`, a length argument such as
    `\vspace{0.5mm}`, the `\appendixname` wrap, a class's fallback read as a command's definition) are the front end's to fix
    at their source; the guard is what keeps the next unknown one from costing a whole paper. A fallback, a definition TeX
    makes only where its command is undefined (`\providecommand`'s kind, or one in the branch TeX then takes of
    `\@ifundefined{x}`, `\ifcsundef{x}`, `\ifundef{\x}`, `\ifx\x\undefined`, `\expandafter\ifx\csname x\endcsname\relax`,
    `\ifdefined\x\else` or `\ifcsname x\endcsname\else`, each the other branch after `\unless`, nothing conditional between),
    is no definition of the paper's where the paper loads a package that defines the command whatever came before it
    (`arg-roles.mjs` `overriddenFallback`, `OVERRIDDEN_BY`, from TeX Live 2025's sources: `\url` by url, hyperref or xurl;
    `\nolinkurl` and `\href` by hyperref; `\burl` by breakurl; not `\path`, which url.sty defines only where it is undefined).
    Where none is loaded, the fallback is the definition TeX uses and stays the paper's, as before. 2610.19860's llncs.cls falls
    back to `\def\url#1{#1}`, and under its hyperref, read as `\url`'s own, it made each `\url`'s argument a group, inside
    which a mark was printed. Over 183 local sources
    one unit changes (that paper's unit 176: one placeholder, not a group holding one; no text piece and no kind).
  - *The web host* passes `compileBudgetMs` with CM alone today, and neither `pages` nor `engines`: its budget's answer past
    the budget (a `budget` limit) ends the guard as any limit, and the page check is the page pass's alone until it passes
    arXiv's page count.
  - *TeX's verdict, for a host with a second TeX Live tree* (the TL2023 plan, 2026-10-19): a refusal after the unmarked
    original was compiled names its verdict, `own: { ran, short, limit, tree }` (it ran through; it did with fewer pages than
    arXiv's, where `pages` is given; the host's limit it met; the TeX Live year of its banner, null where TeX never ran or the
    compile threw). `handoverOf(own, { declared, served, last })` (the pipeline entry) is the host's rule over it: another
    served tree, once (the declared year where it is one), where TeX failed on the paper's own source and no host's limit
    stopped it; never on no verdict, ours (it made the pages here), a limit, no year, or the last tree. TeX on a frozen tree is
    deterministic and no limit enters, so the tree that makes a paper's layout is a function of the source and the served
    trees. `tried`, the years the host compiled the paper on before, enters TeX's why alone ("declares TeX Live 2023; its own
    source does not run through on TeX Live 2023 or 2025"), and the refusal is `texlive` only where the paper declares a year
    none of the trees tried is. The verdict stays in the result and the page pass's `stats.layout`; a part's record is
    `{ refused, why }` as before, and with no `tried` every why is as before.
- **A paper arXiv compiles with `latex`** (its 00README's compiler, `latex+dvips_ps2pdf` read as it, or the one guessed for a
  package of EPS figures alone; R1 item 5 of 2026-10-19). arXiv runs latex, pdfTeX in DVI mode, and makes the DVI a PDF by
  dvips and ps2pdf; the marked original is that compile, its DVI made a PDF by dvipdfmx (`CompileRequest`'s `engine:
  'latex'`: latexmk's -pdfdvi with dvipdfmx as its dvipdf, a one-pass compile latex then dvipdfmx, a draft latex
  -draftmode). pdfLaTeX in its place sets such a paper otherwise (2610.21765's pages 8 to 14 refused for their carry, 83 %;
  2608.22687's 25 to 35, 88 %); and through dvips and Ghostscript no mark of ours would reach the PDF's content stream.
  - *A package that names no compiler* has one guessed from its files (`source/paper-meta.mjs`: EPS figures alone mean `latex`,
    else `pdflatex`), and a figure-less paper arXiv built with latex and dvips was taken for `pdflatex` (1007.0072v1: our base
    pdfTeX's A4, arXiv's Letter, refused for its page box). Where the host reads arXiv's PDF, its Info dictionary is the ground
    truth (PIPELINE 26): `compilerOfPdf` (`layout/guard.mjs`) reads the Creator and Producer (dvips: `latex`; pdfTeX: `pdflatex`;
    xdvipdfmx: `xelatex`; LuaTeX: `lualatex`; anything else: none), the host gives it to `markedOfPaper` as `compilerOf`, and
    the answer becomes the paper's compiler before the first compile (`meta.compilerFrom` 'pdf'). A compiler the package names
    (00README) is never asked for; a PDF that says nothing, or a failure of the host's reader, leaves the guess. In the 55
    papers of the sweep caches one original is dvips-made (this one): the class is the old, figure-less papers (before about 2012).
  - *The marks*: where pdfTeX writes no PDF itself, MARK_DEF's and LAYOUT_TEX's destination and points are xdvipdfmx's as
    under XeTeX, a `pdf:dest` special of an XYZ and a `pdf:code` rendering intent, with dvipdfmx told at the first page to
    keep every destination nothing refers to (`C 0x0010`): `DVI_MARK_DEF` after MARK_DEF, `DVI_LAYOUT_TEX` after
    LAYOUT_TEX, for such a paper alone and with no line of their own, so that every other engine's compile is byte for byte
    as before (the compile-files goldens; 52 of the sweep's 53 sources and 128 of the lab corpus's 129 the same in every
    compile input, the two others the corpus's two `latex` papers). Each sets a whatsit, as XeTeX's do: TeX's own DVI
    (dvitype, every character and rule to the sp) is the same with them and without, on every document of the native cases
    and the stream's six (`ONLY=dvi`), every named piece owns its own glyphs, and a cell's mark in a `\resizebox` lies on its glyphs (dvipdfmx reckons a destination's place in dvips's scaled box). dvipdfmx draws a glyph with no special
    before it by its own reckoning, up to 0.35 pt off TeX's place (a margin note), and the marked original's, a special
    before it, at TeX's.
  - *Against arXiv's PDF*: our DVI drawn by dvips and ps2pdf is arXiv's PDF to 0.03 pt (2610.21765, its words' median); by
    dvipdfmx, every page and word in place to 0.09 pt (the median; 0.42 pt at the 99th percentile), the fonts' boxes aside.
    Its marked original then makes a layout: 2610.21765 every part kept, 1,574 of 1,600 lines carried, 167 of 175 units
    located, 606 of 611 placeholders (the guard leaving one unit unmarked, a `\vspace` length the front end cut as one);
    2608.22687 every part kept, 2,376 of 2,453, 239 of 269. The paper's hyperref is its dvips driver's, whose links dvipdfmx
    does not read: such a marked original has no links, and the link-anchor tier places none.
    Text a paper places by PostScript (pstricks' `\rput`) dvipdfmx sets elsewhere than dvips does (64 pt off, measured in
    review): it is no unit's text, and the carry leaves it unmatched. A `sidewaystable` page arXiv's ps2pdf turns (`/Rotate
    90`) dvipdfmx leaves upright; the layer lays over no rotated page (ink.mjs `rotated`), so such a page has none, by design.
  - *Cost*: dvipdfmx once a marked compile, 0.85 s on 2610.21765's 14 pages, against pdfTeX's PDF written at every pass (a
    latex pass 0.84 s, a pdfLaTeX one 0.95 s): its prepare's compiles 12.4 s either way.
  - *The web host*'s runner runs no latex today (its answer "unknown engine": refused 'engine', as before) until its
    sandbox runs the request above; the image holds latex, dvipdfmx and Ghostscript already.
- **A compile that did not make the paper is a failed compile** (2026-10-19). A marked original
  that did not run through (`ranThrough` in `pipeline/live.mjs`, the one test runLive's compiles and CM's passes use too:
  its last pass stopped short — an emergency stop, a hundred errors, TeX's capacity — or never logged END_TEX's AXT-END)
  is the compile's refusal, whatever PDF it left, today's compile and CM's fallback alike; so is one of fewer pages than
  arXiv's PDF, which the pass counts from the document or the marks it is given (`stats.layout` { refused: 'compile',
  why }), its unit marks dropped with it. 2610.20713 on TL2025 stopped at its hundredth error after 7 of 15 pages, and
  2608.03994 went past 751 errors to 14 of 17, its tables broken; each had carried 95 % and 97 % of its lines, so the carry
  (the share of the marked original's lines found on arXiv's, then) took both and drew their pages from a layout arXiv never
  set. Of 141 compiles counted against arXiv's PDF (the corpus's 113, the TL2025/TL2023 survey's 28) the other 139 have
  arXiv's count and none has more: fewer by any page is refused, more is left to the carry. Such a paper's layer is that
  of a paper with no layout: a part with no layout (its record, below), and the layer draws only from the layout file, so
  every unit is left the original's; no unit is placed by the short original's lines. A paper of
  several toplevel sources (`meta.toplevels`) is not refused so: arXiv compiles each and joins their PDFs, the
  pipeline the first alone, so its marked original's pages are compared with arXiv's first (2610.20030: 8 of 12, the carry
  judging them; 18's rule refused it outright, 39 rows), `stats.toplevels` { files, pages }. The count is 00README's
  where the package has one (00README.json's toplevel sources, a legacy 00README's `toplevelfile` lines, standing even
  where its main file is missing from the package); with none it is guessed (`source/paper-meta.mjs`, PIPELINE 25): every
  `\documentclass` or `\documentstyle` file no other file includes that begins a document and whose class is not
  `standalone` (a figure's own file) or `subfiles` (a part); a letter counts. arXiv's AutoTeX compiles each and joins
  them, in the order of their paths as observed on one paper (1008.0072v1); the order is not otherwise established.
  The count is conservative: a file whose path or basename is that of any included name is a part
  (`\subfile{child}` inside chapters/ names child.tex, the file chapters/child.tex), since a count too high lifts the
  page rule from a paper of one source. With several, the main file is the first path in code-unit order, taken for the
  file whose pages come first in arXiv's PDF, which the carry compares, a preferred name (main, ms, paper, manuscript,
  arxiv) notwithstanding: the carry is the safety net, a wrong pick ending in its refusal, no worse than the page rule's (1008.0072v1: no 00README,
  Femtoscope_resubmission_Final_1.tex's 5 pages and Supplementary_Final_1.tex's 3, refused for 5 pages of 8 before; of
  283 packages scanned it is the one with two such files and no 00README, its page 1 the first path's). With one, or none
  uncited (each file included by another), the main is chosen as before: a preferred name, else the longer body. The further files' units are not
  read at all (their pages left the original's, with no unit): their own compiles and units, the pages offset, are later
  work.
- **Why a part has no layout** (BUNDLE 6, R1 item 4). A part with none carries the reason in place of its layout,
  `layout: { refused, why }` (`format.mjs` LAYOUT_REFUSED, `why` at most WHY_MAX = 300 code units): TeX's — `compile` (the
  paper's own source does not make arXiv's pages here, a host's limit; and every cause nobody judged: the page pass's "the
  marked original has M pages, arXiv's PDF N" where the host gives the guard no page count, no compile left to tell whose
  fault it is, a compile that threw or ran no TeX), `texlive` (as compile, the paper declaring another TeX Live year than the
  box's), `engine` (a compiler the host does not run, as `engines` or its answer names it) —, ours — `marks` (the marked original is not the paper and the guard could not mend it, or the mark probe, the
  marks' reading, the maker or a part's own reader failed) —, and `carry` (no unit of our compile in place on arXiv's pages,
  every page it is on not arXiv's page: the paper's alone, `0 of the N units on a page that is arXiv's page`). The page pass maps every
  refusal to one (`layoutRecordOf`: the paper's, the page count's, the maker's throw or carry, a verdict's, a part's bound's). A reader reads such a part as one
  with no layout: `readPart` gives `layout: null`, as a reader that only tests it takes it, and the record as `noLayout`
  (null where the part has a layout, or where its producer recorded none: 5's bare null, `cutBundle` given none). The parts
  merged (`mergeParts`) stay the whole's reading. The record is data alone: the reader's notice that would say it is the
  owner's decision, and no reader draws by it. A sweep reads one row a layoutless part, its `refused` and `why`, in place of
  each of its units' rows. The shape is new, so the format is raised (BUNDLE5 '6', its CTAG and VTAG with it): a reader of 5
  refuses a record, and nothing deployed reads 5 (no migration: a bundle of 5 is not found under 6's names and is made
  again).
- **The page stream, the default (rules 1, 3 and 4).** Every predicate a part reads is had a page at a time with no whole run
  before it: the pages' frame and the far push's columns of arXiv's text alone (rules 1 and 4, made once at step T), the
  maker's columns' edges of the pages before a page and its own (rule 3). The maker is made a page at a time and the marked
  original read beside arXiv's (its page p + 1 before arXiv's page p), the left anchored by ranges as the unit marks' pages
  arrive, and each part cut as soon as everything it reads is final: the same parts as the whole path's under the same rules,
  byte for byte (the six gate papers, verdicts on; the books' digests), told early (`stats.closed`). Against the whole run's
  rules the rules move none of the gate's 30 outputs and 10 far pushes of the 124-paper corpus (each judged right). The
  maintainer's reason is the reader's wait: the first part comes about three times sooner — 3.3 s at arXiv's page 12 against
  10.9 s on 2106.10165 (471 pages), 4.2 s at page 5 against 13.2 s on 2310.20360 (737 pages), 1.8 s against 4.5 s on
  2307.16209 — and the parts stream from there. The whole prepare, against next 3805c05d (2026-10-18, 196bbedb, the lite
  worker, five runs a paper and three a book, sides interleaved, quiet runs): with the draw off 0.24 s and 1.1 s longer on
  those two books (+2.1 % and +7.6 %), the six gate papers within next's spread; with the draw, the pass's default (below),
  1.8 s and 3.5 s longer (+15.8 % and +23.9 %; the six papers +3.4 % to +10 %, 1706.03762 within), the draw alone 1.6 s and
  2.4 s of it, which a later cut (a font's map made once a document) lowers by about 0.3 s on 2310.20360; peak RSS within
  next's spread but 2310.20360's with the draw (1709 MiB against 1578 to 1653), inside a job whose compile takes about 100 s.
  The draw moves no first part by more than 0.2 s. Rule 5 (a float searched from the page of its last body neighbour on)
  stays off: it is no accuracy rule.
- **The draw geometry (E-C), on by default (`draw`).** Each left part carries its page's draw (`layer-proto/draw.mjs`: the text
  items, the fonts, the Link annotations), read with the page's operator list (`pipeline/draw-data.mjs`): its text step T's
  own read (`readArxivText(doc, { draw: true })`, taken once a page), its annotations the page's one read, shared with the
  link-anchor locator. Its precondition is the host's: arXiv's PDF opened with `fontExtraProperties` (the fonts' maps) and
  pdf-lite's `LINK_TEXT_PIXELS` (no image's pixels, and the links' overlaid text PDF.js makes, the live reading's own); the
  marked original keeps `NO_IMAGE_PIXELS`. Most of its cost is PDF.js's own second extraction of a linked page's text for
  that overlaid text (1.5 s of 2310.20360's 2.4 s).
- **The whole run's rules** (`WHOLE_RULES`, next's, or `whole: true` under any rules). The maker's frame, the columns' edges and
  the far-push columns read the whole document, so every part is cut once the whole is made, and the parts are `cutBundle`'s of
  the same whole, byte for byte. With the oracle (`oracle { frame, columnEdges }`, a whole run's, for tests and the lab) the
  maker is made a page at a time and each part cut as soon as everything it reads is final: the same parts, cut early.
- **Memory, a part's ceiling.** What the pass holds of arXiv's ink is each page's glyphs, `GLYPHS_PAGE` (100,000) at most, and
  its boxes, `BOXES_PAGE` (500,000) kept one by one and the rest merged into at most 4,096 cells, some 140 bytes a box in all:
  about 95 MiB a page at the very most of a hostile page (the corpus's densest page holds 9,332 glyphs, about 1 MiB; its
  busiest 146,115 operations; its most boxes 22,101). `BOXES_CAP` (1,000,000) bounds the boxes of a reader that asks for no
  budget; a page past a cap is dark
  (`tests/pdf-reader/layout-hostile.test.ts`, on the lite worker, which decodes no image's pixels). Made whole, the ink of every
  page is held until the cut (2307.16209's 147 pages: 17 MiB of typed arrays). Made a page at a time, a page's ink is let go once
  its tasks have run and its plan is made, so the ink held is that of the pages decided and not yet done (on 2307.16209 up to
  96 pages while a float's whole-document match on its List of Figures keeps the early pages undecided, then none); a unit's
  rows are held until its part is written, a told unit's as the few numbers K reads of it, and the parts are the host's once
  told. Besides, per paper: both PDFs' tokens and the carrier, the PDF bytes, PDF.js's state of the document (its fonts and
  images).
- **What these do not bound.** The caps apply to what the pass keeps of a page, after PDF.js has parsed it: PDF.js's own
  operator list for the page being read is bounded by `OPS_MS` alone (a page of `q 1 0 0 1 72 72 cm /Im1 Do Q` 200,000 times
  parses to 800,804 operations in 0.44 s: in 10 s some 18 million, gigabytes, before the page is capped). And `OPS_MS` bounds
  only a parse's waits (for a font's data, a CMap): in Node PDF.js's worker runs on the main thread and slices a parse in
  microtasks, so no timer fires while a parse runs that waits for nothing (a page of 15,000 unclosed saves: its 1 s timer fired
  at 1,498 ms, as its list came); such a parse is bounded by the page's content alone, and only the run's deadline, or a reader
  in a thread or a process of its own, stops it. The marked original's ink (its owned glyphs, `markedPages`) is read under the
  same page's bounds as arXiv's (`OPS_MS` and the walk's: a page past one, or degraded, has no ink, so no piece on it is
  owned), for the marked original is as hostile as its author's source. What is held is the pages' sum: the whole paper's made
  whole, up to the whole of it made a page at a time while a float's match keeps the early pages undecided.
- **No bound of the paper's.** A real paper's costs grow with its pages, so a fixed paper-wide bound binds on a long book first:
  the carrier's work was 8.6 million steps on 2310.20360 (737 pages) and 7.1 million on 2106.10165 (471), 43 % and 36 % of the
  20 million the carrier once bounded a paper by, against 9.1 % and 5.8 % of `PAGE_WORK` on their heaviest pages. Nor does a
  page given up on leave anything that grows with the pages given up before it (`layout/oplist.mjs`): PDF.js's cancel drops
  the page's list and its parse ends on its own (pages of 1.6 million operations given up mid-parse: 2 MiB held after for one,
  3 for four, 5 for twelve, the document's fonts), so no count of them is kept. What is left is time, which the host's deadline bounds (the prepare run's 1,200 s):
  a paper may take its pages times `OPS_MS` where every page waits and stalls, a parse's own time where it does not (no engine
  bound), and its matching its pages times `MATCH_PAGE_WORK`.

### 19.7 Our compile as the base page (BUNDLE 8)

The layer is drawn over a page of our own compile: the **final pass** of the marked original, the paper set as its authors set
it, with the marks the layout was read from. arXiv's PDF stays the left's (its anchoring and the highlight), the download and
the fallback. The layout file's coordinates are therefore our page's (LAYOUT 12), our page is wrapped by optional content
(REMOVAL 8, §19.9), and no position is carried from one PDF to another.

- **The final pass** (`layout/paper.mjs` `markedOfPaper`, `final` on by default). Once the guard accepts a marked compile
  (asked for the files it wrote, `files: true`), one more request: the accepted files with `DRAFT_OPTION`'s line (graphicx's
  draft option) made an empty line, so that no line moves, over the aux, bibliography, lists and index that compile wrote;
  `rerun: false`, `bibtex: false`; the paper's own engine (pdflatex, xelatex, lualatex; `latex` then dvipdfmx). It is asked only
  where the compile budget holds a compile as long as the longest so far and a fifth. `base` is `{ pdf, log, check: { marks } }`
  once `layout/base.mjs` `finalCheck` finds its `axt-` destinations the draft's (each by name, page and place within
  `MARK_TOL`, 0.01 pt) and its page count, boxes and rotations the draft's; else `{ refused: 'final', why }`. The marks are read
  from the draft as before.
- **The day.** Every compile after the probe carries `sourceDate` (the host sets `SOURCE_DATE_EPOCH` and `FORCE_SOURCE_DATE=1`):
  arXiv's PDF's day, `creationEpochOf` — its `/CreationDate`, else its XMP's `xmp:CreateDate`, else `xmp:MetadataDate`. arXiv's
  PDFs of 2026, rewritten by pikepdf, carry only the last (the rewrite's time, within a day of the compile): 2609.26457 prints
  `\today` in its header, 2026-09-23 on arXiv's page and on ours.
- **No space of ours on the page.** The marks are invisible but where they stop a skip: LaTeX's `\begin` ends in
  `\ignorespaces`, and a unit's line probe written first after it set the space it skips (IEEEtran's abstract and keywords,
  run in after their dash: "Abstract — This", the abstract a line longer and 2608.19431's first two pages re-broken, 0.694 of
  its lines in place). The marked original's probe goes past those spaces (`latex-front.mjs` `patch`, `pastBegin`), as it
  went past a line environment's line end before; the translation's compile is left as it was.
- **No mark printed as text** (the guard's `text` evidence): a host's `textOf` reads each marked compile's text; a page that
  holds a mark of ours as TeX prints one (`markTextOf`: a mark macro's name and its braced name, `\axt@pma{p176.4a}`, in a
  monospace face or OT1 roman's quote and dashes; an address with `axt@` in it is none) leaves the units its marks name
  unmarked and the paper is compiled again within GUARD_EXTRA, as a mark out of place in an aux is (2610.19860:
  `\axt@pma{p176.4a}` inside a `\url`). The page pass reads our page's own where the host's text gives none, and takes a hit
  arXiv's same page also holds for the paper's own text (`markTextBeyond`). Before either, the marking sets no mark inside a
  group opened by a command that reads that argument verbatim (`marks.mjs` `VERBATIM_ARG`: `\url`, `\nolinkurl`, `\path`,
  `\burl`, `\href`'s first argument), whatever definition the front end read for it.
- **The paper's own bytes.** The layout compile and CM's unmarked drafts write a source of a declared Latin-1 family
  encoding that is not UTF-8 as its own bytes, under its own `\usepackage[…]{inputenc}` (`live.mjs` `originalFiles`
  `transcode`, off with `layout`): written as UTF-8, as only a translation may (`translationFiles` switches the option to
  `utf8`), 2610.20581's `latin1` source set each é as Ã© and each no-break space in math as a `\^` error, 74 errors and a
  page more than arXiv's, a fault no remedy of the guard's could mend. The live path's original transcodes as before.
- **A unit's text is what TeX sets** (PIPELINE 27; S1 to S4 of 2026-10-24, `source/latex-front.mjs`). Wrong words sent to the
  translator are worse than a unit left English. *A paper macro that sets words of its own* (`\newcommand{\nb}[1]{Notebook~#1}`)
  is its expansion: the call is one text piece, its source the call (as an accent's letter is), or one placeholder where the
  body is more than text; only a body that sets no word outside its groups, commands and formulas is a pair around its
  argument (2610.21547 sent "(4--6)" for "(Notebook 4--Notebook 6)"). *A file that is not UTF-8* has its text pieces read in
  the encoding its main file declares (`latin1`, `cp1252`/`ansinew`), else latin1, what pdfTeX reads a byte as; a UTF-8 file
  is never decoded again (2610.20581's é were U+FFFD). *A conditional TeX closes with `\fi`* gives one branch where its own text decides it (`\iftrue`, `\if` or `\ifx` of two
  characters: an author's `\if 0 … \fi`); any other (`\ifdefined`, `\ifcsname`, a `\newif`, `\ifx` of commands) whose two
  branches hold words gives neither (`skipped.ifUnknown`, left English: 2610.21098's two \ifdefined branches were one unit),
  and so does one whose span holds `\verb`, inline code, a verbatim environment or a definition, where the scan could take an
  `\else` TeX never reads for one. Following the paper's definitions was tried and dropped: the review of #457 found a fault
  in it in each of three rounds (a file nothing reads, a group, a `\let` in the body), and that is TeX's own work. Not resolved by the probe compile: the units are cut before any
  compile and must be the same on every reader. The accents were checked and needed nothing: the regression's "JÃ©rÃ´me"
  was a report printing the units' raw bytes (their text is UTF-8 read latin1; `mt.mjs` `utf8` decodes it)
- **A command takes what its definition takes** (PIPELINE 28, `source/latex-front.mjs` `argsOfForm`, `unitForm`). A heading,
  a caption, a footnote, a `\thanks`, a `\title` and an author block take an optional argument and one text (LaTeX's
  `\@startsection` a star, a short title and the title; subcaption's `\subcaptionbox` up to its contents, which are walked),
  or the arity the paper's own definition gives; `\multicolumn`, `\multirow`, `\makecell` and `\shortstack` the arguments
  the role table gives them. A group after them is the text's. Read as "up to two groups", the stray `{` on the line after
  2610.31660v1's `\subsection{Approaches to determining $H_0$}`, closed 330 lines later by a stray `}}`, was taken for the
  heading's second argument and skipped: §II.A to mid-§IV had no unit (57 units, now 126), and nothing there was translated.
  Over 167 local sources two units' hashes moved, in one paper (2607.24653v2's `\multirow[c]{3}{w}[-2pt]{…}`, now read
  whole: the pairs after it numbered one on, their texts the same). Where nothing defines a command or an environment
  (`commandArgs`, `envArgs`), and for a citation (`\citefield{key}{field}` takes two groups, a field name the translator
  must not see), every adjacent group is still taken: words left English break nothing, an argument translated breaks TeX
- **An author block's options after its text are its own** (PIPELINE 29, `source/latex-front.mjs` `frontArgs`). The front
  matter's commands (`\author`, `\affil`, `\affiliation`, `\institute`, `\address`) take, after the form above, every optional
  argument that follows their text, as their classes read it by looking past it (`\@ifnextchar[`): the Elsevier classes' and
  ceurart's `\author[1]{Name}[orcid=…]`. Read short, the bracket was a unit of its own, sent to the translator, and its start
  mark stood between the call and the option: the class no longer saw the option, set it as text, and 2610.21084v1's marked
  original (cas-sc) ran to 50 pages against arXiv's 49, the paper refused whole (the release sweep of 2026-10-25). The guard's
  fallbacks cannot mend such a cause: no mark of the names' is at fault and no error names a unit, so the units it unmarks are
  others; a mis-cut is mended where the units are cut. Over 157 local sources two papers change (2610.21084v1, and 2608.12096's
  ceurart `[email=…]`), every other unit's hash kept
- **Under `latex`, nothing dvipdfmx could not draw.** Our DVI is drawn by dvipdfmx, arXiv's by dvips and ps2pdf: a PSTricks
  picture, or any PostScript of the page's, dvipdfmx cannot interpret is missing from our page alone, and the marks and boxes
  would pass. The final pass is refused (`final`) where its log says dvipdfmx failed a special or an image (`base.mjs`
  `driverLostInk`), but hyperref's own (`ps:SDict begin …`: its links, anchors, outlines and info, no ink; 2608.22687 has
  2,784 of them, about 0.6 MB of warnings). The host's contract: after TeX's log it appends a line that is
  `axt-runner: dvipdfmx output` alone, then the driver's terminal output, bounded generously (4 MiB); where the bound cuts it,
  a line that is `axt-runner: dvipdfmx output truncated` alone after what it kept, the only legal way to cut it. It fails
  closed: a `latex` final pass whose log lacks the first line, or holds the second, is refused `final` (`DRIVER_OUTPUT_MARK`,
  `DRIVER_OUTPUT_TRUNCATED`, `driverOutputGiven`, `driverOutputTruncated`, in the pipeline entry).
- **The page and line check** (`pipeline/page-pass.mjs` `checkOurBase`, which the page pass runs before its head and the lab's
  makers run as production does), the first that fails the paper's fallback: our page count arXiv's (`boxes`); no mark of ours
  printed as text on our page (`marks`); the final pass the draft's page (`final`); every page box and rotation arXiv's, to
  `BOX_TOL` 0.01 pt (`boxes`: PDF.js's `view`, the CropBox clipped to the MediaBox, not the MediaBox itself: the view is the
  rectangle the reader draws and every coordinate of the layer, the left's and the layout's, is read in, and nothing outside
  it is shown, so two pages of equal views are one page to the identity map); and the TeX Live year known (`final`). Then the
  page and line check (`carry.mjs` `lineCheckOf` over the two texts, a check that carries no position) asks two things.
  **May we draw**, per page: a page is drawable where it is the same paper's page, its words arXiv's page's (`PAGE_SAME`, 0.98:
  twice the longest common run of the two pages' words in order over their two counts, each word compared once NFKC and the
  known text-layer substitutes are applied, arXiv's "ǫ" for ε, lower case, its letters and digits alone) and none of its lines
  found on another page of arXiv's (the carrier's partners). Our page's words are read off the page the prepare is given, wrapped
  by optional content, where PDF.js ends a line that ends in a hyphen with an empty item after the group closes, not with the
  hyphen's own: the tokenizer joins the word across that item as across the hyphen's own end of line (`anchors.mjs`
  `tokenizeDocument`, LAYOUT 23), where it read two words on our page against arXiv's one and 2610.19274v1's list of figures,
  three hyphens a page, fell under `PAGE_SAME` on pages 67 to 69, its contents units laid nowhere. **A unit is laid only where every page it is on is drawable**
  (`layout/make.mjs` `drawable`, LAYOUT 16; `stats.units.undrawn` the others, left the original's). Over our own page a
  drawing is right by construction: a page of the same words is drawn whatever its lines' offsets, a line re-broken by a word,
  moved a point or set with other glue. On the pack and the release sweep's 50 papers it refuses 2307.16209's pages 69 to 76
  (our TeX Live 2023 compile running behind arXiv's build by up to half a page) and its title page. **Do the panes align**,
  per line, is information alone: each of our lines in place or not (the median of its matched words' offsets within
  `LINE_PLACE`, 0.5 pt, on its own page, or a twin of the same words but for a known substitute), the paper's share the head's
  `carried`; it never decides what is drawn. One fallback stands: a paper none of whose units is laid (no drawable page with a
  unit on it: `carry`) falls back to arXiv's PDF untranslated; in the page stream the head waits for the first unit laid, so
  nothing is told before it. A page that is not drawable lays no unit; the reader shows our base page there untranslated
  (`view/layer-side.mjs` `noLayoutPage` takes a page of a part with a layout as laid), where before the change the part it was
  in had no layout and showed arXiv's page. A line
  found elsewhere is another TeX Live re-breaking the paper, and our page is to be arXiv's: so a paper is compiled on the tree
  of arXiv's build (the year its 00README declares, which the box hands it over to before any compile).
- **The maker** (`layout/make.mjs`) reads our page as its document: a placeholder's segments are its own glyphs and rules
  between its two marks, looked up on that page exactly (`ownedOn`, within `OWN_TOL` 0.02 pt), with no matching; EMPTY, LOST,
  TEXT, JOINED and OUTSIDE as before. `match.mjs`, `tolerant.mjs`, the link-anchor locator, the text runs and the carry's
  point mapping are gone.
- **A unit the maker does not lay says why** (LAYOUT 18): the file's `unlaid`, `[unit, code]` by unit rising, a code of
  `UNLAID` (`noAnchor`, `unplacedMarks`, `kind`, `rects`, `linesUnit`, `dark`, `noLine`, `lineTaken`, `erase`, `undrawn`,
  `fonts`: each place the maker leaves a unit out, the first that does), and a part holds those of the units it tells. It is
  an optional key under schema 5, as `colours` is: a file of before reads and writes back unchanged, and the reader never
  draws by it (the key is not `refused`, which a part's `layout` holds where it has none). A unit not laid with no code is a
  defect of the maker's, which throws. The record came of 2602.23285v2's paragraph beside a sideways table cell (unit 56),
  laid by production and not by LAYOUT 14 to 17 with no word of why: the cell's start mark, on its turned run at no upright
  word, reached the next cell's word (`reachIn`, LAYOUT 14), its end mark's word was the paragraph's, and the cell took the
  paragraph's eighth line (`lineTaken`). A start mark on a turned token's box now reaches none (`turnedAt`): the cell stays
  the original's, as the maker never lays a turned run, and the paragraph is laid as production lays it.
- **The pin's sweep, LAYOUT 19** (2026-10-24: 133 units newly English against the staging of LAYOUT 16, the maker's share of
  them bisected over the merges between): three causes, each one rule.
  - *A start mark takes the word it stands before* (`pipeline/anchors.mjs` `tokenAtMark`). A mark carries the word it stands at
    in the marked original, and is placed on our base page only where the base page has that word there. The marked original
    is read in one text item a line, its width shared by its characters, so that a word's box is approximate; the wrap
    (#444) cuts our base page's items at its groups, whose boxes are then exact. A caption's start mark after its label
    ("Figure 1: Attention") was nearer the label's "1" in the one and on "attention" in the other: 24 units of 11 papers
    (`unplacedMarks`). A start mark now takes the nearest word it does not stand past, the word it stands past only where
    there is no other; with no slack past a word's end: half a character of slack took a label's narrow digit for the first
    word in three units (2610.22214's "9", 1.4 pt short of the mark). An end mark keeps its rule, the last word that begins
    before it: a rule that took the last word ending before the mark took the word before it wherever the last word's shared
    box overruns the mark (2610.10069's "given by|", 9.8 pt; 5 units lost in the 18 papers' run). Where the next word's shared
    box begins before the end mark (2610.20716's "model| the", 2610.20581's "Theorem| 2.2"), the carried word is the one
    beside the base page's on the side the mark faces, and the unit is bounded by the base page's word (`wordAt`: one word
    over, never two); the start side the same, before its mark. The shared width itself (the tokenizer's) is left as it is.
  - *A front matter unit's placeholders keep their marks* (`layout/marks.mjs` `layoutMarking`). \axtpma takes itself off in a
    moving argument, as a copy written to a list must; a \thanks stores its text with \protected@xdef and sets it in its note,
    so its placeholders' marks were gone and their ink LOST (5 notes' addresses, `\texttt`, `\href`). The marks of a front
    unit (`frontMarks`, LAYOUT 17) have `\protect` before them. And `\protect` is a prefix of the next token alone
    (`rules/tex-kernel.mjs` `PREFIX_WORDS`): the piece after it is marked as one with it, its opening mark before the prefix,
    where before it had none (`\protect\url` in IEEEtran's notes).
  - *The wrap holds a decoded stream as bytes of its own* (`layout/remove.mjs` `readAtMost`). The object layer's decoding stream
    grows its buffer by 64 KB chunks and doubles it; its view held the whole buffer, and the decoded streams' cache, counted by
    the views' lengths, held it for every stream. 2610.21924's page 9 paints 3,128 forms (a plot's markers): the wrap of our
    final pass in the maker child held 960 MB, the maker died of its memory (`prlimit --data` 1,024 MiB), and the host's re-cut
    gave every part no layout. The cache now counts the bytes it holds. A part cut again after the maker died says so
    (`page-pass.mjs` `layoutRecordOf`: `memory`, `clock`, `crashed`), not that the maker refused the paper.
- **The release sweep, LAYOUT 20** (2026-10-24: 21 units newly English against production, all `unhidden`): the maker reads
  a piece's ink as the wrap does (§19.9: `stream.mjs ownedOf`'s two rules, one reading for both). The text after a piece,
  where it runs to its unit's next mark, begins where the glyphs to that mark spell it whole (followsOf's `rest`), not where
  its first `WANT` characters first stand: a display's `\text{for every}` before "For" (2610.16663v1 p45, 2610.21037v1 p15),
  a table display's header word "position" before "Positions" (2610.20285v1 p28), a URL's dots and `$=.068$`'s point before
  the full stop after them (2610.21376v1 p9, 2610.21098v1 p15) cut the piece's segments short, the rest read as the unit's
  text, which the spell check refused. And a display that ends a footnote, LOST before, is found to its page's folio
  (2610.16663v1 p16). Over the 24 papers of the release sweep, 8 rows of their layout files move, those units' placeholder and
  erase rows alone; no unit is laid or left that was not before; on the gate pack every layout file is the one before but its
  version (pack `13785c79`).
  - *A lead is found by the text TeX sets for it* (the last five units English on staging and translated on production:
    2610.21098v1 p13u138, u142, u144, 2610.21176v1 p13u88, 2610.22195v1 p1u0; MARKS_SCHEMA 10, LAYOUT 20 and REMOVAL 10 shared,
    unreleased). A placeholder at a unit's head gets no mark (`headEnd`), and its ink, set before the start mark, is found by
    its text: the maker's head (`make.mjs besideMarks`) and the wrap's cell lead (§19.9, MR 5b) read the glyphs there against
    the text the marking's probe showed it sets. The probe read letters and digits alone (`marks.mjs readInkTexts`), asked
    about the paper's macros alone (`inkSamples`), and the marks file took nothing else (`checkTexts`): `\SweepCapLow{}` =
    `1{,}024` and `\EpisodeTokenBudget{}` = `128{,}000` had no text for their commas, a cell's `\texttt{max\_tokens}` was not
    asked, and `\dprime{}` = `$d'$` sets math. The probe's text is now what TeX lists: a text font's letters, digits and the
    punctuation it sets as ASCII's ("1,024"; T1's underscore, "max_tokens"; OT1's is a rule, no answer), a formula's math
    italic letters and any other glyph of a formula one glyph whatever its text (`INK_ANY`: "d" and the prime), and a text that
    spells no character ($\checkmark$) no answer; the leads the macros' list does not hold — inline code, a macro past
    `INK_MAX` — are asked last (`leadSamples`, the probe document unchanged where a paper has none), their texts read but
    never the marking's (`inkless`, `apart`); each glyph is read against the text by one step (`leadStep`), and a formula's
    glyph only where nothing of ink stands between the lead and the mark (a footnote's call's). `?` is no character spelled: the
    probe has no aux, and a `\ref` sets "??" there.
  - *A front heading is marked as any heading* (`marks.mjs layoutMarking`). ICML's `\icmltitle`, the paper's own style's
    command, is a front unit (latex-front.mjs, PIPELINE 10: its text handed to the running head and the PDF's title too),
    and the heading's branch gave a front heading no mark, while `frontMarks` (LAYOUT 17), which marks the other front units,
    left headings to their own marks: the title had none, and its ink no group. A heading's marks set nothing in the output
    routine's heads, a PDF string or a file (the gate), nor in the box ICML measures its running title in and never ships;
    the title's end mark alone is set where it sets the title. 2610.22195v1's base page sets every glyph and box as before.
  - Over the 25 papers of the release sweep, offline through the page pass, against `next` (5e723185): units laid and hidden
    gained 8, lost 0; with no LOST placeholder (the layer's `locatedWhole`) gained 12, lost 0 (2610.21098v1 u136, u138, u142,
    u144, u198, u505; 2610.21176v1 u88, u124; 2610.22195v1 u0, u208, u210; 2610.21085v1 u164); the model check's ink in no
    group inside a drawn unit's rectangles and own ink outside them the same on every paper (45 and 1,452 glyphs). 44 rows of
    four papers' layout files move, the gained units' (their lead found where it was their label), and only 2610.22195v1's
    base page's bytes change. On the gate pack every layout file and base page is the one before; two base
    records would read more texts (1512.03385v1's `\eg`, `\ie`, `\vs`; 2608.04322v1's address), which move no glyph's group:
    the pack stays `13785c79`.
- **The look-ahead pairs, LAYOUT 23** (2026-10-28: 2609.20976v1's abstract and five of its paragraphs English, their translation
  rows whole). A paper's macro may look at what follows it (`\xspace`, `\@ifnextchar`), so it gets its opening mark alone and
  the placeholder right after it none, which the macro would see in its place (`marks.mjs` `LOOKS_AHEAD`); that placeholder,
  with no mark, was LOST, the macro with it ('open, an unmarked piece follows', `stream.mjs`), and `tex.mjs locatedWhole` left
  the unit the original's. 2609.20976 defines `\snr` as `\ac{SNR}\xspace` and writes `\snr $\geq 50$`.
  - *TeX is asked about each pair* (`aheadSamples`, `aheadSection`; MARKS_SCHEMA 12). The mark probe sets each pair of a paper's
    macro and the placeholder right after it, past white space alone or none (a formula, a citation, a reference, code, a URL,
    a footnote's call, a number: a placeholder the maker cannot find with no mark; not a display, which no box of a line sets),
    as the paper writes it, at most `AHEAD_PROBE_MAX` (128) a paper, in a section of its own after every other, so that an error
    there costs only the pairs after it: in a box as the paper sets it, with every mark, and with the two openings alone, each
    after the pair set once and let go (acronym's `\ac` sets its long form once, then the short one). Where the openings move
    nothing (1) the placeholder is marked; where the macro's closing mark moves nothing too (0) the macro is closed. A box's width
    cannot show hyphenation, which a mark's whatsit right after a word changes (TeX never hyphenates a word a box, a rule or a
    formula follows, and does one a whatsit follows: `\tf \cite{a}`, Transformer[1] broken as Trans-former[1] once the
    citation was marked, `marks-invariant.test.ts`), so one box more asks what the list ends with where the placeholder's mark
    goes (`\lastnodetype`): a letter, a ligature or a font's kern keeps the placeholder's opening mark only where the mark boxes
    itself before it (a formula, `\mbox`, `\textsuperscript`: `\axt@boxy`) and the macro's closing mark nowhere; a
    discretionary or a whatsit (a XeTeX word), no mark. The answers
    are the switch's, by the pair's key (`aheadKey`: the two sources and the white space between, joined by `#`), and the
    samples are read from the units alone, numbered by their own rows, so that every reader of the probe's log and of the marks
    file takes them as it takes the switch. `\snr` ends in a control word: TeX skips the space after it, and a closing mark there
    makes it a second space, so TeX answers 1. A complete call's pair (a call TeX answered for, `completeMacros`) is marked so too,
    its closing mark its own answer's. A pair after a macro with no opening mark of its own (glued to a word, at a cell's head)
    or in a front unit, whose marks are robust (`\protect` before each) where the probe's box sets none so, is not marked.
  - *A placeholder no mark may stand before is parted from the macro by its text* (`marks.mjs followsOf` `split`, `stream.mjs
    ownedOf`). `\footnote` is one of `\xspace`'s exceptions: it sets no space before the call, and would before a mark (u19,
    `\lgnrm \footnote{\url{…}}~\citep{…}`: TeX answers 2). The wrap read the macro's ink through to the next marked piece's
    point, the call's with it (§19.9, `through`); the maker now reads it so too and parts the two: where a paper's macro is
    followed by one unmarked placeholder of those classes and then, past white space alone, by the next marked piece, the
    macro's ink is the glyphs from its point that set the text the probe showed it sets (`readInkTexts`, ending in a letter or
    a digit), character for character, the placeholder's the rest, kept in the marks file under the opening mark it would have
    had (`owned`) and placed from it (`make.mjs`); glyphs that do not set it, nothing left, or a rest that runs on as the
    macro's word (a letter or a digit on its baseline at its size: its text then ended inside the word, the review of #483),
    LOST as before. The wrap reads it as the maker does (below).
  - *A piece with text after it, and a .bbl's own macros* (2610.20848v1's elsarticle entries, `\newblock \DOIprefix\doi{…}.`:
    `\DOIprefix` gets its opening mark alone, `\doi{…}` after it none, and with text after the `\doi` no marked piece ends their
    ink: the wrap left 35 entries the original's). The split takes a piece followed by text, then by a piece of its unit's ends,
    too (`followsOf`: that text as an opening's, `want`, `rest`, `ends`): its ink ends where that text begins (`textTo`, so that
    the DOI's own dots are none of the full stop's). The piece may be a paper's macro that is no text symbol (`\doi`), and the
    macro's text may end in punctuation ("doi:"), read character for character as before. The wrap gives `followsOf` its texts
    and owns the two as the macro's (`through`'s reading), the maker parts them. And the mark probe sets the .bbl's own
    `\providecommand`s first (`live.mjs bblProvides`, the .bbl's lines before its first `\bibitem`): TeX reads them only where
    `\bibliography` stands, so the probe knew none of the entries' macros, their calls an error there and no text.
    `\providecommand` defines only what is undefined, as it does where the .bbl is read; it is read as TeX reads the .bbl, a
    comment gone with its line's end and a definition under the .bbl's `\makeatletter` given one again (the reviews of #486:
    REVTeX's `\@ifxundefined`, 2307.16209v1). Measured (`classes-gate.mjs --made --compile`, the bibliography's entries units
    and the job's .bbl made as production makes it, against `next` eb759e9f, over the 35 papers: the 25, 2610.20848v1,
    2608.12606v1, 2610.34042v1 and the gate pack's 7): drawn gained 58, lost 0 — 56 entries (2610.20848v1's 35, all its
    entries with a DOI; 2608.12096v1 17; 2608.16117v1 u186, u190, u199, u202, a `\URLprefix` before its `\url` among them,
    answered now the probe knows it) and 2 paragraphs (2212.06817v2 u187's `\algname\footnote{…}` and 2608.18685v1 u9's
    `\methodname\footnote{…}`, text after the call); every base page pixel for pixel `next`'s; the entries the wrap leaves the
    original's 134 to 78. Those left are other shapes: 2608.25210v2's 64, a `\natexlab{}` after the year that sets no ink, which
    its .bbl defines by `\expandafter\ifx\csname natexlab\endcsname\relax\def…\fi` and not by `\providecommand`; an entry's
    `\&` LOST (2608.12606v1 3, 2610.34042v1 2); `\dodoi{…}` alone at an entry's end (2608.12606v1 u175); `{\DJ}uri…`
    (2608.16117v1 u207); 2610.20716v1's 6 by the spell check. The gate pack is `0b3109a8`'s with 2608.16117v1's two outputs'
    layout files and base pages made again (`e8e9eeb5`: their base pages' marks move, their pixels do not).
  - Measured (2026-10-28, `lab/pdf/spikes/classes-gate.mjs --compile`, production's path on each paper's year, against `next`
    2346530d unit by unit (and c038d549 before it alike), over the 25 papers of 170 local sources whose units hold the shape and the gate pack's 7): drawn
    (laid, no LOST piece: `locatedWhole`'s rule) gained 22, lost 0, in 10 papers (2609.20976v1 u4, u19, u41, u46, u59, u61;
    2608.28692v1 5, 2610.21376v1 3, 2608.04183v1 2, and one each in 2608.08880v1, 2608.12096v1, 2608.12333v1, 2608.14934v1,
    2608.29782v1, 2610.21547v1); no unit's lines lost or gained, 2 units' moved (their lines' extents, where a macro that opens a
    line is found now); every page of every base page pixel for pixel `next`'s, its page count arXiv's; G1 0 on the entries'
    pages; the units' hashes the same on all 32 (`unit-hash-diff.mjs`); the wrap of the 10 papers' base pages (`ocg-gate.mjs`,
    Chromium's GPU canvas) leaves 63 units the original's for their marks where `next`'s left 81, its G1, split shows and delta
    proofs as `next`'s. Of the 195 pairs asked, TeX answered 29 with 0, 55 with 1, 6 with 2 and 16 with an error (`x`); 89 had
    no row, the probe stopped short of them (2610.21377v1's 74 all: jnsao.cls's `\and` ends TeX's run in a section before,
    `markProbeTex`). Left English with the shape: 52 units (75 on `next`): a display after the macro (9), a pair TeX gave no
    answer for (a table's `\colrule` or a paper's `\tagone` before a formula, which a box of a line cannot set), an author
    block's macro glued to a name (`\orcid`), a cell's head (`\cellcolor`), a footnote's call after `\xspace` with text after
    it, where no marked piece ends the call's ink, and a pair whose word the guard of hyphenation keeps unmarked (2608.12333v1's
    `\EN $…$`, 2 units). The gate pack's papers write no such pair: its layout files and base pages are `690d0e19`'s byte for
    byte (32 outputs made again, 96 files), the rules gate's model tier (`rules-gate.mjs compare`: 0 worse, 0 pages moved) and
    the pixel tier the same on both engines.
- **A unit the layer leaves the original's says why** (read time, no stored artefact, no version token): each `skipped` record
  of the run (`layer-proto/run.mjs`) carries a `code` of `SKIP_CODES` beside its `why`: `unlocated` (the file holds no row of
  it, and the file's own reason beside it, `unlaid`), `pieces`, `noRow`, `lost` (a visible piece the file has no position
  for: tex.mjs locatedWhole), `offPages`, `author`, `refused` (its row not of this unit), `group`, the drawing's `unfit`,
  `unproven`, `served`, `face`, `error` and `page`, and `unhidden` (the file could not wrap its ink in its groups, §19.9); and the
  door names the rows it drops as no unit or piece of the paper's
  (`stats().droppedRows`, `[id, 'rowUnfit']`, at most `DROPPED_ROWS`), which the run never sees. A code outside the set is
  refused (`skipCode`). So a sweep tells a maker's reason (`unlaid`) from the layer's (`code`) for every unit left English:
  2610.20595v1's units across a page break were `lost` (revtex4-2 pages on TL2023, each with a LOST placeholder at the break,
  which #443's body points mend), and 2610.19860v1's unit 176 `rowUnfit` (a row of the cut before #435).
- **The head** (`layer-proto/format.mjs`, BUNDLE5 `'8'`; a reader of 8 reads 7's objects, a head of 7 over arXiv's PDF):
  `base { source: 'ours', bytes, sha256, xref, pages, tree, check: { pages: [ours, arXiv's], boxes: 'equal', carried } }` with
  `orig { bytes, sha256 }` (arXiv's PDF), or `base { source: 'arxiv', bytes, sha256, xref, why }` (no `orig`) with `why` one of
  `BASE_WHYS` (`compile`, `carry`, `engine`, `texlive`, `marks`, `final`, `boxes`), which every part with no layout says too.
  The catalog names the base (`catalogBase`: ours by its key `baseKey` = `base/<id>v<n>/<sha256>.pdf`, its digest and bytes).
  `layerDraws(base)` is the one predicate of whether a head's layer draws (ours alone); `baseRefusalRetryable(refusal)` is
  whether a refusal may be transient (it names the host's limit or the compile budget that caused it, `limit`), which a host
  retries rather than commit a fallback head.
- **Measured** (2026-10-22, the pinned images). The lines in place, our base page against arXiv's PDF:

  | Paper | Engine | arXiv's build | Ours | In place (0.5 pt) | Found anywhere | Base |
  |---|---|---|---|---|---|---|
  | 1512.03385 | pdflatex | TL2011 | TL2025 | 1.000 | 1.000 | ours |
  | 1706.03762 | pdflatex | TL2023 | TL2025 | 0.979 | 1.000 | ours |
  | 1810.04805 | pdflatex | TL2016 | TL2025 | 0.956 | 0.999 | ours |
  | 2307.16209 | pdflatex | TL2023 | TL2025 / TL2023 | 0.802 / 0.902 | 0.999 / 0.999 | `carry` on 2025, ours on 2023 |
  | 2608.04322 | pdflatex | TL2025 | TL2025 | 1.000 | 1.000 | ours |
  | 2608.16117 | pdflatex | TL2023 (declared) | TL2023 | 0.988 | 1.000 | ours |
  | 2609.26457 | pdflatex | TL2023 (declared) | TL2025 / TL2023 | 0.886 / 0.991 | 0.996 / 1.000 | `carry` on 2025, ours on 2023 |
  | 2608.18760 | xelatex | TL2025 | TL2025 | 0.996 | 1.000 | ours |
  | 2608.19431 | xelatex | TL2025 | TL2025 | 1.000 (0.694 before `pastBegin`) | 1.000 | ours (`carry` before `pastBegin`) |
  | 2608.22687 | latex (dvipdfmx; arXiv's dvips) | TL2025 | TL2025 | 0.976 | 0.976 | ours |
  | a paper of our own | lualatex | TL2025 | TL2025 | 1.000 | 1.000 | ours |

  Counting whole lines alone, `latex` would fail (2608.22687: 0.707 at 0.5 pt, its words up to 0.42 pt apart), and at 0.01 pt
  every year's change would. Over our own page the maker locates as many units as over arXiv's or more (2307.16209: 453 to
  464 of 466, its placeholders found 3,485 to 3,571, lost 6 to 2; the other papers of the gate pack the same).


### 19.8 Our base as an incremental update over arXiv's PDF (the delta)

Our base page is stored not as a whole PDF but as one **incremental-update section** over arXiv's original, so that the
composed document is `orig.bytes ++ delta`: one byte source for the left pane and the layer, and only
what our compile changed is stored (the coordinator's GO of 2026-10-23). `kind: 'full'`, the whole PDF of 19.7, stays the
fallback. BUNDLE stays 8 (unreleased: its readers in this repository read both), LAYOUT 16, the catalog key unmoved.

- **The builder** (`layout/delta.mjs` `deltaOf(origBytes, finalBytes, { PL, replacedPages })`, pure and deterministic, in the
  pipeline entry). For each page the layer lays on whose contents and resources are not canonically arXiv's: the original's
  page object written again under its own number and generation, every key kept but `/Contents` and `/Resources`, which are
  ours; our content streams copied byte for byte as new objects; a `/Resources` dict of our entries, each the original's object
  where the two are canonically equal (the whole sub-graph reused), else copied with its closure from the original's `/Size`
  up. Names stay ours. Nothing else is written: page tree, outlines, destinations, annotations and info stay the
  original's, and so does the catalog but for its `/OCProperties` where our pages are wrapped (19.9): the catalog is then
  written again under its number, every other key the original's, and its `/OCProperties` is the original's with our groups
  appended to its `/OCGs` and its default's `/ON` (every other key, and the default's `/BaseState`, `/OFF`, `/AS`, the
  original's). The paper's own layers of our compile are paired with the original's by their place in each `/OCGs` where
  each pair is one layer (as many, every name unique on each side, each pair of one name, one default state by `/D`'s
  `/BaseState`, `/ON` and `/OFF`, one `/Intent` and `/Usage`; else the delta is refused, `delta-proof`, and the full base
  serves: two layers of one name are never paired by their place), so a replaced page names the original's objects and an unreplaced
  page's layers stay listed with their default state. A page of ours that names a group of ours and is not replaced refuses
  the delta (`delta-pages`). The section is of the original's cross-reference kind (`layout/section.mjs` `appendSection`, which the
  wrap writes its section with too: a table, or a stream of `/W [1 4 2]`, no hybrid), numbers in runs, objects
  uncompressed, `/Prev` the original's startxref, `/Root` `/Info` `/ID` the original's, its startxref in composed offsets.
- **The canonical form**: a stream is its dict less `/Length` and the exact bytes its **resolved** `/Length` names (an
  indirect one followed, as PDF.js reads it: `layout/xref.mjs` reads every object where the cross-reference puts it; the object
  layer's own scan to `endstream` reads a stream ending in CR or LF a byte short); a dict its sorted entries, an array its
  items, a reference the form of what it names (direct or indirect alike); the back links `/Parent` `/P` `/Prev` `/Next`
  `/First` `/Last` cut by the dict's own context, never by the value being a reference: `/Parent` of a page-tree node, `/P`
  and `/Parent` of an annotation, `/P` of a structure element, the outline's chain; never in an optional-content membership
  (its `/P` policy, direct or by reference, is data) or a dict of no such context; a cycle leaves the object unmatched (copied), never an error.
  An optional-content group or membership (`/OCG`, `/OCMD`) is matched by its identity alone, never by its content (two
  layers of equal dicts, one ON and one OFF, are two layers): by reference its form is its document's and object's, so it
  and everything that names it are copied; the proof checks that ours and the composed document's are one to one over
  `/OCProperties`' `/OCGs` and every replaced page's `/Properties`, that the composed `/OCProperties` is the original's with
  ours appended (as above), and that every layer a composed page names (its `/Properties`, its forms' `/OC` and own
  `/Properties`, its annotations' `/OC`) is listed wherever its source page's (ours replaced, the original's elsewhere) is
  listed in its own document: PDF.js draws a group it does not know as visible. Forms are interned (exact equality); stream
  bytes are bucketed by a hash of secret random seeds and compared whole, and the whole build spends at most
  `DELTA_WORK_MAX` (2^31 bytes hashed or compared and objects read: the 46 MB pair about 150 million), so no input makes a
  bucket or the build long. Its `/Size` is within `OBJECT_MAX` (it left 2^20 numbers below it for the text-removed PDF's tails until REMOVAL 8).
- **Refused, the whole base kept** (`DELTA_WHYS`): an original it cannot read safely (`delta-parse`, `delta-encrypted`,
  `delta-xref`: hybrid, an entry not at its `n g obj`, a section that does not parse; `delta-stream`: a `/Length` not ending at
  `endstream`), our pages more than arXiv's (`delta-pages`), a replaced page of ours whose box (the CropBox within the MediaBox, inherited), rotation or `/UserUnit` is not arXiv's page's, which the delta's page dict keeps (`delta-boxes`), a bound (`delta-bound`: `DELTA_MAX_BYTES` 24 MiB, more than
  `DELTA_MAX_SHARE` 0.35 of our whole base page, `DELTA_OBJECTS_MAX` 200,000 objects, `DELTA_HELD_MAX` 64 MiB of forms held,
  `DELTA_DECODED_MAX` 48 MiB of object and cross-reference streams decoded), nothing to replace (`delta-empty`), the proof
  (`delta-proof`), a delta the page pass was given that does not check (`delta-shape`).
- **The proof** (`proveDelta(origBytes, delta, finalBytes, { PL, getDocument, documentOptions, replaced, readers })`, in the
  box, the structural one; pixels are the lab's gate): every entry of the section at its `n g obj` (`delta-wire.mjs`
  `deltaSection`), `/Prev` the original's startxref, the composed startxref the section's; the composed page graphs, read again
  by the object layer, ours on replaced pages (the page dict's other keys the original's) and the original's elsewhere (a
  pairwise graph comparison: cycles compare as the graphs they make); PDF.js opening the composed bytes with no message neither
  source alone gives (its console captured, each document read in turn, the composed one first); the original's page count;
  every page's box (within 0.01), rotation and user unit, and its text items exactly, every field of every item (`page-text.mjs`
  `textRecordOf`: one SHA-256 of their exact values a page; before 2026-10-24 within 0.01 — the pack's composed pages are ours
  item for item, 290 pages and 97,702 items, 106,763 wrapped; a string by its UTF-16 code units, so that a lone surrogate is never
  U+FFFD), ours on replaced pages and the original's elsewhere. `readers` `{ orig, ours }`, where the host gives them: its own
  readings of arXiv's PDF and of our final pass, each `{ options, own?, read(doc) }`. In its turn and under its capture of the
  console the proof opens the document itself, of a copy of its own bytes (ours of the bytes themselves where `own`: PDF.js takes
  them at the opening, so that one that fails leaves them given up, which the host reads by their length), at PDF.js's verbosity
  1, with the reader's options over `documentOptions`, and gives it to `read`, which reads every page with `readArxivText(doc, {
  draw: true })`: the proof makes each page's record of the text content that page gives the reader (asked with the defaults),
  before the reader sees it, so that what is compared is what the proof's document gave, where the proof hears PDF.js. Every
  document it opened is the host's from then on, handed back in the result (`documents`, whatever the verdict): each text read
  once in the box, not twice. A reader that throws, or a page it did not read or read otherwise (compared or not, as the proof's
  own reading reads every page), is a PDF.js failure; a failed opening is destroyed, its failure kept over a destroy's. The
  composed bytes are let go once read, and the object layer's three documents when its checks return, before a reader's document
  is opened. What the delta overrides of the original is bounded:
  the replaced pages' objects exactly (no other page; the catalog only to carry our `/OCProperties`, every other key of it the
  original's, that key ours: a key's value read as the text the delta wrote, a reference by its number within a direct value
  too, never by what it names, since a direct name tree's destinations name pages and a replaced page is ours; REMOVAL 10:
  2610.20030's direct `/Names` failed the proof, and its base of 8 pages of 12, which only a delta holds, was refused), its
  `/Size` not below the original's, and its trailer the
  original's `/Root` and `/Info` (as references) and `/ID` (byte for byte), so that no fresh catalog is pointed at. An original whose
  cross-reference PDF.js recovers on its own (any such message on the original alone: it then indexes the whole file, where an
  unreplaced page may be another object than the cross-reference's) is refused (`delta-xref`), and so is a cross-reference
  entry of a type PDF.js does not know. Any other failure is `delta-proof`.
- **The host's contract.** In the maker child, before it opens a document of its own: `deltaOf(orig, final, { PL,
  replacedPages })` and `proveDelta(...)` with its `readers`, whose documents (arXiv's PDF and our page, opened by the proof with
  the draw's options) it reads and keeps (the documents and texts the page pass is given: `arxiv: { doc, text }`, `ours: { doc,
  ..., text }`, so that `checkOurBase` reads our page's text no more; `ours.text` only where the check reads our page whole, not a
  partial delta's composed document, which it reads anew — none of the 107 deltas measured is partial), PDF.js's verbosity, which
  PDF.js 6 holds for the process, set back to 0 after the proof; then `layerOfPaper({ ..., ours: { doc, bytes, sha256, xref, text, ..., delta: { bytes,
  sha256, replaced, stats } } })` (or `delta: { refused, why }`). The box is one vCPU: a proof beside the page pass, in a thread
  of its own, would save nothing; a reading not made does. The page pass checks it again (shape, bounds, digest, the
  section over `orig`, the head's reader): the head's base becomes `kind: 'delta'` where it checks, else stays `full` with
  `stats.delta: { kind: 'full', why }` — never a refusal of the paper. The page pass binds `replaced` to the delta's bytes: each
  replaced page's object (arXiv's PDF.js document's page refs) among the section's entries, and no other page's. One rule
  for what is laid: **a page laid is a page replaced**. Under a delta the maker reads the composed document (our page where
  the delta replaces it, arXiv's elsewhere: `prefixDoc` with the replaced pages), so an unreplaced page's draw and text are
  the original's, and the line check marks every page not replaced undrawable, so no unit is laid there. The delta is a bundle object beside the units chunks, content-addressed under the CTAG: `deltaKey` =
  `layer/<seg>/<ctag>/<sha256>.delta` (its own suffix: PDF bytes, not JSON), not a `/base/` PDF. A holder of its bytes (the
  Worker before it commits it, a reader before it composes it) checks them with `checkDelta(head, bytes)` (length, digest,
  `deltaSection` over `orig` and its startxref the head's), which the layer entry exports with `deltaSection`.
- **The head** (`format.mjs`): `base { source: 'ours', kind: 'delta', bytes, sha256 (the section's), xref (its startxref,
  composed: after `orig.bytes`), pages, tree, check { pages: [M, N], boxes: 'equal', carried }, replaced, stats }` with `orig
  { bytes, sha256, xref }` required (the original the delta extends, its startxref the delta's /Prev, so that a holder checks
  the section with no read of the original; a `full` head's `orig` takes no `xref`; no `over`). `replaced`: 1-based inclusive ranges `[[from, to], …]`,
  ascending, non-overlapping, adjacent ones merged, within our M pages, 1 to `REPLACED_MAX` 4096 (`replacedWhy`). `stats`,
  integers only: `{ replaced, reused: { fonts, images, forms, other }, included: { bytes, objects } }`. A head without `kind` is
  `full`; a `full` head keeps `check.pages` [N, N]. The catalog's base of a delta: `{ source: 'ours', kind: 'delta', object: {
  key: deltaKey(id, version, sha256), sha256, bytes } }`. `layerDraws` is true for ours of either kind. The extension's run
  binds a delta head (§11.10 item 4) and the layer side takes its copies by the replaced pages (§11.8).
- **Several toplevel sources** (2610.20030: arXiv joins 8 + 4 pages, we compile the first): only with a delta may our pages be
  fewer (`checkOurBase` `toplevels` > 1 and `delta`): the base page's document is ours then arXiv's past M (`base.mjs`
  `prefixDoc`), the boxes compared on our M pages, `check.pages` [M, N], `replaced` within 1..M, the pages past M the
  original's by construction. Every other paper keeps the equal count (`boxes`).
- **Measured** (2026-10-23, the gate pack's 7 pairs and 2602.23285v2, this builder against the spike's): 2,078,038 delta
  bytes over 83,666,965 of originals, 2.48 % (the spike 2.48 %); the largest 0.70 MiB (2307.16209v1); per paper 0.30 % to
  30.05 % of the original and at most 28.5 % of our base page; the proof passes on 8 of 8; two builds give the same bytes; the
  build 15 to 160 ms, the proof 0.2 to 1.4 s (Node). With the readers (2026-10-24, the same 8, wrapped and not): the same
  verdicts (8 of 8 both ways), the same deltas (2.56 %, 3.06 % wrapped); the box's whole-document text reads 5 to 3, the
  proof and the two readings together 0.6 to 1.8 s less CPU a paper in Node (the 147-page thesis 1.8 s), the memory after them
  the same (within 2 MiB). The proof is 85 to 90 % PDF.js's text reads, the object layer 28 to 68 ms (`docs/route/delta.md` §17).

### 19.9 Our pages wrapped by optional content (per-unit erasure, the file side)

The original's ink under a drawn unit is hidden by that unit's own operators, never by rectangles: each unit's ink in our
final pass is put in optional-content groups of its own, ON by default, and the reader sets a drawn unit's groups OFF
(architecture audit item 5; the design note `docs/route/ocg-erasure.md` keeps what is not settled: the reader, the hosts,
staging). LAYOUT stays 16: the layout file does not change; the base PDF's bytes do (wrapping adds a section). BUNDLE5 is `'9'` since the reader side (§11.8): a part carries its cell rules in place of the add-on and no tail, which a reader of 8 refuses, so 8's bundles are prepared again under 9's CTAG (`b9-j6.3.289`); the head's and the catalog's shapes are 8's, and the reader reads 7's and 9's objects.

- **Ownership by marks** (`layout/own.mjs` `ownOf`, pure): a unit's ink is what TeX shipped between its points in our final
  pass, in content-stream order (pageInk with `indices`), in its start point's region (in a column's body or not, at a depth of
  floats: `stream.mjs regionsOf`). Text `u<id>`: from its start mark (`<id>s`, `t<id>s`, `h<id>s`) to its end mark; across
  pages only inside the bodies, but a range outside them from page p to p + 1 at one depth (a continued footnote) is page p
  to the next unit's start in that region and page p + 1 from after the last other unit's end (over more pages: `across`); a
  unit with an end mark alone (a title) from the point before it that is not one of its own placeholders' (a title's
  `$-$` or `:` sets points inside it: 2610.20848v1's title was read from its last one); where that range opens with ink TeX
  set before the title on lines of its own (amsart's date, a journal's header) and its last glyphs spell the title's source
  exactly, those lines are left the page's (no group) and the title is the rest (none trimmed on a line of the title's own,
  nor for a title that opens with a placeholder of no mark of its own: that lead is its ink). A point's name is read in lower case:
  a class that sets a title or a heading by `\uppercase` (spconf's `\section`, amsart's `\title`) sets its marks' names in
  capitals with it (`/axt-H0E ri`). Placeholders `u<id>.p`: `stream.mjs ownedOf`'s entry (the marking's `follows`) read with
  `erasure`, which finds exactly what the maker's reading leaves LOST (the maker's layouts unchanged): the text after a piece
  compared with TeX's quotes as one (OT1 sets `"` as ”: `\S{}"Held fixed"`), rules alone before the text after it the piece's
  own (`\_` before `\allowbreak` is a rule; not one that reaches under the text after it, ulem's `\uline`), an opening alone
  over placeholders of no mark of their own, nothing else between, to the next marked piece's opening
  (`\cls{circle}$\to$\cls{donut}`), and a display after its unit's end mark ending at a later unit's opening as at its start
  mark, where that unit's start mark follows the opening (an end-only title's opening may stand lines into it). Two rules the
  maker's reading shares since LAYOUT 20, so that the layout file's segments of a piece and the wrap's group of it are one
  reading (with the erasure's alone, a display's tail past the maker's segment was hidden with the piece and shown again from
  render B through that segment only: lost): where the text after a piece runs to its unit's next mark (its next piece's
  opening or its end mark), the text is told where the glyphs to that mark spell it exactly (the followsOf `rest`), not where
  its first `WANT` characters first stand, which may be in the piece's own ink (a display's `\text{for every}` before "For",
  a table display's header word before "Positions", a URL's dots or `$=.068$`'s point before the full stop: 2610.16663v1,
  2610.20285v1, 2610.21037v1, 2610.21376v1, 2610.21098v1: 8 rows of 24 papers' layout files move, these units' segments
  alone, no unit laid or not laid otherwise); and a display that ends a footnote (its unit's last piece, after its end mark,
  no mark after it on its page, which the maker left LOST) owns its region's ink to the page's folio (`stream.mjs folioOf`: the
  run ending the page's stream on one baseline, outside the bodies, that spells a page number alone and stands below all else
  by 1.5 of its size), where each of its lines starts 2 em or more right of the footnote's own lines (a display is centred
  or indented; a footnote after it with no mark of its own starts at that edge, its number within 1.8 em of it) and stands
  within 2.5 of its size of the line before it (a line of the page's foot above the folio, a centred copyright line, is
  \footskip below the text block); none for a piece that is no display (an inline formula's or a citation's ink ends with
  it), on a page with no folio (a running foot's text would be hidden with it), or where a line starts nearer or stands
  apart (2610.16663v1 p16). A
  placeholder whose opening point TeX set inside another unit's range, between its start and end marks on one page, owns
  nothing of that unit's (a run-in `\paragraph` is set at the next paragraph's start, after that paragraph's lead
  placeholder's opening mark: 2610.21085v1 p5). An opening point alone at its unit's end, no display, its next mark a later
  unit's start, owns its lines up to TeX's skip before another block, a gap of 1.5 of the page's line pitches or more, no
  further, in both readings (REMOVAL 12, LAYOUT 23, `stream.mjs` `lineEnd`: the last author's `\orcidlink` of 2609.20976v1
  owned the affiliations and the e-mail below the names, to the abstract's label, which no ink unit then made a unit of; at a
  bibliography's leading a reference's `\Eprint` wrapped over lines keeps every one it held, its entry's full stop and an
  entry TeX gave no unit of its own among them, so that no glyph is left no one's). A footnote call is its unit's `.p` too. Label `u<id>.l`: the glyphs on the start's first glyph's
  baseline between the previous unit's end mark and the start, the placeholders' and names' ranges passed over, but the
  closing punctuation a head macro sets after the unit before it — right after that unit's end mark, each glyph within a fifth
  of an em of the one before, the first of the glyph right before it, which is that unit's own (its text, or a placeholder of
  that unit's set after its end mark: a note that ends in a citation, `\axthmark{h…e} \citep{…}`, whose ")." stood a
  citation away from the end mark's glyph and was no one's, 2610.18513v1 p35) — which is that unit's text, and the layout
  file's too (LAYOUT 23, `make.mjs` `headTail`: that unit's line takes it, so that the reader draws it after the unit's
  translation, `layer2.mjs` `tailOf`; it was the next unit's label row, which the reader showed again from the original where
  it stood: the ")." after the note's translation on staging, and a second one at the next line's start where the note ran
  over two) (amsthm's "(Minimum detectable
  PDI)." after a theorem's note: as the body's label, no label's form, it was left the original's ink under the body's
  drawing, 2610.21491v1 p7; its group now hides it where the note is drawn, as the line's erase did before the wrap). Babel name
  `n<occ>`: between `n<occ>.<key>.s` and `.e`, but never over a placeholder's ink (cleveref's "Appendix" inside a `\cref` is
  the reference's). A glyph is one group's: a placeholder's or a name's over the text's, the text's over a label's, the first
  text's over a later. A macro TeX said sets no ink (the marks file's `marking.inkless`, which the wrap is given as it is given
  the texts, `wrapFinal`'s `inkless`, required, null said where the marks are not in hand) is no placeholder of ink here, as the
  maker reads it (REMOVAL 12): JCAP's title in `\boldmath` opens with its text, so its lead's header line is released, where it
  had left the title the original's (`spell`, 2609.20976v1 u0). A unit that opens with a placeholder of no mark of its own (a paper's macro first in it: `\bert`,
  `\aidehuman`) has that ink before its start mark, after its label: on a unit's first line nothing else stands between the
  unit before it and its start, so the run there is split, its longest opening that is a label's form and ends a word the
  label (`.l`), the rest that placeholder's ink (`.p`). Images and forms are no unit's (a form whose ink is all one group's
  is wrapped whole). A unit's text takes its glyphs alone, never a rule: a rule in its range (a footnote's separator, a
  class's rule above a title, an underline) is the page's and stays; a placeholder's rules are its `.p`.
  A table cell (`t<id>s`) takes no label (what stands before it on its line is another cell's); a cell that opens with a
  placeholder of no mark of its own (`\CompletionTokenCap{}`, `\texttt{max\_tokens}`, `\dprime{}`, `\#`) has that ink before
  its start mark, told by its text alone, never by a gap (an unmarked number cell may stand 0.4 em or nothing before it:
  `\tabcolsep` 2pt, `@{}`): the glyphs right before the start, in stream order, that spell exactly the text the marking's
  probe showed the placeholder sets (`wrapFinal`'s `texts`, the marks file's `marking.texts`: TeX's own listing of it, a text
  font's letters, digits and ASCII's punctuation, "1,024", "max_tokens", a formula's math italic letters as themselves and
  any other glyph of it one glyph whatever its text, `INK_ANY`, $d'$ "d" and one glyph; the probe asks about inline code at a
  unit's head too, `marks.mjs leadSamples`; MARKS_SCHEMA 10) or a text symbol's (`\#` "#"), each under `CELL_ABUT` 0.6 em
  from the next, are its `.p` (a footnote's call among the lead's pieces sets its mark between them and the start: a text
  with a formula's glyph is then not read, whose glyph that mark could be)
  (a text symbol's part of it goes with the text, `u<id>`, whatever else the lead holds: the layer draws a symbol as its
  character, never from a crop, and the reader hides `.p` only for a found placeholder; its letters, `\O`'s "Ø", are its
  character in the source the spell check reads); where that text is not known or not there, the cell is
  `marks`. Marks set twice are the unit's first occurrence where that is an end mark alone and every later one a pair (a
  title TeX set in vertical mode, its class setting it again in a line: acmart's ACM Reference Format, 2610.22065v1 p1; TeX
  keeps a name's first destination, so the layout's is that one), the later occurrences' ink the page's. Marks absent, twice
  otherwise (a heading again in a running head, both pairs) or out of
  order, a unit the paper's units lack, a placeholder whose ink cannot be told apart (its range lost: hidden with the text,
  it could not be kept in place, and the spell check reads no symbol), or a unit that opens with a placeholder of no mark of
  its own whose ink still stands, in no group, on its start's line before its start mark (a table's cell, `\bertlarge` first
  in it: a cell takes no lead, the number cells before it on the row being unmarked too; the reader would draw the
  placeholder over that ink): `marks`, each listed in the record's
  `own.leaks` (14 cells on the pack: 1810.04805v2's model names, 1512.03385v1's `\#` columns). The ownership visits at most `OWN_WORK`
  20 million glyphs and boxes (real ranges cost the ink once), over every loop (text, labels, placeholders, names); past it a
  unit is `marks`.
- **The spell check** (what makes "a unit that cannot be delimited shows the original" exact): a unit's `u` glyphs must spell
  its source text, letters and digits alone (`stream.mjs spellOf`: NFKD, marks, TeX's spacing accents U+02C6, U+02C7, U+02D8
  to U+02DD and case dropped, a dotless `ı` and `ȷ` as their letters, and a letter Unicode does not decompose as its base
  letters — `ß` `ss`, `ø` `o`, `æ` `ae`, `œ` `oe`, `ł` `l`, `đ` `d` —, so that a letter symbol reads alike whichever way its
  font maps it (OT1 sets `\l` as a bar over an l, T1 as its own glyph): TeX's accents — OT1 sets `\^e` as `ˆ` beside `e` —,
  ligatures, hyphenation and punctuation are no evidence), or it is `spell`, its groups still written. The source's text is
  its pieces' with a text symbol of no mark of its own as its character (`F\o lner`: 2610.21037v1), outside a unit's lead but
  a cell's. Three readings are tried where the letters differ, each exact in its own terms: a wrapper (an `open` piece) may set
  words of its own before its argument, at most 16 letters at each (siamart's `\funding` sets "Funding:": 2610.20266v1,
  2610.20285v1; read by the places each part may end at, a part at a time, within a million steps a unit — a regular
  expression of the slots backtracked for seconds over 51 letters and seven `\emph`); a title's lead on lines of its own
  (above); and lines of the unit's text that stand on lines of their own —
  no other line of the unit on their baseline where their extents meet — and below every line kept that their extent meets
  on their page (a column's foot, a page's: a line among or above the unit's own may be in the layout's frame of it), whose
  letters the source does not go on with, are left the page's, every other line spelling the source in order and whole
  (REVTeX's e-mail notes at a column's foot in
  mid-paragraph: 2610.20716v1, 2610.21288v1, 2610.21765v1, 2610.20848v1; a folio inside a footnote run on to the next page:
  2610.10069v1), never for a unit with a visible placeholder of no mark of its own, whose ink such a line may be. On the
  sweep's 6 units so released (14 runs: e-mail notes and their marks, an unmarked footnote's URL, a folio) the layout file's lines of the unit
  hold none of the lines left, so nothing is drawn over that ink. Its label must be a label's form (a number
  or an item's mark, maybe a caption's, a section's or a theorem's name before it, the number after a name maybe with a letter
  before it, a supplement's or an appendix's "Table S3:", "Figure A1" (REMOVAL 10: 2610.21924's fifteen and 2610.16663's ten
  centred captions were drawn left, their labels kept and their text centred apart; a letter and a number alone, "A100", are
  no label), in brackets or with a stop, a dash or a bar after it) or empty; a theorem's note (a unit the front end read in a
  head's brackets, `bracketed`) may end it in the bracket its head opens the note with ("Definition 5.1 ("), and the head's
  joint after the babel name that leads its unit, its punctuation alone (amsthm's "." after "Proof", IEEEtran's "—" after
  "Abstract"), is a label too (REMOVAL 11, §19.11: both were left the original's ink, their names English); where it is not and
  its glyphs stand apart from the text's, the label is left the original's ink (`labelKept`: no `.l` group, the body alone
  drawn; the coordinator's amendment of 2026-10-28), else `spell`.
- **The wrap** (`layout/wrap.mjs` `wrapOf`): our bytes and ONE incremental section of their cross-reference kind
  (`appendSection`): each wrapped page's dict again under its number, `/Resources` our page's with `/Properties` mapping
  `/axt<group>` to its OCG, ONE new content stream (its pieces joined, deflated at a fixed level: the same inputs give the same
  bytes); `<< /Type /OCG /Name (axt:<group>) >>` per group; the catalog again with `/OCProperties` (`/D << /BaseState /ON /ON
  [ours] /Order [] >>`, or a foreign one's kept, ours appended to its `/OCGs` and `/ON`). A BDC goes only between whole
  operators, and each BDC and its EMC share a stream, a q depth, a text-object state and a depth of marked content: a run is
  one group's operators with only state between them, closed at q, Q, BT, ET, any marked content, an inline image, a shading
  or ink not its group's; a rule's path object is wrapped from its first construction operator to its painting; the `ri`
  points stay. A show two groups share is split as the remover's hide mode splits one (E4's variant (a): a number stays with
  the chunk before it, codes kept): no re-anchoring. Content streams name properties, never OCG objects (the later export
  re-points names, §3.3 of the note).
- **Page refusals** (the page left unwrapped, its units `page`): it does not align with PDF.js's reading (remove.mjs
  `alignPage`; a soft mask's content, an ExtGState's `/SMask` that PDF.js lists as a group, is no painted ink of the page's,
  as an annotation's appearance is not: alignOf counts no path or show of it, pageInk's `indices` give none a place —
  2610.19159v1 p3's figure was refused for it, REMOVAL 9), passes the walk's bounds or the wrap's own (`WRAP_DECODED_PAGE` 32 MiB of its content streams decoded,
  `WRAP_HELD_PAGE` 48 MiB of every operator's heap by remove.mjs COST, about 300,000 operators: each read of the page — the
  wrap's, the proof's of the new stream, the proof's of the unwrapped page — under these bounds of its own, in turn, so that a
  plot of millions of path operators is a refused page and never the process), fails its proof (below), or fails in any
  other way (anything thrown but a failed allocation is the page's, never the paper's),
  its own `/Properties` already name a group of ours (the page's own entries are kept, never dropped), holds a form partly owned, an owned run in a clipping text mode (Tr 4 to 6: hiding
  the only clipping run lifts the clip; Tr 7 glyphs are never ink, so never owned), a split in a vertical font or a Type 3 font
  without widths, or PDF.js read it past its bounds. Past `GROUPS_PAGE` 512 groups or `SEQUENCES_PAGE` 2000 sequences the
  page's `.p` and `.l` groups are merged into the text's (a unit with a placeholder there `bounds`), and refused if still past;
  past `GROUPS_DOC` 8000 groups the later pages are refused.
- **The proof** (in the box, every wrap). Of each page, before it is written (a page that fails is refused, never the
  paper): its new stream lexed again within the page's bounds, every BDC of ours named by its groups, none inside another and
  closed at its depth and state, none left open (the page's own marked content need not balance: our runs lie in none of it);
  its operators, ours taken out and each split show's chunks joined, the unwrapped page's (operators, operands, codes and
  numbers in order); and the deflated bytes written inflated back to that stream. Of the paper: the section read back
  (`deltaSection`: each entry at its `n g obj`, `/Prev` our startxref) and the wrapped document read again by the object layer
  (catalog, page dicts and resources ours but `/OCProperties`, `/Contents` and `/Properties`; each page's own `/Properties`
  entries kept as they were and ours beside them; every group listed and ON). A failed wrap is the paper's: `wrapFinal` gives `{ refused: 'wrap-parse' |
  'wrap-proof' | 'wrap-bound', why }`, the host passes `ours: { refused: 'wrap', why }`, the head's base is arXiv's with `why:
  'wrap'` (a LAYOUT_REFUSED code).
- **Both forms** are made of the wrapped bytes: the full base IS them (its head's `bytes`, `sha256`, `xref` theirs); the delta
  copies their streams verbatim and carries their catalog's `/OCProperties` alone (19.8). Every check that judges our compile
  reads the same pass; wrapping changes no glyph. The page pass numbers glyphs on the wrapped streams (one stream a page).
- **The host's contract** (the maker child, before any document of its own is open): `wrapFinal(final, { PL, getDocument,
  documentOptions, OPS, units, deflate, inflate })` → `{ bytes, xref, sha256, stats, unhidden, labelKept, pages, own }`
  (`documentOptions` the box's: the lite worker, `maxImageSize: NO_IMAGE_PIXELS`, so that the ownership's read of every
  page decodes no image: a stock read of the 46 MB pair peaks at 3 GB of native memory); then `deltaOf(orig, bytes)` with
  every page replaced that the wrap wrapped (the default) and `proveDelta` (its `readers` reading the wrapped bytes' document, §19.8); then `layerOfPaper({ …, ours: { doc (of the
  wrapped bytes), bytes, sha256, xref, delta, wrap: { stats, unhidden, labelKept, pages } } })` (a delta that leaves a wrapped
  page arXiv's is refused there, `delta-shape`, beside deltaOf's and the proof's own check on the bytes: a unit's group on it
  could not be hidden); the record notes `own` (`{ units, unhidden: { marks, across, spell, page,
  bounds }, spell: [ids, at most 64], labelKept, leaks: { count, units: [ids, at most 64] } }`: `leaks` the units left the
  original's because ink of theirs lies outside every group, so that the next such case shows without pixels). `units` (required) are the paper's SOURCE units, an array each entry of
  which has a source text or pieces (missing, a hole or an entry with neither a TypeError; `null` said asks for no spell check,
  the lab's alone); `deflate` and `inflate` are required (the written bytes are read back); `pages` is required beside the
  lists, the wrapped pages as ranges within our pages and as many as `stats.wrapped` (`pipeline/live.mjs openPaper`'s,
  the page pass's `source.units`): a translation's (text pieces `tr`) holds neither the text after a placeholder its ink ends
  at nor the source the spell check reads, and is refused (TypeError).
- **The head** (both kinds): `base.stats` gains `{ wrapped, refusedPages, unhidden: { marks, across, spell, page, bounds },
  split, groups, labelKept }` (a delta's own counts beside them; every unit counted); `base.unhidden` `[[unit id, code], …]`
  by rising id and `base.labelKept` rising ids, none in both, of the units with a group in the document alone (a unit with
  none is the original's by construction): so each holds at most `GROUPS_DOC`, `UNHIDDEN_MAX` 8000, and a long paper cut at
  `GROUPS_DOC` keeps its base, its later pages unwrapped; checked by `delta-wire.mjs wrapWhy` on both sides for their shape and
  that the counts are at least the lists' (that a unit with a group and no list entry is the reader's to hide is `wrapFinal`'s
  word: no head reader knows the groups). A page merged for its bounds makes a unit with a placeholder or a label there `bounds`. A unit is the reader's to hide iff the config holds `axt:u<id>` and it is in neither
  list. A head without them is an unwrapped base. The cell rules the add-on manifest carried are each part's `rules` now (§11.8).
- **Measured** (2026-10-23, the gate pack's 7 papers in Chinese and 2602.23285v2, the sources' units): every page wrapped
  (290/290, 0 refused, the proof passing on all); `spell` 1 unit of 1,806 (2608.04322v1 u0: its journal header over-taken),
  `marks` 38 (24 the title block's authors and `\thanks` notes the marker does not mark, the engine lane's item; 14 cells that
  open with an unmarked macro), `across` 0, labels kept 0 (the earlier 9 were each a label and a lead macro, now split); ownership equal to today's geometric ownership on 1,740 of 1,806 units (96.3 %: the rest the marks' own over
  today's residue, a table's row header today calls a cell's label, a babel name, the unmarked authors); 54 shows split; 230 to
  981 groups a paper. The wrap 0.4 to 1.9 s a paper in Node with PDF.js's lite worker (the 147-page thesis 1.9 s), +165 MB
  at most beside what the maker holds (the 46 MB pair); the wrapped base 0.4 % to 23 % larger (the thesis 3.08 to 3.79 MB);
  the deltas 2,561,390 bytes over 83,666,965 of originals (3.06 %; 2,139,403 unwrapped, 2.56 %: 1.08x to 1.53x each; layers
  matched by identity cost 1706.03762v7's figures, whose forms name arXiv's layers, 61 KB either way), the largest 0.87 MB
  (2307.16209v1), the delta proof passing on 8 of 8. The lab gate (`lab/pdf/spikes/ocg-gate.mjs`, its run in
  `lab/pdf/records/ocg-gate.md`) in Chromium, GPU and CPU canvases, every page of the 8: all groups ON is our page, 0 px
  outside split glyphs and image edges, 0 px inside the split glyphs; text and labels OFF equal the remover's cut of the same
  ownership on 247 pages (measured at 85fdc442, while the remover was still there; that comparison ended with its deletion), 0 px outside image edges, and the image-edge pixels the two change equal (72 on GPU, 31 on CPU).
  Chromium differs from itself on two pages in earlier runs of one long-lived browser (2608.04322v1 p9 GPU, 2609.26457v1 p2
  CPU: our unwrapped page against itself), 0 px from fresh documents.

### 19.10 Content classes and the ledger (stage 1 of `docs/route/orphan-text.md`)

Every text glyph of our final pass belongs to exactly one content class, and each class has one translation path, made once on
the server, and one reader toggle (the owner's rulings of 2026-10-25: always, heads and feet, tables, figure text, references,
names, never). The one table is `rules/content-classes.mjs` (`CLASSES`, `TOGGLES`; a unit's class by its kind, `unitClass`, the
same on the server and in every reader, from what the bundle's units already carry). The maker child's `wrapFinal` returns each
paper's ledger (`layout/ledger.mjs` `ledgerOf`, `ledgerSummary`: each class's glyphs and letters, the document's letters, its
orphan letters), read from facts alone: a glyph's owner (own.mjs), its region (in a column's body or not, a float's depth), the
babel names' points that open a list or the bibliography, stream order on the page (the head before its first mark, the foot
after its last, on one baseline, as `folioOf` reads a folio), whether it is inside a form XObject (an included PDF: pageInk's
`form` with `indices`), and its face's family (math, typewriter). No layout file and no version changes: nothing on the wire,
nothing in the compile. What no class explains is an orphan: the sweep's invariant (o) is no orphan letters (`orphanRows`, rows
in the sweep's shape), run in the lab by `lab/pdf/spikes/ledger.mjs` (record `lab/pdf/records/ledger.md`). The class `figures`
is built (§19.12): a glyph a figure unit owns (`f<k>`) is the ledger's `figures`, cut before the ink units, so that none of them
takes a figure's text.

**The ink units (stages 2 and 3, BUNDLE5 `'10'`, LAYOUT `'21'`, REMOVAL `'11'`).** Text no source unit owns — the running heads and
feet, the contents and the lists, a note with no unit, prose the front end did not cut — is made units of our own glyphs in the
wrap (`layout/ink-units.mjs`), from the ledger's lines: a head's line one, a contents entry or a block one paragraph of TeX's (the
layout compile's point `q<n>` at LaTeX's para/begin, inside the paragraph's indentation box so that no paragraph's list
changes, which pageInk keeps apart from the marks' points as `paras`; a paragraph with no indentation carries none and reads
as the one before), each of its
class's kind (`inkheads`, `inkcontents`, `inknotes`, `inkorphan`, after the source kinds in UNIT_KINDS; `inknames` a block
most of whose letters are an author unit's words, of the names toggle as that unit is), its numbering, leaders
and page number left the original's ink, its math and typewriter runs (and a web address in any face) kept placeholders, and
each run of its words in another weight, slant or colour than most of its glyphs hold a group of the commands that set it
(`\textbf{`, `\textmd{`, `\textit{`, `\textup{`, `\textcolor[HTML]{…}{`, rule 9, LAYOUT `'23'`), as a source unit's groups are,
so that its translation keeps each run's style (the release sweep of 2026-10-25, (d): a theorem's bold head before its regular
note, a reference's italic title, a coloured term, all drawn in the unit's one style). One
whose letters and placeholders are a source unit's (a heading first), else an earlier ink unit's (a running head), echoes it: its pieces that unit's, its row that unit's row under its own id, never translated
itself (`rows.mjs` `echoRows`, `layerIds`). Its glyphs are claimed under its own groups, `u<id>` and `u<id>.p`, so the reader
hides it as any unit; one the wrap could not hide alone (its page not wrapped, its placeholder's group merged: `ink.off`), or on a
page not drawable, keeps its id (which names its groups and which an echo names) and is laid nowhere. The page pass carries them (`pipeline/ink-pass.mjs`, from the host's `ours.ink`): in the bundle's units
after the source units', in a chunk of their own (`INK_UNITS_FORMAT` `'2'`, a seventh element, the echo; the source units' chunks
byte for byte as before), on the left by arXiv's tokens on their lines, in the layout by the wrap's rows. An ink unit's text is
its own alone (LAYOUT `'23'`): a source unit's label row that meets it goes from the layout (`layoutWithInk`). The maker reads a
label off the glyphs left of a unit's start mark, and the wrap leaves one with no label's form in no group (`labelKept`), where
an ink unit then claims it; the reader shows a label row its unit does not draw again from render C, every group shown, so that
row put the original back under the ink unit's translation (the release sweep of 2026-10-25, (c): SIAM's "AMS subject
classifications." before its codes, 2610.20266v1 p1; a theorem's head whose note is a citation, "Definition 1 ([TT])", whose
body's label it was; 2610.11256v1's bold heads before a table's cells). The reader's toggles
are an option of the layer's open (`classes`, `TOGGLE_DEFAULTS`); a change of them is an open again over the same documents, parts
and rows (`layer-side.mjs` `setClasses`), each laid page kept until the new door's commits: 81 to 384 ms to the two pages in view
over 14 page pairs (the layer gate's jump, `--perf`). The web's half is `docs/route/orphan-text.md` §8.

### 19.11 Structural names: a head's, a reference's, in the target's words

A theorem's head, a proof's name and the names cleveref and `\autoref` generate are TeX's text, not the author's sentences:
the translator never sees them, so the layer sets them itself, in the names TeX's own packages give the target, never in a
table written by hand (the owner's ruling of 2026-10-25). The names are `rules/tex-names.json`, which
`lab/pdf/spikes/tex-names-make.mjs` writes from the compile image's TeX Live files (each file's digest in it; `--check` makes
it again and compares): translator's theorem dictionaries (beamer's; ctex's `ChineseUTF8` for Chinese) for a theorem-like
name, cleveref's language definitions (`\Crefname` and `\crefname` by counter type, number and branch, and the conjunctions)
and hyperref's `\HyLang@<language>` for a reference's, ctex's own names (`ctex-name-utf8.cfg`) for Chinese, and babel's (the
layout rules' labels) for a float's or an appendix's in a target that has neither; TeX's text decoded by LaTeX's own tables
(`t1enc.dfu`, `t2aenc.dfu`, read backwards). A name no package gives in the target is left the original's (`rules/tex-names.mjs`).

- **A label is what the head macro set** (`layer2.mjs labelOf`, `tex.mjs`): whether a unit begins with text is its source's
  (`unit.source`, rows.mjs `unitOf`), never its translation's. A paragraph that opens with a reference, "\Cref{prop:lbCs}
  below shows how …", whose Chinese begins with "below" and sets the reference second, had cleveref's "Theorem 5.1" read as a
  theorem's label: kept as the original's ink at the line's start and drawn again inside the translation (2610.18513v1 p19
  u156). The code is production's (699b4aea's `labelOf` reads the translated pieces alike), not #460's or #462's.
- **A theorem-like head** (`layer2.mjs headLabelInTarget`, `run.mjs headOf`): the layout file's label of a theorem's body
  or its note, read from the page's characters in its box (the unit's own part of the page may leave a head's first letters
  to the unit before: "finition5.1("), its name in translator's word for the target, its number and punctuation the
  original's, the name and number in the style of its first character and its punctuation in its last's; after an opening
  bracket the note follows with no space ("Definition 5.1 (s-conductance)." in Chinese: ctex's word for
  "Definition", " 5.1 (", the note's translation, ")."). The wrap gives it a group to hide (REMOVAL 11, §19.9): a note's head ends in the bracket its head opens the
  note with, and the joint after a babel name that leads its unit (amsthm's "." after "Proof") is that unit's label, so that
  the name's lead is drawn (§11.8, `jointOf`) where the original's "Proof." stayed English.
- **A generated reference** (`layer2.mjs renameRefs`, `GENERATED_REF`; `renameRuns` in `tokensOf2`): a `\cref`, `\Cref` (and
  their page and name forms) or `\autoref` drawn as its page's text (`orig-text`) has each name and conjunction it prints
  replaced by the target's, its numbers and punctuation kept, each run in its own colour (cleveref's black "Theorem", its
  linked blue "A.17"); a theorem-like name as its head reads, so that a reference and the head it names agree; one any part of
  which has no word in the target is the original's whole, never half in either language ("Section A.7", "Sections 5.2.1,
  5.2.3 and 5.2.4" in zh: no package gives Chinese a section's name or an "and"). A citation's note ("[Ascolani et al., 2026,
  Lemma 1]") is a name and its number the same way, the cited work's own text as it is. A name the source writes itself
  ("Theorem~\ref{…}") is the translator's text: over the 58 papers in Chinese of the sweep's cache, 564 of 567 such names were
  translated, against 0 of 981 generated ones before this rule.
- **Measured** (2026-10-25, base `next` 37d84180, the 25 local papers whose zh rows the sweep's cache holds, each paper's
  bundle made by both engines on the production path, TL2025): the units' hashes are every one kept (168 local sources); the
  wrap's `labelKept` 298 → 96 and its groups 11,126 → 11,328, `unhidden` the same on every paper, every page of every group
  shown our page (the ocg gate's G1, CPU canvas: the same 4 pages differ on both sides, from run to run); the sweep's checks
  in Chromium, no unit gained or lost (`a` 41 → 41), `c` 10 → 8 violations (2610.21376v1 p4 u30, u31: a note's head now its
  label), `e` 15 → 9, `m` 25 → 24, `j` reviews 148 → 139. 2610.18513v1 in zh: p18 u150 and p19 u157's heads, p19 u156's
  "Theorem 5.1" drawn once, its and p18 u153's "Theorem A.17", the citation's "Lemma 1" and p7's "Proof." in Chinese;
  "Section A.7" and "Sections 5.2.1, 5.2.3 and 5.2.4" as the paper prints them.
- **Limits.** Japanese, Korean and Traditional Chinese have no theorem dictionary in TeX Live (translator has none, ctex's are
  Simplified Chinese), and no target outside cleveref's languages has a section's or an equation's name or an "and": those
  heads and references stay the original's. A name translator's dictionary lacks ("Assumption", "Conjecture", "Claim") stays
  English in every target, until the paper's own name units give it a word (§19.14).

### 19.12 The text inside vector figures (the content class `figures`, stage 5 of `docs/route/orphan-text.md`)

The labels, axis titles, legends and annotations a figure draws as glyphs are units of their own, made from our final pass's
glyphs, translated with the paper's units whatever the reader's switch, and drawn in each original run's box; the switch shows or
hides what was made. The owner's rulings of 2026-10-25 bind it: the format is ours (exact positions from our compile's glyphs,
each original's ink owned and hidden by its own optional-content group, the text in its original's box, no double ink, no overlap
with the figure's lines), the translation's quality the provider's; translated once into the shared cache, shown or hidden by
the toggle with no prepare again; bitmap figures (OCR) are another lane.

- **Which glyphs** (`layout/figure-text.mjs` `figureUnitsOf`, in `wrapFinal`, after `ownOf`): those no unit owns inside a figure
  our compile set — an included PDF's (shown inside a form XObject: pdfTeX includes a PDF, and an EPS made one, as a form), or a
  TikZ or pgfplots picture's (between the points `zs` and `ze` the layout compile now sets inside pgf's `\pgfsys@beginpicture`
  and `\pgfsys@endpicture`, in the picture's own box: `marks.mjs POINTS_TEX`, LAYOUT 21; pageInk keeps them apart, `pictures`,
  so that no reader of the marks or the ownership sees them). A glyph set turned is read too (pageInk's `turned`: its baseline,
  direction, size and band), so that a y-axis title keeps its turn.
- **Cut** into runs, one a label or a line: in stream order, one font, size, colour, direction and figure (one form painted, one
  picture: pageInk's `fid` and `pid`, so that two figures side by side never make one label), one baseline (`RUN_DY`
  0.05 of the size across), at most `RUN_GAP` 0.6 of the size past the run's end; a run spelling a word (two letters together)
  in no math face is a unit, its text the glyphs' Unicode (NFKC), a space at a gap of `SPACE_GAP` 0.15 em. A number, a tick's
  label, a letter alone or a formula stays the original's; so does a run a glyph of which is not wholly inside the clip in force
  (an included figure's viewport: pageInk's `clipped`; 1706.03762v7's cropped attention figures held two such titles) or inside
  its page's box (a row's origin off its page is one no part's reader takes, `checkFigures`).
- **Its place**, our glyphs' and nothing estimated: its first glyph's origin, its direction, its box's length along it, its band
  (its glyphs', at least `DRAW_BAND` [-0.15, 0.88] em: the line a CJK translation is drawn in). Its anchor is read from the
  figure's ink nearest it along its baseline within `ANCHOR_REACH` 1.5 em, a path by its segments (pageInk's `shapes`, a curve as
  eight chords, a fill's subpaths closed, at most a million numbers a page): `start` where the ink before it is nearer by
  `ANCHOR_RATIO` 2 (a legend's line sample, an arrow it labels), `end` where the ink after it is, else `centre`. A unit whose
  band meets other ink inside its box (another glyph, a stroke's segment widened by its half line width, a fill's edge, an image
  or a shading not holding the band) is `crowded`, left the original's: a translation there could cover that ink.
- **Its set and its room** (the owner's rule of 2026-10-29, after 2010.11929v2's legends in Chinese: "All" drawn smaller
  than the other entries, "Patch size" starting further right than its column, "Head 3" smaller than "Head 1", each label
  fitted to its own box and anchored by what it read alone; `figure-text.mjs` `setsOf`, `roomsOf`): the labels of one group are set at one size, the original's by default; each keeps the original's alignment
  and anchor; a translation may take free space, never touching other ink nor leaving its figure; only a group that cannot
  fit shrinks, all of it by one factor, never a label alone. A **column** is the runs of one figure, size and direction whose
  starts, ends or middles agree within `ALIGN_TOL` 0.08 of their size, two units or more among them; its other runs, a
  number or a "…", count for its edge (2010.11929v2's "Head 1/2/3", one length, read their end alone, the frame being
  nearer after them than their markers before; the column's "…" shares their start alone). A unit in a column takes the
  column's edge as its anchor — the edge the most of its runs share, a tie broken by the readings of its units, then
  start, end, middle — whatever it read alone: a legend's longest entry with its frame right after it ("Patch size",
  0.4 em before the frame and 0.8 em after its sample) read as centred. A number alone at a word's edge makes no column,
  so an axis's title over a tick's label stays centred. A **set** (`set`, its first unit's k) is the units of one column of
  one edge and those of one figure, size and direction on one baseline (an axis's words, a legend laid in a row, the two
  panels' x titles of one figure), joined. A unit's **room** (`before`, `after`, PDF units along its direction) is the free
  line beside its box: to the nearest ink its band meets (a glyph, a stroke, a fill's edge, an image, the edge of a ground
  it stands on; a path's lines only as far as its box, its clip's, shows them), `ROOM_CLEAR` 0.15 em short of it; on a
  ground whose lines are not known (a path past the page's shapes, a rounded node, a frame's stroke) a band's height inside
  its edges, on an image's or a shading's none (2602.23285v2's caption over a screenshot); never past its figure's extent
  (pageInk's `figures`: every box painted inside the form or the picture, with its glyphs); half the line to another unit
  whose band its own meets, the other half that unit's; `ROOM_MAX` 6 em at most. Crowding and the anchor read alone are
  read within the reach as before, so the same units are drawn and the base is the same bytes.
- **Its ink** is its own group `f<k>` (`layout/wrap.mjs`): its runs wrapped where they are shown, in the page's stream, or in the
  stream of the form an included PDF is, that form written again once in the wrap section under its own number, its dict ours but
  its stream's keys and `/Resources`, its resources its own with `/Properties` naming its groups (beside a form's own entries:
  Illustrator's layer `/MC0` kept). A figure's group is left out, its unit the original's, where its font gives no Unicode a reader
  can trust (`remove.mjs unicodeOf`: no `/ToUnicode`, and a `/Differences` naming codes, `g41`, or an Identity CMap: `unicode`),
  where its form is painted twice on its page, has no resources of its own, holds a unit's ink, or was written again by an
  earlier page (`shared`), and where its page passes the wrap's bounds with it (`bounds`: the page is then wrapped without its
  figures, so a figure never costs a page). The proof proves each form written as it proves a page (its BDCs balanced, its
  operators, ours taken out, the form's own) and the document's graph (`graphWhy`: each form's dict and resources ours but its
  stream and `/Properties`). `wrapFinal` returns `figures` { units (the drawn ones: page, group, text, font, size, fill, angle,
  x, y, ux, uy, length, ascent, descent, anchor, form, set, before, after), stats (units, drawn, each why, letters, forms,
  sets, grouped, aligned) }; with `figures: false` none (the lab's A/B). REMOVAL 11 (shared, unreleased, with the ink units');
  the sets and rooms change no byte of the base.
- **On the wire** (BUNDLE5 10, shared with the ink units'): each drawn figure unit an ink unit of kind `inkfigures` (its class
  `figures`), after the source units' and the other ink units', in their chunk (`INK_UNITS_FORMAT`, its echo null; `page-pass.mjs
  figureUnits`: its one text piece our glyphs' text, KEPT where it is only names, as a table's cell of names is, mt.mjs isName
  against the paper's running text; none over arXiv's base, on a page the line check does not draw, or where the chunk would
  pass a head's bounds: none of the paper's then, `afterFit`), so that
  it is translated as any unit is (`toTranslate` takes it; no sentence cuts, `NOT_RUNNING`); and its place a row of the part of
  its page (`figures`, `layer-proto/figure-rows.mjs`: [id, group, page, x, y, ux, uy, length, size, ascent, descent, anchor,
  fill, font, set, before, after], checked by `partShape`: ids rising, each a unit of kind inkfigures, on the part's pages,
  within their views, its set a group's number at most its own, its room 0 or more, none where the part has no layout; the
  key there only where the part has one, so that a part of none is 10's as the ink units write it, and none in a part of 7's
  or 9's). The set and the room are BUNDLE5 11's (CTAG `b11-…`: a bundle of 10 is prepared again); a part of 10's rows, 14
  values, is read each unit its own set with no room, as 10 drew it. The source units and their chunks are as before, so
  PIPELINE stays as it was and no translation is asked again. The host passes `ours.wrap.figures` (the web's `ourWrap` adds
  `figures: r.figures`).
- **Drawn** (`run.mjs paintFigures`, once a page's figures' rows are in: the page waits for them as for its units', `rowsFor`
  ranks them with its page): its translation's text in runs by script (`layer2.mjs figureRuns`: its CJK characters, by the
  rules' class, in the target's CJK face, every other, a Latin word, a digit, a space, in its font's family's Latin face, as a
  unit's words are; the CJK faces the web serves hold no Latin letter or digit, so that one CJK face for the whole text was
  refused, `served`, and 2010.11929v2's "Width MLP", "Head 2" and Figure 7's title stayed the original's, Microsoft's
  translations of them keeping "MLP", "2" and "RGB" beside their Chinese), of its font's weight and slant, in its fill, on
  its run's baseline, turned by its angle (`layer2.mjs svgOfFigure`), by the fit rule (`layer-proto/figure-fit.mjs` `fitFigureSet`), set
  by set: each translation from its anchor's edge (a start one from the original's start, an end one to its end, a middle one
  about its middle), into its room on the side its anchor grows to (a middle one the same either side); every unit of a set at
  one size, the original's where each fits, else the one factor its tightest translation needs, to the rules' last floor
  (`floorMin`, 0.6) at most; a translation that would need less is the original's (`unfit`), and the rest of its set keeps the
  factor the others need. Its group set OFF in render A. Left the original's: no row (`untranslated`), a translation that says its source again (`same`), no group in
  the document (`unhidden`), a face's refusal, `unfit`; a label of names (`kept`). The run's `figures` lists each. A page is
  ready once its figures are painted, not while a face they wait for loads.
- **The switch** is the toggle `figures` of the reader's toggles (§19.10: `openLayer({ classes })`, the layer side's `classes`
  and `setClasses`, which opens the door again over the same documents with every row held, so that nothing is prepared, fetched
  or translated again): a figure unit's row is taken, and its figure drawn, where it is on; off, it is the original's, as any
  unit of a class not shown. Its default, `TOGGLE_DEFAULTS.figures`, is on (the owner's, 2026-10-25, having seen the web's
  settings: a figure's text is shown translated, and a label that does not fit stays the original's). The extension's reader passes
  its figure switch (`image.enabled`, the reading options' image switch, §9.1, which the HTML page's figure text shares) as
  `classes.figures`, and follows the switch as it lands, from here or elsewhere. A form one page wrote again and another paints: the other
  page's figures in it are `shared`, the original's, and its render shows the form's groups ON, since each render sets the
  visibility of its own page's drawn groups alone (visibility.mjs).
- **Measured** (2026-10-25, `lab/pdf/spikes/figure-gate.mjs`, record `lab/pdf/records/figure-gate.md`): on the gate pack's 7
  bases (the pack `09208b43`, LAYOUT 21: 1810.04805v2's pgfplots axis between its points), 846 of 1,030 figure units drawn, 184
  crowded, 60 forms written again; on 23 of the 25-paper set compiled again under LAYOUT 21
  (`lab/pdf/spikes/figure-final.mjs`; five of them TikZ or pgfplots papers), 1,216 of 1,469 drawn, 253 crowded, 99 forms; none
  of a font of no Unicode on either. Every group shown is the page wrapped without the figures (G1, 13 pixels of split shows
  within the ocg gate's allowance), hiding the figures changes pixels inside their own bands alone (G3f 0), every drawn band
  loses its ink (no double ink, D 0) and is then blank (no stroke or other glyph a translation could cover, O 0). A form written
  again is copied into the delta whole: two of the pack's deltas pass their bound with the figures and are held `full`
  (2307.16209v1, 2609.26457v1), none of the 25-paper set's. The sets, rooms and runs by script (2026-10-29, the pack
  `e8e9eeb5` and 24 of the 25-paper set made again on this engine, the record's run of that day): the wrap's every count is
  `next`'s, G1, G3f, D and O 0, and R (each drawn unit's room blank once the figures are hidden) 0; 944 of the pack's 1,030
  units and 1,159 of the set's 1,469 are in sets of two or more, 138 and 223 of them anchored by their column. Over a model of
  zh the labels drawn go from 589 to 830 of 846 on the pack and from 905 to 1,177 of 1,216 on the set, and the sets of mixed
  sizes from 16 and 43 to 0; over Microsoft's answers on three papers (1512.03385v1, 1810.04805v2, 2010.11929v2) from 107 to
  265 of 265, 80 to 224 at their full size, 6 sets of mixed sizes to 0.

### 19.13 References and names, and the reader's toggles (stages 4 and 7 of `docs/route/orphan-text.md`)

The owner's rulings of 2026-10-25: we own format correctness (positions from TeX, the original's ink owned and hidden by its own
groups, line fit, no double ink, structure kept) and the provider owns translation quality; every class is translated once, on the
server, into the shared cache, and a reader's settings only show or hide it. And of 2026-10-28, the references and the author names
decoupled, each toggle's duty its own: "references" governs the bibliography alone, each entry whole, the names inside an entry
its own; "names" governs the author names under the title alone; the affiliations, addresses and the e-mail line are always
translated.

- **Entries are units, each whole** (`source/latex-front.mjs` `bibliography`; PIPELINE 29, and PIPELINE 30 one unit an entry). The
  ground truth is the bibliography's TeX the compile reads: the paper's `thebibliography`, or the job's `.bbl` where
  `\bibliography` reads it (BibTeX's output, which the package holds or the prepare's first pass makes, below; never biber's data,
  which is biblatex's and no text). Each `\bibitem`'s entry, from its key to the next `\bibitem`, is one unit of kind `reference`
  (class references), its names its own: never set in two pieces styled apart, and no guess of where its names end, which
  PIPELINE 29's `refnames` made (a committee's name in the authors' block taken for its names up to the title's words; a title
  with a comma taken for its authors). A `.bbl` is read in the encoding the paper declares, as its own TeX is. The
  label (`\bibitem`'s optional argument, set in the list's label box) and the key are no piece; what a style writes before the
  first entry is no unit, nor REVTeX's `\BibitemOpen` and `\BibitemShut`. In an entry a number (a year, pages, a volume and its
  issue: a token of a digit and no letter, white space or a piece that sets none on each side) or a DOI written out, letters and
  all (`10.1007/s00125-020-05190-9.`, after `doi: ` or `doi:`) is a placeholder of the class `number` (`layout/marks.mjs`, both
  marks, MARKS_SCHEMA 11), the original's ink as a web address and a formula are. An entry is marked as the body's units are, in
  the bibliography's own TeX (the `.bbl` written back marked: no BibTeX runs over it), so its place, its ink and its groups are
  TeX's (LAYOUT 22: UNIT_KINDS `reference`; `refnames` kept at its index, so that a file of 22 reads as it was). The entries' units
  are numbered after every other unit of the source (`entriesLast`), so that no other unit's number moves: a translation held by a
  unit's number (the gate pack's frozen ones) is still its unit's. The probe asks about an entry's commands after every other
  unit's, so the body's marks are what they were. A bundle of 29 a reader still reads keeps its `refnames` units: their class is
  the references' (`UNIT_CLASS`), the entry's two halves shown or hidden together, and "names" the author block's alone.
- **A bibliography BibTeX makes is a shipped one** (`layout/paper.mjs` `madeBibliography`, `bibliographyKept`; the owner's ruling of
  2026-10-28). A paper that names `\bibliography{…}` over `.bib` files its package holds, loads no biblatex and ships no job's
  `.bbl` (102 of the local sources) had no entry unit: the units were cut before any compile, and the `.bbl` was first written
  inside the marked compile, unmarked. The host now asks, before it tells the paper's units, one pass of the unmarked original
  (`guard.mjs` `unmarkedFiles`: the paper's own files) as a draft with the bibliography step (`bibtex`, CM's first draft's
  request: BibTeX on the job's aux), its files returned; the `<job>.bbl` it wrote, a `thebibliography` with a `\bibitem`, is the
  job's `.bbl` the paper is opened again with (`live.mjs openPaper`), and from then on it is a shipped one (`meta.bbl`): written
  back marked, no BibTeX in the marked compile. No pass is made, and the paper stays as it was, where it ships its `.bbl`, names no
  `\bibliography`, loads biblatex, or lacks a `.bib` it names (latexmk -norc runs no BibTeX then, nor does the marked compile);
  nor is its `.bbl` taken where the pass does not run through or returns no files, writes another job's bibliography beside the
  main one's (chapterbib, multibib, bibunits), writes a `.bcf` (biber's), or writes no `\bibitem`. The paper's other units must be
  the same with the `.bbl` and without (every unit before the entries and every name after them, the bundle's byte for byte,
  their spans too), else it stays as it was (`moved`): so `\bibliography` ends the paragraph before it whether the `.bbl` is there
  or not (TeX's `thebibliography` is a heading's paragraph end, and a `\bibliography` with no `.bbl` sets nothing), which moved 7
  paragraphs of the local sources by one placeholder, their ids kept. The units the host tells are then a shipped `.bbl`'s:
  the source's, the entries, the paper's names; nothing is announced twice, and no contract between the host's children changes
  but the `.bbl` handed to the one that opens the paper again (the web's prepare: the hand-off's `bbl`). The host decides the
  paper's TeX Live tree before the pass, so that the entries are the `.bbl` of the tree that compiles it. Measured: below.
- **Not units:** a bibliography biblatex sets from biber's fields (`\printbibliography`), whose text is no TeX the front end can
  mark: its entries stay the original's (the ledger's `references`), a known gap; and a `.bib` the TeX tree holds rather than the
  package (a style's IEEEabrv): no pass is made.
- **The author block: names apart from places** (`source/latex-front.mjs` `frontBlock`, PIPELINE 30, LAYOUT 23). An author block's
  affiliations, institutions, addresses and its e-mail line are units of their own, kind `affiliation` (class body: always
  translated), its names kind `author` (class names: the names toggle). Read from the TeX the source holds: the command (`\author`
  and its kin names, `\affil`, `\affiliation`, `\institute`, `\address` and their kin places), the rows of the tabular LaTeX sets an
  `\author` in (its first row names, the rest places, but a row that holds an author's note, sets an affiliation's mark after a
  name, opens with "and", or stands before a numbered list of places is names: 2608.14893's and 2610.21880v1's second rows of
  names), a numbered list of places; IEEEtran's, acmart's, REVTeX's, elsarticle's (each key's value), llncs', ICML's and AAAI's
  forms. A later row with none of these is a place, as the classes set it: a name alone there cannot be told from a place by its
  TeX. An e-mail, a web address and an ORCID written out stay placeholders, the original's ink; so does an e-mail whose
  local part TeX escapes (`goh\_siong\_thye@…`, one placeholder with its `\_`, 2608.11884, 2608.29778). Every author block's
  unit keeps its number: what PIPELINE 29 cut the text between two notes into (one unit of kind author, a unit the walk flushed
  inside it one more: `olderUnits`, a walk of the old cut in a shadow of the walk's context) keeps it in the first unit cut inside
  its range, of either kind, and every other unit cut there is numbered after every other unit of the source, before the entries
  (`later`, `entriesLast`): over the local sources no source unit's number moves for it. A place is searched on arXiv's page as a float is
  (`make.mjs`, `page-pass.mjs` FLOATING: a class sets it where it likes, amsart's addresses at the paper's end). Each row is
  marked in the layout compile as the block's one unit was (`frontMarks`), the duplicates a class compares left unmarked by the
  command's whole argument as TeX reads it, its comments, line breaks and runs of spaces aside (two equal `\affiliation{…}`
  of revtex's, set once: 2610.21770v1's third, broken over two lines, had been marked and set again), never two rows of one block (article sets
  1706.03762v7's three "Google Brain" rows each where it stands: all 15 of its block's units laid); a row that opens with its
  first letter as a command in a group (`{\L}ukasz`) has its start mark before the group (`patch`), so that the letter is its
  own ink.
- **A paper's macro of its text in an author block** (`storedBodies`): `\affiliation[a]{\CU}`, `\CU` a `\newcommand` of the
  affiliation's text (2609.20976v1), is cut where it is defined, of the kind of the place it is called from; where the macro is
  called once in running text (`once`), its unit is marked in its definition (`frontMarks`), the one place TeX sets it, and is laid
  as the same text written in the block is; one called more than once is set more than once, so with no mark, and stays the
  original's. A body a `.sty` or a `.cls` defines is no unit (jcappub's `\maketitle` and `\@fpheader`: the class's own code,
  "! ! ! ! Abstract. ! ! Keywords:", translated for nothing): its text is the class's, the ledger's, an ink unit where it is
  one.
- **Names are translated for every target** (`layer-proto/rows.mjs` `toTranslate`, TRANSLATE_VERSION 6): the author block's units
  are sent whatever the language, as every unit is but a table's kept names; they are laid as any unit, and stay the original's
  where the wrap cannot hide their ink (`unhidden`).
- **The toggles** are stage 2's (`classes` at the door's open and the layer side's, `setClasses`, TOGGLE_DEFAULTS: references and
  names off, heads, tables and figures on): an entry's unit is of the class `references`, the author block's names of `names`, its
  places of the body's (UNIT_CLASS), so that with their toggle off no page awaits their rows, the door takes none, and the
  translating indicator marks none (it reads the same `classes`); the door gives the run its classes resolved over TOGGLE_DEFAULTS,
  and a direct open of v0 (run.mjs openProto, the lab's and the tests') given none takes the same defaults: every class but the
  names and the references. A reader's stored setting keeps its keys and its meaning: "references" the bibliography, "names" the
  author names.
- **Measured** (`lab/pdf/spikes/classes-gate.mjs`, record `lab/pdf/records/classes-gate.md`; `lab/pdf/spikes/unit-hash-diff.mjs`
  over the local sources), against `next` 2346530d:
  - **The units** of the 170 local sources (cut before any compile, so without the `.bbl`s the pass makes):
    - by kind: `refnames` 2,371 → 0 and `reference` 3,112 → 3,198 (each entry one unit); `author` 685 → 457 and `affiliation`
      0 → 462; `para` 14,937 → 14,930 (7 stored bodies of a class's own code: 2609.20976v1, 2610.34042v1, 2608.15334v1);
      `footnote` 283 → 282 (2608.29778's note that is an escaped e-mail alone);
    - 7 paragraphs before a `\bibliography` lose a trailing placeholder; 3 notes' ORCIDs and the escaped e-mails of 2 notes
      (2608.04322, 2608.09812) are placeholders; and 2608.11884's row of e-mails, a place of the words "goh siong" before, is
      no unit;
    - the numbers that move, of the 41,059 units whose hash stays: 2608.29778's 41 units after that note, #15 to #55, one down;
      and 259 entries in 20 papers (an entry's rest keeps its hash), down by 1 to 159 where names units or a stored class body
      went before them, up by 1 to 12 where places were cut apart before them;
    - 95 of the 170 make their `.bbl` (40 ship one, 35 name no `\bibliography`).
  - **The classes gate** on 35 papers: the 3 of 2026-10-28, the gate pack's 7 and the 25 of `lab/pdf/data/layout`. 33 compile;
    2610.20595v1 (`texlive`) and 2610.21765v1 (`final`) are refused on both engines.
    - Every one of the 1,721 entries is located, among them 743 entries of the 16 papers whose `.bbl` the pass made (1.4 to
      4.0 s a pass).
    - The wrap leaves 51 entries the original's. 35 of them are 2610.20848v1's: elsarticle-harv ends each entry with
      `\DOIprefix\doi{…}`, which the marking gives an opening mark alone.
    - 88 of 100 places are located. The 12 others are REVTeX's and acmart's equal `\affiliation`s, set once and unmarked as
      before.
    - No body unit is lost or moved. 9 are laid that `next` left the original's: 2609.20976v1's four places in its macros,
      2610.22065v1's 4 and 2610.21098v1's 1.
    - 1 placeholder moved: 2610.11256v1's ORCID, now a placeholder.
    - G1 is 2 pixels on the 115 pages the entries are on.
    - The base pages against `next`'s: 2 of 864 pages apart, by 3 pixels, with the same operators once the marks are set aside
      (record: `lab/pdf/records/classes-gate.md`).
  - **A real prepare** of 2609.20976v1 through the web's image: the pass takes 4.0 s of a 40.7 s prepare. Its 39 entries are
    announced with the source's units, and each is sent and laid; so are its 4 places.

### 19.14 The paper's own names, units of their own (PIPELINE 29)

A name no package gives the target is the paper's to name, and the translator's to translate: each paper's structural names
are units of their own, sent to the translator once with its units, cached by their text as any unit is, and read by the
layer wherever such a name is drawn (the owner's other ground truth of 2026-10-25, after §19.11).

- **Which names** (`source/paper-names.mjs paperNames`, over every `.tex`, `.sty` and `.cls` file the paper ships, comments
  dropped, in the order its files are read): a theorem-like environment's printed name (`\newtheorem` and its starred form,
  llncs's `\spnewtheorem`, elsarticle's `\newproof`, mdframed's `\newmdtheoremenv`, thmtools' `\declaretheorem`, its `name=`
  or else its environment's name capitalised, as thmtools prints it); the reference names the paper gives (cleveref's
  `\crefname` and `\Crefname`, thmtools' `refname=` and `Refname=`, a redefined `\<type>autorefname`); and, where the paper
  calls cleveref or `\autoref` at all, the words no package names in some target the readers offer
  (`rules/tex-names.json` `gaps` and `conjunctionGaps`, which `tex-names-make.mjs` derives from the same files: each counter
  type's English singular, "Section", "Equation", "Theorem" …, nineteen, and the conjunctions' one word, "and"; a range's
  " to " is no word of one sense alone, and a conjunction of punctuation is every target's). A name is plain words alone
  (one holding a command or a brace is the original's), each once, at most 96 a paper.
- **Where they are**: after the source's units in the bundle (`layer-proto/units.mjs bundleUnitsOf`, kind `name`, one text
  piece), so that every source unit keeps its id and its hash; the prepare child writes them in the source units' chunks, and
  the ink units (§19.10) follow them: the wrap numbers its ink units from the bundle's count before them
  (`wrapFinal`'s `inkFrom`, which the host gives as `bundleUnitsOf(paper).length`; `page-pass.mjs inkOfHost` takes no ink
  unit numbered otherwise). A name unit is no page's ink: the maker, the anchors and the wrap never see it (`paper.units` is
  the source's alone), the page pass settles it from the start and lays it nowhere, the door awaits it on no page.
- **Translated first**: a language's batches carry the names first (`rows.mjs batchesOf`, `runRows`), so that the first page
  drawn has them; their class is `generated`, always translated (`rules/content-classes.mjs`). A row of one is the run's
  word for that name (`layer2.mjs nameOfRow`: its translation's text, an ideographic full stop the translator ends a word
  with dropped), taken at the open or with any rows (`run.mjs take`), never laid; one that comes after a page is drawn
  changes no drawing.
- **Read where a name is drawn** (`rules/tex-names.mjs`): a package's word first, as §19.11 has it; else the name unit's
  translation: a theorem-like head's name (`headName`), a generated reference's name (`refName`: the form itself, a name the
  paper defines, or in a target whose names do not inflect its type's singular, so that zh's "Sections 5.2.1, 5.2.3 and
  5.2.4" reads its section's word once), its conjunction's word with the English spacing (`conjunctionOf`). A reference any
  part of which has no word yet is still the original's whole. In a target that inflects, a plural no package and no name
  unit gives stays English whole ("Assumptions 1 and 2" in de).
- **Measured** (2026-10-25, the 168 local sources): 923 name units in 85 papers, 32 at most (19 of them call cleveref or
  `\autoref`); every source unit's hash the bibliography's 29 gives it (§19.13), 168 of 168 papers the same. The paper's own
  names besides the gaps: "Conjecture" in 26 papers, "Assumption" and "Claim" in 14, "Question" and "Fact" in 8, "Proof"
  and "Problem" in 7 (a class's own among them: acmart's Conjecture, llncs's Claim), a Portuguese paper's "Teorema",
  "Lema" and "Corolário", a Chinese paper's own Chinese names (each file read in its own encoding, as the units' text is,
  and held in the bundle as a text piece is). The gates' fixtures hold no name unit's row yet (their records are of an
  earlier pipeline): their drawing is unchanged until the records are made again.
- **Limits.** The translator sees a name alone, with no sentence around it: a word of two senses may come back in the other
  ("Note", "Line"). A name only a macro of the paper's prints (`\newcommand{\thmname}{Satz}`) is not read.
