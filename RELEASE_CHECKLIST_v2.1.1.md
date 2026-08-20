# MoneyMa v2.1.1 (versionCode 16) — Production Release Checklist

> Play Console อนุมัติ Production access แล้วสำหรับ **com.moneyma.app** (ยืนยันแล้ว 31 ก.ค. 2026)
> โค้ดถูก revert จาก `com.monyema.pfm` กลับเป็น `com.moneyma.app` เรียบร้อยแล้ว

---

## 🔴 เร่งด่วน — Rotate ข้อมูลลับ

ข้อมูลลับต่อไปนี้ถูกเปิดเผยในบทสนทนา ควรเปลี่ยนใหม่:

| รายการ | ที่เปลี่ยน | ความเร่งด่วน |
|---|---|---|
| **Stripe live secret key** (`sk_live_…`) | Stripe Dashboard → API keys → Roll key | 🔴 สูงสุด (เกี่ยวกับเงิน) |
| Google OAuth client secret (`GOCSPX-…`) | Google Cloud Console → Credentials | 🔴 สูง |
| Gemini API key (`AIzaSy…`) | Google AI Studio → API keys | 🟠 กลาง |
| Supabase DB password | Supabase → Settings → Database | 🟠 กลาง |
| RevenueCat account password | RevenueCat → Account settings | 🟠 กลาง |
| Keystore passwords (`PFM@Release2026!`) | เปลี่ยนไม่ได้ — แต่ไฟล์ .jks ยังปลอดภัยตราบใดที่ไม่หลุด | 🟡 เฝ้าระวัง |

✅ ตรวจแล้ว: `.env`, `.env.local`, `keystore.properties`, `*.jks` ทั้งหมด **ไม่ได้อยู่ใน git** (.gitignore ครอบคลุมถูกต้อง)

---

## ✅ แก้ไขแล้ว (โดย Claude, 31 ก.ค. 2026)

| ไฟล์ | การแก้ไข |
|---|---|
| `android/app/build.gradle` | namespace + applicationId → `com.moneyma.app`, versionCode 15→**16**, versionName → **2.1.1** |
| `capacitor.config.ts` | appId → `com.moneyma.app` |
| `android/app/src/main/assets/capacitor.config.json` | appId → `com.moneyma.app` |
| `android/.../res/values/strings.xml` | package_name + custom_url_scheme → `com.moneyma.app` |
| `MainActivity.java` | ย้ายไป `java/com/moneyma/app/` (ลบ `com/monyema/pfm` ทิ้ง) |
| `package.json` | version → 2.1.1 |
| `build/` + android assets | ลบไฟล์ขยะ `30-Day Viral Content Strategy Dashboard.html` ที่หลุดเข้าไปใน APK |

---

## 🔑 สถานะ Keystore

| Keystore | Alias | SHA-256 |
|---|---|---|
| `pfm-release-key.jks` ← ที่ config ใช้อยู่ | `pfm-key` | `84:E2:F3:BF:BC:D6:17:D3:4F:05:D3:43:8B:B7:D0:A0:D2:41:9A:7E:F9:17:41:D6:9C:7F:12:2C:72:12:0E:0F` |
| `monyekyestor.jks` (สำรอง) | `key1` | `E8:EF:46:ED:AC:88:E1:FF:86:5E:AE:F5:EE:FD:5D:07:19:69:13:4C:65:69:BF:F2:F4:15:DF:3B:4A:6D:AD:95` |
| `PersonalFinanceManager.apk` | — | `A6:61:1E:F9:…` (Android **debug** key — ใช้ปล่อยไม่ได้) |

SHA-1 ของ `pfm-release-key.jks` = `D7:D6:92:34:C7:21:8D:E4:4F:05:49:84:53:1A:45:48:0C:11:35:75`

### ⚠️ ต้องยืนยัน — ไปที่ Play Console

**Test and release → Setup → App integrity → App signing** จะเห็น 2 กล่อง:

1. **App signing key certificate** — key ที่ Google สร้างเอง ใช้เซ็นตัวที่ผู้ใช้ดาวน์โหลดจริง
   → ค่านี้**ไม่มีวันตรง**กับ keystore ในเครื่อง (ปกติ) แต่ **ต้องเอา SHA-1 ไปลงทะเบียนใน Firebase / Google Cloud OAuth** ไม่งั้น Google Login จะพังบน production
2. **Upload key certificate** — ค่านี้**ต้องตรง**กับ keystore ที่ใช้เซ็น AAB

### ค่าที่ดึงมาจาก Play Console แล้ว (31 ก.ค. 2026)

Certificate ชุดที่ 1: SHA-256 `65:2D:51:B6:29:D0:3C:A0:…`
Certificate ชุดที่ 2:
- MD5 `82:9A:01:13:FB:58:0F:02:A6:E1:66:AC:6C:6E:9F:60`
- SHA-1 `E9:E6:2C:8F:7D:8A:EB:C5:F2:4B:C8:32:03:3D:BD:86:1A:98:CA:90`
- SHA-256 `15:2B:27:97:2F:F2:65:F7:C2:41:65:F4:35:B7:90:75:BF:3C:6F:AB:4C:8E:83:F6:15:C3:DE:5A:58:6D:84:38`

**ทั้งสองชุดไม่ตรงกับ keystore ใด ๆ ในเครื่อง** (ตรวจครบทั้ง MD5/SHA-1/SHA-256 แล้ว และค้นทั้งโปรเจกต์ไม่พบ keystore ตัวที่ 3)

### 🔍 เบาะแส: มี keystore ตัวที่ 3 ที่หายไป

`ANDROID_SIGNING_CONFIG.md` (28 มี.ค. 2026 — เก่ากว่า keystore ทั้งสองตัวที่มีอยู่) อ้างถึง:

```
keytool -genkey -v -keystore ~/moneY-ma-key.keystore -alias moneyma-key
storeFile file('moneyma-key.keystore')
```

และ `android/app/build.gradle` บรรทัด 16 ยังมี fallback ไปหา `"moneyma-key.keystore"` อยู่

**ไทม์ไลน์ keystore:**

| วันที่ | ไฟล์ | alias | สถานะ |
|---|---|---|---|
| 28 มี.ค. 2026 | `~/moneY-ma-key.keystore` | `moneyma-key` | ❓ **หาไม่เจอ — น่าจะเป็น upload key ตัวจริง (15:2B)** |
| 22 เม.ย. 2026 | `monyekyestor.jks` | `key1` | มี (รหัสผ่านคนละตัว) |
| 24 เม.ย. 2026 | `pfm-release-key.jks` | `pfm-key` | มี ← config ใช้อยู่ |

แอปถูกสร้างใน Play Console ช่วง มี.ค.–เม.ย. ซึ่งตรงกับช่วงที่สร้าง `moneY-ma-key.keystore` พอดี

**ค้นหาในเครื่อง** (ชื่อไฟล์สะกดแปลก มี Y ตัวใหญ่):

```bash
ls -la ~/moneY-ma-key.keystore ~/moneyma-key.keystore 2>/dev/null
mdfind -name "keystore" | grep -iE "moneyma|money-ma"
find /Users -maxdepth 5 \( -iname "*.keystore" -o -iname "*.jks" \) 2>/dev/null
```

> หมายเหตุ: note เก่าอ้าง path `/Users/chanakhongdi/Project/PFM` และ `/Users/rnaibro/PFM`
> ซึ่งคนละ home directory กับปัจจุบัน (`/Users/chanakhonkdi/projects/PFM`) — ลองหาใน home เก่าและ Time Machine ด้วย

ตรวจ fingerprint เมื่อเจอ:

```bash
"/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" \
  -list -v -keystore ~/moneY-ma-key.keystore | grep -E "Alias|SHA1|SHA256"
```

ถ้าได้ `SHA256: 15:2B:27:97:…` → เจอ upload key แล้ว ไม่ต้อง reset

### สิ่งที่ต้องดูให้ชัด

หาบล็อกที่หัวข้อเขียนว่า **"Upload key certificate" / "ใบรับรองคีย์อัปโหลด"** โดยเฉพาะ:

| ถ้า SHA-256 ในบล็อกนั้นคือ | แปลว่า | ทำอะไร |
|---|---|---|
| `84:E2:F3:BF:…` | `pfm-release-key.jks` ถูกต้อง | ✅ build ได้เลย |
| `15:2B:27:97:…` หรือ `65:2D:51:B6:…` | upload key ไม่ได้อยู่ในเครื่อง | ต้องขอ **upload key reset** (ดูล่าง) |

### 🔴 ไม่ว่ากรณีไหน — SHA-1 ของ App signing key ต้องลงทะเบียน

SHA-1 `E9:E6:2C:8F:7D:8A:EB:C5:F2:4B:C8:32:03:3D:BD:86:1A:98:CA:90` (และ/หรืออีกชุด)
ต้องเพิ่มเข้าไปใน **Firebase Console** และ **Google Cloud OAuth (Android client)**
ไม่งั้น **Google Login จะพังบน production** เพราะ Google เซ็นแอปใหม่ด้วย app signing key ไม่ใช่ upload key
— นี่คือจุดที่คนพลาดกันบ่อยที่สุด

### ถ้าต้อง reset upload key

Play Console → App integrity → App signing → **Request upload key reset**
→ อัปโหลด `pfm-upload-cert.pem` (มีอยู่แล้วในโปรเจกต์ ตรงกับ `pfm-release-key.jks`)
→ Google อนุมัติภายใน ~1–2 วันทำการ

---

## ⚠️ ต้องทำก่อน build

1. **google-services.json** — ไฟล์ปัจจุบันลงทะเบียนเป็น `com.monyema.pfm` → **build จะ fail**
   - Firebase Console → โปรเจกต์ `moneyma-6c33b` → เพิ่ม/เลือกแอป Android `com.moneyma.app`
   - ใส่ **SHA-1 ของ App signing key** (จาก Play Console) + SHA-1 ของ upload key (`D7:D6:92:…`)
   - ดาวน์โหลด `google-services.json` ใหม่ → วางทับที่ `android/app/google-services.json`
2. **Google OAuth** — Google Cloud Console → Credentials → Android client
   ตรวจว่า package = `com.moneyma.app` และมี SHA-1 ทั้งของ upload key และ app signing key
3. **RevenueCat** → Project settings → Apps → Google Play
   ตรวจว่า package name = `com.moneyma.app` และ Service Account credentials ยังใช้ได้
4. **ติดตั้ง JDK 17+** — เครื่องยังไม่มี Java (`brew install --cask temurin@17` หรือใช้ JDK ที่มากับ Android Studio)
   ```bash
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   ```

---

## 🔨 ขั้นตอน Build & Release

```bash
cd ~/projects/PFM

# 1. Build web + sync
npm run build
npx cap sync android

# 2. Build AAB
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd android && ./gradlew clean bundleRelease

# 3. ตรวจ package + versionCode + ลายเซ็น ก่อนอัปโหลด
unzip -p app/build/outputs/bundle/release/app-release.aab base/manifest/AndroidManifest.xml \
  | strings | grep -i moneyma
./gradlew :app:signingReport | grep -A5 release
```

ผลลัพธ์: `android/app/build/outputs/bundle/release/app-release.aab`

4. Play Console → **Production** → Create new release → อัปโหลด AAB
5. กรอก Release notes (ไทย + อังกฤษ)
6. ตรวจ Store listing / Data safety / Content rating ให้ครบ → Submit review

---

## 📱 ทดสอบก่อนปล่อย (ตามที่ Google แนะนำ)

- [ ] ปล่อยเข้า **Internal testing** track ก่อน แล้วค่อย promote ไป Production
- [ ] ทดสอบบนเครื่องจริง: สมัคร/ล็อกอิน (รวม Google Login), cloud sync, สแกนสลิป (Gemini quota), ซื้อ premium ผ่าน RevenueCat sandbox
- [ ] ตรวจว่าโควต้า AI ทำงานถูก: Free 5/วัน, Pro 100/วัน, Business 1,000/วัน
- [ ] Staged rollout: 20% → ดู Crashlytics 24–48 ชม. → 50% → 100%

---

## 📦 Dependencies — lockfile ค้างเก่า (ตรวจ 31 ก.ค. 2026)

`package-lock.json` ยังเป็น **`"name": "monyema", "version": "1.4.0"`** (17 เม.ย.) ส่วน `node_modules` เก่ากว่านั้นอีก (28 มี.ค.) — ไม่ตรงกับ `package.json` ปัจจุบัน

| Package | ติดตั้งจริงใน node_modules | package.json ขอ | ระดับการข้าม |
|---|---|---|---|
| `firebase` | 10.14.1 | ^12.13.0 | ⚠️ ข้าม 2 major |
| `@revenuecat/purchases-capacitor` | 12.3.0 | ^13.1.2 | ⚠️ ข้าม 1 major (ระบบจ่ายเงิน!) |
| `react-icons` | 4.12.0 | ^5.6.0 | ⚠️ ข้าม 1 major |
| `xlsx` | 0.18.5 | CDN 0.20.3 | 🔴 ตัวเก่ามีช่องโหว่ |
| `@supabase/supabase-js` | 2.100.0 | ^2.106.1 | minor |
| `axios` | 1.13.6 | ^1.16.1 | minor |

**⚠️ อันตราย:** ถ้าสั่ง `npm install` ตอนกำลังจะ build release แล้วอัปโหลดเลย = แอปที่ปล่อยจะใช้ dependency
คนละชุดกับที่เคยทดสอบมา โดยเฉพาะ **RevenueCat 12→13 (ระบบชำระเงิน)** และ **firebase 10→12**

### ผล `npm audit` — 77 รายการ (critical 4, high 40)

**กระทบแอปจริง (โค้ดที่ถูก bundle ลงเครื่องผู้ใช้):**

| Package | ปัญหา | แก้โดย |
|---|---|---|
| `xlsx` 0.18.5 | Prototype Pollution + ReDoS — และไฟล์นี้ **parse ไฟล์ที่ผู้ใช้อัปโหลด** | `package.json` ชี้ไป CDN 0.20.3 อยู่แล้ว → แค่ `npm install` |
| `axios` 1.13.6 | SSRF (NO_PROXY bypass), prototype pollution ใน `validateStatus` | อัปเป็น ≥ 1.17.1 |
| `protobufjs` (ผ่าน firebase 10) | 🔴 critical — arbitrary code execution | อัป firebase → 12 |
| `@grpc/grpc-js`, `undici` (ผ่าน firebase 10) | DoS / crash | อัป firebase → 12 |

**ไม่กระทบแอปจริง (build-time เท่านั้น):**
`nth-check`, `svgo`, `css-select`, `postcss`, `serialize-javascript`, `workbox-*`, `shell-quote`, `webpack-dev-server`, `tar`, `node-gyp` — มาจาก `react-scripts` 5.0.1 ทั้งหมด แก้ไม่ได้จนกว่าจะย้ายออกจาก CRA (เป็นปัญหาที่รู้กันทั่วไปของ CRA ซึ่งเลิก maintain แล้ว)

**dependency ตายแล้วแต่ยังค้างใน lock:** `electron`, `electron-builder`, `sqlite3`, `pdfkit`, `concurrently`, `wait-on`, `setuptools` — ถูกลบจาก `package.json` แล้ว จะหายไปเองเมื่อ regenerate lockfile

### แนะนำลำดับการทำ

```bash
# 1. สำรองของเดิมไว้ก่อน (เผื่อต้อง rollback)
cp package-lock.json package-lock.json.bak

# 2. ติดตั้งใหม่ให้ตรงกับ package.json
rm -rf node_modules && npm install

# 3. ทดสอบให้ครบก่อน build release — โดยเฉพาะ
#    - RevenueCat: ซื้อ / restore purchase (major bump 12→13)
#    - Firebase: analytics, crashlytics, push (major bump 10→12)
#    - Export Excel (xlsx เปลี่ยน 0.18.5 → 0.20.3)
#    - Google Login
npm start

# 4. ค่อย build release
npm run build && npx cap sync android
```

> อย่ารวมขั้นตอนอัป dependency กับการปล่อย production ในรอบเดียว
> ถ้าอยากปล่อย v2.1.1 ให้เร็ว ทางที่ปลอดภัยกว่าคือ pin `package.json` กลับไปที่เวอร์ชั่นที่ติดตั้งอยู่จริง
> ปล่อยก่อน แล้วค่อยยกเครื่อง dependency เป็น v2.2.0 รอบถัดไป

---

## 📝 หนี้ทางเทคนิคที่ควรเก็บ

- Git ยังมีไฟล์แก้ค้างจำนวนมากตั้งแต่ พ.ค. — ควร commit + `git tag v2.1.1` ก่อน build
- `README.md` ยังเขียน version 1.4.0 (ควรอัปเป็น 2.1.1)
- `package.json` ฟิลด์ `author` ยังเป็น `"Your Name"`
- `PersonalFinanceManager.apk` ในรูทเป็น debug build เก่า (มี.ค. 2026) — ควรลบทิ้งกันสับสน
- `monyekyestor.jks` ถ้ายืนยันว่าไม่ใช้ ควรย้ายออกจากโปรเจกต์ไปเก็บที่ปลอดภัย
