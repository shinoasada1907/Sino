import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShellSample } from '@/app/shell/shell.sample'
import { renderApp } from '@/test/renderApp'
import { leaveTo, startConnect } from './accounts.api'
import { createAccountsSample } from './accounts.sample'

// The wizard on the full contract of fe-ui-connect (sample providers with scopes, the sample round trip); the API path
// is tested in ConnectOnApi.test.tsx.
vi.mock('./accounts.api', async (importOriginal) => {
  const api = await importOriginal<typeof import('./accounts.api')>()
  const { createConnectProvidersSample } = await import('./connect.sample')
  return {
    ...api,
    fetchConnectProviders: vi.fn(async () => createConnectProvidersSample()),
    startConnect: vi.fn(async (_provider: string, accountId: string | null) => ({ authorizationUrl: `/accounts?connected=${accountId ?? 'acc-gmail'}` })),
    leaveTo: vi.fn(),
  }
})

// Friday 2 October 2026, 14:05 in Vietnam: the moment the canvas shows.
const NOW = new Date('2026-10-02T07:05:00Z')

function open(path: string) {
  return renderApp(path, { shell: createShellSample(NOW), accounts: createAccountsSample(NOW) })
}

const wizard = () => within(screen.getByRole('dialog'))
const currentStep = () => wizard().getByRole('listitem', { current: 'step' })

describe('Kết nối tài khoản', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on the provider step, where only the providers with a connect flow can be picked', async () => {
    open('/accounts')
    const user = userEvent.setup()

    await user.click((await screen.findAllByRole('button', { name: 'Kết nối tài khoản' }))[0])

    expect(screen.getByRole('dialog', { name: 'Chọn nhà cung cấp' })).toBeInTheDocument()
    expect(wizard().getByText('Kết nối tài khoản · 1/5')).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('1 · Nhà cung cấp')
    expect(wizard().getAllByRole('listitem').filter((item) => item.closest('ol'))).toHaveLength(5)
    expect(wizard().getByRole('radio', { name: /Gmail/ })).toBeChecked()
    expect(wizard().getByRole('radio', { name: /Telegram/ })).toBeDisabled()
    expect(wizard().getByRole('radio', { name: /Zalo/ })).toBeDisabled()
    expect(wizard().getByRole('radio', { name: /Telegram/ }).closest('label')).toHaveTextContent('Sắp có')
    expect(wizard().getByRole('radio', { name: /Gmail/ }).closest('label')).toHaveTextContent('Thư điện tửĐọcGửi')
    expect(wizard().getByText('Chỉ xin quyền tối thiểu. Bạn xem lại ở bước 2.')).toBeInTheDocument()
  })

  it('opens from the mobile buttons too', async () => {
    open('/accounts')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Thêm tài khoản' }))
    expect(screen.getByRole('dialog', { name: 'Chọn nhà cung cấp' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()

    const buttons = screen.getAllByRole('button', { name: 'Kết nối tài khoản' })
    await user.click(buttons[buttons.length - 1])
    expect(screen.getByRole('dialog', { name: 'Chọn nhà cung cấp' })).toBeInTheDocument()
    await user.click(wizard().getByRole('button', { name: 'Đóng' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the scopes before signing in, then leaves for Google', async () => {
    open('/accounts')
    const user = userEvent.setup()
    await user.click((await screen.findAllByRole('button', { name: 'Kết nối tài khoản' }))[0])

    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    expect(screen.getByRole('dialog', { name: 'Xem lại quyền truy cập' })).toBeInTheDocument()
    expect(currentStep()).toHaveTextContent('2 · Quyền')
    expect(wizard().getByText('Đọc thư và nhãn')).toBeInTheDocument()
    expect(wizard().getByText('Để thư hiện trong Hộp thư hợp nhất và tìm kiếm được.')).toBeInTheDocument()
    expect(wizard().getByText('Xem địa chỉ email')).toBeInTheDocument()
    expect(wizard().getByText('Sino không xin quyền xóa thư, đổi cài đặt Gmail hay đọc danh bạ.')).toBeInTheDocument()

    await user.click(wizard().getByRole('button', { name: 'Quay lại' }))
    expect(screen.getByRole('dialog', { name: 'Chọn nhà cung cấp' })).toBeInTheDocument()
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    await user.click(wizard().getByRole('button', { name: 'Đồng ý và tiếp tục' }))

    expect(screen.getByRole('dialog', { name: 'Đăng nhập' })).toBeInTheDocument()
    expect(wizard().getByRole('heading', { name: 'Đăng nhập bằng Google' })).toBeInTheDocument()
    expect(wizard().getByText('Đăng nhập diễn ra trên trang của Google.')).toBeInTheDocument()
    await user.click(wizard().getByRole('button', { name: 'Quay lại' }))
    expect(screen.getByRole('dialog', { name: 'Xem lại quyền truy cập' })).toBeInTheDocument()
    await user.click(wizard().getByRole('button', { name: 'Đồng ý và tiếp tục' }))
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục tới Google' }))

    expect(startConnect).toHaveBeenCalledWith('gmail', null)
    expect(leaveTo).toHaveBeenCalledWith('/accounts?connected=acc-gmail')
  })

  it('says so when the connect cannot start', async () => {
    vi.mocked(startConnect).mockRejectedValueOnce(new Error('offline'))
    open('/accounts')
    const user = userEvent.setup()
    await user.click((await screen.findAllByRole('button', { name: 'Kết nối tài khoản' }))[0])
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục' }))
    await user.click(wizard().getByRole('button', { name: 'Đồng ý và tiếp tục' }))

    await user.click(wizard().getByRole('button', { name: 'Tiếp tục tới Google' }))

    expect(await wizard().findByRole('alert')).toHaveTextContent('Không bắt đầu được kết nối. Hãy thử lại.')
    expect(leaveTo).not.toHaveBeenCalled()
  })

  it('signs an expired account in again from its alert, starting at the scopes step', async () => {
    const { router } = open('/accounts')
    const user = userEvent.setup()

    const relogin = await screen.findByRole('link', { name: 'Đăng nhập lại' })
    expect(relogin).toHaveAttribute('href', '/accounts?reconnect=acc-messenger')
    await user.click(relogin)

    expect(await screen.findByRole('dialog', { name: 'Xem lại quyền truy cập' })).toBeInTheDocument()
    expect(wizard().getByText('Kết nối tài khoản · 2/5')).toBeInTheDocument()
    expect(wizard().getByText('an.nguyen.92')).toBeInTheDocument()
    expect(wizard().getByText('Sino xin lại đúng những quyền bạn đã cấp lần trước.')).toBeInTheDocument()
    expect(wizard().queryByRole('button', { name: 'Quay lại' })).toBeNull()
    expect(router.state.location.search).toBe('')

    await user.click(wizard().getByRole('button', { name: 'Đồng ý và tiếp tục' }))
    expect(wizard().getByRole('heading', { name: 'Đăng nhập bằng Facebook' })).toBeInTheDocument()
    await user.click(wizard().getByRole('button', { name: 'Tiếp tục tới Facebook' }))

    expect(startConnect).toHaveBeenCalledWith('messenger', 'acc-messenger')
    expect(leaveTo).toHaveBeenCalledWith('/accounts?connected=acc-messenger')
  })

  it('opens again when the same sign-in-again link is used a second time', async () => {
    open('/accounts')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: 'Đăng nhập lại' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('link', { name: 'Đăng nhập lại' }))
    expect(await screen.findByRole('dialog', { name: 'Xem lại quyền truy cập' })).toBeInTheDocument()
  })

  it('signs in again from the account detail, through the list', async () => {
    const { router } = open('/accounts/acc-messenger')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: 'Đăng nhập lại' }))

    expect(router.state.location.pathname).toBe('/accounts')
    expect(await screen.findByRole('dialog', { name: 'Xem lại quyền truy cập' })).toBeInTheDocument()
  })

  it('links the mobile "Đăng nhập lại" to the same flow', async () => {
    open('/accounts/acc-messenger')

    expect(await screen.findByRole('link', { name: 'Đăng nhập lại Messenger' })).toHaveAttribute('href', '/accounts?reconnect=acc-messenger')
  })

  it('opens on the provider step from "Thêm nguồn" of the inbox (?connect=new), then drops the parameter', async () => {
    const { router } = open('/accounts?connect=new')

    expect(await screen.findByRole('dialog', { name: 'Chọn nhà cung cấp' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('ignores a sign-in-again link to an account that does not exist', async () => {
    const { router } = open('/accounts?reconnect=acc-khong-co')

    await screen.findByRole('table', { name: 'Tài khoản đã kết nối' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(router.state.location.search).toBe('')
  })
})
