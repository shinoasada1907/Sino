-- Sticker packs (SP-01, change sticker-packs, D-340): named groups of the stickers of one user, like the packs of Zalo.
-- A sticker is in at most one pack; pack_id NULL is "no pack yet", so the stickers kept before this migration need no
-- backfill. The pack of a sticker belongs to the owner of the sticker: the foreign key covers (pack_id, user_id), so the
-- database itself refuses a sticker in the pack of another user, and it needs the UNIQUE (id, user_id) of sticker_pack
-- as its target. Deleting a pack keeps its stickers (DN-1): SET NULL (pack_id) clears the pack and leaves user_id.
-- A name is not used twice by one owner whatever its case (DN-6), which only a unique index on lower(name) can say;
-- the application checks first to give a clear error, the index is what holds. How many packs an owner may have is
-- the application's (sino.stickers.max-packs-per-owner), counted, not locked, like the stickers.
CREATE TABLE sticker_pack
(
    id         uuid        NOT NULL,
    user_id    uuid        NOT NULL,
    name       varchar(50) NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT sticker_pack_pk PRIMARY KEY (id),
    CONSTRAINT sticker_pack_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id),
    CONSTRAINT sticker_pack_id_user_uq UNIQUE (id, user_id),
    CONSTRAINT sticker_pack_name_ck CHECK (btrim(name) <> '')
);

-- One name per owner whatever its case; it also serves the list of the packs of an owner.
CREATE UNIQUE INDEX sticker_pack_user_name_uq ON sticker_pack (user_id, lower(name));

ALTER TABLE sticker ADD COLUMN pack_id uuid;

ALTER TABLE sticker
    ADD CONSTRAINT sticker_pack_fk FOREIGN KEY (pack_id, user_id)
        REFERENCES sticker_pack (id, user_id) ON DELETE SET NULL (pack_id);

-- The stickers of a pack, and the counts and covers of the packs of an owner (GET /api/sticker-packs).
CREATE INDEX sticker_user_pack_idx ON sticker (user_id, pack_id);
