/**
 * docNumber — เลขที่เอกสารแบบรันอัตโนมัติ ต่อวัน ต่อชนิดเอกสาร
 *
 * ══════════════════════════════════════════════════════════════
 * 🔴 ทำไมต้องเลิกใช้ `Date.now().toString().slice(-6)`
 *
 * มันคือ 6 หลักท้ายของเวลาหน่วยมิลลิวินาที ซึ่งนับถึง 999999 แล้ววนกลับ 0
 * = ครบรอบทุก 1,000 วินาที หรือ 16.7 นาที
 *
 * ผลคือเอกสารสองใบที่ออกห่างกัน 17 นาทีมีสิทธิ์ได้เลขเดียวกัน
 * และเลขไม่เรียงตามเวลา ใบที่ออกทีหลังอาจได้เลขน้อยกว่าใบก่อน
 * ซึ่งเป็นปัญหาจริงกับใบกำกับภาษี
 * ══════════════════════════════════════════════════════════════
 *
 * 🔴 แยก peek กับ commit โดยตั้งใจ
 *
 * peekDocNo   = ขอดูเลขถัดไป ยังไม่กิน  -> ใช้ตอนเปิดพรีวิว
 * commitDocNo = ยืนยันว่าใช้เลขนี้จริง  -> ใช้ตอนกดยืนยัน
 *
 * ถ้ากินเลขตั้งแต่ตอนเปิดพรีวิว คนกดดูแล้วกดยกเลิกจะทำให้เลขขาดตอน
 * (ออกใบที่ 007 แล้วข้ามไป 009) ซึ่งสรรพากรถามหาใบที่หายได้
 */

const STORE_KEY = 'moneyma_doc_counters';
const PATTERN = /^([A-Z]+)-(\d{6})-(\d+)$/;

/** yymmdd ตามเวลาเครื่อง ไม่ใช่ UTC — ร้านปิดร้านตามวันของตัวเอง */
function todayYmd(now = new Date()) {
  const yy = String(now.getFullYear() % 100).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function readAll() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch (e) {
    /* เขียนไม่ได้ก็ยังออกเอกสารได้ ห้ามขวางการขาย */
  }
}

function format(prefix, ymd, seq) {
  return `${prefix}-${ymd}-${String(seq).padStart(3, '0')}`;
}

/** แกะเลขที่เอกสารกลับเป็นส่วนประกอบ — คืน null ถ้ารูปแบบไม่ตรง */
export function parseDocNo(docNo) {
  const m = PATTERN.exec(String(docNo || ''));
  if (!m) return null;
  return { prefix: m[1], ymd: m[2], seq: Number(m[3]) };
}

/**
 * เลขถัดไปของชนิดนี้ — เรียกกี่ครั้งก็ได้เลขเดิม จนกว่าจะ commit
 * @param {string} prefix เช่น 'PO' 'RC' 'SO'
 */
export function peekDocNo(prefix, now = new Date()) {
  const key = String(prefix).toLowerCase();
  const ymd = todayYmd(now);
  const cur = readAll()[key];
  const seq = cur && cur.ymd === ymd ? Number(cur.seq || 0) + 1 : 1;
  return format(prefix, ymd, seq);
}

/**
 * ยืนยันว่าเลขนี้ถูกใช้ไปแล้ว — ดันตัวนับให้ผ่านเลขนี้
 *
 * เรียกซ้ำด้วยเลขเดิมไม่ทำให้ตัวนับขยับเกิน (idempotent)
 * เพราะทางเดินของเอกสารมีหลายทาง เช่น พิมพ์แล้วค่อยกดยืนยัน
 *
 * @returns {boolean} true เมื่อเลขถูกบันทึกเป็นเลขล่าสุด
 */
export function commitDocNo(docNo) {
  const parsed = parseDocNo(docNo);
  if (!parsed) return false;

  const key = parsed.prefix.toLowerCase();
  const all = readAll();
  const cur = all[key];

  if (cur && cur.ymd === parsed.ymd && Number(cur.seq || 0) >= parsed.seq) return false;
  // วันเก่ากว่าที่บันทึกไว้ = เครื่องปรับเวลาถอยหลัง อย่าให้ตัวนับถอยตาม
  if (cur && cur.ymd > parsed.ymd) return false;

  all[key] = { ymd: parsed.ymd, seq: parsed.seq };
  writeAll(all);
  return true;
}

/** เลขล่าสุดที่ออกไปแล้วของวันนี้ — เอาไปโชว์ในหน้าตั้งค่าได้ */
export function lastDocNo(prefix, now = new Date()) {
  const cur = readAll()[String(prefix).toLowerCase()];
  if (!cur || cur.ymd !== todayYmd(now)) return '';
  return format(prefix, cur.ymd, cur.seq);
}
