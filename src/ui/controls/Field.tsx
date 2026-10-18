// A labelled field (the redesign's design, §6.3, §9; Part 3's interfaces): its label above the one control it wraps, a
// hint and an error under it, and the wiring a screen reader needs — the label names the control, the error (first) and
// the hint describe it, and the control is marked invalid while there is an error. The control is a TextInput, or any
// control that reads useField() (a combobox) and puts the wiring on its own element
import { CircleAlert } from 'lucide'
import { type ComponentProps, createContext, type ReactNode, useContext, useId } from 'react'
import { Icon } from './Icon'

interface FieldWiring { id: string; describedBy: string | undefined; invalid: boolean }
const FieldContext = createContext<FieldWiring | null>(null)

/** the wiring of the Field around a control, or null outside one */
export const useField = (): FieldWiring | null => useContext(FieldContext)

/** `children`: the one control, typed optional so that a test's createElement can pass it as its third argument */
export function Field({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children?: ReactNode }) {
  const id = useId()
  const describedBy = [error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <FieldContext value={{ id, describedBy, invalid: !!error }}>{children}</FieldContext>
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="field-error">
          <Icon node={CircleAlert} size={14} />
          {error}
        </p>
      )}
    </div>
  )
}

/** A text field (controls.css .input): inside a Field, named and described by it; its own props win */
export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  const field = useField()
  return <input type="text" id={field?.id} aria-describedby={field?.describedBy} aria-invalid={field?.invalid || undefined} {...rest} className={className ? `input ${className}` : 'input'} />
}
