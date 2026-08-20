/**
 * billing.js — สวิตช์เดียวที่คุมว่าจะเปิดการขายบนมือถือหรือยัง
 *
 * ⚠️ เดิมค่านี้ถูกประกาศซ้ำเป็น `const NATIVE_BILLING_READY = false` ใน **5 ไฟล์**
 * (App.js · PremiumSettings.js · UpgradeModal.js · PaywallScreen.js · transactions.js)
 * ซึ่งแปลว่าเวลาจะเปิดขายต้องไปแก้ให้ครบทั้ง 5 ที่ ลืมที่เดียว = ปุ่มซื้อหายไปหน้าหนึ่ง
 * โดยไม่มีใครรู้ตัว (เอกสารเก่าเขียนว่ามี 4 ที่ ซึ่งตกไป 1 ไฟล์จริง ๆ)
 *
 * ตอนนี้รวมมาไว้ที่เดียว และอ่านจาก environment variable แทน
 * เปิดขายเมื่อพร้อม: ใส่ `REACT_APP_NATIVE_BILLING=true` ใน `.env.local` แล้ว build ใหม่
 *
 * 🔴 CRA ฝังค่า env ตอน build เท่านั้น — แก้ .env แล้ว **ต้อง build ใหม่เสมอ**
 */

/**
 * เปิดขายผ่าน Google Play / App Store ได้หรือยัง
 *
 * ต้องเป็น true ก็ต่อเมื่อครบทุกข้อนี้แล้ว:
 *   1. RevenueCat API key จริง (`goog_` / `appl_`) อยู่ใน .env — ห้ามเป็น Test Store key (`test_`)
 *   2. product ใน Play Console ตั้งราคาแล้วและกด **Activate** ครบทุกตัว
 *   3. RevenueCat: product ผูกเข้า entitlement `Premium` และ offering ตั้งเป็น **Current**
 *   4. ทดสอบซื้อจริงด้วยบัญชี license tester ผ่านแล้ว
 *
 * ถ้าเปิดทั้งที่ยังไม่ครบ ผู้ใช้จะเห็นปุ่มซื้อที่กดแล้ว error — ซึ่งผิดนโยบายของ Play
 * เรื่องการแสดงสินค้าที่ซื้อไม่ได้ และเสี่ยงรีวิว 1 ดาว
 */
export const NATIVE_BILLING_READY =
  process.env.REACT_APP_NATIVE_BILLING === 'true';

/**
 * ตอนนี้ควรแสดงราคาและปุ่มซื้อไหม
 *
 * บนเว็บขายผ่าน Stripe ได้เสมอ · บนมือถือต้องรอ Play Billing พร้อมก่อน
 * เพราะ Google ห้ามโชว์สินค้าที่ซื้อผ่าน Play Billing ไม่ได้
 *
 * @param {boolean} isNative - Capacitor.isNativePlatform()
 */
export const canSell = (isNative) => !isNative || NATIVE_BILLING_READY;
