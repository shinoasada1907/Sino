-- Tables of JobRunr 9.0.5 (background jobs of the reminders, RM-01, D-521): Flyway owns the schema, so JobRunr's own
-- creation is off (jobrunr.database.skip-create=true). Taken with pg_dump -s from a database JobRunr created itself;
-- raise JobRunr only together with a new migration of its changes.
CREATE TABLE public.jobrunr_backgroundjobservers (
    id character(36) NOT NULL,
    workerpoolsize integer NOT NULL,
    pollintervalinseconds integer NOT NULL,
    firstheartbeat timestamp(6) without time zone NOT NULL,
    lastheartbeat timestamp(6) without time zone NOT NULL,
    running integer NOT NULL,
    systemtotalmemory bigint NOT NULL,
    systemfreememory bigint NOT NULL,
    systemcpuload numeric(3,2) NOT NULL,
    processmaxmemory bigint NOT NULL,
    processfreememory bigint NOT NULL,
    processallocatedmemory bigint NOT NULL,
    processcpuload numeric(3,2) NOT NULL,
    deletesucceededjobsafter character varying(32),
    permanentlydeletejobsafter character varying(32),
    name character varying(128)
);
CREATE TABLE public.jobrunr_jobs (
    id character(36) NOT NULL,
    version integer NOT NULL,
    jobasjson text NOT NULL,
    jobsignature character varying(512) NOT NULL,
    state character varying(36) NOT NULL,
    createdat timestamp without time zone NOT NULL,
    updatedat timestamp without time zone NOT NULL,
    scheduledat timestamp without time zone,
    recurringjobid character varying(128)
);
CREATE TABLE public.jobrunr_metadata (
    id character varying(156) NOT NULL,
    name character varying(92) NOT NULL,
    owner character varying(64) NOT NULL,
    value text NOT NULL,
    createdat timestamp without time zone NOT NULL,
    updatedat timestamp without time zone NOT NULL
);
CREATE TABLE public.jobrunr_recurring_jobs (
    id character(128) NOT NULL,
    version integer NOT NULL,
    jobasjson text NOT NULL,
    createdat bigint DEFAULT '0'::bigint NOT NULL
);
CREATE VIEW public.jobrunr_jobs_stats AS
 WITH job_stat_results AS (
         SELECT jobrunr_jobs.state,
            count(*) AS count
           FROM public.jobrunr_jobs
          GROUP BY jobrunr_jobs.state
        )
 SELECT COALESCE(( SELECT sum(job_stat_results.count) AS sum
           FROM job_stat_results), (0)::numeric) AS total,
    COALESCE(( SELECT sum(job_stat_results.count) AS sum
           FROM job_stat_results
          WHERE ((job_stat_results.state)::text = 'AWAITING'::text)), (0)::numeric) AS awaiting,
    COALESCE(( SELECT sum(job_stat_results.count) AS sum
           FROM job_stat_results
          WHERE ((job_stat_results.state)::text = 'SCHEDULED'::text)), (0)::numeric) AS scheduled,
    COALESCE(( SELECT sum(job_stat_results.count) AS sum
           FROM job_stat_results
          WHERE ((job_stat_results.state)::text = 'ENQUEUED'::text)), (0)::numeric) AS enqueued,
    COALESCE(( SELECT sum(job_stat_results.count) AS sum
           FROM job_stat_results
          WHERE ((job_stat_results.state)::text = 'PROCESSING'::text)), (0)::numeric) AS processing,
    COALESCE(( SELECT sum(job_stat_results.count) AS sum
           FROM job_stat_results
          WHERE ((job_stat_results.state)::text = 'PROCESSED'::text)), (0)::numeric) AS processed,
    COALESCE(( SELECT sum(job_stat_results.count) AS sum
           FROM job_stat_results
          WHERE ((job_stat_results.state)::text = 'FAILED'::text)), (0)::numeric) AS failed,
    COALESCE(( SELECT sum(job_stat_results.count) AS sum
           FROM job_stat_results
          WHERE ((job_stat_results.state)::text = 'SUCCEEDED'::text)), (0)::numeric) AS succeeded,
    COALESCE(( SELECT ((jm.value)::character(10))::numeric(10,0) AS value
           FROM public.jobrunr_metadata jm
          WHERE ((jm.id)::text = 'succeeded-jobs-counter-cluster'::text)), (0)::numeric) AS alltimesucceeded,
    COALESCE(( SELECT sum(job_stat_results.count) AS sum
           FROM job_stat_results
          WHERE ((job_stat_results.state)::text = 'DELETED'::text)), (0)::numeric) AS deleted,
    ( SELECT count(*) AS count
           FROM public.jobrunr_backgroundjobservers) AS nbrofbackgroundjobservers,
    ( SELECT count(*) AS count
           FROM public.jobrunr_recurring_jobs) AS nbrofrecurringjobs;
CREATE TABLE public.jobrunr_migrations (
    id character(36) NOT NULL,
    script character varying(64) NOT NULL,
    installedon character varying(29) NOT NULL
);
ALTER TABLE ONLY public.jobrunr_backgroundjobservers
    ADD CONSTRAINT jobrunr_backgroundjobservers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.jobrunr_jobs
    ADD CONSTRAINT jobrunr_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.jobrunr_metadata
    ADD CONSTRAINT jobrunr_metadata_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.jobrunr_migrations
    ADD CONSTRAINT jobrunr_migrations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.jobrunr_recurring_jobs
    ADD CONSTRAINT jobrunr_recurring_jobs_pkey PRIMARY KEY (id);
CREATE INDEX jobrunr_bgjobsrvrs_fsthb_idx ON public.jobrunr_backgroundjobservers USING btree (firstheartbeat);
CREATE INDEX jobrunr_bgjobsrvrs_lsthb_idx ON public.jobrunr_backgroundjobservers USING btree (lastheartbeat);
CREATE INDEX jobrunr_job_created_at_idx ON public.jobrunr_jobs USING btree (createdat);
CREATE INDEX jobrunr_job_rci_idx ON public.jobrunr_jobs USING btree (recurringjobid);
CREATE INDEX jobrunr_job_scheduled_at_idx ON public.jobrunr_jobs USING btree (scheduledat);
CREATE INDEX jobrunr_job_signature_idx ON public.jobrunr_jobs USING btree (jobsignature);
CREATE INDEX jobrunr_jobs_state_updated_idx ON public.jobrunr_jobs USING btree (state, updatedat);
CREATE INDEX jobrunr_recurring_job_created_at_idx ON public.jobrunr_recurring_jobs USING btree (createdat);
CREATE INDEX jobrunr_state_idx ON public.jobrunr_jobs USING btree (state);
