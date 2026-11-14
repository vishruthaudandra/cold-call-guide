-- Run this in the Supabase SQL editor.
create extension if not exists pgcrypto;

create table if not exists calls (
  id              uuid primary key default gen_random_uuid(),
  prospect_label  text not null,                 -- e.g. "Dev ji, Kalpana Chem (T001)"
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  current_stage   int  not null default 1 check (current_stage between 1 and 8),
  furthest_stage  int  not null default 1 check (furthest_stage between 1 and 8),
  outcome         text,                          -- one of the outcome values in stages.json
  need_words      text,                          -- prospect's own words from stage 5
  next_step_note  text                           -- what was agreed, e.g. "WhatsApp report + call Thu"
);

create table if not exists stage_results (
  id              uuid primary key default gen_random_uuid(),
  call_id         uuid not null references calls(id) on delete cascade,
  stage           int  not null check (stage between 1 and 8),
  what_happened   text,                          -- the tap
  prospect_words  text,                          -- the free-text box
  llm_suggestion  text,
  created_at      timestamptz not null default now(),
  unique (call_id, stage)
);

create index if not exists calls_started_idx on calls (started_at desc);
