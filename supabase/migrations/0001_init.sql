-- =============================================================================
-- 0001_init.sql — Vouch night-shift handover persistence layer
-- =============================================================================
--
-- Design (see .claude/rules/grounding-discipline.md):
--   Normalized EVENTS are the persisted source of truth. Thread state
--   (still-open / newly-resolved / new-tonight), shifts, and flags are DERIVED
--   deterministically by lib/reconcile at read time — they are NEVER stored as
--   mutable rows. We persist only:
--     1. hotels        — tenant registry
--     2. events        — the normalized event store (idempotent upsert)
--     3. handover_runs — an immutable audit record, one per pipeline run
--
-- Multi-tenancy: RLS is tied to caller identity (the JWT `hotel_id` claim), so a
-- hotel-facing read path can only ever see its own rows. The server pipeline
-- writes with the SERVICE-ROLE key, which BYPASSES RLS (see policy comments).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- hotels — tenant registry
-- ---------------------------------------------------------------------------
create table if not exists hotels (
  id         text        primary key,
  name       text        not null,
  timezone   text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- events — the normalized event store (THE source of truth)
--
-- Columns mirror lib/schema.ts NormalizedEvent. The composite PRIMARY KEY
-- (hotel_id, id) makes re-ingesting the same source event an idempotent UPSERT:
-- the same night log can be replayed without producing duplicates.
-- ---------------------------------------------------------------------------
create table if not exists events (
  id                            text        not null,
  hotel_id                      text        not null references hotels(id),
  occurred_at                   timestamptz not null,
  category                      text        not null,
  room                          text,
  guest                         text,
  description                   text        not null,
  open_state                    text        not null,
  -- True if the source text embedded an instruction aimed at the tool/operator
  -- (prompt injection). Such events are FLAGGED downstream, never obeyed.
  contains_embedded_instruction boolean     not null default false,
  -- Full provenance (structured source id, or verbatim free-text span + lang).
  -- Stored as jsonb so the grounding trail survives verbatim.
  provenance                    jsonb       not null,
  created_at                    timestamptz not null default now(),
  primary key (hotel_id, id)
);

-- Reconciliation reads a hotel's events ordered by time; index that access path.
create index if not exists events_hotel_occurred_at_idx
  on events (hotel_id, occurred_at);

-- ---------------------------------------------------------------------------
-- handover_runs — immutable audit record, one row per pipeline run
--
-- Captures the full generated handover + grounding report + model usage so a
-- run is debuggable from the database alone ("why did this hotel see X on this
-- night") without rerunning the pipeline.
-- ---------------------------------------------------------------------------
create table if not exists handover_runs (
  id           uuid        primary key default gen_random_uuid(),
  hotel_id     text        not null references hotels(id),
  morning_date date,
  shift_id     text,
  -- The `asOf` the run was built for, kept as the original string (not lossily
  -- reformatted), mirroring how timestamps are handled end-to-end.
  as_of        text,
  generated_at timestamptz,
  handover     jsonb       not null,
  grounding    jsonb,
  model_usage  jsonb,
  created_at   timestamptz not null default now()
);

-- Audit lookups are by hotel + the morning a handover was for.
create index if not exists handover_runs_hotel_morning_idx
  on handover_runs (hotel_id, morning_date);

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- RLS is tied to CALLER IDENTITY: a hotel-facing client authenticates with a
-- JWT carrying a `hotel_id` claim, and can only ever touch rows for that hotel.
--
-- IMPORTANT: the server-side pipeline (lib/db) connects with the SUPABASE
-- SERVICE-ROLE key, which BYPASSES RLS entirely. So these policies do NOT
-- constrain the trusted server writer — they exist to constrain any
-- hotel-facing READ path that ever uses an anon/authenticated JWT. The
-- service-role key must remain server-only (never shipped to a client).
-- =============================================================================

alter table hotels        enable row level security;
alter table events        enable row level security;
alter table handover_runs enable row level security;

-- --- hotels -----------------------------------------------------------------
-- A caller may see only its own hotel row.
create policy hotels_select_own on hotels
  for select
  using ((auth.jwt() ->> 'hotel_id') = id);

-- A caller may register/update only its own hotel row.
create policy hotels_insert_own on hotels
  for insert
  with check ((auth.jwt() ->> 'hotel_id') = id);

-- --- events -----------------------------------------------------------------
-- A caller may read only events belonging to its hotel.
create policy events_select_own on events
  for select
  using ((auth.jwt() ->> 'hotel_id') = hotel_id);

-- A caller may insert events only for its hotel (defense in depth; normal writes
-- go through the service-role key, which bypasses this).
create policy events_insert_own on events
  for insert
  with check ((auth.jwt() ->> 'hotel_id') = hotel_id);

-- --- handover_runs ----------------------------------------------------------
-- A caller may read only its hotel's audit records.
create policy handover_runs_select_own on handover_runs
  for select
  using ((auth.jwt() ->> 'hotel_id') = hotel_id);

-- A caller may insert audit records only for its hotel.
create policy handover_runs_insert_own on handover_runs
  for insert
  with check ((auth.jwt() ->> 'hotel_id') = hotel_id);
