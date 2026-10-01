-- Event Publication Registry of Spring Modulith 2.1.x (JPA entity DefaultJpaEventPublication).
-- Columns must match what Hibernate validates (spring.jpa.hibernate.ddl-auto=validate).
CREATE TABLE event_publication
(
    id                     uuid        NOT NULL,
    publication_date       timestamptz NOT NULL,
    listener_id            text        NOT NULL,
    event_type             text        NOT NULL,
    -- Serialized events can be longer than 255 characters.
    serialized_event       text        NOT NULL,
    completion_date        timestamptz,
    last_resubmission_date timestamptz,
    completion_attempts    integer     NOT NULL DEFAULT 0,
    status                 varchar(20),
    CONSTRAINT event_publication_pk PRIMARY KEY (id)
);

-- Lookup of publications that are not completed yet.
CREATE INDEX event_publication_completion_date_idx ON event_publication (completion_date);
