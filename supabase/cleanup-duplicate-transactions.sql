-- =============================================================================
-- เก็บกวาดแถวซ้ำที่เกิดจากบั๊ก "ออก UUID ใหม่แล้ว insert ทุกรอบ sync"
-- =============================================================================
-- ที่มา: SupabaseService.saveTransactions เดิม เมื่อ upsert ชนสิทธิ์ RLS จะสร้าง
-- UUID ใหม่แล้ว insert ทันที แต่ไม่เคยบอก localStorage ว่า id เปลี่ยน
-- รอบ sync ถัดไปจึงชนซ้ำแล้วแทรกใบใหม่อีก — ทุกครั้งที่เปิดแอป
-- ผลคือรายการเดิมมีหลายใบ ต่างกันแค่ id (และ created_at)
--
-- 🔴 วิธีใช้ (ห้ามข้ามขั้น)
--   1. รัน "ขั้นที่ 0" สำรองข้อมูลก่อน
--   2. รัน "ขั้นที่ 1" ดูว่าจะลบอะไรบ้าง — อ่านผลให้เข้าใจก่อน
--   3. ค่อยรัน "ขั้นที่ 2" ลบจริง
-- รันใน Supabase → SQL Editor (สิทธิ์ service role จึงข้าม RLS ได้)
-- =============================================================================


-- ── ขั้นที่ 0 · สำรองก่อนเสมอ ────────────────────────────────────────────────
-- ตารางสำรองนี้เก็บไว้ได้เรื่อย ๆ จนกว่าจะมั่นใจ แล้วค่อย DROP ทิ้งเอง
CREATE TABLE IF NOT EXISTS transactions_backup_before_dedupe AS
SELECT * FROM transactions;

SELECT count(*) AS "จำนวนแถวที่สำรองไว้" FROM transactions_backup_before_dedupe;


-- ── ขั้นที่ 1 · ดูก่อนว่าซ้ำแค่ไหน (ไม่แก้อะไร) ─────────────────────────────
-- นิยาม "ซ้ำ" = ผู้ใช้คนเดียวกัน ประเภท/จำนวนเงิน/หมวด/คำอธิบาย/วันที่ เหมือนกันทุกอย่าง
-- ต่างกันแค่ id เท่านั้น ซึ่งเป็นลายเซ็นของบั๊กนี้พอดี
WITH dupes AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, type, amount, category, coalesce(description, ''), date
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM transactions
)
SELECT
  (SELECT count(*) FROM transactions)              AS "แถวทั้งหมดตอนนี้",
  (SELECT count(*) FROM dupes WHERE rn > 1)        AS "แถวซ้ำที่จะถูกลบ",
  (SELECT count(*) FROM dupes WHERE rn = 1)        AS "แถวที่จะเหลือไว้";

-- อยากเห็นตัวอย่างของจริงก่อน ให้รันอันนี้
WITH dupes AS (
  SELECT *,
    row_number() OVER (
      PARTITION BY user_id, type, amount, category, coalesce(description, ''), date
      ORDER BY created_at NULLS LAST, id
    ) AS rn,
    count(*) OVER (
      PARTITION BY user_id, type, amount, category, coalesce(description, ''), date
    ) AS copies
  FROM transactions
)
SELECT date, type, amount, category, description, copies, rn, id, created_at
FROM dupes
WHERE copies > 1
ORDER BY copies DESC, date DESC, rn
LIMIT 50;


-- ── ขั้นที่ 2 · ลบจริง (เก็บใบเก่าสุดของแต่ละกลุ่มไว้) ──────────────────────
-- เก็บใบที่ created_at เก่าสุด เพราะนั่นคือใบที่ผู้ใช้บันทึกเองจริง ๆ
-- ใบที่ใหม่กว่าคือสำเนาที่บั๊กสร้างขึ้นในแต่ละรอบ sync
BEGIN;

WITH dupes AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, type, amount, category, coalesce(description, ''), date
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM transactions
)
DELETE FROM transactions t
USING dupes d
WHERE t.id = d.id AND d.rn > 1;

-- ตรวจผลก่อน commit — ถ้าตัวเลขไม่สมเหตุผลให้ ROLLBACK; แทน
SELECT count(*) AS "แถวที่เหลือหลังลบ" FROM transactions;

COMMIT;
-- ROLLBACK;   -- ← ใช้อันนี้แทน COMMIT ถ้าตัวเลขดูไม่ถูก


-- ── ขั้นที่ 3 · กันไม่ให้เกิดซ้ำอีกในระดับฐานข้อมูล (ทางเลือก แนะนำ) ────────
-- โค้ดฝั่งแอปแก้แล้ว แต่ดัชนีนี้เป็นตาข่ายชั้นสุดท้าย
-- ถ้ามีอะไรพยายามแทรกรายการที่เหมือนกันทุกอย่างของผู้ใช้คนเดิม จะถูกปฏิเสธทันที
-- 🔴 ต้องรันหลังขั้นที่ 2 เท่านั้น ไม่งั้นสร้างดัชนีไม่ผ่านเพราะยังมีของซ้ำอยู่
-- ⚠️ ถ้าผู้ใช้จงใจบันทึกรายการซ้ำจริง ๆ ได้ (เช่น ซื้อกาแฟแก้วละ 60 สองครั้งในวันเดียว
--    คำอธิบายเหมือนกัน) ดัชนีนี้จะบล็อกด้วย — ชั่งใจก่อนเปิดใช้
--
-- CREATE UNIQUE INDEX IF NOT EXISTS transactions_no_exact_duplicate
--   ON transactions (user_id, type, amount, category, coalesce(description, ''), date);


-- ── ขั้นที่ 4 · เมื่อมั่นใจแล้วค่อยทิ้งตารางสำรอง ───────────────────────────
-- DROP TABLE IF EXISTS transactions_backup_before_dedupe;
