/**
 * AIConsentService.js
 *
 * Manages user consent for sharing data (receipt/slip/product images)
 * with third-party AI services (Google Gemini AI) as required by
 * Apple App Store Review Guidelines 5.1.1(i) and 5.1.2(i).
 */

const AI_CONSENT_KEY = 'moneyma_ai_data_sharing_consent';
const AI_CONSENT_VERSION = '1.0';

export const AIConsentService = {
  /**
   * Check if user has explicitly granted consent for AI processing
   * @returns {boolean}
   */
  hasConsent() {
    try {
      const stored = localStorage.getItem(AI_CONSENT_KEY);
      if (!stored) return false;
      const data = JSON.parse(stored);
      return data.accepted === true && data.version === AI_CONSENT_VERSION;
    } catch {
      return false;
    }
  },

  /**
   * Grant consent
   */
  grantConsent() {
    try {
      const data = {
        accepted: true,
        version: AI_CONSENT_VERSION,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(AI_CONSENT_KEY, JSON.stringify(data));
      window.dispatchEvent(new CustomEvent('ai_consent_changed', { detail: { accepted: true } }));
    } catch (e) {
      console.warn('Failed to save AI consent:', e);
    }
  },

  /**
   * Revoke consent (can be done from Settings)
   */
  revokeConsent() {
    try {
      localStorage.removeItem(AI_CONSENT_KEY);
      window.dispatchEvent(new CustomEvent('ai_consent_changed', { detail: { accepted: false } }));
    } catch (e) {
      console.warn('Failed to revoke AI consent:', e);
    }
  },
};

export default AIConsentService;
