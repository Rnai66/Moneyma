# MoneyMa 💰 — Personal Finance Manager

> จัดการการเงินส่วนตัวอย่างชาญฉลาด บน Desktop, iOS และ Android

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Desktop%20%7C%20iOS%20%7C%20Android-lightgrey.svg)](capacitor.config.ts)

---

## ✨ Features

| หมวดหมู่ | ฟีเจอร์ |
|---|---|
| 📊 **Dashboard** | ภาพรวมรายรับ-รายจ่าย และยอดคงเหลือประจำเดือน |
| 💸 **Transactions** | เพิ่ม / แก้ไข / ลบ รายการรายรับ-รายจ่าย |
| 📈 **Statistics** | กราฟและสถิติการใช้จ่ายแยกตามหมวดหมู่ |
| 📋 **Reports** | รายงานสรุปและ Export ข้อมูลเป็น Excel / PDF |
| 🎯 **Budget Limits** | ตั้งงบประมาณรายหมวดหมู่ พร้อมแจ้งเตือนใกล้เกิน |
| 📸 **Scan Slip** | สแกนสลิปอัตโนมัติด้วย OCR |
| 🔐 **Auth** | ล็อกอิน / สมัครสมาชิก / รีเซ็ตรหัสผ่าน (Supabase Auth) |
| ☁️ **Cloud Sync** | ซิงค์ข้อมูลข้ามอุปกรณ์ผ่าน Supabase (Pro) |
| 💎 **Premium** | จัดการ subscription ผ่าน RevenueCat |
| 🌏 **i18n** | รองรับภาษาไทยและอังกฤษ |
| 🌙 **Dark Mode** | สลับธีมสว่าง / มืด |

---

## 🏗️ Tech Stack

| Layer | เทคโนโลยี |
|---|---|
| **Frontend** | React 18, Chart.js, Recharts, React Icons |
| **Desktop** | Electron 27 + SQLite3 |
| **Mobile** | Capacitor 8 (iOS & Android) |
| **Backend / Auth** | Supabase (PostgreSQL + Auth + Realtime) |
| **Payments** | RevenueCat (Capacitor plugin) |
| **Analytics / Push** | Firebase 10 |
| **Export** | xlsx, PDFKit |
| **Build Tool** | react-scripts (CRA), electron-builder |

---

## 📋 Prerequisites

| ซอฟต์แวร์ | เวอร์ชัน |
|---|---|
| Node.js | v18+ แนะนำ |
| npm | มาพร้อม Node.js |
| Git | ล่าสุด |
| Xcode | 15+ (สำหรับ iOS) |
| Android Studio | Hedgehog+ (สำหรับ Android) |

---

## 🚀 Installation

```bash
# 1. Clone repo
git clone <repo-url>
cd PFM

# 2. ติดตั้ง dependencies
npm install

# 3. ตั้งค่า environment variables
cp .env.example .env.local
# แล้วแก้ไขค่าใน .env.local ตามข้อมูล Supabase / Firebase ของคุณ
```

### Environment Variables ที่จำเป็น

```env
REACT_APP_SUPABASE_URL=https://xxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_FIREBASE_API_KEY=...
```

ดู `.env.example` สำหรับรายการตัวแปรทั้งหมด

---

## ▶️ Running the Application

### 🌐 Web (Browser)

```bash
npm start
# เปิด http://localhost:3000
```

### 🖥️ Desktop (Electron)

```bash
# Development — เปิด React + Electron พร้อมกัน
npm run dev

# Production build สำหรับ macOS
npm run build-mac
# ได้ไฟล์ .dmg / .zip ใน dist/
```

### 📱 Mobile (Capacitor)

```bash
# Sync web build ไปยัง native projects
npm run build-android   # Android
npm run build-ios       # iOS

# Build APK (release)
npm run build-android-release

# Archive สำหรับ App Store
npm run archive-ios
npm run export-ios-appstore
```

---

## 📁 Project Structure

```
PFM/
├── public/
│   ├── electron.js          # Electron main process
│   ├── preload.js           # Electron IPC bridge
│   └── index.html
├── src/
│   ├── components/
│   │   ├── ScanSlip.js      # OCR slip scanning
│   │   └── SyncStatus.js    # Cloud sync indicator
│   ├── pages/
│   │   ├── dashboard.js     # หน้าหลัก / ภาพรวม
│   │   ├── transactions.js  # รายการธุรกรรม
│   │   ├── statistics.js    # กราฟสถิติ
│   │   ├── reports.js       # รายงาน & Export
│   │   ├── BudgetLimits.js  # งบประมาณรายหมวด
│   │   ├── PremiumSettings.js # Premium / Subscription
│   │   ├── settings.js      # ตั้งค่าทั่วไป
│   │   ├── Login.js         # หน้าเข้าสู่ระบบ
│   │   ├── Register.js      # หน้าสมัครสมาชิก
│   │   └── UpdatePassword.js # รีเซ็ตรหัสผ่าน
│   ├── services/
│   │   ├── SupabaseService.js   # Supabase API wrapper
│   │   ├── AuthContext.js       # Auth state (Context)
│   │   ├── SyncService.js       # Cloud sync logic
│   │   ├── useSync.js           # Sync hook
│   │   ├── PaymentService.js    # RevenueCat integration
│   │   ├── FirebaseConfig.js    # Firebase init
│   │   └── LanguageContext.js   # i18n context
│   ├── i18n/                # ไฟล์แปลภาษา (th, en)
│   ├── database/            # SQLite service (Electron)
│   ├── styles/
│   │   ├── App.css
│   │   └── index.css
│   └── App.js               # Root component + routing
├── android/                 # Capacitor Android project
├── ios/                     # Capacitor iOS project
├── docs/                    # เอกสารเพิ่มเติม
├── capacitor.config.ts      # Capacitor configuration
├── firebase.json            # Firebase hosting config
├── supabase-schema.sql      # Database schema
├── package.json
└── README.md
```

---

## 🗄️ Database

### Desktop (Electron)
ใช้ **SQLite3** เก็บข้อมูลในเครื่อง:
- Path: `~/Library/Application Support/MoneyMa/finance.db` (macOS)
- สร้างอัตโนมัติเมื่อเปิดแอปครั้งแรก

### Cloud (Supabase)
ใช้ **PostgreSQL** ผ่าน Supabase:
- ดู schema ที่ [`supabase-schema.sql`](supabase-schema.sql)
- รองรับ Row Level Security (RLS) ต่อ user
- Update budget schema: [`update-budget-schema.sql`](update-budget-schema.sql)

---

## 📚 Documentation

| ไฟล์ | เนื้อหา |
|---|---|
| [QUICK_START.md](QUICK_START.md) | เริ่มต้นใช้งานเร็ว |
| [SETUP.md](SETUP.md) | ตั้งค่าโปรเจกต์ละเอียด |
| [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md) | Checklist ก่อน deploy |
| [AUTH_SETUP_GUIDE.md](AUTH_SETUP_GUIDE.md) | ตั้งค่า Supabase Auth |
| [AUTH_API_REFERENCE.md](AUTH_API_REFERENCE.md) | API Reference สำหรับ Auth |
| [AUTH_DEEP_DIVE.md](AUTH_DEEP_DIVE.md) | อธิบาย Auth flow เชิงลึก |
| [FIREBASE_SETUP_GUIDE.md](FIREBASE_SETUP_GUIDE.md) | ตั้งค่า Firebase |
| [IOS_RELEASE_GUIDE.md](IOS_RELEASE_GUIDE.md) | วิธี release บน App Store |
| [ANDROID_SIGNING_CONFIG.md](ANDROID_SIGNING_CONFIG.md) | ตั้งค่า signing key Android |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | คำสั่งสำคัญสรุปย่อ |
| [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) | บันทึกฟีเจอร์ที่ implement แล้ว |
| [PHASE_1_COMPLETE.md](PHASE_1_COMPLETE.md) | สรุป Phase 1 |
| [PHASE_2_GUIDE.md](PHASE_2_GUIDE.md) | แผน Phase 2 |

---

## 🔧 Useful Scripts

```bash
npm start                      # Web dev server (localhost:3000)
npm run dev                    # Desktop dev (React + Electron)
npm run build                  # Production web build
npm run build-mac              # macOS .dmg installer
npm run build-android          # Sync + open Android project
npm run build-android-release  # APK release build
npm run build-ios              # Sync + open iOS project
npm run archive-ios            # สร้าง .xcarchive สำหรับ App Store
npm run export-ios-appstore    # Export .ipa สำหรับ App Store
```

---

## 🛡️ Security

- ✅ Supabase Row Level Security (RLS) — ข้อมูลแยกต่อ user
- ✅ Electron Context Isolation — main / renderer แยกกัน
- ✅ IPC preload bridge — ไม่มี Node.js ใน renderer
- ✅ Environment variables — ไม่ commit credentials
- ✅ Capacitor — ไม่ expose native API โดยตรง

---

## 🐛 Troubleshooting

### `npm install` ล้มเหลว
```bash
npm cache clean --force
npm install
```

### Supabase connection error (`SocketException: Failed host lookup`)
- ตรวจสอบ `REACT_APP_SUPABASE_URL` ใน `.env.local`
- ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต / Network permissions ของ iOS/Android

### Electron ไม่เปิด
```bash
lsof -i :3000   # เช็คว่ามีอะไรใช้ port 3000 อยู่
```

### iOS build ล้มเหลว
- ตรวจสอบ Apple Developer Certificate / Provisioning Profile ใน Xcode
- ดู [IOS_RELEASE_GUIDE.md](IOS_RELEASE_GUIDE.md)

---

## 🗺️ Roadmap

### ✅ Phase 1 — เสร็จแล้ว
- [x] Dashboard, Transactions, Statistics, Reports
- [x] Supabase Auth (Login / Register / Reset Password)
- [x] Cloud Sync (Pro)
- [x] Budget Limits
- [x] Dark Mode & i18n (TH / EN)
- [x] Electron Desktop build
- [x] Capacitor iOS & Android build
- [x] RevenueCat Premium subscription

### 🚧 Phase 2 — กำลังพัฒนา
- [ ] Scan Slip ด้วย AI (OCR อัตโนมัติ)
- [ ] Recurring transactions
- [ ] Widget สำหรับ iOS / Android
- [ ] Push notifications เตือนงบประมาณ
- [ ] Apple Pay / Google Pay integration

### 🔮 Phase 3 — อนาคต
- [ ] Machine learning จัดหมวดหมู่อัตโนมัติ
- [ ] Tax report generation
- [ ] Investment & portfolio tracking
- [ ] Open Banking integration

---

## 📄 License

MIT License — ดูรายละเอียดใน [LICENSE](LICENSE)

---

**Happy budgeting! 💸 — MoneyMa v1.4.0**
