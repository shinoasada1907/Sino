-- The ID the web gives a message the user sends from Sino (F10, D-131): a second request with the same one in the same
-- conversation is the same message, never a second send. Null for every message Sino did not send.
ALTER TABLE message
    ADD COLUMN client_message_id uuid;

CREATE UNIQUE INDEX message_conversation_client_message_uk ON message (conversation_id, client_message_id)
    WHERE client_message_id IS NOT NULL;
