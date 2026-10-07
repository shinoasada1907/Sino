-- D-13 B (BE-17): a removed account keeps its row, marked with the time of removal, and is hidden by every query
-- of the API. Its credential is deleted, not kept. The unique key stays, so connecting the same account again
-- brings this row back.
ALTER TABLE connected_account
    ADD COLUMN removed_at timestamptz;
