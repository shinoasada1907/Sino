-- Appointments of a Sino user (BE-73, F17). The time is a timed span (starts_at, ends_at) or whole days (start_date,
-- end_date, the end not included), never both and never half of one; an appointment lasts at most 14 days, so the
-- calendar can find the occurrences that began before a range and still reach into it (BE-74). A repeating
-- appointment keeps its rule in the rec_* columns (D-152) and is one row for the whole series: edit and delete apply
-- to every occurrence (D-151). rec_time_zone is the zone the rule was made in (D-157).
CREATE TABLE calendar_event
(
    id               uuid         NOT NULL,
    user_id          uuid         NOT NULL,
    title            varchar(200) NOT NULL,
    location         varchar(200),
    notes            text,
    starts_at        timestamptz,
    ends_at          timestamptz,
    start_date       date,
    end_date         date,
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
    CONSTRAINT calendar_event_pk PRIMARY KEY (id),
    CONSTRAINT calendar_event_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id),
    CONSTRAINT calendar_event_notes_length_ck CHECK (char_length(notes) <= 20000),
    -- Exactly one kind of time, whole; the end is after the start and the span is at most 14 days.
    CONSTRAINT calendar_event_time_ck CHECK (
        (starts_at IS NOT NULL AND ends_at IS NOT NULL AND start_date IS NULL AND end_date IS NULL
            AND ends_at > starts_at AND ends_at - starts_at <= interval '14 days')
        OR (start_date IS NOT NULL AND end_date IS NOT NULL AND starts_at IS NULL AND ends_at IS NULL
            AND end_date > start_date AND end_date - start_date <= 14)),
    -- A rule is whole or absent.
    CONSTRAINT calendar_event_recurrence_ck CHECK (
        (rec_freq IS NULL AND rec_interval IS NULL AND rec_by_weekdays IS NULL AND rec_by_month_day IS NULL
            AND rec_until_date IS NULL AND rec_count IS NULL AND rec_time_zone IS NULL)
        OR (rec_freq IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')
            AND rec_interval BETWEEN 1 AND 99
            AND rec_time_zone IS NOT NULL
            AND (rec_until_date IS NULL OR rec_count IS NULL)
            AND (rec_count IS NULL OR rec_count BETWEEN 1 AND 999)
            AND ((rec_freq = 'WEEKLY') = (rec_by_weekdays IS NOT NULL))
            AND ((rec_freq IN ('MONTHLY', 'YEARLY')) = (rec_by_month_day IS NOT NULL))
            AND (rec_by_month_day IS NULL OR rec_by_month_day BETWEEN 1 AND 31)))
);

-- Non-repeating appointments meeting a range of days, for the calendar (BE-74).
CREATE INDEX calendar_event_user_starts_idx ON calendar_event (user_id, starts_at) WHERE starts_at IS NOT NULL;
CREATE INDEX calendar_event_user_start_date_idx ON calendar_event (user_id, start_date) WHERE start_date IS NOT NULL;
-- The repeating appointments of a user are few, and all of them are read for a range.
CREATE INDEX calendar_event_user_repeat_idx ON calendar_event (user_id) WHERE rec_freq IS NOT NULL;
