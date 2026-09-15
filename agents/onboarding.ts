/**
 * MoneyMa — Onboarding Agent
 *
 * ตัวเดียวใน 7 agent ที่คุ้มค่าสร้างตั้งแต่ร้านที่ 1
 * เหตุผล: พอมีร้านที่ 5-10 คุณจะเริ่มโดนถามตอนสามทุ่มว่าเครื่องพิมพ์ไม่ออกทำไง
 * ร้านที่ติดตั้งไม่สำเร็จคือร้านที่หลุดทันที และร้านหลุด 1 ร้าน = ใบเสร็จหายทั้งสาย
 *
 * ต่างจาก agent ตัวอื่นตรงที่ **ไม่ต้องรอคุณอนุมัติ** เพราะมันตอบคนที่ถามมาก่อน
 * ไม่ใช่การโพสต์สู่สาธารณะ แต่แลกกับข้อบังคับที่เข้มกว่า:
 *   - ตอบจากไฟล์ pos-knowledge.md เท่านั้น ไม่รู้ให้บอกว่าไม่รู้
 *   - ห้ามเดาขั้นตอนที่ไม่มีในฐานความรู้
 *   - เรื่องเงิน/สต็อก/ภาษี ส่งต่อให้คนทันที
 *
 * ใช้งาน:
 *   npx tsx onboarding.ts "กดปุ่มพิมพ์แล้วไม่มีอะไรขึ้นเลย ใช้ซัมซุงครับ"
 *   npx tsx onboarding.ts serve      # เปิดพอร์ตไว้ต่อกับ LINE OA / เว็บแชท
 *
 * env: ANTHROPIC_API_KEY, MODEL_REASON, (ไม่บังคับ) SUPABASE_URL + SUPABASE_SERVICE_KEY
 */

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE = readFileSync(join(HERE, 'pos-knowledge.md'), 'utf8');

const model = anthropic(process.env.MODEL_REASON ?? 'claude-sonnet-4-6');

const db =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

const SYSTEM = `คุณคือผู้ช่วยติดตั้งและใช้งาน POS ของ MoneyMa คุยกับเจ้าของร้านค้ารายย่อยในไทย

วิธีคุย:
- ภาษาพูดปกติ สุภาพ ไม่ใช้ศัพท์เทคนิค ("กดปุ่มสามขีดมุมขวาบน" ดีกว่า "เปิด hamburger menu")
- ตอบทีละขั้น ขั้นเดียวต่อหนึ่งข้อความ แล้วถามยืนยันก่อนไปขั้นถัดไป
- ถ้ายังไม่รู้ว่าเขาใช้ Android หรือ iPhone และคำตอบขึ้นกับข้อนั้น ให้ถามก่อน อย่าตอบเผื่อทั้งสองแบบ
- ร้านกำลังขายของอยู่ ตอบสั้น ยาวสุด 4 บรรทัด

ข้อห้าม:
- ตอบจากฐานความรู้ด้านล่างเท่านั้น ถ้าไม่มีในนั้น ให้ escalate อย่าเดาขั้นตอนขึ้นมาเอง
- ห้ามให้คำแนะนำเรื่องภาษี บัญชีตามกฎหมาย หรือการลงทุน
- ห้ามสัญญาว่าจะได้ยอดขายเพิ่ม
- ห้ามบอกว่าฟีเจอร์ที่ยังไม่มี "กำลังจะมา" ถ้าฐานความรู้ไม่ได้บอกไว้

ตอบเป็น JSON ล้วน:
{
  "reply": "ข้อความที่จะส่งให้ร้าน",
  "step": "ชื่อขั้นตอนสั้นๆ ที่กำลังแก้อยู่",
  "escalate": true|false,
  "escalate_reason": "ใส่เมื่อ escalate เป็น true"
}

── ฐานความรู้ ──
${KNOWLEDGE}`;

type Turn = { role: 'user' | 'assistant'; content: string };

export async function answer(question: string, history: Turn[] = []) {
  const res = await generateText({
    model,
    system: SYSTEM,
    messages: [...history, { role: 'user', content: question }],
    maxOutputTokens: 700,
    maxTokens: 700,
  } as any);

  const parsed = safeJson(res.text) ?? {
    // แปลง JSON ไม่ได้ = อย่าส่งข้อความดิบให้ร้านค้าอ่าน ให้ส่งต่อคนแทน
    reply: 'ขอโทษครับ ตรงนี้ผมขอให้ทีมงานตอบเองนะครับ เดี๋ยวติดต่อกลับไป',
    step: 'parse_error',
    escalate: true,
    escalate_reason: 'โมเดลตอบมาไม่เป็น JSON',
  };

  if (db) {
    await db.from('agent_runs').insert({
      agent: 'onboarding',
      task: question.slice(0, 200),
      input: { question, history_len: history.length },
      output: { raw: res.text, parsed },
      status: parsed.escalate ? 'awaiting_human' : 'approved',
      needs_human: Boolean(parsed.escalate),
      model_used: 'reason',
    });
  }

  return parsed as {
    reply: string;
    step?: string;
    escalate?: boolean;
    escalate_reason?: string;
  };
}

function safeJson(s: string) {
  if (!s) return null;
  const cleaned = s.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

// ── entry ─────────────────────────────────────────────────────
const arg = process.argv[2];

if (arg === 'serve') {
  const port = Number(process.env.PORT ?? 8787);
  createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { question, history } = JSON.parse(body || '{}');
      const out = await answer(String(question ?? ''), history ?? []);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    } catch (e: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e?.message ?? e) }));
    }
  }).listen(port, () => console.log(`onboarding agent ฟังอยู่ที่พอร์ต ${port}`));
} else if (arg) {
  answer(arg).then((out) => {
    console.log(`\n${out.reply}\n`);
    if (out.escalate) console.log(`⚠️  ต้องให้คนตอบ: ${out.escalate_reason}`);
  });
} else {
  console.log('ใช้: tsx onboarding.ts "<คำถามจากร้านค้า>"  |  tsx onboarding.ts serve');
}
