import { http, HttpResponse } from 'msw'

/**
 * The inbox reads of the app frame for the tests: the sidebar asks for the accounts, the providers and the counts of
 * both kinds on every signed-in screen (messages-by-account), so an empty answer is always on. A test that cares
 * answers them itself with `server.use(...)`, which comes first.
 */
export const inboxFrameHandlers = [
  http.get('/api/accounts', () => HttpResponse.json([])),
  http.get('/api/providers', () => HttpResponse.json([])),
  http.get('/api/conversations/counts', () =>
    HttpResponse.json({
      unread: 0,
      byProvider: {},
      byAccount: {},
      needsReply: 0,
      withAttachments: 0,
      scheduled: 0,
      snoozed: 0,
      unreadByKind: { EMAIL: 0, CHAT: 0 },
    }),
  ),
]
