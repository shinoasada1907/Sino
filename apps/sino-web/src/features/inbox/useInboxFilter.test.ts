import { describe, expect, it } from 'vitest'
import { filterSearch, readFilter } from './useInboxFilter'

const read = (search: string, valid: string[] | null, kind: 'EMAIL' | 'CHAT') => readFilter(new URLSearchParams(search), valid, kind)

describe('readFilter (messages-by-account, D-428)', () => {
  it('reads the account, the view and the kind of chat from the address', () => {
    expect(read('account=acc-1&view=unread&chat=group', ['acc-1'], 'CHAT')).toEqual({ account: 'acc-1', chatType: 'group', view: 'unread', folder: null })
  })

  it('takes an account that is not in the list of the screen for every account', () => {
    expect(read('account=acc-9', ['acc-1'], 'CHAT').account).toBeNull()
    expect(read('account=acc-1', [], 'CHAT').account).toBeNull()
  })

  it('keeps the account while the list of accounts is not known yet', () => {
    expect(read('account=acc-1', null, 'EMAIL').account).toBe('acc-1')
  })

  it('does not read the old ?source=', () => {
    expect(read('source=gmail&view=unread', ['acc-1'], 'EMAIL')).toEqual({ account: null, chatType: null, view: 'unread', folder: null })
  })

  it('knows direct and group, and takes anything else for every chat', () => {
    expect(read('chat=direct', null, 'CHAT').chatType).toBe('direct')
    expect(read('chat=channel', null, 'CHAT').chatType).toBeNull()
  })

  it('leaves chat to Tin nhắn and folder to Hộp thư', () => {
    expect(read('chat=group', null, 'EMAIL').chatType).toBeNull()
    expect(read('folder=sent', null, 'CHAT').folder).toBeNull()
    expect(read('folder=sent&view=unread', null, 'EMAIL')).toMatchObject({ folder: 'sent', view: 'all' })
  })
})

describe('filterSearch', () => {
  it('writes only what is not the default, in the same order readFilter reads it', () => {
    expect(filterSearch({ account: null, view: 'all' })).toBe('')
    expect(filterSearch({ account: 'acc-1', chatType: 'group', view: 'unread' })).toBe('?account=acc-1&view=unread&chat=group')
    expect(filterSearch({ account: 'acc-1', view: 'all', folder: 'sent' })).toBe('?account=acc-1&folder=sent')
  })
})
