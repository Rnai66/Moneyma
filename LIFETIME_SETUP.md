# แผน Lifetime (จ่ายครั้งเดียว) — สิ่งที่ต้องตั้งค่า

> เพิ่มเมื่อ 31 ก.ค. 2026 · โค้ดพร้อมแล้ว เหลือตั้งค่าใน Play Console + RevenueCat

---

## สรุปสิ่งที่โค้ดทำแล้ว

| ไฟล์ | เพิ่มอะไร |
|---|---|
| `SubscriptionService.js` | `PLANS.lifetime` (฿1,990 · `oneTime: true`) + `ONE_TIME_PLANS` |
| | `FEATURE_GATES` — lifetime ได้สิทธิ์เท่า Pro ทุกข้อ |
| | `findPackage()` จับคู่แพ็กเกจได้ทุกรูปแบบชื่อ (ทดสอบผ่าน 8/8) |
| | `planFromIdentifier()` เดาแผนจากชื่อ product/package |
| | `purchaseRevenueCat()` — lifetime บันทึก `current_period_end: null` |
| | `restoreRevenueCat()` — กู้คืน lifetime ได้ ไม่ถูกมองข้าม |
| | `loadSubscription()` — ข้ามการเช็ควันหมดอายุสำหรับ lifetime |
| | `createStripeCheckout()` — ส่ง `mode: 'payment'` แทน `subscription` |
| `PremiumSettings.js` | การ์ด LIFETIME พร้อมป้าย "จ่ายครั้งเดียว" |

### เรื่องสำคัญ: จับคู่แพ็กเกจแบบยืดหยุ่น

ปัญหาเดิมคือ RevenueCat ตั้งชื่อ package เป็น `$rc_monthly` / `$rc_annual` / `$rc_lifetime`
แต่โค้ดเดิมหาแค่ `pro_monthly` หรือ `monthly` → หาไม่เจอ ซื้อไม่ได้

ตอนนี้ `findPackage()` ไล่หา 3 ชั้น:

1. ชื่อตรงเป๊ะ — `pro_monthly`
2. แผน + รอบตรงกันทั้งคู่ — ดูจากทั้ง package id และ product id
3. รอบอย่างเดียว — ครอบ `$rc_monthly`, `$rc_annual`, `$rc_lifetime`

**ผลคือใช้ได้กับ offering `default` ที่คุณตั้งไว้แล้วทันที ไม่ต้องเปลี่ยนชื่ออะไร**

---

## ที่ต้องทำใน Play Console

Monetize → Products → **In-app products** (ไม่ใช่ Subscriptions)

| ช่อง | ค่า |
|---|---|
| Product ID | `lifetime` |
| ประเภท | **One-time product** → **Non-consumable** (ห้ามเป็น consumable ไม่งั้นซื้อซ้ำได้) |
| ชื่อ | MoneyMa Lifetime |
| ราคา | ฿1,990 (ต้องตรงกับที่แสดงในแอป) |
| สถานะ | **Active** |

> ถ้าจะใช้ราคาอื่น แก้ 2 ที่ให้ตรงกัน: `PLANS.lifetime.price.lifetime` และการ์ด
> `lifetime_lifetime` ใน `PremiumSettings.js`

---

## ที่ต้องทำใน RevenueCat

1. **Products** → Import product `lifetime` จาก Play
2. **Entitlements** → `Premium` → attach product `lifetime` เข้าไปด้วย
   (ต้องอยู่ entitlement เดียวกับ pro เพราะได้สิทธิ์ชุดเดียวกัน)
3. **Offerings** → `default` → package `$rc_lifetime` ผูกกับ product `lifetime`
   ✅ ข้อนี้คุณทำไว้แล้ว

---

## ⚠️ ข้อควรระวัง

**1. Lifetime ไม่มีวันหมดอายุ — ต้องกู้คืนได้เสมอ**

ผู้ใช้ที่จ่ายแล้วเปลี่ยนเครื่อง ต้องกด "กู้คืนการซื้อ" ได้ โค้ด `restoreRevenueCat()`
รองรับแล้ว แต่**ต้องมีปุ่มให้กดในหน้า Premium** — Google Play บังคับสำหรับ
non-consumable ถ้าไม่มีอาจถูกปฏิเสธตอนรีวิว

**2. อย่าให้ซื้อซ้ำ**

ต้องเป็น **non-consumable** ใน Play Console ถ้าตั้งเป็น consumable ผู้ใช้จะซื้อซ้ำได้
และเสียเงินฟรี

**3. Lifetime กับ subscription พร้อมกัน**

ถ้าผู้ใช้มี Pro รายเดือนอยู่แล้วมาซื้อ Lifetime ควรแนะให้ยกเลิกรายเดือนเอง
(RevenueCat ไม่ยกเลิกให้อัตโนมัติ) — พิจารณาเพิ่มข้อความเตือนก่อนซื้อ

**4. บนเว็บยังซื้อ Lifetime ไม่ได้**

ต้องสร้าง Stripe Price แบบ one-time แล้วใส่ `REACT_APP_STRIPE_LIFETIME_PRICE_ID`
ใน `.env` และแก้ Supabase Edge Function `stripe-checkout` ให้รับพารามิเตอร์ `mode`
(โค้ดฝั่งแอปส่งไปให้แล้ว)

---

## เปิดใช้งาน

เมื่อตั้งค่าครบทั้ง Play + RevenueCat แล้ว เปลี่ยน `NATIVE_BILLING_READY` จาก
`false` เป็น `true` ใน 4 ไฟล์:

```
src/App.js
src/pages/PremiumSettings.js
src/components/UpgradeModal.js
src/SubscriptionContext/PaywallScreen.js
```

แล้ว build ใหม่:

```bash
rm -rf build android/app/src/main/assets/public
npm run sync-android
```

---

## ทดสอบ

1. เพิ่มบัญชีทดสอบใน Play Console → Setup → **License testing**
2. ติดตั้งจาก Internal testing track
3. เปิด `chrome://inspect` ดู Console
4. กดซื้อ Lifetime → ต้องขึ้นหน้าจ่ายเงินของ Play (ไม่เสียเงินจริงสำหรับ license tester)
5. ซื้อสำเร็จ → ตรวจใน Supabase ตาราง `subscriptions`:
   - `plan` = `lifetime`
   - `current_period_end` = **null** ← สำคัญ ถ้ามีค่าแปลว่าจะถูกมองว่าหมดอายุ
6. ถอนแอป → ติดตั้งใหม่ → กดกู้คืนการซื้อ → ต้องกลับมาเป็น lifetime
