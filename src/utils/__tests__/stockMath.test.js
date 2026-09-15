import { deductStockFromWarehouses, totalStockOf } from '../stockMath';

const makeProduct = () => ({
  id: '1', sku: 'P-001', name: 'กาแฟอาราบิก้า',
  warehouse1: 25, warehouse2: 15, warehouse3: 5, stock: 45,
});

describe('deductStockFromWarehouses', () => {
  it('ตัดจากคลัง 1 ก่อน และยอดรวมต้องเท่ากับผลบวกของคลังย่อยเสมอ', () => {
    const out = deductStockFromWarehouses(makeProduct(), 5);
    expect(out.warehouse1).toBe(20);
    expect(out.warehouse2).toBe(15);
    expect(out.warehouse3).toBe(5);
    expect(out.stock).toBe(40);
    expect(out.stock).toBe(totalStockOf(out));
  });

  it('ตัดข้ามไปคลัง 2 และ 3 เมื่อคลังก่อนหน้าหมด', () => {
    const out = deductStockFromWarehouses(makeProduct(), 30);
    expect(out.warehouse1).toBe(0);
    expect(out.warehouse2).toBe(10);
    expect(out.warehouse3).toBe(5);
    expect(out.stock).toBe(15);
  });

  it('ขายเกินของที่มี ต้องไม่ติดลบ', () => {
    const out = deductStockFromWarehouses(makeProduct(), 999);
    expect(out.warehouse1).toBe(0);
    expect(out.warehouse2).toBe(0);
    expect(out.warehouse3).toBe(0);
    expect(out.stock).toBe(0);
  });

  it('🔴 บั๊กเดิม: ขายแล้วรับของเข้า สต็อกต้องไม่เด้งกลับ', () => {
    // ขาย 5 จาก 45 -> ต้องเหลือ 40
    const afterSale = deductStockFromWarehouses(makeProduct(), 5);
    // รับเข้าคลัง 1 อีก 1 ชิ้น (สูตรเดียวกับ handleCompletePO: stock = w1+w2+w3)
    const afterPo = { ...afterSale, warehouse1: afterSale.warehouse1 + 1 };
    afterPo.stock = totalStockOf(afterPo);
    expect(afterPo.stock).toBe(41); // เดิมบั๊กจะได้ 46
  });

  it('สินค้าที่ไม่มีข้อมูลคลังย่อย ให้ถือว่าทั้งหมดอยู่คลัง 1', () => {
    const out = deductStockFromWarehouses({ id: '9', stock: 8 }, 3);
    expect(out.warehouse1).toBe(5);
    expect(out.stock).toBe(5);
  });
});
