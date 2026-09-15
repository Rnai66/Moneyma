/**
 * คณิตศาสตร์ของสต็อก — แยกออกมาเป็นไฟล์ของตัวเองเพื่อให้เขียนเทสต์ได้
 * โดยไม่ต้องโหลดทั้งหน้า InventoryPOS (ซึ่งลาก Capacitor/กล้อง/AI มาด้วย)
 */

/**
 * ตัดสต็อกจากคลังย่อยตามลำดับ คลัง 1 -> คลัง 2 -> คลัง 3
 * แล้วคิดยอดรวม stock ใหม่จากผลบวกของคลังย่อยเสมอ
 *
 * 🔴 ห้ามกลับไปลบจาก prod.stock ตรง ๆ:
 *    ยอดรวมจะหลุดจาก warehouse1..3 แล้วพอรับของเข้า (PO) ซึ่งคิด
 *    stock = w1 + w2 + w3 ใหม่ ของที่ขายไปแล้วจะเด้งกลับมาทั้งหมด
 *
 * @param {object} prod สินค้า 1 ตัว
 * @param {number} qty จำนวนที่ขาย/ตัดออก
 * @returns {object} สินค้าที่อัปเดตคลังย่อยและยอดรวมแล้ว
 */
export function deductStockFromWarehouses(prod, qty) {
  let remaining = Math.max(0, Number(qty) || 0);
  let w1 = Number(prod.warehouse1 !== undefined ? prod.warehouse1 : prod.stock) || 0;
  let w2 = Number(prod.warehouse2) || 0;
  let w3 = Number(prod.warehouse3) || 0;

  const takeFrom = (available) => {
    const taken = Math.min(available, remaining);
    remaining -= taken;
    return available - taken;
  };

  w1 = takeFrom(w1);
  w2 = takeFrom(w2);
  w3 = takeFrom(w3);

  return { ...prod, warehouse1: w1, warehouse2: w2, warehouse3: w3, stock: w1 + w2 + w3 };
}

/** ยอดรวมที่ถูกต้องเสมอ = ผลบวกของคลังย่อย */
export function totalStockOf(prod) {
  const w1 = Number(prod.warehouse1 !== undefined ? prod.warehouse1 : prod.stock) || 0;
  const w2 = Number(prod.warehouse2) || 0;
  const w3 = Number(prod.warehouse3) || 0;
  return w1 + w2 + w3;
}
