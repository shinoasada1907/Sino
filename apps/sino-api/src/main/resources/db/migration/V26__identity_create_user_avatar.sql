-- The picture of a Sino user (PI-03, D-477): at most one per user, kept as the bytes the web app cut and sent. A table
-- of its own, so reading a profile never pulls the bytes in; they are read only by GET /api/profile/avatar.
-- `content_type` is worked out by the application from the first bytes of the file, never from what the client said.
-- `sha256` is the 32 raw bytes of the digest of the file: it makes the ETag and the version in the picture's address.
-- The checks below are a floor under the application's: the application refuses a file above 1 MiB and a side above
-- 1024 px, but those limits may move, so the database only refuses what no avatar can be (2 MiB at most).
CREATE TABLE user_avatar
(
    user_id      uuid        NOT NULL,
    content      bytea       NOT NULL,
    content_type varchar(20) NOT NULL,
    sha256       bytea       NOT NULL,
    updated_at   timestamptz NOT NULL,
    CONSTRAINT user_avatar_pk PRIMARY KEY (user_id),
    CONSTRAINT user_avatar_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE,
    CONSTRAINT user_avatar_size_ck CHECK (octet_length(content) BETWEEN 1 AND 2097152),
    CONSTRAINT user_avatar_type_ck CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
    CONSTRAINT user_avatar_sha256_ck CHECK (octet_length(sha256) = 32)
);

-- Keep the bytes out of the row, so reading the digest or the type does not read the picture.
ALTER TABLE user_avatar ALTER COLUMN content SET STORAGE EXTERNAL;
