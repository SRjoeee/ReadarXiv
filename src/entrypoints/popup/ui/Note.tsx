// A note (the redesign's design, §5.2; round 4, and A of round 6): a row on the group, its icon on its first line — the
// alert in danger for something blocked or stopped, the information in ink-2 for something that goes on — its words in
// ink, never red, and a raised button at its trailing edge (Settings or Retry)
import { CircleAlert, Info } from 'lucide'
import { Button } from '@/ui/controls/Button'
import { Icon } from '@/ui/controls/Icon'

export function Note({ tone, text, action }: { tone: 'alert' | 'info'; text: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="note" data-tone={tone}>
      <p>
        <Icon node={tone === 'alert' ? CircleAlert : Info} />
        {text}
      </p>
      {/* the note's raised button: 26 px and 10 px in, Part 3's measure for it (rounds 4–6) */}
      {action && <Button kind="raised" onClick={action.run}>{action.label}</Button>}
    </div>
  )
}
