# แก้ปัญหา "No subscription offerings available" บนมือถือ

> ตรวจเมื่อ 31 ก.ค. 2026 · `com.moneyma.app`

---

## สาเหตุที่แท้จริง

**RevenueCat API key ใน `.env.local` ยังเป็นค่า placeholder**

```
REACT_APP_REVENUECAT_API_KEY_ANDROID=goog_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   ← ปลอม
REACT_APP_REVENUECAT_API_KEY_IOS=appl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx      ← ปลอม
```

ซ้ำร้ายโค้ดเดิมดักไม่เจอ เพราะเช็คแค่:

```js
if (API_KEY_ANDROID === 'goog_xxxxxx')   // ตรงเป๊ะเท่านั้น
```

ค่า placeholder ยาว 37 ตัวเลยหลุดผ่าน → แอปเรียก `Purchases.configure()` ด้วยคีย์ปลอม
→ RevenueCat ไม่คืน offerings → เด้ง `No subscription offerings available`

**ทำไมบนเว็บใช้ได้** เพราะเว็บใช้ Stripe คนละระบบกันคนละคีย์ ไม่เกี่ยวกับ RevenueCat

---

## แก้ในโค้ดแล้ว

| ไฟล์ | แก้อะไร |
|---|---|
| `PaymentService.js` | ตรวจ key แบบเข้มจริง (prefix + ความยาว + ตรวจ placeholder) ผ่าน 9/9 เคสทดสอบ · ถ้าคีย์ไม่ถูกต้อง เข้า mock mode พร้อม log บอกวิธีแก้ |
| `PaymentService.getOfferings()` | ถ้าไม่มี offering ที่ตั้งเป็น "current" จะ fallback ไปตัวแรกที่มีแพ็กเกจ · log สาเหตุที่เป็นไปได้ทั้ง 5 ข้อ |
| `SubscriptionService.purchasePlan()` | แทน error กำกวม ด้วยข้อความไทยที่บอกสาเหตุจริง |
| `PremiumSettings.js` | แสดงกล่องเตือนบนหน้า Premium ตั้งแต่โหลดเสร็จ ไม่ต้องรอให้ผู้ใช้กดแล้วค่อยเด้ง alert |

ตอนนี้ผู้ใช้จะเห็นข้อความชัดเจนว่าเกิดอะไรขึ้น และแนะนำให้ไปสมัครผ่านเว็บแทน

---

## สิ่งที่ต้องตั้งค่าเอง (เรียงตามลำดับ)

### 1. เอา API key จริงมาใส่

RevenueCat Dashboard → **Project settings → API keys**

- **Google Play** → คีย์ขึ้นต้น `goog_`
- **App Store** → คีย์ขึ้นต้น `appl_`

ใส่ใน `.env.local`:

```
REACT_APP_REVENUECAT_API_KEY_ANDROID=goog_<คีย์จริง>
REACT_APP_REVENUECAT_API_KEY_IOS=appl_<คีย์จริง>
```

> คีย์ `test_TOUxFbWvUbNTbyunIQBFcfwesVC` ในโน้ตเก่า **ไม่ใช่** platform key ของ RevenueCat
> (ไม่ขึ้นต้นด้วย `goog_`/`appl_`) ใช้ไม่ได้กับ Google Play

### 2. ผูก RevenueCat กับ Google Play

RevenueCat → Apps → Google Play → ใส่ **Service Account credentials (JSON)**

สร้างจาก Play Console → Setup → API access → Service accounts
สิทธิ์ที่ต้องให้: **View financial data** + **Manage orders and subscriptions**

> หลังให้สิทธิ์ Google ใช้เวลา **สูงสุด 36 ชั่วโมง** กว่าจะมีผล

### 3. สร้าง subscription products ใน Play Console

Play Console → Monetize → Products → **Subscriptions** → Create subscription

ตั้ง product ID ให้ตรงกับที่โค้ดมองหา (`{plan}_{period}`):

| Product ID | ราคา |
|---|---|
| `pro_monthly` | 99 บาท/เดือน |
| `pro_yearly` | ตามที่กำหนด |
| `business_monthly` | 299 บาท/เดือน |
| `business_yearly` | ตามที่กำหนด |

แต่ละตัวต้อง **Activate** ไม่ใช่แค่ save

### 4. ผูก product เข้ากับ Offering ใน RevenueCat

1. **Products** → Import จาก Play (หรือเพิ่มเอง)
2. **Entitlements** → สร้าง `Premium` → attach products เข้าไป
   (ต้องชื่อ `Premium` ตัว P ใหญ่ ตรงกับ `ENTITLEMENT_ID` ในโค้ด)
3. **Offerings** → สร้าง offering → เพิ่ม packages → **ตั้งเป็น Current**

### 5. แอปต้องขึ้น track แล้ว

🔴 **Google Play Billing จะไม่คืน product ใด ๆ ถ้าแอปยังไม่เคยถูก publish**

อัปโหลด AAB เข้า **Internal testing** อย่างน้อย 1 ครั้ง แล้วรอให้สถานะเป็น Available

### 6. ทดสอบบนอุปกรณ์ที่ถูกต้อง

| | ใช้ได้ไหม |
|---|---|
| มือถือจริง + login Play Store + เป็น license tester | ✅ ดีที่สุด |
| Emulator ที่เลือก image **"Google Play"** | ✅ ได้ |
| Emulator image **"Google APIs"** เฉย ๆ | ❌ ไม่มี Play Store → billing ใช้ไม่ได้เลย |
| ติดตั้งจาก Android Studio โดยตรง | ⚠️ ได้เฉพาะเมื่อ package + signature ตรงกับที่อยู่บน Play |

> จากภาพที่ส่งมาเป็น emulator — เช็คก่อนว่า AVD เป็น image ที่มี Play Store
> (Device Manager → ดูคอลัมน์ Play Store ต้องมีไอคอน ▶)

เพิ่ม license tester: Play Console → Setup → **License testing** → ใส่อีเมล Google ที่ใช้ทดสอบ
บัญชีเหล่านี้จะซื้อได้โดยไม่เสียเงินจริง

---

## ตรวจว่าแก้สำเร็จ

หลังใส่คีย์แล้ว **ต้อง build ใหม่** (CRA ฝัง env ตอน build เท่านั้น):

```bash
cd ~/projects/PFM
npm run build && npx cap copy android
```

เปิด `chrome://inspect` → Console แล้วเข้าหน้า Premium

| สิ่งที่เห็นใน Console | แปลว่า |
|---|---|
| `RevenueCat initialized successfully` | คีย์ถูกต้องแล้ว ✓ |
| `[Billing] RevenueCat android key missing or placeholder` | คีย์ยังไม่ถูก — ข้อ 1 |
| `[Billing] RevenueCat returned no packages` | คีย์ถูกแล้ว แต่ติดข้อ 2–6 |

---

## ระหว่างที่ยังตั้งค่าไม่เสร็จ

แอปจะแสดงกล่องเตือนบนหน้า Premium และแนะนำให้สมัครผ่านเว็บ ไม่เด้ง error กำกวมแล้ว

> ⚠️ **ข้อควรรู้เรื่องนโยบาย** — Google Play บังคับให้สินค้าดิจิทัลที่ใช้ในแอป
> ต้องซื้อผ่าน Play Billing เท่านั้น การลิงก์ผู้ใช้ออกไปจ่าย Stripe ข้างนอก
> ผิดนโยบายและอาจโดนถอดแอป **ต้องทำ RevenueCat ให้เสร็จก่อนปล่อย production**
