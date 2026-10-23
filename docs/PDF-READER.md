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

- Recovery is automatic where it can be: our server's wait (a 202's, a 429's) is waited and asked again; 重试 opens the
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
  `pdf.content.ts` opens it in its frame with `?paper=<id>`; `web_accessible_resources` names it.
- It frames nothing: the translation is the layer's, drawn in the page (§11.7–§11.9); the compile page it framed until
  Stage 5 is parked (`parked/README.md`).
- **The reader's address is not trusted.** The reader is a page that arXiv's pages may frame, so its URL is not its own to
  trust: a page that frames it must not point its requests anywhere else. It fetches the paper from arXiv and its layer
  from our server, or either from a server on this machine when a probe says so; the build, never a paper, a service or a
  framing page, chooses which server it reads the layer from (`src/pdf-reader/addresses.ts` `READER_API`).
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
(`composed`, the base page followed by every tail told: our compile's, §19.7). No host calls the door.

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
  open; the composed document through the parts read so far opened with the view's assets, `PDF_OPTIONS` and
  `disableAutoFetch`; the door opened over it with those parts; each later part added in page order, a part with a tail
  over the composed document through it; the rows held until the door opens, then taken; the parts ended once the
  catalog's `through` is added. A fork, a later attempt (`again()`), or parts past the end the door was told (a later
  build's) dispose the door before it is opened again (one open layer a page): `again()` carries no row (the host takes
  its rows again), the others every row so far (the units are the head's). Only the first open waits for the original: a
  dropped original stops no later part, no `again()`. A part the door refuses stops the parts added to that door there,
  with one warning; the side stays open. A refusal of the whole side carries a code (`head`, `units`, `index`, `base`,
  `composed`, `open`).
- **A page of a part with no layout** (over our base: the engine's check refused the part, or its producer recorded none, a
  part's `layout` null) draws nothing and erases nothing, so its pages would show our base page in other line breaks beside
  arXiv's. What TeX's positions do not draw is arXiv's PDF: such a page (some part holds it and every part that holds it has no
  layout, `noLayoutPage`, a unit running on from the page before can put a page in two parts) is not asked of the door and not
  swapped in, one the door laid before its parts were all told is not committed, and its place keeps, or returns to after a
  fork, the original's page view. Any other head is laid as before (it draws nothing: `layerDraws`).
- **The documents** are the side's: each composed task is destroyed once no door reads it (the door's `onRetired`) and the
  side holds a later one, at a refusal of the side (its feed's fetches with it, and the right's shapes the original's again),
  and at dispose; none twice. `again()` reuses the latest.
- **Each place shows the best version there is** (§11.7): its pre-layer content until the door has laid its page and the
  place is near the view, then the layer's copy (the door's `copyOf` at the place's k: device pixels a PDF unit, within
  2^24 pixels; from the left's canvas where PDF.js drew it within 2 % of that k, else the place's own page view's canvas,
  else the page drawn from the composed document; over our base page (the head's `base.source` `ours`, `layerDraws`) always
  the page drawn from the composed document, because its pages are our compile's and the erase rectangles, crops and colours
  are in their coordinates, not on arXiv's rendering the left shows: the left's canvas and the place's, which are the
  original's, are never asked, at the commit or at a zoom's recopy; one page render a laid page, 10 to 25 ms on the sample
  where the canvas was free) and its SVG, put in one task, in place: the place's size and the pane's
  scroll unchanged, its page view destroyed first, no viewer document set. A zoom draws the copies again at the new k
  600 ms after it, nothing laid again; a copy is kept while it is at the scale a copy drawn then would be at. A page this
  door laid that leaves the view lets its SVG and its copy go and holds an
  empty element (retired: the place shows no page, and no page view is made of it); a page the door makes ready while it
  is far is retired at once, and committed directly when it comes near. The one exception: a page that holds the focus (a
  link, or the place a jump gave it to) is kept as it goes far, and let go once the focus has left it (read a task after
  the focus moves, never in a microtask: a native Tab clears the focus before it arrives at the next link), so at most one
  far page stays laid, and the focus never falls to the document. A page that fails, or whose copy fails, shows the
  original and is asked again on a zoom, on coming near or (a copy) on the next scroll; one asked, told `laying` and not
  laid within 30 s (`PAGE_MS`) shows the original, warns once a side and is asked again on the next scroll, its late
  `ready` taken. A page still `waiting` (its part, its closure or its rows) is never a stall. After a reopen a laid page
  keeps its drawing until the new door's page is ready; leaving the view, that drawing goes and the place shows its own
  content again. The window holds a copy for the places near the view alone: their pixels are bounded by the near area at
  any zoom, so no copy of a far page is kept.
- **One frame a page** (`view/drawn.mjs`). PDF.js draws a page view at its viewport's unrounded scale times its output
  scale, from the page's top-left corner, on a canvas it floors to whole CSS px (pdfjs-dist 6.3.289 `PDFPageView.draw`:
  the canvas is `outputScale.sx` times the page's width floored to its rounding, the rest of the page cropped). So the
  copy's source carries the scale it was drawn at, read as PDF.js begins the drawing (`pagerender`, its canvas sized and
  its output scale set), checked against the canvas's size, and kept with the canvas once PDF.js tells that drawing done
  (`pagerendered`, neither a CSS transform nor a detail view): not read at its end, where under restricted scaling PDF.js
  lets a drawing run on after a zoom has given the page view its next viewport (`update`, `onlyCssZoom`); never the canvas's
  width over the page's, which is short by up to a CSS px over the page's width (0.14 % at the 87 % fit), and an erase
  laid at it left the original's ink showing past its rectangles where the floor drops near a pixel (80, 87, 110 and
  125 %; at 125 % the page's 1020 CSS px floor to 1019 in floating point), deterministically, at any time. `copyAt`
  hands `copyOf` the scale kept with the canvas, never one derived from a size.
- **A canvas drawn at two scales is no source.** PDF.js approximates the pixel ratio by a fraction whose terms are at most
  8 (`approximateFraction`) and floors the canvas's width and height each to its own term, so wherever the ratio is no
  such fraction the canvas's scale across and its scale down come apart, at almost every zoom: at 1.1 and 0.9 (Chrome at
  110 and 90 % on a 1× screen), 1.8 and 2.2 (the same on a 2× screen), 2.25 (Windows at 225 %), 2.4, 2.625, 2.75; and
  under PDF.js's restricted scaling. Their anisotropy at 100 % is 1.4 to 3.7 device px over the page, above the erase's
  pad, so no tolerance can take such a canvas: the copy is drawn from the composed document instead, at k, correctly.
  At 1, 1.2, 1.25, 4/3, 1.5, 1.6, 1.75, 2, 2.5 and 3 the two agree to the bit (PDF.js's sizing replayed over zooms of 50
  to 400 %, the review of 2026-10-19). Measured (`AXT_MEASURE=1 AXT_DPR=…
  pnpm e2e:registration`, the sample, the fit and 100 %, the median of five): a copy at DPR 1.1 and 1.8 costs 14.3 to
  17.3 ms (the page drawn 13.7 to 16.4 ms, the copy 0.6 to 0.9) against 0.1 to 0.2 ms from the left's canvas at DPR 1
  and 2 (its raster left to the GPU), a recopy's long tasks none at any of the four: about a hundred times the cost, on
  every commit and on each near page's recopy after a zoom, spread over PDF.js's slices of the main thread. The old code copied such a canvas and left the erase 4.4 device
  px short across and 7.1 down at 100 % and DPR 1.1. Debt: a copy drawn at the canvas's two scales (`copyOf`, `drawCopy`,
  `renderAt` and `drawOps` taking a scale across and one down) would take PDF.js's canvas at every ratio.
- **The page drawn from the composed document** is drawn as PDF.js draws a page view: at k on a canvas of the place's box
  at k's resolution (`places.box`, PDF.js's rounding of the viewport, nothing of the layout read), on the left's page
  views' own context (opaque; read back by the CPU unless the host opens its documents with `enableHWA`, as PDF.js's
  `willReadFrequently: !enableHWA` gives it). Where both are the CPU's (the extension) its copy is the left's to the
  pixel; where the host draws on the GPU's (the web) the two differ by anti-aliasing, and a registration check there needs
  a tolerance for it. The SVG and the links are laid in the same frame: the page's size at its scale (`--axt-frame-w` and
  `-h`, `--total-scale-factor` times its size in PDF units), never the place's floored box. Measured by
  `pnpm e2e:registration` on the sample, at DPR 1 and 2, at the zooms PDF.js floors at least 0.6 of a CSS px off:
  before, 307 to 8,142 pixels of a page's copy from PDF.js's canvas differed from its copy at the place's k by more than
  16 in a channel (up to 255; 1 to 1,101 at an aligned zoom, the document's copy then drawn on another context) and the
  ink left at the erased rectangles reached 889 px against an aligned zoom's 0 to 2; after, 0 pixels differ at any zoom
  and the ink left is the aligned zoom's. The whole-pixel snap of `drawOps` (`SWAP_PAD × k < 1`, added for 85 % at
  DPR 1 on 2608.16117, whose page is 693.6 CSS px wide) is still to be measured again under the right registration.
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
objects (`tests/e2e/lib/layer-cut.mjs`), served by the stand-in of the layer API, and `pnpm e2e:registration` holds the
frame (the side's `registration(n)`: a laid page's copy from the document at the place's k, compared pixel by pixel with the one
made from PDF.js's own canvas of the original where it drew it at that k; in the fixture the base is arXiv's own bytes, so
0 px differ, and over a real build of ours the two differ where its lines do, the reason the copy is not taken from it).

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
   its time (S-R-24 meanwhile, whose retry waits it out too); our server out of reach (a 5xx, the network, or nothing within
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
5. **The composed document**: our base page by ranges at `/api/v1/base/<id>v<n>/<sha256>` (`openRanged`, its own address: the
   digest of its bytes, so one object per URL), every answer a 206 of exactly the bytes asked, of the head's length and the tag
   of the first answer (a `Bound` may carry the length alone: no route names a tag beforehand), the tails after its last byte;
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
- **Float labels and babel's names** (the names a language gives a figure, a table and each generated heading: Abstract, References, Contents, …, and whether to use them) are layout: one language's choice at draw time. Where each name stands is extraction: the layout marks wrap the name macros' text and the layout file locates each occurrence (D1a). The layer draws the target's word wherever TeX identified the heading: by its macro, by a style's literal through the definition it sits in, and after the paper's own `\selectlanguage`; what a compile of the translation sets there (`captionsOf`) decides float labels alone (the ruling on D1a). A name TeX sets right before a unit on its first line (IEEEtran's run-in "Abstract—") is that unit's lead, flowed with its translation whatever its width, the original's joint and glue after it. **The parked final's requirement:** if the TeX page program returns, it must name the same headings: rewrite a literal the marks wrap to its macro (`\abstractname`), and apply the target's captions again after the paper's own language switch. **Hyphenation** (which patterns a target uses, and their minimums) is layout; the pattern files are assets the host serves, and the algorithms are code.
- **The font roles** (which CJK family and weights a script takes) are layout. The face catalog (files, licences, size corrections, coverage) and the Latin design table are facts about files and stay code. **A CJK italic run is the body's own face slanted** (the owner's ruling of 2026-10-19, Q17's row 3), in zh, zh-Hant, ja and ko alike: the same face, size correction and weight as the upright, sheared 13° about its baseline as it is drawn (an SVG skew, `layer-proto/fonts.mjs` `CJK_SLANT_DEG`, the one number; 10° was the other the owner saw). A bold italic run is the bold face sheared, no longer the bold upright. No file is fetched for it and no face is made: the run is measured in the upright's own font string, so its advance and every character's place are the upright's. The rule set's `cjkFaces.kai` is no longer read (the engines readers held before it draw emphasis in it, so the set keeps it until its schema next moves).
  - **Measured** (Chromium, dpr 2, 44 px): the shear against the outlines sheared in the file, the Oblique 13 faces the owner judged, overlap 98.1 to 99.4 % of their ink (IoU), 0.1 to 0.8 % of the ink pixels more than a quarter apart, all at glyph edges (zh regular and bold, ja, ko).
  - **Row 2, kept for later versions** (no code): the Kai matched to the body by measurement. FandolKai (zh): its ideographs' mean ink box 0.828 × 0.848 em against the body's 0.890 × 0.910, a size factor of 1.074; ink per em² 0.135 against 0.183 (−26 %), made up by an SVG stroke at drawing time. AR PL KaitiM Big5 (bkai00mp, zh-Hant): 0.821 × 0.823 against Source Han Serif TC's 0.891 × 0.913, a factor of 1.098; ink 0.155 against 0.200 (−22 %). Its limits: Chinese only (ja and ko still get no italic); the factors are per font; the stroke only emulates weight; there is no bold Kai, so bold italic stays bold upright. The comparison page as the owner saw it, rows 1 to 4 in all four languages with their measures and licences, and its README: `~/Downloads/readarxiv-test/archive/cjk-italic-2026-10-19/` (`index.html`, `README.md`), on the maintainer's machine.
- **`textless`** is extraction, but v0 also applies it at draw time to a unit's source (only the alignment fallback reads it). A reader applying an extraction rule to a bundle's content is a defect class; it is listed for the debt pass.
- **Cell membership** (`groupOf`, from `tableGrid`) is extraction: the bundle carries each cell's place.
- **A unit's alignment** (whether its lines are centred) is extraction, and TeX's own: the marked original writes, for a unit's or a heading's end mark, the stretch of `\leftskip`, `\rightskip` and `\parfillskip` its paragraph was broken with, read once the paragraph ended (`AXT-ALIGN`, `layout/marks.mjs` `readAlign`: centred, flush left, flush right or justified; `{\centering text}` and a blank line is justified, its group closed before its paragraph ended), and the layout maker sets `UNIT_FLAG.CENTRED` from it. A unit TeX set in a box (a one-line caption `\@makecaption` centres, `\centerline`) or whose line the log lacks is read from arXiv's lines instead: every line's centre on its column's (the text block's for a full-width row), one line short of it by more than an em; and a one-line paragraph TeX set justified that its own glue centres (`\noindent\hfill X\hfill\null`) is centred where its line is on its column's middle and more than two ems off both edges. The layer draws by the flag. A table cell, which the probe does not read, it decides by the cell's own lines (several centred: a makecell's) or its table's column on the page (a single line: centred where the column's cells' middles are all within 2 pt of each other and their widths are not, so a column whose cells share a start or an end never is; a cell its column cannot decide, alone in it, a header's or of widths alike, as the layout file's flag says); a unit of a part with no layout by its lines and the page's column, as before the file had a flag (2026-10-19: the layer's own guess had centred 1810.04805's "C.1" and "5.3" headings and missed IEEEtran's centred ones).
- **A placeholder's colour** (its glyphs' fill: hyperref's coloured links and citations, a coloured formula) is extraction: the layout file's placeholder row ends with the colour more than half its inked glyphs are filled with, where that is not black (`0xRRGGBB`; `MIXED_FILL`, -1, where no one colour holds more than half), read from arXiv's operator list (`layout/ink.mjs`, every colour space as PDF.js turns it to RGB; a pattern's fill counts as none).
- **A character's colour** is an attribute of the original's glyphs, as its font is (E1 of the residuals' batch R2, 2026-10-19). Each text item of a page's draw carries its characters' fills (`layout/fills.mjs` `itemFills`: the glyphs of the page's ink on the item's baseline within its extent, read in order as the item's own text; an item they do not spell exactly — turned, a glyph too many or too few, a combined accent set as two glyphs, a right-to-left run — tells none, nor does a Type 3 glyph whose procedure paints its own colours), and a page read live tells the same from the list PDF.js drew it by, its render's or its early pixel read's, with no second parse: a walk of the glyphs alone, `LIVE_FILLS_MS` at most, past which the page tells none (`run.mjs` `liveFillsOf`, with the host's `OPS`). The reader's character holds it as `st.fill`. The drawing reads it three ways. A unit's base weight, slant, small capitals, family and colour are those most of its matched glyphs hold outside every piece that may set that attribute (a style pair or switch in any spelling, `{\bf …}` too; a colour piece, a link, a paper's own macro), and of all its glyphs only where none lies outside; a tie goes to regular, upright, serif and black, else to the unit's first glyph (`layer2.mjs` `measuredStyle`). A glyph's slant is read as it would be without the `\emph` and `\em` toggles around it, so that a unit wholly inside one is drawn as the original. A piece that may set colour and that no `colours` row tells takes its own glyphs' colour; a row (TeX's, PR-C) wins. A unit read without its source pieces (a lab record, not a reader's) keeps the reading before: the majority, its groups' share taken off (`baseOf`), and a colour only where every glyph whose fill is told holds the same one. A rendering of the page's own characters (a citation, a reference, an equation's number) is drawn in runs of its characters' fills: `[16]` keeps its black brackets and blue digits. The placeholder's row fill above stays only for a character whose fill is not told. Word-level colour inside a sentence stays a limit: no majority paints a unit. On the wire, a styled pair whose two ends stand where the wire is cut anyway (a forced break, a display or an item beside it, never an inline formula, which the translator moves as a word; a kept pair's edge; the unit's end) keeps its markers (`translate/mt.mjs` `classOf`, the boundary rule). The draw's item rows carry the fills as their tenth value (`BUNDLE5` `'7'`); the boundary rule raises `TRANSLATE_VERSION` to `'4'` and `PIPELINE_VERSION` to `'22'`, whose copies carry every unit whose wire it leaves alone (`mt.mjs` `boundaryChanges`): over 137 papers' sources 126 of 36,136 units, in 29 papers, are asked again.
- **A translator's stutter** (a word of five letters or more written twice in a row where the unit's source sets no word twice: Microsoft's "konformen konformen" in 2608.16117's German abstract, the M1 survey) is layout: `layer-proto/stutter.mjs`, applied where a unit's text becomes tokens (`layer2.mjs tokensOf2`), so every host's rows and every cached translation are drawn with the word once, and the rows, the cache and the plain text the sentence offsets count in keep the translation as it came (the word table keeps each drawn word's place in it). It bumps nothing (§18.3); making it a translation rule would raise `TRANSLATE_VERSION` and translate every unit again for a defect of three units in the 31 outputs measured. Only alphabetic scripts that set words apart by spaces: a CJK or Thai repeat is not this rule's.

### 18.2 The identities

| Identity | Kind | Covers | Enters | A bump means |
|---|---|---|---|---|
| `BUNDLE` (web `'1'`, engine `'3'`: the layout file's schema 3, the paper's `\lineskip` and `\lineskiplimit`; 2 its babel names, D1a. The file's schemas 4 (`PH_FLAG.JOINED` and `PH_FLAG.OUTSIDE`) and 5 (a found placeholder's fill, its row's last number where its glyphs are not black: 0xRRGGBB, or -1 where no one colour holds more than half of them) are not yet a contract of their own: `b3` names schemas 3 to 5, each reader's `parseLayout` refusing the others', so only this engine's reader reads a `b3` bundle holding schema 5. The web's pin does not move before `BUNDLE` 4 lands; M1 moves it with `BUNDLE` 4) | reader contract | everything a reader parses: the bundle's shape, the units' tuple, kinds and flags, the layout file's schema, the manifest's schema, the left geometry | the request (§18.4) and the R2 key | readers older than it get `unknown-versions` until they update |
| `PDFJS` | reader contract | the PDF.js whose reading the layout and the manifest are made against | as `BUNDLE` | as `BUNDLE` |
| `PIPELINE_VERSION` | extraction | the units' cutting, kinds and texts, the cells' places, the left side's marks. **Not** the wire, its reading back or the paper's context, though it is raised with `TRANSLATE_VERSION` while the extension's stored copies are judged by it alone (`translate/version.mjs`; 22 and 23 so) | the R2 key; the rows' identities | bundles made again lazily; rows again |
| `LAYOUT`, `REMOVAL` | extraction | the layout maker, the remover | the R2 key | bundles made again lazily |
| `TRANSLATE_VERSION` (`translate/version.mjs`, `'5'`: a display's own stop written after its marker and taken off the reply; `'4'`: a styled pair whose two ends stand where the wire has a marker anyway keeps its markers; `'3'`: a sentence whose words change style sent whole, the pairs inside it on no wire; `'2'`: a formula split across inline formulas sent as one marker) | translation | `serialize`, the three wires, `rehydrate` (strict and tolerant), `translateUnits`' fallbacks, `keptFor` and `authorsTranslated`, `decideGroups` and `NAMES_SHARE`, `batchesOf`, and the paper's context each reader builds (`paperContext`: the extension's is `session/translate.mjs`, the web has its own, since it cuts the abstract as the HTML page does, which the engine does not hold) | the web's translation identity, the extension's rows cache, never a bundle key | rows translated again on open |
| `RULES_SCHEMA` (`rules/layout.mjs`, `4`: `adaptiveFill.band` read against the page's own paragraphs, 1b-C; 3 before) | layout | the rule set's fields, ranges and how the engine reads them | the rules route (`/s<n>`) | a new pointer; engines of the old schema keep the last set published for it |
| the set's `version` | layout | the values | its immutable URL | readers take it on their next load |
| `RULES_VERSION` (`src/core/rules/latexml.ts`) | HTML extraction | the HTML page's rule file | the HTML page's per-text key only | as DESIGN §5.5 |
| `TYPESETTING_VERSION` (`live.mjs`) | parked | the compile path | parked records | none |

- **The web's translation identity** is `axt-tr/2|<paper>|v<version>|<target>|<chain>|p<PIPELINE>|t<TRANSLATE>|b<BUNDLE>`, with no `r<RULES>`: the rules of the HTML page cut none of a PDF's units.
- **The background's per-text key** keeps `RULES_VERSION` for the HTML page's blocks only; a PDF text's key holds none (`cache/key.ts` `CacheSource`, named by every cache descriptor and `CACHE_KEY_VERSION` still 6: no HTML key changed, and a PDF text's old entries are no key of the new ones). The cache holds the translator's raw answer to a text, which no rule of reading changes.
- **A file is refused by its schema, never by its maker.** `parseLayout` refuses a layout file whose `schema` is not 5 (4 before a found placeholder's row ended with its glyphs' fill, 2026-10-19; 3 before a display group's later displays were written `JOINED`, their ink the group's first display's, and a LOST piece outside its unit's lines `OUTSIDE`, the LOST survey of 2026-10-15; 2 before the paper's `\lineskip` and `\lineskiplimit`, 1 before the babel names, D1a) and `checkAddonManifest` a manifest whose `schema` is not 1; the file's `layout` and the manifest's `removal` are read for their shape (a version token) and never compared, so a reader opens what a newer maker or remover wrote. A change of either file's fields, bounds or meaning raises its `schema` and `BUNDLE`, not `LAYOUT` or `REMOVAL` — but the layout file's schemas 4 and 5 did not raise `BUNDLE` (the controller's ruling of 2026-10-15: the next `BUNDLE`, 4, is the pipeline lane's new wire). This breaks the contract's promise for `b3`: a released reader of schema 3 asking `b3` of content this engine makes would refuse it whole, as `parseLayout` refuses any schema but its own. It holds only because no released reader asks for such content: the web's pin does not move before `BUNDLE` 4 lands, and moves with it (M1).

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
| `leftover` | script | fit | `foot`, `pack` | Where what the fill leaves over goes: at each paragraph's foot, or packed to the end of its run of paragraphs, each keeping the original's gap to the one above it. |
| `keepAll` | script | breaking | yes or no | Whether lines break only at spaces (Korean and the alphabets) rather than between any two CJK characters. |
| `cjkQuotes` | script | breaking | yes or no | Whether curly quotes, dashes, the ellipsis and the middle dot are set as CJK characters. |
| `noStart` | script | breaking | a list of characters | The characters no line starts with. |
| `noEnd` | script | breaking | a list of characters | The characters no line ends with. |
| `hyphen` | script | breaking | `0`, `1` | Whether a Latin word is hyphenated at a line's end (1) or not (0). |
| `latinPatterns` | script | breaking | `en`, `de` | The hyphenation patterns a Latin word uses. |
| `cellClear` | script | cells | 0 to 5, step 0.1 | The room kept between a table cell's text and a rule over or under it, in PDF units. |
| `cellCapMin` | script | cells | 0.3 to 1, step 0.05 | The smallest share of the size a cell's text may be capped to between its rules. |
| `cjkFaces` | script | faces | group, kai, light; or none | The CJK family the script is drawn in; empty for an alphabet. |
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
  view/         reader-view, places, layer-side, feed, contents, lighting, highlight, shapes, floats, figures, pointer, sync, overlay, outline, engine.css   the browser
```

What the engine does not hold: the extension's session (`src/pdf-reader/session/`: its host of the view, its run on the
layer, its client of our server, the served faces, its translation client `session/translate.mjs`) and the addresses
(`src/pdf-reader/addresses.ts`); and, parked (`parked/README.md`), the first instant layer (`parked/engine/`) and the
extension's compile client (`parked/extension-compile/`).

### 19.2 The five entries

| Entry | Loads in | What it gives |
|---|---|---|
| `pipeline` | Node (the server) | A paper's source to its units (`openPaper`, `loadProject`, `unpackSource`, `analyze`); the marked original and the probes (`originalFiles`, `probeFiles`, `readingsOf`, `stoppedShort`); the left geometry (`anchors`); the layout marks, the layout maker and the add-on's maker (`layoutMarksOfPaper`, `makeLayout`, `paperAddon`, the remover); the TeX Live year arXiv's PDF says it was built on, from its pdfTeX banner and before any compile (`texLiveOfPdf(doc)`: the `PTEX.Fullbanner` of the Info dictionary PDF.js resolves from the trailer, never a scan of the bytes, else null); the page pass, a paper's layer told a part at a time (`layerOfPaper`, §19.6), and its cut (`partCutter`, `wholeCutter`, `cutBundle`); the layout file and the add-on's manifest, with their caps; the bundle's writer (`writeBundle`, `bundleUnitsOf`); the faces' coverage; `PIPELINE_VERSION`, `PDFJS`. Not the compile path's typesetting, strategies or cache, and not `runLive`. |
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
  server's modules (the front end, the compile path, the layout maker, the marks, the remover and the add-on's maker). The
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
  repository wrote itself (units, wires, the files of every compile, the bundle, the layout file, the add-on's manifest,
  the rows). A move or a refactor leaves every hash as it is.

### 19.4 The layer API, as the web defines it

The routes are the web's, `/api/v1/` kept for every released extension; the engine holds the format both readers parse and the
tags they ask by (`layer-proto/bundle.mjs`).

- **One file per paper version.** The bundle is a single JSON file: `{ schema, paper { id, version, pages }, base { bytes,
  sha256, url }, versions { bundle, pipeline, layout, removal, pdfjs, image }, units, left, layout | null, addon { manifest,
  tail } | null }`. Both readers parse it with `readBundle(json, caps)` after the byte cap (`BUNDLE_CAP`) and the value count
  (`BUNDLE_VALUES`) are checked before `JSON.parse`; a refused bundle draws no layer, a refused unit is dropped and counted, a
  layout of `null` draws nothing (the layer draws only from the layout file: every unit stays the original's), an add-on of
  `null` erases and restores.
- **Routes by tag.** `GET /api/v1/layer/<id>v<n>/<tag>` answers 200 with the bundle, 202 `Preparing { position, stage,
  progress, retryAfterMs }`, 404 `{ why }` (`not-prepared`, `no-source`, `no-pdf`, `cannot-prepare`, `unknown-versions`) or 429
  `{ retryAfterMs }`; `POST …/<tag>/prepare` (JSON body `{}`) answers 202, 200 `{ ready: true }`, 404 or 429; `GET
  /api/v1/original/<id>v<n>` is `base.url`, our copy of arXiv's bytes; `GET /api/v1/base/<id>v<n>/<sha256>` (no suffix) is our
  base page a head of ours names (§19.7), by its digest, by ranges, a strong `ETag`, any origin, immutable. The tag is the engine's `VTAG`, or its contract
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
(`makeLayout`'s, each page's operator list read once for the maker and the add-on's plans), the add-on chained over the host's
remover (`chainedAddon`) and the cut (`partCutter`, `cutBundle`'s own).

- **In.** `paper { id, version }`; `source` (`openPaper`'s); `marks` (`layoutMarksOfPaper`'s: `{ marks, unitMarks }` or
  `{ refused }`), or `marked { doc, log, options }` (the marked original, read by the pass a page at a time); `arxiv { doc,
  text? }` (a PDF.js document of arXiv's PDF, the caller's to open and destroy, and its text as `readArxivText` read it, else
  read here: the left's); `ours` (our base page, §19.7: `{ doc, bytes, sha256, xref, check }`, or the final pass's refusal, or
  null), `orig { bytes, sha256 }` (arXiv's PDF beside it) and `tree` (the TeX Live year it was made on); `base { bytes, sha256,
  xref }` alone is a host of BUNDLE 7's, whose paper falls back (`final`); `OPS`; `pdfjs`; `image`; `remove` (the remover's transport, or null: no add-on);
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
  images), the remover's.
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
the fallback. The layout file's coordinates are therefore our page's (LAYOUT 12), the remover's tails are appended to our
bytes (REMOVAL 7), and no position is carried from one PDF to another.

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
  found on another page of arXiv's (the carrier's partners). **A unit is laid only where every page it is on is drawable**
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
composed document is `orig.bytes ++ delta ++ the remover's tails`: one byte source for the left pane and the layer, and only
what our compile changed is stored (the coordinator's GO of 2026-10-23). `kind: 'full'`, the whole PDF of 19.7, stays the
fallback. BUNDLE stays 8 (unreleased: its readers in this repository read both), LAYOUT 16, the catalog key unmoved.

- **The builder** (`layout/delta.mjs` `deltaOf(origBytes, finalBytes, { PL, replacedPages })`, pure and deterministic, in the
  pipeline entry). For each page the layer lays on whose contents and resources are not canonically arXiv's: the original's
  page object written again under its own number and generation, every key kept but `/Contents` and `/Resources`, which are
  ours; our content streams copied byte for byte as new objects; a `/Resources` dict of our entries, each the original's object
  where the two are canonically equal (the whole sub-graph reused), else copied with its closure from the original's `/Size`
  up. Names stay ours. Nothing else is written: catalog, page tree, outlines, destinations, annotations and info stay the
  original's. The section is of the original's cross-reference kind (`layout/section.mjs` `appendSection`, which the
  remover's `makeAddon` writes its tails with too: a table, or a stream of `/W [1 4 2]`, no hybrid), numbers in runs, objects
  uncompressed, `/Prev` the original's startxref, `/Root` `/Info` `/ID` the original's, its startxref in composed offsets.
- **The canonical form**: a stream is its dict less `/Length` and the exact bytes its **resolved** `/Length` names (an
  indirect one followed, as PDF.js reads it: `layout/xref.mjs` reads every object where the cross-reference puts it; the object
  layer's own scan to `endstream` reads a stream ending in CR or LF a byte short); a dict its sorted entries, an array its
  items, a reference the form of what it names (direct or indirect alike); the back links `/Parent` `/P` `/Prev` `/Next`
  `/First` `/Last` cut by the dict's own context, never by the value being a reference: `/Parent` of a page-tree node, `/P`
  and `/Parent` of an annotation, `/P` of a structure element, the outline's chain; never in an optional-content membership
  (its `/P` policy, direct or by reference, is data) or a dict of no such context; a cycle leaves the object unmatched (copied), never an error. Forms are interned (exact equality); stream
  bytes are bucketed by a hash of secret random seeds and compared whole, and the whole build spends at most
  `DELTA_WORK_MAX` (2^31 bytes hashed or compared and objects read: the 46 MB pair about 150 million), so no input makes a
  bucket or the build long. Its `/Size` leaves the remover's tails `DELTA_TAIL_ROOM` (2^20) numbers below `OBJECT_MAX`.
- **Refused, the whole base kept** (`DELTA_WHYS`): an original it cannot read safely (`delta-parse`, `delta-encrypted`,
  `delta-xref`: hybrid, an entry not at its `n g obj`, a section that does not parse; `delta-stream`: a `/Length` not ending at
  `endstream`), our pages more than arXiv's (`delta-pages`), a bound (`delta-bound`: `DELTA_MAX_BYTES` 24 MiB, more than
  `DELTA_MAX_SHARE` 0.35 of our whole base page, `DELTA_OBJECTS_MAX` 200,000 objects, `DELTA_HELD_MAX` 64 MiB of forms held,
  `DELTA_DECODED_MAX` 48 MiB of object and cross-reference streams decoded), nothing to replace (`delta-empty`), the proof
  (`delta-proof`), a delta the page pass was given that does not check (`delta-shape`).
- **The proof** (`proveDelta(origBytes, delta, finalBytes, { PL, getDocument, documentOptions, replaced })`, in the box, the
  structural one; pixels are the lab's gate): every entry of the section at its `n g obj` (`delta-wire.mjs` `deltaSection`),
  `/Prev` the original's startxref, the composed startxref the section's; the composed page graphs, read again by the object
  layer, ours on replaced pages (the page dict's other keys the original's) and the original's elsewhere (a pairwise graph
  comparison: cycles compare as the graphs they make); PDF.js opening the composed bytes with no message neither source alone
  gives (its console captured, each document read in turn); the original's page count; every page's box and text (strings and
  places within 0.01) ours on replaced pages and the original's elsewhere. What the delta overrides of the original is bounded:
  the replaced pages' objects exactly (no catalog, no other page), its `/Size` not below the original's, and its trailer the
  original's `/Root` and `/Info` (as references) and `/ID` (byte for byte), so that no fresh catalog is pointed at. An original whose
  cross-reference PDF.js recovers on its own (any such message on the original alone: it then indexes the whole file, where an
  unreplaced page may be another object than the cross-reference's) is refused (`delta-xref`), and so is a cross-reference
  entry of a type PDF.js does not know. Any other failure is `delta-proof`.
- **The host's contract.** At the end of the maker child, once the maker let its documents go: `deltaOf(orig, final, { PL,
  replacedPages })` and `proveDelta(...)`; then `layerOfPaper({ ..., ours: { doc, bytes, sha256, xref, ..., delta: { bytes,
  sha256, replaced, stats } } })` (or `delta: { refused, why }`). The page pass checks it again (shape, bounds, digest, the
  section over `orig`, the head's reader): the head's base becomes `kind: 'delta'` where it checks, else stays `full` with
  `stats.delta: { kind: 'full', why }` — never a refusal of the paper. The page pass binds `replaced` to the delta's bytes: each
  replaced page's object (arXiv's PDF.js document's page refs) among the section's entries, and no other page's. One rule
  for what is laid: **a page laid is a page replaced**. Under a delta the maker reads the composed document (our page where
  the delta replaces it, arXiv's elsewhere: `prefixDoc` with the replaced pages), so an unreplaced page's draw and text are
  the original's, and the line check marks every page not replaced undrawable, so no unit is laid there. The remover reads the composed document (`removerOf({
  bytes: orig ++ delta })`): the delta is the tails' base, the first chain's `end` O + D and `xref` the delta's startxref, its
  fresh numbers after the delta's `/Size`; `TAIL_CAP` binds the tails alone; `tailLinks`' `root` and `first` mean nothing of
  the delta. The delta is a bundle object beside the units chunks, content-addressed under the CTAG: `deltaKey` =
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
  does not bind a delta head yet (no layer, the original staying) until its host reads the composed document.
- **Several toplevel sources** (2610.20030: arXiv joins 8 + 4 pages, we compile the first): only with a delta may our pages be
  fewer (`checkOurBase` `toplevels` > 1 and `delta`): the base page's document is ours then arXiv's past M (`base.mjs`
  `prefixDoc`), the boxes compared on our M pages, `check.pages` [M, N], `replaced` within 1..M, the pages past M the
  original's by construction. Every other paper keeps the equal count (`boxes`).
- **Measured** (2026-10-23, the gate pack's 7 pairs and 2602.23285v2, this builder against the spike's): 2,078,038 delta
  bytes over 83,666,965 of originals, 2.48 % (the spike 2.48 %); the largest 0.70 MiB (2307.16209v1); per paper 0.30 % to
  30.05 % of the original and at most 28.5 % of our base page; the proof passes on 8 of 8; two builds give the same bytes; the
  build 15 to 160 ms, the proof 0.2 to 1.4 s (Node).
