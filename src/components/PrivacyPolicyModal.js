import React, { useState } from 'react';
import './PrivacyPolicyModal.css';

export const PrivacyPolicyModal = ({ isOpen, onClose, language = 'th' }) => {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'ai', 'storage', 'rights'
  const [lang, setLang] = useState(language);

  if (!isOpen) return null;

  const th = lang === 'th';

  return (
    <div className="privacy-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="privacy-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="privacy-modal-header">
          <div className="privacy-modal-title-group">
            <span className="privacy-modal-badge">🛡️ {th ? 'ความปลอดภัยและความเป็นส่วนตัว' : 'Privacy & Security'}</span>
            <h2>{th ? 'นโยบายความเป็นส่วนตัว MoneyMa' : 'MoneyMa Privacy Policy'}</h2>
            <p className="privacy-modal-subtitle">
              {th 
                ? 'เวอร์ชัน 2.1.0 · อัปเดตล่าสุด สิงหาคม 2026' 
                : 'Version 2.1.0 · Last Updated August 2026'}
            </p>
          </div>

          <div className="privacy-modal-header-actions">
            {/* Language Switcher */}
            <div className="privacy-lang-switch">
              <button 
                type="button"
                className={`privacy-lang-btn ${lang === 'th' ? 'active' : ''}`}
                onClick={() => setLang('th')}
              >
                TH
              </button>
              <button 
                type="button"
                className={`privacy-lang-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => setLang('en')}
              >
                EN
              </button>
            </div>

            <button type="button" className="privacy-close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="privacy-modal-tabs">
          <button 
            type="button"
            className={`privacy-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📋 {th ? 'ภาพรวม' : 'Overview'}
          </button>
          <button 
            type="button"
            className={`privacy-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            🤖 {th ? 'การประมวลผล AI' : 'AI Processing'}
          </button>
          <button 
            type="button"
            className={`privacy-tab-btn ${activeTab === 'storage' ? 'active' : ''}`}
            onClick={() => setActiveTab('storage')}
          >
            🔒 {th ? 'การจัดเก็บข้อมูล' : 'Data Storage'}
          </button>
          <button 
            type="button"
            className={`privacy-tab-btn ${activeTab === 'rights' ? 'active' : ''}`}
            onClick={() => setActiveTab('rights')}
          >
            ⚖️ {th ? 'สิทธิ์ของคุณ' : 'Your Rights'}
          </button>
        </div>

        {/* Body Content */}
        <div className="privacy-modal-body">
          {activeTab === 'overview' && (
            <div className="privacy-tab-content">
              <h3>{th ? '1. ภาพรวมการคุ้มครองข้อมูลส่วนบุคคล' : '1. Overview of Data Protection'}</h3>
              <p>
                {th 
                  ? 'MoneyMa ให้ความสำคัญสูงสุดกับความเป็นส่วนตัวของคุณ ข้อมูลทางการเงินของคุณถือเป็นความลับส่วนบุคคล เราไม่เคยและจะไม่มีวันขายข้อมูลส่วนบุคคลของคุณให้กับนายหน้าข้อมูลหรือผู้โฆษณาภายนอกโดยเด็ดขาด'
                  : 'MoneyMa places the highest priority on your privacy. Your financial data is strictly personal. We do not and will never sell your personal data to data brokers or third-party advertisers.'}
              </p>

              <div className="privacy-summary-table">
                <div className="privacy-table-row header">
                  <span>{th ? 'ประเภทข้อมูล' : 'Data Type'}</span>
                  <span>{th ? 'วัตถุประสงค์' : 'Purpose'}</span>
                  <span>{th ? 'การจัดเก็บ' : 'Storage'}</span>
                </div>
                <div className="privacy-table-row">
                  <strong>{th ? 'บันทึกรายรับ-รายจ่าย' : 'Transactions'}</strong>
                  <span>{th ? 'คำนวณสถิติและสรุปยอด' : 'Analytics & Financial summary'}</span>
                  <span className="badge-local">{th ? 'เครื่องของคุณ / Cloud (เมื่อล็อกอิน)' : 'Local / Cloud (When signed in)'}</span>
                </div>
                <div className="privacy-table-row">
                  <strong>{th ? 'รูปสลิป / ใบเสร็จ' : 'Receipt Images'}</strong>
                  <span>{th ? 'อ่านยอดเงินด้วย AI OCR ชั่วคราว' : 'Temporary AI OCR text extraction'}</span>
                  <span className="badge-secure">{th ? 'ลบทิ้งทันทีหลังอ่านเสร็จ' : 'Deleted immediately after scan'}</span>
                </div>
                <div className="privacy-table-row">
                  <strong>{th ? 'อีเมล / บัญชี' : 'Account & Email'}</strong>
                  <span>{th ? 'ยืนยันตัวตน (Apple/Google)' : 'Authentication (Apple/Google)'}</span>
                  <span className="badge-cloud">{th ? 'Supabase Auth เข้ารหัส SSL' : 'Supabase Auth SSL Encrypted'}</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="privacy-tab-content">
              <h3>{th ? '2. การประมวลผลข้อมูลด้วย AI & ผู้ให้บริการภายนอก' : '2. AI Processing & Third-Party Services'}</h3>
              <div className="privacy-callout info">
                <strong>🤖 Google Gemini OCR Engine</strong>
                <p>
                  {th
                    ? 'เมื่อคุณใช้งานฟีเจอร์ "สแกนสลิป" หรือ "สแกนบิล" ภาพสลิปจะถูกส่งไปยัง Google Gemini API ผ่านการเข้ารหัส TLS 1.3 เพื่อดึงข้อมูล วันที่ จำนวนเงิน และหมวดหมู่อัตโนมัติ'
                    : 'When using "Scan Slip" or "Scan Bill", images are securely transmitted via TLS 1.3 to Google Gemini API solely for extracting date, amount, and category.'}
                </p>
              </div>

              <h4>{th ? 'ข้อกำหนดความปลอดภัย AI:' : 'AI Security Guarantees:'}</h4>
              <ul>
                <li>
                  <strong>{th ? 'ไม่มีการนำรูปภาพไปเทรน AI:' : 'No AI Model Training:'}</strong>{' '}
                  {th 
                    ? 'Google Gemini API ภายใต้ Enterprise Policy จะไม่นำภาพสลิปหรือข้อมูลการเงินของผู้ใช้ไปฝึกสอนโมเดล AI ใดๆ' 
                    : 'Google Gemini API under enterprise terms does not use your financial slips or images to train AI models.'}
                </li>
                <li>
                  <strong>{th ? 'การลบข้อมูลทันที (Zero Retention):' : 'Zero Retention:'}</strong>{' '}
                  {th 
                    ? 'ภาพสลิปจะถูกประมวลผลในหน่วยความจำชั่วคราวและลบทันทีหลังจากส่งผลลัพธ์ ไม่มีการเก็บบันทึกภาพลงบนเซิร์ฟเวอร์ AI' 
                    : 'Images are processed in temporary memory and purged immediately after extraction. No images are stored on AI servers.'}
                </li>
                <li>
                  <strong>{th ? 'สิทธิ์ในการเพิกถอนความยินยอม:' : 'Right to Revoke Consent:'}</strong>{' '}
                  {th 
                    ? 'คุณสามารถเปิด-ปิดความยินยอมการส่งรูปภาพให้ AI ได้ตลอดเวลาในหน้า ตั้งค่า ➡️ ความเป็นส่วนตัวและ AI' 
                    : 'You can grant or revoke AI data consent at any time in Settings ➡️ Privacy & AI.'}
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="privacy-tab-content">
              <h3>{th ? '3. การจัดเก็บข้อมูลและความปลอดภัย (Security & RLS)' : '3. Data Storage & Security'}</h3>
              <p>
                {th 
                  ? 'ข้อมูลธุรกรรมของคุณได้รับการปกป้องด้วยมาตรฐานความปลอดภัยระดับสูง:'
                  : 'Your transaction data is protected with industry-standard security practices:'}
              </p>

              <ul>
                <li>
                  <strong>Row-Level Security (RLS):</strong>{' '}
                  {th 
                    ? 'ฐานข้อมูล Supabase ถูกล็อกด้วยนโยบาย RLS ที่อนุญาตให้เฉพาะเจ้าของบัญชี (ตรงกับ UID) เท่านั้นที่สามารถอ่านหรือเขียนข้อมูลของตนเองได้ ผู้ใช้อื่นหรือบุคคลภายนอกไม่สามารถเข้าถึงได้เด็ดขาด'
                    : 'Supabase PostgreSQL database is strictly enforced with Row-Level Security. Only your authenticated UID can read or modify your records.'}
                </li>
                <li>
                  <strong>End-to-End Transport Security:</strong>{' '}
                  {th ? 'การรับส่งข้อมูลทั้งหมดผ่าน HTTPS / TLS 1.3 เข้ารหัส 256-bit' : 'All data in transit is encrypted via 256-bit TLS 1.3 / HTTPS.'}
                </li>
                <li>
                  <strong>Local-First Architecture:</strong>{' '}
                  {th ? 'หากคุณไม่ลงชื่อเข้าใช้ ข้อมูลทั้งหมดจะถูกเก็บไว้ในอุปกรณ์ของคุณเท่านั้น และไม่ถูกส่งออกนอกเครื่อง' : 'In Guest / Local mode, all transactions reside exclusively on your device storage.'}
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'rights' && (
            <div className="privacy-tab-content">
              <h3>{th ? '4. สิทธิ์ของผู้ใช้และการลบบัญชี (GDPR & PDPA Compliance)' : '4. User Rights & Account Deletion'}</h3>
              <p>
                {th 
                  ? 'คุณมีสิทธิ์ตามกฎหมายคุ้มครองข้อมูลส่วนบุคคลอย่างสมบูรณ์:'
                  : 'You have full rights under applicable data protection regulations:'}
              </p>

              <ul>
                <li>
                  <strong>{th ? 'สิทธิ์ในการส่งออกข้อมูล (Data Portability):' : 'Data Portability:'}</strong>{' '}
                  {th ? 'คุณสามารถส่งออกข้อมูลเป็นไฟล์ Excel (.xlsx), CSV หรือ PDF ได้ตลอดเวลา' : 'Export your financial records to Excel (.xlsx), CSV, or PDF at any time.'}
                </li>
                <li>
                  <strong>{th ? 'สิทธิ์ในการลบบัญชีและข้อมูลทั้งหมด (Right to Erasure):' : 'Right to Erasure / Account Deletion:'}</strong>{' '}
                  {th 
                    ? 'คุณสามารถกด "ลบบัญชีและข้อมูลทั้งหมด" ในหน้า ตั้งค่า ➡️ ความปลอดภัย ระบบจะลบข้อมูลธุรกรรม บัญชีผู้ใช้ และประวัติทั้งหมดออกจากระบบอย่างถาวรทันที ไม่สามารถกู้คืนได้'
                    : 'You can delete your entire account and all associated transactions permanently in Settings ➡️ Security.'}
                </li>
                <li>
                  <strong>{th ? 'ช่องทางติดต่อเจ้าหน้าที่คุ้มครองข้อมูล:' : 'Contact Information:'}</strong>{' '}
                  Email: <code>Rnaibro@gmail.com</code> · Line: <code>jawnai99</code>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="privacy-modal-footer">
          <button 
            type="button" 
            className="privacy-external-btn"
            onClick={() => window.open('https://moneyma-app.netlify.app/privacy-policy.html', '_system')}
          >
            🌐 {th ? 'เปิดดูฉบับเต็มบนเว็บ' : 'View Full Policy Online'}
          </button>
          <button type="button" className="privacy-done-btn" onClick={onClose}>
            {th ? 'เข้าใจแล้ว / ปิด' : 'Got it / Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyModal;
