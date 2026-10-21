import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { API_ACCOUNTS, API_PROVIDERS } from '@/test/fixtures/accountsApi'
import { API_CONVERSATIONS, API_COUNTS, API_MESSAGES, API_PARTICIPANTS } from '@/test/fixtures/inboxApi'
import { server } from '@/test/msw/server'
import { fetchConversation, fetchConversations, fetchInbox, fetchMessages, fetchUnreadByKind, sendSticker, updateConversation } from './inbox.api'

const NOT_FOUND = { title: 'Not found', status: 404, code: 'CONVERSATION_NOT_FOUND' }
const problem = (body: object, status: number) => HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } })

describe('the Hộp thư requests on the F05 API (D-56)', () => {
  it('names an account by its display name when the backend has no address for it yet (BE-47)', async () => {
    server.use(
      http.get('/api/accounts', () => HttpResponse.json([{ ...API_ACCOUNTS[0], address: null, displayName: 'an.nguyen@gmail.com' }])),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
      http.get('/api/conversations/counts', () => HttpResponse.json(API_COUNTS)),
    )

    expect((await fetchInbox()).accounts[0].address).toBe('an.nguyen@gmail.com')
  })

  it('builds the frame of the screen from the accounts, the providers and the counts', async () => {
    server.use(
      http.get('/api/accounts', () => HttpResponse.json(API_ACCOUNTS)),
      http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
      http.get('/api/conversations/counts', () => HttpResponse.json({ ...API_COUNTS, byProvider: { gmail: 1, zalo: 4 } })),
    )

    const inbox = await fetchInbox()

    expect(Date.parse(inbox.generatedAt)).not.toBeNaN()
    expect(inbox.providers).toEqual([{ type: 'gmail', displayName: 'Gmail', kind: 'EMAIL' }])
    expect(inbox.accounts).toEqual([
      {
        id: 'acc-1',
        provider: 'gmail',
        externalAccountId: '115758365451560723981',
        address: 'an.nguyen@gmail.com',
        status: 'CONNECTED',
        syncProgress: null,
        statusChangedAt: null,
        sending: 'NEEDS_PERMISSION',
      },
      {
        id: 'acc-2',
        provider: 'gmail',
        externalAccountId: '104422190876543210987',
        address: 'cong.viec@gmail.com',
        status: 'AUTH_EXPIRED',
        syncProgress: null,
        statusChangedAt: null,
        sending: 'UNAVAILABLE',
      },
    ])
    expect(inbox.counts).toEqual({
      unread: 1,
      byProvider: [
        { provider: 'gmail', unread: 1 },
        { provider: 'zalo', unread: 4 },
      ],
      needsReply: 1,
      withAttachments: 1,
      scheduled: 0,
      snoozed: 0,
      unreadByKind: { EMAIL: 1, CHAT: 0 },
    })
  })

  it('says whether each account can send a new mail, from its capabilities, its status and its provider (f10-new-mail, D-193)', async () => {
    const accounts = [
      { ...API_ACCOUNTS[0], id: 'ready', capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'] },
      { ...API_ACCOUNTS[0], id: 'read-only', capabilities: ['READ_MESSAGES'] },
      { ...API_ACCOUNTS[0], id: 'expired', status: 'AUTH_EXPIRED', capabilities: ['READ_MESSAGES', 'SEND_MESSAGES'] },
      { ...API_ACCOUNTS[0], id: 'chat', provider: 'zalo', capabilities: ['READ_MESSAGES'] },
    ]
    server.use(
      http.get('/api/accounts', () => HttpResponse.json(accounts)),
      http.get('/api/providers', () => HttpResponse.json([...API_PROVIDERS, { type: 'zalo', displayName: 'Zalo', capabilities: ['READ_MESSAGES'] }])),
      http.get('/api/conversations/counts', () => HttpResponse.json(API_COUNTS)),
    )

    const sending = Object.fromEntries((await fetchInbox()).accounts.map((account) => [account.id, account.sending]))

    expect(sending).toEqual({ ready: 'READY', 'read-only': 'NEEDS_PERMISSION', expired: 'UNAVAILABLE', chat: 'NOT_SUPPORTED' })
  })

  it('asks for one page of a view and a source, and turns the items into the screen contract', async () => {
    const asked: string[] = []
    server.use(
      http.get('/api/conversations', ({ request }) => {
        asked.push(new URL(request.url).search)
        return HttpResponse.json({ items: API_CONVERSATIONS, nextCursor: 'MjAyNi0xMC0wMQ' })
      }),
    )

    const page = await fetchConversations({ view: 'unread', source: 'gmail' }, null)

    expect(asked).toEqual(['?view=unread&provider=gmail'])
    expect(page.nextCursor).toBe('MjAyNi0xMC0wMQ')
    expect(page.items[0]).toEqual({ ...API_CONVERSATIONS[0], linked: [] })
    // An item without text (only a file) has no preview; an API before f05b has one account for each item.
    expect(page.items[1]).toEqual(expect.objectContaining({ id: 'c-2', snippet: '', linked: [], accountIds: ['acc-1'] }))
  })

  it('asks for the next page with the cursor, and for every source without a provider', async () => {
    const asked: string[] = []
    server.use(
      http.get('/api/conversations', ({ request }) => {
        asked.push(new URL(request.url).search)
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )

    const page = await fetchConversations({ view: 'all', source: null }, 'a/b+c')

    expect(asked).toEqual(['?view=all&cursor=a%2Fb%2Bc'])
    expect(page).toEqual({ items: [], nextCursor: null })
  })

  describe('email and chat (f05c, D-306…D-308)', () => {
    const noAccounts = () => http.get('/api/accounts', () => HttpResponse.json([]))

    it('gives each provider its kind, and counts a provider without one as email', async () => {
      server.use(
        noAccounts(),
        http.get('/api/providers', () =>
          HttpResponse.json([
            { type: 'gmail', displayName: 'Gmail', kind: 'EMAIL' },
            { type: 'zalo', displayName: 'Zalo', kind: 'CHAT' },
            { type: 'outlook', displayName: 'Outlook' },
          ]),
        ),
        http.get('/api/conversations/counts', () => HttpResponse.json(API_COUNTS)),
      )

      expect((await fetchInbox()).providers).toEqual([
        { type: 'gmail', displayName: 'Gmail', kind: 'EMAIL' },
        { type: 'zalo', displayName: 'Zalo', kind: 'CHAT' },
        { type: 'outlook', displayName: 'Outlook', kind: 'EMAIL' },
      ])
    })

    it('asks for the counts of one kind and keeps the unread of both kinds', async () => {
      const asked: string[] = []
      server.use(
        noAccounts(),
        http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
        http.get('/api/conversations/counts', ({ request }) => {
          asked.push(new URL(request.url).search)
          return HttpResponse.json({ ...API_COUNTS, unreadByKind: { EMAIL: 1, CHAT: 4 } })
        }),
      )

      const inbox = await fetchInbox('CHAT')

      expect(asked).toEqual(['?kind=chat'])
      expect(inbox.counts.unreadByKind).toEqual({ EMAIL: 1, CHAT: 4 })
    })

    it('asks for the counts of every kind without a kind, and has no unread by kind from a backend before f05c', async () => {
      const asked: string[] = []
      const { unreadByKind: _, ...before } = API_COUNTS
      server.use(
        noAccounts(),
        http.get('/api/providers', () => HttpResponse.json(API_PROVIDERS)),
        http.get('/api/conversations/counts', ({ request }) => {
          asked.push(new URL(request.url).search)
          return HttpResponse.json(before)
        }),
      )

      const inbox = await fetchInbox()

      expect(asked).toEqual([''])
      expect(inbox.counts.unreadByKind).toBeNull()
    })

    it('asks for one page of one kind', async () => {
      const asked: string[] = []
      server.use(
        http.get('/api/conversations', ({ request }) => {
          asked.push(new URL(request.url).search)
          return HttpResponse.json({ items: [], nextCursor: null })
        }),
      )

      await fetchConversations({ view: 'unread', source: 'gmail' }, null, 'EMAIL')
      await fetchConversations({ view: 'all', source: null }, null, 'CHAT')

      expect(asked).toEqual(['?view=unread&kind=email&provider=gmail', '?view=all&kind=chat'])
    })

    it('gives the navigation the unread of each kind', async () => {
      server.use(http.get('/api/conversations/counts', () => HttpResponse.json({ ...API_COUNTS, unread: 12, unreadByKind: { EMAIL: 7, CHAT: 5 } })))

      expect(await fetchUnreadByKind()).toEqual({ EMAIL: 7, CHAT: 5 })
    })

    it('gives Hộp thư every unread and Tin nhắn no number on a backend before f05c', async () => {
      const { unreadByKind: _, ...before } = API_COUNTS
      server.use(http.get('/api/conversations/counts', () => HttpResponse.json({ ...before, unread: 12 })))

      expect(await fetchUnreadByKind()).toEqual({ EMAIL: 12, CHAT: null })
    })
  })

  it('opens one conversation: its item, and its people as members; messages and sending wait for F06 and F10', async () => {
    server.use(http.get('/api/conversations/:id', ({ params }) => HttpResponse.json({ ...API_CONVERSATIONS[0], id: params.id, participants: API_PARTICIPANTS })))

    const { item, detail } = await fetchConversation('c-1')

    expect(item).toEqual({ ...API_CONVERSATIONS[0], linked: [] })
    expect(item).not.toHaveProperty('participants')
    expect(detail).toEqual({
      id: 'c-1',
      messages: null,
      firstUnreadId: null,
      linked: null,
      members: [
        { name: 'Trần Minh Anh', owner: false, joinedRecently: false },
        { name: 'Bạn', owner: false, joinedRecently: false },
      ],
      files: null,
      canSend: null,
      replyTo: null,
      previousCursor: null,
    })
  })

  it('says whether Sino can reply, and to whom, once the API tells (F10, D-133)', async () => {
    const to = [{ name: 'Trần Minh Anh', address: 'minhanh@acme.vn' }]
    const answer = (state: string) =>
      server.use(http.get('/api/conversations/:id', () => HttpResponse.json({ ...API_CONVERSATIONS[0], participants: API_PARTICIPANTS, reply: { state, to } })))

    answer('READY')
    expect((await fetchConversation('c-1')).detail).toMatchObject({ canSend: true, replyTo: to })
    answer('NEEDS_PERMISSION')
    expect((await fetchConversation('c-1')).detail).toMatchObject({ canSend: false, replyTo: to })
    answer('ACCOUNT_UNAVAILABLE')
    expect((await fetchConversation('c-1')).detail).toMatchObject({ canSend: false })
    answer('NOT_SUPPORTED')
    expect((await fetchConversation('c-1')).detail).toMatchObject({ canSend: null })
    answer('SOMETHING_NEW')
    expect((await fetchConversation('c-1')).detail).toMatchObject({ canSend: null })
  })

  it('names a person without a name by their address', async () => {
    const nameless = [{ externalId: 'ai.do@example.com', name: null, avatarUrl: null, self: false }]
    server.use(http.get('/api/conversations/:id', () => HttpResponse.json({ ...API_CONVERSATIONS[0], participants: nameless })))

    const { detail } = await fetchConversation('c-1')

    expect(detail.members).toEqual([{ name: 'ai.do@example.com', owner: false, joinedRecently: false }])
  })

  it('reports a conversation the API does not know as CONVERSATION_NOT_FOUND', async () => {
    server.use(http.get('/api/conversations/:id', () => problem(NOT_FOUND, 404)))

    await expect(fetchConversation('c-9')).rejects.toMatchObject({ status: 404, code: 'CONVERSATION_NOT_FOUND' })
  })

  it('sends a change of read or archived state and returns the item as the server stored it', async () => {
    const sent: unknown[] = []
    server.use(
      http.patch('/api/conversations/:id', async ({ params, request }) => {
        sent.push([params.id, await request.json()])
        return HttpResponse.json({ ...API_CONVERSATIONS[0], unreadCount: 0 })
      }),
    )

    const item = await updateConversation('c-1', { read: true })

    expect(sent).toEqual([['c-1', { read: true }]])
    expect(item).toEqual({ ...API_CONVERSATIONS[0], unreadCount: 0, linked: [] })
  })
})

describe('the messages of a conversation on the F06 and F10 APIs', () => {
  it('says what an own message still has to say, and keeps the ID Sino sent it with', async () => {
    const own = API_MESSAGES[1]
    const statuses = ['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN']
    server.use(
      http.get('/api/conversations/:id/messages', () =>
        HttpResponse.json({
          items: [...statuses.map((status, index) => ({ ...own, id: `o-${index}`, status, clientMessageId: `cm-${index}` })), { ...API_MESSAGES[0], clientMessageId: null }],
          nextCursor: null,
        }),
      ),
    )

    const { items } = await fetchMessages('c-1', null)

    expect(items.map((message) => (message.kind === 'MESSAGE' ? message.status : null))).toEqual(['SENDING', 'SENT', 'SENT', 'SENT', 'FAILED', 'UNKNOWN', null])
    expect(items[0]).toMatchObject({ clientMessageId: 'cm-0' })
    expect(items[6]).not.toHaveProperty('clientMessageId')
  })
})

describe('the sticker of a message (ZL-14)', () => {
  it('gives a message the address of its sticker, and one without a sticker none', async () => {
    const address = 'https://zalo-api.zadn.vn/api/emoticon/sticker/webpc?eid=11236'
    server.use(
      http.get('/api/conversations/:id/messages', () =>
        HttpResponse.json({
          items: [
            { ...API_MESSAGES[0], id: 'st-1', text: '[Sticker]', sticker: address },
            { ...API_MESSAGES[0], id: 'st-2', sticker: null },
            { ...API_MESSAGES[0], id: 'st-3' },
          ],
          nextCursor: null,
        }),
      ),
    )

    const { items } = await fetchMessages('c-1', null)

    expect(items[0]).toMatchObject({ id: 'st-1', sticker: address })
    expect(items[1]).not.toHaveProperty('sticker')
    expect(items[2]).not.toHaveProperty('sticker')
  })
})

describe('the sprite sheet of a moving sticker (ZL-15)', () => {
  it('gives a message the sprite sheet of its sticker, and one without a sprite none', async () => {
    const sprite = { url: 'https://zalo-api.zadn.vn/api/emoticon/sprite?eid=11236&size=130', frames: 7, durationMs: 700 }
    server.use(
      http.get('/api/conversations/:id/messages', () =>
        HttpResponse.json({
          items: [
            { ...API_MESSAGES[0], id: 'sp-1', text: '[Sticker]', sticker: 'https://zalo-api.zadn.vn/a.png', stickerSprite: sprite },
            { ...API_MESSAGES[0], id: 'sp-2', stickerSprite: null },
            { ...API_MESSAGES[0], id: 'sp-3' },
          ],
          nextCursor: null,
        }),
      ),
    )

    const { items } = await fetchMessages('c-1', null)

    expect(items[0]).toMatchObject({ id: 'sp-1', sticker: 'https://zalo-api.zadn.vn/a.png', stickerSprite: sprite })
    expect(items[1]).not.toHaveProperty('stickerSprite')
    expect(items[2]).not.toHaveProperty('stickerSprite')
  })
})

describe('the picture of a photo message (ZL-16)', () => {
  it('gives a message the picture of its photo, and one without a photo none', async () => {
    const image = { url: 'https://f21-zpc.zdn.vn/jpg/1234/full.jpg', thumbUrl: 'https://b-f21-zpc.zdn.vn/jpg/1234/thumb.jpg', caption: 'Chuyến đi' }
    server.use(
      http.get('/api/conversations/:id/messages', () =>
        HttpResponse.json({
          items: [
            { ...API_MESSAGES[0], id: 'ph-1', text: '[Ảnh]', image },
            { ...API_MESSAGES[0], id: 'ph-2', image: null },
            { ...API_MESSAGES[0], id: 'ph-3' },
          ],
          nextCursor: null,
        }),
      ),
    )

    const { items } = await fetchMessages('c-1', null)

    expect(items[0]).toMatchObject({ id: 'ph-1', image })
    expect(items[1]).not.toHaveProperty('image')
    expect(items[2]).not.toHaveProperty('image')
  })
})

describe('a message without a known sender (BE-54)', () => {
  it('names the sender as unknown, or as the reader for an own message, instead of failing', async () => {
    server.use(
      http.get('/api/conversations/:id/messages', () =>
        HttpResponse.json({
          items: [
            { ...API_MESSAGES[0], id: 'n-1', sender: null },
            { ...API_MESSAGES[1], id: 'n-2', sender: null },
          ],
          nextCursor: null,
        }),
      ),
    )

    const { items } = await fetchMessages('c-1', null)

    expect(items).toMatchObject([
      { id: 'n-1', direction: 'IN', sender: 'Không rõ người gửi' },
      { id: 'n-2', direction: 'OUT', sender: 'Bạn' },
    ])
  })
})

describe('a sticker of the library (zalo-send-images)', () => {
  it('names the sticker of the library that a message Sino sent carries, and leaves it out for any other', async () => {
    server.use(
      http.get('/api/conversations/:id/messages', () =>
        HttpResponse.json({
          items: [
            { ...API_MESSAGES[0], id: 'st-1', text: '[Sticker]', direction: 'OUTBOUND', libraryStickerId: 'lib-1' },
            { ...API_MESSAGES[0], id: 'st-2', libraryStickerId: null },
            { ...API_MESSAGES[0], id: 'st-3' },
          ],
          nextCursor: null,
        }),
      ),
    )

    const { items } = await fetchMessages('c-1', null)

    expect(items[0]).toMatchObject({ id: 'st-1', libraryStickerId: 'lib-1' })
    expect(items[1]).not.toHaveProperty('libraryStickerId')
    expect(items[2]).not.toHaveProperty('libraryStickerId')
  })

  it('says whether a sticker can be sent in a conversation, from the reply of the API', async () => {
    const to = [{ name: 'An', address: '8001' }]
    const answer = (reply: object) =>
      server.use(http.get('/api/conversations/:id', () => HttpResponse.json({ ...API_CONVERSATIONS[0], participants: API_PARTICIPANTS, reply })))

    answer({ state: 'READY', to, canSendImages: true })
    expect((await fetchConversation('c-1')).detail.canSendImages).toBe(true)
    answer({ state: 'READY', to, canSendImages: false })
    expect((await fetchConversation('c-1')).detail.canSendImages).toBe(false)
    // A backend before the stickers says nothing: no button.
    answer({ state: 'READY', to })
    expect((await fetchConversation('c-1')).detail.canSendImages).toBe(false)
  })

  it('sends a sticker by its ID alone, with the clientMessageId, and returns the message the server stored', async () => {
    let body: unknown
    server.use(
      http.post('/api/conversations/:id/messages', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...API_MESSAGES[0], id: 'm-9', direction: 'OUTBOUND', status: 'SENT', text: '[Sticker]', clientMessageId: 'cid-1', libraryStickerId: 'lib-1' }, { status: 201 })
      }),
    )

    const sent = await sendSticker('c-1', 'lib-1', 'cid-1')

    expect(body).toEqual({ stickerId: 'lib-1', clientMessageId: 'cid-1' })
    expect(sent).toMatchObject({ id: 'm-9', direction: 'OUT', status: 'SENT', clientMessageId: 'cid-1', libraryStickerId: 'lib-1' })
  })

  it('reads the emoji of each message and whether it takes one (zalo-reactions, D-387); a backend before it says nothing', async () => {
    const heart = { code: '/-heart', emoji: '❤️', count: 2, mine: true, names: ['Lan', 'Bạn'] }
    server.use(
      http.get('/api/conversations/:id/messages', () =>
        HttpResponse.json({
          items: [
            { ...API_MESSAGES[0], id: 'r-1', reactions: [heart], canReact: true },
            { ...API_MESSAGES[0], id: 'r-2', reactions: [], canReact: false },
            { ...API_MESSAGES[0], id: 'r-3' },
          ],
          nextCursor: null,
        }),
      ),
    )

    const { items } = await fetchMessages('c-1', null)

    expect(items[0]).toMatchObject({ id: 'r-1', reactions: [heart], canReact: true })
    expect(items[1]).not.toHaveProperty('reactions')
    expect(items[1]).not.toHaveProperty('canReact')
    expect(items[2]).not.toHaveProperty('reactions')
  })

  it('reads the emoji a conversation offers; none told, or none, is no emoji bar', async () => {
    const set = [{ code: '/-heart', emoji: '❤️', label: 'Tim', quick: true }]
    const answer = (extra: object) =>
      server.use(http.get('/api/conversations/:id', () => HttpResponse.json({ ...API_CONVERSATIONS[0], participants: API_PARTICIPANTS, ...extra })))

    answer({ reactionSet: set })
    expect((await fetchConversation('c-1')).detail.reactionSet).toEqual(set)
    answer({ reactionSet: [] })
    expect((await fetchConversation('c-1')).detail).not.toHaveProperty('reactionSet')
    answer({})
    expect((await fetchConversation('c-1')).detail).not.toHaveProperty('reactionSet')
  })
})
