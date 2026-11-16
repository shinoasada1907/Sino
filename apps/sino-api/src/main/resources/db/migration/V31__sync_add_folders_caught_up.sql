-- Mail folders (mail-folders, D-501): when the one-off catch-up of the account's mailboxes ran. NULL: it has not, so it
-- runs at the next start. A catch-up that fails leaves it NULL. Starting the import again keeps it: same mailbox.
ALTER TABLE sync_checkpoint
    ADD COLUMN folders_caught_up_at timestamptz;
