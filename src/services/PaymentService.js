import { Purchases } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';

// Read RevenueCat keys from environment variables or use fallback
const API_KEY_ANDROID = process.env.REACT_APP_REVENUECAT_API_KEY_ANDROID || ""; // goog_… from RevenueCat → Project settings → API keys
const API_KEY_IOS = process.env.REACT_APP_REVENUECAT_API_KEY_IOS || "";        // appl_…
const ENTITLEMENT_ID = "Premium"; // Entitlement ID configured in RevenueCat

/**
 * A RevenueCat SDK key looks like `goog_<22+ random chars>` / `appl_<…>`.
 * The old check only compared against the literal string 'goog_xxxxxx', so a
 * placeholder like 'goog_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' passed straight
 * through and the SDK was configured with a bogus key — which fails silently
 * and surfaces later as the useless "No subscription offerings available".
 */
function isValidRevenueCatKey(key, expectedPrefix) {
  if (typeof key !== 'string') return false;

  const value = key.trim();
  if (!value.startsWith(`${expectedPrefix}_`)) return false;

  const body = value.slice(expectedPrefix.length + 1);
  if (body.length < 15) return false;

  // reject obvious placeholders: xxxxx…, 00000…, or a single repeated char
  if (/^x+$/i.test(body)) return false;
  if (/^(.)\1+$/.test(body)) return false;
  if (/xxxx/i.test(body)) return false;

  return true;
}

class PaymentService {
  isInitialized = false;
  isMocked = false;
  /** why billing is unavailable — surfaced to the UI instead of a cryptic error */
  unavailableReason = null;

  async init(userId = null) {
    if (this.isInitialized) return;

    const platform = Capacitor.getPlatform();

    try {
      if (platform === 'android' || platform === 'ios') {
        const key = platform === 'android' ? API_KEY_ANDROID : API_KEY_IOS;
        const prefix = platform === 'android' ? 'goog' : 'appl';

        if (!isValidRevenueCatKey(key, prefix)) {
          console.warn(
            `[Billing] RevenueCat ${platform} key missing or placeholder. ` +
            `Set REACT_APP_REVENUECAT_API_KEY_${platform.toUpperCase()} in .env.local ` +
            `(RevenueCat → Project settings → API keys), then rebuild. Running in mock mode.`
          );
          this.isMocked = true;
          this.unavailableReason = 'not_configured';
          this.isInitialized = true;
          return;
        }

        await Purchases.configure({ apiKey: key, appUserID: userId });
      } else {
        // Web is handled via Stripe, so we don't need RevenueCat
        this.isInitialized = true;
        return;
      }

      this.isInitialized = true;
      console.log('RevenueCat initialized successfully');
    } catch (error) {
      console.error('Error initializing RevenueCat:', error);
      this.isMocked = true;
      this.unavailableReason = 'init_failed';
      this.isInitialized = true;
    }
  }

  async getOfferings() {
    try {
      if (!this.isInitialized) return null;
      if (this.isMocked || Capacitor.getPlatform() === 'web') {
        // Web packages are hardcoded in PremiumSettings to use Stripe Price IDs
        return { availablePackages: [] };
      }

      const offerings = await Purchases.getOfferings();

      // `current` is null when no offering is marked "current" in RevenueCat —
      // fall back to the first configured one so a half-set-up dashboard still works.
      let offering = offerings?.current;
      if (!offering?.availablePackages?.length && offerings?.all) {
        offering = Object.values(offerings.all).find(o => o?.availablePackages?.length) || offering;
      }

      if (!offering?.availablePackages?.length) {
        this.unavailableReason = 'no_offerings';
        console.warn(
          '[Billing] RevenueCat returned no packages. Usual causes: ' +
          '(1) products not created in Play Console, ' +
          '(2) products not attached to an Offering in RevenueCat, ' +
          '(3) app not published to any track yet, ' +
          '(4) running on an emulator without Google Play Store, ' +
          '(5) Play Service Account not linked in RevenueCat.'
        );
      }

      return offering || null;
    } catch (error) {
      console.error('Error fetching offerings:', error);
      this.unavailableReason = 'store_error';
      return null;
    }
  }

  /** Human-readable reason billing can't run right now (null = fine). */
  getUnavailableReason() {
    return this.unavailableReason;
  }

  async purchasePackage(packageToBuy) {
    try {
      if (!this.isInitialized) return null;
      if (this.isMocked || Capacitor.getPlatform() === 'web') {
        console.log('Mock purchase successful:', packageToBuy);
        alert('Mock Purchase Successful! (Web/Sim only)');
        return { entitlements: { active: { [ENTITLEMENT_ID]: true } } };
      }

      const { customerInfo } = await Purchases.purchasePackage({ aPackage: packageToBuy });
      console.log('Purchase successful:', customerInfo);
      return customerInfo;
    } catch (error) {
      console.error('Error making purchase:', error);
      throw error;
    }
  }

  async restorePurchases() {
    try {
      if (!this.isInitialized) return null;
      if (this.isMocked || Capacitor.getPlatform() === 'web') {
        console.log('Mock restore successful');
        return { entitlements: { active: {} } };
      }

      const customerInfo = await Purchases.restorePurchases();
      console.log('Restore successful:', customerInfo);
      return customerInfo;
    } catch (error) {
      console.error('Error restoring purchases:', error);
      throw error;
    }
  }

  async checkPremiumStatus() {
    try {
      if (!this.isInitialized) return false;
      if (this.isMocked || Capacitor.getPlatform() === 'web') {
        // Mock premium status based on local storage or just return false for testing
        return localStorage.getItem('mock_premium') === 'true';
      }

      const customerInfo = await Purchases.getCustomerInfo();
      // Check if the user has the active entitlement
      return typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
    } catch (error) {
      console.error('Error checking premium status:', error);
      return false;
    }
  }

  async logIn(userId) {
    if (!this.isInitialized || this.isMocked || Capacitor.getPlatform() === 'web') return;
    try {
        await Purchases.logIn({ appUserID: userId });
    } catch (e) {
        console.error('RevenueCat Login error:', e);
    }
  }

  async logOut() {
    if (!this.isInitialized || this.isMocked || Capacitor.getPlatform() === 'web') return;
    try {
        await Purchases.logOut();
    } catch (e) {
        console.error('RevenueCat Logout error:', e);
    }
  }
}

const paymentService = new PaymentService();

export default paymentService;
