-- Connected accounts (BE-11): one account of one provider that belongs to a Sino user.
CREATE TABLE connected_account
(
    id                  uuid         NOT NULL,
    user_id             uuid         NOT NULL,
    provider            varchar(32)  NOT NULL,
    external_account_id varchar(255) NOT NULL,
    display_name        varchar(100) NOT NULL,
    avatar_url          text,
    status              varchar(20)  NOT NULL,
    sync_enabled        boolean      NOT NULL DEFAULT true,
    last_synced_at      timestamptz,
    created_at          timestamptz  NOT NULL,
    updated_at          timestamptz  NOT NULL,
    version             bigint       NOT NULL,
    CONSTRAINT connected_account_pk PRIMARY KEY (id),
    CONSTRAINT connected_account_user_fk FOREIGN KEY (user_id) REFERENCES app_user (id),
    -- One row per provider account of a user. user_id comes first, so the index also serves "accounts of a user".
    CONSTRAINT connected_account_user_provider_external_uk UNIQUE (user_id, provider, external_account_id),
    CONSTRAINT connected_account_status_ck
        CHECK (status IN ('CONNECTED', 'DEGRADED', 'AUTH_EXPIRED', 'ERROR', 'DISABLED'))
);
