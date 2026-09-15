/**
 * shareToken — รหัสบนใบเสร็จที่ทำให้ loop วัดผลได้
 *
 * ใบเสร็จทุกใบพก token หนึ่งตัว ลูกค้าสแกน QR -> เปิดหน้า /r/?t=<token>
 * -> เรารู้ว่าใบเสร็จใบไหน ร้านไหน ถูกสแกนกี่ครั้ง และกลายเป็นคนโหลดแอปกี่คน
 * ตัวเลขนั้นคือ install_per_receipt ซึ่งเป็นตัวชี้ขาดว่า loop โตเองได้หรือไม่
 *
 * ข้อบังคับสามข้อของ token (เหตุผลอยู่ในโค้ด อย่าลดทอน):
 *  1. สร้างแบบออฟไลน์ได้ — ร้านตลาดนัดเน็ตหลุดบ่อย ถ้าต้องขอ token จากเซิร์ฟเวอร์
 *     ก่อนพิมพ์ ใบเสร็จจะออกไม่ได้ และคนขายจะเลิกใช้ทันที
 *  2. ไม่ชนกันเอง — รหัสร้าน 6 ตัวนำหน้า + เวลาระดับมิลลิวินาที + ตัวนับ
 *  3. คนอ่านออกเสียงได้ — ถ้า QR เลอะหมึก ลูกค้าต้องพิมพ์มือได้
 *     จึงตัด 0/O/1/I/L ทิ้ง
 */

// 31 ตัวอักษร ตัด I, L, O, 0, 1 ทิ้ง เพราะบนใบเสร็จความร้อนมันอ่านสลับกันได้
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const BASE = ALPHABET.length;

const MERCHANT_CODE_KEY = 'moneyma_merchant_code';

function randomInt(max) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function randomChars(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[randomInt(BASE)];
  return s;
}

function encodeBase(num, len) {
  let s = '';
  let n = Math.floor(num);
  do {
    s = ALPHABET[n % BASE] + s;
    n = Math.floor(n / BASE);
  } while (n > 0);
  return s.length >= len ? s.slice(-len) : s.padStart(len, ALPHABET[0]);
}

/**
 * รหัสร้าน 6 ตัว — คงที่ต่อหนึ่งเครื่อง เก็บในเครื่อง
 *
 * 🔴 ทำไมต้อง 6 ไม่ใช่ 4: ตอนแรกใช้ 4 ตัว (31^4 = 923,521 แบบ)
 *    ที่ 3,000 ร้านจะมีราว 5 คู่ที่ได้รหัสชนกันตามปัญหาวันเกิด
 *    ซึ่งแปลว่าสองร้านถูกนับเป็นร้านเดียว — 6 ตัวทำให้เหลือ ~0.05 คู่
 *    (รหัสนี้เป็นแค่คำนำหน้าให้อ่านง่าย ตัวชี้ขาดร้านจริงคือ owner_user_id)
 */
export function getMerchantCode() {
  try {
    const saved = localStorage.getItem(MERCHANT_CODE_KEY);
    if (saved && saved.length === 6) return saved;
    const code = randomChars(6);
    localStorage.setItem(MERCHANT_CODE_KEY, code);
    return code;
  } catch (e) {
    // โหมดไม่ระบุตัวตน / localStorage ถูกปิด — ยังต้องออกใบเสร็จได้อยู่ดี
    return randomChars(6);
  }
}

// ── ตัวนับกันชนภายในเครื่อง ────────────────────────────────────
// 🔴 เคยใช้ "วินาที + สุ่ม 3 ตัว" แล้วเทสต์ 2,000 ใบชนกัน 59 ใบ
//    ใบที่ชนจะถูก unique constraint ปัดทิ้งเงียบ ๆ = ใบเสร็จหาย
//    และที่แย่กว่าคือ scan ของลูกค้าไปเกาะใบเสร็จผิดใบ
//    แก้ด้วยมิลลิวินาที + ตัวนับ ทำให้ "ชนกันเองในเครื่องเดียว" เป็นไปไม่ได้
let lastMs = 0;
let seq = 0;

function stamp() {
  const ms = Date.now();
  if (ms === lastMs) {
    seq += 1;
  } else {
    lastMs = ms;
    seq = 0;
  }
  return { ms, seq };
}

/**
 * สร้าง token ใหม่สำหรับใบเสร็จหนึ่งใบ
 * รูปแบบ: RRRRRR TTTTTTTT SS  (รหัสร้าน 6 + เวลาระดับมิลลิวินาที 8 + ตัวนับ 2 = 16 ตัว)
 *  - เวลา 8 ตัวฐาน 31 ครอบคลุมได้ราว 27 ปีนับจาก 2026
 *  - ตัวนับ 2 ตัว รองรับ 961 ใบในมิลลิวินาทีเดียวกัน ซึ่งเกินจริงไปมาก
 */
export function newShareToken(merchantCode) {
  const EPOCH = Date.UTC(2026, 0, 1);
  const { ms, seq: n } = stamp();
  const elapsed = Math.max(0, ms - EPOCH);
  return (merchantCode || getMerchantCode()) + encodeBase(elapsed, 8) + encodeBase(n, 2);
}

/** ตัดรหัสร้านออกมาจาก token (ใช้ตอนอ่าน log ด้วยตาเปล่า) */
export function merchantCodeOf(token) {
  return typeof token === 'string' ? token.slice(0, 6) : '';
}

/** ตรวจรูปแบบคร่าว ๆ ก่อนยิงไป Supabase — กันขยะจาก URL ที่คนพิมพ์มั่ว */
export function isValidToken(token) {
  if (typeof token !== 'string' || token.length !== 16) return false;
  for (const ch of token) if (!ALPHABET.includes(ch)) return false;
  return true;
}
