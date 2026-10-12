// What the form of a new mail shares with the page around it (f10-new-mail).

/** A new mail that passed the checks of the form (D-197). */
export interface NewMailDraft {
  accountId: string
  to: string[]
  /** Empty: the mail goes without a subject. */
  subject: string
  text: string
}

/** The state of a navigation that must not ask "Bỏ thư đang soạn?": the mail was sent, or is being dropped on purpose. */
export const LEAVE_FREELY = { newMailLeft: true }

/** Where this browser keeps the account a new mail went from last: a convenience only (D-193). */
const LAST_SENDER_KEY = 'sino.newMail.from'

export function lastSender(): string | null {
  try {
    return localStorage.getItem(LAST_SENDER_KEY)
  } catch {
    return null
  }
}

export function rememberSender(accountId: string): void {
  try {
    localStorage.setItem(LAST_SENDER_KEY, accountId)
  } catch {
    // Storage may be off (private window); the first account that can send is the default then.
  }
}
