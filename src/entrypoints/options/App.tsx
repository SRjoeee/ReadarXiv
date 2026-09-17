// The settings page: a left navigation and four sections, on the popup's tokens and dark mode.
// There is no save button — every control writes the config as it changes, and the drawers commit
// with one button (docs/UI.md §3.2, rebuilt 2026-09-10).
import { useEffect, useState } from 'react'
import { browser } from 'wxt/browser'
import { LOCALE_CODES, LOCALE_NAMES, type LocaleCode } from '@/locales'
import { BrandMark } from '@/ui/BrandMark'
import { Confirm } from '@/ui/Confirm'
import { MenuField } from '@/ui/MenuField'
import { O, fallbackText } from '@/ui/strings'
import { useOptionsData } from './data'
import { Data } from './sections/Data'
import { Prompts } from './sections/Prompts'
import { Reading } from './sections/Reading'
import { Services } from './sections/Services'

const SECTIONS = ['services', 'reading', 'prompts', 'data'] as const
type Section = (typeof SECTIONS)[number]
const isSection = (v: string): v is Section => (SECTIONS as readonly string[]).includes(v)

export function App() {
  const data = useOptionsData()
  // The hash keeps the place across a reload, and lets a note in the popup link straight here
  const [section, setSection] = useState<Section>(() => {
    const hash = location.hash.slice(1)
    return isSection(hash) ? hash : 'services'
  })
  useEffect(() => { location.hash = section }, [section])

  return (
    <div className="min-h-screen bg-bg font-ui text-[13px] text-fg">
      <div className="mx-auto flex max-w-[900px] gap-8 px-6 py-8">
        <nav aria-label={O.title} className="w-[140px] shrink-0">
          <h1 className="mb-4 flex items-center gap-2 px-3 text-[15px] font-bold">
            <BrandMark size={20} />
            {O.title}
          </h1>
          {SECTIONS.map(id => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
              className={`mb-1 block w-full cursor-pointer rounded-control px-3 py-2 text-left text-[13px] font-semibold ${section === id ? 'bg-card text-fg shadow-[0_1px_2px_rgba(30,30,36,0.06)]' : 'text-fg-2 hover:text-fg'}`}
            >
              {O.nav[id]}
            </button>
          ))}

          {/* The interface's own language, under the nav rather than in a section: it belongs to
              none of them, and it must not sit next to the target language, which is a different choice
              (S-O-05). Changing it reloads the page — the words are read once, before the first
              paint, so that nothing is ever half translated. A setting like the rest: not offered over a configuration
              that cannot be read (S-O-02) */}
          {data.config && !data.fallbackReason && (
            <div className="mt-6 px-3">
              <p className="mb-1.5 text-[11px] font-semibold text-fg-2">{O.uiLanguage}</p>
              <MenuField
                label={O.uiLanguage}
                value={data.config.uiLanguage === 'auto' ? O.uiLanguageAuto : LOCALE_NAMES[data.config.uiLanguage as LocaleCode] ?? O.uiLanguageAuto}
                compact
                items={[
                  { id: 'auto', name: O.uiLanguageAuto, selected: data.config.uiLanguage === 'auto' },
                  ...LOCALE_CODES.map(code => ({ id: code, name: LOCALE_NAMES[code], selected: data.config?.uiLanguage === code })),
                ]}
                onSelect={async code => {
                  await data.patch(latest => ({ ...latest, uiLanguage: code }))
                  location.reload()
                }}
              />
            </div>
          )}
        </nav>

        <main className="min-w-0 flex-1">
          {data.fallbackReason && (
            <div className="mb-6 rounded-card bg-accent-soft px-3.5 py-3 text-[12px] leading-relaxed text-accent">
              <p>
                {O.fallbackNotice}
                <span className="mt-1 block text-fg-2">{fallbackText(data.fallbackReason)}</span>
              </p>
              <div className="mt-2 flex justify-end">
                <Confirm label={O.fallbackReset} confirmLabel={O.fallbackResetConfirm} cancelLabel={O.services.cancel} onConfirm={() => void data.reset()} />
              </div>
            </div>
          )}
          {/* The three sections that write are not shown over a configuration that cannot be read: what they would show is
              the defaults, not the reader's settings, and the store refuses their saves (S-O-02). “Data” writes none */}
          {!data.fallbackReason && section === 'services' && <Services data={data} extensionId={browser.runtime.id} />}
          {!data.fallbackReason && section === 'reading' && <Reading data={data} />}
          {!data.fallbackReason && section === 'prompts' && <Prompts data={data} />}
          {section === 'data' && <Data data={data} />}
        </main>
      </div>
    </div>
  )
}
