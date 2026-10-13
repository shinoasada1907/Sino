-- Tasks of a Sino user (BE-71, F16). A due is a moment (due_at) or a whole day (due_date), never both. A repeating
-- task keeps its rule in the rec_* columns (D-152); the next occurrence is a new row made when this one is done, in
-- the same series (series_id, occurrence_index from 0), and next_created keeps a task from making it twice when it is
-- done, opened again and done again (D-159). rec_time_zone is the zone the rule was made in (D-157).
CREATE TABLE task
(
    id               uuid         NOT NULL,
    user_id          uuid         NOT NULL,
    title            varchar(200) NOT NULL,
    notes            text,
    due_at           timestamptz,
    due_date         date,
    status           varchar(8)   NOT NULL,
    completed_at     timestamptz,
    series_id        uuid,
    occurrence_index integer      NOT NULL DEFAULT 0,
    next_created     boolean      NOT NULL DEFAULT false,
    rec_freq         varchar(8),
    rec_interval     integer,
    rec_by_weekdays  varchar(64),
    rec_by_month_day integer,
    rec_until_date   date,
    rec_count        integer,
    rec_time_zone    varchar(64),
    created_at       timestamptz  NOT NULL,
    updated_at       timestamptz  NOT NULL,
    version          bigint       NOT NULL,
    CONSTRAINT task_pk PRIMARY KEY (id),
    CONSTRAINT task_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id),
    CONSTRAINT task_notes_length_ck CHECK (char_length(notes) <= 20000),
    CONSTRAINT task_one_due_ck CHECK (due_at IS NULL OR due_date IS NULL),
    CONSTRAINT task_status_ck CHECK (status IN ('OPEN', 'DONE')),
    CONSTRAINT task_completed_ck CHECK ((status = 'DONE') = (completed_at IS NOT NULL)),
    CONSTRAINT task_occurrence_index_ck CHECK (occurrence_index >= 0),
    -- A rule is whole or absent, and only a task with a due repeats.
    CONSTRAINT task_recurrence_ck CHECK (
        (rec_freq IS NULL AND rec_interval IS NULL AND rec_by_weekdays IS NULL AND rec_by_month_day IS NULL
            AND rec_until_date IS NULL AND rec_count IS NULL AND rec_time_zone IS NULL)
        OR (rec_freq IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')
            AND rec_interval BETWEEN 1 AND 99
            AND rec_time_zone IS NOT NULL
            AND (due_at IS NOT NULL OR due_date IS NOT NULL)
            AND (rec_until_date IS NULL OR rec_count IS NULL)
            AND (rec_count IS NULL OR rec_count BETWEEN 1 AND 999)
            AND ((rec_freq = 'WEEKLY') = (rec_by_weekdays IS NOT NULL))
            -- A monthly or yearly rule keeps its first day, or 31 -> 30/11 would never come back to 31.
            AND ((rec_freq IN ('MONTHLY', 'YEARLY')) = (rec_by_month_day IS NOT NULL))
            AND (rec_by_month_day IS NULL OR rec_by_month_day BETWEEN 1 AND 31))),
    CONSTRAINT task_series_ck CHECK (rec_freq IS NULL OR series_id IS NOT NULL)
);

-- The list of a user: open tasks and those done in the last days (GET /api/tasks).
CREATE INDEX task_user_status_idx ON task (user_id, status);
CREATE INDEX task_user_completed_idx ON task (user_id, completed_at) WHERE status = 'DONE';
-- Tasks due in a range of days, for the calendar (BE-74).
CREATE INDEX task_user_due_at_idx ON task (user_id, due_at) WHERE due_at IS NOT NULL;
CREATE INDEX task_user_due_date_idx ON task (user_id, due_date) WHERE due_date IS NOT NULL;
