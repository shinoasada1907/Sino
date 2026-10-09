-- Conversations of connected accounts (BE-42, F05): one row per conversation of one account, stored by its
-- external ID. account_id has no foreign key: connected_account belongs to the account module, and a removed
-- account keeps its mail (D-66). IDs are UUIDv7 (D-08), made by PostgreSQL: this module writes with SQL, not JPA.
CREATE TABLE conversation
(
    id                       uuid        NOT NULL DEFAULT uuidv7(),
    account_id               uuid        NOT NULL,
    external_conversation_id text        NOT NULL,
    type                     varchar(16) NOT NULL,
    title                    text,
    avatar_url               text,
    -- A summary of the stored messages, worked out again after every store (BE-43).
    last_message_at          timestamptz NOT NULL,
    last_message_preview     text,
    last_message_from        text,
    counterpart              text,
    unread_count             integer     NOT NULL DEFAULT 0,
    has_attachments          boolean     NOT NULL DEFAULT false,
    needs_reply              boolean     NOT NULL DEFAULT false,
    -- Only in Sino, never written back to the provider (D-67).
    archived                 boolean     NOT NULL DEFAULT false,
    created_at               timestamptz NOT NULL,
    updated_at               timestamptz NOT NULL,
    CONSTRAINT conversation_pk PRIMARY KEY (id),
    CONSTRAINT conversation_account_external_uk UNIQUE (account_id, external_conversation_id),
    CONSTRAINT conversation_type_ck CHECK (type IN ('DIRECT', 'GROUP', 'THREAD', 'CHANNEL', 'UNKNOWN')),
    CONSTRAINT conversation_unread_count_ck CHECK (unread_count >= 0)
);

-- The conversations of one account, newest first (02B section 5).
CREATE INDEX conversation_account_last_message_idx ON conversation (account_id, last_message_at DESC);
-- Pages of the inbox (BE-44): newest first, the id breaking ties, archived conversations left out.
CREATE INDEX conversation_inbox_idx ON conversation (last_message_at DESC, id DESC) WHERE NOT archived;
-- Accounts with unread conversations (02B section 5).
CREATE INDEX conversation_unread_idx ON conversation (account_id) WHERE unread_count > 0;
