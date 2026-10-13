/**
 * The app name the Google consent screen shows. Google wants the Limited Use statement to name that app, so this must
 * stay equal to the "App name" of the OAuth consent screen (check it at SI-06, before the site goes live).
 */
export const GOOGLE_APP_NAME = 'Sino Messages'

/** Google's required disclosure, word for word in English on both versions (D-243). */
export const LIMITED_USE = `${GOOGLE_APP_NAME}' use and transfer to any other app of information received from Google APIs will adhere to Google API Services User Data Policy, including the Limited Use requirements.`

export const POLICY_URL = 'https://developers.google.com/terms/api-services-user-data-policy'

/** What Sino Messages asks Google for (`GmailProvider.SCOPES`) and why, in both languages. */
export const SCOPES = [
  {
    scope: 'openid',
    vi: 'để biết chắc tài khoản vừa kết nối là tài khoản Google nào, không kết nối một tài khoản hai lần.',
    en: 'to know which Google account was just connected, so the same account is not connected twice.',
  },
  {
    scope: 'email',
    vi: 'để ghi địa chỉ Gmail cạnh mỗi thư, cho bạn biết thư đến tài khoản nào.',
    en: 'to show the Gmail address next to each message, so you know which account it came to.',
  },
  {
    scope: 'gmail.readonly',
    vi: 'để đọc thư và tệp đính kèm, hiện trong hộp thư chung của bạn. Quyền này không cho Sino xóa hay sửa thư trong Gmail.',
    en: 'to read your mail and attachments and show them in your unified inbox. It does not let Sino delete or change mail in Gmail.',
  },
  {
    scope: 'gmail.send',
    vi: 'để gửi thư trả lời khi bạn bấm Gửi trong Sino. Sino không tự gửi thư nào.',
    en: 'to send your reply when you press Send in Sino. Sino never sends mail on its own.',
  },
]
