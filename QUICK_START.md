# ⚡ Quick Start - 5 นาทีพร้อมใช้งาน

## 🚀 เริ่มต้นอย่างรวดเร็ว

### ขั้นตอนที่ 1: ลงเอย

```bash
# 1. เปิด Terminal
# 2. ไปที่โฟลเดอร์ PFM
cd ~/PFM

# 3. ลบของเก่า (ถ้ามี)
rm -rf node_modules package-lock.json
```

### ขั้นตอนที่ 2: ติดตั้ง

```bash
# ติดตั้ง dependencies
npm install
```

⏳ **รอ 3-5 นาที** (ครั้งแรกจะนาน)

### ขั้นตอนที่ 3: เรียกใช้

```bash
# เริ่มแอป
npm run dev
```

✅ **เสร็จแล้ว!** App ควรจะเปิดขึ้นมาอัตโนมัติ

---

## 📱 ลองใช้งาน

1. **Dashboard** → ดูข้อมูลรวม
2. **Transactions** → กด "+ Add Transaction"
3. เพิ่มธุรกรรม (Income/Expense)
4. ดูผลลัพธ์ใน Dashboard

---

## ❌ ติดปัญหา?

### Error: "npm ERR!"
```bash
npm cache clean --force
npm install
```

### Error: "Port 3000 is busy"
```bash
lsof -i :3000
kill -9 <PID>  # แทน <PID> ด้วยหมายเลข
npm run dev
```

### Error: "Cannot find module"
```bash
rm -rf node_modules
npm install
```

---

## 🎯 Files ที่สำคัญ

| File | ไว้ทำอะไร |
|------|---------|
| `package.json` | Dependencies list |
| `public/electron.js` | Main app logic |
| `src/App.js` | UI หลัก |
| `src/database/DatabaseService.js` | ฐานข้อมูล |

---

## 📚 ต่อไปอ่านอะไร

- **SETUP.md** - คำแนะนำเต็มตัว
- **README.md** - ข้อมูลเพิ่มเติม
- **DevTools** - กด Cmd+Option+I ดูข้อผิดพลาด

---

**สนุกกับการใช้งาน! 💰**