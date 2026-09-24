// The reader's state for React: the controller is an external store (the reader's design, §11.3)
import { useSyncExternalStore } from 'react'
import type { ReaderController, ReaderState } from '../controller'

export const useReader = (controller: ReaderController): ReaderState => useSyncExternalStore(controller.subscribe, controller.getState)
