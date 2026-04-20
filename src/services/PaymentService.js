import { Purchases } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';

// TODO: Replace these keys with your actual RevenueCat public API keys.
const API_KEY_ANDROID = "goog_xxxxxx"; // Google Play API key from RevenueCat
const API_KEY_IOS = "appl_xxxxxx"; // App Store API key from RevenueCat
const ENTITLEMENT_ID = "Premium"; // Your Entitlement ID setup in RevenueCat

class PaymentService {
  isInitialized = false;
  isMocked = false;

  async init(userId = null) {
    if (this.isInitialized) return;

    try {
      if (Capacitor.getPlatform() === 'android') {
        if (API_KEY_ANDROID === 'goog_xxxxxx') {
          console.warn('RevenueCat API Key not set for Android. Mocking premium.');
          this.isMocked = true;
          this.isInitialized = true;
          return;
        }
        await Purchases.configure({ apiKey: API_KEY_ANDROID, appUserID: userId });
      } else if (Capacitor.getPlatform() === 'ios') {
        if (API_KEY_IOS === 'appl_xxxxxx') {
          console.warn('RevenueCat API Key not set for iOS. Mocking premium.');
          this.isMocked = true;
          this.isInitialized = true;
          return;
        }
        await Purchases.configure({ apiKey: API_KEY_IOS, appUserID: userId });
      } else {
        console.warn('RevenueCat is only supported on native mobile platforms (iOS/Android). Mocking premium for web.');
        // This is useful for testing in the browser
        this.isMocked = true;
        this.isInitialized = true;
        return;
      }
      this.isInitialized = true;
      console.log('RevenueCat initialized successfully');
    } catch (error) {
      console.error('Error initializing RevenueCat:', error);
    }
  }

  async getOfferings() {
    try {
      if (!this.isInitialized) return null;
      if (this.isMocked || Capacitor.getPlatform() === 'web') {
        // Mock data for web development
        return {
          availablePackages: [
            { identifier: 'monthly', product: { title: 'Subscription Monthly', priceString: '$4.99', description: 'Cloud backup and ongoing support billed every month.' } },
            { identifier: 'yearly', product: { title: 'Subscription Yearly', priceString: '$39.99', description: 'Cloud backup and ongoing support billed yearly. Save 33%.' } }
          ]
        };
      }

      const offerings = await Purchases.getOfferings();
      // Returns current offering configured in RevenueCat
      return offerings.current; 
    } catch (error) {
      console.error('Error fetching offerings:', error);
      return null;
    }
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
