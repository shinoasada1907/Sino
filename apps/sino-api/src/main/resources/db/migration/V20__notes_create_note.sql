-- Notes of a Sino user (BE-90, F15). Text notes, not tied to a message yet (D-170): the body is required, the title is
-- optional and NULL when there is none (D-174). A pin is not an edit, so pinning leaves updated_at as it is (D-175);
-- the API checks version on every save, so an old tab cannot write over a newer edit (D-172).
-- The checks below are a floor under the application's: btrim removes spaces only and char_length counts code points,
-- so nothing the application accepts is refused here.
CREATE TABLE note
(
    id         uuid        NOT NULL,
    user_id    uuid        NOT NULL,
    title      varchar(200),
    body       text        NOT NULL,
    pinned     boolean     NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    version    bigint      NOT NULL,
    CONSTRAINT note_pk PRIMARY KEY (id),
    CONSTRAINT note_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id),
    CONSTRAINT note_body_blank_ck CHECK (btrim(body) <> ''),
    CONSTRAINT note_body_length_ck CHECK (char_length(body) <= 20000),
    CONSTRAINT note_title_blank_ck CHECK (title IS NULL OR btrim(title) <> '')
);

-- The notes of a user, newest edit first (GET /api/notes).
CREATE INDEX note_user_updated_idx ON note (user_id, updated_at DESC);
