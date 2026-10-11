-- F06 (BE-55, D-120, D-122): the HTML body of a message as the provider gave it, cleaned only when it is shown.
-- TEXT: the message has no HTML (or it was too long to keep); HTML: html_content holds it; UNCHECKED: stored before
-- F06, so Sino reads the message again from the provider the first time it is opened.
ALTER TABLE message
    ADD COLUMN html_content text,
    ADD COLUMN body_format  varchar(16) NOT NULL DEFAULT 'UNCHECKED',
    ADD CONSTRAINT message_body_format_ck CHECK (body_format IN ('TEXT', 'HTML', 'UNCHECKED')),
    ADD CONSTRAINT message_html_content_ck CHECK ((body_format = 'HTML') = (html_content IS NOT NULL));

-- The default only marks the rows already there: a new message always says what it is.
ALTER TABLE message
    ALTER COLUMN body_format DROP DEFAULT;
