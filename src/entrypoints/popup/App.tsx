// The popup: data (messages and polling) → view model (UI.md §4 state table) → PopupView (render).
// Three layers, each testable on its own and reusable by the gallery
import type { FrameOwner } from '@/shared/frame-owner'
import { PopupView } from './PopupView'
import { usePopupData } from './data'
import { derivePopupView } from './view-model'

/** `rejected`: the record of refused keys, read before the first render (main.tsx); `owner`: whom it acts for (frame-owner.ts) */
export function App({ rejected, owner }: { rejected?: readonly string[]; owner?: FrameOwner }) {
  const { input, error, actions } = usePopupData({ rejected, owner })
  return <PopupView view={derivePopupView(input)} error={error} actions={actions} />
}
