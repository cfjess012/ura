-- Phase 2 · conversation state, behind the session seam (SPEC §6.1).
--
-- Shaped for an AgentCore Memory swap: a conversation is an ordered list of
-- turns keyed by a conversation id, and nothing reads it except
-- src/lib/session.ts. The columns are deliberately the ones a memory service
-- also has — who spoke, when, what was said — so moving to AgentCore Memory
-- changes the implementation behind the interface and not its shape.
--
-- Insert-only, like every other record of what happened here (§5.1).
create table conversation_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  project_id uuid not null references projects(id) on delete cascade,
  -- 'person' or 'agent'. Never a model name: which model said it is a
  -- detail of the agent service, and this table is not where that leaks in.
  speaker text not null,
  -- What was said, as text. Structured proposals are recorded as answers
  -- and findings in their own tables when a person confirms them — a draft
  -- that was never confirmed is conversation, not evidence.
  said text not null,
  said_at timestamptz not null default now(),
  constraint conversation_turns_speaker check (speaker in ('person', 'agent')),
  constraint conversation_turns_said_present check (length(btrim(said)) > 0)
);

create index conversation_turns_by_conversation
  on conversation_turns (conversation_id, said_at);
create index conversation_turns_by_project on conversation_turns (project_id, said_at);

create trigger conversation_turns_no_update before update on conversation_turns
  for each row execute function evidence_is_insert_only();
create trigger conversation_turns_no_delete before delete on conversation_turns
  for each row execute function evidence_is_insert_only();
