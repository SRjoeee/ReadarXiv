// The harness's host page (chrome.html): the package's chrome over openReader, mounted as both hosts mount it
// (`createController` + `mountChrome`, the reader's state told by `eventsOf`, the chrome's commands the reader's), with a fake
// host over the fixtures (our copy of the original, our server's rows, preferences in memory) and the parts each check gives:
// a host's own controls in the slots, its words, its rule for the narrow window. Driven by the checks through `window.__c`.
// Its sheet (chrome.css) is the page's link.
import type { Part } from '@readarxiv/format'
import { ChevronLeft, CircleAlert, Clock, FileText, Info, Share } from 'lucide'
import { Icon, LOCALES, setLocale, trackModality } from '@readarxiv/ui'
import {
  createController,
  DEFAULTS,
  eventsOf,
  mountChrome,
  openReader,
  PARTS,
  type Parts,
  type Prefs,
  type PrefsPatch,
  type Reader,
  type ReaderController,
  type ReaderState,
  type Slots,
  type StateWords,
  ToolbarButton,
  type UiLanguage,
  useReader,
} from '../../src/index.ts'
import { fixtureLay, pagesOf, type ReaderDump } from './convert.ts'

interface Options {
  target?: string
  ui?: UiLanguage
  /** a host's own controls in every slot: its way home, its short link, its share (which says "copied" in the chrome's toast
   *  place), its interface language */
  slots?: boolean
  /** a host's words for the capsule's and the cards' states (HOST_WORDS) */
  words?: boolean
  /** the host's rule for the narrow window (none: the extension's) */
  narrow?: 'told' | 'shown'
  /** the website's rules for the states (L11's second and third rounds): its signs, its retry at its time, the original alone over
   *  a refusal for now, the sync greyed until the sides can scroll together, the bare bar where neither side has anything to show
   *  (none: the extension's) */
  site?: boolean
  /** where the original is read: our copy (the default), or an address our server answers 503 (the original lost) */
  original?: 'ours' | 'broken'
  /** the fixtures' faces (the default), or a face whose file is not there (a face lost) */
  faces?: 'fixtures' | 'missing'
}

/** the website's words beside HOST_WORDS: its chip that shows the translation, its way to arXiv's PDF, its link where the
 *  extension is not on the page, its card's lines */
const SITE_WORDS: StateWords = {
  translating: (got, total, chip) => (chip ? 'Translating' : `Translating ${got} / ${total}`),
  showTranslation: 'Show translation',
  originalLost: 'The original cannot be shown here',
  openOriginal: 'Open the PDF on arXiv',
  htmlLink: () => ({ href: 'https://example.org/store', label: 'Install the extension' }),
  notNow: (at) => (at !== null && Date.now() < at ? 'Unavailable until later' : 'Unavailable for now'),
  busy: (at) => (at !== null && Date.now() < at ? 'Busy until later' : 'Busy for now'),
  cardLines: (_kind, at) => ({ sub: at !== null && Date.now() < at ? 'Retry later' : null }),
}

/** a host's words, each naming its state, as the website's table says its own */
const HOST_WORDS: StateWords = {
  queued: (n) => `Queued, number ${n}`,
  preparing: 'Preparing the paper',
  translating: (got, total) => `Translating ${got} / ${total}`,
  reconnecting: 'Reconnecting',
  noPdf: 'No bilingual PDF of this paper',
  tooLarge: 'The paper is too large',
  notNow: () => 'Unavailable for now',
  busy: () => 'Busy for now',
  limited: () => 'Your share of new papers is spent',
  failed: () => 'The translation is unavailable',
  originalLost: 'The original could not be read',
}
interface Fixture {
  paper: string
  dumps: Record<string, string>
  rows: Record<string, string>
  face: string | null
}

/** the fixtures' faces: PDF.js's own Liberation Sans, as the harness page's (main.ts faceTable) */
const FACES = {
  sans: { src: '/pdfjs/6.3.289/standard_fonts/LiberationSans-Regular.ttf', fallback: 'sans-serif' },
  cjk: { local: 'Songti SC', fallback: '"STSong", "Noto Serif CJK SC", serif' },
}

/** a sign as drawn, by its shapes' attributes: the checks name the capsule's and the cards' signs by it */
const signOf = (node: typeof Info) => JSON.stringify(node.map(([, a]) => a))
const SIGNS = { info: signOf(Info), clock: signOf(Clock), alert: signOf(CircleAlert), file: signOf(FileText) }

const c = {
  reader: null as Reader | null,
  controller: null as ReaderController | null,
  /** the sign an element's own icon draws (its first svg child), by name; null where it is none of these */
  signOf(el: Element | null) {
    const svg = el?.querySelector(':scope > svg')
    if (!svg) return null
    const drawn = JSON.stringify(
      [...svg.children].map((x) => Object.fromEntries([...x.attributes].map((a) => [a.name, a.value]))),
    )
    return (Object.entries(SIGNS).find(([, v]) => v === drawn)?.[0] as keyof typeof SIGNS | undefined) ?? null
  },
  /** what the chrome's state was, a row each time one of these changed (the checks read what came before what) */
  trail: [] as Record<string, unknown>[],
  /** what the host's own controls were pressed for, and the preferences' writes the reader asked of the host */
  clicked: [] as string[],
  writes: [] as Partial<Prefs>[],
  /** the catalogue's words of `ui`, as the checks find the chrome's controls by them */
  words: (ui: UiLanguage) => ({
    contents: LOCALES[ui].R.contents,
    options: LOCALES[ui].R.options.name,
    dim: LOCALES[ui].R.options.dim,
    bilingual: LOCALES[ui].R.display.bilingual,
    translation: LOCALES[ui].R.display.translation,
    original: LOCALES[ui].R.display.original,
    sync: LOCALES[ui].R.sync,
    swap: LOCALES[ui].R.swap,
  }),
  async open(name: string, o: Options = {}) {
    const fx = (await (await fetch(`/fixtures/${name}/index.json`)).json()) as Fixture
    const target = o.target ?? 'de'
    const ui = o.ui ?? 'en'
    setLocale(ui)
    document.documentElement.lang = ui
    const prefs: Prefs = { ...DEFAULTS, target, ui, bands: [{ id: 'soft-green', colour: '#cdeccd', name: null }] }
    const host = {
      fetch: (u: string, i?: RequestInit) => fetch(u, i),
      original: (ref: string) =>
        o.original === 'broken'
          ? `/api/v2/o/broken/${ref.replace(/[./]/g, '_')}.pdf`
          : `/api/v2/o/arxiv/${ref.replace(/[./]/g, '_')}.pdf`,
      prefs: {
        read: async () => prefs,
        write: async (patch: Partial<Prefs>) => {
          c.writes.push(patch)
        },
        watch: () => () => {},
      },
    }
    const engine = {
      faces:
        o.faces === 'missing' ? { ...FACES, sans: { src: '/fonts/not-there.ttf', fallback: 'sans-serif' } } : FACES,
      lay: async (partOf: (n: number) => Promise<Part | null>, pages: number) => {
        const parts = new Map<number, Part>()
        for (let n = 1; n <= pages; n++) {
          const p = await partOf(n)
          if (p) parts.set(n, p)
        }
        const dump = (await (
          await fetch(`/fixtures/${name}/${fx.dumps[target] ?? `${target}.reader.json`}`)
        ).json()) as ReaderDump
        return fixtureLay(
          pagesOf(
            parts,
            dump,
            (m) => fx.face ?? ([...JSON.stringify(m)].some((ch) => ch.charCodeAt(0) > 127) ? 'cjk' : 'sans'),
          ),
          parts,
        )
      },
    }
    const controller = createController({
      open: async (chrome) => {
        const reader = openReader(document.body, {
          host,
          paper: fx.paper,
          visit: { target },
          engine,
          panes: { left: chrome.left, right: chrome.right },
        })
        c.reader = reader
        let told: ReaderState | null = null
        const tell = () => {
          const s = reader.state()
          for (const e of eventsOf(told, s)) chrome.emit(e)
          told = s
        }
        reader.subscribe(tell)
        tell()
        const set = (patch: PrefsPatch) => {
          const now = reader.state().prefs
          reader.do({
            do: 'set',
            prefs: {
              ...(patch as Partial<Prefs>),
              ...(patch.classes ? { classes: { ...now.classes, ...patch.classes } } : {}),
              ...(patch.highlight ? { highlight: { ...now.highlight, ...patch.highlight } } : {}),
            },
          })
        }
        return {
          setDisplay: (display) => set({ display }),
          setSyncMode: (m) => set({ sync: m === 'same' }),
          zoomBy: (factor) => reader.do({ do: 'zoomBy', factor }),
          zoomTo: (to) => reader.do({ do: 'zoom', to }),
          goToPage: (side, page) => reader.do({ do: 'page', side, page }),
          setPrefs: set,
          pdfBytes: async () => null,
          openOriginal: () => reader.do({ do: 'original' }),
          goToUnit: (id) => reader.do({ do: 'heading', id }),
          lead: (side) => reader.do({ do: 'lead', side }),
          retry: () => reader.do({ do: 'retry' }),
          setNarrow: (on) => reader.do({ do: 'narrow', on }),
          pinch: (side, factor, at) => reader.do({ do: 'pinch', side, factor, at }),
          hold: (on) => reader.do({ do: 'hold', on }),
        }
      },
      paper: fx.paper,
      first: { prefs, unreadable: false },
      defaults: prefs,
    })
    c.controller = controller
    c.trail = []
    const keys = ['syncAvailable', 'display', 'phase', 'chose', 'made'] as const
    controller.subscribe(() => {
      const s = controller.getState()
      const row = Object.fromEntries(keys.map((k) => [k, s[k]]))
      const last = c.trail.at(-1)
      if (!last || keys.some((k) => last[k] !== row[k])) c.trail.push(row)
    })
    trackModality()
    const parts: Parts = {
      ...PARTS,
      ...(o.slots ? { slots: hostSlots(controller) } : {}),
      ...(o.words || o.site ? { words: { ...HOST_WORDS, ...(o.site ? SITE_WORDS : {}) } } : {}),
      ...(o.narrow ? { narrow: o.narrow } : {}),
      ...(o.site
        ? {
            signs: 'by-state' as const,
            retry: 'when-due' as const,
            refusal: 'original' as const,
            sync: 'located' as const,
            // (its page's bar where neither side has anything to show)
            bar: 'bare' as const,
            // (its store page's origin, which its HTML link leads to)
            linkOrigins: ['https://example.org'],
          }
        : {}),
    }
    mountChrome(document.getElementById('root') as HTMLElement, { controller, parts })
    return { paper: fx.paper }
  },
}
Object.assign(window, { __c: c })
// (the way home is a link: where it went, told)
addEventListener('hashchange', () => c.clicked.push(location.hash.slice(1)))

/** a host's own controls, in the places the website puts its own: its way home first in the bar's lead, a short link to arXiv
 *  right after the title, its share after the reading options, its interface language last in them */
function hostSlots(controller: ReaderController): Slots {
  return {
    lead: (
      <a href="#home" className="tbtn" aria-label="Home" data-host="home">
        <Icon node={ChevronLeft} />
      </a>
    ),
    afterTitle: (
      <a data-host="short" href="https://arxiv.org/abs/2600.00002v1" className="arxiv-id">
        arXiv
      </a>
    ),
    afterOptions: (at) =>
      at === 'bar' ? (
        <ToolbarButton
          label="Share"
          data-host="share"
          onClick={() => {
            c.clicked.push('share')
            controller.toast({ words: 'Link copied', icon: 'check' })
          }}
        >
          <Icon node={Share} />
        </ToolbarButton>
      ) : null,
    options: <UiRow controller={controller} />,
  }
}

/** the interface's language, as the website's row picks it: the catalogue set to it, then the preference written */
function UiRow({ controller }: { controller: ReaderController }) {
  const ui = useReader(controller, (s) => s.prefs?.ui ?? 'en')
  const next: UiLanguage = ui === 'en' ? 'zh-CN' : 'en'
  return (
    <div className="row">
      Interface language
      <button
        type="button"
        data-host="ui"
        onClick={() => {
          c.clicked.push(`ui:${next}`)
          setLocale(next)
          document.documentElement.lang = next
          controller.setPrefs({ ui: next })
        }}
      >
        {ui}
      </button>
    </div>
  )
}
