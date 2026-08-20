# MoneyMa Release Checklist — v2.2.0

**เวอร์ชันใหม่**: `v2.2.0`  
**Android versionCode**: `17` (versionName: `2.2.0`)  
**iOS Build / Version**: `5` (MARKETING_VERSION: `2.2.0`)  
**วันที่**: 19 สิงหาคม 2026

---

## 🌟 ฟีเจอร์หลักในเวอร์ชัน v2.2.0
1. 🏬 **ระบบจัดการคลังสินค้าแยกรายคลัง (Multi-Warehouse)**:
   - จัดสรรสต็อกสินค้า คลัง 1 (หลัก), คลัง 2 (หน้าร้าน), คลัง 3 (สำรอง) และคำนวณสต็อกรวมอัตโนมัติ
2. 🤖 **ระบบ Vision AI สแกนสินค้า ป้ายราคา และบิล**:
   - ปุ่ม `📷 AI สแกนกล้อง` และ `📁 Ai สแกนไฟล์` ในตารางคลังสินค้า และในแบบฟอร์มป๊อปอัพเพิ่มสินค้าใหม่
3. 📲 **PromptPay Dynamic QR Code & ใบสั่งซื้อ (SO)**:
   - สแกน QR รับเงินคำนวณยอดเงินตรง ยืนยันชำระเงินตัดสต็อก และพิมพ์สลิป/ใบสั่งซื้ออัตโนมัติ
4. 🎁 **ทดลองใช้งาน Business Plan ฟรี 7 วัน (7-Day Free Trial)**:
   - เปิดสิทธิ์ให้ผู้ใช้ทุกคนได้ทดลองฟังก์ชันคลังสินค้า POS สแกน AI และออกเอกสารฟรี 7 วัน
5. 📊 **ควบรวมเมนูสถิติและงบดุลเป็น "สรุป & งบการเงิน"**:
   - แท็บย่อยสลับดูกราฟสถิติวิเคราะห์รายรับ-รายจ่าย และรายงานงบดุลสเตทเม้นท์ในหน้าเดียว
6. ⚙️ **ย้ายปุ่มตั้งค่าไปมุมซ้ายด้านบน (Top-Left Settings)**:
   - ปุ่มตั้งค่าระบบลอยมุมซ้ายบนสำหรับมือถือ และปุ่มตั้งค่าใน Sidebar ด้านซ้ายสำหรับ Web

---

## 📦 คำสั่งสำหรับ Build ขึ้น Store

### Android (Google Play Console)
- **สร้าง APK / Android Bundle Sync**:
  ```bash
  npm run build-android
  ```
- **สร้าง Release APK / AAB**:
  ```bash
  cd android && ./gradlew assembleRelease
  ```

### iOS (Apple App Store / TestFlight)
- **Sync iOS Project**:
  ```bash
  npm run build-ios
  ```
- **Archive iOS Release**:
  ```bash
  npm run archive-ios
  ```
