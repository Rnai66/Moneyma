/**
 * promo.js — แหล่งความจริงเดียวของโปรโมชัน
 *
 * ⚠️ ห้ามเขียนวันที่หรือเปอร์เซ็นต์ส่วนลดกระจายไว้ที่อื่น ให้ import จากไฟล์นี้เสมอ
 *
 * เหตุผล: ส่วนลดจริงถูกบังคับใช้ที่ Google Play (offer) ไม่ใช่ที่แอป
 * ไฟล์นี้มีหน้าที่ทำให้ "สิ่งที่แอปแสดง" ตรงกับ "สิ่งที่ Play เก็บเงินจริง" เท่านั้น
 * ถ้าสองอย่างไม่ตรงกันคือผิดนโยบายการแสดงราคาของ Play
 *
 * 🔴 Google Play offer ไม่มีวันเริ่ม/สิ้นสุดในตัว — ต้องเข้าไปกด Activate
 * และ Deactivate เองใน Play Console ตามวันที่ด้านล่าง
 * ไฟล์นี้ควบคุมได้แค่ฝั่งการแสดงผลในแอป
 */

export const PROMO = {
  id: 'q4-2026',

  // เขตเวลาไทย = UTC+7 (ระบุให้ชัด ไม่งั้นเครื่องที่ตั้งโซนอื่นจะเห็นโปรเปิด/ปิดผิดวัน)
  start: new Date('2026-10-01T00:00:00+07:00'),
  end:   new Date('2026-12-31T23:59:59+07:00'),

  /** ต้องตรงกับ offer ใน Play Console เป๊ะ ๆ */
  discounts: {
    monthly: 20,   // ฿99   -> ฿79   (เดือนแรกเท่านั้น)
    yearly:  40,   // ฿1,188 -> ฿713
    // lifetime ไม่ลด — เป็นตัวยึดราคาให้แผนรายปีดูคุ้ม
  },

  /** ราคาโปรฝั่งไทย ใช้เป็น fallback ตอนออฟไลน์เท่านั้น */
  fallbackPriceTHB: {
    monthly: 79,
    yearly:  713,
  },
};

/** โปรกำลังเปิดอยู่หรือไม่ */
export function isPromoActive(now = new Date()) {
  return now >= PROMO.start && now <= PROMO.end;
}

/** เหลืออีกกี่วัน (0 = ไม่ได้อยู่ในช่วงโปร) */
export function daysLeft(now = new Date()) {
  if (!isPromoActive(now)) return 0;
  return Math.max(1, Math.ceil((PROMO.end - now) / 86400000));
}

/**
 * ส่วนลดของรอบบิลที่ระบุ — คืน 0 เมื่อโปรปิด
 *
 * ใช้ตัวนี้ทุกที่ที่จะแสดง % ส่วนลด อย่า hardcode เลข 40 ลงใน JSX
 * ไม่งั้นพอ 1 ม.ค. แบนเนอร์จะยังโชว์ทั้งที่ Play ปิด offer ไปแล้ว
 */
export function discountFor(period, now = new Date()) {
  if (!isPromoActive(now)) return 0;
  return PROMO.discounts[period] ?? 0;
}
