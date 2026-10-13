-- Who takes part in a conversation (BE-42), stored by the provider's ID of the person.
CREATE TABLE conversation_participant
(
    id                      uuid    NOT NULL DEFAULT uuidv7(),
    conversation_id         uuid    NOT NULL,
    external_participant_id text    NOT NULL,
    display_name            text,
    avatar_url              text,
    -- The connected account itself.
    is_self                 boolean NOT NULL DEFAULT false,
    CONSTRAINT conversation_participant_pk PRIMARY KEY (id),
    CONSTRAINT conversation_participant_conversation_fk
        FOREIGN KEY (conversation_id) REFERENCES conversation (id) ON DELETE CASCADE,
    CONSTRAINT conversation_participant_conversation_external_uk UNIQUE (conversation_id, external_participant_id)
);
