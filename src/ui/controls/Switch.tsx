// The reader's switch (the reader's design, §4.1): 28 × 17, the track ink when on and ink-3 when off (the harness's n-5
// read 1.5:1 against the chrome); named by its row's words
export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
}
