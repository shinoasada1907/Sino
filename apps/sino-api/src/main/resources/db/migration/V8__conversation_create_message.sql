-- Messages (BE-42, D-63), stored by the provider's message ID within their conversation. Never the provider's raw
-- payload: metadata holds the few small values a connector documents.
CREATE TABLE message
(
    id                           uuid        NOT NULL DEFAULT uuidv7(),
    conversation_id              uuid        NOT NULL,
    sender_participant_id        uuid,
    external_message_id          text        NOT NULL,
    direction                    varchar(16) NOT NULL,
    type                         varchar(16) NOT NULL,
    text_content                 text,
    status                       varchar(16) NOT NULL,
    sent_at                      timestamptz NOT NULL,
    reply_to_external_message_id text,
    -- What Sino shows, and what the provider said last; they differ after a change made in Sino (D-67).
    is_read                      boolean     NOT NULL,
    provider_read                boolean     NOT NULL,
    metadata                     jsonb       NOT NULL DEFAULT '{}',
    created_at                   timestamptz NOT NULL,
    updated_at                   timestamptz NOT NULL,
    CONSTRAINT message_pk PRIMARY KEY (id),
    CONSTRAINT message_conversation_fk FOREIGN KEY (conversation_id) REFERENCES conversation (id) ON DELETE CASCADE,
    CONSTRAINT message_sender_fk FOREIGN KEY (sender_participant_id) REFERENCES conversation_participant (id),
    CONSTRAINT message_conversation_external_uk UNIQUE (conversation_id, external_message_id),
    CONSTRAINT message_direction_ck CHECK (direction IN ('INBOUND', 'OUTBOUND')),
    CONSTRAINT message_type_ck
        CHECK (type IN ('TEXT', 'IMAGE', 'FILE', 'AUDIO', 'VIDEO', 'SYSTEM', 'MIXED', 'UNKNOWN')),
    CONSTRAINT message_status_ck CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN'))
);

-- The messages of one conversation, newest first (02B section 5).
CREATE INDEX message_conversation_sent_idx ON message (conversation_id, sent_at DESC);
-- For the foreign key: deleting a participant must not scan every message.
CREATE INDEX message_sender_idx ON message (sender_participant_id);
