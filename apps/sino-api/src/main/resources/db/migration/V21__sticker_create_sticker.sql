-- The sticker library of a Sino user (ST-01, change custom-stickers): images the user uploaded to keep, PNG, GIF or
-- WebP (D-329). The metadata and the bytes are two tables (D-331): a list of the stickers reads `sticker` only, so
-- the bytes of every image are never pulled in to draw a grid; the bytes are read for one sticker at a time.
-- `kind` is worked out by the application from the file (a GIF with one frame is STATIC), never given by the user.
-- `sha256` is the 32 raw bytes of the digest of the file (compact, and what MessageDigest returns); the unique index
-- on (user_id, sha256) is what really stops the same image from being kept twice by one owner (DN-2), whatever two
-- uploads at the same time do in the application.
-- The checks below are a floor under the application's (the same idea as `note`): the application refuses a file
-- above 1 MiB (DN-1) and a side above 1024 px, but those limits live in the configuration and may move, so the
-- database only refuses what no sticker can be (10 MiB in a bytea column would be a mistake, a side of 16384 px is
-- more than WebP can say). varchar(50) counts characters (code points), and btrim removes spaces only, so nothing
-- the application accepts as a name is refused here; the type is also what limits the length of a name.
CREATE TABLE sticker
(
    id         uuid         NOT NULL,
    user_id    uuid         NOT NULL,
    name       varchar(50)  NOT NULL,
    media_type varchar(20)  NOT NULL,
    kind       varchar(10)  NOT NULL,
    width      integer      NOT NULL,
    height     integer      NOT NULL,
    size_bytes bigint       NOT NULL,
    sha256     bytea        NOT NULL,
    created_at timestamptz  NOT NULL,
    CONSTRAINT sticker_pk PRIMARY KEY (id),
    CONSTRAINT sticker_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id),
    CONSTRAINT sticker_user_sha256_uq UNIQUE (user_id, sha256),
    CONSTRAINT sticker_name_ck CHECK (btrim(name) <> ''),
    CONSTRAINT sticker_media_type_ck CHECK (media_type IN ('image/png', 'image/gif', 'image/webp')),
    CONSTRAINT sticker_kind_ck CHECK (kind IN ('STATIC', 'ANIMATED')),
    CONSTRAINT sticker_dimensions_ck CHECK (width BETWEEN 1 AND 16383 AND height BETWEEN 1 AND 16383),
    CONSTRAINT sticker_size_ck CHECK (size_bytes BETWEEN 1 AND 10485760),
    CONSTRAINT sticker_sha256_ck CHECK (octet_length(sha256) = 32)
);

-- The stickers of a user, newest first (GET /api/stickers).
CREATE INDEX sticker_user_created_idx ON sticker (user_id, created_at DESC);

-- The bytes of one sticker, read only by GET /api/stickers/{id}/content. Deleting the sticker deletes its bytes.
CREATE TABLE sticker_content
(
    sticker_id uuid  NOT NULL,
    content    bytea NOT NULL,
    CONSTRAINT sticker_content_pk PRIMARY KEY (sticker_id),
    CONSTRAINT sticker_content_sticker_fk FOREIGN KEY (sticker_id) REFERENCES sticker (id) ON DELETE CASCADE,
    CONSTRAINT sticker_content_size_ck CHECK (octet_length(content) BETWEEN 1 AND 10485760)
);

-- PNG, GIF and WebP are compressed already: EXTERNAL keeps a large value out of line (TOAST) without trying to
-- compress it again, which costs time and saves nothing.
ALTER TABLE sticker_content ALTER COLUMN content SET STORAGE EXTERNAL;
