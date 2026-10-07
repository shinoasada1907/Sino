-- Users of Sino (BE-09, D-10 A). In the MVP there is exactly one: the owner configured in sino.owner.*,
-- upserted by email at startup.
CREATE TABLE app_user
(
    id           uuid         NOT NULL,
    email        varchar(320) NOT NULL,
    display_name varchar(200) NOT NULL,
    status       varchar(20)  NOT NULL,
    created_at   timestamptz  NOT NULL,
    updated_at   timestamptz  NOT NULL,
    CONSTRAINT app_user_pk PRIMARY KEY (id),
    CONSTRAINT app_user_email_uk UNIQUE (email),
    CONSTRAINT app_user_status_ck CHECK (status IN ('ACTIVE', 'DISABLED'))
);
