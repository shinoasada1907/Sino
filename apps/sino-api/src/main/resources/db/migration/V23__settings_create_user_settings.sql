-- The settings of a Sino user (settings-backend, D-401, D-404): at most one row per user, made by the user's first
-- change. A user without a row reads the defaults, which live in the application (Settings.DEFAULTS), and a read
-- writes nothing. Every setting has its own column; the six notification switches are six boolean columns.
-- The checks hold the values the API takes, so nothing the application accepts is refused here. The time zone is
-- checked by the application only (an IANA ID that java.time knows).
CREATE TABLE user_settings
(
    user_id                  uuid        NOT NULL,
    theme                    varchar(10) NOT NULL,
    date_format              varchar(10) NOT NULL,
    motion                   varchar(10) NOT NULL,
    notify_new_messages      boolean     NOT NULL,
    notify_important_only    boolean     NOT NULL,
    notify_sync_errors       boolean     NOT NULL,
    notify_new_registrations boolean     NOT NULL,
    notify_reminders         boolean     NOT NULL,
    notify_scheduled_failed  boolean     NOT NULL,
    quiet_hours_start        time,
    quiet_hours_end          time,
    time_zone                varchar(64) NOT NULL,
    morning_time             time        NOT NULL,
    default_reminder_minutes integer,
    week_start               varchar(10) NOT NULL,
    updated_at               timestamptz NOT NULL,
    CONSTRAINT user_settings_pk PRIMARY KEY (user_id),
    CONSTRAINT user_settings_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE,
    CONSTRAINT user_settings_theme_ck CHECK (theme IN ('SYSTEM', 'LIGHT', 'DARK')),
    CONSTRAINT user_settings_date_format_ck CHECK (date_format IN ('DMY', 'ISO', 'LONG')),
    CONSTRAINT user_settings_motion_ck CHECK (motion IN ('FULL', 'REDUCED', 'OFF')),
    -- No quiet hours is both times NULL; otherwise two different times, which may run past midnight (22:00-07:00).
    CONSTRAINT user_settings_quiet_hours_ck CHECK ((quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
        OR (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL AND quiet_hours_start <> quiet_hours_end)),
    CONSTRAINT user_settings_morning_time_ck CHECK (morning_time BETWEEN '05:00' AND '12:00'),
    -- NULL is "no reminder".
    CONSTRAINT user_settings_reminder_ck CHECK (default_reminder_minutes IN (5, 10, 15, 30, 60, 120, 1440)),
    CONSTRAINT user_settings_week_start_ck CHECK (week_start IN ('MONDAY', 'SUNDAY'))
);
