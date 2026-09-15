import React from 'react';
import { useLanguage } from '../services/LanguageContext';
import AIConsentService from '../services/AIConsentService';
import './AIConsentModal.css';

/**
 * AIConsentModal
 *
 * Explicit consent modal satisfying Apple Review Guidelines 5.1.1(i) and 5.1.2(i).
 * Discloses:
 * 1. What data is sent (Image of receipt, bank slip, or product)
 * 2. Who it is sent to (Google LLC / Google Gemini AI)
 * 3. Purpose (OCR and financial text extraction)
 * 4. Data protection & retention standards (Ephemeral processing, no training, encrypted)
 */
export default function AIConsentModal({ isOpen, onAccept, onDecline }) {
  const { language } = useLanguage();

  if (!isOpen) return null;

  const isTh = language === 'th';

  const handleAccept = () => {
    AIConsentService.grantConsent();
    onAccept?.();
  };

  const handleDecline = () => {
    onDecline?.();
  };

  const openPrivacyPolicy = (e) => {
    e.preventDefault();
    window.open('/privacy-policy.html#th-5', '_blank');
  };

  return (
    <div className="ai-consent-backdrop" role="dialog" aria-modal="true">
      <div className="ai-consent-sheet">
        <div className="ai-consent-header">
          <div className="ai-consent-icon-wrap">🤖</div>
          <div>
            <h3 className="ai-consent-title">
              {isTh ? 'คำยินยอมการประมวลผลข้อมูลด้วย AI' : 'AI Data Sharing & Processing Notice'}
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#8ef0c8', fontWeight: 700, textTransform: 'uppercase' }}>
              {isTh ? 'นโยบายความเป็นส่วนตัว' : 'Privacy Notice'}
            </span>
          </div>
        </div>

        <div className="ai-consent-body">
          <p style={{ margin: '0 0 10px' }}>
            {isTh
              ? 'ฟีเจอร์นี้ใช้ปัญญาประดิษฐ์เพื่อแปลงรูปภาพเอกสารทางการเงินเป็นข้อมูลธุรกรรมโดยอัตโนมัติ เพื่อความโปร่งใส โปรดอ่านรายละเอียดต่อไปนี้ก่อนใช้งาน:'
              : 'This feature uses artificial intelligence to automatically parse financial documents and receipts into transactions. In accordance with privacy standards, please review how your data is handled:'}
          </p>

          <div className="ai-consent-disclosure-box">
            <div className="ai-consent-row">
              <span className="ai-consent-row-icon">📤</span>
              <div className="ai-consent-row-content">
                <strong>{isTh ? 'ข้อมูลที่ส่ง (What data is sent):' : 'Data Sent:'}</strong>
                <span>
                  {isTh
                    ? 'รูปภาพบิล สลิปโอนเงิน หรือสินค้าที่คุณเลือก (รวมถึงชื่อร้านค้า วันที่ และยอดเงิน)'
                    : 'The image of the bill, receipt, bank slip, or product you select (including merchant, date, and amounts).'}
                </span>
              </div>
            </div>

            <div className="ai-consent-row">
              <span className="ai-consent-row-icon">🏢</span>
              <div className="ai-consent-row-content">
                <strong>{isTh ? 'ผู้ให้บริการภายนอก (Third-Party Service):' : 'Third-Party AI Provider:'}</strong>
                <span>
                  {isTh
                    ? 'Google Gemini AI (Google LLC) ผ่านช่องทางเข้ารหัส HTTPS/TLS ที่ปลอดภัย'
                    : 'Google Gemini AI (Google LLC) via encrypted HTTPS/TLS API transmission.'}
                </span>
              </div>
            </div>

            <div className="ai-consent-row">
              <span className="ai-consent-row-icon">🎯</span>
              <div className="ai-consent-row-content">
                <strong>{isTh ? 'วัตถุประสงค์ (Purpose):' : 'Purpose:'}</strong>
                <span>
                  {isTh
                    ? 'เพื่ออ่านข้อความ (OCR) และสกัดข้อมูลลงในแบบฟอร์มให้คุณตรวจสอบก่อนบันทึกเท่านั้น'
                    : 'Exclusively for text extraction (OCR) and auto-filling the transaction form for your review.'}
                </span>
              </div>
            </div>

            <div className="ai-consent-row">
              <span className="ai-consent-row-icon">🔒</span>
              <div className="ai-consent-row-content">
                <strong>{isTh ? 'ความปลอดภัยและการเก็บรักษา (Protection):' : 'Data Protection:'}</strong>
                <span>
                  {isTh
                    ? 'รูปภาพจะถูกประมวลผลชั่วคราว ไม่ถูกนำไปเทรนโมเดล AI และไม่มีการเก็บรูปภาพถาวรบนเซิร์ฟเวอร์'
                    : 'Images are processed ephemerally, never used to train public AI models, and not stored permanently.'}
                </span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: '0.82rem', margin: '8px 0 0' }}>
            {isTh ? 'ศึกษารายละเอียดเพิ่มเติมได้ที่ ' : 'For full details, please review our '}
            <button type="button" className="ai-consent-privacy-link" onClick={openPrivacyPolicy}>
              {isTh ? 'นโยบายความเป็นส่วนตัว (Privacy Policy)' : 'Privacy Policy'}
            </button>
          </p>
        </div>

        <div className="ai-consent-actions">
          <button type="button" className="ai-consent-btn-decline" onClick={handleDecline}>
            {isTh ? 'ไม่อนุญาต / ยกเลิก' : 'Decline'}
          </button>
          <button type="button" className="ai-consent-btn-accept" onClick={handleAccept}>
            {isTh ? 'ยินยอมและดำเนินการต่อ' : 'Agree & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
