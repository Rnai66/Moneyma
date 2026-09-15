jest.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: {
    configure: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    restorePurchases: jest.fn(),
  },
}));

jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
}));

jest.mock('../../services/SupabaseService', () => ({
  getClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: jest.fn().mockResolvedValue({ data: null, error: null }) }) }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

import { withTimeout, findPackage, packageMatchesPlan } from '../SubscriptionService';

describe('SubscriptionService Safety & Logic Tests', () => {
  describe('withTimeout', () => {
    it('should resolve normally when promise completes before timeout', async () => {
      const fastPromise = new Promise((resolve) => setTimeout(() => resolve('success'), 50));
      const result = await withTimeout(fastPromise, 500, 'Timed out');
      expect(result).toBe('success');
    });

    it('should reject with timeout error when promise hangs longer than timeout', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve('too slow'), 500));
      await expect(withTimeout(slowPromise, 50, 'StoreKit timeout')).rejects.toThrow('StoreKit timeout');
    });

    it('should attach isTimeout flag on timeout rejection', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve('slow'), 500));
      try {
        await withTimeout(slowPromise, 50, 'Timed out');
      } catch (err) {
        expect(err.isTimeout).toBe(true);
        expect(err.code).toBe('TIMEOUT');
      }
    });
  });

  describe('findPackage', () => {
    const mockPackages = [
      {
        identifier: '$rc_monthly',
        packageType: 'MONTHLY',
        product: { identifier: 'pro_monthly', priceString: '฿99.00' }
      },
      {
        identifier: '$rc_annual',
        packageType: 'ANNUAL',
        product: { identifier: 'pro_yearly', priceString: '฿990.00' }
      },
      {
        identifier: 'business_monthly',
        packageType: 'MONTHLY',
        product: { identifier: 'business_monthly', priceString: '฿499.00' }
      },
      {
        identifier: 'business_yearly',
        packageType: 'ANNUAL',
        product: { identifier: 'business_yearly', priceString: '฿4,990.00' }
      }
    ];

    it('should find pro monthly package correctly', () => {
      const pkg = findPackage(mockPackages, 'pro', 'monthly');
      expect(pkg).toBeTruthy();
      expect(pkg.product.identifier).toBe('pro_monthly');
    });

    it('should find pro yearly package correctly', () => {
      const pkg = findPackage(mockPackages, 'pro', 'yearly');
      expect(pkg).toBeTruthy();
      expect(pkg.product.identifier).toBe('pro_yearly');
    });

    it('should find business monthly package correctly', () => {
      const pkg = findPackage(mockPackages, 'business', 'monthly');
      expect(pkg).toBeTruthy();
      expect(pkg.product.identifier).toBe('business_monthly');
    });

    it('should find business yearly package correctly', () => {
      const pkg = findPackage(mockPackages, 'business', 'yearly');
      expect(pkg).toBeTruthy();
      expect(pkg.product.identifier).toBe('business_yearly');
    });

    it('should return null when empty package list is passed', () => {
      const pkg = findPackage([], 'pro', 'monthly');
      expect(pkg).toBeNull();
    });
  });

  describe('packageMatchesPlan', () => {
    it('should correctly match pro package', () => {
      const pkg = { identifier: '$rc_monthly', product: { identifier: 'pro_monthly' } };
      expect(packageMatchesPlan(pkg, 'pro')).toBe(true);
      expect(packageMatchesPlan(pkg, 'business')).toBe(false);
    });

    it('should correctly match business package', () => {
      const pkg = { identifier: 'business_monthly', product: { identifier: 'business_monthly' } };
      expect(packageMatchesPlan(pkg, 'business')).toBe(true);
      expect(packageMatchesPlan(pkg, 'pro')).toBe(false);
    });
  });
});
