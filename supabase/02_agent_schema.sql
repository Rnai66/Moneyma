-- ============================================================
-- MoneyMa — Agent layer
--
-- 🔴 อย่ารันไฟล์นี้จนกว่าจะถึงเกณฑ์ในหัวไฟล์ orchestrator.ts
--    (ราว 20-30 ร้าน active หรือ 500+ ใบเสร็จ/วัน)
--    ก่อนหน้านั้นตารางพวกนี้จะมีแต่แถวที่เขียนว่า "ข้อมูลไม่พอ"
--
-- ต้องรัน 01_loop_schema.sql ก่อน
-- ============================================================

do $$ begin
  create type agent_status as enum (
    'queued',
    'running',
    'awaiting_human',  -- รอคนกดอนุมัติ
    'approved',
    'rejected',
    'published',
    'failed'
  );
exception when duplicate_object then null; end $$;

-- รอบการทำงาน (สัปดาห์ละ 1 รอบ)
create table if not exists agent_cycles (
  id          uuid primary key default gen_random_uuid(),
  week_start  date not null unique,
  goal        text not null,     -- เป้าเดียวของสัปดาห์ เขียนเป็นตัวเลขเสมอ
  metrics_in  jsonb,             -- snapshot ตอนเริ่มรอบ
  bottleneck  text,              -- Analytics ชี้ว่าคอขวดอยู่ไหน
  verdict     text,              -- สรุปตอนปิดรอบ
  created_at  timestamptz not null default now()
);

create table if not exists agent_runs (
  id            uuid primary key default gen_random_uuid(),
  agent         text not null,
  task          text not null,
  input         jsonb not null default '{}'::jsonb,
  output        jsonb,
  status        agent_status not null default 'queued',
  needs_human   boolean not null default true,
  human_note    text,             -- เหตุผลตอนกด reject — ใช้สอน prompt รอบหน้า
  model_used    text,
  tokens_in     int,
  tokens_out    int,
  cost_usd      numeric(10,5),
  error         text,
  attempts      int not null default 0,   -- กัน job พังวนซ้ำไม่รู้จบ
  parent_run_id uuid references agent_runs(id) on delete set null,
  cycle_id      uuid references agent_cycles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

create index if not exists agent_runs_status_idx on agent_runs (status, agent);
create index if not exists agent_runs_cycle_idx  on agent_runs (cycle_id);
create index if not exists agent_runs_created_idx on agent_runs (created_at desc);

-- ── ต้นทุนรายสัปดาห์ ───────────────────────────────────────
-- 🔴 ดูคอลัมน์ rejected ทุกสัปดาห์: ถ้า agent ตัวไหนถูกปัดตกเกินครึ่ง
--    แปลว่า prompt มันผิด ไม่ใช่ว่าคุณขี้เกียจอนุมัติ — แก้ prompt หรือปิดมันทิ้ง
create or replace view v_agent_cost as
select
  date_trunc('week', created_at)::date as week,
  agent,
  count(*)                                        as runs,
  count(*) filter (where status = 'rejected')     as rejected,
  count(*) filter (where status = 'failed')       as failed,
  round(sum(cost_usd), 2)                         as cost_usd,
  round(100.0 * count(*) filter (where status = 'rejected')
        / nullif(count(*), 0), 0)                 as reject_pct
from agent_runs
group by 1, 2
order by 1 desc, 6 desc nulls last;

-- คิวที่รอคุณกดอนุมัติ — เปิดดูอันนี้อันเดียวตอนเช้า
create or replace view v_awaiting_human as
select
  r.id,
  r.agent,
  r.task,
  r.output -> 'parsed' as result,
  r.created_at,
  c.goal as cycle_goal
from agent_runs r
left join agent_cycles c on c.id = r.cycle_id
where r.status = 'awaiting_human'
order by r.created_at;

-- agent layer ใช้ service_role key จากเครื่องที่บ้านเท่านั้น
-- ไม่มี client ตัวไหนแตะ จึงปิด RLS ทิ้งไปเลยแล้วไม่สร้าง policy ใด ๆ
alter table agent_runs   enable row level security;
alter table agent_cycles enable row level security;
