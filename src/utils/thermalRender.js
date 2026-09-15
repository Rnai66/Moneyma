/**
 * thermalRender — วาดใบเสร็จลง canvas ตามจำนวนจุดจริงของหัวพิมพ์
 *
 * 🔴 ต้องวาดที่ความกว้าง "จุดจริง" เท่านั้น (58 มม. = 384 จุด, 80 มม. = 576 จุด)
 *    ถ้าวาดขนาดอื่นแล้วค่อยย่อ/ขยาย ตัวอักษรจะเบลอและ QR จะสแกนไม่ติด
 *    เพราะหัวพิมพ์ความร้อนพิมพ์ได้แค่ดำกับขาว ไม่มีเฉดกลาง
 *
 * 🔴 ฟอนต์ต้องโหลดเสร็จก่อนวาด ไม่งั้น canvas จะ fallback ไปฟอนต์ระบบ
 *    แล้วความกว้างข้อความเพี้ยนจนตัวเลขขวามือล้นขอบกระดาษ
 */

import { qrMatrix } from './qrGen';
import { dotWidth } from './escpos';

const FONT_STACK = "'Sarabun', 'Noto Sans Thai', sans-serif";

/** รอให้ฟอนต์พร้อมก่อนวัดความกว้างตัวอักษร */
async function ensureFonts(sizes) {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all(sizes.map((s) => document.fonts.load(`${s}px ${FONT_STACK}`)));
    await document.fonts.ready;
  } catch (e) {
    /* ฟอนต์โหลดไม่ได้ก็ยังวาดต่อด้วยฟอนต์ระบบ ดีกว่าไม่พิมพ์เลย */
  }
}

const money = (n) =>
  (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * วาดใบเสร็จ
 * @param {object} d       เอกสาร (printDoc) — ต้องมี docNo, dateText, items, total ฯลฯ
 * @param {object} ps      printerSettings — paperWidth, shopName, shopAddress, shopTaxId, headerNote, footerNote
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderSlipToCanvas(d, ps = {}) {
  const W = dotWidth(ps.paperWidth);
  const k = W / 384;                       // ตัวคูณขนาดตามความกว้างกระดาษ

  const S = {
    pad: Math.round(8 * k),
    body: Math.round(20 * k),
    small: Math.round(17 * k),
    tiny: Math.round(15 * k),
    shop: Math.round(28 * k),
    total: Math.round(25 * k),
    line: Math.round(27 * k),              // ระยะห่างบรรทัดของข้อความปกติ
  };

  await ensureFonts([S.body, S.small, S.tiny, S.shop, S.total]);

  // วาดสองรอบ: รอบแรกวัดความสูง รอบสองวาดจริง
  const measure = document.createElement('canvas');
  const height = paint(measure.getContext('2d'), d, ps, W, S, true);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  // ความสูงต้องหารด้วย 8 ลงตัวไม่จำเป็น แต่เผื่อขอบล่างไว้เล็กน้อย
  canvas.height = height + S.pad * 2;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  paint(ctx, d, ps, W, S, false);

  return canvas;
}

/**
 * วาดเนื้อใบเสร็จ — โหมด measure จะไม่วาดจริง แค่คืนความสูงที่ต้องใช้
 * @returns {number} ความสูงที่ใช้ไป
 */
function paint(ctx, d, ps, W, S, measureOnly) {
  const L = S.pad;                 // ขอบซ้าย
  const R = W - S.pad;             // ขอบขวา
  let y = S.pad;

  const set = (size, weight = '400') => {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
  };

  const draw = (fn) => { if (!measureOnly) fn(); };

  const center = (text, size, weight = '400') => {
    set(size, weight);
    const w = ctx.measureText(text).width;
    draw(() => ctx.fillText(text, (W - w) / 2, y));
    y += Math.round(size * 1.35);
  };

  const row = (left, right, size = S.body, weight = '400') => {
    set(size, weight);
    draw(() => {
      ctx.fillText(left, L, y);
      const w = ctx.measureText(right).width;
      ctx.fillText(right, R - w, y);
    });
    y += Math.round(size * 1.35);
  };

  /** ข้อความยาวให้ตัดบรรทัดตามความกว้างกระดาษ ไม่ใช่ตัดทิ้ง */
  const wrapped = (text, size = S.body, weight = '400') => {
    set(size, weight);
    const maxW = R - L;
    const words = String(text || '').split(/(\s+)/);
    let line = '';
    for (const part of words) {
      const test = line + part;
      if (ctx.measureText(test).width > maxW && line) {
        draw(() => ctx.fillText(line, L, y));
        y += Math.round(size * 1.3);
        line = part.trimStart();
      } else {
        line = test;
      }
    }
    if (line) {
      draw(() => ctx.fillText(line, L, y));
      y += Math.round(size * 1.3);
    }
  };

  const dashes = () => {
    set(S.small);
    const unit = ctx.measureText('-').width || 1;
    const n = Math.floor((R - L) / unit);
    draw(() => ctx.fillText('-'.repeat(n), L, y));
    y += Math.round(S.small * 1.2);
  };

  const gap = (n = 1) => { y += Math.round(S.pad * n); };

  // ── หัวใบเสร็จ ──
  center(ps.shopName || 'MoneyMa Store', S.shop, '700');
  if (ps.shopAddress) center(ps.shopAddress, S.tiny);
  if (ps.shopTaxId) center(`เลขผู้เสียภาษี: ${ps.shopTaxId}`, S.tiny);
  center('ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ', S.small, '600');
  if (ps.headerNote) center(ps.headerNote, S.tiny);
  dashes();

  row('เลขที่', String(d.docNo || '-'), S.small);
  row('วันที่', String(d.dateText || ''), S.small);
  row('ลูกค้า', String(d.customerName || 'ลูกค้าทั่วไป'), S.small);
  if (d.customerTaxId) row('Tax ID', String(d.customerTaxId), S.small);
  dashes();

  // ── รายการสินค้า ──
  for (const item of d.items || []) {
    wrapped(item.name, S.body, '600');
    const qty = Number(item.qty) || 0;
    const price = Number(item.price !== undefined ? item.price : item.purchaseCost) || 0;
    row(`${qty} x ${money(price)}`, money(qty * price), S.small);
  }
  dashes();

  // ── สรุปยอด ──
  row('ยอดรวมสินค้า', money(d.subtotal), S.small);
  if (Number(d.discount) > 0) row('ส่วนลด', `-${money(d.discount)}`, S.small);
  if (Number(d.vatAmount) > 0) row(`VAT ${d.vatPercent}%`, money(d.vatAmount), S.small);
  row('ยอดสุทธิ', money(d.total), S.total, '700');
  dashes();

  // ── QR เก็บใบเสร็จ ──
  if (d.shareUrl) {
    gap(0.5);
    const m = qrMatrix(d.shareUrl);
    const quiet = 2;
    const dim = m.length + quiet * 2;
    // 🔴 ขนาด QR ยึดตามขนาดจริงบนกระดาษ (~26 มม.) ไม่ใช่สัดส่วนของความกว้าง
    //    ถ้าใช้สัดส่วน กระดาษ 80 มม. จะได้ QR 45 มม. ซึ่งใหญ่เกินจำเป็น
    //    กินหมึกและกินเวลาส่งผ่านบลูทูธฟรี ๆ (พื้นที่ดำคือส่วนที่แพงที่สุด)
    //    ขนาดโมดูลต้องเป็นจำนวนเต็มจุด ไม่งั้นขอบโมดูลเหลื่อมจนสแกนไม่ติด
    const targetDots = Math.min(W - S.pad * 2, 26 * 8);   // 203dpi ≈ 8 จุด/มม.
    const unit = Math.max(3, Math.floor(targetDots / dim));
    const size = unit * dim;
    const x0 = Math.floor((W - size) / 2);

    draw(() => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0, y, size, size);
      ctx.fillStyle = '#000000';
      for (let r = 0; r < m.length; r++) {
        for (let c = 0; c < m.length; c++) {
          if (m[r][c]) {
            ctx.fillRect(x0 + (c + quiet) * unit, y + (r + quiet) * unit, unit, unit);
          }
        }
      }
    });
    y += size + Math.round(S.pad * 0.5);

    center('สแกนเก็บใบเสร็จใบนี้ไว้ในมือถือ ฟรี', S.small, '600');
    if (d.shareToken) center(`รหัส ${d.shareToken}`, S.tiny);
    dashes();
  }

  // ── ท้ายใบเสร็จ ──
  center(ps.footerNote || 'ขอบคุณที่ใช้บริการ', S.small);
  center('ออกโดยระบบ MoneyMa Business Stock & POS', S.tiny);

  return y;
}

/** ใบทดสอบ — ใช้เช็คว่าความกว้างกระดาษตั้งถูกและ QR สแกนติดไหม */
export async function renderTestSlipToCanvas(ps = {}) {
  return renderSlipToCanvas(
    {
      docNo: 'TEST',
      dateText: new Date().toLocaleString('th-TH'),
      customerName: 'ทดสอบการพิมพ์',
      items: [
        { name: 'ทดสอบตัวอักษรไทย สระอำ ไม้โท ฤๅ', qty: 1, price: 99 },
        { name: 'Latin ABCDEFG 1234567890', qty: 2, price: 50.5 },
      ],
      subtotal: 200,
      discount: 0,
      vatPercent: 0,
      vatAmount: 0,
      total: 200,
      shareUrl: 'https://moneyma-app.netlify.app/r/?t=TESTTESTTESTTEST',
      shareToken: 'TESTTESTTESTTEST',
    },
    ps
  );
}
