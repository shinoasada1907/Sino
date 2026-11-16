## ADDED Requirements

### Requirement: Public pages carry their content in the served HTML

The server SHALL answer `/`, `/privacy` and `/en/privacy` with HTML that already holds the full text of the page, with the correct `<title>` and `lang`, without any JavaScript being run.

#### Scenario: Privacy policy read without JavaScript

- **WHEN** a client without JavaScript requests `/en/privacy`
- **THEN** the response is `200` and the HTML holds the full English privacy policy, with `lang="en"` and the title `Privacy policy · Sino`

#### Scenario: Vietnamese privacy policy read without JavaScript

- **WHEN** a client without JavaScript requests `/privacy`
- **THEN** the response is `200` and the HTML holds the full Vietnamese privacy policy, with `lang="vi"`

#### Scenario: Home page read without JavaScript

- **WHEN** a client without JavaScript requests `/`
- **THEN** the response is `200` and the HTML describes Sino Messages and links to the privacy policy

### Requirement: The app pages keep the empty shell

Every path other than the public pages and static files SHALL still be answered with the app shell, which holds no content of a public page.

#### Scenario: Deep link into the app

- **WHEN** a client requests `/inbox`
- **THEN** the response is the app shell, with an empty `#root`

#### Scenario: API unchanged

- **WHEN** a client requests a path under `/api/`
- **THEN** the request still goes to `sino-api`

### Requirement: Behaviour with JavaScript stays the same

With JavaScript, a visitor SHALL get the same pages as before, and a signed-in owner opening `/` SHALL go to `/overview` without the public page showing first.

#### Scenario: Signed-in owner opens home

- **WHEN** a signed-in owner opens `/` in a browser
- **THEN** the session mark shows, then `/overview`, and the Sino Messages page does not flash

#### Scenario: Visitor opens home

- **WHEN** a visitor who is not signed in opens `/` in a browser
- **THEN** the Sino Messages page shows and works as before

### Requirement: A build with incomplete public pages fails

The web build SHALL fail when a generated public page lacks its expected text or still holds an unfilled owner value.

#### Scenario: Owner value missing

- **WHEN** a value of `owner.ts` is `null` at build time
- **THEN** `pnpm build` exits with an error naming the page

### Requirement: The privacy policy names who handles the data

The privacy policy SHALL show its contact email, owner, effective date and server provider, and SHALL name Cloudflare among the third parties, in both languages.

#### Scenario: Reader checks the third parties

- **WHEN** a reader opens the third parties section in Vietnamese or English
- **THEN** it names Google, the server provider and Cloudflare, and states what passes through each
