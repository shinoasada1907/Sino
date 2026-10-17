// Copied from apps/sino-site/src/pages/privacy/privacy.en.tsx (web-public-pages, D-312); change both together.
import { OwnerValue } from './OwnerValue'
import { A, Note, P, Summary, Ul, type PolicyDoc } from './PolicyPage'
import { GOOGLE_APP_NAME, LIMITED_USE, POLICY_URL, SCOPES } from './privacy.shared'

/** The privacy policy in English (SI-03, D-243): the same sections as privacy.vi.tsx, which is the original. */
export const PRIVACY_EN: PolicyDoc = {
  label: 'LEGAL',
  title: 'Privacy policy',
  effective: 'EFFECTIVE FROM',
  lead: 'What Sino stores, what it uses it for, who can see it, how long it is kept, and how you stay in control of your data.',
  toc: 'Contents',
  sections: [
    {
      id: 'tom-tat',
      title: 'Summary',
      body: (
        <Summary
          items={[
            {
              title: 'Only to show you your mail',
              body: `Your mail is used only to show it in ${GOOGLE_APP_NAME} and to send the replies you write.`,
            },
            {
              title: 'No ads, no selling',
              body: 'Sino does not sell data, does not use it for advertising and does not use it to train AI models.',
            },
            {
              title: 'Take your permission back any time',
              body: 'Disconnect in Sino or on your Google Account permissions page; to have everything deleted, email Sino.',
            },
          ]}
        />
      ),
    },
    {
      id: 'pham-vi',
      title: 'Who this policy covers',
      body: (
        <>
          <P>
            This policy covers this site and the apps of Sino. Today Sino has one app: {GOOGLE_APP_NAME}, a unified inbox for
            your Gmail accounts, with to-dos. The sections below are about the data of {GOOGLE_APP_NAME}. When a new app
            comes, this policy will get a part for it.
          </P>
          {/* Not the words of sino-site: there the pages are a static site with no cookie (D-316). */}
          <P>
            The introduction and policy pages are part of the app. They do not count visits and load no fonts, images or code
            from other services. When the introduction page opens, Sino asks the server whether you are signed in; that can
            set the cookie against forged requests, one of the app's cookies listed under{' '}
            <A href="#thu-thap">What Sino stores</A>.
          </P>
        </>
      ),
    },
    {
      id: 'thu-thap',
      title: 'What Sino stores',
      body: (
        <Ul>
          <li>
            <b>Your Sino account:</b> your email and display name. Your password is not stored in a readable form; Sino keeps
            only its BCrypt hash.
          </li>
          <li>
            <b>The Gmail accounts you connect:</b> the Gmail address, the Google account ID, the permissions you granted, and
            the access and refresh tokens Google issues. Tokens are encrypted before they are stored.
          </li>
          <li>
            <b>Mail:</b> subject, content (as text and HTML), sender, recipients, time, read state and the thread it belongs
            to. For attachments Sino stores only the name, type and size; the file itself is fetched from Gmail each time you
            open it and is not kept.
          </li>
          <li>
            <b>Sync state:</b> the last point Sino synced with Gmail, when, and any error, so it knows which mail to fetch next.
          </li>
          <li>
            <b>What you create:</b> to-dos (title, notes, due date and how they repeat).
          </li>
          <li>
            <b>The app's cookies:</b> a sign-in session cookie, a cookie against forged requests, and a 30-day “keep me signed
            in” cookie if you choose it. Sino uses no advertising or tracking cookies.
          </li>
        </Ul>
      ),
    },
    {
      id: 'su-dung',
      title: 'What Sino uses it for',
      body: (
        <>
          <Ul>
            <li>To show your unified inbox, your threads and your attachments.</li>
            <li>To update the inbox when new mail arrives.</li>
            <li>To send a reply from the Gmail account that received the mail, only when you press Send. Sino never sends mail on its own.</li>
            <li>To keep and show your to-dos.</li>
            <li>To keep your account safe, for example by locking sign-in for 15 minutes after 5 wrong passwords in a row.</li>
          </Ul>
          <P>
            Sino does not use your data for advertising, does not sell or rent it, and does not use it to train AI or machine
            learning models.
          </P>
        </>
      ),
    },
    {
      id: 'nguoi-xem',
      title: 'Who can see your data',
      body: (
        <>
          <P>No one reads your mail, unless:</P>
          <Ul>
            <li>you agree to it for a specific message, for example when you send it along with a bug report;</li>
            <li>it is needed for security, such as investigating abuse or a vulnerability;</li>
            <li>the law requires it.</li>
          </Ul>
          <P>
            The people who run Sino see only numbers and states to keep the service running: the email of the Sino account,
            the connected Gmail addresses, connection and sync states, error codes and how many messages are stored. The
            operator tools never show the subject, content, sender, recipients or attachments of any message.
          </P>
        </>
      ),
    },
    {
      id: 'ben-thu-ba',
      title: 'Third parties',
      body: (
        <>
          <Ul>
            <li>
              <b>Google:</b> Sino calls the Gmail API within the permissions you granted, to read and send mail. To learn when
              new mail arrives, Gmail sends a notice through Google Cloud Pub/Sub; the notice holds only the Gmail address and
              a change marker, never the content of a message.
            </li>
            <li>
              <b>Server provider:</b> <OwnerValue field="hosting" />. Sino's data is stored there.
            </li>
          </Ul>
          <P>Apart from these two, Sino does not pass your data to anyone, unless the law requires it.</P>
        </>
      ),
    },
    {
      id: 'google',
      title: 'Data from Google',
      body: (
        <>
          <P>When you connect Gmail, {GOOGLE_APP_NAME} asks for four permissions:</P>
          <Ul>
            {SCOPES.map((s) => (
              <li key={s.scope}>
                <code className="rounded-xs border border-border-strong bg-raised px-1.5 py-0.5 font-mono text-[13px]">
                  {s.scope}
                </code>{' '}
                {s.en}
              </li>
            ))}
          </Ul>
          <blockquote className="border-l-2 border-border-strong pl-4">
            <P>{LIMITED_USE}</P>
          </blockquote>
          <P>
            The full rules are in the <A href={POLICY_URL}>Google API Services User Data Policy</A>. In practice:
          </P>
          <Ul>
            <li>Gmail data is used only to show your mail and send your replies in {GOOGLE_APP_NAME}, features you see on screen.</li>
            <li>We do not use Gmail data for advertising, including personalised ads, and we do not sell it.</li>
            <li>We do not use Gmail data to train AI or machine learning models.</li>
            <li>We do not use Gmail data to judge creditworthiness or for lending.</li>
            <li>
              No one reads your Gmail data, except in the cases under <A href="#nguoi-xem">Who can see your data</A>.
            </li>
          </Ul>
        </>
      ),
    },
    {
      id: 'luu-giu',
      title: 'Keeping and deleting',
      body: (
        <Ul>
          <li>Data is kept while your Sino account and your Gmail accounts are connected.</li>
          <li>
            When you disconnect a Gmail account, Sino revokes its permission at Google at once and deletes the tokens from
            Sino. The stored mail is kept but no longer shown in the inbox, so that you do not start from scratch if you
            connect again.
          </li>
          <li>To-dos are kept until you delete them.</li>
          <li>
            To have all your data deleted, stored mail included, email <OwnerValue field="contactEmail" />. Sino deletes it
            within 30 days of your request and tells you when it is done.
          </li>
        </Ul>
      ),
    },
    {
      id: 'bao-mat',
      title: 'Security',
      body: (
        <>
          <Ul>
            <li>Google tokens are encrypted with AES-256-GCM before they are stored; the key is kept apart from the database.</li>
            <li>Your Sino password is kept only as a BCrypt hash.</li>
            <li>You connect Gmail on Google's own sign-in page; your Gmail password never goes through Sino.</li>
            <li>HTML mail is shown in an isolated frame that runs no code; pictures load only when you press Show pictures.</li>
          </Ul>
          <P>
            {/* No link in sino-web: the Security page comes with SI-05 (D-311). */}
            More on the Security page.
          </P>
        </>
      ),
    },
    {
      id: 'quyen',
      title: 'Your rights',
      body: (
        <>
          <Ul>
            <li>See your mail, your connected accounts and your to-dos in Sino itself.</li>
            <li>
              Disconnect any Gmail account in Sino, or revoke Sino's permission on your{' '}
              <A href="https://myaccount.google.com/permissions">Google Account permissions page</A>.
            </li>
            <li>
              Ask what data Sino holds about you, or ask to correct or delete it, by email to{' '}
              <OwnerValue field="contactEmail" />. Sino answers within 30 days.
            </li>
          </Ul>
          <Note>Sino handles personal data under the personal data protection law of Vietnam.</Note>
        </>
      ),
    },
    {
      id: 'thay-doi',
      title: 'Changes to this policy',
      body: (
        <P>
          When this policy changes, Sino updates this page and the date at its top. If a change would make Sino use your data
          in a new way, Sino asks you again before it applies.
        </P>
      ),
    },
    {
      id: 'lien-he',
      title: 'Contact',
      body: (
        <P>
          Responsible for Sino's data: <OwnerValue field="owner" /> · <OwnerValue field="contactEmail" />
        </P>
      ),
    },
  ],
}
