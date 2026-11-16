-- Profile fields of a Sino user (PI-01, D-478, DN-1 A). All four are optional and NULL when the user has not set one;
-- the application stores a value trimmed, and an empty one as NULL.
-- The checks below are a floor under the application's: btrim removes spaces only and char_length counts code points,
-- so nothing the application accepts is refused here. The phone number's characters are checked by the application only.
ALTER TABLE app_user
    ADD COLUMN phone_number varchar(30),
    ADD COLUMN job_title    varchar(100),
    ADD COLUMN location     varchar(100),
    ADD COLUMN bio          varchar(500),
    ADD CONSTRAINT app_user_phone_number_ck CHECK (phone_number IS NULL OR btrim(phone_number) <> ''),
    ADD CONSTRAINT app_user_job_title_ck CHECK (job_title IS NULL OR btrim(job_title) <> ''),
    ADD CONSTRAINT app_user_location_ck CHECK (location IS NULL OR btrim(location) <> ''),
    ADD CONSTRAINT app_user_bio_ck CHECK (bio IS NULL OR btrim(bio) <> ''),
    ADD CONSTRAINT app_user_display_name_ck CHECK (btrim(display_name) <> '');
