// The controls sheet (a dev page, like the gallery: wxt.config.ts DEV_PAGES keeps it out of a release): every control of
// src/ui/controls that the redesign's Part 3 adds, in each of its states, light and dark side by side on the pages' own
// sheet (ui.css), in the language `?lang=` names — to look at in a real browser before the popup and the settings page
// use them, and for tests/e2e/probes/controls.mjs to measure
import '@/styles/ui.css'
import './sheet.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LOCALE_CODES, type LocaleCode } from '@/locales'
import { trackModality } from '@/ui/controls/modality'
import { setLocale } from '@/ui/strings'
import { SPECIMENS } from './specimens'

const asked = new URLSearchParams(location.search).get('lang') as LocaleCode | null
const lang: LocaleCode = asked && LOCALE_CODES.includes(asked) ? asked : 'zh-CN'
setLocale(lang)
document.documentElement.lang = lang
trackModality()

function Half({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <section data-theme={theme} className="ui half">
      {SPECIMENS.map(({ name, Specimen }) => (
        <div key={name} data-specimen={name} className="specimen">
          <h2>{name}</h2>
          <Specimen />
        </div>
      ))}
    </section>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="halves">
      <Half theme="light" />
      <Half theme="dark" />
    </main>
  </StrictMode>,
)
