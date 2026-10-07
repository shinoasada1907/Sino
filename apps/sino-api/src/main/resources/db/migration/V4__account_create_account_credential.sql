-- Credentials of connected accounts (BE-13, D-14): one row per account, secrets encrypted by the application
-- (D-11). The whole row is always rewritten with the active key, so encryption_key_id is true for every value.
CREATE TABLE account_credential
(
    id                uuid        NOT NULL,
    account_id        uuid        NOT NULL,
    credential_type   varchar(20) NOT NULL,
    access_token_enc  text        NOT NULL,
    refresh_token_enc text,
    expires_at        timestamptz,
    scopes            jsonb       NOT NULL DEFAULT '[]',
    encryption_key_id varchar(32) NOT NULL,
    created_at        timestamptz NOT NULL,
    updated_at        timestamptz NOT NULL,
    version           bigint      NOT NULL,
    CONSTRAINT account_credential_pk PRIMARY KEY (id),
    CONSTRAINT account_credential_account_uk UNIQUE (account_id),
    CONSTRAINT account_credential_account_fk
        FOREIGN KEY (account_id) REFERENCES connected_account (id) ON DELETE CASCADE,
    CONSTRAINT account_credential_type_ck CHECK (credential_type IN ('OAUTH2', 'TOKEN'))
);
