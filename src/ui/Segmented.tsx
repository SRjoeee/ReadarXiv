// A segmented control made of aria-pressed buttons rather than radios: the existing e2e suites
// (layout / image / a11y) find the mode buttons with getByRole('button', { name })
import type { ReactNode } from 'react'

// A disabled option stays in its place, greyed, its title saying why (the PDF reader cannot stack: its design, §9.2)
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; title: string; icon?: ReactNode; disabled?: boolean }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex rounded-[10px] bg-control p-[3px] text-[12px] font-semibold">
      {options.map(o => (
        <button
          type="button"
          key={o.value}
          title={o.title}
          aria-pressed={o.value === value}
          aria-disabled={o.disabled || undefined}
          onClick={() => { if (!o.disabled) onChange(o.value) }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-1.5 ${o.disabled ? 'cursor-default opacity-40' : 'cursor-pointer'} ${o.value === value ? 'bg-card text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-fg-2'}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}
