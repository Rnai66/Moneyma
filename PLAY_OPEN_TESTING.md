# ขึ้น Google Play — แทร็กทดสอบแบบเปิด (Open testing)

> MoneyMa · `com.moneyma.app` · v2.1.1 (versionCode 16) · 1 ส.ค. 2026
> ไฟล์: `android/app/build/outputs/bundle/release/app-release.aab` (11.9 MB)

---

## ไฟล์พร้อมแล้ว — ตรวจผ่านทุกข้อ

| | |
|---|---|
| package | `com.moneyma.app` ✓ |
| versionCode / Name | 16 / 2.1.1 ✓ |
| ลายเซ็น SHA-256 | `84:E2:F3:BF:…:0E:0F` = upload key ✓ |
| ช่องทางจ่ายเงินนอก Play | ไม่มี ✓ |
| source map | 0 ไฟล์ ✓ |

---

## Open testing คืออะไร

ใครก็ได้เข้าร่วมทดสอบได้ผ่านลิงก์สาธารณะ ไม่ต้องเพิ่มอีเมลทีละคน
(นี่คือเหตุผลที่ขั้นตอน "เลือกผู้ทดสอบ" ถูกขีดฆ่าในหน้า Console)

| | Internal | **Open** | Production |
|---|---|---|---|
| จำนวนผู้ทดสอบ | ≤ 100 คน | ไม่จำกัด | ทุกคน |
| ต้องรีวิวจาก Google | ไม่ต้อง | **ต้อง** | ต้อง |
| เวลารอ | ทันที | 1–7 วัน | 1–7 วัน |
| แสดงบน Play Store | ไม่ | ค้นเจอได้ (มีป้าย Early access) | ปกติ |

> เนื่องจาก Open testing ต้องผ่านรีวิวเหมือน production ข้อมูลใน Store listing /
> Data safety / Content rating **ต้องกรอกครบก่อน** ถึงจะส่งได้

---

## ขั้นตอน

### 1. เลือกประเทศ

Test and release → Testing → **Open testing** → แท็บ **Countries / regions** → Add countries

- ทดสอบเฉพาะไทยก่อน → เลือก **Thailand**
- อยากได้ผู้ทดสอบกว้าง → Select all countries

เปลี่ยนทีหลังได้ตลอด

### 2. สร้างรุ่นใหม่

แท็บ **Releases** → **Create new release**

**2.1 App signing** — ถ้าถามเรื่อง signing key ให้เลือก **Use Google Play app signing** (ปกติเปิดอยู่แล้ว)

**2.2 อัปโหลด AAB**

ลากไฟล์นี้เข้าไป:

```
~/projects/PFM/android/app/build/outputs/bundle/release/app-release.aab
```

รอสักครู่ Console จะขึ้น `com.moneyma.app` · versionCode 16 · 2.1.1

> ถ้าขึ้น error เรื่อง signature → keystore ไม่ตรงกับ upload key
> ถ้าขึ้น "version code already used" → เพิ่ม `versionCode` ใน `android/app/build.gradle` แล้ว build ใหม่

**2.3 Release name** — ใส่ `2.1.1 (16)` (Console เติมให้อัตโนมัติ แก้ได้)

**2.4 Release notes** — ต้องใส่อย่างน้อยภาษาเริ่มต้น

```
<th-TH>
- ปรับปรุงหน้าตาแอปใหม่ทั้งหมด อ่านง่ายและสมดุลขึ้นทุกหน้าจอ
- ซิงค์ข้อมูลอัตโนมัติทันทีที่เข้าสู่ระบบ ไม่ต้องกดเอง
- เพิ่มปุ่มออกจากระบบ พร้อมซิงค์ข้อมูลขึ้นคลาวด์ก่อนออก
- แก้ปัญหาเข้าสู่ระบบด้วย Google บนมือถือ
- แก้ปัญหาข้อมูลที่แก้ในเครื่องถูกเขียนทับตอนซิงค์
- ปรับหน้ารายการธุรกรรมให้ใช้งานสะดวกขึ้น
</th-TH>

<en-US>
- Redesigned interface — clearer and better balanced on every screen size
- Data now syncs automatically on sign-in, no manual step needed
- Added sign-out, which uploads your data to the cloud first
- Fixed Google sign-in on mobile
- Fixed local edits being overwritten during sync
- Improved the transactions screen
</en-US>
```

**2.5 Save** → **Review release**

### 3. ตรวจก่อนส่ง

หน้า Preview จะเตือนถ้ามีอะไรขาด แก้ให้ครบก่อนกดส่ง

**สิ่งที่ต้องกรอกครบ** (Dashboard → ดูรายการที่มีเครื่องหมายตกใจ)

| หัวข้อ | ค่าที่ใช้ |
|---|---|
| App name | MoneyMa |
| Short description | ≤ 80 ตัวอักษร |
| Full description | ≤ 4,000 ตัวอักษร |
| App icon | 512×512 PNG |
| Feature graphic | 1024×500 |
| ภาพหน้าจอ | ≥ 2 ภาพ (แนะนำ 4–8) |
| **Privacy policy URL** | `https://moneyma-app.netlify.app/privacy-policy.html` |
| App category | Finance |
| Content rating | ทำแบบสอบถามให้จบ |
| Target audience | 18+ (แอปการเงิน) |
| **Data safety** | ดูหัวข้อถัดไป — ตกกันบ่อยสุด |
| Ads | ไม่มีโฆษณา |
| **In-app purchases** | **ไม่มี** (เวอร์ชันนี้ปิดการขายไว้) |

### 4. Data safety — จุดที่ตกบ่อยที่สุด

App content → **Data safety** ต้องประกาศให้ตรงกับที่แอปทำจริง

**เก็บและส่งข้อมูลเหล่านี้:**

| ประเภท | รายละเอียด | ส่งออกไหน | จุดประสงค์ |
|---|---|---|---|
| Personal info → **Email address** | อีเมลตอนสมัคร | Supabase | จัดการบัญชี |
| Personal info → **Name** | ชื่อ-นามสกุล (ถ้ากรอก) | Supabase | จัดการบัญชี |
| **Financial info → Other financial info** | รายรับ-รายจ่าย หมวดหมู่ ยอดเงิน | Supabase | ฟังก์ชันหลักของแอป |
| **Photos and videos → Photos** | รูปสลิป/ใบเสร็จที่สแกน | **Google Gemini API** | ฟังก์ชันหลัก (OCR) |
| App activity → App interactions | Firebase Analytics | Firebase | วิเคราะห์การใช้งาน |
| **Crash logs** + Diagnostics | Crashlytics | Firebase | แก้ข้อบกพร่อง |

**ต้องตอบว่า:**

- ข้อมูลเข้ารหัสระหว่างส่ง → **ใช่** (HTTPS ทั้งหมด)
- ผู้ใช้ขอลบข้อมูลได้ → **ใช่** (ต้องมีช่องทางจริง — ดูหมายเหตุล่าง)
- การเก็บข้อมูลเป็นทางเลือกได้ไหม → รายการที่เก็บในเครื่องอย่างเดียวถือว่าไม่ได้ "เก็บ" ตามนิยาม Google แต่เมื่อเปิด cloud sync ถือว่าเก็บ

> ⚠️ **รูปสลิปส่งไป Gemini** เป็นการแชร์ข้อมูลกับบุคคลที่สาม ต้องประกาศ
> ถ้าไม่ประกาศแล้ว Google ตรวจเจอทีหลัง = ระงับแอป

> ⚠️ **สิทธิ์ลบข้อมูล** — ถ้าประกาศว่าลบได้ ต้องมีวิธีให้ผู้ใช้ทำจริง
> ตอนนี้แอปยังไม่มีปุ่มลบบัญชี บอกได้ถ้าอยากให้เพิ่ม

### 5. ส่งรีวิว

กด **Start rollout to Open testing** → ยืนยัน

สถานะจะเป็น **In review** · รอปกติ 1–3 วัน (ครั้งแรกอาจถึง 7 วัน)

ผ่านแล้วได้ลิงก์เข้าร่วม:

```
https://play.google.com/apps/testing/com.moneyma.app
```

ส่งลิงก์นี้ให้ใครก็ได้ กด "Become a tester" แล้วดาวน์โหลดจาก Play Store ได้เลย

---

## หลังผ่านรีวิว

**1. ทดสอบบนเครื่องจริงผ่าน Play Store** (ไม่ใช่ติดตั้งจาก Android Studio)

- [ ] เข้าสู่ระบบด้วย Google → กลับเข้าแอปเอง
- [ ] เข้าสู่ระบบด้วยอีเมล → ข้อมูลเข้าเองไม่ต้องกดอะไร
- [ ] ออกจากระบบ → เข้าใหม่ → ข้อมูลกลับมาครบ
- [ ] สแกนสลิป / สแกนบิล
- [ ] **ไม่มีเมนู Premium และไม่มีปุ่ม 💎** ← ยืนยันว่าเวอร์ชันที่ปล่อยถูกต้อง
- [ ] Export Excel

**2. เฝ้าดู 2–3 วัน**

Quality → **Android vitals** (crash rate, ANR) และ Firebase Crashlytics

**3. Promote ไป Production**

Open testing → Releases → **Promote release** → Production
เลือก staged rollout **20%** → ดู 24–48 ชม. → 50% → 100%

**4. เริ่มงาน billing ได้แล้ว**

เมื่อแอปอยู่บน Play แล้ว Play Billing จะเริ่มคืน product ให้ →
สร้าง subscription + `lifetime` ใน Play Console → ผูก RevenueCat →
เปลี่ยน `NATIVE_BILLING_READY = true` → ปล่อย v2.2.0

---

## ปัญหาที่อาจเจอ

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| "Your Android App Bundle is signed with the wrong key" | ใช้ keystore ผิด — ต้องเป็น `pfm-release-key.jks` |
| "Version code 16 has already been used" | เพิ่มเป็น 17 ใน `build.gradle` แล้ว build ใหม่ |
| "You must complete the Data safety section" | ยังกรอกไม่ครบ (ข้อ 4) |
| "This release does not add or remove any languages" | แค่ข้อความแจ้ง ไม่ใช่ error |
| ถูกปฏิเสธเรื่อง Payments policy | ตรวจว่าใช้ AAB ที่ build ด้วย `npm run sync-android` |
| รีวิวนานเกิน 7 วัน | ติดต่อ Play Console → Help → Contact support |

---

## คำสั่งอ้างอิง

```bash
# build AAB ใหม่ (ต้องล้างของเก่าก่อนเสมอ)
cd ~/projects/PFM
rm -rf build android/app/src/main/assets/public
npm run sync-android

cd android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew clean bundleRelease

# ตรวจก่อนอัปโหลด
unzip -p app/build/outputs/bundle/release/app-release.aab \
  base/manifest/AndroidManifest.xml | strings | grep -i moneyma
```
