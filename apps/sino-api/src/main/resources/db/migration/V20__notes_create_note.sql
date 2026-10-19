-- Notes of a Sino user (BE-90, F15). Two kinds (D-179): TEXT, a body typed by the user, and DIAGRAM, blocks joined by
-- arrows kept whole in one jsonb document and replaced as a whole at every save. Not tied to a message yet (D-170).
-- For a TEXT note the body is required and there is no diagram (D-174); for a DIAGRAM note the body is empty and the
-- diagram is a JSON object. The title is optional and NULL when there is none. A pin is not an edit, so pinning
-- leaves updated_at as it is (D-175); the API checks version on every save, so an old tab cannot write over a newer
-- edit (D-172).
-- The checks below are a floor under the application's: btrim removes spaces only and char_length counts code points,
-- so nothing the application accepts is refused here. What is inside the diagram (blocks, arrows, limits) is checked
-- by the application only.
CREATE TABLE note
(
    id         uuid        NOT NULL,
    user_id    uuid        NOT NULL,
    kind       varchar(10) NOT NULL DEFAULT 'TEXT',
    title      varchar(200),
    body       text        NOT NULL,
    diagram    jsonb,
    pinned     boolean     NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    version    bigint      NOT NULL,
    CONSTRAINT note_pk PRIMARY KEY (id),
    CONSTRAINT note_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id),
    CONSTRAINT note_kind_ck CHECK (kind IN ('TEXT', 'DIAGRAM')),
    CONSTRAINT note_body_length_ck CHECK (char_length(body) <= 20000),
    CONSTRAINT note_title_blank_ck CHECK (title IS NULL OR btrim(title) <> ''),
    CONSTRAINT note_text_ck CHECK (kind <> 'TEXT' OR (diagram IS NULL AND btrim(body) <> '')),
    CONSTRAINT note_diagram_ck CHECK (kind <> 'DIAGRAM'
        OR (diagram IS NOT NULL AND jsonb_typeof(diagram) = 'object' AND body = ''))
);

-- The notes of a user, newest edit first (GET /api/notes).
CREATE INDEX note_user_updated_idx ON note (user_id, updated_at DESC);
