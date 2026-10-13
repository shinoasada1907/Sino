-- F07 (BE-48, D-79): once the first import is DONE, the account is kept up to date from its cursor. These columns
-- tell how that went; they never change import_status. NULL on old rows means: never synced since the import.
ALTER TABLE sync_checkpoint
    -- The last sync that read every change up to the provider's present.
    ADD COLUMN last_sync_at         timestamptz,
    -- The last sync that began, successful or not, so a failing account is not asked again at every scan.
    ADD COLUMN last_sync_attempt_at timestamptz,
    -- Why the last sync failed; NULL when it succeeded.
    ADD COLUMN last_sync_error      varchar(40);
