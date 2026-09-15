/**
 * ค่าตั้งของหน้า /r/ (หน้ารับ QR จากใบเสร็จ)
 *
 * ไฟล์นี้ถูกเสิร์ฟเป็น static ตรงๆ เปิด view-source ก็เห็น
 * จึงใส่ได้เฉพาะ anon key ซึ่งออกแบบมาให้เปิดเผยอยู่แล้ว
 * 🔴 ห้ามเอา service_role key มาไว้ที่นี่เด็ดขาด
 *
 * สิทธิ์ของ anon key ถูกล็อกไว้ที่ฝั่ง Postgres แล้ว:
 * มันเรียกได้แค่ 3 ฟังก์ชัน RPC และอ่านตารางตรงๆ ไม่ได้เลย
 */
window.MM_R_CONFIG = {
  // เอาจาก .env: REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY
  supabaseUrl: 'https://nvgqqhqoarkfulsebepj.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52Z3FxaHFvYXJrZnVsc2ViZXBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNjE3NzAsImV4cCI6MjA4OTYzNzc3MH0.GlcSjdwcu8oDeo7IVPfKPh9ysLnu25Llhwln9ZpbW5I',

  // ลิงก์สโตร์
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.moneyma.app',
  appStoreUrl: 'https://apps.apple.com/th/app/moneyma/id6802772939',

  deepLinkScheme: 'moneyma',
};
