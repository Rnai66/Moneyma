# คู่มือการเตรียมแอปสำหรับ Google Play Store & การเชื่อมต่อระบบชำระเงิน RevenueCat (MoneyMa v2.1.0)

คู่มือนี้จัดทำขึ้นสำหรับโปรเจกต์ **MoneyMa** เพื่อช่วยแนะนำขั้นตอนการตั้งค่าแอปพลิเคชันให้เป็น **แอปดาวน์โหลดฟรี (Free with In-App Purchases)** บน Google Play Store และเชื่อมต่อกับระบบจัดการสมาชิก **RevenueCat** เพื่อให้รองรับระบบปลดล็อกฟีเจอร์พรีเมียม (Premium Upgrade) ได้อย่างสมบูรณ์แบบและปลอดภัย

---

## สารบัญ
1. [การตั้งค่าแอปพลิเคชันเป็น "แอปฟรี" บน Google Play Console](#1-การตั้งค่าแอปพลิเคชันเป็น-แอปฟรี-บน-google-play-console)
2. [การตั้งค่า Google Play Billing & Service Account](#2-การตั้งค่า-google-play-billing--service-account)
3. [การตั้งค่าบน RevenueCat Dashboard](#3-การตั้งค่าบน-revenuecat-dashboard)
4. [การกำหนดค่า Environment Variables ในโปรเจกต์](#4-การกำหนดค่า-environment-variables-ในโปรเจกต์)
5. [ขั้นตอนการทดสอบ Sandbox บนอุปกรณ์จริง (Android Devices)](#5-ขั้นตอนการทดสอบ-sandbox-บน-อุปกรณ์จริง-android-devices)

---

## 1. การตั้งค่าแอปพลิเคชันเป็น "แอปฟรี" บน Google Play Console

เพื่อให้ผู้ใช้ทั่วไปสามารถดาวน์โหลดแอป MoneyMa ได้โดยไม่มีค่าใช้จ่ายแรกเข้า แต่สามารถซื้อแพ็กเกจพรีเมียมภายในแอปได้ในภายหลัง ให้ทำตามขั้นตอนดังนี้:

1. เข้าสู่ระบบ [Google Play Console](https://play.google.com/console/)
2. คลิก **Create app** (สร้างแอป) เพื่อเริ่มต้นสร้างโปรเจกต์แอปพลิเคชันใหม่
3. ในส่วน **App details**:
   - กรอก **App name** (ชื่อแอป): `MoneyMa` หรือชื่อที่ต้องการ
   - เลือก **Default language** (ภาษาเริ่มต้น): `Thai (th)` หรือตามที่ต้องการ
   - เลือก **App or game**: `App`
   - **สำคัญมาก!** ในส่วน **Free or Paid** ให้เลือก **Free** (ฟรี)
     > [!WARNING]
     > การตั้งค่าแอปเป็น **Free** จะไม่สามารถเปลี่ยนกลับเป็น **Paid** (แอปเสียเงินดาวน์โหลด) ได้ในภายหลัง แต่เหมาะสมที่สุดสำหรับโมเดลธุรกิจ Free with In-App Purchases (Freemium) ที่เราใช้งาน
4. ยอมรับข้อตกลงและนโยบายทั้งหมด แล้วคลิก **Create app**

---

## 2. การตั้งค่า Google Play Billing & Service Account

เพื่ออนุญาตให้ RevenueCat ตรวจสอบและยืนยันสถานะการสั่งซื้อใบเสร็จ (Receipt Validation) บน Google Play Console ได้อย่างถูกต้องและปลอดภัยแบบ Server-to-Server

### ขั้นตอนที่ 2.1: ลิงก์โปรเจกต์ Google Cloud
1. ไปที่ Play Console -> **Setup** -> **API access**
2. เลือกเชื่อมโยงกับโปรเจกต์ Google Cloud ปัจจุบัน หรือคลิก **Create a new Google Cloud project**

### ขั้นตอนที่ 2.2: สร้าง Service Account บน Google Cloud
1. เปิดหน้า [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials) ด้วยบัญชีเดียวกับ Play Console
2. คลิก **+ CREATE CREDENTIALS** -> เลือก **Service Account**
3. ตั้งชื่อบัญชีบริการ เช่น `revenuecat-billing-access` แล้วคลิก **Create and Continue**
4. ในส่วนการเลือก Role (บทบาท) ให้เพิ่มสิทธิ์ดังนี้:
   - **Pub/Sub Admin** (สำหรับรองรับ Real-time Developer Notifications)
   - **Monitoring Viewer** (ไม่บังคับ)
5. คลิก **Done** เพื่อเสร็จสิ้นขั้นตอนการสร้าง
6. ในตาราง Service Accounts ให้คลิกที่อีเมลของบัญชีบริการที่เพิ่งสร้างขึ้น -> ไปที่แท็บ **Keys** (คีย์)
7. คลิก **ADD KEY** -> **Create new key** -> เลือกฟอร์แมต **JSON** -> คลิก **Create**
8. ไฟล์ JSON คีย์ความปลอดภัยจะดาวน์โหลดลงสู่เครื่องคอมพิวเตอร์ของคุณอัตโนมัติ (เก็บรักษาไฟล์นี้ไว้เป็นความลับสูงสุด เพื่อนำไปอัปโหลดที่ RevenueCat ในขั้นตอนถัดไป)

### ขั้นตอนที่ 2.3: มอบสิทธิ์การใช้งานให้กับ Service Account ใน Google Play Console
1. กลับมาที่ Google Play Console -> หน้า **API access**
2. ค้นหารายการบัญชีบริการที่เพิ่งสร้างขึ้นในตาราง แล้วคลิก **Manage Play Console permissions**
3. ในแท็บ **App permissions** ให้เลือกแอป `MoneyMa`
4. ในแท็บ **Account permissions** ให้ติ๊กเลือกสิทธิ์ที่จำเป็นดังนี้:
   - **View financial data, orders, and cancellation survey responses** (ดูข้อมูลทางการเงิน คำสั่งซื้อ และผลสำรวจการยกเลิก)
   - **Manage orders and subscriptions** (จัดการคำสั่งซื้อและข้อมูลการสมัครสมาชิก)
5. คลิก **Invite user** เพื่อเสร็จสิ้นขั้นตอนมอบสิทธิ์

### ขั้นตอนที่ 2.4: สร้างผลิตภัณฑ์พรีเมียม (Subscriptions / In-App Products)
1. ในหน้า Google Play Console ของแอป MoneyMa ไปที่เมนู **Monetize** -> **Products** -> **Subscriptions**
2. คลิก **Create subscription**
   - **Product ID**: ตั้งค่า ID ผลิตภัณฑ์ เช่น `moneyma_premium_monthly` (จะนำไปใช้ลิงก์ใน RevenueCat)
   - **Name**: `MoneyMa Premium Monthly` (ภาษาไทย: `MoneyMa พรีเมียมรายเดือน`)
3. ตั้งค่าราคาและช่วงเวลาทดลองใช้ (ถ้ามี) แล้วคลิก **Save** -> คลิก **Activate** เพื่อเปิดการจำหน่าย

---

## 3. การตั้งค่าบน RevenueCat Dashboard

RevenueCat จะทำหน้าที่เป็นจุดกลาง (Middleman) ในการเชื่อมโยงระบบ iOS App Store, Google Play Store และเว็บแอปของคุณเข้าด้วยกันอย่างไร้รอยต่อ

### ขั้นตอนที่ 3.1: สร้างโปรเจกต์บน RevenueCat
1. เข้าสู่ระบบ [RevenueCat Dashboard](https://app.revenuecat.com/)
2. คลิก **Create new project** และตั้งชื่อโปรเจกต์ว่า `MoneyMa`

### ขั้นตอนที่ 3.2: เพิ่มแอปพลิเคชัน Android
1. ภายใต้โปรเจกต์ MoneyMa ให้คลิก **Add app** -> เลือก **Google Play Store**
2. กรอกรายละเอียด:
   - **App name**: `MoneyMa Android`
   - **Google Play package name**: กรอก Package Name ของแอปจริงของคุณ (เช่น `com.monyema.pfm` ตรวจสอบได้ใน `capacitor.config.ts` หรือ `android/app/build.gradle`)
   - **Service Account Credentials JSON**: อัปโหลดไฟล์ JSON ที่ดาวน์โหลดมาจากขั้นตอน Google Cloud Service Account
3. คลิก **Save changes**
4. ระบบจะแสดง **Public API Key** สำหรับ Android (จดจำคีย์นี้ไว้ เพื่อระบุใน Environment variables ของแอปต่อไป)

### ขั้นตอนที่ 3.3: ตั้งค่า Entitlements, Products และ Offerings
เพื่อให้แอป MoneyMa สามารถแยกแยะสิทธิ์การเข้าถึงฟีเจอร์พรีเมียมได้ ให้ตั้งค่าตามโครงสร้างนี้:

1. **สร้าง Entitlements**:
   - ไปที่ **Entitlements** -> คลิก **New**
   - **Identifier**: `premium` (สิทธิ์ระดับพรีเมียม)
   - **Description**: `MoneyMa Premium Access`
   - คลิก **Add**
2. **นำเข้า Products**:
   - ไปที่ **Products** -> คลิก **New**
   - เลือก App: **Google Play Store**
   - กรอก **Identifier**: `moneyma_premium_monthly` (ต้องสะกดให้ตรงกับ Product ID ใน Google Play Console ทุกตัวอักษร)
   - คลิก **Add**
3. **ผูก Product เข้ากับ Entitlement**:
   - คลิกที่ Entitlement `premium` ที่เพิ่งสร้าง
   - คลิก **Attach product** -> เลือกผลิตภัณฑ์ `moneyma_premium_monthly` ที่เพิ่งเชื่อมต่อ
4. **สร้าง Offerings (สินค้าที่จะนำไปแสดงใน Paywall)**:
   - ไปที่ **Offerings** -> คลิก **New Offering**
   - **Identifier**: `default`
   - **Description**: `Default Subscription Plans`
   - คลิก **Add**
   - คลิกเข้าไประดับภายในของ Offering `default` ที่สร้าง -> คลิก **New Package**
     - **Identifier**: `$rc_monthly` (แพ็กเกจรายเดือนมาตรฐาน)
     - **Description**: `Premium Monthly Plan`
   - คลิกเข้าไปใน Package `$rc_monthly` -> คลิก **Attach product** -> เลือกเชื่อมต่อผลิตภัณฑ์ `moneyma_premium_monthly` ของ Google Play Store เป็นอันเสร็จสิ้น

---

## 4. การกำหนดค่า Environment Variables ในโปรเจกต์

เพื่อความปลอดภัยสูงสุดและไม่ผูกมัด API Key ของระบบจริงลงในซอร์สโค้ด ให้กำหนดค่า API Key ผ่านระบบสภาพแวดล้อมดังนี้:

1. เปิดไฟล์ `.env` หรือ `.env.local` ในรูทของโปรเจกต์
2. เพิ่มคีย์ API Key ของ RevenueCat ดังต่อไปนี้:

```env
# คีย์สำหรับระบบ Android (ได้จากหน้า Google Play Store App ของ RevenueCat)
REACT_APP_REVENUECAT_API_KEY_ANDROID=goog_xxxxxxxxxxxxxxxxxxxxxxxxxx

# คีย์สำหรับระบบ iOS (ได้จากหน้า App Store App ของ RevenueCat)
REACT_APP_REVENUECAT_API_KEY_IOS=appl_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

> [!NOTE]
> หากไม่มีการประกาศค่า API Key เหล่านี้ใน Environment variables แอป MoneyMa จะทำงานใน **Mock Sandbox Mode** โดยอัตโนมัติ เพื่อป้องกันแอปแครชและรองรับการจำลองการอัปเกรดในโหมดพัฒนาได้อย่างสะดวกสบาย

---

## 5. ขั้นตอนการทดสอบ Sandbox บนอุปกรณ์จริง (Android Devices)

การทดสอบระบบซื้อสินค้าจริงในโหมด Sandbox บน Android จะต้องใช้อุปกรณ์จริง (หรือ Emulator ที่มี Google Play Services ติดตั้งไว้) และจำเป็นต้องทำตามขั้นตอนเหล่านี้เพื่อไม่ให้เกิดการหักเงินจริง:

### ขั้นตอนที่ 5.1: ตั้งค่า License Testers ใน Google Play Console
1. ไปที่หน้าหลักของ Google Play Console -> คลิกที่โปรเจกต์แอปของคุณ
2. ในแถบเมนูด้านข้าง ไปที่ **Setup** -> **License testing**
3. ในส่วน **License testers** ให้เพิ่มอีเมล Google Account (Gmail) ของตัวคุณเองและทีมนักพัฒนาที่ต้องการใช้ทดสอบ
4. ในช่อง **License response** ให้เลือกเป็น **RESPOND_WITH_APPROVED** (ตอบกลับว่าอนุมัติการซื้อเสมอ)
5. คลิก **Save changes**

### ขั้นตอนที่ 5.2: เพิ่มอีเมลผู้ทดสอบใน Internal Testing Track
1. ไปที่เมนู **Testing** -> **Internal testing**
2. คลิกแท็บ **Testers** -> สร้างหรือเลือกกลุ่มผู้ทดสอบ (Testers list) -> เพิ่มบัญชี Gmail ของผู้ทดสอบลงไป
3. คัดลอก **Join link** (ลิงก์เข้าร่วมทดสอบ) ส่งไปยังเครื่องอุปกรณ์ที่จะใช้ทดสอบ
4. เปิดลิงก์ดังกล่าวในโทรศัพท์มือถือ Android ล็อกอินเข้าด้วย Google Account ของผู้ทดสอบ แล้วกด **Accept Invite** (ยอมรับคำเชิญเข้าร่วมการทดสอบ)

### ขั้นตอนที่ 5.3: ทำการสั่งซื้อทดสอบในแอปพลิเคชัน
1. ติดตั้งแอปเวอร์ชันสำหรับทดสอบบนอุปกรณ์ Android ของคุณ (ตัวอย่างเช่น รันผ่านคำสั่ง `npx cap run android` หรือเปิดโปรเจกต์ `android` ใน Android Studio แล้วติดตั้งแอป)
2. เปิดแอป MoneyMa ขึ้นมา แล้วทำการทดลองบันทึกธุรกรรมให้เกิน 50 รายการ เพื่อแสดงหน้าต่าง **Premium Upgrade Modal**
3. คลิกปุ่ม **"อัปเกรดเป็น Premium"** เพื่อเปิดระบบการชำระเงินของ Google Play
4. ระบบหน้าต่างชำระเงินของ Google Play จะต้องแสดงสัญลักษณ์ระบุสถานะพิเศษอย่างชัดเจนว่า **"Test card, always approves" (บัตรทดสอบ อนุมัติเสมอ)**
5. ทำการสั่งซื้อจนเสร็จสิ้น (ระบบจะไม่หักเงินจากบัญชีการเงินจริงของคุณ)
6. สิทธิ์ Entitlement `premium` จะถูกเปิดใช้งานทันทีในระบบ และหน้าต่างข้อจำกัดของแอป MoneyMa จะถูกปลดล็อกโดยอัตโนมัติ!

---
*จัดทำขึ้นโดยทีมพัฒนา MoneyMa v2.1.0 (Capacitor Mobile)*
