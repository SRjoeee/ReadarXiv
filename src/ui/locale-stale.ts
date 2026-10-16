// Whether a configuration's interface language resolves to another pack than the one this page was painted in (chosen once,
// before the first paint): what a surface reloads for. Apart from the surfaces' React binding (use-surface-config.ts), so
// that a page with no React in its session (the PDF reader's) takes it without the binding
import type { Config } from '@/config/schema'
import { pickLocale } from '@/locales'
import { browserLanguages } from './apply-locale'
import { localeInUse } from './strings'

export const localeStale = (config: Config) => pickLocale(config.uiLanguage, browserLanguages()) !== localeInUse()
