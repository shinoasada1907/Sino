# sino-api

Backend of Sino Messages: a Spring Boot 4 modular monolith (Java 25, Spring Modulith, PostgreSQL 18, Flyway).
Plans and specs live in `openspec/` at the repository root (`openspec/roadmap.md` gives the phase plan).

Run every command below from `apps/sino-api`. On PowerShell use `.\mvnw.cmd` instead of `./mvnw` and quote
`-D` arguments, for example `.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"`.

## Prerequisites

- JDK 25 (Temurin 25.0.3 is the reference). Check with `./mvnw -v`.
- Docker Desktop running. It is needed for the local database and for every test that uses Testcontainers.

## First-time setup

```bash
cp .env.example .env    # then put real values in .env (it is git-ignored)
docker compose up -d    # PostgreSQL 18 on 127.0.0.1:5432
docker compose ps       # wait until the status says (healthy)
```

`.env` is read by Docker Compose and by the `local` Spring profile. Keep the format `KEY=value`: no quotes, no
`export`, no spaces around `=`.

| Variable | Used by | Purpose |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Compose, `local` profile | Local database. Postgres reads them only when the volume is created; after changing them run `docker compose down -v`. |
| `SINO_CREDENTIAL_ACTIVE_KEY_ID`, `SINO_CREDENTIAL_KEY_K1` | application | AES-256-GCM key that encrypts provider tokens (D-11): base64 of 32 random bytes, `openssl rand -base64 32`. Back it up outside the repo; losing it means reconnecting every account. To rotate, add a `k2` slot in `application.yaml`, set it and make it active: old rows stay readable with `k1`, and each credential moves to `k2` the next time it is saved. Remove `k1` only when `select count(*) from account_credential where encryption_key_id = 'k1'` returns 0. The app refuses to start without a valid active key. |
| `SINO_OWNER_EMAIL`, `SINO_OWNER_DISPLAY_NAME` | application | The single Sino user (`app_user`) of the MVP, created or updated at startup with the email as key (D-10). Changing the email creates a new owner. The app refuses to start without them. |
| `SINO_OWNER_PASSWORD` | application | The password the owner signs in with in the browser (D-22, D-33), at least 12 characters. Only a BCrypt hash is kept after startup. To change it, change the variable and restart. The app refuses to start without it. |
| `SINO_REMEMBER_ME_KEY` | application | Signs the "keep me signed in" cookie (D-34), at least 32 characters: `openssl rand -base64 32`. Changing it signs every browser out. The app refuses to start without it. |
| `SINO_GOOGLE_CLIENT_ID`, `SINO_GOOGLE_CLIENT_SECRET` | application | Sino's Google OAuth client for connecting Gmail accounts (F04a, D-38), created in the Google Cloud console as a "Web application" client. Leave both empty and Gmail is off (the startup log says so, `/api/providers` has no `gmail`); set both to turn it on. Setting only one stops the app, and the message names the missing variable, never a value. |
| `SINO_PUBLIC_BASE_URL` | application | The address the browser uses to reach Sino, `http://localhost:5173` in development (D-36). Required when Gmail is on: the connect flow sends Google `<this>/api/accounts/connect/gmail/callback` as redirect URI, which must also be listed in the Google OAuth client. The app refuses to start with Gmail on and no usable `http(s)` address. |
| `SINO_SESSION_COOKIE_SECURE` | application | `true` behind HTTPS, so the session cookie is never sent over plain HTTP. Default `false` (local HTTP). |
| `SINO_DB_URL`, `SINO_DB_USERNAME`, `SINO_DB_PASSWORD` | application, default profile | Database outside the `local` profile. They have no defaults on purpose. |

## Run

| Goal | Command |
|---|---|
| Run against the Compose database | `./mvnw spring-boot:run -Dspring-boot.run.profiles=local` |
| Run against a throwaway Testcontainers database | `./mvnw spring-boot:test-run` |
| Open a SQL shell | `docker compose exec postgres psql -U sino -d sino` |
| Stop the database (keep data) / wipe it | `docker compose down` / `docker compose down -v` |

In IntelliJ, run `SinoApiApplication` with the `local` profile and set the Run Configuration **working directory**
to `apps/sino-api`; otherwise `.env` is not found.

Flyway applies `src/main/resources/db/migration` on startup and Hibernate only validates the schema. Never edit a
migration that was already applied: add a new `V{n}__{module}_{description}.sql` instead.

## Gmail: Google project and a first real connect

Sino connects Gmail through its own Google OAuth client (F04a, D-38, D-40). Without one, Gmail is off and the rest
of the app works. Setting one up takes about ten minutes in the [Google Cloud console](https://console.cloud.google.com/),
signed in with the Google account you want to connect (menu names as of October 2026):

1. **Project.** In the project picker of the top bar, *New project*, for example `sino-dev`.
2. **Gmail API.** *APIs & Services > Library*, search *Gmail API*, *Enable*.
3. **Consent screen.** *Google Auth Platform > Branding > Get started*: an app name such as `Sino (dev)` and your
   email as support email; *Audience*: **External**; a contact email; accept the policy; *Create*. The app starts in
   **Testing**.
4. **Test users.** *Google Auth Platform > Audience > Test users > Add users*: every Gmail address you will connect.
   In Testing, only these accounts can give consent.
5. **Scopes** (recommended). *Google Auth Platform > Data Access > Add or remove scopes*: `openid`,
   `.../auth/userinfo.email`, `https://www.googleapis.com/auth/gmail.readonly` (a restricted scope) and
   `https://www.googleapis.com/auth/gmail.send` (to reply from Sino, F10; whoever unticks it still connects to read).
   Sino asks for them in every consent request anyway; listing them here shows them on the consent screen. An account
   connected before Sino asked for sending is reconnected once to grant it.
6. **OAuth client.** *Google Auth Platform > Clients > Create client*, type **Web application**, any name, and two
   *Authorized redirect URIs*, exactly as written (scheme, port, path, no trailing slash):
   - `http://localhost:5173/api/accounts/connect/gmail/callback` (through the web dev server, D-36)
   - `http://localhost:8080/api/accounts/connect/gmail/callback` (the backend alone, for the test below)

   *Create*, then **copy the client secret right away**: Google shows it only once. Lost it? Open the client and add
   a new secret.
7. **`.env`.** Set `SINO_GOOGLE_CLIENT_ID`, `SINO_GOOGLE_CLIENT_SECRET` and `SINO_PUBLIC_BASE_URL=http://localhost:5173`,
   then restart. The startup log no longer says "Gmail is off", and `GET /api/providers` lists `gmail`.

Good to know:

- In **Testing**, Google lets a refresh token live **7 days**; after that the account has to be reconnected.
  Publishing the app (*Audience > Publish app*) without verification is allowed for personal use (fewer than 100
  users) behind an "unverified app" warning; Google does not say whether that holds for the restricted Gmail scope
  (open risk in the F04a design), so stay in Testing until it is tried.
- "Google hasn't verified this app" is expected for your own app: *Continue*.
- You can always take Sino's access away by hand at <https://myaccount.google.com/permissions>.

### Try it with real Google

Through the web app (tried on 2026-10-08): start the backend with the `.env` as is (`SINO_PUBLIC_BASE_URL=http://localhost:5173`) and the web dev server (`pnpm dev` in `apps/sino-web`), sign in at <http://localhost:5173>, open *Tài khoản*, connect Gmail, and come back to `/accounts?connected=<accountId>`.

Without the web app:

The browser that finishes the connect must hold the session that started it (the state and the PKCE verifier live
there), so everything happens in one browser tab on the backend's own address:

1. Start the backend alone, with Google sending the browser back to it (the environment wins over `.env`):

   ```bash
   SINO_PUBLIC_BASE_URL=http://localhost:8080 ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
   ```

   PowerShell: `$env:SINO_PUBLIC_BASE_URL="http://localhost:8080"; .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"`.
2. Open <http://localhost:8080/api/auth/me> (a `401` is fine: it hands out the CSRF cookie), open the developer
   console (F12) and run, with the owner email and password from `.env`:

   ```js
   const xsrf = () => document.cookie.match(/XSRF-TOKEN=([^;]+)/)[1];
   const call = (method, path, body) => fetch(path, { method, body: body && JSON.stringify(body),
       headers: { 'X-XSRF-TOKEN': xsrf(), 'Content-Type': 'application/json' } });
   await call('POST', '/api/auth/login', { email: 'OWNER_EMAIL', password: 'OWNER_PASSWORD', rememberMe: false });
   await fetch('/api/auth/me');
   location.href = (await (await call('POST', '/api/accounts/connect/gmail')).json()).authorizationUrl;
   ```

3. At Google, pick the Gmail account and allow reading mail. The browser comes back to
   `http://localhost:8080/accounts?connected=<accountId>`. That page itself is an error (there is no web app on
   8080); the address is what counts. In the console (redefine `xsrf` and `call` first, the page changed):
   `await (await fetch('/api/accounts')).json()` shows the account, `CONNECTED`.
4. Reconnect: `location.href = (await (await call('POST', '/api/accounts/connect/gmail', { accountId: '<accountId>' })).json()).authorizationUrl;`
   comes back with the same id. Picking another Google account there ends on `connectError=CONNECT_WRONG_ACCOUNT`.
5. Remove: `(await call('DELETE', '/api/accounts/<accountId>')).status` is `204`, and Sino disappears from
   <https://myaccount.google.com/permissions> (it can take a minute).

### Read a real mailbox (F04b)

`RealGmailTests` reads the Gmail account connected on this machine. It is tagged `real-gmail`, so `./mvnw test`,
`./mvnw verify` and CI never run it; run it by hand:

1. Have the Compose database running (`docker compose up -d`), the Google client in `.env`, and a Gmail account
   connected through the web app as above (in Testing mode a connect lasts 7 days; reconnect when it expired).
2. From `apps/sino-api`:

   ```bash
   ./mvnw test -Preal-gmail
   ```

   PowerShell: `.\mvnw.cmd test -Preal-gmail`. The `real-gmail` Maven profile runs only the tagged tests, with the
   `local` Spring profile (`.env`, the Compose database) and no web port, so a backend running on 8080 is fine.
3. Read the lines starting with `[real-gmail]`: counts only, never mail content, subjects or addresses.

What it checks on the first page of the last 7 days, through `ProviderAccess` (so the token is refreshed when
needed): no error, every message is from the last 7 days, most messages have text, no subject or name is still
RFC 2047 encoded (`=?...?=`). It also reports what the F04b design left to real Gmail: whether `attachmentId`
changes between two reads of a message, how many messages embed images (mailing lists or not), forwarded messages
attached as files, folded header values. It also prints the estimates of the "Đồng bộ" step for 30 days, 90 days and
the whole mailbox next to the messages an import really lists, and fails when the count for 30 or 90 days differs
from the list (BE-61: Sino counts the listed IDs, up to 5 000). Without a connected Gmail account the tests are
skipped, not failed.

### Import a real mailbox again (F05)

`RealGmailImportTests`, also tagged `real-gmail`, runs with the same command. It imports the connected Gmail account
again with the range the account already has, so the user's choice does not change and nothing is stored twice, but
every message of the range is read again. It is a new import all the same: the status counts start from 0, the last
sync is cleared until the next one, and Gmail is asked to watch the mailbox again. It prints how many messages it
read, in how many seconds, and the speed. Then it checks that the import ends `DONE` and that the inbox API shows what
the database holds: stored messages, the conversations listed page after page, the views `unread`, `reply` and
`attachments` against the counts, and the summary of each conversation against its own messages.

**Stop the backend first** (IntelliJ or `spring-boot:run`): while something answers on port 8080 the test skips
itself. One backend per database is assumed (F05 design): a backend that is up would read the account as well, for a
Gmail notice or a due sync, while the test imports it. The test also skips an account that was never imported (import
it from the web first). If the test stops while its import runs, start the backend: it goes on with the import.

Only this test: `./mvnw test -Preal-gmail -Dtest=RealGmailImportTests`. Measured on 2026-10-10 with an account of 53
messages in 90 days, twice: 53 read in 33 s and in 28 s, about 100 a minute; the database and the API agreed on every
count.

### Read conversations of a real mailbox (F06)

`RealGmailMessagesTests`, also tagged `real-gmail`, runs with the same command and the same rule: **stop the backend
first**, or it skips itself. Each of its two tests first syncs the account, as "Đồng bộ ngay" does, so mail sent a
moment ago is there.

- Lists every conversation through `GET /api/conversations/{id}/messages`, 20 a page, and checks that each message
  comes once and that the pages hold what the database holds: for a thread found in several accounts, the messages
  of every copy, each `Message-ID` once (F05b).
- Opens the 10 oldest messages stored before Sino kept HTML (`body_format = 'UNCHECKED'`) through
  `.../messages/{messageId}/body`, twice: the first open reads the message again from Gmail and keeps what it gave
  (HTML or text, addressees, files), the second comes from the database. The rest stays for the web to open, so a run
  changes at most 10 messages.
- Opens up to 30 messages stored with HTML and checks that the cleaned HTML holds no script, event handler or
  `javascript:` link.
- Downloads up to 5 files and 5 embedded pictures through `.../attachments/{attachmentId}`: status, headers, and the
  size Gmail gave at import. A file over 25 MB must be refused. Without any file or embedded picture in the mailbox
  this test is skipped: send the account a mail with a file and a picture pasted in the text.

Only this test: `./mvnw test -Preal-gmail -Dtest=RealGmailMessagesTests`. Measured on 2026-10-12 with the account of
53 messages: the slowest page took 142 ms; the 10 older messages all became HTML, first open 637 ms (median, slowest
1.4 s), second open 35 ms; 20 HTML messages opened, none with anything that runs, all with pictures from the web
(shown only when the user asks).

### A thread in several real mailboxes (F05b)

`RealMergedThreadsTests`, also tagged `real-gmail`, needs two Gmail accounts of yours that mail each other, both
imported, and the same rule: **stop the backend first**, or it skips itself. It reads what Sino stored; it never asks
Gmail and never sends anything.

- Groups every account again, as each start does, and checks that nothing changes; no group holds two copies in one
  account, and each copy shares a `Message-ID` with another one of its group.
- Lists every row of the inbox (`all` and `archived`): one row a group, with the ID of its oldest copy and every
  account in `accountIds`; opening any copy gives the group; `unread`, `needsReply` and `withAttachments` of
  `/counts` are the lengths of their views.
- Lists the messages of every group of several copies, through its newest copy: each `Message-ID` once, from the
  copy it went from, else the oldest copy.
- On one group that is neither archived nor unread: archives it and brings it back, marks it unread and read again,
  checking every copy each time, and leaves it as it was. Only in Sino (D-67).

Only this test: `./mvnw test -Preal-gmail -Dtest=RealMergedThreadsTests`. Measured on 2026-10-17 with three accounts
(2339 conversations): 2318 rows, 21 of them threads in two accounts holding 52 stored messages, shown as 26; grouping
again 78 ms; the slowest page of the inbox 76 ms, of messages 17 ms. `EXPLAIN ANALYZE` of the first page of the inbox:
3.5 ms (every conversation of the owner is grouped for each page); of the first page of messages of a group: 2.6 ms
(`message_conversation_sent_idx`, then the primary key for the 21 messages of the page).

### Reply from a real mailbox (F10)

`RealGmailReplyTests`, also tagged `real-gmail`, **sends a real email**. It skips itself unless you name the
conversation and its one addressee, so `./mvnw test -Preal-gmail` alone never sends anything. Same rule: stop the
backend first.

1. The account must have granted `gmail.send`: add the scope (step 5 of *Gmail*), then reconnect the account from the
   web. `GET /api/accounts` then lists `SEND_MESSAGES` in its `capabilities`.
2. Pick a conversation whose reply goes only to an address of yours: the simplest is to send the connected account a
   mail from another address you own. Its ID is in the web's address bar (`/inbox/<id>`) or in the `conversation`
   table.
3. Run, from `apps/sino-api` (PowerShell: `.\mvnw.cmd`, each `-D…` argument in quotes):

   ```bash
   ./mvnw test -Preal-gmail -Dtest=RealGmailReplyTests \
     -Dsino.real-gmail.reply.conversation=<conversation id> -Dsino.real-gmail.reply.to=<that address>
   ```

The test syncs the account, checks that `reply` is `READY` and goes to exactly that address (or sends nothing),
sends one reply through `POST /api/conversations/{id}/messages`, then sends the same `clientMessageId` again, which
must answer `200` without a second email. It then reads the thread on Gmail: the reply is there, labelled `SENT`,
and is the one message sent with that text since the send started; `findSentMessages`, how Sino settles a send whose
outcome is unknown, finds it (Gmail gives every message it sends its own `Message-ID`, so Sino looks in the thread for
the same addressees and text around the time of the send, D-132). A last sync must bring it back as the same message.
A second run sends nothing new: it asks again with the `clientMessageId` of the reply already in the conversation.

## Gmail: new mail in seconds (Pub/Sub notices, F07)

Without this setup Sino asks Gmail for changes every minute (automatic sync, BE-49), and new mail shows up within
about a minute. With it, Gmail tells Sino of each change through Google Cloud Pub/Sub, and new mail shows up within
seconds; Sino then asks only every 5 minutes, in case a notice is lost (D-76).

```text
Gmail --publish--> Pub/Sub topic --push subscription (token signed by Google)--> ngrok --> Sino :8080
                                                                     POST /api/webhooks/gmail
```

Sino keeps no secret of Google's for this: Pub/Sub signs each push with a token for a service account, and Sino checks
the signature with Google's public keys. All in the Google project of the OAuth client above (menu names as of
October 2026). Do the steps in this order: the push subscription needs the ngrok address.

1. **Pub/Sub API.** *APIs & Services > Library*, search *Cloud Pub/Sub API*, *Enable*.
2. **Topic.** *Pub/Sub > Topics > Create topic*, ID `gmail-notices`, untick *Add a default subscription*, *Create*.
   Its full name, shown on the topic page, is `projects/<project id>/topics/gmail-notices`.
3. **Let Gmail publish.** On the topic page, *Permissions* (or *Show info panel*) > *Add principal*:
   `gmail-api-push@system.gserviceaccount.com`, role **Pub/Sub Publisher**, *Save*. Without it Gmail refuses to
   watch the mailbox and the account's sync status shows `push: FAILED`.
4. **Service account for the pushes.** *IAM & Admin > Service Accounts > Create service account*, name
   `sino-gmail-push`, no role, *Done*. **Copy its email exactly as the list shows it**: the console may put a prefix
   in front of the ID (on 2026-10-10 it made `id-sino-gmail-push@<project id>.iam.gserviceaccount.com`), and Sino
   refuses every push whose token names another email. Do not create a key: Sino never needs one. Then, on that service account, *Permissions > Grant access*: principal
   `service-<project number>@gcp-sa-pubsub.iam.gserviceaccount.com` (Pub/Sub's own service agent; the project number
   is on the project dashboard), role **Service Account Token Creator**. Google requires it for Pub/Sub to sign the
   pushes; newer projects may have it already.
5. **ngrok.** Create a free account at <https://ngrok.com>, install the agent, run
   `ngrok config add-authtoken <your authtoken>` once (the token stays in ngrok's own configuration, not in Sino),
   and claim your free static domain under *Universal Gateway > Domains* (something like `name.ngrok-free.app`). Then,
   from `apps/sino-api`, with Sino running on 8080:

   ```bash
   ngrok http 8080 --url https://<your static domain> --traffic-policy-file ngrok/gmail-webhook-only.yml --inspect=false
   ```

   The tunnel opens your machine to the Internet. The policy in `ngrok/gmail-webhook-only.yml` lets only
   `POST /api/webhooks/gmail` through and answers `404` to everything else at ngrok, so the sign-in, the API and
   actuator stay unreachable; never run the tunnel without it. `--inspect=false` turns off ngrok's local request
   inspector, which would keep Google's tokens (valid up to an hour). Check from another terminal:
   `curl -i https://<your static domain>/api/auth/me` answers `404` (refused by ngrok).
6. **Push subscription.** *Pub/Sub > Subscriptions > Create subscription*: ID `gmail-notices-push`, topic
   `gmail-notices`, *Delivery type* **Push**, *Endpoint URL* `https://<your static domain>/api/webhooks/gmail`, tick
   **Enable authentication**, service account `sino-gmail-push`, *Audience* the same URL as the endpoint (any text
   works; Sino only needs the same value), *Retry policy* **Retry after exponential backoff delay**, *Create*.
7. **`.env`.** Set the three settings, all of them (half of them stops the app), then restart Sino:

   ```properties
   SINO_GOOGLE_PUBSUB_TOPIC=projects/<project id>/topics/gmail-notices
   SINO_GOOGLE_PUBSUB_AUDIENCE=https://<your static domain>/api/webhooks/gmail
   SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT=<the service account's email, exactly as in step 4>
   ```

8. **Check.**
   - The startup log no longer says "Gmail is only polled".
   - About a minute after the start (sooner for an account imported now), the log says
     `Account <id> is watched until <time>`, and `GET /api/accounts/<id>/sync` shows `"push": "ACTIVE"` with
     `pushExpiresAt` about 7 days ahead.
   - Send a mail to the connected Gmail from another account: with the web app open, it appears in *Hộp thư* within
     seconds, without reloading. *Pub/Sub > Subscriptions > gmail-notices-push > Metrics* shows the deliveries.

The same steps with `gcloud`, if you use it (project chosen with `gcloud config set project <project id>`):

```bash
gcloud services enable pubsub.googleapis.com
gcloud pubsub topics create gmail-notices
gcloud pubsub topics add-iam-policy-binding gmail-notices \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com --role=roles/pubsub.publisher
gcloud iam service-accounts create sino-gmail-push --display-name="Sino Gmail push"
gcloud iam service-accounts add-iam-policy-binding sino-gmail-push@<project id>.iam.gserviceaccount.com \
  --member=serviceAccount:service-<project number>@gcp-sa-pubsub.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountTokenCreator
gcloud pubsub subscriptions create gmail-notices-push --topic=gmail-notices \
  --push-endpoint=https://<your static domain>/api/webhooks/gmail \
  --push-auth-service-account=sino-gmail-push@<project id>.iam.gserviceaccount.com \
  --push-auth-token-audience=https://<your static domain>/api/webhooks/gmail
```

Good to know:

- Pub/Sub keeps a notice it could not deliver (Sino stopped, tunnel closed) and tries again for up to 7 days; the
  5-minute check brings the mail meanwhile. Gmail stops a watch after 7 days; Sino checks every hour and renews the
  ones ending within 2 days.
- To turn the notices off, clear the three settings and restart. Watches registered before keep Sino's check at
  5 minutes until they end (up to 7 days); to go back to the minute at once, clear them with
  `update sync_checkpoint set watch_address = null, watch_expires_at = null, watch_error = null;`.
- A leaked push token (an hour at most) only lets someone make Sino sync earlier: a notice carries no mail, and Sino
  reads the changes itself.

## Zalo: personal accounts through sino-zalo (F09)

Personal Zalo has no official API, so `sino-api` does not talk to Zalo itself: it calls `apps/sino-zalo`, a small Node
service that drives the unofficial library zca-js and holds the live Zalo sessions (change `zalo-personal`, D-273,
D-282). Start `sino-zalo` first, then `sino-api`; `apps/sino-zalo/README.md` has its prerequisites and commands.

| Variable | Default | What it is |
|---|---|---|
| `SINO_ZALO_ENABLED` | `false` | Turns Zalo on. Off, the connector stays registered: Zalo accounts connected earlier still show and their stored messages still read, and nothing calls `sino-zalo` (D-286) |
| `SINO_ZALO_URL` | `http://127.0.0.1:8090` | Where `sino-zalo` listens: this machine or the Docker network, never the internet (D-282) |
| `SINO_ZALO_SECRET` | none | The secret the two services share, at least 32 bytes of visible ASCII and no space; the same value as `SINO_ZALO_SECRET` in `apps/sino-zalo/.env`. Required once Zalo is on |

Generate the secret once and paste the same value into both `.env` files:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

With `SINO_ZALO_ENABLED=true`, a secret that is missing, too short or not plain ASCII, or a `SINO_ZALO_URL` that is not
an http(s) address, stops the startup with a message naming the setting; the value itself is never printed.

Turned off, Zalo shows as "Sắp có" in the connect dialog (`connectable: false` on `GET /api/providers`), starting a QR
connect answers `409 PROVIDER_DISABLED` ("Zalo is turned off."), and every other call out answers
`PROVIDER_UNAVAILABLE` ("Zalo is turned off (SINO_ZALO_ENABLED)").

### Turn Zalo off in a hurry

Two steps, in this order (D-286):

1. **Stop the `sino-zalo` process** — Ctrl+C in its terminal, or stop its service. Every listener dies with it, so the
   Zalo sessions stop at Zalo straight away. This is the step that counts: it needs nothing from `sino-api`, which may
   be the very thing misbehaving. `sino-api` deliberately has no "disconnect every account" loop for this (D-286).
2. **Set `SINO_ZALO_ENABLED=false` and restart `sino-api`** — nothing reaches out to `sino-zalo` any more and the
   connect dialog stops offering Zalo. Gmail and the Zalo messages already stored keep working.

Either step alone is incomplete: after step 1 only, `sino-api` keeps calling a service that is not answering (safe, but
every Zalo call fails); after step 2 only, the Zalo sessions stay alive inside `sino-zalo`.

## Admin (read-only operator API)

An optional second sign-in for the person who runs Sino (change `admin-api`, D-260…D-266). The admin sees numbers and
statuses (users, connected accounts, how their import and sync go) and never a message, a credential or the
provider's own ID. The admin cannot call the owner's API, and the owner cannot call the admin's.

Turn it on in `.env` and restart:

```dotenv
SINO_ADMIN_EMAIL=admin@example.com    # must differ from SINO_OWNER_EMAIL
SINO_ADMIN_PASSWORD=                  # at least 12 characters; only a BCrypt hash is kept
```

Leave `SINO_ADMIN_EMAIL` empty for no admin. A password without an email, a short password or the owner's email stops
the startup with a message naming the setting (never its value).

The admin signs in like the owner (`POST /api/auth/login`, same lock after 5 wrong passwords) but never gets the
30-day remember-me cookie, even with `rememberMe: true`. On the owner's web an admin session looks signed out
(`GET /api/auth/me` is `401`); one browser holds one session, so signing in as one signs the other out.

```bash
curl -s -c jar -b jar http://localhost:8080/api/auth/me > /dev/null              # sets XSRF-TOKEN
XSRF=$(awk '$6 == "XSRF-TOKEN" {print $7}' jar)
curl -s -c jar -b jar -H "X-XSRF-TOKEN: $XSRF" -H 'Content-Type: application/json' \
     -d '{"email":"admin@example.com","password":"<SINO_ADMIN_PASSWORD>"}' http://localhost:8080/api/auth/login
curl -s -b jar http://localhost:8080/api/admin/overview
curl -s -b jar http://localhost:8080/api/admin/accounts
```

Roles: `/api/admin/**` needs `ADMIN`; every other `/api/**` path needs a signed-in caller that is **not** `ADMIN`
(D-263). That is a deny list, right while every caller who is not the admin is the owner. When Sino gets more users
or a third role, switch `/api/**` to an allow list (`hasRole("OWNER")`, or the users' role) in `SecurityConfig` and
give the tests' `user(...)` that role.

## Endpoints available today

| Path | Access | Notes |
|---|---|---|
| `/actuator/health` | public | Overall status. Signed in, you also see each component. |
| `/actuator/health/liveness`, `/actuator/health/readiness` | public | Readiness includes the database, liveness does not. |
| `/actuator/info` | public | |
| `/api/**` | signed in (session cookie, see below), not as admin | Business endpoints below. Changes (`POST`, `PUT`, `PATCH`, `DELETE`) also need the CSRF token. A signed-in admin gets `403 FORBIDDEN` here (D-263, see *Admin*). |
| `/api/admin/**` | signed in as admin | The read-only admin API (see *Admin*); anyone else signed in gets `403 FORBIDDEN` (`401` when signed in by the remember-me cookie alone). |
| `GET /api/auth/me` | public | `200 {email, displayName}` when signed in, `401` otherwise. Also hands out the `XSRF-TOKEN` cookie. |
| `POST /api/auth/login` | public, CSRF | `{email, password, rememberMe}` → `204` and a session cookie (plus a 30-day remember-me cookie when `rememberMe` is true). Wrong email or password → `401` `INVALID_CREDENTIALS` with `remainingAttempts`; the 5th wrong attempt in a row locks that email for 15 minutes → `429` `LOGIN_LOCKED` with `retryAfterSeconds` and a `Retry-After` header (D-35). |
| `POST /api/auth/logout` | CSRF | `204`; ends the session and deletes the remember-me cookie. |
| `POST /api/accounts/connect/{provider}` | signed in, CSRF | Starts connecting an account over OAuth2 (F04a). Body optional: `{"accountId": "..."}` reconnects that account. `200 {authorizationUrl}`: the browser goes there to give its consent; the state and PKCE verifier stay in the session for 10 minutes. `404 UNKNOWN_PROVIDER`, `422 CONNECT_NOT_SUPPORTED` (the provider does not connect over OAuth2), `404 ACCOUNT_NOT_FOUND` (account to reconnect missing, removed or of another provider), `400 MALFORMED_REQUEST` (`accountId` is not a UUID). |
| `GET /api/accounts/connect/{provider}/callback` | public (the pending connect in the session identifies the user) | Where the provider sends the browser back with `code` and `state` (or `error`). Always a `302`, never JSON: `/accounts?connected={accountId}` on success, `/accounts?connectError={CODE}` otherwise, with `CONNECT_CANCELLED` (the user said no), `CONNECT_STATE_INVALID` (state missing, unknown, used, older than 10 minutes, of another provider, or no session), `CONNECT_SCOPE_DENIED` (Gmail read access not granted), `CONNECT_WRONG_ACCOUNT` (a reconnect came back with another Google account; nothing changes), `CONNECT_FAILED` (anything else, including an account removed while it was being reconnected; the log says why). Whenever tokens came back but no account was connected, the grant is revoked at Google, unless it belongs to an account you already have connected (D-54): revoking would take that account's access away too. |
| `GET /api/providers` | signed in | Supported providers with `type`, `displayName`, `kind` and `capabilities`, sorted by `type`. `kind` is what the connector declares (D-306): `EMAIL` (shown in Hộp thư) or `CHAT` (shown in Tin nhắn). `gmail` (`EMAIL`; `READ_MESSAGES`, `SEND_MESSAGES`, `ATTACHMENTS`, `THREADS`, plus `PUSH_WEBHOOK` with the Pub/Sub settings) when the Google OAuth client is set, `[]` otherwise. |
| `GET /api/accounts` | signed in | Connected accounts of the current user, oldest first, with what each can do (`capabilities`): its provider's, less `SEND_MESSAGES` while the account has not granted the scopes its connector sends with, `gmail.send` for Gmail (F10, D-130); `[]` when its connector is gone. No credential field. Gmail accounts appear here once connected through the callback. `externalAccountId` is the provider's ID (Google's `sub` for Gmail), not something to show; `address` (D-75) is where others reach the account, the email for Gmail, taken each time the account is connected; `null` when the provider has none and for an account connected before this field existed, until it is connected again. |
| `GET /api/accounts/{id}` | signed in | One account. `404` `ACCOUNT_NOT_FOUND` when it does not exist or belongs to another user (same response), `400` `MALFORMED_REQUEST` when the ID is not a UUID. |
| `PATCH /api/accounts/{id}` | signed in | JSON body with one or more of `displayName` (1–100 characters after trimming), `syncEnabled` (pause or resume automatic sync), `enabled` (disable or enable the account); a missing or `null` field stays as it is. `address` is not a field of this request: next to other fields it is ignored, and a body with only `address` is `400 VALIDATION_FAILED` like `{}`. `400` `VALIDATION_FAILED` for `{}` or a bad name, `404` as above, `409` `CONCURRENT_MODIFICATION` when another request changed the account first. |
| `DELETE /api/accounts/{id}` | signed in | `204`. Soft delete (D-13 B): the account row is kept but hidden from every endpoint (`404` afterwards), its stored credential is deleted for good. Connecting the same provider account again brings the same account back. For Gmail, once the removal is committed Sino also asks Google to revoke its access (best effort: if Google fails or is slow, the account is removed anyway and the log has a warning naming the account, never a token). |
| `GET /api/accounts/{id}/initial-sync/estimate?range=` | signed in | Before the first import (F05, D-65): `{messages, minMinutes, maxMinutes}` for `DAYS_30`, `DAYS_90` or `ALL`, the minutes at 60–120 messages a minute (measured with Gmail in BE-46). All three are `null` when the provider cannot tell or fails. Gmail: the whole mailbox is the profile's `messagesTotal` (exact in BE-46); a range counts the listed message IDs, up to 5 000 (BE-61; Gmail's own `resultSizeEstimate` said 201 for 29 messages). `404 ACCOUNT_NOT_FOUND`, `409 ACCOUNT_DISABLED`, `400` for another range. |
| `POST /api/accounts/{id}/initial-sync` | signed in, CSRF | `{"range": "DAYS_30"\|"DAYS_90"\|"ALL"}` → `202` with the status below; the import runs in the background, one at a time per account (a call while it runs returns its status). After `FAILED`, the same range goes on from where it stopped; another range, or a range after `DONE`, is read again from its start: nothing is stored twice, but every message is read again. After a restart the backend goes on with a running import. Errors as for the estimate. |
| `GET /api/accounts/{id}/initial-sync` | signed in | `{status, range, imported, skipped, estimated, remainingMinutes, storedMessages, startedAt, finishedAt, errorCode}` with `status` `NOT_STARTED`, `RUNNING`, `DONE` or `FAILED`. `imported` counts the messages that were new or changed (0 when a range is read again), `storedMessages` every message of the account in Sino. `404` as above. |
| `POST /api/accounts/{id}/sync` | signed in, CSRF | "Đồng bộ ngay" (F07): reads the account's changes in the background now, also when automatic sync is paused. `202` with the sync status below. `404 ACCOUNT_NOT_FOUND`, `409 ACCOUNT_DISABLED`, `409 IMPORT_NOT_DONE` (the first import is not done yet). |
| `GET /api/accounts/{id}/sync` | signed in | `{importDone, lastSyncAt, lastError, push, pushExpiresAt}`: `lastSyncAt` of the last successful sync, `lastError` of the last one when it failed (the import stays done); `push` is `ACTIVE` while the provider tells Sino of changes (until `pushExpiresAt`), `FAILED` when the last registration failed, `OFF` otherwise. `404` as above. |
| `GET /api/conversations` | signed in | The inbox (F05): `{items, nextCursor}`, the conversations of your accounts that are neither removed nor disabled, newest first. `view`: `all` (default, not archived), `unread`, `reply` (needs a reply), `attachments`, `archived`, `scheduled` and `snoozed` (empty for now); `provider` and `accountId` narrow it; `limit` 1–100 (default 30); `cursor` is the `nextCursor` of the page before, `null` on the last page. Items carry no mail body and no HTML. A thread found in several of your accounts (F05b: the copies share a `Message-ID`) is **one** item: `id` is the ID of its oldest copy in the inbox, `accountId` the account of its primary copy (the one with the newest message, which replies go from), `accountIds` every account of the thread, that one first; the time and unread count are those of the whole thread, `archived` and `needsReply` are true only when they are for every copy, `hasAttachments` when one copy has some. `400` for another view, a cursor Sino did not hand out, or a limit out of range. |
| `GET /api/conversations/counts` | signed in | `{unread, byProvider, needsReply, withAttachments, scheduled, snoozed}`: conversations that are not archived, a thread found in several accounts once, over the same accounts as the list; `byProvider` counts the unread ones. |
| `GET /api/conversations/{id}` | signed in | One item (`{id}` may be the ID of any copy of a thread; the item has the ID of the thread) with its `participants` (`externalId`, `name`, `avatarUrl`, `self`; every copy's, each address once, any of your accounts `self`) and `reply` (F10, from the primary copy): `state` is `READY`, `NEEDS_PERMISSION` (the provider sends but the account has not granted it: reconnect), `ACCOUNT_UNAVAILABLE` (expired or turned off) or `NOT_SUPPORTED` (the provider does not send from Sino); `to` (`[{name, address}]`) is where a reply goes: the Reply-To, else the sender, of the newest incoming message, or whom the newest outgoing one went to; `[]` when nobody is known; `canSendImages` is true when a sticker can be sent here (`state` is `READY` and the connector and the account send pictures, `SEND_IMAGES`: Zalo yes, Gmail no), and the web shows no sticker button without it. `404 CONVERSATION_NOT_FOUND` when it is not in your inbox: another user's, of a removed or disabled account, or none. |
| `GET /api/conversations/{id}/messages` | signed in | The messages of one conversation (F06): `{items, nextCursor}`, newest first, then by id; for a thread found in several accounts, the messages of every copy in the inbox, each `Message-ID` once, taken from the copy it went from, else the oldest copy (F05b, D-184), and a message without a `Message-ID` always; `limit` 1–100 (default 20), `cursor` = the `nextCursor` of the page before. Each message has `id`, `direction`, `status`, `sentAt`, `sender` (`{name, address, self}`, `null` when the provider named none), `to` and `cc` (`[{name, address}]`; `null` when Sino does not know them, which is the case for mail stored before F06 until it is stored again), `subject`, `text`, `bodyFormat` (`TEXT`: no HTML; `HTML`: ask for the body; `UNCHECKED`: stored before F06, the body request reads it again), `read`, `attachments` (`[{id, fileName, mimeType, sizeBytes}]`) and `clientMessageId` (the web's ID of a message sent from Sino, `null` for any other; its `status` is `PENDING`, `SENT`, `FAILED` or `UNKNOWN`); never HTML. `404 CONVERSATION_NOT_FOUND` as above (archived conversations and accounts whose Google access expired are fine), `400` for a cursor of another list or a limit out of range. |
| `POST /api/conversations/{id}/messages` | signed in, CSRF | Sends a reply (F10, D-131…D-133): a text, `{text, clientMessageId}`, or a sticker of the library (zalo-send-images, D-351), `{stickerId, clientMessageId}`; exactly one of `text` (1–100 000 characters, not blank) and `stickerId` (a UUID), else `400 VALIDATION_FAILED`. `clientMessageId` a UUID the web makes once per message and sends again unchanged to retry. It goes to `reply.to` (worked out here, never taken from the request), in the provider's thread (Gmail: `threadId`, `In-Reply-To`, `References`, `Re:` subject), from the account of the primary copy and stored in that copy (F05b, D-186); sent again with the same `clientMessageId`, it goes on from the copy it was first written to, or is `409 REPLY_NOT_ALLOWED` (`ACCOUNT_UNAVAILABLE`) when that copy's account has left the inbox. `201` with the message (as listed above), `200` with it when that `clientMessageId` was sent already; `409 SEND_IN_PROGRESS` while it is being sent; `409 REPLY_NOT_ALLOWED` with `state` when `reply.state` is not `READY`, or when the provider refused the account's access (the account is then `AUTH_EXPIRED`); `422 REPLY_NO_RECIPIENT` when `reply.to` is empty; `502 SEND_FAILED` with `messageId` when the provider refused it or could not be reached (the message is `FAILED`; the same `clientMessageId` sends it again); `504 SEND_OUTCOME_UNKNOWN` with `messageId` when the provider gave no answer (15 s, a 5xx, a broken connection): the message is `UNKNOWN`, the same `clientMessageId` gets `409 SEND_OUTCOME_UNKNOWN`, and Sino asks the provider after each sync of the account and every minute: found, `SENT`; not found ten minutes after it was sent, `FAILED`. `400 VALIDATION_FAILED`, `404` as above. **A sticker** goes as a picture of at most 1 MiB, read for its owner through the sticker module's `StickerPictures` (D-350), alone, with no text: it is stored as an `IMAGE` with the text `[Sticker]` and the metadata `libraryStickerId` (the key is not `stickerId`, which the Zalo connector writes with Zalo's own sticker number), listed with `libraryStickerId` so the web shows it from `GET /api/stickers/{id}/content`, and Zalo's echo of the same message (the same ID) is the same row, which keeps `libraryStickerId`. Besides the errors above: `404 STICKER_NOT_FOUND` when the sticker is not the user's or does not exist (nothing is written; a retry of a sticker already sent answers `200` even if it has been deleted since), `409 REPLY_NOT_ALLOWED` with `state` `NOT_SUPPORTED` when `reply.canSendImages` is false, `422 STICKER_NOT_SENDABLE` for a sticker a message cannot carry (the library can be set to keep files above 1 MiB). |
| `DELETE /api/conversations/{id}/messages/{messageId}` | signed in, CSRF | Discards a message Sino failed to send (`FAILED`): `204`. `409 MESSAGE_NOT_DELETABLE` for any other message, `404 MESSAGE_NOT_FOUND` when it is not one of this conversation. Here, for the body and for files below, the message may be one of any copy of a thread found in several accounts; the provider is asked with the account of the copy that holds it (F05b). |
| `GET /api/conversations/{id}/messages/{messageId}/body` | signed in | The full content of one message (F06, D-120): `{format, html, remoteImages}`. `html` is the mail's HTML **cleaned** (jsoup, a list of allowed tags and attributes: no script, frame, form, `on*` attribute or `javascript:` link; links get `target="_blank" rel="noopener noreferrer"`; pictures only from the web, `data:image/png\|jpeg\|gif\|webp` or the message's own embedded ones through the attachment path below), never as it came; `remoteImages` tells whether it has pictures from the web, which the web keeps hidden until asked. `format: TEXT` has `html: null`. A message stored before F06 is read again from its provider the first time (then kept); when the provider fails or the account cannot be used: `502 MESSAGE_CONTENT_UNAVAILABLE` and the next request tries again. `404 MESSAGE_NOT_FOUND` when the message is not one of this conversation, `404 CONVERSATION_NOT_FOUND` as above. |
| `GET /api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}` | signed in | A file of the message (F06, D-125), read from the provider each time and never stored: the bytes, `Content-Type` as stored (else as the provider gives it; `application/octet-stream` when unknown or not a concrete type), `Content-Disposition: attachment` with the name (`filename*=UTF-8''…`), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'` and Spring Security's `no-store`, so even an HTML or SVG file is downloaded, never kept, and never runs on Sino's origin. `?inline=true` shows a PNG, JPEG, GIF or WebP picture inside the mail (`Content-Disposition: inline`, `Cache-Control: max-age=86400, private`): the cleaned HTML points its embedded pictures (`cid:`) here; any other type is `422 ATTACHMENT_NOT_INLINE`. Larger than 25 MB is `422 ATTACHMENT_TOO_LARGE`; while downloads being read from the provider take 50 MB (pictures shown in the mail have their own 25 MB), `503 ATTACHMENT_BUSY` at once; neither asks the provider. `404 ATTACHMENT_NOT_FOUND` when it is not one of that message, `502 ATTACHMENT_UNAVAILABLE` when the provider cannot give it now. |
| `PATCH /api/conversations/{id}` | signed in, CSRF | `{read, archived}`, at least one: `read: true` marks every message read, `read: false` the newest one unread (of the primary copy for a thread found in several accounts), `archived` archives it or brings it back; for such a thread, in every copy (F05b, D-185). Only in Sino, never sent to the provider (D-67). Returns the item. `400 VALIDATION_FAILED` for `{}`, `404` as above. |
| `GET /api/tasks` | signed in | The tasks of the current user (F16): `{generatedAt, tasks}`, the open tasks and those done in the last 7 days, oldest first; grouping into overdue / today / later is the web's job. A task is `{id, title, notes, status: OPEN\|DONE, dueAt, dueDate, reminder, recurrence, seriesId, source, createdAt, completedAt, related}`: the due is a moment (`dueAt`) or a whole day (`dueDate`), at most one; `recurrence` is `{freq: DAILY\|WEEKLY\|MONTHLY\|YEARLY, interval, byWeekdays, byMonthDay, untilDate, count}` or `null`, in the time zone `sino.planner.time-zone` (default `Asia/Ho_Chi_Minh`); `reminder`, `source` and `related` are always `null` for now. |
| `GET /api/tasks/{id}` | signed in | One task. `404 TASK_NOT_FOUND` when it does not exist or belongs to another user (same response), `400 MALFORMED_REQUEST` when the ID is not a UUID. |
| `POST /api/tasks` | signed in, CSRF | `{title, notes, dueAt, dueDate, recurrence}`, only `title` required (1–200 characters, not blank; `notes` up to 20 000; no NUL character in either). `201` with the task and its `Location`. A rule needs a due; `WEEKLY` names `byWeekdays` and must hold the weekday of the due; `MONTHLY` / `YEARLY` take `byMonthDay` from the due when it is missing; `untilDate` or `count`, not both; `interval` 1–99, `count` 1–999. `400 VALIDATION_FAILED` for a bad field, `400 MALFORMED_REQUEST` for an unknown `freq` or a bad date, `422 INVALID_RECURRENCE` when the rule does not fit the due (a Monday rule on a Wednesday). |
| `PATCH /api/tasks/{id}` | signed in, CSRF | `{title, notes}`, at least one; a missing or `null` field stays, `"notes": ""` removes the notes. `400`, `404` as above, `409 CONCURRENT_MODIFICATION`. |
| `PUT /api/tasks/{id}/schedule` | signed in, CSRF | `{dueAt, dueDate, recurrence}` replaces the due and the rule together; a missing or `null` field is none, so `{}` clears both (D-153). A new rule makes this task the first of its series. Checked as for `POST`. |
| `POST /api/tasks/{id}/complete` | signed in, CSRF | `{task, next}`: the task is `DONE`; a repeating task gets its next occurrence (the first date of the rule after this one that is not before today; missed ones are skipped but counted) as a new open task in the same series, stored in the same transaction. A task makes its next occurrence once (D-159): again, or after `reopen`, `next` is `null`. |
| `POST /api/tasks/{id}/reopen` | signed in, CSRF | The task is `OPEN` again; a next occurrence already made stays (D-154). |
| `DELETE /api/tasks/{id}` | signed in, CSRF | `204`; this task only, the other occurrences of its series stay. |
| `GET /api/notes` | signed in | The notes of the current user (F15): `{generatedAt, notes}`, every note with its whole content, newest edit first; grouping, filtering and searching are the web's job (D-173). A note is `{id, kind: TEXT\|DIAGRAM, title, body, diagram, pinned, createdAt, updatedAt, version, anchor, quote, linked}`: `title` is `null` when there is none; a text note has a `body` and `diagram: null`; a diagram note has `body: ""` and `diagram: {blocks: [{id, x, y, text, color, main}], links: [{id, from, fromSide, to, toSide, label}]}` (`color` DEFAULT\|YELLOW\|GREEN\|RED\|BLUE, sides TOP\|RIGHT\|BOTTOM\|LEFT); `version` is what `PATCH` must send back; `anchor` and `quote` are always `null` and `linked` always `[]` for now (D-177). |
| `GET /api/notes/{id}` | signed in | One note. `404 NOTE_NOT_FOUND` when it does not exist or belongs to another user (same response), `400 MALFORMED_REQUEST` when the ID is not a UUID. |
| `POST /api/notes` | signed in, CSRF | A text note `{title, body}` (`kind` left out or `TEXT`): `body` required, with at least one character that is not a space, up to 20 000; or a diagram note `{kind: "DIAGRAM", title, diagram}`, which has no `body`. `title` is optional, up to 200 characters, trimmed; blank is none. No NUL character in any text. A diagram has 1–300 blocks and at most 600 links; block and link IDs are UUIDs made by the web and unique in the diagram; a block `text` is up to 2 000 characters (may be empty); a link `label` is `null` or up to 80 characters; a link joins two different blocks of the diagram, and a (from, to) pair has one link. `201` with the note and its `Location`. `400 VALIDATION_FAILED` for a field or a diagram rule (the error names the rule), `400 MALFORMED_REQUEST` for an unknown `kind`, colour or side, or an ID that is not a UUID. |
| `PATCH /api/notes/{id}` | signed in, CSRF | `{version, title, body, pinned, diagram}`: `version` required (the one the client read) and at least one other field; a missing or `null` field stays, `"title": ""` removes the title, `diagram` replaces the whole diagram. `body` is for a text note and `diagram` for a diagram note: the other one is `422 NOTE_KIND_MISMATCH` (the kind never changes). A `version` that is not the current one is `409 CONCURRENT_MODIFICATION` and nothing is written (D-172). The time of edit (`updatedAt`) moves only when the title, the body or the diagram changes; a pin raises `version` but not `updatedAt`; sending the same values again changes nothing. `400`, `404` as above. |
| `DELETE /api/notes/{id}` | signed in, CSRF | `204`; no `version` needed (D-176). |
| `GET /api/stickers` | signed in | The sticker library of the current user (custom-stickers): `{items}`, newest first, each `{id, name, mediaType, kind: STATIC\|ANIMATED, width, height, sizeBytes, packId, createdAt}` and no bytes (`packId` is `null` for a sticker in no pack, sticker-packs); at most `sino.stickers.max-per-owner` (default 300) of them, so there is no paging. |
| `POST /api/stickers` | signed in, CSRF | Keeps an image: `multipart/form-data` with the part `file` and, if the user typed one, the text part `name`; the text part `packId` puts the sticker into that pack of the user (empty is no pack; not a UUID: `400 MALFORMED_REQUEST`; a pack of another user or none: `404 STICKER_PACK_NOT_FOUND`). PNG, GIF and WebP are kept, **told by what is in the file** and never by its name or declared type (SVG and JPEG are refused); the size is read from the head of the file and no pixel is decoded; `kind` is worked out (a GIF with one frame is `STATIC`). `201` with `Location` (`/api/stickers/{id}`) and the sticker. A missing or empty file: `422 STICKER_FILE_MISSING`; above `sino.stickers.max-file-size` (default `1MB`): `413 STICKER_TOO_LARGE`; another type: `415 STICKER_TYPE_UNSUPPORTED`; a broken head, or a side above `sino.stickers.max-side` (default 1024 px): `422 STICKER_INVALID_IMAGE`; the file already kept: `409 STICKER_DUPLICATE` with the `stickerId` of the one kept; the library full: `409 STICKER_LIMIT_REACHED`. A file above the multipart fence of the server (`spring.servlet.multipart.max-file-size`, `2MB`, kept above the sticker limit) is `413 PAYLOAD_TOO_LARGE` before any of that. Nothing is written when one of these refuses. |
| `PATCH /api/stickers/{id}` | signed in, CSRF | Renames a sticker or moves it, JSON `{name?, packId?}` with at least one: `name` follows the rules of an upload (blank is `Sticker`; `null` keeps the name), `packId` moves it into that pack of the user and `"packId": null` takes it out of every pack; a field left out stays as it is, and the picture never changes. `200` with the sticker. `{}`, or a `packId` that is neither a UUID nor `null`: `400 VALIDATION_FAILED`; `404 STICKER_NOT_FOUND` for a sticker of another user, `404 STICKER_PACK_NOT_FOUND` for a pack of another user. |
| `GET /api/stickers/{id}` | signed in | One sticker (where `Location` leads). `404 STICKER_NOT_FOUND` when it does not exist or belongs to another user (same response), `400 MALFORMED_REQUEST` when the ID is not a UUID. |
| `GET /api/stickers/{id}/content` | signed in | The picture: the bytes with the `Content-Type` of the type it was kept as, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` and `Cache-Control: private, max-age=31536000, immutable` (a sticker never changes; replacing one is deleting it and keeping another). `404 STICKER_NOT_FOUND` as above. |
| `DELETE /api/stickers/{id}` | signed in, CSRF | `204`; the bytes go with it, and the same file can be kept again. `404 STICKER_NOT_FOUND` as above. |
| `GET /api/sticker-packs` | signed in | The sticker packs of the current user (sticker-packs): `{items}`, the oldest first, each `{id, name, stickerCount, coverStickerId, createdAt}`; `coverStickerId` is the newest sticker of the pack, `null` when it is empty. At most `sino.stickers.max-packs-per-owner` (default 50), so there is no paging. |
| `POST /api/sticker-packs` | signed in, CSRF | Creates a pack, JSON `{name}`: 1 to 50 characters once trimmed, no NUL, otherwise `400 VALIDATION_FAILED`. `201` with `Location` (`/api/sticker-packs/{id}`) and the pack. A name another pack of the user has, in any case: `409 STICKER_PACK_NAME_TAKEN`; the user already has the most packs: `409 STICKER_PACK_LIMIT_REACHED` with `maxPacks`. |
| `GET /api/sticker-packs/{id}` | signed in | One pack (where `Location` leads). `404 STICKER_PACK_NOT_FOUND` when it does not exist or belongs to another user (same response), `400 MALFORMED_REQUEST` when the ID is not a UUID. |
| `PATCH /api/sticker-packs/{id}` | signed in, CSRF | Renames a pack, JSON `{name}`, by the rules of `POST`; its stickers stay in it, and it may take its own name in another case. `200` with the pack; `400 VALIDATION_FAILED`, `409 STICKER_PACK_NAME_TAKEN`, `404 STICKER_PACK_NOT_FOUND` as above. |
| `DELETE /api/sticker-packs/{id}` | signed in, CSRF | `204`; the stickers of the pack stay in the library with `packId: null`. `404 STICKER_PACK_NOT_FOUND` as above, also the second time. |
| `GET /api/events/stream` | signed in | Server-Sent Events of the current user (F08, D-77): `conversations.changed {type, accountId, conversationIds, newInbound, source: import\|sync\|user, at}` and `account.changed {type, accountId, at}`, sent once the change is committed; ids and counts only, never mail. `retry: 3000` first, a `:` comment every 25 s, closed after 20 minutes (the browser connects again), at most 5 streams per user (a 6th closes the oldest). `401` without a session. |
| `GET /api/admin/me` | admin | `{email}` of the signed-in admin. |
| `GET /api/admin/overview` | admin | `{generatedAt, users, accounts, accountsByStatus, accountsWithSyncErrors, storedMessages}`: `accounts` and `storedMessages` leave removed accounts out; `accountsByStatus` always has `CONNECTED`, `DEGRADED`, `AUTH_EXPIRED`, `ERROR` and `DISABLED`; `accountsWithSyncErrors` counts the accounts whose import failed, whose last sync failed, or whose push notices could not be turned on. |
| `GET /api/admin/users` | admin | `{generatedAt, users}`: every Sino user, oldest first, `{id, email, displayName, status, createdAt, accounts}`, `accounts` = connected accounts that are not removed. |
| `GET /api/admin/accounts` | admin | `{generatedAt, accounts}`: every account that is not removed, of every user, oldest first, `{id, ownerId, provider, address, status, syncEnabled, createdAt, storedMessages, sync: {importStatus, importError, lastSyncAt, syncError, push}}`; `importStatus` is `NONE` (never started), `RUNNING`, `DONE` or `FAILED`, `push` as in `GET /api/accounts/{id}/sync`. No message, credential or provider ID, ever (D-264). |
| `POST /api/webhooks/gmail` | public, Google's token | Where Pub/Sub pushes Gmail's notices (F07, D-76; see *Gmail: new mail in seconds*); only with the three Pub/Sub settings, `404` otherwise. No session, no CSRF: `Authorization: Bearer <OIDC token>` signed by Google for the configured audience and service account. `204` (the account watched under the notice's address is synced in the background; a notice that cannot be read is dropped), `401 PUSH_TOKEN_INVALID`, `503 PUSH_KEYS_UNAVAILABLE` (Google's keys cannot be fetched), `400` (the body broke off). |
| any other path | denied | Other actuator endpoints need a signed-in user and are not exposed (404). The `local` profile also exposes `/actuator/modulith`. |

Sign in with curl the way the browser does (D-22): fetch the CSRF cookie, send it back in `X-XSRF-TOKEN`, keep
the cookies in a jar.

```bash
curl -s -c jar -b jar http://localhost:8080/api/auth/me > /dev/null              # sets XSRF-TOKEN
XSRF=$(awk '$6 == "XSRF-TOKEN" {print $7}' jar)
curl -s -c jar -b jar -H "X-XSRF-TOKEN: $XSRF" -H 'Content-Type: application/json'      -d '{"email":"me@example.com","password":"<SINO_OWNER_PASSWORD>"}' http://localhost:8080/api/auth/login
curl -s -b jar http://localhost:8080/api/accounts                                  # GET: cookie only
curl -s -b jar -H "X-XSRF-TOKEN: $XSRF" -X DELETE http://localhost:8080/api/accounts/<id>   # changes: + token
```

Every error is an RFC 9457 problem response (`application/problem+json`) with a stable `code`, for example:

```json
{ "title": "Unauthorized", "status": 401, "detail": "Authentication is required to access this resource.",
  "instance": "/api/accounts", "code": "UNAUTHORIZED" }
```

The error code catalog is in the F01 design (`openspec/changes/archive/2026-10-01-be-f01-project-foundation/design.md`, section 8) and in each feature's design; the behaviour is specified in `openspec/specs/api-conventions/spec.md`.

## Test

| Goal | Command |
|---|---|
| All tests | `./mvnw test` |
| Full build, as CI runs it | `./mvnw -B verify` |
| Module boundaries only | `./mvnw test -Dtest=ModularityTests` |
| Read the real Gmail account connected on this machine, import it again and read its conversations (by hand, never in CI) | `./mvnw test -Preal-gmail` (see *Read a real mailbox*, *Import a real mailbox again*, *Read conversations of a real mailbox* and *A thread in several real mailboxes*) |
| Send one real reply from that account, to an address you pick (by hand, never in CI) | `./mvnw test -Preal-gmail -Dtest=RealGmailReplyTests -Dsino.real-gmail.reply.conversation=… -Dsino.real-gmail.reply.to=…` (see *Reply from a real mailbox*) |

Tests run with the `test` profile (`src/test/resources/application-test.yaml`, fake owner `owner@sino.test` /
`test-owner-password`, fake admin `admin@sino.test` / `test-admin-password`) against PostgreSQL 18 started by
Testcontainers. GitHub Actions
(`.github/workflows/backend-ci.yml`) runs `./mvnw -B verify` on pushes and pull requests that touch this folder.

## Module conventions

Decided in D-03 (`openspec/specs/module-boundaries/spec.md`).

- Every business module is a direct sub-package of `dev.sino` (`account`, `provider`, `conversation`, `messaging`, `sync`, `search`, `realtime`). `dev.sino.common` holds technical concerns only and depends on no business module.
- A module's **public API** is the types in its base package (for example `dev.sino.account.AccountConnected`) plus any sub-package marked with `@NamedInterface` (for example `dev.sino.common.error`).
- The layer packages `api` (REST controllers), `application`, `domain` and `infrastructure` are **internal**. Other modules must not reference them, so no module touches another module's repositories or JPA entities.
- Modules talk to each other through public API types or events. A module that only needs to react to something listens to an event instead of calling back.
- Modules report failures with `SinoException` and their own `ErrorCode` enum; the web layer maps the category to the HTTP status.
- `ModularityTests` checks these rules on every build and writes module diagrams to `target/spring-modulith-docs`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `FATAL: invalid value for parameter "TimeZone": "Asia/Saigon"` | The JVM uses a legacy zone id that PostgreSQL 18 rejects. The app and the tests force UTC (D-23); a new launch path (another IDE configuration, a Dockerfile) must keep `-Duser.timezone=UTC` or go through `SinoApiApplication.main`. |
| `failed to connect to the docker API` | Docker Desktop is not running. |
| App stops with `The active credential key ... is not configured` or `sino.credentials.encryption.keys.k1 must decode to 32 bytes` | `SINO_CREDENTIAL_KEY_K1` is missing or is not base64 of 32 bytes. Generate one with `openssl rand -base64 32`. |
| App stops with `sino.owner.password (SINO_OWNER_PASSWORD) must be set and at least 12 characters long` or the same for `sino.auth.remember-me-key` | Add `SINO_OWNER_PASSWORD` and `SINO_REMEMBER_ME_KEY` to `.env` (see `.env.example`). The message never shows the value. |
| App stops with `SINO_GOOGLE_CLIENT_SECRET (sino.google.client-secret) is missing` (or the same for the client id) | Only half of the Google OAuth client is set. Set both `SINO_GOOGLE_CLIENT_ID` and `SINO_GOOGLE_CLIENT_SECRET`, or clear both to run without Gmail. |
| App stops with `SINO_PUBLIC_BASE_URL (sino.public-base-url) must be the http(s) address ...` | Gmail is on but the public address is missing or not an `http(s)` URL. Set `SINO_PUBLIC_BASE_URL` (for example `http://localhost:5173`). |
| Google shows `Error 400: redirect_uri_mismatch` | The redirect URI Sino sends (`SINO_PUBLIC_BASE_URL` + `/api/accounts/connect/gmail/callback`) is not listed in the OAuth client character for character: scheme, host, port, path, no trailing slash. Add it under *Google Auth Platform > Clients*. |
| Google shows `Error 403: access_denied` ("has not completed the Google verification process") | The Google account is not a test user. Add it under *Google Auth Platform > Audience > Test users*. |
| A Gmail account stops working about a week after connecting | The Google project is in Testing, where refresh tokens last 7 days. Reconnect it. |
| Connecting Gmail ends on `/accounts?connectError=CONNECT_FAILED` | Look for `Connecting gmail failed: ...` in the log: it names the reason (the token endpoint's HTTP status or OAuth error, no refresh token, profile not readable), never a code or a token. |
| Connecting Gmail ends on `/accounts?connectError=CONNECT_STATE_INVALID` | The callback came more than 10 minutes after the start, in another browser, after a restart (the session is gone), or twice. Start again. |
| App stops with `sino.owner` validation errors | `SINO_OWNER_EMAIL` / `SINO_OWNER_DISPLAY_NAME` are missing or the email is not valid. Copy them from `.env.example`. |
| Sign-in answers `429` `LOGIN_LOCKED` | Five wrong passwords in a row locked that email for 15 minutes (D-35). Wait `retryAfterSeconds`, or restart the app (the counter lives in memory). |
| Every `POST`/`PATCH`/`DELETE` answers `403` `CSRF_TOKEN_INVALID` | The `X-XSRF-TOKEN` header is missing or does not match the `XSRF-TOKEN` cookie. Call `GET /api/auth/me` first and send the cookie value back in the header. |
| App stops at bean `dataSource` with `'url' must start with "jdbc"` | No profile and no `SINO_DB_*` variables. Use `-Dspring-boot.run.profiles=local` on a dev machine. |
| App stops with `SINO_GOOGLE_PUBSUB_... missing: the Gmail notice settings ... go together` | Only some of the three Pub/Sub settings are set. Set `SINO_GOOGLE_PUBSUB_TOPIC`, `SINO_GOOGLE_PUBSUB_AUDIENCE` and `SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT`, or clear all three to only poll Gmail. |
| `GET /api/accounts/{id}/sync` shows `"push": "FAILED"` | Gmail refused to watch the mailbox; the log says `The watch of account <id> could not be registered: <code>`. `REQUEST_REJECTED`: the topic name is wrong, of another project, or `gmail-api-push@system.gserviceaccount.com` is not a Pub/Sub Publisher on it. Sino tries again every hour, and asks Gmail every minute meanwhile. |
| Log `Gmail pushes signed by Google are refused (The aud claim is not valid)` (or `email`) | Pub/Sub's tokens are for another audience or service account than `.env` says. Make `SINO_GOOGLE_PUBSUB_AUDIENCE` and `SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT` match the push subscription exactly (open it with *Edit*: the service account's email there may start with `id-`), and restart. Meanwhile ngrok counts many connections (Pub/Sub sends a refused notice again and again) and new mail takes up to 5 minutes. |
| Log `Google's signing keys cannot be fetched` | Sino cannot reach `https://www.googleapis.com/oauth2/v3/certs`; pushes get `503` and Pub/Sub sends them again later. Check the network. |
| `push` is `ACTIVE` but new mail still takes up to 5 minutes | Notices do not reach Sino: ngrok is not running, its address changed, or the subscription's endpoint is wrong. *Pub/Sub > Subscriptions > gmail-notices-push > Metrics* shows failed deliveries. |
| Port 5432 already in use | Another PostgreSQL runs locally. Stop it or change the published port in `compose.yaml` and the URL in `application-local.yaml`. |
