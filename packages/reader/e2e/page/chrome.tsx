// The harness's host page (chrome.html): the package's chrome over openReader, mounted as both hosts mount it
// (`createController` + `mountChrome`, the reader's state told by `eventsOf`, the chrome's commands the reader's), with a fake
// host over the fixtures (our copy of the original, our server's rows, preferences in memory) and the parts each check gives:
// a host's own controls in the slots, its words, its rule for the narrow window. Driven by the checks through `window.__c`.
// Its sheet (chrome.css) is the page's link.
import type { Part } from '@readarxiv/format'
import { ChevronLeft, Share } from 'lucide'
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

const c = {
  reader: null as Reader | null,
  controller: null as ReaderController | null,
  /** what the host's own controls were pressed for, and the preferences' writes the reader asked of the host */
  clicked: [] as string[],
  writes: [] as Partial<Prefs>[],
  /** the catalogue's words of `ui`, as the checks find the chrome's controls by them */
  words: (ui: UiLanguage) => ({
    contents: LOCALES[ui].R.contents,
    options: LOCALES[ui].R.options.name,
    dim: LOCALES[ui].R.options.dim,
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
      original: (ref: string) => `/api/v2/o/arxiv/${ref.replace(/[./]/g, '_')}.pdf`,
      prefs: {
        read: async () => prefs,
        write: async (patch: Partial<Prefs>) => {
          c.writes.push(patch)
        },
        watch: () => () => {},
      },
    }
    const engine = {
      faces: FACES,
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
        }
      },
      paper: fx.paper,
      first: { prefs, unreadable: false },
      defaults: prefs,
    })
    c.controller = controller
    trackModality()
    const parts: Parts = { ...PARTS, ...(o.slots ? { slots: hostSlots(controller) } : {}) }
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
        <ToolbarButton label="Share" data-host="share" onClick={() => c.clicked.push('share')}>
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
