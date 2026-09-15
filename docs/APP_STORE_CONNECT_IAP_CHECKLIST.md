# ส่ง subscription เข้ารีวิวครั้งแรก — ทำไมกดส่งไม่ได้ และต้องทำอะไรบ้าง

## ข้อความที่เจอ
```
Unable to Submit for Review
• New subscription groups must be submitted with an auto-renewable subscription from within that group.
• To submit your items for review, add an app version for the selected platform.
```

## แปลว่าอะไร
subscription ทั้ง 4 ตัว **ยังไม่เคยผ่านการรีวิวเลยสักครั้ง** และ subscription group
"MoneyMa Premium" ก็เป็นกลุ่มใหม่ที่ยังไม่เคยถูกส่ง

🔴 **นี่คือต้นตอของทุกอย่างที่ไล่มาทั้งวัน**
สินค้าที่ยังไม่ผ่านรีวิว StoreKit **ไม่คืนกลับมาให้แอปเลย** ทั้งบน production และ sandbox
→ `getProducts()` ไม่ได้อะไรกลับมา → ปุ่ม Subscribe ทำงานไม่ได้
→ ผู้ตรวจของ Apple กดแล้วค้าง → reject ข้อ 2.1(a)
**ไม่มีโค้ดชุดไหนแก้เรื่องนี้ได้** ต้องแก้ใน App Store Connect เท่านั้น

Apple ตั้งกฎว่า **subscription group ใหม่ต้องเดินทางไปพร้อมกับ app version**
ส่งแยกกันไม่ได้ นี่คือสาเหตุที่ปุ่ม Submit ของหน้า subscription กดไม่ผ่าน

---

## ลำดับที่ต้องทำ (ห้ามสลับ)

### 1. เติม metadata ของ subscription group ให้ครบ
App Store Connect → Monetization → **Subscriptions** → กลุ่ม **MoneyMa Premium**
- **Localization ของตัวกลุ่ม** ต้องมีอย่างน้อย 1 ภาษา (ไทย) — ชื่อกลุ่มที่ผู้ใช้เห็น
- ถ้าขายหลายประเทศ ควรมี English (U.S.) ด้วย

### 2. เติม metadata ของ subscription ทีละตัวให้ครบทั้ง 4
`pro_monthly` · `pro_yearly` · `business_monthly` · `business_yearly`
แต่ละตัวต้องมีครบทุกข้อ ขาดข้อเดียวจะค้างสถานะ **Missing Metadata**
- Reference Name + Duration
- **Subscription Prices** (ตั้งราคาไทยแล้วปล่อยให้ Apple แปลงประเทศอื่น)
- **Localization**: Display Name + Description อย่างน้อย 1 ภาษา
- **Review Information → Screenshot** 🔴 ตัวที่คนลืมบ่อยที่สุด
  ต้องเป็นภาพหน้า paywall ที่เห็นการ์ดราคาจริง (ถ่ายจากซิมูเลเตอร์ก็ได้)
- **Review Notes**: บอกทางเข้าให้ชัด เช่น
  > Tap "Try Demo / Continue as Guest" on the welcome screen, then tap the star icon
  > at the top-right of the Dashboard to open the subscription page. No login required.

เป้าหมาย: ทั้ง 4 ตัวต้องขึ้นสถานะ **Ready to Submit**

### 3. ผูก subscription เข้ากับ app version แล้วส่งไปพร้อมกัน
App Store Connect → **Apps → MoneyMa → เวอร์ชันที่กำลังจะส่ง (iOS)**
- เลื่อนลงหาหัวข้อ **In-App Purchases and Subscriptions**
- กด **+ (หรือ Edit)** แล้วเลือก subscription ทั้ง 4 ตัว → Save
- แล้วค่อยกด **Add for Review / Submit for Review** ที่หน้า **เวอร์ชัน** ไม่ใช่ที่หน้า subscription

> ถ้ายังไม่มีเวอร์ชันที่แก้ไขได้ ให้สร้างเวอร์ชันใหม่ (เช่น 1.0.1) ก่อน
> แล้วอัปโหลด build ใหม่ที่มีการแก้โค้ดชุดนี้ขึ้นไปผูกกับเวอร์ชันนั้น

### 4. ระหว่างรอรีวิว — ทดสอบยังไง
| ที่ | ใช้อะไร | ต้องมีอะไร |
|---|---|---|
| ซิมูเลเตอร์ | `Subscriptions.storekit` (ในเครื่อง) | เปิด StoreKit Configuration ในสคีม |
| เครื่องจริง | Sandbox | บัญชี Sandbox Tester + สินค้าต้องอย่างน้อย **Ready to Submit** |

**เปิด StoreKit Configuration บนซิมูเลเตอร์:**
Xcode → Product → Scheme → Edit Scheme → **Run → Options** →
**StoreKit Configuration** → เลือก `Subscriptions.storekit`
🔴 ให้เลือกจากเมนูนี้เอง อย่าไปแก้ path ในไฟล์ `.xcscheme` ด้วยมือ —
Xcode จะเขียน path ที่ถูกต้องให้เอง ส่วนที่แก้มือไว้ถ้าผิดจะไม่มีคำเตือนใด ๆ
แค่รันโดยไม่โหลด config เงียบ ๆ แล้วไปค้างที่ StoreKit แทน

### 5. วิธีอ่าน log ว่าค้างตรงไหน (ใส่ไว้ให้แล้ว)
เปิด Xcode console แล้วกด Subscribe จะเห็นบรรทัดพวกนี้
```
[Premium] สถานะสมาชิกพร้อมที่ …ms
[Billing] offerings จาก RevenueCat · current = … · ทั้งหมด = …
[RC] ถามร้านหาสินค้า: pro_yearly
[RC] ร้านตอบ N รายการ: pro_yearly=฿990
```
ถ้าค้าง จะมีบรรทัดบอกขั้นที่ค้างตรง ๆ:
```
[RC] 🔴 ช่วงเตรียมค้างที่ขั้น "store-getProducts" · แพลตฟอร์ม ios
```
| ขั้นที่ค้าง | แปลว่า |
|---|---|
| `configure` | RevenueCat ต่อไม่ติด — ตรวจคีย์ `appl_` และเน็ตของเครื่อง |
| `store-getProducts` | StoreKit ไม่ตอบ — สินค้ายังไม่ผ่านรีวิว / ไม่ได้เปิด StoreKit config / ไม่ได้ใช้บัญชี sandbox |

---

## ⚠️ อย่าเพิ่งส่งจดหมายตอบ App Review
จดหมายใน `docs/APP_REVIEW_REPLY_2.1a.md` ให้ส่ง **หลังจาก** subscription ทั้ง 4 ตัว
ผูกกับเวอร์ชันและอยู่ในคิวรีวิวเรียบร้อยแล้วเท่านั้น
ถ้าส่งตอนนี้ ผู้ตรวจจะกดทดสอบแล้วเจอสินค้าที่ยังไม่มีอยู่จริง แล้ว reject ซ้ำด้วยเหตุผลเดิม
