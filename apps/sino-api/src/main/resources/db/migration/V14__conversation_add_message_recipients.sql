-- F06 (BE-54): the addressees of an email, {"to": [...], "cc": [...], "replyTo": [...]} with {name, address} each.
-- NULL means Sino does not know them: mail stored before F06, or a provider without addressees (chat). A later
-- store that cannot tell them keeps those stored.
ALTER TABLE message
    ADD COLUMN recipients jsonb;
