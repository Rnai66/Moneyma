# Store listing — MoneyMa (`com.moneyma.app`)

> ร่างสำหรับ Main store listing บน Play Console · 4 ส.ค. 2026
>
> ℹ️ Open testing ผ่านรีวิวไปแล้ว แปลว่าใน Console **น่าจะมี listing ครบอยู่แล้ว**
> ร่างชุดนี้จึงเป็นตัวเลือกสำหรับ **ปรับปรุงของเดิม** ไม่ใช่ของที่ขาด
> เทียบกับของที่มีอยู่ก่อน แล้วเปลี่ยนเฉพาะส่วนที่ดีขึ้นจริง
> ทุกข้อความผ่านลิมิตอักขระของ Google แล้ว (ตัวเลขในวงเล็บ = จำนวนอักขระจริง)
> **ห้ามแก้แล้วเกินลิมิต** — Play Console จะไม่ให้บันทึก

---

## ข้อห้ามที่ใช้ตรวจร่างนี้แล้ว

Google ปฏิเสธ/ลดการโปรโมตข้อความที่มีสิ่งเหล่านี้ ร่างด้านล่างเลี่ยงครบแล้ว:

- ❌ อีโมจิ / สัญลักษณ์ (★ ☆ 💰) / เครื่องหมายวรรคตอนซ้ำ (!!, ?!)
- ❌ คำอวดอ้างอันดับหรือรางวัล — "อันดับ 1", "ดีที่สุด", "Top", "ล้านดาวน์โหลด"
- ❌ Call-to-action — "ดาวน์โหลดเลย", "ติดตั้งตอนนี้", "ลองเลย"
- ❌ คำเกี่ยวกับราคา/โปรโมชัน — "ฟรี", "ลดราคา", "Sale"
- ❌ พิมพ์ตัวใหญ่ทั้งคำเพื่อเน้น
- ❌ ยัดคีย์เวิร์ดซ้ำ ๆ (ไม่ช่วยอันดับ และเสี่ยงถูกตีตก)

---

# ภาษาไทย (ภาษาหลัก — th-TH)

## ชื่อแอป · ลิมิต 30

```
MoneyMa บันทึกรายรับรายจ่าย
```
(27)

## คำอธิบายสั้น · ลิมิต 80

```
จดรายรับรายจ่าย ตั้งงบรายหมวด สแกนสลิป และดูสถิติการใช้จ่ายย้อนหลัง
```
(67)

## คำอธิบายแบบเต็ม · ลิมิต 4,000

```
MoneyMa คือแอปจัดการการเงินส่วนตัวสำหรับคนที่อยากรู้ว่าเงินหายไปไหนในแต่ละเดือน บันทึกรายรับรายจ่ายได้ในไม่กี่วินาที ดูสรุปยอดคงเหลือแบบเรียลไทม์ และตั้งงบประมาณรายหมวดเพื่อคุมค่าใช้จ่ายให้อยู่ในกรอบ

สิ่งที่ทำได้ใน MoneyMa

หน้าแดชบอร์ด
เห็นรายรับ รายจ่าย และยอดคงเหลือของเดือนปัจจุบันในหน้าจอเดียว พร้อมรายการล่าสุดที่บันทึกไว้

บันทึกรายการ
เพิ่ม แก้ไข และลบรายการรายรับรายจ่ายพร้อมหมวดหมู่ วันที่ และบันทึกย่อ ค้นหาย้อนหลังและกรองตามช่วงเวลาได้

สแกนสลิป
ถ่ายภาพสลิปโอนเงินหรือใบเสร็จ แล้วให้ระบบอ่านยอดและวันที่ให้อัตโนมัติ ลดการพิมพ์ทีละตัว ตรวจแก้ก่อนบันทึกได้เสมอ

งบประมาณรายหมวด
กำหนดวงเงินต่อหมวด เช่น อาหาร เดินทาง ช้อปปิ้ง ระบบจะเตือนเมื่อใช้ใกล้ถึงเพดานที่ตั้งไว้

สถิติและกราฟ
ดูสัดส่วนค่าใช้จ่ายแยกตามหมวด และแนวโน้มรายเดือน เพื่อหาจุดที่ปรับลดได้จริง

รายงานและการส่งออก
สรุปรายงานตามช่วงเวลาที่เลือก และส่งออกเป็นไฟล์ Excel หรือ PDF เพื่อเก็บหลักฐานหรือทำบัญชีต่อ

ซิงก์ข้ามอุปกรณ์
สำรองข้อมูลขึ้นคลาวด์และซิงก์ระหว่างมือถือกับเดสก์ท็อป ข้อมูลถูกส่งผ่านการเชื่อมต่อที่เข้ารหัส

สองภาษาและโหมดมืด
สลับไทย-อังกฤษ และธีมสว่าง-มืดได้ตลอดเวลา

เกี่ยวกับบัญชีและความเป็นส่วนตัว

MoneyMa ไม่เชื่อมต่อกับบัญชีธนาคารของคุณ และไม่ดึงข้อมูลธุรกรรมจากสถาบันการเงินใด ๆ ทุกรายการมาจากที่คุณบันทึกเองหรือจากสลิปที่คุณเลือกสแกน คุณขอลบบัญชีและข้อมูลทั้งหมดได้ตลอดเวลา รายละเอียดอยู่ในนโยบายความเป็นส่วนตัว

MoneyMa Premium

ฟีเจอร์พื้นฐานใช้ได้โดยไม่ต้องสมัครสมาชิก ส่วน Premium เปิดการซิงก์ข้ามอุปกรณ์ รายงานขั้นสูง และการส่งออกแบบไม่จำกัด สมัครแบบรายเดือน รายปี หรือจ่ายครั้งเดียว ยกเลิกได้เองในหน้าการสมัครสมาชิกของ Google Play

ติดต่อทีมงาน
naiguitarfolk@gmail.com
```

## ข้อความรุ่น (Release notes) · ลิมิต 500

**สำหรับรุ่น production แรก (promote จาก vc16):**
```
เวอร์ชัน 2.1.1 เปิดตัวเต็มรูปแบบบน Google Play

- แดชบอร์ดสรุปรายรับ รายจ่าย และยอดคงเหลือรายเดือน
- บันทึกและจัดหมวดหมู่รายการ พร้อมค้นหาย้อนหลัง
- สแกนสลิปอ่านยอดและวันที่อัตโนมัติ
- ตั้งงบประมาณรายหมวดพร้อมการแจ้งเตือน
- กราฟสถิติแยกตามหมวดและแนวโน้มรายเดือน
- ส่งออกรายงานเป็น Excel และ PDF
- ซิงก์ข้ามอุปกรณ์สำหรับผู้ใช้ Premium
- รองรับภาษาไทยและอังกฤษ พร้อมโหมดมืด
```

---

# English (en-US)

## App name · limit 30

```
MoneyMa: Expense Tracker
```
(24)

## Short description · limit 80

```
Log income and expenses, set category budgets, scan slips, and review your stats
```
(80)

## Full description · limit 4,000

```
MoneyMa is a personal finance app for people who want to know where their money actually goes each month. Log income and expenses in seconds, see your running balance, and set category budgets that keep spending inside a limit you choose.

What you can do in MoneyMa

Dashboard
Income, expenses, and remaining balance for the current month on a single screen, along with your most recent entries.

Transactions
Add, edit, and delete entries with a category, date, and note. Search your history and filter by date range.

Slip scanning
Photograph a transfer slip or receipt and let the app read the amount and date for you. You can review and correct every field before it is saved.

Category budgets
Set a limit per category such as food, transport, or shopping, and get a reminder as spending approaches the cap.

Statistics and charts
See how spending breaks down by category and how it trends month over month, so you can find what to adjust.

Reports and export
Summarize any date range and export it to Excel or PDF for your records or your accountant.

Sync across devices
Back up to the cloud and sync between mobile and desktop. Data travels over an encrypted connection.

Two languages and dark mode
Switch between Thai and English, and between light and dark themes, at any time.

About accounts and privacy

MoneyMa does not connect to your bank account and does not pull transactions from any financial institution. Every entry comes from you, either typed in or scanned from a slip you chose. You can request deletion of your account and all associated data at any time. Details are in the privacy policy.

MoneyMa Premium

Core features work without a subscription. Premium unlocks cross-device sync, advanced reports, and unlimited export. Monthly, annual, and one-time options are available, and you can cancel yourself from your Google Play subscriptions page.

Contact
naiguitarfolk@gmail.com
```

## Release notes · limit 500

```
Version 2.1.1, our first full release on Google Play

- Monthly dashboard for income, expenses, and balance
- Transaction logging with categories and history search
- Slip scanning that reads amount and date automatically
- Per-category budgets with reminders
- Charts by category and month-over-month trends
- Excel and PDF report export
- Cross-device sync for Premium users
- Thai and English, with dark mode
```

---

# ภาษาอื่นในอาเซียน

Play ไม่บังคับให้แปล แต่ถ้าไม่แปล ผู้ใช้ในประเทศนั้นจะเห็น listing ภาษาอังกฤษ ซึ่งใช้ได้ทั้ง สิงคโปร์ มาเลเซีย ฟิลิปปินส์ บรูไน

พิจารณาแปลเพิ่มถ้าจะลงจริงจัง:

| ประเทศ | โลแคลที่ควรเพิ่ม | เหตุผล |
|---|---|---|
| อินโดนีเซีย | `id-ID` | ผู้ใช้ส่วนใหญ่อ่านอังกฤษไม่คล่อง ตลาดใหญ่สุดในอาเซียน |
| เวียดนาม | `vi-VN` | เช่นเดียวกัน อัตราติดตั้งต่างกันชัดเมื่อแปล |
| ฟิลิปปินส์ | ไม่ต้อง | อังกฤษเป็นภาษาราชการ |
| สิงคโปร์ / มาเลเซีย / บรูไน | ไม่ต้อง | อังกฤษใช้ได้ |

> ⚠️ ถ้าแปล ต้องแปล **ทั้งชุด** ของโลแคลนั้น (ชื่อ + คำอธิบายสั้น + คำอธิบายเต็ม + ภาพ)
> การแปลครึ่ง ๆ กลาง ๆ ทำให้ Play แสดงผลปนกันจนดูไม่น่าเชื่อถือ

---

# ข้อมูลอื่นในหน้า Store settings

| ช่อง | ค่าที่ควรใส่ |
|---|---|
| App category | **Finance** |
| Tags | Budgeting, Expense tracking, Personal finance (เลือกได้สูงสุด 5) |
| Email ติดต่อ | `naiguitarfolk@gmail.com` |
| เว็บไซต์ | URL Netlify ของ MoneyMa |
| Privacy policy URL | ต้องเป็น URL สาธารณะที่เปิดได้โดยไม่ต้องล็อกอิน |
| External marketing | เปิดไว้ (ให้ Google โปรโมตแอปได้) |
