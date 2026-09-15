-- ============================================================
-- MoneyMa — POS Growth Loop (ส่วนที่ต้องรันตอนนี้)
-- Supabase / Postgres
--
-- รันไฟล์นี้ก่อนร้านแรกออกใบเสร็จ ถ้ารันทีหลัง ใบเสร็จช่วงแรก
-- จะไม่มี token และข้อมูลช่วงที่มีค่าที่สุดจะหายถาวร
--
-- ไฟล์นี้ตั้งใจไม่รวมตาราง agent_* — ยังไม่ถึงเวลาใช้
-- ============================================================

-- ── 1) ร้านค้า ───────────────────────────────────────────────
do $$ begin
  create type merchant_stage as enum ('lead','contacted','trial','installed','active','churned');
exception when duplicate_object then null; end $$;

create table if not exists merchants (
  id              uuid primary key default gen_random_uuid(),
  -- 🔴 กุญแจของร้านคือ owner_user_id ไม่ใช่ merchant_code
  --    merchant_code เป็นรหัสสุ่มในเครื่อง เอาไว้อ่านด้วยตาและนำหน้า token
  --    ถ้าเอามันมาเป็น unique key สองร้านที่สุ่มได้รหัสเดียวกันจะรวมเป็นร้านเดียว
  merchant_code   text not null,
  owner_user_id   uuid not null unique references auth.users(id) on delete cascade,
  name            text not null,
  segment         text,                   -- 'coffee'|'food_stall'|'grocery'|'market'|'clinic'
  province        text,
  source          text,                   -- 'walk_in'|'referral'|'facebook_group'|'organic'
  stage           merchant_stage not null default 'lead',
  activated_at    timestamptz,            -- วันที่ออกใบเสร็จใบแรก (trigger เติมให้)
  last_receipt_at timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists merchants_stage_segment_idx on merchants (stage, segment);
create index if not exists merchants_code_idx on merchants (merchant_code);

-- ── 2) ใบเสร็จจาก POS ───────────────────────────────────────
create table if not exists pos_receipts (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants(id) on delete cascade,
  share_token   text not null unique,     -- ตัวเดียวกับที่อยู่ใน QR บนกระดาษ
  doc_no        text,
  total_amount  numeric(12,2) not null default 0,
  item_count    int not null default 0,
  issued_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists pos_receipts_merchant_idx on pos_receipts (merchant_id, issued_at desc);
create index if not exists pos_receipts_issued_idx   on pos_receipts (issued_at desc);

-- ใบเสร็จใบแรก = วัน activate ร้าน / ใบล่าสุด = ใช้วัดร้านหลุด
create or replace function touch_merchant_activity() returns trigger as $$
begin
  update merchants
     set activated_at    = coalesce(activated_at, new.issued_at),
         last_receipt_at = greatest(coalesce(last_receipt_at, new.issued_at), new.issued_at),
         stage           = case when stage in ('lead','contacted','trial','installed')
                                then 'active' else stage end
   where id = new.merchant_id;
  return new;
end $$ language plpgsql security definer set search_path = public;

drop trigger if exists pos_receipts_touch_merchant on pos_receipts;
create trigger pos_receipts_touch_merchant
  after insert on pos_receipts
  for each row execute function touch_merchant_activity();

-- ── 3) สิ่งที่เกิดขึ้นหลังลูกค้าสแกน QR = หัวใจของ loop ─────
create table if not exists receipt_attribution (
  id            uuid primary key default gen_random_uuid(),
  receipt_id    uuid not null references pos_receipts(id) on delete cascade,
  first_scan_at timestamptz not null default now(),
  last_scan_at  timestamptz not null default now(),
  scan_count    int not null default 1,
  platform      text,                     -- 'ios'|'android'|'web'
  store_click_at timestamptz,             -- กดปุ่มไปสโตร์ (ตัวชี้เจตนาที่วัดได้จริงบน iOS)
  installed_at  timestamptz,              -- แอปเปิดครั้งแรกพร้อม token นี้
  signed_up_at  timestamptz,
  user_id       uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (receipt_id)                     -- ใบเสร็จ 1 ใบ = 1 แถว สแกนซ้ำบวก scan_count
);

create index if not exists receipt_attr_installed_idx on receipt_attribution (installed_at);

-- ── 4) RPC ที่หน้า landing เรียก ────────────────────────────
-- 🔴 หน้า landing วิ่งด้วย anon key ซึ่งใครก็อ่านได้จาก view-source
--    จึงห้ามเปิดสิทธิ์ insert ตรงๆ ให้ anon — ให้เรียกผ่านฟังก์ชันนี้เท่านั้น
--    ฟังก์ชันคืนแค่ยอดเงินกับชื่อร้าน ไม่คืนรายการสินค้า ไม่คืน id ของใคร

create or replace function record_receipt_scan(p_token text, p_platform text default null)
returns table (shop_name text, total_amount numeric, issued_at timestamptz, item_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt pos_receipts%rowtype;
begin
  select * into v_receipt from pos_receipts where share_token = p_token;
  if not found then
    return;  -- token มั่ว -> ไม่คืนอะไร และไม่บอกว่าทำไม
  end if;

  insert into receipt_attribution (receipt_id, platform)
  values (v_receipt.id, p_platform)
  on conflict (receipt_id) do update
    set last_scan_at = now(),
        scan_count   = receipt_attribution.scan_count + 1,
        platform     = coalesce(receipt_attribution.platform, excluded.platform);

  return query
    select m.name, v_receipt.total_amount, v_receipt.issued_at, v_receipt.item_count
      from merchants m where m.id = v_receipt.merchant_id;
end $$;

-- กดปุ่ม "ไปโหลดแอป" — บน iOS นี่คือสัญญาณที่ใกล้ install ที่สุดที่วัดได้
create or replace function record_store_click(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update receipt_attribution a
     set store_click_at = coalesce(a.store_click_at, now())
    from pos_receipts r
   where r.share_token = p_token and a.receipt_id = r.id;
end $$;

-- แอปเปิดครั้งแรกพร้อม token (deep link moneyma://r/<token> หรือ Play install referrer)
create or replace function record_receipt_install(p_token text, p_user_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update receipt_attribution a
     set installed_at = coalesce(a.installed_at, now()),
         signed_up_at = case when p_user_id is not null
                             then coalesce(a.signed_up_at, now()) else a.signed_up_at end,
         user_id      = coalesce(a.user_id, p_user_id)
    from pos_receipts r
   where r.share_token = p_token and a.receipt_id = r.id;
end $$;

revoke all on function record_receipt_scan(text, text)   from public;
revoke all on function record_store_click(text)          from public;
revoke all on function record_receipt_install(text, uuid) from public;
grant execute on function record_receipt_scan(text, text)    to anon, authenticated;
grant execute on function record_store_click(text)           to anon, authenticated;
grant execute on function record_receipt_install(text, uuid) to anon, authenticated;

-- ── 5) RLS ──────────────────────────────────────────────────
alter table merchants           enable row level security;
alter table pos_receipts        enable row level security;
alter table receipt_attribution enable row level security;

-- เจ้าของร้านเห็นและแก้ได้เฉพาะร้านตัวเอง
drop policy if exists merchants_own on merchants;
create policy merchants_own on merchants
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ใบเสร็จ: เขียนได้เฉพาะร้านของตัวเอง
drop policy if exists receipts_own on pos_receipts;
create policy receipts_own on pos_receipts
  for all to authenticated
  using (exists (select 1 from merchants m where m.id = merchant_id and m.owner_user_id = auth.uid()))
  with check (exists (select 1 from merchants m where m.id = merchant_id and m.owner_user_id = auth.uid()));

-- attribution: ไม่มี policy ให้ client เลย เข้าถึงผ่าน RPC ข้างบนอย่างเดียว

-- ── 6) หน้าปัดที่ต้องดู ─────────────────────────────────────
-- 🔴 ตัวเลขเดียวที่ตัดสินว่า loop โตเองได้: install_per_receipt_pct
--    ต่ำกว่า 1% = ปัญหาอยู่ที่หน้า landing ไม่ใช่จำนวนร้าน
--    การเพิ่มร้านตอนนั้นคือขยายท่อที่ยังรั่วอยู่
create or replace view v_loop_health as
select
  date_trunc('week', r.issued_at)::date                as week,
  count(distinct r.merchant_id)                        as active_merchants,
  count(r.id)                                          as receipts,
  count(a.first_scan_at)                               as scans,
  count(a.store_click_at)                              as store_clicks,
  count(a.installed_at)                                as installs,
  round(100.0 * count(a.first_scan_at)  / nullif(count(r.id), 0), 2) as scan_rate_pct,
  round(100.0 * count(a.store_click_at) / nullif(count(r.id), 0), 2) as store_click_per_receipt_pct,
  round(100.0 * count(a.installed_at)   / nullif(count(r.id), 0), 2) as install_per_receipt_pct,
  round(count(r.id)::numeric / nullif(count(distinct r.merchant_id), 0), 1) as receipts_per_merchant
from pos_receipts r
left join receipt_attribution a on a.receipt_id = r.id
group by 1
order by 1 desc;

-- ร้านหลุดที่ 30 วันหรือไม่ — ร้านหลุด 1 ร้าน = ใบเสร็จหายทั้งสาย
create or replace view v_merchant_retention as
select
  date_trunc('month', activated_at)::date as cohort,
  count(*) as activated,
  count(*) filter (where last_receipt_at > activated_at + interval '7 days')  as alive_d7,
  count(*) filter (where last_receipt_at > activated_at + interval '30 days') as alive_d30,
  round(100.0 * count(*) filter (where last_receipt_at > activated_at + interval '30 days')
        / nullif(count(*), 0), 1) as d30_pct
from merchants
where activated_at is not null
group by 1
order by 1 desc;

-- รายร้าน — ใช้ตอนมี 10 ร้านแรก เพราะค่าเฉลี่ยยังไม่มีความหมายที่ n นี้
create or replace view v_merchant_detail as
select
  m.merchant_code,
  m.name,
  m.segment,
  m.stage,
  m.activated_at::date                                as activated_on,
  m.last_receipt_at::date                             as last_receipt_on,
  count(r.id)                                         as receipts_total,
  count(r.id) filter (where r.issued_at > now() - interval '7 days') as receipts_7d,
  count(a.installed_at)                               as installs,
  case when m.last_receipt_at < now() - interval '3 days'
       then 'เงียบเกิน 3 วัน — โทรหา' else 'ยังใช้อยู่' end as flag
from merchants m
left join pos_receipts r        on r.merchant_id = m.id
left join receipt_attribution a on a.receipt_id  = r.id
group by m.id
order by m.last_receipt_at desc nulls last;
