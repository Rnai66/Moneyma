# สร้าง Subscription ใน Play Console — ยังไม่มีสักตัว ต้องสร้างใหม่

> 18 ส.ค. 2026 · แทนที่ส่วน A ของ `PLAY_PRICING_STEPS.md` (ที่เขียนไว้ว่า "แก้ราคาทับ" — ใช้ไม่ได้เพราะยังไม่มีอะไรให้แก้)

---

## สิ่งที่เพิ่งรู้ และผลที่ตามมา

หน้า **Subscriptions** ว่างเปล่า แปลว่า **ยังไม่เคยสร้าง subscription ใน Play Console เลย**

**แล้ว product `monthly` / `yearly` ใน RevenueCat คืออะไร?**
RevenueCat ให้เพิ่ม product ด้วยการ**พิมพ์ ID เอง**ได้ โดยไม่ต้องมีของจริงในร้าน — มันจะไปตรวจกับ Play ก็ต่อเมื่อผูก **service account** แล้วเท่านั้น
ที่เห็นอยู่จึงน่าจะเป็น **ตัวชี้ที่ยังไม่มีปลายทาง** และเป็นเหตุผลว่าทำไมราคาที่เห็นถึงเป็น USD ของ Test Store ไม่ใช่ราคาบาทจากร้าน

**ข่าวดี:** สร้างใหม่แปลว่าได้ตั้งทุกอย่างถูกตั้งแต่แรก ไม่ต้องมาแก้ทีหลังในสิ่งที่ Google ไม่ให้แก้

---

## 🔴 กฎที่ทำให้พลาดแล้วแก้ไม่ได้

| สิ่งที่ตั้ง | แก้ทีหลังได้ไหม |
|---|---|
| **Product ID** (`monthly`) | ❌ **ห้ามพลาด** — เปลี่ยนไม่ได้ ใช้ซ้ำไม่ได้ตลอดกาล |
| **Base plan ID** (`p1m`) | ❌ เปลี่ยนไม่ได้ ใช้ซ้ำไม่ได้ **หลัง activate** |
| **รอบบิล** (เดือน/ปี) | ❌ ผูกกับ base plan ต้องสร้างใหม่ |
| ราคา | ✅ แก้ทับได้ |
| ชื่อที่แสดงผู้ใช้ · Benefits | ✅ แก้ได้ |

> Product ID ยาวได้ 40 ตัว · ขึ้นต้นด้วยตัวเลขหรือตัวพิมพ์เล็ก · ใช้ `_` และ `.` ได้
> Base plan ID ใช้ได้แค่ **ตัวเลข ตัวพิมพ์เล็ก และขีดกลาง**

---

## ⚠️ ต้องใช้ ID พวกนี้เป๊ะ ๆ

```
Product ID:     monthly     yearly
Base plan ID:   p1m         p1y
```

**ทำไมห้ามเปลี่ยน:** RevenueCat มี product ชื่อ `monthly` / `yearly` ลงทะเบียนไว้แล้ว และผูกเข้า offering `default` เรียบร้อย
ถ้าสร้างใน Play เป็นชื่ออื่น RC จะจับคู่ไม่ได้ → ต้องลบ product ใน RC สร้างใหม่ ผูก entitlement ใหม่ ใส่เข้า offering ใหม่ทั้งชุด

> ตรวจแล้วว่า `findPackage()` ในโค้ดรองรับชื่อได้หลายแบบ (`monthly`, `pro_monthly`, `monthly:p1m` ผ่านหมด)
> **แต่ RevenueCat ไม่ยืดหยุ่นแบบนั้น** — ตัวที่บังคับให้ต้องใช้ `monthly` / `yearly` คือ RC ไม่ใช่โค้ด

---

## ส่วน A — สร้าง subscription รายเดือน

### A1. สร้างตัว subscription

```
Play Console → MoneyMa → Monetize with Play → Products → Subscriptions
  → Create subscription
```

| ช่อง | ใส่อะไร |
|---|---|
| **Product ID** | `monthly` 🔴 พิมพ์ให้ถูกตั้งแต่ครั้งแรก |
| **Name** (≤55 ตัว, ผู้ใช้เห็น) | `MoneyMa Premium รายเดือน` |

กด **Create** → เข้าไปที่ **Edit subscription details**

**Benefits** (ไม่บังคับ · ได้ 4 ข้อ ข้อละ ≤40 ตัว) — ใส่ประโยชน์จริง **ห้ามใส่ราคาหรือคำโปรโมชัน**:

```
สแกนสลิปไม่จำกัด
ซิงก์ข้ามอุปกรณ์
ส่งออก Excel และ PDF
งบประมาณไม่จำกัดหมวด
```

### A2. เพิ่ม base plan

กด **Add base plan**

| ช่อง | ค่า |
|---|---|
| **Base plan ID** | `p1m` |
| **ประเภท** | **Auto-renewing** |
| **Billing period** | **Monthly** |
| **Grace period** | **3 วัน** |
| **Account hold** | คำนวณเอง = 60 − 3 = **57 วัน** |
| **Resubscribe** | **เปิด** |

> **Grace period คืออะไรและทำไมต้องเปิด:** เวลาบัตรผู้ใช้ตัดไม่ผ่าน (บัตรหมดอายุ วงเงินไม่พอ)
> ถ้าไม่มี grace period ระบบตัดสิทธิ์ทันที ผู้ใช้เปิดแอปมาเจอว่าจ่ายเงินแล้วแต่ใช้ไม่ได้ → รีวิว 1 ดาว
> 3 วันคือช่วงที่ Google ลองเรียกเก็บซ้ำให้ ผู้ใช้ยังใช้งานได้ปกติ — **เก็บลูกค้าคืนได้ฟรีโดยไม่ต้องทำอะไร**

### A3. ตั้งราคา

หาแถว **Thailand** → คลิกไอคอนดินสอในคอลัมน์ Price → พิมพ์ **99** (ราคาไม่รวมภาษี ระบบบวกให้)

ประเทศอื่นกด **Update prices** → เลือกประเทศ → **Set price** (ดูตารางส่วน D)

### A4. Activate

**Save** → **Activate**

> 🔴 กด Save อย่างเดียวไม่พอ — ถ้าไม่ Activate ระบบจะไม่คืน product นี้ให้แอปเลย

---

## ส่วน B — สร้าง subscription รายปี

ทำเหมือนส่วน A แต่เปลี่ยนค่า:

| ช่อง | ค่า |
|---|---|
| **Product ID** | `yearly` |
| **Name** | `MoneyMa Premium รายปี` |
| **Base plan ID** | `p1y` |
| **Billing period** | **Yearly** |
| **Grace period** | **7 วัน** (account hold = 53 วัน) |
| **ราคาไทย** | **1188** |

> รายปีใช้ grace period ยาวกว่าเพราะยอดเรียกเก็บสูงกว่า โอกาสที่บัตรจะติดวงเงินมีมากกว่า
> เสียลูกค้ารายปีหนึ่งคน = เสียรายได้ทั้งปี ให้เวลาแก้ปัญหานานหน่อยคุ้มกว่า

🔴 **ราคาต้องเป็น ฿1,188 (= 99 × 12) ห้ามใส่ ฿990** — ราคาตั้งต้องไม่ฝังส่วนลดไว้ ไม่งั้นตอนทำ offer โปร Q4 เปอร์เซ็นต์ที่ Play แสดงจะไม่ตรงกับที่โฆษณา

---

## ส่วน C — Lifetime (คนละเมนู)

```
Monetize with Play → Products → One-time products
```

ตรวจก่อนว่ามี `lifetime` อยู่แล้วหรือยัง — ถ้ายังไม่มีก็สร้างใหม่:

| ช่อง | ค่า |
|---|---|
| **Product ID** | `lifetime` |
| **ประเภท** | **One-time product → Non-consumable** |
| **ชื่อ** | `MoneyMa Lifetime` |
| **ราคาไทย** | **2,990** |
| สถานะ | **Active** |

🔴 **ต้องเป็น Non-consumable** — ถ้าเผลอตั้งเป็น Consumable ผู้ใช้จะซื้อซ้ำได้เรื่อย ๆ และเสียเงินฟรี

---

## ส่วน D — ราคาครบ 10 ประเทศ

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

> **ไทยต้องพิมพ์เองเสมอ** — ถ้าปล่อย auto-convert จากราคา default อาจได้ตัวเลขผิดไปหลายเท่า
> ที่เหลือปล่อย auto-convert ก่อนได้ ค่อยกลับมาเก็บทีหลัง

---

## ส่วน E — เชื่อมกลับเข้า RevenueCat

**ต้องทำตามลำดับนี้เท่านั้น** — ข้ามขั้นแล้วจะเจอ error ที่หาสาเหตุยาก

### 1. ผูก service account ก่อน (ถ้ายังไม่ได้ทำ) 🔴 ด่วนที่สุด

```
Play Console → Setup → API access → Service accounts
สิทธิ์ที่ต้องให้: View financial data + Manage orders and subscriptions
```
เอา JSON ไปใส่ที่ RevenueCat → Apps → Google Play

> **Google ใช้เวลาถึง 36 ชั่วโมง** กว่าสิทธิ์จะมีผล — **ทำข้อนี้ก่อนเป็นอันดับแรกเสมอ** จะได้ไม่ต้องรอเปล่า ๆ
> ถ้ายังไม่ผูก RevenueCat จะดึงราคาจริงมาแสดงไม่ได้ และตรวจไม่ได้ด้วยซ้ำว่า product มีอยู่จริงไหม

### 2. ตรวจ product ใน RevenueCat

Product catalog → Products → คลิกตัวที่ store เป็น **Moneyma (Play Store)**
ราคาต้องเปลี่ยนจาก USD เป็น **บาท** ภายใน 5–15 นาทีหลัง sync

**ถ้ายังเป็น USD 9.99 อยู่** = ยังจับคู่กับ Play ไม่ได้ → เช็ค ID สะกดตรงกันไหม และ service account มีผลแล้วหรือยัง

### 3. Entitlement

Entitlements → **`Premium`** (P ตัวใหญ่ ตรงกับ `ENTITLEMENT_ID` ในโค้ด) → attach ครบทั้ง 3 ตัว

### 4. Offering

`default` → ตรวจว่า package ทั้ง 3 ผูกกับ product ฝั่ง Play Store แล้ว → **ตั้งเป็น Current**
(กด Actions ⋯ ที่แถว `default` — ถ้ามีตัวเลือก **"Make current"** แปลว่ายังไม่ได้ตั้ง)

---

## เช็คลิสต์ก่อนเปิดขาย

- [ ] ผูก service account แล้ว และรอครบ 36 ชม.
- [ ] `monthly` + base plan `p1m` · ราคา ฿99 · **Activate**
- [ ] `yearly` + base plan `p1y` · ราคา ฿1,188 · **Activate**
- [ ] `lifetime` · Non-consumable · ราคา ฿2,990 · **Active**
- [ ] RevenueCat แสดงราคาเป็นบาทแล้วทั้ง 3 ตัว
- [ ] Entitlement `Premium` มี product ครบ 3
- [ ] Offering `default` เป็น **Current**
- [ ] ใส่ `REACT_APP_NATIVE_BILLING=true` ใน `.env.local` แล้ว **`npm run build` ใหม่**
- [ ] ทดสอบซื้อจริงด้วยบัญชี license tester ครบทั้ง 3 แผน
- [ ] ทดสอบกู้คืนการซื้อหลังถอนแอปแล้วติดตั้งใหม่

**ค่อยสร้าง offer โปร Q4 หลังจากนี้** (`q4-2026-m20` ฿79 · `q4-2026-y40` ฿713) — สร้าง 30 ก.ย. **แต่ยังไม่ Activate จนถึง 1 ต.ค.**

---

## แหล่งอ้างอิง

- [Create and manage subscriptions — Play Console Help](https://support.google.com/googleplay/android-developer/answer/140504)
- [Understanding subscriptions — Play Console Help](https://support.google.com/googleplay/android-developer/answer/12154973)
- [Overview of one-time products — Play Console Help](https://support.google.com/googleplay/android-developer/answer/16430488)
- [About subscriptions — Play Billing](https://developer.android.com/google/play/billing/subscriptions)
