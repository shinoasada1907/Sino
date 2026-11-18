-- Reactions on messages (zalo-reactions, RX-06, D-384): one row per reactor and message. A removal keeps the row with
-- code NULL, so an older reaction that arrives late cannot come back; a reaction is written only when it is newer.
CREATE TABLE message_reaction
(
    message_id          uuid        NOT NULL,
    reactor_external_id text        NOT NULL,
    reactor_name        text,
    is_self             boolean     NOT NULL,
    code                text,
    reacted_at          timestamptz NOT NULL,
    updated_at          timestamptz NOT NULL,
    CONSTRAINT message_reaction_pk PRIMARY KEY (message_id, reactor_external_id),
    CONSTRAINT message_reaction_message_fk FOREIGN KEY (message_id) REFERENCES message (id) ON DELETE CASCADE
);
