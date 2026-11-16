import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { NoticeBar } from './NoticeBar'
import type { ArrivalNotice } from './useArrivalNotices'

function renderBar(notices: ArrivalNotice[], onDismiss = vi.fn()) {
  render(
    <MemoryRouter>
      <NoticeBar notices={notices} onDismiss={onDismiss} />
    </MemoryRouter>,
  )
  return onDismiss
}

describe('NoticeBar (D-319)', () => {
  it('is an empty status region while there is nothing to say, so that the first notice is read out', () => {
    renderBar([])

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('says the new chats and links to Tin nhắn', () => {
    renderBar([{ kind: 'CHAT', count: 3 }])

    const bar = within(screen.getByRole('status'))
    expect(bar.getByText('3 tin mới')).toBeInTheDocument()
    expect(bar.getByRole('link', { name: /^Xem/ })).toHaveAttribute('href', '/messages')
  })

  it('says the new mail as thư and links to Hộp thư', () => {
    renderBar([{ kind: 'EMAIL', count: 2 }])

    const bar = within(screen.getByRole('status'))
    expect(bar.getByText('2 thư mới')).toBeInTheDocument()
    expect(bar.getByRole('link', { name: /^Xem/ })).toHaveAttribute('href', '/inbox')
  })

  it('has a row for each kind', () => {
    renderBar([
      { kind: 'CHAT', count: 2 },
      { kind: 'EMAIL', count: 1 },
    ])

    const bar = within(screen.getByRole('status'))
    expect(bar.getAllByRole('link', { name: /^Xem/ })).toHaveLength(2)
    expect(bar.getByText('2 tin mới')).toBeInTheDocument()
    expect(bar.getByText('1 thư mới')).toBeInTheDocument()
  })

  it('dismisses the kind of the row that was closed', async () => {
    const onDismiss = renderBar([
      { kind: 'CHAT', count: 2 },
      { kind: 'EMAIL', count: 1 },
    ])

    await userEvent.click(screen.getByRole('button', { name: /^Đóng thông báo.*thư mới/ }))

    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('EMAIL')
  })

  it('dismisses the row when its link is followed, so that it does not stay on the screen it points to', async () => {
    const onDismiss = renderBar([{ kind: 'CHAT', count: 2 }])

    await userEvent.click(screen.getByRole('link', { name: /^Xem/ }))

    expect(onDismiss).toHaveBeenCalledExactlyOnceWith('CHAT')
  })
})
