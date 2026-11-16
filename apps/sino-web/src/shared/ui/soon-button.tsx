import * as React from 'react'
import { Tooltip } from 'radix-ui'
import { cn } from '@/shared/lib/utils'
import { Button } from './button'

export const SOON_LABEL = 'Sắp có'

/**
 * A button whose flow does not exist yet. It keeps its place from the canvas but does nothing: `aria-disabled`
 * (not `disabled`, which gets no hover or focus) so a tooltip "Sắp có" shows on hover and on keyboard focus.
 */
function SoonButton({ className, onClick: _onClick, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <Button
            type="button"
            aria-disabled="true"
            className={cn('cursor-not-allowed opacity-38', className)}
            onClick={(event) => event.preventDefault()}
            {...props}
          />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="z-50 rounded-sm bg-inverse px-2.5 py-1.5 text-xs font-bold text-on-inverse shadow-popover"
          >
            {SOON_LABEL}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export { SoonButton }
