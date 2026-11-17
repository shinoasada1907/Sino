-- Mail folders (mail-folders, D-499): the folder a provider keeps a message in (null for a chat, and for mail stored
-- before Sino read it), and four flags of the conversation worked out from its messages, so the inbox views filter on
-- columns. Messages stay without a mailbox until the one-off catch-up (D-501); the flags are worked out once here from
-- the direction, so has_sent is right at once and has_inbox keeps what the inbox showed before: inbound mail is inbox.
ALTER TABLE message
    ADD COLUMN mailbox varchar(16),
    ADD CONSTRAINT message_mailbox_ck CHECK (mailbox IN ('INBOX', 'ARCHIVE', 'SPAM', 'TRASH'));

ALTER TABLE conversation
    ADD COLUMN has_inbox   boolean NOT NULL DEFAULT false,
    ADD COLUMN has_archive boolean NOT NULL DEFAULT false,
    ADD COLUMN has_junk    boolean NOT NULL DEFAULT false,
    ADD COLUMN has_sent    boolean NOT NULL DEFAULT false;

UPDATE conversation c
SET has_inbox = EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = c.id AND m.direction = 'INBOUND'),
    has_sent = EXISTS (SELECT 1 FROM message m WHERE m.conversation_id = c.id AND m.direction = 'OUTBOUND');
