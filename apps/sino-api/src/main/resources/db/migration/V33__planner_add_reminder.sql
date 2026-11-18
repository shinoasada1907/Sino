-- Reminders of appointments and tasks (RM-01, D-523, D-522, D-524, D-527).
--
-- reminder_offset_minutes: minutes before the start (the due) when the reminder fires. A timed appointment or task
-- allows 0, 5, 15, 30, 60 and 1440; a whole-day one (and a task with only a date) allows -540 (9:00 that day, so the
-- offset counts from 00:00) and 900 (9:00 the day before). A task without a due has no reminder.
-- reminder_rev: the revision of the background job of the row; it goes up each time the job is booked again, because
-- JobRunr takes a job id once and skips a later job with the same id (RM-00).
ALTER TABLE calendar_event
    ADD COLUMN reminder_offset_minutes integer,
    ADD COLUMN reminder_rev            integer NOT NULL DEFAULT 0,
    ADD CONSTRAINT calendar_event_reminder_ck CHECK (
        reminder_offset_minutes IS NULL
        OR (starts_at IS NOT NULL AND reminder_offset_minutes IN (0, 5, 15, 30, 60, 1440))
        OR (start_date IS NOT NULL AND reminder_offset_minutes IN (-540, 900)));

ALTER TABLE task
    ADD COLUMN reminder_offset_minutes integer,
    ADD COLUMN reminder_rev            integer NOT NULL DEFAULT 0,
    ADD CONSTRAINT task_reminder_ck CHECK (
        reminder_offset_minutes IS NULL
        OR (due_at IS NOT NULL AND reminder_offset_minutes IN (0, 5, 15, 30, 60, 1440))
        OR (due_date IS NOT NULL AND reminder_offset_minutes IN (-540, 900)));

-- One row for each occurrence that fired (the unique key stops a second one, D-524) and the list of the bell (D-527).
CREATE TABLE reminder_delivery
(
    id              uuid         NOT NULL,
    owner_id        uuid         NOT NULL,
    kind            varchar(16)  NOT NULL,
    item_id         uuid         NOT NULL,
    occurrence_date date         NOT NULL,
    title           varchar(200) NOT NULL,
    remind_at       timestamptz  NOT NULL,
    fired_at        timestamptz  NOT NULL,
    email_status    varchar(16)  NOT NULL,
    read_at         timestamptz,
    CONSTRAINT reminder_delivery_pk PRIMARY KEY (id),
    CONSTRAINT reminder_delivery_owner_fk FOREIGN KEY (owner_id) REFERENCES app_user (id),
    CONSTRAINT reminder_delivery_kind_ck CHECK (kind IN ('EVENT', 'TASK')),
    CONSTRAINT reminder_delivery_email_status_ck CHECK (
        email_status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED_LATE', 'DISABLED', 'OFF')),
    CONSTRAINT reminder_delivery_occurrence_uq UNIQUE (owner_id, kind, item_id, occurrence_date)
);

CREATE INDEX reminder_delivery_owner_fired_idx ON reminder_delivery (owner_id, fired_at DESC);
