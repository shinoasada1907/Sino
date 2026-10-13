-- What Sino knows about the files of a message (BE-42), stored by the provider's ID of the file within the message.
-- Only metadata: downloading the content comes later (F06).
CREATE TABLE attachment
(
    id                     uuid   NOT NULL DEFAULT uuidv7(),
    message_id             uuid   NOT NULL,
    external_attachment_id text   NOT NULL,
    file_name              text,
    mime_type              text,
    size_bytes             bigint,
    remote_url             text,
    thumbnail_url          text,
    CONSTRAINT attachment_pk PRIMARY KEY (id),
    CONSTRAINT attachment_message_fk FOREIGN KEY (message_id) REFERENCES message (id) ON DELETE CASCADE,
    CONSTRAINT attachment_message_external_uk UNIQUE (message_id, external_attachment_id)
);
