-- F07 (BE-51, D-76): the provider tells Sino of changes to an imported account it watches. One watch per account;
-- NULL on old rows means: no watch yet. Starting the import again keeps the watch: it is the same mailbox.
ALTER TABLE sync_checkpoint
    -- The address the provider's notices carry (Gmail: the emailAddress of the profile).
    ADD COLUMN watch_address    text,
    -- Until when the provider sends notices unless the watch is renewed.
    ADD COLUMN watch_expires_at timestamptz,
    -- Why the last registration of the watch failed; NULL when it succeeded.
    ADD COLUMN watch_error      varchar(40);

-- A notice names its mailbox by address, in any case: the webhook finds the accounts with it (BE-52).
CREATE INDEX sync_checkpoint_watch_address_idx ON sync_checkpoint (lower(watch_address))
    WHERE watch_address IS NOT NULL;
