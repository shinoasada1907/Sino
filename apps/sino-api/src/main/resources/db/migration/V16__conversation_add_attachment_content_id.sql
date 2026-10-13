-- F06 (BE-56, D-125): a picture the HTML of its message shows by Content-ID ("cid:"), stored without its content
-- like every attachment. Such a row is not a file of the message: the list of files and has_attachments skip it.
ALTER TABLE attachment
    ADD COLUMN content_id text;
