# 🚀 Setup Guide - Personal Finance Manager

## ✅ ข้อกำหนดเบื้องต้น

ให้แน่ใจว่าคุณมี:
- ✅ Node.js v18 ขึ้นไป (v22 ได้)
- ✅ npm v8 ขึ้นไป
- ✅ Xcode Command Line Tools (สำหรับ Mac)
- ✅ VS Code (optional)

### ตรวจสอบเวอร์ชัน:
```bash
node -v      # ต้อง v18 ขึ้นไป
npm -v       # ต้อง v8 ขึ้นไป
```

---

## 🔧 ขั้นตอนการติดตั้ง

### 1️⃣ Clone หรือ Copy โปรเจกต์

```bash
# ถ้าคุณมี Git
git clone <repository-url>
cd finance-manager

# หรือถ้า Copy files แล้ว
cd ~/PFM  # หรือที่ที่เก็บโปรเจกต์
```

### 2️⃣ ลบ node_modules เก่า (ถ้ามี)

```bash
# ลบ dependencies เก่า
rm -rf node_modules package-lock.json
```

### 3️⃣ ติดตั้ง Dependencies

```bash
# ติดตั้ง npm packages
npm install
```

⏳ **รอประมาณ 3-5 นาที** (ครั้งแรกจะนานกว่า)

**ถ้า npm install ติดขัด:**
```bash
# ลองคำสั่งนี้
npm cache clean --force
npm install
```

### 4️⃣ รันแอปพลิเคชัน

```bash
# เรียกใช้ในโหมด Development
npm run dev
```

**ผลลัพธ์ที่คาดหวัง:**
1. React dev server เปิด (http://localhost:3000)
2. Electron app เปิดโดยอัตโนมัติ
3. DevTools เปิด (ถ้าต้องการปิด ลบ `.openDevTools()` ใน electron.js)

---

## 🎯 วิธีใช้ App

### Dashboard
- ดูสรุปรายได้-รายจ่ายทั้งหมด
- ดูธุรกรรมล่าสุด

### Transactions
- ➕ เพิ่มธุรกรรมใหม่
- 📋 ดูรายการธุรกรรมทั้งหมด
- 🔍 ค้นหา/กรองข้อมูล

### Statistics
- 📊 ดูสรุปรายละเอียดตามหมวดหมู่

### Settings
- 📤 ส่งออกข้อมูล (Excel/PDF)
- 💾 สำรองข้อมูล

---

## ⚠️ การแก้ปัญหาเบื้องต้น

### ❌ Error: "Cannot find module 'better-sqlite3'"
**วิธีแก้:** ใช้ package.json ใหม่ (แล้วแก้แล้ว) แล้วลบ node_modules:
```bash
rm -rf node_modules package-lock.json
npm install
```

### ❌ Error: "Port 3000 is already in use"
**วิธีแก้:** ปิด process ที่ใช้ port 3000:
```bash
# ดูว่าใครใช้ port 3000
lsof -i :3000

# ปิด process
kill -9 <PID>
```

### ❌ Error: "Cannot find electron"
**วิธีแก้:**
```bash
npm install electron --save-dev
npm run dev
```

### ❌ "npm ERR! code ENOENT"
**วิธีแก้:**
```bash
# ตรวจสอบว่าอยู่ในโฟลเดอร์ที่มี package.json
pwd
ls -la | grep package.json

# ถ้าเห็น package.json แล้ว ลองอีกครั้ง
npm install
```

### ❌ "Database error"
**วิธีแก้:**
```bash
# ลบ database เก่า
rm ~/Library/Application\ Support/Personal\ Finance\ Manager/finance.db

# รัน app ใหม่
npm run dev
```

---

## 📂 Project Structure

```
finance-manager/
├── public/
│   ├── electron.js         ← Main Electron process
│   ├── preload.js          ← Security layer
│   └── index.html
├── src/
│   ├── App.js              ← Main React component
│   ├── pages/
│   │   ├── Dashboard.js
│   │   ├── Transactions.js
│   │   ├── Statistics.js
│   │   └── Settings.js
│   ├── database/
│   │   └── DatabaseService.js  ← SQLite manager
│   └── styles/
├── package.json            ← Dependencies
└── README.md
```

---

## 🛠️ Development Tips

### 🔄 Hot Reload
Changes to React files reload **automatically** - no need to restart!

### 🔧 DevTools
Press: **Cmd + Option + I** to open Chrome DevTools

### 💾 Database Location
```bash
# Mac
~/Library/Application Support/Personal Finance Manager/finance.db

# Windows
%APPDATA%\Personal Finance Manager\finance.db

# Linux
~/.config/Personal Finance Manager/finance.db
```

### 📊 Inspect Database
ใช้ **DB Browser for SQLite**:
1. Download: https://sqlitebrowser.org/
2. เปิด: ~/Library/Application Support/Personal Finance Manager/finance.db

---

## 🎁 Next Steps

### Build สำหรับ Mac
```bash
npm run build-mac
```
ไฟล์ `.dmg` จะอยู่ใน `dist/` folder

### Build สำหรับ Windows
```bash
npm run build-app
```

---

## 📞 Help & Support

ถ้าติดปัญหา:
1. ลองตรวจสอบ Node.js เวอร์ชัน
2. ลบ node_modules และติดตั้งใหม่
3. ดู DevTools console เพื่อหา error messages
4. Check คำแนะนำแก้ปัญหาด้านบน

---

## ✨ ยินดีต้อนรับ!

ตอนนี้คุณพร้อมเลย! 🚀

สนุกกับการจัดการการเงินของคุณ! 💰