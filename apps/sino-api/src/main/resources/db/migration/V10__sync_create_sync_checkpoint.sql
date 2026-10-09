-- Where the reading of an account's mail stands (BE-45, D-64, 02B): the first import with its progress, and the
-- cursor that later syncs (F07) go on from. One row per account; no row means no import has started. account_id has
-- no foreign key: connected_account belongs to the account module.
CREATE TABLE sync_checkpoint
(
    account_id         uuid        NOT NULL,
    -- The connector's cursor after the last stored page; null until the first page is stored.
    cursor             text,
    import_status      varchar(16) NOT NULL,
    import_range       varchar(16) NOT NULL,
    -- The moment the import reads from; null for the whole mailbox.
    import_since       timestamptz,
    imported_count     integer     NOT NULL DEFAULT 0,
    skipped_count      integer     NOT NULL DEFAULT 0,
    -- Messages imported by the run going on now, and when it began (a start, or going on after a restart): the
    -- speed behind the minutes left.
    run_imported_count integer     NOT NULL DEFAULT 0,
    run_started_at     timestamptz,
    -- The connector's estimate (D-65); bigint like the contract's OptionalLong.
    estimated_count    bigint,
    last_started_at    timestamptz,
    last_success_at    timestamptz,
    last_error_code    varchar(40),
    updated_at         timestamptz NOT NULL,
    CONSTRAINT sync_checkpoint_pk PRIMARY KEY (account_id),
    CONSTRAINT sync_checkpoint_status_ck CHECK (import_status IN ('RUNNING', 'DONE', 'FAILED')),
    CONSTRAINT sync_checkpoint_range_ck CHECK (import_range IN ('DAYS_30', 'DAYS_90', 'ALL'))
);

-- What to go on with when the application is ready again.
CREATE INDEX sync_checkpoint_running_idx ON sync_checkpoint (account_id) WHERE import_status = 'RUNNING';
