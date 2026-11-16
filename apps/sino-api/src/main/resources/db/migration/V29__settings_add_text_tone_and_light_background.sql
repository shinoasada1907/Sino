-- Two more looks of the web per user (fe-ui-sunset, D-493, D-494): whether the text is tinted by the palette or neutral,
-- and whether the light theme's background is tinted or near white. Added like V28, so a row made before reads TINTED
-- for both.
ALTER TABLE user_settings
    ADD COLUMN text_tone        varchar(10) NOT NULL DEFAULT 'TINTED',
    ADD COLUMN light_background varchar(10) NOT NULL DEFAULT 'TINTED',
    ADD CONSTRAINT user_settings_text_tone_ck CHECK (text_tone IN ('TINTED', 'NEUTRAL')),
    ADD CONSTRAINT user_settings_light_background_ck CHECK (light_background IN ('TINTED', 'WHITE'));
