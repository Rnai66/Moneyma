import { loadSubscription, PLANS } from '../SubscriptionContext/SubscriptionService';
import SupabaseService from './SupabaseService';

/**
 * Checks if the current user has available AI scan quota by querying Supabase.
 * Returns { allowed: boolean, reason: string | null }
 */
/**
 * อ่านยอดใช้งาน AI ของผู้ใช้ปัจจุบัน + เพดานของแผนที่ถืออยู่
 *
 * แยกออกมาจาก checkAiLimit() เพราะ UI ต้องรู้ "เหลือกี่ครั้ง" ตั้งแต่ก่อนกดสแกน
 * ไม่ใช่รู้ตอนถ่ายรูปเสร็จแล้วโดนเด้งกลับ
 *
 * @returns {Promise<{ok:boolean, reason?:string, plan?:string, dailyCount?:number,
 *                    monthlyCount?:number, limits?:object}>}
 */
export async function getAiQuota() {
  const supabase = SupabaseService.getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'unauthenticated' };

  const sub = await loadSubscription();
  const plan = sub?.plan ?? 'free';
  const limits = PLANS[plan]?.limits || PLANS.free.limits;

  const today = new Date().toISOString().split('T')[0];
  const month = today.substring(0, 7); // e.g. "2024-04"

  const { data: usage, error } = await supabase
    .from('user_ai_usage')
    .select('date, month, daily_count, monthly_count')
    .eq('user_id', user.id)
    .single();

  // PGRST116 = ไม่พบแถว = ยังไม่เคยสแกน ไม่ใช่ความผิดพลาด
  if (error && error.code !== 'PGRST116') {
    console.warn('AiUsageService: Supabase query error:', error);
    return { ok: false, reason: 'query_failed', plan, limits };
  }

  // แถวเดียวเก็บทั้งยอดวันและยอดเดือน — ถ้าคนละวัน/คนละเดือนก็คือเริ่มนับใหม่
  let dailyCount = 0;
  let monthlyCount = 0;
  if (usage && !error) {
    if (usage.date === today) dailyCount = usage.daily_count;
    if (usage.month === month) monthlyCount = usage.monthly_count;
  }

  return { ok: true, plan, dailyCount, monthlyCount, limits };
}

/**
 * Checks if the current user has available AI scan quota by querying Supabase.
 * Returns { allowed: boolean, reason: string | null }
 */
export async function checkAiLimit() {
  const q = await getAiQuota();
  if (!q.ok && q.reason === 'unauthenticated') {
    return { allowed: false, reason: 'unauthenticated' };
  }

  // อ่านยอดไม่ได้ (เน็ตหลุด / Supabase ล่ม) — ปล่อยผ่านดีกว่าบล็อกคนที่ยังมีโควตา
  // ตัวกันเงินจริงคือ RPC ฝั่งเซิร์ฟเวอร์ ไม่ใช่ด่านนี้
  if (!q.ok) {
    return { allowed: true, reason: null, usage: { dailyCount: 0, monthlyCount: 0 }, limits: q.limits };
  }

  const { dailyCount, monthlyCount, limits } = q;

  if (limits.ai_scans_per_day !== Infinity && dailyCount >= limits.ai_scans_per_day) {
    return { allowed: false, reason: 'daily_limit_reached', dailyCount, limit: limits.ai_scans_per_day };
  }

  if (limits.ai_scans_per_month !== Infinity && monthlyCount >= limits.ai_scans_per_month) {
    return { allowed: false, reason: 'monthly_limit_reached', monthlyCount, limit: limits.ai_scans_per_month };
  }

  return { allowed: true, reason: null, usage: { dailyCount, monthlyCount }, limits };
}

/**
 * Increments the daily and monthly AI scan usage counters atomically via Supabase RPC.
 * Should be called AFTER a successful scan.
 */
export async function incrementAiUsage() {
  const supabase = SupabaseService.getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const today = new Date().toISOString().split('T')[0];
  const month = today.substring(0, 7);

  // Call the atomic increment RPC
  const { error } = await supabase.rpc('increment_ai_usage', {
    p_user_id: user.id,
    p_month: month,
    p_date: today
  });

  if (error) {
    console.error('Failed to increment AI usage:', error);
  }
}
