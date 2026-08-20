/**
 * appInfo.js — ข้อมูลตัวแอปสำหรับหน้า "เกี่ยวกับ"
 *
 * ⚠️ เดิมเวอร์ชันถูกเขียนตายไว้ในไฟล์ภาษาว่า "เวอร์ชัน 1.4.2"
 * ทั้งที่ `package.json` และ `build.gradle` เป็น 2.1.1 มานานแล้ว
 * ผู้ใช้จึงเห็นเวอร์ชันผิดมาตลอด และไม่มีใครสังเกตเพราะต้องไปแก้คนละที่กับที่ bump
 *
 * ตอนนี้ค่าเดียวที่ต้อง bump คือ `package.json` — สคริปต์ build ส่งต่อให้เอง
 * ผ่าน `REACT_APP_VERSION=$npm_package_version`
 */

/** เวอร์ชันของแอป — มาจาก package.json ตอน build */
export const APP_VERSION = process.env.REACT_APP_VERSION || '';

/** ชื่อไฟล์ไอคอนจริงที่แอปใช้ (ตัวเดียวกับใน manifest.webmanifest) */
export const APP_ICON = `${process.env.PUBLIC_URL || ''}/assets/icons/icon-192.webp`;
