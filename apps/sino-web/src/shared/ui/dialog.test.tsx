import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Button } from './button'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog'

function ConfirmDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">Mở</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ngắt kết nối Messenger?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>Sino sẽ dừng đồng bộ.</DialogDescription>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Hủy
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

describe('Dialog', () => {
  it('opens as a named dialog with its description', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog />)

    await user.click(screen.getByRole('button', { name: 'Mở' }))

    const dialog = screen.getByRole('dialog', { name: 'Ngắt kết nối Messenger?' })
    expect(dialog).toHaveAccessibleDescription('Sino sẽ dừng đồng bộ.')
  })

  it('closes with Hủy, with the Đóng button and with Escape', async () => {
    const user = userEvent.setup()
    render(<ConfirmDialog />)
    const open = screen.getByRole('button', { name: 'Mở' })

    await user.click(open)
    await user.click(screen.getByRole('button', { name: 'Hủy' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(open)
    await user.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(open)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
