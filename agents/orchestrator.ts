/**
 * MoneyMa — Agent Orchestrator
 *
 * ══════════════════════════════════════════════════════════════
 * 🔴 อ่านก่อนรัน: เครื่องนี้ขยายสิ่งที่เวิร์กอยู่แล้ว มันไม่สร้างสิ่งที่ยังไม่มี
 *
 * ถ้ารันตอนยังไม่มีร้าน สิ่งที่จะได้คือ:
 *   - Analytics อ่าน v_loop_health ได้ 0 แถว แล้วตอบ "ข้อมูลไม่พอ" ทุกสัปดาห์
 *   - Content ผลิตสคริปต์ที่ไม่มีใครดู
 *   - Lead ร่างข้อความหาร้านที่คุณยังไม่เคยคุยด้วยจริง
 * และคุณจะจ่ายค่า API เพื่อซื้อความรู้สึกว่ากำลังทำงานหนัก
 *
 * `plan` จึงมีด่านตรวจ (READY_AT) ที่ปฏิเสธการวางแผนเองถ้าข้อมูลยังน้อย
 * ตัวเลขนี้ไม่ได้ตั้งมามั่ว ๆ — ถ้าจะแยกให้ออกว่า install_per_receipt
 * อยู่ที่ 1% หรือ 2% ต้องมีใบเสร็จสะสมราว 2,000-3,000 ใบ ต่ำกว่านั้น
 * ทุกตัวเลขที่ agent อ่านคือ noise และคุณจะตัดสินใจผิดโดยมั่นใจ
 * ══════════════════════════════════════════════════════════════
 *
 * รันบน home server ด้วย cron:
 *   0 9 * * 1     ->  npx tsx orchestrator.ts plan    # จันทร์เช้า วางแผนรอบใหม่
 *   * /10 * * * *  ->  npx tsx orchestrator.ts work    # ทุก 10 นาที เดินคิว
 *
 *   npx tsx orchestrator.ts status                     # ดูว่ารออนุมัติกี่งาน
 *   npx tsx orchestrator.ts approve <runId> [note]
 *   npx tsx orchestrator.ts reject  <runId> <เหตุผล>
 *
 * deps: npm i ai @ai-sdk/anthropic @ai-sdk/google @supabase/supabase-js tsx
 *
 * env ที่ต้องมี:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   MODEL_BULK, MODEL_REASON   (เช็ค id ล่าสุดที่ docs ของแต่ละเจ้า อย่า hardcode)
 *   ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
 *   WEEKLY_BUDGET_USD          (ค่าเริ่มต้น 5)
 */

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

// ── ด่านตรวจว่าถึงเวลาใช้ agent หรือยัง ───────────────────────
const READY_AT = {
  receiptsLast7d: 500,   // ประมาณ 1 สัปดาห์ที่ 500 ใบ/วัน... หรือ 20-30 ร้านที่ขายปกติ
  activeMerchants: 10,
};

// ── งบต่อสัปดาห์ ──────────────────────────────────────────────
const WEEKLY_BUDGET_USD = Number(process.env.WEEKLY_BUDGET_USD ?? 5);

// ราคาโดยประมาณต่อ 1M token — ใช้กะงบเท่านั้น ไม่ใช่บิลจริง
const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  bulk: { in: 0.1, out: 0.4 },
  reason: { in: 3, out: 15 },
};

const MODELS = {
  bulk: google(process.env.MODEL_BULK ?? 'gemini-2.0-flash'),
  reason: anthropic(process.env.MODEL_REASON ?? 'claude-sonnet-4-6'),
};

// ── agent registry ────────────────────────────────────────────
type Agent = {
  tier: keyof typeof MODELS;
  needsHuman: boolean;
  system: string;
};

const RULES_TH = `
ข้อห้ามที่ใช้กับทุก agent (แอปการเงินโพสต์ผิดคือเรื่องใหญ่จริง):
- ห้ามให้คำแนะนำการลงทุน ภาษี หรือกฎหมาย
- ห้ามอ้างตัวเลขผลลัพธ์ที่ไม่มีข้อมูลรองรับ ถ้าไม่มีตัวเลขให้เขียนว่าไม่มี
- ห้ามสัญญาว่าจะได้ยอดขายเพิ่มเท่านั้นเท่านี้
- ตอบเป็น JSON ล้วน ไม่ต้องมีคำอธิบายนอก JSON`;

const AGENTS: Record<string, Agent> = {
  analytics: {
    tier: 'reason',
    needsHuman: false, // อ่านตัวเลขอย่างเดียว ไม่ออกสู่สาธารณะ
    system: `คุณคือ Growth Analyst ของ MoneyMa (POS + สแกนบิล + แอปการเงิน ทุกแพลตฟอร์ม)
ตัวเลขสำคัญเรียงตามลำดับ: install_per_receipt_pct > merchant d30_pct > receipts_per_merchant
ตอบ JSON: { "verdict": "โต|ทรง|ถอย", "bottleneck": "merchant|funnel|churn", "why": "เหตุผลอ้างอิงตัวเลขที่ให้มา", "kill": ["สิ่งที่ควรหยุดทำ"], "next_goal": "เป้าสัปดาห์หน้าเป็นตัวเลข" }

วิธีเลือก bottleneck:
- "merchant" = ร้านน้อยเกินไปหรือร้านออกใบเสร็จน้อย (receipts_per_merchant ต่ำ)
- "funnel"   = ใบเสร็จเยอะแต่ install_per_receipt ต่ำกว่า 1% (ปัญหาอยู่ที่หน้า landing ไม่ใช่จำนวนร้าน)
- "churn"    = d30_pct ต่ำกว่า 50% (ได้ร้านมาแล้วรักษาไม่อยู่)
ถ้าข้อมูลไม่พอจนสรุปไม่ได้ ให้ตอบ bottleneck เป็น "insufficient_data" แล้วบอกว่าต้องเก็บ event อะไรเพิ่ม${RULES_TH}`,
  },

  research: {
    tier: 'bulk',
    needsHuman: true,
    system: `คุณคือนักวิจัยตลาดร้านค้ารายย่อยไทย
งานคุณ: เสนอ angle เข้าหาร้านค้าแยกตาม segment (ร้านกาแฟ / ร้านอาหารตามสั่ง / ร้านชำ / ตลาดนัด / คลินิก)
ตอบ JSON: { "segments": [{ "segment": "...", "pain": "ความเจ็บที่เป็นเวลาหรือเงินเป็นตัวเลข", "hooks": ["..."] }] }
ห้ามใช้ศัพท์การตลาด พูดภาษาที่พ่อค้าแม่ค้าใช้จริง${RULES_TH}`,
  },

  content_merchant: {
    tier: 'reason',
    needsHuman: true,
    system: `คุณเขียน content ขาย POS ให้ร้านค้ารายย่อยไทย
กติกา: ขายเวลาที่ประหยัดได้และยอดที่ไม่หลุด ไม่ขายฟีเจอร์
ตอบ JSON: { "clips": [{ "hook": "3 วินาทีแรก", "script": "สคริปต์ 30 วินาที", "caption": "...", "cta": "..." }] }${RULES_TH}`,
  },

  content_consumer: {
    tier: 'reason',
    needsHuman: true,
    system: `คุณเขียน content สั้นให้ผู้ใช้ทั่วไปที่เพิ่งสแกน QR จากใบเสร็จ
เป้า: ให้เขากดโหลดแอปเพื่อเก็บบิลอัตโนมัติ
ตอบ JSON: { "clips": [{ "hook": "...", "script": "...", "caption": "..." }], "landing_copy": { "headline": "...", "bullets": ["..."], "cta": "..." } }${RULES_TH}`,
  },

  lead: {
    tier: 'bulk',
    needsHuman: true,
    system: `คุณร่างข้อความเข้าหาร้านค้าเพื่อชวนลอง POS
ตอบ JSON: { "messages": [{ "merchant_name": "...", "opening": "ไม่เกิน 3 บรรทัด", "follow_up": "..." }] }
สุภาพ ตรงประเด็น ไม่ทำเป็นสแปม ระบุชัดว่าเป็นคนทำแอปเองไม่ใช่เซลล์${RULES_TH}`,
  },

  feedback: {
    tier: 'bulk',
    needsHuman: false,
    system: `คุณจัดกลุ่ม review และ support ticket เป็น issue
ตอบ JSON: { "issues": [{ "title": "...", "frequency": n, "impact": "blocker|major|minor", "platform": "ios|android|web|all", "quote": "คำพูดจริงของผู้ใช้ 1 ประโยค" }] }
เรียงตาม frequency x impact${RULES_TH}`,
  },

  aso: {
    tier: 'reason',
    needsHuman: true,
    system: `คุณทำ ASO ให้ MoneyMa บน App Store และ Google Play (ตลาดไทย)
ตอบ JSON: { "keywords": ["..."], "title": "<=30 ตัวอักษร", "subtitle": "<=30", "screenshot_copy": ["..."] }
เน้นคำที่คนไทยพิมพ์จริง เช่น สแกนสลิป บันทึกรายรับรายจ่าย ระบบขายหน้าร้าน${RULES_TH}`,
  },
};

// ── 1) PLAN ───────────────────────────────────────────────────
async function plan() {
  const { data: loop } = await db.from('v_loop_health').select('*').limit(4);
  const { data: ret } = await db.from('v_merchant_retention').select('*').limit(3);

  const latest = loop?.[0];
  const receipts7d = Number(latest?.receipts ?? 0);
  const merchants = Number(latest?.active_merchants ?? 0);

  // ── ด่านตรวจ ──
  if (receipts7d < READY_AT.receiptsLast7d || merchants < READY_AT.activeMerchants) {
    console.log(`
╭──────────────────────────────────────────────────────────────
│ ยังไม่ถึงเวลาใช้ agent team
│
│ ตอนนี้   : ร้าน active ${merchants} ร้าน · ใบเสร็จสัปดาห์ล่าสุด ${receipts7d} ใบ
│ เกณฑ์    : ร้าน ${READY_AT.activeMerchants} ร้าน · ใบเสร็จ ${READY_AT.receiptsLast7d} ใบ/สัปดาห์
│
│ ที่ n เท่านี้ ตัวเลขทุกตัวยังเป็น noise — agent จะให้คำตอบที่
│ ฟังดูมีเหตุผลแต่ผิด ซึ่งอันตรายกว่าไม่มีคำตอบเลย
│
│ งานของสัปดาห์นี้ไม่ใช่งานที่ agent ทำแทนได้:
│   เดินเข้าร้าน สาธิต 3 นาที แล้วจดสามอย่าง
│   (1) เขาติดตรงไหน — จดคำที่เขาพูดจริง
│   (2) เขาใช้อะไรอยู่ก่อน
│   (3) วันที่ 3 เขายังเปิดแอปอยู่ไหม
│
│ ตัวเดียวที่รันได้ตอนนี้: npx tsx onboarding.ts  (ตอบร้านที่ถามมา)
╰──────────────────────────────────────────────────────────────`);
    return;
  }

  // ── ตรวจงบก่อนใช้เงิน ──
  const spent = await weeklySpend();
  if (spent >= WEEKLY_BUDGET_USD) {
    console.log(`งบสัปดาห์นี้หมดแล้ว ($${spent.toFixed(2)} / $${WEEKLY_BUDGET_USD}) — ข้ามรอบนี้`);
    return;
  }

  const analysis = await run('analytics', 'สรุปสถานะ loop และตั้งเป้าสัปดาห์หน้า', { loop, ret });
  const verdict = safeJson(analysis.text);

  if (!verdict || verdict.bottleneck === 'insufficient_data') {
    console.log('Analytics บอกว่าข้อมูลยังไม่พอ — ไม่แจกงานรอบนี้');
    console.log(verdict?.why ?? analysis.text.slice(0, 400));
    return;
  }

  const weekStart = mondayOf(new Date());
  const { data: cycle, error } = await db
    .from('agent_cycles')
    .upsert(
      {
        week_start: weekStart,
        goal: verdict.next_goal ?? 'ยังตั้งเป้าไม่ได้',
        bottleneck: verdict.bottleneck,
        metrics_in: { loop, ret },
      },
      { onConflict: 'week_start' }
    )
    .select()
    .single();

  if (error || !cycle) throw new Error(`สร้างรอบไม่สำเร็จ: ${error?.message}`);

  // 🔴 แจกงานตามคอขวดที่ Analytics ชี้ ไม่ใช่ยิงทุก agent ทุกสัปดาห์
  //    ค่า API ถูกกว่าราว 5-8 เท่า และคุณไม่จมกองงานที่ต้องอนุมัติ
  const QUEUE_BY_BOTTLENECK: Record<string, [string, string][]> = {
    merchant: [
      ['research', 'หา segment ร้านค้าที่ยัง reach ไม่ถึง'],
      ['lead', 'ร่างข้อความเข้าหาร้านค้า 20 ร้าน'],
      ['content_merchant', 'สคริปต์ 10 คลิปสาย merchant'],
    ],
    funnel: [
      ['content_consumer', 'ปรับคำบนหน้า landing หลังสแกน QR + สคริปต์ 10 คลิปสาย consumer'],
      ['aso', 'ปรับ keyword และ screenshot copy'],
    ],
    churn: [
      ['feedback', 'จัดกลุ่ม review และ ticket 30 วันล่าสุด'],
      ['research', 'หาว่าร้าน segment ไหนหลุดเยอะที่สุดและเพราะอะไร'],
    ],
  };

  const queue = QUEUE_BY_BOTTLENECK[verdict.bottleneck] ?? [
    ['feedback', 'จัดกลุ่ม review 30 วันล่าสุด'],
  ];

  await db.from('agent_runs').insert(
    queue.map(([agent, task]) => ({
      agent,
      task,
      needs_human: AGENTS[agent].needsHuman,
      cycle_id: cycle.id,
      input: { goal: cycle.goal, bottleneck: verdict.bottleneck, metrics: { loop, ret } },
    }))
  );

  console.log(`รอบ ${weekStart}`);
  console.log(`  คอขวด : ${verdict.bottleneck} — ${verdict.why ?? ''}`);
  console.log(`  เป้า   : ${cycle.goal}`);
  console.log(`  คิว    : ${queue.map(([a]) => a).join(', ')}`);
  if (verdict.kill?.length) console.log(`  หยุดทำ : ${verdict.kill.join(' · ')}`);
}

// ── 2) WORK ───────────────────────────────────────────────────
async function work() {
  const spent = await weeklySpend();
  if (spent >= WEEKLY_BUDGET_USD) {
    console.log(`งบหมด ($${spent.toFixed(2)}) — หยุดเดินคิว`);
    return;
  }

  const { data: jobs } = await db
    .from('agent_runs')
    .select('*')
    .eq('status', 'queued')
    .lt('attempts', 3) // 🔴 กัน job ที่พังซ้ำ ๆ วนกินเงินไปเรื่อย
    .limit(3);

  for (const job of jobs ?? []) {
    await db
      .from('agent_runs')
      .update({
        status: 'running',
        attempts: (job.attempts ?? 0) + 1,
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    try {
      const res = await run(job.agent, job.task, job.input, job.id);
      const parsed = safeJson(res.text);
      await db
        .from('agent_runs')
        .update({
          output: { raw: res.text, parsed },
          // ถ้าแปลง JSON ไม่ได้ ให้คนดูเสมอ แม้ agent ตัวนั้นปกติไม่ต้องอนุมัติ
          status: job.needs_human || !parsed ? 'awaiting_human' : 'approved',
          finished_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      console.log(`✓ ${job.agent}: ${job.task}`);
    } catch (e: any) {
      await db
        .from('agent_runs')
        .update({
          status: 'failed',
          error: String(e?.message ?? e),
          finished_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      console.log(`✗ ${job.agent}: ${e?.message ?? e}`);
    }
  }
}

// ── 3) human gate ─────────────────────────────────────────────
async function status() {
  const { data } = await db.from('v_awaiting_human').select('*');
  if (!data?.length) return console.log('ไม่มีงานรออนุมัติ');
  for (const r of data) {
    console.log(`\n[${r.id}] ${r.agent} — ${r.task}`);
    console.log(JSON.stringify(r.result, null, 2)?.slice(0, 1200));
  }
  console.log(`\nรวม ${data.length} งาน · อนุมัติ: npx tsx orchestrator.ts approve <id>`);
}

async function decide(id: string, approved: boolean, note?: string) {
  const { error } = await db
    .from('agent_runs')
    .update({ status: approved ? 'approved' : 'rejected', human_note: note ?? null })
    .eq('id', id)
    .eq('status', 'awaiting_human');
  console.log(error ? `ไม่สำเร็จ: ${error.message}` : approved ? 'อนุมัติแล้ว' : 'ปัดตกแล้ว');
}

// ── core ──────────────────────────────────────────────────────
async function run(agentName: string, task: string, input: unknown, runId?: string) {
  const agent = AGENTS[agentName];
  if (!agent) throw new Error(`ไม่รู้จัก agent: ${agentName}`);

  const res = await generateText({
    model: MODELS[agent.tier],
    system: agent.system,
    prompt: `งาน: ${task}\n\nข้อมูล:\n${JSON.stringify(input, null, 2)}`,
    // ชื่อ option ต่างกันตามเวอร์ชันของ AI SDK — ใส่ทั้งคู่ ตัวที่ไม่รู้จักจะถูกมองข้าม
    maxOutputTokens: 2000,
    maxTokens: 2000,
  } as any);

  // ชื่อ field ของ usage ก็เปลี่ยนตามเวอร์ชันเช่นกัน
  const u: any = res.usage ?? {};
  const tokensIn = u.inputTokens ?? u.promptTokens ?? 0;
  const tokensOut = u.outputTokens ?? u.completionTokens ?? 0;
  const price = PRICE_PER_MTOK[agent.tier];
  const cost = (tokensIn * price.in + tokensOut * price.out) / 1_000_000;

  if (runId) {
    await db
      .from('agent_runs')
      .update({
        model_used: agent.tier,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: Number(cost.toFixed(5)),
      })
      .eq('id', runId);
  }
  return { text: res.text, cost };
}

async function weeklySpend() {
  const since = mondayOf(new Date());
  const { data } = await db
    .from('agent_runs')
    .select('cost_usd')
    .gte('created_at', `${since}T00:00:00Z`);
  return (data ?? []).reduce((sum, r: any) => sum + Number(r.cost_usd ?? 0), 0);
}

function safeJson(s: string) {
  if (!s) return null;
  // โมเดลชอบห่อ JSON ด้วย ```json — ตัดทิ้งก่อน
  const cleaned = s.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // บางทีมีข้อความนำหน้า — คว้าก้อน { ... } ก้อนแรกมาลองอีกที
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function mondayOf(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

// ── entry ─────────────────────────────────────────────────────
const [cmd, arg1, ...rest] = process.argv.slice(2);
const note = rest.join(' ');

if (cmd === 'plan') plan();
else if (cmd === 'work') work();
else if (cmd === 'status') status();
else if (cmd === 'approve' && arg1) decide(arg1, true, note);
else if (cmd === 'reject' && arg1) decide(arg1, false, note);
else console.log('ใช้: tsx orchestrator.ts plan | work | status | approve <id> [note] | reject <id> <เหตุผล>');
