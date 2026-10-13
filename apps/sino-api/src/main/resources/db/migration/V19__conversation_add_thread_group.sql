-- One thread found in several accounts of the owner is one group (F05b, D-180): conversations of the same owner and
-- provider, in different accounts, that hold a message with the same Message-ID. grouped_with is the oldest
-- conversation of the group, NULL while a conversation is a group of its own; thread_group_id is the group either
-- way, worked out by PostgreSQL, so no insert has to know about groups. The mail stored before this migration is
-- grouped when Sino starts (ThreadGroups), the same way as when it is stored.
ALTER TABLE conversation ADD COLUMN grouped_with uuid;
-- STORED, as the inbox reads by group and PostgreSQL 18 cannot index a VIRTUAL column; adding it rewrites the table.
ALTER TABLE conversation ADD COLUMN thread_group_id uuid GENERATED ALWAYS AS (COALESCE(grouped_with, id)) STORED;

-- The conversations of one group.
CREATE INDEX conversation_thread_group_idx ON conversation (thread_group_id);
-- The copies of one message in the other accounts of the owner.
CREATE INDEX message_rfc_message_id_idx ON message ((metadata ->> 'rfcMessageId'))
    WHERE metadata ->> 'rfcMessageId' IS NOT NULL;
