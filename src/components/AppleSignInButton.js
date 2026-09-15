import React from 'react';

/**
 * ปุ่ม "Sign in with Apple" ตามข้อกำหนดของ Apple (Human Interface Guidelines)
 *
 * 🔴 ทำไมต้องมีไฟล์นี้ — App Store reject ครั้งที่ 3 (Guideline 4 - Design, 8 ก.ย. 2026)
 * "Sign in with Apple button includes logo artwork that is not downloaded from
 *  Apple Design Resources"
 *
 * ของเดิมใน Login.js / Register.js เป็นปุ่มที่วาดเองทั้งใบ:
 *   - path ของโลโก้แอปเปิลวาดขึ้นเอง สัดส่วนไม่ตรงกับของ Apple
 *   - `font: inherit` → ใช้ฟอนต์กลมของแอป ไม่ใช่ SF Pro ตามที่กำหนด
 *   - มี hover ยกปุ่ม + เงา ซึ่ง Apple ห้ามดัดแปลงหน้าตาปุ่ม
 *   - ข้อความไทยใช้ "เข้าสู่ระบบด้วย Apple" ซึ่งไม่ใช่คำแปลทางการของ Apple
 *
 * กฎของไฟล์นี้จากนี้ไป:
 *   1. ใช้ inline style ทั้งหมด ไม่พึ่ง CSS ของแอป — กัน stylesheet อื่นมาทับ
 *      แล้วปุ่มเพี้ยนไปจากสเปกโดยไม่มีใครรู้
 *   2. ห้ามเติม hover / transform / เงา / ไล่สี ใด ๆ
 *   3. ข้อความต้องเป็นคำแปลทางการของ Apple เท่านั้น (ดู LABELS)
 *   4. โลโก้ต้องเป็นอาร์ตเวิร์กของ Apple — อยู่ที่ APPLE_LOGO_PATH จุดเดียว
 *
 * สัดส่วนตามสเปก (อิงความสูงปุ่ม H):
 *   - โลโก้สูง 43% ของ H · ระยะขอบซ้าย-ขวา 8% ของ H
 *   - ตัวอักษร 43% ของ H · น้ำหนัก Medium · ฟอนต์ระบบ (SF Pro)
 *   - มุมโค้งไม่เกิน 50% ของ H (ที่นี่ใช้ 12px บนปุ่มสูง 48px)
 */

/**
 * โลโก้แอปเปิลตามอาร์ตเวิร์กของ Apple (viewBox 814 × 1000)
 * 🔴 ถ้าจะเปลี่ยน ให้เปลี่ยนที่นี่ที่เดียว และต้องเป็นไฟล์จาก
 *    https://developer.apple.com/design/resources/ เท่านั้น
 */
const APPLE_LOGO_PATH =
  'M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2' +
  '-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5' +
  'c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8' +
  'c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46' +
  ' 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1' +
  '-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1' +
  ' 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z';

/**
 * คำแปลทางการของ Apple เท่านั้น — ห้ามแต่งเอง ห้ามดึงจาก i18n ของแอป
 * (i18n ของเราเคยใช้ "เข้าสู่ระบบด้วย Apple" ซึ่งไม่ใช่คำที่ Apple กำหนด)
 */
const LABELS = {
  th: { signIn: 'ลงชื่อเข้าใช้ด้วย Apple', signUp: 'ลงทะเบียนด้วย Apple' },
  en: { signIn: 'Sign in with Apple', signUp: 'Sign up with Apple' },
};

const HEIGHT = 48;

export default function AppleSignInButton({
  onClick,
  disabled = false,
  language = 'en',
  mode = 'signIn',
}) {
  const pack = LABELS[language] || LABELS.en;
  const label = pack[mode] || pack.signIn;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // ระยะโลโก้↔ตัวอักษร: 8% ของความสูงชิดเกินไปในทางสายตา
        // ปุ่มจริงของ Apple เว้นราว 16% — ใช้ค่านั้น
        gap: `${HEIGHT * 0.16}px`,
        width: '100%',
        height: `${HEIGHT}px`,
        padding: `0 ${HEIGHT * 0.16}px`,
        boxSizing: 'border-box',
        background: '#000000',
        color: '#FFFFFF',
        border: 'none',
        borderRadius: '12px',
        // ฟอนต์ระบบของ Apple (SF Pro บน iOS) — ห้ามใช้ font: inherit
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif',
        fontSize: `${Math.round(HEIGHT * 0.43)}px`,
        fontWeight: 500,
        lineHeight: 1,
        letterSpacing: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        // ไม่มี transition / transform / box-shadow โดยตั้งใจ
        WebkitTapHighlightColor: 'transparent',
        WebkitAppearance: 'none',
        appearance: 'none',
      }}
    >
      <svg
        viewBox="0 0 814 1000"
        aria-hidden="true"
        focusable="false"
        style={{
          height: `${Math.round(HEIGHT * 0.43)}px`,
          width: 'auto',
          fill: '#FFFFFF',
          display: 'block',
          flexShrink: 0,
          // ชดเชยให้โลโก้อยู่กึ่งกลางเชิงสายตาเทียบกับตัวอักษร
          marginTop: '-2px',
        }}
      >
        <path d={APPLE_LOGO_PATH} />
      </svg>
      <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}
