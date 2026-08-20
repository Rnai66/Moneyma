# แก้ราคาใน Play Console — ทีละคลิก

> 17 ส.ค. 2026 (อัปเดตราคา Lifetime 18 ส.ค.) · เป้าหมาย: `monthly` ฿99 · `yearly` ฿1,188 · `lifetime` **฿2,990**
> ทำตอนนี้ได้ฟรีเพราะ **ยังไม่มีสมาชิกจ่ายเงินสักคน** — หลังจากมีคนแรกแล้วการขึ้นราคาต้องผ่าน opt-in flow 37 วัน

---

## ⛔ สามข้อห้าม อ่านก่อนกดอะไร

| ห้าม | เพราะ |
|---|---|
| **ห้ามกด Deactivate แล้วสร้างใหม่** | Google: *"you can't delete subscriptions, base plans, and offers, or reuse their IDs"* — ชื่อ `monthly` / `yearly` จะใช้ไม่ได้อีกตลอดไป ต้องไปใช้ `monthly2` แล้วลากยาวไปถึงต้องแก้โค้ดและ import RevenueCat ใหม่ทั้งชุด |
| **ห้ามใช้ auto-convert จาก USD สำหรับไทย** | $9.99 แปลงเป็นบาทได้ ~฿325 = แพงกว่าที่ตั้งใจ 3.3 เท่า **ต้องพิมพ์ราคาไทยเองเสมอ** |
| **ห้ามฝังส่วนลดไว้ในราคาตั้ง** | รายปีต้องเป็น ฿1,188 (= 99 × 12) ไม่ใช่ ฿990 — ส่วนลดไปอยู่ที่ offer ไม่งั้น Play จะแสดง % ไม่ตรงกับที่โฆษณา |

**ไม่ต้อง deactivate อะไรเลย — ราคา base plan แก้ทับได้ตรง ๆ** ราคาใหม่มีผลกับการซื้อใหม่ภายในไม่กี่ชั่วโมง

---

## ส่วน A — รายเดือน กับ รายปี (Subscriptions)

### A1. หา subscription

```
Play Console → เลือกแอป MoneyMa
  → Monetize with Play → Products → Subscriptions
```

จะเห็นรายการ subscription — คลิก **ลูกศรขวา (›)** ที่ `monthly`

### A2. เข้าไปที่ base plan

ในหน้ารายละเอียด เลื่อนหาหัวข้อ **"Base plans and offers"**
คลิก **ลูกศรขวา (›)** ที่ base plan ที่ต้องการแก้

> ถ้ามี base plan หลายตัว ให้ดูตัวที่ **Active** และรอบบิลตรงกับที่ต้องการ (Monthly / Yearly)

### A3. ตั้งราคาไทย

**วิธีตั้งทีละประเทศ** (แนะนำสำหรับไทย — ต้องแม่นที่สุด)

1. เลื่อนไปที่ตารางราคาตามภูมิภาค
2. หาแถว **Thailand**
3. คลิก **ไอคอนดินสอ (✏️)** ในคอลัมน์ **Price**
4. พิมพ์ **99** (สำหรับ `monthly`) — เป็นราคา**ไม่รวมภาษี** ระบบบวกให้เอง
5. กด **Save**

**วิธีตั้งทีเดียวหลายประเทศ** (ใช้กับ 9 ประเทศที่เหลือ)

1. คลิก **Update prices**
2. เลือกประเทศที่ต้องการ
3. คลิก **Set price**
4. ใส่ราคาและเลือกสกุลเงิน
5. คลิก **Update** → **Save**

### A4. ทำซ้ำกับ `yearly`

กลับไป Subscriptions → `yearly` → base plan → ตั้ง Thailand = **1188**

### A5. Activate

หลังตั้งราคาครบ กด **Save** แล้วกด **Activate**

> 🔴 ถ้ากดแค่ Save ไม่กด Activate → Google Play Billing **จะไม่คืน product นี้เลย** แอปจะขึ้นว่าไม่มีแพ็กเกจ

---

## ส่วน B — Lifetime (One-time products)

⚠️ **อยู่คนละเมนูกับ Subscriptions** — Play Console เปลี่ยนชื่อเมนูนี้จาก "In-app products" เป็น **"One-time products"** แล้ว

```
Monetize with Play → Products → One-time products
```

1. คลิก **ลูกศรขวา (›)** ที่ `lifetime`
2. ในหัวข้อ **"Purchase options and offers"** คลิก **ลูกศรขวา (›)** ที่ purchase option
3. เลื่อนไปที่ส่วนราคา
4. หาแถว **Thailand** → คลิก **ไอคอนแก้ไข** ในคอลัมน์ Price → ใส่ราคา
5. **Save** → **Activate**

**ตั้งหลายประเทศพร้อมกัน:** คลิก **Set prices** → **Bulk edit pricing** → เลือกประเทศ → **Continue** → ใส่ราคา + สกุลเงิน → **Apply** → **Continue**

### 🔴 ตรวจให้แน่ว่าเป็น Non-consumable

ถ้าตั้งเป็น **Consumable** ผู้ใช้จะซื้อ Lifetime ซ้ำได้เรื่อย ๆ และเสียเงินฟรี
ต้องเป็น **Non-consumable** เท่านั้น

### ✅ ราคา Lifetime = ฿2,990 (ตัดสินใจแล้ว 18 ส.ค.)

= **2.52 เท่า** ของรายปีราคาตั้ง ฿1,188 · อยู่ในเกณฑ์ปลอดภัย 2.5–3 เท่า
จุดคุ้มทุน 2.52 ปีเทียบราคาตั้ง · **4.19 ปี** เทียบราคาโปร ฿713 — นานพอที่จะไม่กินรายได้ต่อเนื่อง

## ส่วน C — ตารางราคาครบ 10 ประเทศ

| ประเทศ | สกุล | `monthly` | `yearly` | `lifetime` |
|---|---|---|---|---|
| **ไทย** | THB | **99** | **1,188** | **2,990** |
| สิงคโปร์ | SGD | 4.98 | 59.98 | 149.98 |
| มาเลเซีย | MYR | 12.90 | 154.90 | 389.90 |
| อินโดนีเซีย | IDR | 39,000 | 468,000 | 1,190,000 |
| ฟิลิปปินส์ | PHP | 149 | 1,790 | 4,490 |
| เวียดนาม | VND | 69,000 | 828,000 | 2,090,000 |
| บรูไน | BND | 4.98 | 59.98 | 149.98 |
| กัมพูชา | USD | 2.99 | 35.99 | 89.99 |
| ลาว | USD | 2.99 | 35.99 | 89.99 |
| เมียนมา | USD | 2.49 | 29.99 | 74.99 |

> **ถ้าไม่มีเวลา:** ตั้งเองแค่ **ไทย** ก่อน แล้วปล่อยที่เหลือ auto-convert ค่อยกลับมาเก็บทีหลัง
> แต่ **ไทยต้องพิมพ์เองเสมอ** เพราะ auto-convert จะได้ราคาผิดไปหลายเท่า

---

## ส่วน D — ตรวจว่าสำเร็จ

### 1. ใน Play Console
ทั้ง 3 product ต้องขึ้นสถานะ **Active** และราคาไทยตรงตามตาราง

### 2. ใน RevenueCat (รอสัก 5–15 นาที)
```
Product catalog → Products → คลิกตัวที่ store เป็น "Moneyma (Play Store)"
```
ราคาต้องเปลี่ยนเป็นบาทตามที่ตั้ง — **ถ้ายังเป็น USD 9.99 นั่นคือตัว Test Store คนละตัวกัน**

### 3. ในแอปจริง
เปิด `chrome://inspect` → Console → เข้าหน้า Premium

| เห็นข้อความ | แปลว่า |
|---|---|
| `RevenueCat initialized successfully` | คีย์ถูก ✓ (Android ใส่คีย์จริงแล้ว) |
| `[Billing] RevenueCat returned no packages` | ยังไม่กด **Activate** หรือ offering ยังไม่ได้ตั้งเป็น **Current** |

ถ้าทุกอย่างถูก หน้า Premium จะแสดงราคาที่ดึงมาจากร้าน (เช่น `฿99.00` มีทศนิยม) ไม่ใช่ค่า fallback ในโค้ด (`฿99` ไม่มีทศนิยม) — **ดูทศนิยมเป็นตัวแยกได้เลย**

---

## ถ้าติดปัญหา

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| แก้ราคาไม่ได้ ช่องเป็นสีเทา | base plan ยังไม่ activate หรือกำลังอยู่ในสถานะ draft — กด Save ก่อน |
| ไม่เห็นเมนู One-time products | เมนูเดิมชื่อ "In-app products" — Google เปลี่ยนชื่อแล้ว ถ้ายังเห็นชื่อเก่าก็คืออันเดียวกัน |
| ตั้งราคาแล้วแต่แอปยังเห็นราคาเก่า | CRA ฝัง env ตอน build · และ Play cache ราคาฝั่ง client — ถอนแอปแล้วติดตั้งใหม่ |
| RevenueCat ยังไม่ sync ราคาใหม่ | ต้องผูก **service account** ให้เสร็จก่อน (Play Console → Setup → API access) และ Google ใช้เวลาถึง **36 ชม.** หลังให้สิทธิ์ |
| ขึ้นว่าราคาต่ำกว่าขั้นต่ำของประเทศ | แต่ละสกุลเงินมีราคาขั้นต่ำ — ปรับขึ้นเป็นเลขที่ Play ยอมรับ |

---

## หลังราคานิ่งแล้วค่อยทำต่อ

**อย่าเพิ่งสร้าง offer โปร Q4** จนกว่าราคาตั้งจะถูกและ Activate ครบ เพราะ Play คำนวณ % ส่วนลดจากราคาตั้ง ถ้าราคาตั้งยังผิด เปอร์เซ็นต์ที่แสดงจะผิดตามไปด้วย

พอราคานิ่งแล้ว: สร้าง `q4-2026-m20` (฿79) และ `q4-2026-y40` (฿713) ตามไฟล์ `02-สเปกงานเทคนิค` แล้ว**ยังไม่ต้อง activate** จนถึง 1 ต.ค.

---

## แหล่งอ้างอิง

- [Create and manage subscriptions — Play Console Help](https://support.google.com/googleplay/android-developer/answer/140504)
- [Overview of one-time products — Play Console Help](https://support.google.com/googleplay/android-developer/answer/16430488)
- [Understanding subscriptions — Play Console Help](https://support.google.com/googleplay/android-developer/answer/12154973)
- [Change subscription prices — Play Billing](https://developer.android.com/google/play/billing/price-changes)
- [Offer products in multiple currencies — Play Console Help](https://support.google.com/googleplay/android-developer/answer/1169947)
