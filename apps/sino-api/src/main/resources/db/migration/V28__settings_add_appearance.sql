-- The look of the web per user (fe-ui-sunset, D-490): the colour palette, an optional accent colour of the user's own,
-- the corner radius and the decorative patterns. Added to user_settings like every other setting, so a row made before
-- this migration reads the defaults (SAKURA, no accent colour, SOFT, patterns on). accent_color NULL is "no colour of
-- the user's own"; the check holds the #RRGGBB form the API takes.
ALTER TABLE user_settings
    ADD COLUMN palette      varchar(10) NOT NULL DEFAULT 'SAKURA',
    ADD COLUMN accent_color varchar(7),
    ADD COLUMN corners      varchar(10) NOT NULL DEFAULT 'SOFT',
    ADD COLUMN decorations  boolean     NOT NULL DEFAULT true,
    ADD CONSTRAINT user_settings_palette_ck CHECK (palette IN ('SAKURA', 'SUNSET', 'MINT', 'LAVENDER', 'MONO')),
    ADD CONSTRAINT user_settings_accent_color_ck CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
    ADD CONSTRAINT user_settings_corners_ck CHECK (corners IN ('SOFT', 'COMPACT'));
