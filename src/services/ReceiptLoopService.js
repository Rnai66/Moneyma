/**
 * ReceiptLoopService — ขาบันทึกของ growth loop
 *
 * หน้าที่เดียว: ทำให้ใบเสร็จทุกใบที่ออกจาก POS ไปโผล่ในตาราง pos_receipts
 * เพื่อให้ v_loop_health คำนวณ install_per_receipt ได้จริง
 *
 * 🔴 กฎที่ห้ามแหก: การบันทึกต้องไม่มีทางขวางการขาย
 *    ร้านค้าไม่สนใจ metric ของเรา เขาสนใจว่าใบเสร็จออกไหม
 *    ทุกฟังก์ชันในไฟล์นี้จึงเป็น fire-and-forget และห้าม throw ออกไปข้างนอก
 *    ถ้าเน็ตหลุด -> เข้าคิวในเครื่อง แล้วส่งตอนออกใบถัดไป
 */

import supabaseService from './SupabaseService';
import { getMerchantCode, newShareToken } from '../utils/shareToken';

/** client ตัวเดียวกับที่ทั้งแอปใช้ — ไม่สร้างใหม่ ไม่งั้น session ไม่ตรงกัน */
const db = () => supabaseService?.client || null;

const QUEUE_KEY = 'moneyma_receipt_queue';
const MERCHANT_ID_KEY = 'moneyma_merchant_id';
const MERCHANT_NAME_KEY = 'moneyma_merchant_name';
const QUEUE_LIMIT = 500; // กันคิวบวมกรณีร้านออฟไลน์ยาว

// ── โดเมนที่ QR จะพาไป ───────────────────────────────────────────
// ตั้งผ่าน .env: REACT_APP_RECEIPT_BASE_URL=https://<โดเมนเว็บแอป>
//
// 🔴 ไม่มี fallback ไปที่ window.location.origin โดยตั้งใจ
//    เคยเขียนแบบนั้นแล้วได้พฤติกรรมที่ต่างกันสองแบบในบิลด์เดียว:
//    บนเว็บ loop ติดเอง (origin เป็น https) แต่บนแอป origin เป็น capacitor://
//    จึงเงียบ — แปลว่าสวิตช์ปิดไม่จริง และเว็บจะเริ่มเขียนข้อมูลก่อนรัน SQL
//    ตอนนี้กติกาเดียว: ไม่ตั้ง env = loop ปิดทุกแพลตฟอร์ม
function receiptBaseUrl() {
  const configured = process.env.REACT_APP_RECEIPT_BASE_URL;
  return configured ? configured.replace(/\/$/, '') : '';
}

/**
 * 🔴 สวิตช์ปิด-เปิดทั้ง loop อยู่ที่ตัวแปรเดียว: REACT_APP_RECEIPT_BASE_URL
 *
 *    ไม่ได้ตั้ง = ทุกอย่างในไฟล์นี้เป็นหมัน ไม่สร้าง token ไม่เขียนคิว
 *    ไม่ยิงเน็ต ใบเสร็จออกเหมือนเวอร์ชันที่อยู่บนสโตร์ทุกประการ
 *
 *    จงใจให้ค่าเริ่มต้นคือ "ปิด" เพราะถ้าเผลอ build ขึ้นสโตร์ก่อนรัน SQL
 *    ใบเสร็จทุกใบจะเข้าคิวในเครื่องผู้ใช้แล้วส่งไม่ขึ้นตลอดไป
 */
export const LOOP_ENABLED = Boolean(receiptBaseUrl());

/** ลิงก์เต็มที่จะฝังลง QR บนใบเสร็จ */
export function buildReceiptUrl(token) {
  const base = receiptBaseUrl();
  return base && token ? `${base}/r/?t=${token}` : '';
}

/** สร้าง token ใหม่ 1 ใบ — เรียกตอนสร้างเอกสาร ไม่ใช่ตอนพิมพ์
 *  คืน null เมื่อ loop ปิดอยู่ ซึ่งทำให้ทุกขั้นตอนถัดไปข้ามไปเอง */
export function issueShareToken() {
  return LOOP_ENABLED ? newShareToken(getMerchantCode()) : null;
}

// ── คิวออฟไลน์ ───────────────────────────────────────────────────
function readQueue() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function writeQueue(rows) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-QUEUE_LIMIT)));
  } catch (e) {
    /* เต็มก็ปล่อย ไม่ให้กระทบการขาย */
  }
}

// ── ตัวร้าน ──────────────────────────────────────────────────────
function localMerchantId() {
  try {
    return localStorage.getItem(MERCHANT_ID_KEY) || null;
  } catch (e) {
    return null;
  }
}

const DEFAULT_MERCHANT_NAME = 'ร้านค้า (ยังไม่ตั้งชื่อ)';

/** ชื่อที่ส่งขึ้น Supabase สำเร็จล่าสุด — ใช้เทียบว่าต้องอัปเดตไหม */
function syncedMerchantName() {
  try {
    return localStorage.getItem(MERCHANT_NAME_KEY) || '';
  } catch (e) {
    return '';
  }
}

function rememberMerchantName(name) {
  try { localStorage.setItem(MERCHANT_NAME_KEY, name); } catch (e) { /* ไม่เป็นไร */ }
}

/** ตัดช่องว่างซ้อนและกันชื่อยาวเกินจอของหน้า /r/ */
function cleanShopName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

/**
 * อัปเดตชื่อร้านอย่างเดียว
 *
 * จำชื่อลง localStorage เฉพาะตอนเขียนสำเร็จ — ถ้าพลาดเพราะออฟไลน์
 * รอบหน้าจะเห็นว่าชื่อยังไม่ตรงแล้วลองใหม่เอง ไม่ใช่เงียบไปตลอด
 */
async function pushMerchantName(merchantId, name) {
  const client = db();
  if (!client) return;
  try {
    const { error } = await client.from('merchants').update({ name }).eq('id', merchantId);
    if (!error) rememberMerchantName(name);
  } catch (e) {
    /* ออฟไลน์ ค่อยลองรอบหน้า */
  }
}

/**
 * ผูกเครื่องนี้เข้ากับแถวใน merchants ครั้งแรกที่ออนไลน์
 *
 * 🔴 กุญแจคือ owner_user_id ไม่ใช่ merchant_code
 *    merchant_code เป็นรหัสสุ่มในเครื่อง ถ้าใช้มันเป็น conflict target
 *    สองร้านที่บังเอิญสุ่มได้รหัสเดียวกันจะถูกรวมเป็นร้านเดียว
 *
 * 🔴 ต้องล็อกอินก่อน — RLS ของ pos_receipts ผูกกับ auth.uid()
 *    ถ้ายังไม่ล็อกอิน ใบเสร็จจะค้างในคิวจนกว่าจะล็อกอิน (ไม่หาย)
 */
export async function ensureMerchant(profile = {}) {
  const name = cleanShopName(profile.name);
  const existing = localMerchantId();

  // 🔴 มีร้านแล้วก็ยังต้องเข้ามาตรงนี้ ห้าม return ทันทีแบบเวอร์ชันแรก
  //    เวอร์ชันแรกออกตั้งแต่บรรทัดนี้ ชื่อร้านที่ตั้งทีหลังจึงไม่มีวันขึ้นถึง Supabase
  //    ลูกค้าที่สแกน QR เห็น "ร้านค้า (ยังไม่ตั้งชื่อ)" ตลอดไปทั้งที่สลิปพิมพ์ชื่อจริง
  if (existing) {
    // เทียบกับชื่อที่ส่งสำเร็จล่าสุด -> ยิงเน็ตเฉพาะตอนชื่อเปลี่ยนจริง ไม่ใช่ทุกใบเสร็จ
    if (name && name !== syncedMerchantName()) await pushMerchantName(existing, name);
    return existing;
  }

  const client = db();
  if (!client) return null;

  try {
    const { data: sess } = await client.auth.getSession();
    const userId = sess?.session?.user?.id;
    if (!userId) return null; // ยังไม่ล็อกอิน -> ปล่อยให้ค้างคิวไว้ก่อน

    const { data, error } = await client
      .from('merchants')
      .upsert(
        {
          owner_user_id: userId,
          merchant_code: getMerchantCode(),
          name: name || DEFAULT_MERCHANT_NAME,
          segment: profile.segment || null,
          province: profile.province || null,
          source: profile.source || 'organic',
          stage: 'installed',
        },
        { onConflict: 'owner_user_id', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (error || !data) return null;
    try { localStorage.setItem(MERCHANT_ID_KEY, data.id); } catch (e) { /* ไม่เป็นไร */ }
    if (name) rememberMerchantName(name);
    return data.id;
  } catch (e) {
    return null;
  }
}

// ── บันทึกใบเสร็จ ────────────────────────────────────────────────
async function flushQueue(merchantId) {
  const queue = readQueue();
  if (queue.length === 0 || !db() || !merchantId) return;

  const rows = queue.map((r) => ({ ...r, merchant_id: merchantId }));
  try {
    // ignoreDuplicates: ส่งซ้ำได้ไม่พัง เพราะ share_token เป็น unique
    const { error } = await db()
      .from('pos_receipts')
      .upsert(rows, { onConflict: 'share_token', ignoreDuplicates: true });
    if (!error) writeQueue([]);
  } catch (e) {
    /* ยังออฟไลน์ เก็บไว้รอบหน้า */
  }
}

/**
 * บันทึกใบเสร็จ 1 ใบ — เรียกตอน commit การขายเท่านั้น
 * (พรีวิวที่ยังไม่ยืนยัน ห้ามนับ ไม่งั้น install_per_receipt จะต่ำเกินจริง)
 *
 * ห้าม await ในเส้นทางการขาย — ปล่อยให้วิ่งเบื้องหลัง
 */
export function recordReceipt({ token, docNo, total, itemCount, issuedAt, shopName }) {
  if (!LOOP_ENABLED || !token) return;

  const row = {
    share_token: token,
    doc_no: docNo || null,
    total_amount: Number(total) || 0,
    item_count: Number(itemCount) || 0,
    issued_at: issuedAt || new Date().toISOString(),
  };

  // เข้าคิวก่อนเสมอ แล้วค่อยพยายามส่ง — ถ้าแอปถูกปิดกลางคัน ข้อมูลไม่หาย
  writeQueue([...readQueue(), row]);

  (async () => {
    // เรียก ensureMerchant เสมอ ไม่ลัดด้วย localMerchantId() เหมือนเดิม
    // เพราะขาอัปเดตชื่อร้านอยู่ข้างใน — ลัดแล้วชื่อจะไม่มีวันถูกส่ง
    // (ข้างในคืนค่าทันทีถ้าชื่อไม่เปลี่ยน จึงไม่ได้เพิ่มการยิงเน็ต)
    const merchantId = await ensureMerchant({ name: shopName });
    if (!merchantId) return;
    await flushQueue(merchantId);
  })();
}

/** เรียกตอนเปิดหน้า POS เพื่อเคลียร์คิวที่ค้างจากวันก่อน */
export function syncPendingReceipts(profile = {}) {
  if (!LOOP_ENABLED) return;
  (async () => {
    const merchantId = await ensureMerchant(profile);
    if (merchantId) await flushQueue(merchantId);
  })();
}

/** จำนวนใบที่ยังส่งไม่ขึ้น — เอาไปโชว์ในหน้าตั้งค่าได้ */
export function pendingReceiptCount() {
  return readQueue().length;
}
