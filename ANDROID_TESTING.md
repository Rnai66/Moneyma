# ทดสอบ MoneyMa ใน Android Studio

> อัปเดตล่าสุด 31 ก.ค. 2026 · v2.1.1 / versionCode 16 · `com.moneyma.app`

---

## เตรียมก่อนเปิด Android Studio

ทุกครั้งที่แก้โค้ดฝั่งเว็บ ต้อง build + copy ใหม่ ไม่งั้น Android จะยังใช้ของเก่า

```bash
cd ~/projects/PFM
rm -rf build android/app/src/main/assets/public   # ล้างของเก่า cap copy ไม่ลบให้
npm run sync-android
```

> 🔴 **ใช้ `build:mobile` เท่านั้นสำหรับ Android — ห้ามใช้ `npm run build` ธรรมดา**
>
> `build:mobile` ทำ 3 อย่างที่จำเป็นต่อการผ่านรีวิว Google Play:
> 1. ตัดข้อมูลช่องทางโอนเงิน (พร้อมเพย์/PayNow) และช่องทางติดต่อส่วนตัวออกจาก bundle
> 2. ปิด source map (ไม่งั้นซอร์สโค้ดเดิมพร้อมเบอร์บัญชีติดไปด้วย 6 MB)
> 3. ลบ `store-listing.html` / `privacy-policy.html` ที่เป็นหน้าเว็บล้วน

> `cap copy` คัดลอกเฉพาะ web assets — เร็วและปลอดภัย
> ใช้ `cap sync android` เฉพาะตอนเพิ่ม/ลบ Capacitor plugin เท่านั้น

เปิดโปรเจกต์:

```bash
npx cap open android
```

หรือเปิด Android Studio → Open → เลือกโฟลเดอร์ `~/projects/PFM/android`

---

## ตั้งค่า JDK

โปรเจกต์ใช้ `compileSdk 36` ต้องใช้ **JDK 17 ขึ้นไป**

Android Studio → Settings → Build, Execution, Deployment → Build Tools → Gradle
→ **Gradle JDK** = `jbr-21` (ที่มากับ Android Studio)

ถ้า build จาก terminal:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
```

---

## รันแอป

1. เลือก device ที่แถบบน (emulator หรือมือถือจริงที่เปิด USB debugging)
2. Build variant ให้เป็น **debug** (View → Tool Windows → Build Variants)
3. กด ▶ Run

Build แรกจะนานหน่อย (Gradle โหลด dependency) รอบถัดไปเร็วขึ้นมาก

---

## เปิด DevTools ดู console / network

debug build เปิด WebView debugging ให้อัตโนมัติแล้ว (`MainActivity.java` เช็ค `BuildConfig.DEBUG`)

1. ต่อเครื่อง / เปิด emulator แล้วเปิดแอปค้างไว้
2. เปิด Chrome บนคอม → พิมพ์ `chrome://inspect`
3. หา `MoneyMa` ใต้หัวข้อ Remote Target → กด **inspect**

จะได้ Console / Network / Elements เหมือน debug เว็บปกติ — ใช้ดู error ของ Supabase, RevenueCat, Gemini ได้

> release build ยังปิด debugging ไว้ (`webContentsDebuggingEnabled: false`) เพื่อความปลอดภัย

ดู log ฝั่ง native:

```bash
adb logcat | grep -i "capacitor\|moneyma\|chromium"
```

---

## เช็กลิสต์ทดสอบ

### สิ่งที่เพิ่งแก้ — ทดสอบให้ครบ

- [ ] **Auto-sync ตอน login** — login ด้วยบัญชีเดิม ข้อมูลต้องเข้าเอง **โดยไม่ต้องกดปุ่มอัปเกรด**
- [ ] **แถบสถานะซิงค์** ใน sidebar แสดง "ข้อมูลเป็นปัจจุบัน" + เวลา · กดแล้วซิงค์ซ้ำได้
- [ ] **ปุ่มออกจากระบบ** (Settings → บัญชีผู้ใช้) ซิงค์ขึ้นคลาวด์ก่อนออก
- [ ] **login → logout → login ใหม่** ข้อมูลต้องเข้าทุกครั้ง (เดิมรอบสองจะไม่ sync)
- [ ] **แก้รายการในเครื่องแล้วซิงค์** ของที่แก้ต้องไม่ถูกทับ
- [ ] **หน้า Transactions** ปุ่มเพิ่มรายการอยู่ซ้าย · tile สแกนสลิป/บิลแยกสีชัด · สลับการ์ด/ตารางเห็นต่าง

### UI ทั่วไป

- [ ] ทุกหน้าไม่มีเนื้อหาล้นขอบจอ (dashboard, transactions, statistics, reports, budget, settings, premium)
- [ ] ตารางเลื่อนแนวนอนได้ หัวตารางค้างบน
- [ ] Dark mode สลับแล้วอ่านออกทุกหน้า
- [ ] Bottom nav ไม่ทับเนื้อหา · ปุ่ม Premium มุมขวาบนกดได้
- [ ] แนวนอน (landscape) ไม่พัง

### ฟีเจอร์หลัก

- [ ] สมัคร / login ด้วย email
- [ ] Google login — ดูหมายเหตุด้านล่าง
- [ ] เพิ่ม / แก้ / ลบ รายการ
- [ ] สแกนสลิป + สแกนบิล (ต้องอนุญาตกล้อง)
- [ ] Export Excel
- [ ] งบประมาณ + แจ้งเตือนใกล้เกิน
- [ ] ซื้อ premium ผ่าน RevenueCat sandbox

---

## Google login บน Android — ทำไมเด้งเข้าเว็บแอป

### flow ที่ควรจะเป็น

```
แอป → เปิด Chrome (นอกแอป) → Google → Supabase callback
    → moneyma://auth?code=xxx → Android ส่งกลับเข้า MainActivity
    → แอปแลก code เป็น session → เข้าใช้งานต่อในแอป
```

### สาเหตุที่เด้งเข้าเว็บแอปแทน

**Supabase ไม่รู้จัก `moneyma://auth`** เมื่อ `redirectTo` ไม่อยู่ใน Redirect URLs ที่อนุญาต
Supabase จะ **ไม่ error** แต่จะ fallback ไปที่ **Site URL** ของโปรเจกต์ ซึ่งตั้งเป็นเว็บบน Netlify
→ ผู้ใช้เลยไปโผล่ที่เว็บแอปแทนที่จะกลับเข้าแอป

ประกอบกับอีก 3 จุดในโค้ดที่แก้ไปแล้ว:

| จุด | ปัญหาเดิม | แก้เป็น |
|---|---|---|
| `AndroidManifest.xml` | intent-filter รับเฉพาะ `moneyma://auth/update-password` → callback ที่มาที่ `moneyma://auth` ตกหล่น | รับทุก path ใต้ `moneyma://auth` |
| `signInWithOAuth` | ปล่อยให้ supabase-js สั่ง navigate WebView เอง | `skipBrowserRedirect: true` บน native แล้วเปิดเอง (Google บล็อก OAuth ใน WebView — `disallowed_useragent`) |
| `createClient` | `detectSessionInUrl` เปิดอยู่ แต่ native ไม่เคยเห็น URL callback | `flowType: 'pkce'` + `detectSessionInUrl: false` บน native |
| `App.js` | ถ้า deep link ปลุกแอปจากที่ปิดสนิท listener ยังไม่ทัน register | เพิ่ม `getLaunchUrl()` ตอน mount |

> Capacitor เปิดเบราว์เซอร์ภายนอกให้เองอยู่แล้ว — `Bridge.launchIntent()` ตรวจว่า host
> ไม่ใช่ของแอปก็ยิง `Intent.ACTION_VIEW` ออกไป จึงไม่ต้องลง `@capacitor/browser`

### 🔴 ต้องทำใน Supabase Dashboard (ไม่งั้นยังพังเหมือนเดิม)

Authentication → URL Configuration → **Redirect URLs** เพิ่ม:

```
moneyma://auth
moneyma://auth/**
```

**Site URL** ให้คงเป็น URL เว็บไว้ (สำหรับผู้ใช้ฝั่งเว็บ) — ไม่ต้องเปลี่ยน

ส่วน Google Cloud Console ไม่ต้องแก้ เพราะ flow นี้ Google คุยกับ Supabase
(`https://nvgqqhqoarkfulsebepj.supabase.co/auth/v1/callback`) ไม่ได้คุยกับแอปโดยตรง
จึง **ไม่ต้องสร้าง Android OAuth client**

### ทดสอบ

ทดสอบว่า deep link ทำงานก่อน:

```bash
adb shell am start -W -a android.intent.action.VIEW -d "moneyma://auth" com.moneyma.app
```

แอปเด้งขึ้นมา = intent-filter ถูก

จากนั้นทดสอบจริง เปิด `chrome://inspect` ดู Console ควบคู่:

1. กดปุ่ม Google → Chrome ต้องเปิด **นอกแอป** (ไม่ใช่ในหน้าแอป)
2. เลือกบัญชี → เด้งกลับเข้าแอปเอง
3. Console ต้องไม่ขึ้น `Deep link auth failed`
4. เข้า dashboard พร้อมข้อมูลซิงค์มาแล้ว

**ถ้ายังเด้งไปเว็บ** = Redirect URLs ใน Supabase ยังไม่ได้ใส่
**ถ้าขึ้น `disallowed_useragent`** = ยังเปิดใน WebView อยู่ ให้เช็กว่า build ใหม่แล้วจริง

---

## ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| แอปเปิดมาเป็นหน้าขาว | ยังไม่ได้ `npm run build && npx cap copy android` |
| แก้โค้ดแล้วไม่เห็นผล | ลืม copy · หรือ WebView cache — ถอนแอปแล้วติดตั้งใหม่ |
| `SDK location not found` | สร้าง `android/local.properties` ใส่ `sdk.dir=/Users/<user>/Library/Android/sdk` |
| Gradle sync fail เรื่อง Java | Gradle JDK ยังเป็น JDK 11 → เปลี่ยนเป็น jbr-21 |
| `No matching client found for package name` | `google-services.json` ไม่ตรงกับ `applicationId` |
| Supabase ต่อไม่ได้ | `.env` ไม่มีค่า → CRA ฝังตอน build เท่านั้น ต้อง build ใหม่หลังแก้ `.env` |
| กล้องไม่ขึ้น | ยังไม่กดอนุญาต → Settings → Apps → MoneyMa → Permissions |
| ซิงค์ไม่ทำงาน | เปิด `chrome://inspect` ดู Console — มักเป็น RLS policy หรือ session หมดอายุ |

---

## Build release ทดสอบ

```bash
cd ~/projects/PFM/android
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew clean bundleRelease
```

ผลลัพธ์: `app/build/outputs/bundle/release/app-release.aab`

ตรวจก่อนอัปโหลด:

```bash
unzip -p app/build/outputs/bundle/release/app-release.aab base/manifest/AndroidManifest.xml \
  | strings | grep -i moneyma
```

ต้องเห็น `com.moneyma.app` และไม่มี `monyema` โผล่มา

> AAB ติดตั้งลงเครื่องตรง ๆ ไม่ได้ ถ้าอยากทดสอบ release build บนเครื่องให้ใช้
> `./gradlew assembleRelease` แล้ว `adb install -r app/build/outputs/apk/release/app-release.apk`
