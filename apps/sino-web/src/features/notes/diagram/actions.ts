import { createContext, useContext } from 'react'
import type { BlockColor } from '../notes.types'

/** What a block or a link drawn by React Flow can ask of the canvas (fe-ui-diagram-notes, DG-03). */
export interface DiagramActions {
  /** The block whose words are being written, if any. */
  editing: string | null
  /** The link whose words are being written, if any. */
  editingLink: string | null
  writeBlock: (id: string) => void
  finishBlock: (id: string, text: string) => void
  colorBlock: (id: string, color: BlockColor) => void
  removeBlock: (id: string) => void
  chooseLink: (id: string) => void
  writeLink: (id: string) => void
  finishLink: (id: string, label: string) => void
  removeLink: (id: string) => void
}

export const DiagramActionsContext = createContext<DiagramActions | null>(null)

export function useDiagramActions(): DiagramActions {
  const actions = useContext(DiagramActionsContext)
  if (!actions) {
    throw new Error('A block or a link is drawn outside DiagramCanvas')
  }
  return actions
}
