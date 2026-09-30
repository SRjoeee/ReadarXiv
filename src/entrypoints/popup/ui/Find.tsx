// P0, no paper in the tab (the redesign's design, §5.4; round 6): a sentence, a field that takes a link, an id or words,
// and under it what Enter will do — open a paper's page, search arXiv, offer a paper's two entries, or say that only
// arXiv's papers open here. Nothing happens until Enter, and a paste is a paste. Everything it opens, it opens in a new
// tab (openLink), whatever S-O-49b says: that setting is about leaving a paper's page, and this page is not one
import { BookOpen, CircleAlert, FileText, Globe, Info, Search } from 'lucide'
import { useId } from 'react'
import { Icon } from '@/ui/controls/Icon'
import { Kbd } from '@/ui/controls/Kbd'
import { Reveal } from '@/ui/controls/Reveal'
import { S } from '@/ui/strings'
import type { PopupActions } from '../data'
import { ADVANCED_SEARCH } from '../find'
import type { FoundEntry, Note as NoteView, PopupView } from '../view-model'
import { Entries } from './Entries'
import { Note } from './Note'

export function Find({ find, failure, actions }: { find: NonNullable<PopupView['find']>; failure: string | null; actions: PopupActions }) {
  const under = useId()
  const found = find.found
  const go = found?.kind === 'open' || found?.kind === 'search' ? found : null
  const paper = found?.kind === 'paper' ? found : null
  const entry = (e: FoundEntry) => ({ label: e.label, disabled: e.href === null, run: () => { if (e.href) actions.openLink(e.href) } })
  /**
   * A reason under what the field found, as P17 draws it: an alert as a Note — the settings button beside it when the
   * service is the reason —, the lesser case (an HTML version missing, the PDF entry working) as a plain line
   */
  const reason = (note: NoteView) => (note.tone === 'alert'
    ? <Note tone="alert" text={note.text} action={note.settings ? { label: S.settings, run: () => actions.openOptions() } : undefined} />
    : <p className="line mark"><Icon node={Info} size={14} />{note.text}</p>)
  /*
   * What the field understood, echoed to a screen reader politely (the design's §9: results are status, nothing
   * assertive) — the same words the row itself already carries (the sentence, the row's label and id, or the paper's
   * line), so a reader who is not looking at the field still hears what Enter will do as it changes. A hidden mirror,
   * not `role="status"` on `.found` itself: the go rows are buttons, and a role of `status` on a button would replace
   * its own role rather than add to it. The entries and the note stay out of the echo on purpose — each change
   * announces the one short line above, not the two buttons or the reason one is greyed, which a reader tabbing to
   * them meets directly
   */
  const status = found === null ? `${S.find.enter} · ${S.find.advanced}`
    : found.kind === 'open' ? `${found.label} ${found.paper}`
      : found.kind === 'search' ? found.label
        : found.kind === 'paper' ? found.paper
          : found.text
  return (
    // A fragment, not one root: the echo sits outside `.find`'s own children, which keep the shape
    // find-view.test.ts checks (the help line, the field, `.found`) — a live region needs no place of its own in it
    <>
      <div className="find">
        <p className="line">{S.find.lead}</p>
        <label className="find-field">
          <Icon node={Search} size={14} />
          <input
            value={find.query}
            placeholder={S.find.field}
            aria-label={S.find.field}
            aria-describedby={under}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            // biome-ignore lint/a11y/noAutofocus: P0's one purpose is this field — the popup opening on a page that is not a paper lets the reader type at once, as the launchers it is measured against do
            autoFocus
            onChange={e => actions.setQuery(e.target.value)}
            // Enter acts; the Enter that ends an input method's composition (a title typed in Pinyin) is the method's
            // (a row greyed — no service can serve the paper — has no address: Enter opens nothing, as a greyed entry would)
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && go?.href) { e.preventDefault(); actions.openLink(go.href) } }}
          />
        </label>
        <div id={under} className="found">
          {found === null && (
            <p className="line">
              {S.find.enter} · <a href={ADVANCED_SEARCH} target="_blank" rel="noopener" onClick={e => { e.preventDefault(); actions.openLink(ADVANCED_SEARCH) }}>{S.find.advanced}</a>
            </p>
          )}
          {go?.kind === 'open' && (
            <>
              {/* greyed as a greyed entry is (Button.tsx): aria-disabled, still in the tab order, its press and its key
                  gone, its reason under it (Codex 5a) */}
              <button type="button" className="go brand" aria-label={`${go.label} ${go.paper}`} aria-disabled={go.href === null || undefined}
                onClick={() => { if (go.href) actions.openLink(go.href) }}>
                <Icon node={go.format === 'pdf' ? FileText : Globe} size={14} />
                <span className="go-label">{go.label}</span>
                <span className="go-id">{go.paper}</span>
                {go.href && <Kbd>↵</Kbd>}
              </button>
              {go.note && reason(go.note)}
            </>
          )}
          {go?.kind === 'search' && (
            <button type="button" className="go" aria-label={go.label} onClick={() => actions.openLink(go.href)}>
              <Icon node={Search} size={14} />
              <span className="go-words">{go.label}</span>
              <Kbd>↵</Kbd>
            </button>
          )}
          {paper && (
            <>
              <p className="paper"><Icon node={BookOpen} size={14} /><b>{paper.paper}</b></p>
              {/* the two entries appear when both checks have answered (§5.4), with §8's reveal */}
              <Reveal open={paper.entries !== null}>
                <div className="found">
                  {paper.entries && <Entries html={entry(paper.entries.html)} pdf={entry(paper.entries.pdf)} />}
                  {/*
                   * Task 33's review: with neither entry offered, P17 draws the reason as a Note in the alert tone
                   * (view-model.ts's noHtmlNote, entry.pdf === null) — the same words this paper's note carries when its
                   * own PDF entry is also missing; and a service that cannot run, with nothing to take over, says so as
                   * P17b does, the settings button beside it (the final review). P0 must say it the same way, so a reader who typed a
                   * paper's id here and one who landed on its abstract page read the same sentence drawn the same way.
                   * The plain line stays for the lesser case: an HTML version missing while the PDF entry still works (info)
                   */}
                  {paper.note && reason(paper.note)}
                </div>
              </Reveal>
            </>
          )}
          {found?.kind === 'elsewhere' && <p className="line mark"><Icon node={Info} size={14} />{found.text}</p>}
          {failure && <p className="line mark alert"><Icon node={CircleAlert} size={14} />{failure}</p>}
        </div>
      </div>
      <p role="status" className="sr-only">{status}</p>
    </>
  )
}
