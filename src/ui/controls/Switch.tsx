// The switch (the reader's design, §4.1; every surface's since the redesign's §2.3): 28 × 17, the track ink when on and
// ink-3 when off (the harness's n-5 read 1.5:1 against the chrome); on the popup and the settings page the brand when on,
// its thumb white, by their own sheets (the maintainer, 2026-09-28); named by its row's words. Out of reach it is greyed
// and presses nothing, but stays a stop (aria-disabled, not `disabled`: the browser's would take its tooltip), and
// `why` is the tooltip then, beside its name (the reader, S-R-21)
import { useTip } from './tip'

export function Switch({ label, checked, onChange, disabled = false, why }: { label: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean; why?: string }) {
  const { props, tip } = useTip(label, why)
  return (
    <>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-description={why} aria-disabled={disabled || undefined} className="switch" onClick={() => { if (!disabled) onChange(!checked) }} {...(why ? props : {})} />
      {why && tip}
    </>
  )
}
