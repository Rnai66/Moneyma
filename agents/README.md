# agents/ — ระบบ AI ของ MoneyMa

## สถานะตอนนี้: รันได้ตัวเดียว

| ไฟล์ | รันได้เมื่อไหร่ |
|---|---|
| `onboarding.ts` | **ตอนนี้** — ตั้งแต่ร้านที่ 1 |
| `orchestrator.ts` | เมื่อมีร้าน active ≥ 10 ร้าน **และ** ใบเสร็จ ≥ 500 ใบ/สัปดาห์ |

`orchestrator.ts plan` มีด่านตรวจในตัว ถ้ายังไม่ถึงเกณฑ์มันจะปฏิเสธการวางแผนเอง
และบอกว่าควรไปทำอะไรแทน — **ไม่ต้องไปปิดด่านนั้น** มันคือกันไม่ให้คุณจ่ายค่า API
เพื่อซื้อความรู้สึกว่ากำลังทำงานหนัก

### ทำไมถึงตั้งเกณฑ์ไว้ตรงนั้น

ตัวเลขที่ทั้งระบบหมุนรอบคือ `install_per_receipt_pct` ถ้าจะแยกให้ออกว่ามันคือ 1%
หรือ 2% ต้องมีใบเสร็จสะสมราว 2,000–3,000 ใบ ต่ำกว่านั้นความต่างที่เห็นคือความบังเอิญ
agent จะให้คำตอบที่ฟังดูมีเหตุผลแต่ผิด ซึ่งอันตรายกว่าไม่มีคำตอบเลย

---

## ติดตั้ง

```bash
cd agents
npm init -y
npm i ai @ai-sdk/anthropic @ai-sdk/google @supabase/supabase-js tsx
```

`.env` (อย่า commit):

```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...          # service_role — อยู่บนเครื่องที่บ้านเท่านั้น
ANTHROPIC_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
MODEL_BULK=...                    # เช็ค id ล่าสุดจาก docs ของแต่ละเจ้า อย่า hardcode
MODEL_REASON=...
WEEKLY_BUDGET_USD=5
```

---

## onboarding agent

```bash
npx tsx onboarding.ts "กดปุ่มพิมพ์แล้วไม่มีอะไรขึ้นเลย ใช้ซัมซุงครับ"
npx tsx onboarding.ts serve        # POST {question, history} -> {reply, escalate}
```

ตอบจาก `pos-knowledge.md` เท่านั้น ไม่รู้ให้บอกว่าไม่รู้แล้วส่งต่อคน

🔴 **แก้ฟีเจอร์ POS เมื่อไหร่ ต้องมาแก้ `pos-knowledge.md` ด้วย** ไม่งั้น agent จะสอนร้านค้า
ไปตามขั้นตอนที่ไม่มีอยู่จริง ซึ่งเป็นวิธีที่เร็วที่สุดในการทำให้ร้านเลิกใช้

---

## orchestrator (ยังไม่ถึงเวลา)

```bash
npx tsx orchestrator.ts plan      # จันทร์เช้า: อ่านตัวเลข -> ตั้งเป้า -> แจกงาน
npx tsx orchestrator.ts work      # ทุก 10 นาที: เดินคิว
npx tsx orchestrator.ts status    # ดูงานที่รอคุณกดอนุมัติ
npx tsx orchestrator.ts approve <runId>
npx tsx orchestrator.ts reject  <runId> "เหตุผล"
```

cron บน home server:

```cron
0 9 * * 1     cd /path/to/agents && npx tsx orchestrator.ts plan
*/10 * * * *  cd /path/to/agents && npx tsx orchestrator.ts work
```

### สามอย่างที่ต่างจาก agent framework ทั่วไป

**1. แจกงานตามคอขวด ไม่ใช่ยิงทุก agent ทุกสัปดาห์**
Analytics อ่าน `v_loop_health` แล้วชี้ว่าคอขวดอยู่ที่ `merchant` / `funnel` / `churn`
จากนั้นเข้าคิวแค่ 2-3 agent ที่เกี่ยวกับคอขวดนั้น ค่า API ถูกกว่ายิงหมดราว 5-8 เท่า
และคุณไม่จมกองงานที่ต้องอนุมัติ

**2. มีเพดานงบ**
`WEEKLY_BUDGET_USD` ตัดทั้ง `plan` และ `work` ทันทีที่ถึงเพดาน และ job ที่พังเกิน 3 ครั้ง
จะไม่ถูกหยิบมารันอีก — สองอย่างนี้คือกันบิล API บานปลายจากบั๊กที่มองไม่เห็น

**3. human gate แยกเป็นรายตัว**
`onboarding` กับ `feedback` ตอบ/ทำงานเองได้ ส่วน `content_*`, `lead`, `aso` ต้องผ่านคุณ
เพราะแอปการเงินโพสต์ผิดเรื่องภาษี หรือสัญญาผลลัพธ์เกินจริง คือเรื่องใหญ่จริง
และถ้าโมเดลตอบมาเป็น JSON ไม่ได้ ระบบจะบังคับให้คนดูเสมอ แม้ agent ตัวนั้นปกติไม่ต้องอนุมัติ

### ดูอะไรทุกสัปดาห์

```sql
select * from v_loop_health limit 4;      -- หน้าปัดหลัก
select * from v_merchant_retention;       -- ร้านหลุดไหม
select * from v_agent_cost;               -- ถ้า reject_pct > 50 แปลว่า prompt ผิด ไม่ใช่คุณขี้เกียจ
select * from v_awaiting_human;           -- คิวรออนุมัติ
```
