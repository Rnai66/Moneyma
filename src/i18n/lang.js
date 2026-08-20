import { getTranslation } from './index';

/**
 * แหล่งความจริงเดียวสำหรับ "ตอนนี้แอปใช้ภาษาอะไร"
 *
 * LanguageContext ใช้ฟังก์ชันนี้ตอน mount และเขียนค่ากลับลง localStorage ทุกครั้งที่เปลี่ยนภาษา
 * ส่วนไฟล์ service (ไม่ใช่ React component จึงใช้ hook ไม่ได้) เรียก tr() เพื่ออ่านคำแปลปัจจุบัน
 */
export function resolveLanguage() {
  try {
    const saved = localStorage.getItem('language');
    if (saved === 'th' || saved === 'en') return saved;
  } catch {
    /* localStorage ใช้ไม่ได้ (SSR, โหมดส่วนตัวบางเบราว์เซอร์) */
  }
  const nav = (typeof navigator !== 'undefined' && (navigator.language || '')) || '';
  return nav.toLowerCase().startsWith('th') ? 'th' : 'en';
}

/** คำแปลของภาษาปัจจุบัน — สำหรับใช้นอก React tree */
export function tr() {
  return getTranslation(resolveLanguage());
}
