import { Purchases } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';
import { ensureConfigured } from './rcClient';

// คีย์ RevenueCat + การตรวจ placeholder ย้ายไปอยู่ที่ src/services/rcClient.js
// ซึ่งเป็นจุดเดียวที่ configure SDK ได้ (ดูคอมเมนต์ในเมธอด init ด้านล่าง)
const ENTITLEMENT_ID = "Premium"; // Entitlement ID configured in RevenueCat

class PaymentService {
  isInitialized = false;
  isMocked = false;
  /** why billing is unavailable — surfaced to the UI instead of a cryptic error */
  unavailableReason = null;

  /**
   * 🔴 ห้าม configure RevenueCat ที่นี่อีก
   * เดิมเมธอดนี้เรียก Purchases.configure() เองอีกที่หนึ่ง ทั้งที่
   * SubscriptionContext ก็ configure ไปแล้วตอนแอปเปิด ธง isInitialized กับ
   * ธงในฝั่ง SubscriptionService ไม่รู้จักกัน SDK จึงถูก configure ซ้ำ
   * ผลคือ StoreKit listener ถูกรีเซ็ต การซื้อที่กำลังวิ่งอยู่ค้างไม่ resolve
   * (สาเหตุที่ App Store reject ตามข้อ 2.1a) ตอนนี้เดินผ่าน rcClient ที่เดียว
   */
  async init(userId = null) {
    const state = await ensureConfigured(userId);
    this.isInitialized = true;
    this.isMocked = !state.ok && state.reason !== 'web';
    this.unavailableReason = state.ok ? null : state.reason;
    return state;
  }

  async getOfferings() {
    try {
      // เดิมคืน null เงียบ ๆ ถ้ายังไม่ init ทำให้ผู้ที่เรียกโยน "ไม่มีแพ็กเกจ"
      // ทั้งที่จริงแค่ยังไม่ได้ configure — init ให้เองเลย (idempotent อยู่แล้ว)
      if (!this.isInitialized) await this.init();
      if (this.isMocked || Capacitor.getPlatform() === 'web') {
        // Web packages are hardcoded in PremiumSettings to use Stripe Price IDs
        return { availablePackages: [] };
      }

      let offering = null;
      try {
        const offerings = await Promise.race([
          Purchases.getOfferings(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Offerings timeout')), 12000)),
        ]);
        offering = offerings?.current;
        console.log('[Billing] offerings จาก RevenueCat · current =',
          offerings?.current?.identifier || '(ไม่มี)',
          '· ทั้งหมด =', Object.keys(offerings?.all || {}).join(', ') || '(ว่าง)');
        if (!offering?.availablePackages?.length && offerings?.all) {
          offering = Object.values(offerings.all).find(o => o?.availablePackages?.length) || offering;
        }
      } catch (err) {
        console.warn('Purchases.getOfferings() warning:', err);
      }

      // Fallback for StoreKit in Xcode Simulator: Query products directly from StoreKit
      if (!offering?.availablePackages?.length) {
        try {
          const productIds = ['pro_monthly', 'pro_yearly', 'business_monthly', 'business_yearly'];
          // เพดานเวลา: ถ้า StoreKit ไม่ตอบ ต้องคืน "ไม่มีแพ็กเกจ" ไม่ใช่ค้าง
          const { products } = await Promise.race([
            Purchases.getProducts({ productIdentifiers: productIds }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('getProducts timeout')), 12000)),
          ]);
          console.log('[Billing] ถามร้านตรง ๆ ได้', products?.length || 0, 'รายการ:',
            (products || []).map((pr) => `${pr.identifier}=${pr.priceString}`).join(', ') || '(ว่าง)');
          if (products && products.length > 0) {
            const simulatedPackages = products.map((p) => ({
              identifier: p.identifier,
              packageType: p.identifier.includes('yearly') ? 'ANNUAL' : 'MONTHLY',
              product: p,
            }));
            this.unavailableReason = null;
            return { availablePackages: simulatedPackages };
          }
        } catch (e) {
          console.warn('Purchases.getProducts() fallback error:', e);
        }
      }

      if (!offering?.availablePackages?.length) {
        this.unavailableReason = 'no_offerings';
      } else {
        this.unavailableReason = null;
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

      try {
        if (packageToBuy?.product && !packageToBuy.identifier?.startsWith('$rc_')) {
          const { customerInfo } = await Purchases.purchaseStoreProduct({ product: packageToBuy.product });
          return customerInfo;
        }
        const { customerInfo } = await Purchases.purchasePackage({ aPackage: packageToBuy });
        return customerInfo;
      } catch (pkgError) {
        if (packageToBuy?.product) {
          const { customerInfo } = await Purchases.purchaseStoreProduct({ product: packageToBuy.product });
          return customerInfo;
        }
        throw pkgError;
      }
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
