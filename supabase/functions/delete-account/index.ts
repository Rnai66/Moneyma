/**
 * delete-account — ลบบัญชีผู้ใช้และข้อมูลทั้งหมดอย่างถาวร
 *
 * Google Play บังคับว่าแอปที่ให้สมัครสมาชิกต้องมีช่องทางขอลบบัญชี
 * ทั้งในแอปและบนเว็บ ฟังก์ชันนี้คือฝั่งเซิร์ฟเวอร์ของทั้งสองทาง
 *
 * ทำไมต้องเป็น Edge Function: การลบ auth user ต้องใช้ service_role key
 * ซึ่งห้ามอยู่ในแอปฝั่งผู้ใช้เด็ดขาด (ใครถอด APK ก็ได้คีย์ไปคุมทั้งฐานข้อมูล)
 *
 * env ที่ต้องตั้งใน Supabase:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *   (ทั้งสามตัวถูกฉีดให้อัตโนมัติเมื่อ deploy ผ่าน supabase CLI)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * ตารางที่ผูกกับผู้ใช้ เรียงจากลูกไปหาแม่
 * ถ้าเพิ่มตารางใหม่ที่มีคอลัมน์ user_id ต้องมาเพิ่มที่นี่ด้วย
 */
const USER_TABLES = [
  'sync_history',
  'error_logs',
  'budget_limits',
  'transactions',
  'user_ai_usage',
  'subscriptions',
  'user_profiles',
] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    // ── 1. ยืนยันตัวตนจาก JWT ของผู้ใช้เอง ─────────────────────────────
    // ผู้ใช้ลบได้เฉพาะบัญชีตัวเอง — id มาจาก token ไม่ใช่จาก body
    // ที่ส่งมา จึงปลอมเป็นคนอื่นไม่ได้
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'No auth token provided' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const userId = user.id;

    // ── 2. ต้องยืนยันเจตนาให้ชัด ──────────────────────────────────────
    // กัน client ที่เขียนผิดพลาดเรียกโดยไม่ตั้งใจ
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* body ว่างก็ถือว่าไม่ได้ยืนยัน */
    }
    if (body?.confirm !== 'DELETE_MY_ACCOUNT') {
      return json({ error: 'Missing confirmation' }, 400);
    }

    // ── 3. ลบข้อมูลทุกตารางด้วย service role ───────────────────────────
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const deleted: Record<string, string> = {};

    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq('user_id', userId);
      if (error) {
        // ตารางที่ยังไม่มีในโปรเจกต์นี้ ไม่ใช่ความผิดพลาด — ข้ามไป
        const missing = error.code === '42P01' ||
          /does not exist|schema cache/i.test(error.message);
        if (missing) {
          deleted[table] = 'skipped (no such table)';
          continue;
        }
        // อย่างอื่นถือว่าล้มเหลว — หยุดก่อนลบ auth user
        // ไม่งั้นจะเหลือข้อมูลกำพร้าที่ไม่มีใครลบได้อีกเลย
        console.error(`delete-account: ${table} failed`, error);
        return json({
          error: `Failed to delete data from ${table}`,
          detail: error.message,
        }, 500);
      }
      deleted[table] = 'ok';
    }

    // user_profiles บางสคีมาใช้ id เป็น PK แทน user_id — เก็บตกให้ครบ
    await admin.from('user_profiles').delete().eq('id', userId);

    // ── 4. ลบ auth user เป็นขั้นสุดท้าย ────────────────────────────────
    // ทำหลังสุดเสมอ เพราะถ้าลบ auth ก่อนแล้วขั้นก่อนหน้าพัง
    // จะไม่มี JWT ให้ลองใหม่ได้อีก
    const { error: delError } = await admin.auth.admin.deleteUser(userId);
    if (delError) {
      console.error('delete-account: auth user delete failed', delError);
      return json({
        error: 'Failed to delete account',
        detail: delError.message,
      }, 500);
    }

    console.log(`delete-account: removed user ${userId}`, deleted);

    return json({
      success: true,
      message: 'Account and all associated data have been permanently deleted.',
      deleted,
    });
  } catch (error) {
    console.error('delete-account: unexpected error', error);
    return json({ error: (error as Error).message ?? 'Unexpected error' }, 500);
  }
});
