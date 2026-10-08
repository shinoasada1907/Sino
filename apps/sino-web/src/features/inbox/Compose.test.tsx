import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import { sendMessage } from './inbox.api'
import { createInboxSample } from './inbox.sample'

vi.mock('./inbox.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./inbox.api')>()
  return { ...api, sendMessage: vi.fn(api.sendMessage) }
})

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW), inbox: createInboxSample(NOW) })
}

const chat = (title: string) => within(screen.getByRole('region', { name: `Cuộc trò chuyện ${title}` }))
const thread = () => within(screen.getByRole('region', { name: 'Cuộc trò chuyện đang mở' }))
const list = () => within(screen.getByRole('region', { name: 'Danh sách cuộc trò chuyện' }))

describe('writing and sending', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends a chat message with Enter: it shows as sending, then sent, and becomes the preview of the row', async () => {
    open('/inbox/conv-2')
    const user = userEvent.setup()
    const box = await chat('Gia đình').findByRole('textbox', { name: 'Nhắn tin tới Gia đình' })

    await user.type(box, 'Con về lúc 6 giờ{Enter}')

    expect(chat('Gia đình').getByText('Con về lúc 6 giờ')).toBeInTheDocument()
    expect(chat('Gia đình').getByText('14:05 · Đang gửi')).toBeInTheDocument()
    expect(box).toHaveValue('')
    expect(await chat('Gia đình').findByText('14:05 · Đã gửi')).toBeInTheDocument()
    expect(within(list().getByRole('link', { name: /Gia đình/ })).getByText('Bạn: Con về lúc 6 giờ')).toBeInTheDocument()
  })

  it('starts a new line with Shift Enter in a chat instead of sending', async () => {
    open('/inbox/conv-2')
    const user = userEvent.setup()
    const box = await chat('Gia đình').findByRole('textbox', { name: 'Nhắn tin tới Gia đình' })

    await user.type(box, 'Dòng một{Shift>}{Enter}{/Shift}dòng hai')

    expect(box).toHaveValue('Dòng một\ndòng hai')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does not send while an input method is still composing a word', async () => {
    open('/inbox/conv-2')
    const box = await chat('Gia đình').findByRole('textbox', { name: 'Nhắn tin tới Gia đình' })
    const user = userEvent.setup()
    await user.type(box, 'Vie')

    await act(async () => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(sendMessage).not.toHaveBeenCalled()
    expect(box).toHaveValue('Vie')
  })

  it('sends an email reply with Ctrl Enter or the button; Enter alone starts a new line', async () => {
    open('/inbox/conv-1')
    const user = userEvent.setup()
    const box = await thread().findByRole('textbox', { name: 'Trả lời Trần Minh Anh' })

    await user.type(box, 'Anh đồng ý điều khoản 4.{Enter}')
    expect(sendMessage).not.toHaveBeenCalled()
    await user.type(box, 'Phụ lục góp ý sau.{Control>}{Enter}{/Control}')

    expect(sendMessage).toHaveBeenCalledWith('conv-1', 'Anh đồng ý điều khoản 4.\nPhụ lục góp ý sau.')
    expect(box).toHaveValue('')
    expect(await thread().findByText('Phụ lục góp ý sau.')).toBeInTheDocument()
    expect(thread().getByText('14:05 hôm nay · Đang gửi')).toBeInTheDocument()
    expect(await thread().findByText('14:05 hôm nay')).toBeInTheDocument()

    await user.type(box, '  Cảm ơn em.  ')
    await user.click(thread().getByRole('button', { name: 'Gửi' }))
    expect(sendMessage).toHaveBeenLastCalledWith('conv-1', 'Cảm ơn em.')
  })

  it('does not send an empty message', async () => {
    open('/inbox/conv-2')
    const user = userEvent.setup()
    const box = await chat('Gia đình').findByRole('textbox', { name: 'Nhắn tin tới Gia đình' })

    expect(chat('Gia đình').getByRole('button', { name: 'Gửi' })).toBeDisabled()
    await user.type(box, '   {Enter}')

    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('marks a message that could not be sent', async () => {
    vi.mocked(sendMessage).mockRejectedValueOnce(new Error('offline'))
    open('/inbox/conv-2')
    const user = userEvent.setup()

    await user.type(await chat('Gia đình').findByRole('textbox', { name: 'Nhắn tin tới Gia đình' }), 'Alo{Enter}')

    expect(await chat('Gia đình').findByText('14:05 · Không gửi được')).toBeInTheDocument()
  })
})
