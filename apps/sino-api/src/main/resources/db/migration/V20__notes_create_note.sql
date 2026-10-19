-- Notes of a Sino user (BE-90, F15). A note stands alone for now: no anchor to a message (D-170, D-177). A body has a
-- character that is not a space and at most 20000 characters; a title is optional, and a blank one is stored as NULL
-- (D-174). Pinning is not an edit, so updated_at only moves when the title or body change (D-175); version is
-- raised by every write and is what a client sends back to say which note it read (D-172).
CREATE TABLE note
(
    id         uuid         NOT NULL,
    user_id    uuid         NOT NULL,
    title      varchar(200),
    body       text         NOT NULL,
    pinned     boolean      NOT NULL DEFAULT false,
    created_at timestamptz  NOT NULL,
    updated_at timestamptz  NOT NULL,
    version    bigint       NOT NULL,
    CONSTRAINT note_pk PRIMARY KEY (id),
    CONSTRAINT note_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id),
    CONSTRAINT note_body_not_blank_ck CHECK (btrim(body) <> ''),
    CONSTRAINT note_body_length_ck CHECK (char_length(body) <= 20000),
    CONSTRAINT note_title_not_blank_ck CHECK (title IS NULL OR btrim(title) <> '')
);

-- The list of a user, the last edited first (GET /api/notes).
CREATE INDEX note_user_updated_idx ON note (user_id, updated_at DESC);
